package it.execlingo.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.firebase.messaging.FirebaseMessaging

/**
 * ExecLingo for Android: the site inside an embedded WebView, so the app
 * behaves the same on every device regardless of which browser is installed
 * or set as default. Two native bridges are exposed to the page:
 *   window.ExecLingoNative.requestPush()  → permission + FCM token
 *   window.ExecLingoNative.purchase(id)   → Play Billing sheet
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var billing: BillingBridge

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) fetchAndDeliverToken() else callback("window.__fcmDenied && window.__fcmDenied('denied')")
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTheme(R.style.Theme_ExecLingo)

        web = WebView(this)
        setContentView(web)

        // Keep content clear of the status and navigation bars.
        ViewCompat.setOnApplyWindowInsetsListener(web) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString ExecLingoAndroid/1.0"
        }
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.appBackground))

        billing = BillingBridge(this) { js -> callback(js) }
        web.addJavascriptInterface(NativeBridge(), "ExecLingoNative")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                return if (isInternal(url)) {
                    false                                  // stay in the app
                } else {
                    startActivity(Intent(Intent.ACTION_VIEW, url))   // hand off to the system
                    true
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // The voice coach needs the microphone; grant it once Android has.
                val mic = request.resources.filter { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                if (mic.isNotEmpty() &&
                    ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) ==
                    PackageManager.PERMISSION_GRANTED
                ) request.grant(mic.toTypedArray()) else request.deny()
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        web.loadUrl(startUrl(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        web.loadUrl(startUrl(intent))
    }

    /** Notification taps carry the deep link; everything else opens the home. */
    private fun startUrl(intent: Intent?): String {
        val path = intent?.getStringExtra("url")
        val target = when {
            path.isNullOrBlank() -> "/home"
            path.startsWith("http") -> return path
            path.startsWith("/") -> path
            else -> "/$path"
        }
        return "$SITE$target"
    }

    private fun isInternal(url: Uri): Boolean {
        val host = url.host ?: return false
        if (url.scheme != "http" && url.scheme != "https") return false
        return host == "execlingo.it" || host.endsWith(".execlingo.it") ||
            host.endsWith("stripe.com") || host.endsWith("accounts.google.com")
    }

    private fun callback(js: String) = runOnUiThread { web.evaluateJavascript(js, null) }

    private fun fetchAndDeliverToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result?.replace("\"", "") ?: return@addOnCompleteListener
                callback("window.__fcmToken && window.__fcmToken(\"$token\")")
            } else {
                callback("window.__fcmDenied && window.__fcmDenied('token-error')")
            }
        }
    }

    /** What the page can call. Every method hops to the UI thread itself. */
    inner class NativeBridge {
        @android.webkit.JavascriptInterface
        fun requestPush() = runOnUiThread {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                fetchAndDeliverToken()
            }
        }

        @android.webkit.JavascriptInterface
        fun requestMic() = runOnUiThread {
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                micPermission.launch(Manifest.permission.RECORD_AUDIO)
            }
        }

        @android.webkit.JavascriptInterface
        fun purchase(productId: String) = billing.purchase(productId)

        @android.webkit.JavascriptInterface
        fun restore() = billing.restore()
    }

    private val micPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    companion object {
        const val SITE = "https://www.execlingo.it"
    }
}
