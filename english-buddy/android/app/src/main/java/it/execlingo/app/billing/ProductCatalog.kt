package it.execlingo.app.billing

enum class ProductKind {
    ONE_TIME,
    SUBSCRIPTION,
}

data class PlayProduct(
    val id: String,
    val kind: ProductKind,
    val preferredPlanId: String,
)

/**
 * Identifiers only. Names and prices always come from the Play catalog.
 * `annual` is ready for the newly requested yearly plan; it must exist and be
 * active in Play Console before its card is enabled on the website.
 */
object ProductCatalog {
    val products: List<PlayProduct> = listOf(
        PlayProduct("program", ProductKind.ONE_TIME, "buy"),
        PlayProduct("monthly", ProductKind.SUBSCRIPTION, "monthly-base"),
        PlayProduct("maintenance", ProductKind.SUBSCRIPTION, "maintenance-base"),
        PlayProduct("annual", ProductKind.SUBSCRIPTION, "annual-plan"),
    )

    private val byId = products.associateBy(PlayProduct::id)

    fun find(id: String): PlayProduct? = byId[id]

    fun supported(ids: Iterable<String>): List<PlayProduct> = ids
        .distinct()
        .mapNotNull(::find)
}
