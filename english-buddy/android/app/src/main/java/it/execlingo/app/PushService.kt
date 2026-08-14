package it.execlingo.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives Sam's notifications from Firebase and shows them. Tapping one
 * opens the app on the deep link carried in the payload, so the user lands
 * straight in the conversation.
 */
class PushService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // The page registers the token when it next opens; nothing to do here.
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: "Sam · ExecLingo"
        val body = message.notification?.body ?: return
        val url = message.data["url"] ?: "/home"

        val manager = NotificationManagerCompat.from(this)
        ensureChannel(this)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("url", url)
        }
        val pending = PendingIntent.getActivity(
            this, url.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        try {
            manager.notify(url.hashCode(), notification)
        } catch (_: SecurityException) {
            // Permission revoked between delivery and display: nothing to do.
        }
    }

    companion object {
        const val CHANNEL = "sam"

        /**
         * Declares Sam's channel to Android. Called at app start, not only on
         * the first notification: until a channel exists the app has nothing
         * to show in Settings → Notifications, so ExecLingo was simply absent
         * from that list and there was no way to review or re-enable it.
         */
        fun ensureChannel(context: android.content.Context) {
            NotificationManagerCompat.from(context).createNotificationChannel(
                NotificationChannel(CHANNEL, "Sam", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Le domande del tuo coach durante il giorno"
                }
            )
        }
    }
}
