package it.execlingo.app

import android.app.Activity
import com.android.billingclient.api.*

/**
 * Google Play Billing, native. The page asks for a product, the sheet opens,
 * and the resulting purchase token goes back to the page, which confirms it
 * server-side (/api/playstore/confirm) where Google is asked for the
 * authoritative state before any plan is activated.
 *
 * Product ids mirror Play Console: monthly / maintenance (subscriptions),
 * program (one-time).
 */
class BillingBridge(
    private val activity: Activity,
    private val callback: (String) -> Unit,
) : PurchasesUpdatedListener {

    private val subscriptions = setOf("monthly", "maintenance")

    private val client: BillingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()

    private var pendingProduct: String? = null

    private fun withConnection(action: () -> Unit) {
        if (client.isReady) { action(); return }
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) action()
                else fail("billing-setup-${result.responseCode}")
            }
            override fun onBillingServiceDisconnected() = fail("billing-disconnected")
        })
    }

    fun purchase(productId: String) {
        pendingProduct = productId
        withConnection {
            val type = if (productId in subscriptions) BillingClient.ProductType.SUBS else BillingClient.ProductType.INAPP
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(productId)
                            .setProductType(type)
                            .build()
                    )
                ).build()

            client.queryProductDetailsAsync(params) { result, details ->
                val product = details.firstOrNull()
                if (result.responseCode != BillingClient.BillingResponseCode.OK || product == null) {
                    fail("product-not-found"); return@queryProductDetailsAsync
                }
                val builder = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product)
                if (type == BillingClient.ProductType.SUBS) {
                    val offer = product.subscriptionOfferDetails?.firstOrNull()
                        ?: run { fail("no-offer"); return@queryProductDetailsAsync }
                    builder.setOfferToken(offer.offerToken)
                }
                val flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(listOf(builder.build()))
                    .build()
                activity.runOnUiThread { client.launchBillingFlow(activity, flow) }
            }
        }
    }

    fun restore() {
        withConnection {
            var reported = false
            for (type in listOf(BillingClient.ProductType.SUBS, BillingClient.ProductType.INAPP)) {
                val params = QueryPurchasesParams.newBuilder().setProductType(type).build()
                client.queryPurchasesAsync(params) { result, purchases ->
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                        for (purchase in purchases) if (!reported) { reported = true; deliver(purchase) }
                    }
                }
            }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> purchases?.forEach { deliver(it) }
            BillingClient.BillingResponseCode.USER_CANCELED -> fail("cancelled")
            else -> fail("code-${result.responseCode}")
        }
    }

    /** Hands the token to the page; the server verifies and acknowledges it. */
    private fun deliver(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) { fail("pending"); return }
        val productId = purchase.products.firstOrNull() ?: pendingProduct ?: return
        callback("window.__playPurchased && window.__playPurchased(\"$productId\",\"${purchase.purchaseToken}\")")
    }

    private fun fail(reason: String) = callback("window.__playFailed && window.__playFailed(\"$reason\")")
}
