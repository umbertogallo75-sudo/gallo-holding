import SwiftUI
import WebKit
import StoreKit
import UserNotifications

/// What shows behind the page: while it loads, and in the rubber-band area at
/// the edges of a scroll. A fixed near-black made every launch and every
/// overscroll look dark regardless of the theme, so it follows the system
/// instead — the same two colours the stylesheet uses for --bg.
let webBackdrop = UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.063, green: 0.071, blue: 0.063, alpha: 1)   // #101210
        : UIColor(red: 0.965, green: 0.965, blue: 0.949, alpha: 1)   // #f6f6f2
}

struct ContentView: View {
    var body: some View {
        WebView(url: URL(string: "https://www.execlingo.it")!)
            .ignoresSafeArea()
            .background(Color(webBackdrop))
    }
}

/// Single hand-off point between UIKit push callbacks and the web view:
/// the APNs token flows web-ward, notification taps deep-link the page.
final class PushBridge {
    static let shared = PushBridge()
    weak var webView: WKWebView?
    private var pendingPath: String?

    private func evaluate(_ js: String) {
        DispatchQueue.main.async { self.webView?.evaluateJavaScript(js, completionHandler: nil) }
    }

    func deliverToken(_ token: String) {
        evaluate("window.__apnsToken && window.__apnsToken(\"\(token)\")")
    }

    func deliverFailure(_ reason: String) {
        evaluate("window.__apnsDenied && window.__apnsDenied(\"\(reason)\")")
    }

    func open(_ path: String) {
        let target = path.hasPrefix("http") ? path : "https://www.execlingo.it\(path.hasPrefix("/") ? path : "/\(path)")"
        guard let url = URL(string: target) else { return }
        DispatchQueue.main.async {
            if let webView = self.webView { webView.load(URLRequest(url: url)) }
            else { self.pendingPath = target }
        }
    }

    func consumePendingURL() -> URL? {
        defer { pendingPath = nil }
        return pendingPath.flatMap(URL.init(string:))
    }
}

private struct IAPProductInfo: Encodable {
    let id: String
    let name: String
    let price: String
}

struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = "ExecLingoApp/1.3"
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.userContentController.add(context.coordinator, name: "iap")
        config.userContentController.add(context.coordinator, name: "push")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = webBackdrop
        webView.scrollView.backgroundColor = webBackdrop
        context.coordinator.webView = webView
        PushBridge.shared.webView = webView
        webView.load(URLRequest(url: PushBridge.shared.consumePendingURL() ?? url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?

        // ---- In-app purchases (StoreKit 2) ----

        private func isExecLingoURL(_ url: URL?) -> Bool {
            guard let url, url.scheme == "https", let host = url.host?.lowercased() else { return false }
            return host == "execlingo.it" || host.hasSuffix(".execlingo.it")
        }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            // The handler exists for the lifetime of the WebView, including
            // during external payment/login navigations. Only the production
            // ExecLingo top frame may ever reach native purchases or push.
            guard message.frameInfo.isMainFrame,
                  isExecLingoURL(message.frameInfo.request.url) else { return }
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }
            if message.name == "push" {
                if action == "request" { requestPushPermission() }
                return
            }
            guard message.name == "iap" else { return }
            if action == "purchase", let productId = body["product"] as? String {
                Task { await purchase(productId) }
            } else if action == "products", let productIds = body["products"] as? [String] {
                Task { await sendProducts(productIds) }
            } else if action == "restore" {
                Task { await restore() }
            }
        }

        // ---- Native push (APNs) ----

        private func requestPushPermission() {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                DispatchQueue.main.async {
                    if granted { UIApplication.shared.registerForRemoteNotifications() }
                    else { PushBridge.shared.deliverFailure("denied") }
                }
            }
        }

        @MainActor private func callback(_ js: String) {
            webView?.evaluateJavaScript(js, completionHandler: nil)
        }

        private func sendPurchased(_ jws: String) async {
            let escaped = jws
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            await callback("window.__iapPurchased && window.__iapPurchased(\"\(escaped)\")")
        }

        private func sendFailed(_ reason: String) async {
            await callback("window.__iapFailed && window.__iapFailed(\"\(reason)\")")
        }

        private func sendProducts(_ productIds: [String]) async {
            do {
                let products = try await Product.products(for: productIds)
                let byId = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
                let payload = productIds.compactMap { id -> IAPProductInfo? in
                    guard let product = byId[id] else { return nil }
                    return IAPProductInfo(id: product.id, name: product.displayName, price: product.displayPrice)
                }
                let data = try JSONEncoder().encode(payload)
                guard let json = String(data: data, encoding: .utf8) else { return }
                let escaped = json
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "\"", with: "\\\"")
                    .replacingOccurrences(of: "\n", with: "\\n")
                await callback("window.__iapProducts && window.__iapProducts(\"\(escaped)\")")
            } catch {
                // The web layer keeps its checked Italian fallback prices.
            }
        }

        private func purchase(_ productId: String) async {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    await sendFailed("not-found"); return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await sendPurchased(verification.jwsRepresentation)
                        await transaction.finish()
                    case .unverified:
                        await sendFailed("unverified")
                    }
                case .userCancelled:
                    await sendFailed("cancelled")
                case .pending:
                    await sendFailed("pending")
                @unknown default:
                    await sendFailed("unknown")
                }
            } catch {
                await sendFailed("error")
            }
        }

        private func restore() async {
            try? await AppStore.sync()
            var best: (jws: String, priority: Int, date: Date)?
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result {
                    let priority: Int
                    switch transaction.productID {
                    case "it.execlingo.app.annual": priority = 4
                    case "it.execlingo.app.maintenance": priority = 3
                    case "it.execlingo.app.monthly": priority = 2
                    case "it.execlingo.app.program": priority = 1
                    default: continue
                    }
                    let date = transaction.expirationDate ?? transaction.purchaseDate
                    if best == nil || priority > best!.priority || (priority == best!.priority && date > best!.date) {
                        best = (result.jwsRepresentation, priority, date)
                    }
                }
            }
            if let best {
                await sendPurchased(best.jws)
                return
            }
            await sendFailed("none")
        }

        // ---- Navigation ----

        private func isInternal(_ host: String?) -> Bool {
            guard let host = host?.lowercased() else { return false }
            return host == "execlingo.it" || host.hasSuffix(".execlingo.it")
                || host == "stripe.com" || host.hasSuffix(".stripe.com")
                || host == "accounts.google.com" || host.hasSuffix(".accounts.google.com")
                || host == "appleid.apple.com" || host.hasSuffix(".appleid.apple.com")
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url, let scheme = url.scheme else {
                decisionHandler(.allow); return
            }
            if scheme != "http" && scheme != "https" {
                UIApplication.shared.open(url); decisionHandler(.cancel); return
            }
            if isInternal(url.host) { decisionHandler(.allow) }
            else { UIApplication.shared.open(url); decisionHandler(.cancel) }
        }

        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                if isInternal(url.host) { webView.load(URLRequest(url: url)) }
                else { UIApplication.shared.open(url) }
            }
            return nil
        }

        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            let host = origin.host.lowercased()
            let trustedOrigin = origin.protocol == "https"
                && host == "www.execlingo.it"
                && (origin.port == 0 || origin.port == 443)
            let frameURL = frame.request.url
            let trustedFrame = frame.isMainFrame
                && frameURL?.scheme == "https"
                && frameURL?.host?.lowercased() == "www.execlingo.it"
                && (frameURL?.port == nil || frameURL?.port == 443)
            decisionHandler(trustedOrigin && trustedFrame && type == .microphone ? .grant : .deny)
        }
    }
}
