package it.execlingo.app.security

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrustedOriginTest {
    @Test
    fun acceptsOnlyExactProductionHttpsOrigin() {
        assertTrue(TrustedOrigin.isTrusted("https://www.execlingo.it/home?app=android"))
        assertTrue(TrustedOrigin.isTrusted("https://www.execlingo.it:443/abbonamento"))

        assertFalse(TrustedOrigin.isTrusted("http://www.execlingo.it/home"))
        assertFalse(TrustedOrigin.isTrusted("https://execlingo.it/home"))
        assertFalse(TrustedOrigin.isTrusted("https://www.execlingo.it.example.com/home"))
        assertFalse(TrustedOrigin.isTrusted("https://user@www.execlingo.it/home"))
        assertFalse(TrustedOrigin.isTrusted("javascript:alert(1)"))
        assertFalse(TrustedOrigin.isTrusted(null))
    }
}

