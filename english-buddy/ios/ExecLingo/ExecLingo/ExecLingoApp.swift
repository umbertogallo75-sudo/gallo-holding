import SwiftUI
import UserNotifications

@main
struct ExecLingoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            // No preferredColorScheme here on purpose. Forcing the scene to
            // .dark also forced the web view's trait collection, so the page
            // inside read prefers-color-scheme: dark on every iPhone — even
            // one set to light — and nothing on the web side could argue with
            // it. The page follows the system, or the choice made in Profilo.
            ContentView()
                .ignoresSafeArea()
        }
    }
}

/// Receives APNs registration callbacks and notification taps, forwarding
/// both to the web layer through PushBridge.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        PushBridge.shared.deliverToken(token)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PushBridge.shared.deliverFailure("error")
    }

    /// Sam's notifications also show while the app is open.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    /// Tapping a notification deep-links into the conversation.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let path = response.notification.request.content.userInfo["url"] as? String {
            PushBridge.shared.open(path)
        }
        completionHandler()
    }
}
