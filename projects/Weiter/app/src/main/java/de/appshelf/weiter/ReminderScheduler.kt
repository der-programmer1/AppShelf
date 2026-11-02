package de.appshelf.weiter

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

/** Device-only, inexact alarms; no network, exact-alarm grant, or task text in notifications. */
object ReminderScheduler {
    private const val CHANNEL = "weiter_local_reminders"
    private const val PREFS = "weiter_alarm_state"
    private const val ACTION = "de.appshelf.weiter.LOCAL_ALARM"
    private const val REMINDER = "reminder"
    private const val TIMER = "timer"
    private const val MAX_DELIVERED = 4096

    fun permissionGranted(context: Context): Boolean {
        val permission = Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return permission && context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    }

    /** Prevents a still-open editor from putting an already delivered alarm back into storage. */
    fun normalizeDelivered(context: Context, data: AppData): AppData {
        val delivered = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet("delivered", emptySet()).orEmpty()
        return data.copy(entries = data.entries.map { entry ->
            if (entry.reminderAt?.let { token(REMINDER, entry.id, it) in delivered } == true)
                entry.copy(reminderAt = null) else entry
        }, timer = data.timer?.takeUnless { token(TIMER, it.entryId, it.endsAt) in delivered })
    }

    @Synchronized
    fun sync(context: Context, data: AppData) {
        val app = context.applicationContext
        ensureChannel(app)
        val alarms = app.getSystemService(AlarmManager::class.java)
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previous = prefs.getStringSet("scheduled", emptySet()).orEmpty().toSet()
        previous.forEach { uri ->
            PendingIntent.getBroadcast(app, 1, Intent(app, ReminderReceiver::class.java)
                .setAction(ACTION).setData(Uri.parse(uri)),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)?.let {
                alarms.cancel(it)
                it.cancel()
            }
        }
        val delivered = prefs.getStringSet("delivered", emptySet()).orEmpty()
        val next = linkedSetOf<String>()
        // Only one wake-up alarm is required, even for thousands of tasks. The receiver
        // handles every currently due reminder and then plans the next future one.
        val candidates = data.entries.filter { it.status != EntryStatus.DONE && it.status != EntryStatus.TRASH }
            .mapNotNull { entry -> entry.reminderAt?.let { Triple(REMINDER, entry.id, it) } }
            .toMutableList()
        data.timer?.let { timer ->
            if (data.entries.any { it.id == timer.entryId && it.status != EntryStatus.TRASH && it.status != EntryStatus.DONE })
                candidates.add(Triple(TIMER, timer.entryId, timer.endsAt))
        }
        candidates.filter { token(it.first, it.second, it.third) !in delivered }
            .minByOrNull { it.third }?.let { schedule(app, alarms, it.first, it.second, it.third, next) }
        prefs.edit().putStringSet("scheduled", next).apply()
    }

    private fun schedule(context: Context, alarms: AlarmManager, kind: String, id: String,
                         at: Long, scheduled: MutableSet<String>) {
        val uri = Uri.Builder().scheme("weiter").authority("alarm").appendPath(kind).appendPath(id).build()
        val intent = Intent(context, ReminderReceiver::class.java).setAction(ACTION).setData(uri)
            .putExtra("kind", kind).putExtra("id", id).putExtra("at", at)
        val pending = PendingIntent.getBroadcast(context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        // Past reminders remain visible as an overdue notification rather than being discarded.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,
            maxOf(at, System.currentTimeMillis() + 1000L), pending)
        scheduled.add(uri.toString())
    }

    @Synchronized
    internal fun receive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        val kind = intent.getStringExtra("kind") ?: return
        val id = intent.getStringExtra("id") ?: return
        val at = intent.getLongExtra("at", -1L)
        if (at <= 0L || (kind != REMINDER && kind != TIMER)) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val delivered = prefs.getStringSet("delivered", emptySet()).orEmpty().toMutableSet()
        val key = token(kind, id, at)
        if (key in delivered) return
        val store = LocalStore(context)
        val now = System.currentTimeMillis()
        if (at > now + 1500L) {
            try { sync(context, store.read()) } catch (_: Exception) { }
            return
        }
        var consumed = false
        var timerFinished = false
        val consumedTokens = mutableListOf<String>()
        // Read/check/write under LocalStore's shared lock, so a current edit cannot be lost.
        val updated = try { store.transform { current ->
            val valid = when (kind) {
                REMINDER -> current.entries.any {
                    it.id == id && it.reminderAt == at && it.status != EntryStatus.DONE && it.status != EntryStatus.TRASH
                }
                else -> current.timer?.let { it.entryId == id && it.endsAt == at } == true &&
                    current.entries.any { it.id == id && it.status != EntryStatus.DONE && it.status != EntryStatus.TRASH }
            }
            if (!valid) current else {
                consumed = true
                val entries = current.entries.map { entry ->
                    val time = entry.reminderAt
                    if (time != null && time <= now + 1500L && entry.status != EntryStatus.DONE && entry.status != EntryStatus.TRASH) {
                        consumedTokens.add(token(REMINDER, entry.id, time))
                        entry.copy(reminderAt = null, updatedAt = now)
                    } else entry
                }
                val timer = current.timer?.takeUnless {
                    val finished = it.endsAt <= now + 1500L &&
                        entries.any { entry -> entry.id == it.entryId && entry.status != EntryStatus.DONE && entry.status != EntryStatus.TRASH }
                    if (finished) {
                        timerFinished = true
                        consumedTokens.add(token(TIMER, it.entryId, it.endsAt))
                    }
                    finished
                }
                current.copy(entries = entries, timer = timer)
            }
        } } catch (_: Exception) { return }
        if (!consumed) return
        delivered.addAll(consumedTokens)
        prefs.edit().putStringSet("delivered", delivered.sortedBy {
            it.substringAfterLast(':').toLongOrNull() ?: 0L
        }.takeLast(MAX_DELIVERED).toSet()).commit()
        if (permissionGranted(context)) {
            ensureChannel(context)
            val launch = PendingIntent.getActivity(context, 0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification = Notification.Builder(context, CHANNEL)
                .setSmallIcon(de.appshelf.weiter.R.drawable.ic_notification)
                .setContentTitle(if (timerFinished) "Deine Fokuszeit ist vorbei" else "Ein nächster Schritt wartet")
                .setContentText(if (timerFinished) "Öffne Weiter und entscheide, wie es weitergeht." else "Öffne Weiter für deine lokale Erinnerung.")
                .setContentIntent(launch)
                .setAutoCancel(true)
                .setCategory(if (timerFinished) Notification.CATEGORY_ALARM else Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build()
            try {
                context.getSystemService(NotificationManager::class.java).notify(key.hashCode(), notification)
            } catch (_: SecurityException) { /* Text entry and persisted tasks continue without notification access. */ }
        }
        sync(context, updated)
    }

    private fun token(kind: String, id: String, at: Long): String = "$kind:$id:$at"

    private fun ensureChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, "Lokale Erinnerungen und Fokus", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "Erinnerungen und Fokuszeiten, die du in Weiter selbst auswählst."
        channel.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        ReminderScheduler.receive(context, intent)
    }
}

class RestoreRemindersReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIME_CHANGED,
                Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_MY_PACKAGE_REPLACED)) return
        try { ReminderScheduler.sync(context, LocalStore(context).read()) }
        catch (_: Exception) { /* A storage failure never replaces user data with an empty state. */ }
    }
}
