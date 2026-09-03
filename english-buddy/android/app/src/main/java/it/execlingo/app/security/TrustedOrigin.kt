package it.execlingo.app.security

import java.net.URI

object TrustedOrigin {
    const val SCHEME = "https"
    const val HOST = "www.execlingo.it"
    const val ORIGIN = "$SCHEME://$HOST"

    fun isTrusted(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        return uri.scheme.equals(SCHEME, ignoreCase = true) &&
            uri.host.equals(HOST, ignoreCase = true) &&
            (uri.port == -1 || uri.port == 443) &&
            uri.userInfo == null
    }
}

