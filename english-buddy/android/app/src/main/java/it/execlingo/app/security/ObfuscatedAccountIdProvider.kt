package it.execlingo.app.security

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/**
 * Produces a non-PII identifier accepted by Google Play Billing (max 64 chars)
 * only when the trusted website supplies a server-issued opaque account hint.
 *
 * An installation identifier must not be substituted for account identity: it
 * would make restore/fraud signals misleading on shared devices. This value is
 * advisory; the backend must still enforce purchase-token ownership.
 */
class ObfuscatedAccountIdProvider {
    fun get(accountHint: String?): String? {
        val stableInput = accountHint
            ?.trim()
            ?.takeIf { it.length in 8..512 }
            ?: return null
        return sha256("it.execlingo.app:$stableInput")
    }

    companion object {
        internal fun sha256(value: String): String = MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString(separator = "") { "%02x".format(it) }
    }
}
