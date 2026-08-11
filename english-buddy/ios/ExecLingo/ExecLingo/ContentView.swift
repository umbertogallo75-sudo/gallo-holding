import SwiftUI
import WebKit
import StoreKit

struct ContentView: View {
    var body: some View {
        WebView(url: URL(string: "https://www.execlingo.it")!)
            .ignoresSafeArea()
            .background(Color(red: 0.04, green: 0.06, blue: 0.05))
    }
}

struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = "ExecLingoApp/1.0"
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.userContentController.add(context.coordinator, name: "iap")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.04, green: 0.06, blue: 0.05, alpha: 1)
        context.coordinator.webView = webView
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?

        // ---- In-app purchases (StoreKit 2) ----

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "iap",
                  let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }
            if action == "purchase", let productId = body["product"] as? String {
                Task { await purchase(productId) }
            } else if action == "restore" {
                Task { await restore() }
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
            for await result in Transaction.currentEntitlements {
                if case .verified = result {
                    await sendPurchased(result.jwsRepresentation)
                    return
                }
            }
            await sendFailed("none")
        }

        // ---- Navigation ----

        private func isInternal(_ host: String?) -> Bool {
            guard let host else { return false }
            return host == "execlingo.it" || host.hasSuffix(".execlingo.it")
                || host.hasSuffix("stripe.com") || host.hasSuffix("checkout.stripe.com")
                || host.hasSuffix("accounts.google.com") || host.hasSuffix("appleid.apple.com")
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
            decisionHandler(.grant)
        }
    }
}
