package it.execlingo.app.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ObfuscatedAccountIdProviderTest {
    @Test
    fun omitsIdentifierWithoutSafeAccountHint() {
        val provider = ObfuscatedAccountIdProvider()
        assertNull(provider.get(null))
        assertNull(provider.get("short"))
        assertEquals(
            ObfuscatedAccountIdProvider.sha256("it.execlingo.app:opaque-user-123"),
            provider.get("opaque-user-123"),
        )
    }

    @Test
    fun hashIsDeterministicNonPiiAndWithinPlayLimit() {
        val first = ObfuscatedAccountIdProvider.sha256("it.execlingo.app:opaque-user-123")
        val again = ObfuscatedAccountIdProvider.sha256("it.execlingo.app:opaque-user-123")
        val another = ObfuscatedAccountIdProvider.sha256("it.execlingo.app:opaque-user-456")

        assertEquals(first, again)
        assertNotEquals(first, another)
        assertEquals(64, first.length)
        assertTrue(first.matches(Regex("[0-9a-f]{64}")))
        assertFalseContains(first, "opaque-user")
    }

    private fun assertFalseContains(value: String, forbidden: String) {
        assertTrue(!value.contains(forbidden))
    }
}
