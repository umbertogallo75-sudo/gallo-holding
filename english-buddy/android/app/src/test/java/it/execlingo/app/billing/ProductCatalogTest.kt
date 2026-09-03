package it.execlingo.app.billing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProductCatalogTest {
    @Test
    fun annualIsAlwaysQueriedAsSubscription() {
        val annual = ProductCatalog.find("annual")
        assertEquals(ProductKind.SUBSCRIPTION, annual?.kind)
        assertEquals("annual-plan", annual?.preferredPlanId)
    }

    @Test
    fun programIsTheOnlyOneTimeProduct() {
        assertEquals(listOf("program"), ProductCatalog.products.filter { it.kind == ProductKind.ONE_TIME }.map { it.id })
    }

    @Test
    fun unknownProductsAreRejected() {
        assertNull(ProductCatalog.find("fake-plan"))
        assertEquals(listOf("monthly"), ProductCatalog.supported(listOf("fake-plan", "monthly", "monthly")).map { it.id })
    }
}
