package it.execlingo.app.billing

import android.annotation.SuppressLint
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/**
 * Durable queue between Play and the authenticated web backend.
 *
 * A token remains here until the website explicitly reports that the backend
 * persisted the entitlement. SharedPreferences is private to this app and a
 * synchronous commit prevents an app kill between purchase and callback from
 * losing an unconfirmed real-money purchase.
 */
@SuppressLint("ApplySharedPref") // Must persist before dispatching a paid purchase.
class PurchaseDeliveryQueue(context: Context) {
    data class Entry(
        val productId: String,
        val purchaseToken: String,
        val purchaseTime: Long,
    )

    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    @Synchronized
    fun upsert(entry: Entry): Boolean {
        if (ProductCatalog.find(entry.productId) == null || entry.purchaseToken.isBlank()) return false
        if (tokenHash(entry.purchaseToken) in confirmedTokenHashes()) return true
        val entries = read().associateByTo(linkedMapOf(), Entry::purchaseToken)
        entries[entry.purchaseToken] = entry
        return write(entries.values)
    }

    @Synchronized
    fun confirm(purchaseToken: String): Boolean {
        val entries = read().associateByTo(linkedMapOf(), Entry::purchaseToken)
        if (entries.remove(purchaseToken) == null) return false
        val confirmed = confirmedTokenHashes() + tokenHash(purchaseToken)
        return preferences.edit()
            .putString(KEY_QUEUE, encode(entries.values))
            .putStringSet(KEY_CONFIRMED, confirmed)
            .commit()
    }

    @Synchronized
    fun entries(): List<Entry> = read()

    /** Prune only after both Play-owned product types were queried successfully. */
    @Synchronized
    fun retainOwnedTokens(ownedTokens: Set<String>): Boolean {
        val current = read()
        val retained = current.filter { it.purchaseToken in ownedTokens }
        return retained.size == current.size || write(retained)
    }

    @Synchronized
    fun removeProducts(productIds: Set<String>): Boolean {
        val current = read()
        val retained = current.filterNot { it.productId in productIds }
        return retained.size == current.size || write(retained)
    }

    private fun read(): List<Entry> {
        val raw = preferences.getString(KEY_QUEUE, null) ?: return emptyList()
        val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val productId = item.optString("productId")
                val token = item.optString("purchaseToken")
                if (ProductCatalog.find(productId) == null || token.isBlank()) continue
                add(Entry(productId, token, item.optLong("purchaseTime", 0L)))
            }
        }
    }

    private fun write(entries: Collection<Entry>): Boolean {
        return preferences.edit().putString(KEY_QUEUE, encode(entries)).commit()
    }

    private fun encode(entries: Collection<Entry>): String {
        val array = JSONArray()
        entries.forEach { entry ->
            array.put(
                JSONObject()
                    .put("productId", entry.productId)
                    .put("purchaseToken", entry.purchaseToken)
                    .put("purchaseTime", entry.purchaseTime),
            )
        }
        return array.toString()
    }

    private fun confirmedTokenHashes(): Set<String> =
        preferences.getStringSet(KEY_CONFIRMED, emptySet())?.toSet().orEmpty()

    private fun tokenHash(token: String): String = MessageDigest
        .getInstance("SHA-256")
        .digest(token.toByteArray(StandardCharsets.UTF_8))
        .joinToString(separator = "") { "%02x".format(it) }

    companion object {
        private const val PREFERENCES = "play_purchase_delivery"
        private const val KEY_QUEUE = "unconfirmed_purchases_v1"
        private const val KEY_CONFIRMED = "confirmed_token_hashes_v1"
    }
}
