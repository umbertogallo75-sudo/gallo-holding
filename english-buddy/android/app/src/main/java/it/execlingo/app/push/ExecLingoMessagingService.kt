package it.execlingo.app.push

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import it.execlingo.app.MainActivity
import it.execlingo.app.R
import it.execlingo.app.security.TrustedOrigin

@SuppressLint("MissingFirebaseInstanceTokenRefresh") // FCM 25+ uses onRegistered(FID).
class ExecLingoMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title
            ?: message.data["title"]
            ?: getString(R.string.app_name)
        val body = message.notification?.body
            ?: message.data["body"]
            ?: "Sam è pronto per il tuo prossimo allenamento."
        val destination = safeDestination(message.data["url"])

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_URL, destination)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            destination.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, getString(R.string.notification_channel_id))
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(this, R.color.brand_blue))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            runCatching {
                NotificationManagerCompat.from(this).notify(message.messageId?.hashCode() ?: destination.hashCode(), notification)
            }
        }
    }

    override fun onRegistered(installationId: String) {
        // Registration is intentionally initiated by the authenticated website
        // through requestPush(), so the FID is bound to the correct user.
        getSharedPreferences(PREFERENCES, MODE_PRIVATE)
            .edit()
            .putString(LAST_FCM_REGISTRATION, installationId)
            .apply()
    }

    private fun safeDestination(raw: String?): String {
        if (raw.isNullOrBlank()) return DEFAULT_URL
        val absolute = if (raw.startsWith("/")) TrustedOrigin.ORIGIN + raw else raw
        return if (TrustedOrigin.isTrusted(absolute)) absolute else DEFAULT_URL
    }

    companion object {
        const val PREFERENCES = "native_push"
        const val LAST_FCM_REGISTRATION = "last_fcm_registration"
        private const val DEFAULT_URL = "https://www.execlingo.it/home?app=android"
    }
}
