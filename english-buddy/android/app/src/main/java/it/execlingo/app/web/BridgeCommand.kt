package it.execlingo.app.web

import it.execlingo.app.billing.ProductCatalog
import org.json.JSONObject

sealed interface BridgeCommand {
    data class Purchase(val productId: String, val accountHint: String?) : BridgeCommand
    data class Products(val productIds: List<String>) : BridgeCommand
    data class PurchaseResult(val purchaseToken: String, val success: Boolean) : BridgeCommand
    data object Restore : BridgeCommand
    data object RequestPush : BridgeCommand
    data object RequestMic : BridgeCommand
}

object BridgeCommandParser {
    fun parse(raw: String): BridgeCommand? {
        if (raw.length !in 2..8_192) return null
        val message = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        return when (message.optString("action")) {
            "purchase" -> {
                val productId = message.optString("productId")
                if (ProductCatalog.find(productId) == null) return null
                val hint = if (message.has("accountHint") && !message.isNull("accountHint")) {
                    message.optString("accountHint").trim().takeIf { it.length in 8..512 }
                } else {
                    null
                }
                BridgeCommand.Purchase(productId, hint)
            }
            "products" -> {
                val values = message.optJSONArray("productIds") ?: return null
                if (values.length() !in 1..10) return null
                val ids = buildList {
                    for (index in 0 until values.length()) add(values.optString(index))
                }
                val supported = ProductCatalog.supported(ids).map { it.id }
                if (supported.isEmpty()) null else BridgeCommand.Products(supported)
            }
            "purchaseResult" -> {
                val token = message.optString("purchaseToken")
                val success = message.opt("success") as? Boolean ?: return null
                if (token.length !in 8..4_096) null else BridgeCommand.PurchaseResult(token, success)
            }
            "restore" -> BridgeCommand.Restore
            "requestPush" -> BridgeCommand.RequestPush
            "requestMic" -> BridgeCommand.RequestMic
            else -> null
        }
    }
}
