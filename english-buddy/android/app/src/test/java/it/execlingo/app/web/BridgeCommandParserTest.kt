package it.execlingo.app.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class BridgeCommandParserTest {
    @Test
    fun parsesAnnualPurchaseAsAllowedCommand() {
        val command = BridgeCommandParser.parse(
            """{"action":"purchase","productId":"annual","accountHint":"opaque-account-123"}""",
        )
        assertEquals(BridgeCommand.Purchase("annual", "opaque-account-123"), command)
    }

    @Test
    fun rejectsUnknownProductAndMalformedJson() {
        assertNull(BridgeCommandParser.parse("""{"action":"purchase","productId":"intruder"}"""))
        assertNull(BridgeCommandParser.parse("not-json"))
    }

    @Test
    fun productQueryDropsUnknownAndDuplicateIdentifiers() {
        val command = BridgeCommandParser.parse(
            """{"action":"products","productIds":["annual","bad","annual","program"]}""",
        )
        assertTrue(command is BridgeCommand.Products)
        assertEquals(listOf("annual", "program"), (command as BridgeCommand.Products).productIds)
    }

    @Test
    fun purchaseResultRequiresBooleanAndPlausibleToken() {
        assertEquals(
            BridgeCommand.PurchaseResult("purchase-token-123", true),
            BridgeCommandParser.parse(
                """{"action":"purchaseResult","purchaseToken":"purchase-token-123","success":true}""",
            ),
        )
        assertNull(
            BridgeCommandParser.parse(
                """{"action":"purchaseResult","purchaseToken":"short","success":true}""",
            ),
        )
        assertNull(
            BridgeCommandParser.parse(
                """{"action":"purchaseResult","purchaseToken":"purchase-token-123"}""",
            ),
        )
    }
}
