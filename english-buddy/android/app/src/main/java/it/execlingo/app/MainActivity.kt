package it.execlingo.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import it.execlingo.app.billing.BillingController
import it.execlingo.app.databinding.ActivityMainBinding
import it.execlingo.app.push.ExecLingoMessagingService
import it.execlingo.app.security.ObfuscatedAccountIdProvider
import it.execlingo.app.security.TrustedOrigin
import it.execlingo.app.web.BridgeCommand
import it.execlingo.app.web.BridgeCommandParser
import it.execlingo.app.web.BridgeScript
import org.json.JSONObject

class MainActivity : AppCompatActivity(), BillingController.Callbacks {
    private lateinit var binding: ActivityMainBinding
    private lateinit var billing: BillingController
    private var pendingWebMicRequest: PermissionRequest? = null
    private var micRequestedByBridge = false
    private var installReferrerPayload: String? = null
    private var purchasesReconciledForPage = false

    private val microphonePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingWebMicRequest?.let { request ->
            if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request.deny()
        }
        pendingWebMicRequest = null
        if (micRequestedByBridge) {
            if (granted) callJavaScript("__micGranted") else callJavaScript("__micDenied", "denied")
        }
        micRequestedByBridge = false
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) deliverFcmRegistration() else callJavaScript("__fcmDenied", "denied")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        applySystemInsets()

        billing = BillingController(this, ObfuscatedAccountIdProvider(), this)
        configureWebView()
        captureInstallReferrer()
        configureBackNavigation()

        if (savedInstanceState == null || binding.webView.restoreState(savedInstanceState) == null) {
            binding.webView.loadUrl(urlFromIntent(intent))
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        binding.webView.loadUrl(urlFromIntent(intent))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        binding.webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        if (::billing.isInitialized) billing.refreshOwnedPurchases()
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        binding.webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        pendingWebMicRequest?.deny()
        pendingWebMicRequest = null
        billing.close()
        binding.webView.apply {
            stopLoading()
            webChromeClient = null
            webViewClient = WebViewClient()
            destroy()
        }
        super.onDestroy()
    }

    override fun onPurchased(productId: String, purchaseToken: String, dispatched: (Boolean) -> Unit) {
        callJavaScriptChecked("__playPurchased", listOf(productId, purchaseToken), dispatched)
    }

    override fun onPurchaseFailed(reason: String) {
        callJavaScript("__playFailed", reason)
    }

    override fun onProducts(productsJson: String) {
        callJavaScriptWithJson("__playProducts", productsJson)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() = with(binding.webView) {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "${userAgentString} ExecLingoAndroid/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(this@with, false)
        }

        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val destination = request.url.toString()
                if (request.isForMainFrame && TrustedOrigin.isTrusted(destination)) return false
                if (!request.isForMainFrame) return false
                openExternally(request.url)
                return true
            }

            @Suppress("DEPRECATION")
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                handler.cancel()
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                purchasesReconciledForPage = false
                binding.progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String) {
                binding.progress.visibility = View.GONE
                if (!TrustedOrigin.isTrusted(url)) return
                deliverInstallReferrer()
                if (isBillingPage(url) && !purchasesReconciledForPage) {
                    purchasesReconciledForPage = true
                    // React installs __playPurchased after hydration.
                    view.postDelayed({ billing.refreshOwnedPurchases() }, 1_500)
                }
            }
        }
        webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.progress.progress = newProgress
                binding.progress.visibility = if (newProgress in 0..99) View.VISIBLE else View.GONE
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { handleWebPermissionRequest(request) }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingWebMicRequest === request) pendingWebMicRequest = null
            }
        }

        installOriginSafeBridge(this)
    }

    @SuppressLint("RequiresFeature")
    private fun installOriginSafeBridge(webView: WebView) {
        val listenerSupported = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        val scriptSupported = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (!listenerSupported || !scriptSupported) {
            Toast.makeText(this, R.string.webview_update_required, Toast.LENGTH_LONG).show()
            return
        }

        val allowedOrigins = setOf(TrustedOrigin.ORIGIN)
        WebViewCompat.addWebMessageListener(
            webView,
            BridgeScript.CHANNEL,
            allowedOrigins,
        ) { _, message: WebMessageCompat, sourceOrigin: Uri, isMainFrame: Boolean, _ ->
            if (!isMainFrame || !TrustedOrigin.isTrusted(sourceOrigin.toString())) return@addWebMessageListener
            val command = BridgeCommandParser.parse(message.data ?: return@addWebMessageListener)
                ?: return@addWebMessageListener
            runOnUiThread { handleBridgeCommand(command) }
        }
        WebViewCompat.addDocumentStartJavaScript(webView, BridgeScript.source, allowedOrigins)
    }

    private fun handleBridgeCommand(command: BridgeCommand) {
        when (command) {
            is BridgeCommand.Purchase -> billing.purchase(command.productId, command.accountHint)
            is BridgeCommand.Products -> billing.queryProducts(command.productIds)
            is BridgeCommand.PurchaseResult -> billing.completeDelivery(command.purchaseToken, command.success)
            BridgeCommand.Restore -> billing.restore()
            BridgeCommand.RequestPush -> requestPushPermission()
            BridgeCommand.RequestMic -> requestMicrophoneFromBridge()
        }
    }

    private fun requestPushPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            deliverFcmRegistration()
        }
    }

    private fun deliverFcmRegistration() {
        runCatching { FirebaseMessaging.getInstance() }
            .onFailure { callJavaScript("__fcmDenied", "unavailable") }
            .onSuccess { messaging ->
                // The manifest keeps auto-init off until the user explicitly
                // accepts push; after consent, let FCM keep the FID fresh.
                messaging.isAutoInitEnabled = true
                messaging.register().addOnCompleteListener { registration ->
                    if (!registration.isSuccessful) {
                        callJavaScript("__fcmDenied", "registration-error")
                        return@addOnCompleteListener
                    }
                    FirebaseInstallations.getInstance().id.addOnCompleteListener { task ->
                        val installationId = if (task.isSuccessful) {
                            task.result?.takeIf(String::isNotBlank)
                        } else {
                            null
                        }
                        if (installationId == null) {
                            callJavaScript("__fcmDenied", "registration-id-error")
                            return@addOnCompleteListener
                        }
                        getSharedPreferences(ExecLingoMessagingService.PREFERENCES, MODE_PRIVATE)
                            .edit()
                            .putString(ExecLingoMessagingService.LAST_FCM_REGISTRATION, installationId)
                            .apply()
                        // Keep the established website callback name while FCM
                        // 25+ now carries a Firebase Installation ID.
                        callJavaScript("__fcmToken", installationId)
                    }
                }
            }
    }

    private fun requestMicrophoneFromBridge() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            callJavaScript("__micGranted")
            return
        }
        micRequestedByBridge = true
        microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun handleWebPermissionRequest(request: PermissionRequest) {
        val audioOnly = request.resources.isNotEmpty() &&
            request.resources.all { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
        if (!TrustedOrigin.isTrusted(request.origin.toString()) || !audioOnly) {
            request.deny()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            return
        }
        pendingWebMicRequest?.deny()
        pendingWebMicRequest = request
        microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun captureInstallReferrer() {
        val client = InstallReferrerClient.newBuilder(this).build()
        client.startConnection(object : InstallReferrerStateListener {
            override fun onInstallReferrerSetupFinished(responseCode: Int) {
                if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                    runCatching {
                        val details = client.installReferrer
                        JSONObject()
                            .put("referrer", details.installReferrer.take(2_048))
                            .put("referrerClickTimestampSeconds", details.referrerClickTimestampSeconds)
                            .put("installBeginTimestampSeconds", details.installBeginTimestampSeconds)
                            .toString()
                    }.onSuccess { payload ->
                        installReferrerPayload = payload
                        getSharedPreferences("native_attribution", MODE_PRIVATE)
                            .edit()
                            .putString("install_referrer", payload)
                            .apply()
                        deliverInstallReferrer()
                    }
                }
                client.endConnection()
            }

            override fun onInstallReferrerServiceDisconnected() = Unit
        })
        installReferrerPayload = getSharedPreferences("native_attribution", MODE_PRIVATE)
            .getString("install_referrer", null)
    }

    private fun deliverInstallReferrer() {
        val payload = installReferrerPayload ?: return
        callJavaScriptWithJson("__installReferrer", payload)
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) binding.webView.goBack() else finish()
            }
        })
    }

    private fun applySystemInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars: Insets = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    private fun urlFromIntent(intent: Intent?): String {
        val extra = intent?.getStringExtra(EXTRA_URL)
        if (TrustedOrigin.isTrusted(extra)) return extra!!
        val link = intent?.dataString
        if (TrustedOrigin.isTrusted(link)) return link!!
        return START_URL
    }

    private fun isBillingPage(url: String?): Boolean {
        if (!TrustedOrigin.isTrusted(url)) return false
        return runCatching { Uri.parse(url).path == "/abbonamento" }.getOrDefault(false)
    }

    private fun openExternally(uri: Uri) {
        val allowed = uri.scheme.equals("https", true) ||
            uri.scheme.equals("http", true) ||
            uri.scheme.equals("mailto", true) ||
            uri.scheme.equals("tel", true)
        if (!allowed) return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "Nessuna app disponibile per aprire il collegamento.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun callJavaScript(name: String, vararg arguments: String) {
        val args = arguments.joinToString(",") { JSONObject.quote(it) }
        callJavaScriptExpression(name, args)
    }

    private fun callJavaScriptChecked(
        name: String,
        arguments: List<String>,
        completion: (Boolean) -> Unit,
    ) {
        val args = arguments.joinToString(",") { JSONObject.quote(it) }
        callJavaScriptExpression(name, args, completion)
    }

    private fun callJavaScriptWithJson(name: String, jsonArgument: String) {
        if (runCatching { JSONObject("{\"value\":$jsonArgument}") }.isFailure) return
        callJavaScriptExpression(name, jsonArgument)
    }

    private fun callJavaScriptExpression(
        name: String,
        arguments: String,
        completion: ((Boolean) -> Unit)? = null,
    ) {
        if (name !in CALLBACKS) {
            completion?.invoke(false)
            return
        }
        runOnUiThread {
            if (!TrustedOrigin.isTrusted(binding.webView.url)) {
                completion?.invoke(false)
                return@runOnUiThread
            }
            val script = "(()=>{const f=window['$name'];if(typeof f!=='function')return false;f($arguments);return true;})()"
            binding.webView.evaluateJavascript(script) { result -> completion?.invoke(result == "true") }
        }
    }

    companion object {
        const val EXTRA_URL = "it.execlingo.app.destination"
        private const val START_URL = "https://www.execlingo.it/home?app=android"
        private val CALLBACKS = setOf(
            "__playPurchased",
            "__playFailed",
            "__playProducts",
            "__fcmToken",
            "__fcmDenied",
            "__micGranted",
            "__micDenied",
            "__installReferrer",
        )
    }
}
