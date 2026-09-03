package it.execlingo.app.billing

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PurchaseDeliveryQueueTest {
    private lateinit var context: Context

    @Before
    fun clearQueue() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("play_purchase_delivery", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun tokenSurvivesNewQueueInstanceUntilBackendConfirmation() {
        val entry = PurchaseDeliveryQueue.Entry("annual", "purchase-token-123", 42L)
        assertTrue(PurchaseDeliveryQueue(context).upsert(entry))
        assertEquals(listOf(entry), PurchaseDeliveryQueue(context).entries())

        assertTrue(PurchaseDeliveryQueue(context).confirm(entry.purchaseToken))
        assertTrue(PurchaseDeliveryQueue(context).entries().isEmpty())

        // A Play reconciliation must not enqueue a token already persisted by
        // the backend, including after activity recreation.
        assertTrue(PurchaseDeliveryQueue(context).upsert(entry))
        assertTrue(PurchaseDeliveryQueue(context).entries().isEmpty())
    }

    @Test
    fun historicalProgramCanBeSuppressedWithoutDroppingActiveSubscription() {
        val program = PurchaseDeliveryQueue.Entry("program", "old-program-token", 1L)
        val maintenance = PurchaseDeliveryQueue.Entry("maintenance", "active-maintenance-token", 2L)
        val queue = PurchaseDeliveryQueue(context)

        assertTrue(queue.upsert(program))
        assertTrue(queue.upsert(maintenance))
        assertTrue(queue.removeProducts(setOf("program")))

        assertEquals(listOf(maintenance), PurchaseDeliveryQueue(context).entries())
    }
}
