package it.execlingo.app.billing

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import it.execlingo.app.security.ObfuscatedAccountIdProvider
import org.json.JSONArray
import org.json.JSONObject

/**
 * Google Play Billing 9 bridge.
 *
 * This client never grants entitlements, consumes, or acknowledges. It sends a
 * product identifier plus purchase token to the authenticated website. The
 * ExecLingo backend verifies the purchase, grants access, and acknowledges it.
 */
class BillingController(
    private val activity: Activity,
    private val accountIdProvider: ObfuscatedAccountIdProvider,
    private val callbacks: Callbacks,
) : PurchasesUpdatedListener {

    interface Callbacks {
        fun onPurchased(productId: String, purchaseToken: String, dispatched: (Boolean) -> Unit)
        fun onPurchaseFailed(reason: String)
        fun onProducts(productsJson: String)
    }

    private val billingClient: BillingClient = BillingClient
        .newBuilder(activity.applicationContext)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .enablePrepaidPlans()
                .build(),
        )
        .enableAutoServiceReconnection()
        .build()

    private val pendingActions = mutableListOf<() -> Unit>()
    private val deliveryQueue = PurchaseDeliveryQueue(activity.applicationContext)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val recentlyDispatchedTokens = mutableMapOf<String, Long>()
    private var connecting = false
    private var closed = false
    private var setupRetryCount = 0
    private var ownedQueryInFlight = false
    private var rerunOwnedQuery = false
    private var rerunAsExplicitRestore = false

    init {
        connect()
    }

    fun purchase(productId: String, accountHint: String?) {
        val product = ProductCatalog.find(productId)
        if (product == null) {
            callbacks.onPurchaseFailed("product-not-found")
            return
        }
        val obfuscatedAccountId = accountIdProvider.get(accountHint)
        if (obfuscatedAccountId == null) {
            // Never open a real-money sheet if the backend will be unable to
            // bind Google's purchase to the authenticated ExecLingo account.
            callbacks.onPurchaseFailed("account-binding-required")
            return
        }

        runWhenReady {
            if (product.kind == ProductKind.SUBSCRIPTION) {
                val support = billingClient.isFeatureSupported(BillingClient.FeatureType.SUBSCRIPTIONS)
                if (support.responseCode != BillingClient.BillingResponseCode.OK) {
                    callbacks.onPurchaseFailed("subscriptions-unavailable")
                    return@runWhenReady
                }
            }
            queryDetails(listOf(product)) { result, details ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    callbacks.onPurchaseFailed(reasonFor(result))
                    return@queryDetails
                }
                val selected = details.singleOrNull()
                if (selected == null) {
                    callbacks.onPurchaseFailed("product-not-found")
                    return@queryDetails
                }
                launchPurchase(product, selected, obfuscatedAccountId)
            }
        }
    }

    /** Returns localized names and prices straight from Play, never constants. */
    fun queryProducts(productIds: List<String>) {
        val requested = ProductCatalog.supported(productIds)
        if (requested.isEmpty()) {
            callbacks.onProducts("[]")
            return
        }
        runWhenReady {
            queryDetails(requested) { result, details ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    callbacks.onPurchaseFailed(reasonFor(result))
                    callbacks.onProducts("[]")
                } else {
                    callbacks.onProducts(productsJson(details))
                }
            }
        }
    }

    /** Explicit restore requested by the signed-in user on the website. */
    fun restore() {
        runWhenReady { queryOwnedPurchases(explicitRestore = true) }
    }

    /** Reconciles a pending purchase that completed while the app was away. */
    fun refreshOwnedPurchases() {
        runWhenReady { queryOwnedPurchases(explicitRestore = false) }
    }

    /** Remove a durable token only after the backend persisted its entitlement. */
    fun completeDelivery(purchaseToken: String, success: Boolean) {
        if (success) {
            if (deliveryQueue.confirm(purchaseToken)) recentlyDispatchedTokens.remove(purchaseToken)
        } else {
            // A transient backend failure remains queued and can be retried now.
            recentlyDispatchedTokens.remove(purchaseToken)
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> processPurchases(purchases.orEmpty(), explicitRestore = false)
            BillingClient.BillingResponseCode.USER_CANCELED -> callbacks.onPurchaseFailed("cancelled")
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> restore()
            else -> callbacks.onPurchaseFailed(reasonFor(billingResult))
        }
    }

    fun close() {
        closed = true
        mainHandler.removeCallbacksAndMessages(null)
        pendingActions.clear()
        billingClient.endConnection()
    }

    private fun launchPurchase(
        product: PlayProduct,
        details: ProductDetails,
        obfuscatedAccountId: String,
    ) {
        val offerToken = selectedOfferToken(product, details)
        if (offerToken.isNullOrBlank()) {
            callbacks.onPurchaseFailed("no-offer")
            return
        }

        val detailParams = BillingFlowParams.ProductDetailsParams
            .newBuilder()
            .setProductDetails(details)
            .setOfferToken(offerToken)
            .build()
        val flowBuilder = BillingFlowParams
            .newBuilder()
            .setProductDetailsParamsList(listOf(detailParams))
            .setObfuscatedAccountId(obfuscatedAccountId)
            .setIsOfferPersonalized(false)
        val flowParams = flowBuilder.build()

        val result = billingClient.launchBillingFlow(activity, flowParams)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            callbacks.onPurchaseFailed(reasonFor(result))
        }
    }

    private fun selectedOfferToken(product: PlayProduct, details: ProductDetails): String? =
        when (product.kind) {
            ProductKind.ONE_TIME -> {
                val offers = details.oneTimePurchaseOfferDetailsList.orEmpty()
                val selected = offers.singleOrNull {
                    it.purchaseOptionId == product.preferredPlanId && it.offerId == null
                }
                selected?.offerToken
            }
            ProductKind.SUBSCRIPTION -> {
                val offers = details.subscriptionOfferDetails.orEmpty()
                val selected = offers.singleOrNull {
                    it.basePlanId == product.preferredPlanId && it.offerId == null
                }
                selected?.offerToken
            }
        }

    private fun queryDetails(
        products: List<PlayProduct>,
        done: (BillingResult, List<ProductDetails>) -> Unit,
    ) {
        val query = products.map {
            QueryProductDetailsParams.Product
                .newBuilder()
                .setProductId(it.id)
                .setProductType(it.billingType())
                .build()
        }
        val params = QueryProductDetailsParams
            .newBuilder()
            .setProductList(query)
            .build()

        billingClient.queryProductDetailsAsync(params) { result, response ->
            done(result, response.productDetailsList)
        }
    }

    private fun queryOwnedPurchases(explicitRestore: Boolean) {
        if (ownedQueryInFlight) {
            rerunOwnedQuery = true
            rerunAsExplicitRestore = rerunAsExplicitRestore || explicitRestore
            return
        }
        ownedQueryInFlight = true
        queryPurchases(ProductKind.ONE_TIME) { oneTimeResult, oneTime ->
            queryPurchases(ProductKind.SUBSCRIPTION) { subscriptionResult, subscriptions ->
                ownedQueryInFlight = false
                val error = listOf(oneTimeResult, subscriptionResult).firstOrNull {
                    it.responseCode != BillingClient.BillingResponseCode.OK
                }
                if (error != null) {
                    callbacks.onPurchaseFailed(reasonFor(error))
                } else {
                    val all = oneTime + subscriptions
                    val retained = deliveryQueue.retainOwnedTokens(
                        all.mapTo(mutableSetOf()) { it.purchaseToken },
                    )
                    if (retained) {
                        processPurchases(all, explicitRestore)
                    } else {
                        callbacks.onPurchaseFailed("delivery-queue-error")
                    }
                }

                if (rerunOwnedQuery) {
                    val rerunExplicit = rerunAsExplicitRestore
                    rerunOwnedQuery = false
                    rerunAsExplicitRestore = false
                    queryOwnedPurchases(rerunExplicit)
                }
            }
        }
    }

    private fun queryPurchases(
        kind: ProductKind,
        done: (BillingResult, List<Purchase>) -> Unit,
    ) {
        val params = QueryPurchasesParams
            .newBuilder()
            .setProductType(kind.billingType())
            .build()
        billingClient.queryPurchasesAsync(params) { result, purchases ->
            done(result, purchases)
        }
    }

    private fun processPurchases(purchases: List<Purchase>, explicitRestore: Boolean) {
        val now = SystemClock.elapsedRealtime()
        recentlyDispatchedTokens.entries.removeAll { now - it.value >= DELIVERY_COOLDOWN_MS }
        val pending = purchases.any { it.purchaseState == Purchase.PurchaseState.PENDING }
        val hasPurchasedSubscription = purchases.any { purchase ->
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED &&
                purchase.products.any { ProductCatalog.find(it)?.kind == ProductKind.SUBSCRIPTION }
        }
        var queueWriteFailed = false
        // `program` stays owned in Play after its 98-day entitlement has ended.
        // Never let that historical one-time item overwrite an active
        // maintenance/monthly/annual subscription during restore.
        if (hasPurchasedSubscription && !deliveryQueue.removeProducts(setOf("program"))) {
            queueWriteFailed = true
        }
        purchases.asSequence()
            .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
            .flatMap { purchase ->
                purchase.products.asSequence()
                    .filter { ProductCatalog.find(it) != null }
                    .filterNot { hasPurchasedSubscription && it == "program" }
                    .map { productId ->
                        PurchaseDeliveryQueue.Entry(productId, purchase.purchaseToken, purchase.purchaseTime)
                    }
            }
            .forEach { entry ->
                if (!deliveryQueue.upsert(entry)) queueWriteFailed = true
            }

        if (queueWriteFailed) {
            callbacks.onPurchaseFailed("delivery-queue-error")
            return
        }

        val candidates = deliveryQueue.entries()
            .asSequence()
            .filter { explicitRestore || it.purchaseToken !in recentlyDispatchedTokens }
            .sortedWith(
                compareByDescending<PurchaseDeliveryQueue.Entry> { productPriority(it.productId) }
                    .thenByDescending { it.purchaseTime },
            )
            .toList()

        // The existing website callback reloads after successful confirmation,
        // so deliver the strongest currently owned entitlement first. The
        // backend remains authoritative and idempotent for subsequent restores.
        val selected = candidates.firstOrNull()
        if (selected != null) {
            callbacks.onPurchased(selected.productId, selected.purchaseToken) { dispatched ->
                if (dispatched) {
                    recentlyDispatchedTokens[selected.purchaseToken] = SystemClock.elapsedRealtime()
                }
            }
        } else if (pending) {
            callbacks.onPurchaseFailed("pending")
        } else if (explicitRestore) {
            callbacks.onPurchaseFailed("nothing-to-restore")
        }
    }

    private fun productsJson(details: List<ProductDetails>): String {
        val result = JSONArray()
        for (detail in details) {
            val product = ProductCatalog.find(detail.productId) ?: continue
            val item = JSONObject()
                .put("productId", detail.productId)
                .put("name", detail.name)
                .put("description", detail.description)
                .put("type", if (product.kind == ProductKind.SUBSCRIPTION) "subscription" else "one-time")

            when (product.kind) {
                ProductKind.ONE_TIME -> {
                    val offers = detail.oneTimePurchaseOfferDetailsList.orEmpty()
                    val offer = offers.singleOrNull {
                        it.purchaseOptionId == product.preferredPlanId && it.offerId == null
                    }
                    if (offer != null) {
                        item.put("formattedPrice", offer.formattedPrice)
                        item.put("currency", offer.priceCurrencyCode)
                        item.put("priceMicros", offer.priceAmountMicros)
                    } else continue
                }
                ProductKind.SUBSCRIPTION -> {
                    val offers = detail.subscriptionOfferDetails.orEmpty()
                    val offer = offers.singleOrNull {
                        it.basePlanId == product.preferredPlanId && it.offerId == null
                    }
                    val phase = offer?.pricingPhases?.pricingPhaseList?.lastOrNull()
                    if (phase != null) {
                        item.put("formattedPrice", phase.formattedPrice)
                        item.put("currency", phase.priceCurrencyCode)
                        item.put("priceMicros", phase.priceAmountMicros)
                        item.put("billingPeriod", phase.billingPeriod)
                    } else continue
                }
            }
            result.put(item)
        }
        return result.toString()
    }

    private fun runWhenReady(action: () -> Unit) {
        if (closed) {
            callbacks.onPurchaseFailed("billing-closed")
            return
        }
        if (billingClient.isReady) {
            action()
            return
        }
        pendingActions += action
        connect()
    }

    private fun connect() {
        if (closed || billingClient.isReady || connecting) return
        connecting = true
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                connecting = false
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    if (setupRetryCount < MAX_SETUP_RETRIES && isTransient(result)) {
                        setupRetryCount += 1
                        mainHandler.postDelayed({ connect() }, SETUP_RETRY_BASE_MS * setupRetryCount)
                    } else {
                        pendingActions.clear()
                        callbacks.onPurchaseFailed("billing-setup-${result.responseCode}")
                    }
                    return
                }
                setupRetryCount = 0
                val actions = pendingActions.toList()
                pendingActions.clear()
                actions.forEach { it() }
                // Reconcile after every successful setup, independently from
                // the page and from whichever operation triggered reconnect.
                // The in-flight guard coalesces this with an onResume restore.
                queryOwnedPurchases(explicitRestore = false)
            }

            override fun onBillingServiceDisconnected() {
                connecting = false
                // Billing 9 automatic service reconnection handles the next API call.
            }
        })
    }

    private fun PlayProduct.billingType(): String = kind.billingType()

    private fun ProductKind.billingType(): String = when (this) {
        ProductKind.ONE_TIME -> BillingClient.ProductType.INAPP
        ProductKind.SUBSCRIPTION -> BillingClient.ProductType.SUBS
    }

    private fun productPriority(productId: String): Int = when (productId) {
        "annual" -> 4
        "monthly" -> 3
        "maintenance" -> 2
        "program" -> 1
        else -> 0
    }

    private fun reasonFor(result: BillingResult): String = when (result.responseCode) {
        BillingClient.BillingResponseCode.USER_CANCELED -> "cancelled"
        BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE -> "service-unavailable"
        BillingClient.BillingResponseCode.BILLING_UNAVAILABLE -> "billing-unavailable"
        BillingClient.BillingResponseCode.ITEM_UNAVAILABLE -> "product-unavailable"
        BillingClient.BillingResponseCode.DEVELOPER_ERROR -> "configuration-error"
        BillingClient.BillingResponseCode.ERROR -> "play-error"
        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> "already-owned"
        BillingClient.BillingResponseCode.ITEM_NOT_OWNED -> "not-owned"
        BillingClient.BillingResponseCode.NETWORK_ERROR -> "network-error"
        else -> "billing-${result.responseCode}"
    }

    private fun isTransient(result: BillingResult): Boolean = when (result.responseCode) {
        BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE,
        BillingClient.BillingResponseCode.ERROR,
        BillingClient.BillingResponseCode.NETWORK_ERROR -> true
        else -> false
    }

    companion object {
        // Prevent a successful confirmation + page reload from creating a
        // delivery loop, while allowing a passive retry later in the session.
        private const val DELIVERY_COOLDOWN_MS = 60_000L
        private const val MAX_SETUP_RETRIES = 3
        private const val SETUP_RETRY_BASE_MS = 1_000L
    }
}
