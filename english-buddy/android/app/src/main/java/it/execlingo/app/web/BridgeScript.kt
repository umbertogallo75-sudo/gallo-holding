package it.execlingo.app.web

/**
 * Compatibility shim for the existing website contract. ExecLingoNativePort is
 * injected by AndroidX WebKit only on the exact production origin; no legacy
 * addJavascriptInterface object is exposed to frames or foreign pages.
 */
object BridgeScript {
    const val CHANNEL = "ExecLingoNativePort"

    val source: String =
        """
        (() => {
          'use strict';
          const port = window.ExecLingoNativePort;
          if (!port || typeof port.postMessage !== 'function') return;
          const send = (action, payload = {}) =>
            port.postMessage(JSON.stringify(Object.assign({ action }, payload)));
          const api = Object.freeze({
            purchase: (productId, accountHint) => send('purchase', { productId, accountHint }),
            purchaseResult: (purchaseToken, success) => send('purchaseResult', { purchaseToken, success: success === true }),
            restore: () => send('restore'),
            requestPush: () => send('requestPush'),
            requestMic: () => send('requestMic'),
            getProducts: (productIds) => send('products', { productIds })
          });
          Object.defineProperty(window, 'ExecLingoNative', {
            value: api,
            configurable: false,
            enumerable: true,
            writable: false
          });
        })();
        """.trimIndent()
}
