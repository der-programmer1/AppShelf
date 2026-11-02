package de.appshelf.weiter

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate

/** Exercises the real AtomicFile store and Android intents/alarms, rather than mocks. */
@RunWith(AndroidJUnit4::class)
class WeiterStorageAndroidTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var store: LocalStore

    @Before fun emptyOnlyThisApp() {
        store = LocalStore(context)
        ReminderScheduler.sync(context, AppData())
        context.getSharedPreferences("weiter_alarm_state", Context.MODE_PRIVATE).edit().clear().commit()
        store.write(AppData())
    }

    @After fun cancelOwnAlarms() {
        ReminderScheduler.sync(context, AppData())
    }

    @Test fun thoughtClarificationParkingCompletionReopenAndUndoPersist() {
        val inbox = Rules.newEntry("Paket zurückschicken")
        store.write(AppData(entries = listOf(inbox), draft = "Noch nicht abgeschickter Gedanke"))
        assertEquals(inbox, LocalStore(context).read().entries.single())
        assertEquals(EntryStatus.INBOX, store.read().entries.single().status)

        val today = Rules.clarify(inbox.copy(nextStep = "Rücksendeetikett im Browser öffnen", minutes = 5,
            place = Place.ONLINE, dueDate = Rules.today()))
        store.transform { it.copy(entries = listOf(today)) }
        assertEquals(listOf(today.id), Rules.todayEntries(LocalStore(context).read()).map { it.id })
        assertEquals("Noch nicht abgeschickter Gedanke", store.read().draft)

        val tomorrow = LocalDate.now().plusDays(1).toString()
        val parked = Rules.park(today, tomorrow)
        store.transform { it.copy(entries = listOf(parked)) }
        assertTrue(Rules.todayEntries(store.read()).isEmpty())
        assertEquals(parked.id, Rules.parkedEntries(store.read()).single().id)
        assertEquals(tomorrow, LocalStore(context).read().entries.single().dueDate)

        val completed = Rules.complete(parked)
        store.transform { it.copy(entries = listOf(completed)) }
        assertEquals(EntryStatus.DONE, LocalStore(context).read().entries.single().status)
        val reopened = Rules.reopen(store.read().entries.single())
        store.transform { it.copy(entries = listOf(reopened)) }
        assertEquals(EntryStatus.PARKED, LocalStore(context).read().entries.single().status)
        assertNull(store.read().entries.single().completedDate)

        val deleted = Rules.trash(reopened)
        store.transform { it.copy(entries = listOf(deleted)) }
        assertEquals(EntryStatus.TRASH, LocalStore(context).read().entries.single().status)
        val restored = Rules.restore(store.read().entries.single())
        store.transform { it.copy(entries = listOf(restored)) }
        assertEquals(EntryStatus.PARKED, LocalStore(context).read().entries.single().status)
        assertEquals(inbox.thought, store.read().entries.single().thought)
        assertEquals(today.nextStep, store.read().entries.single().nextStep)
    }

    @Test fun jsonExportAndMergeImportPreserveExistingAndRejectInvalidFiles() {
        val local = Rules.newEntry("Arzt anrufen").copy(notes = "Telefonnummer im Brief nachsehen")
        val original = AppData(entries = listOf(local), draft = "Entwurf bleibt erhalten")
        store.write(original)
        val exported = store.exportJson(store.read())
        assertEquals(original, BackupCodec.decode(exported))

        val conflict = local.copy(thought = "Darf lokalen Gedanken nicht ersetzen")
        val incoming = Rules.newEntry("Formular ausfüllen")
        val merged = store.importJson(BackupCodec.encode(AppData(entries = listOf(conflict, incoming))))
        assertEquals(2, merged.entries.size)
        assertEquals(local, merged.entries.first { it.id == local.id })
        assertEquals(original.draft, merged.draft)
        assertEquals(merged, store.importJson(BackupCodec.encode(AppData(entries = listOf(incoming)))))

        val beforeBytes = java.io.File(context.filesDir, "weiter-state.json").readBytes()
        val invalidDocuments = listOf(
            "not json", "{}", "[]", exported.dropLast(3),
            exported.replace("\"version\":1", "\"version\":999"),
            exported.replace("\"format\":", "format:"), // unquoted key
            exported.replace('"', '\''), // single-quoted keys and strings
            "/* non-JSON comment */" + exported,
            exported.dropLast(1) + ",}", // trailing comma
            exported.dropLast(1) + ",\"version\":1}" // duplicate key
        )
        for (invalid in invalidDocuments) {
            assertNotEquals("Invalid fixture must differ from the valid export", exported, invalid)
            var rejected = false
            try { store.importJson(invalid) } catch (_: Exception) { rejected = true }
            assertTrue("Invalid backup must be rejected", rejected)
            assertArrayEquals(beforeBytes, java.io.File(context.filesDir, "weiter-state.json").readBytes())
            assertEquals(merged, LocalStore(context).read())
        }
    }

    @Test fun sharedTextCreatesOneInboxEntryAndSurvivesActivityRecreation() {
        val text = "Formular prüfen https://example.org/formular"
        val intent = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_SEND)
            .setType("text/plain").putExtra(Intent.EXTRA_TEXT, text).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            assertEquals(text, store.read().entries.single().thought)
            assertEquals(EntryStatus.INBOX, store.read().entries.single().status)
            assertEquals(listOf("https://example.org/formular"), store.read().entries.single().links)
            scenario.recreate()
            assertEquals(1, store.read().entries.size)
            assertEquals(text, store.read().entries.single().thought)
        }
    }

    @Test fun remindersAreActuallyScheduledCancelledAndRestoredAfterBoot() {
        val at = System.currentTimeMillis() + 600_000L
        val entry = Rules.clarify(Rules.newEntry("Arzt anrufen").copy(nextStep = "Praxisnummer wählen", reminderAt = at))
        store.write(AppData(entries = listOf(entry)))
        ReminderScheduler.sync(context, store.read())
        val uri = Uri.parse("weiter://alarm/reminder/${entry.id}")
        assertNotNull(alarmFor(uri))
        assertTrue(context.getSharedPreferences("weiter_alarm_state", Context.MODE_PRIVATE)
            .getStringSet("scheduled", emptySet()).orEmpty().contains(uri.toString()))

        // Remove the OS registration, as reboot does; the persisted user data remains.
        val pending = alarmFor(uri)!!
        context.getSystemService(AlarmManager::class.java).cancel(pending)
        pending.cancel()
        assertNull(alarmFor(uri))
        RestoreRemindersReceiver().onReceive(context, Intent(Intent.ACTION_BOOT_COMPLETED))
        assertNotNull(alarmFor(uri))
        assertEquals(at, LocalStore(context).read().entries.single().reminderAt)

        store.transform { it.copy(entries = it.entries.map { entry -> Rules.complete(entry) }) }
        ReminderScheduler.sync(context, store.read())
        assertNull(alarmFor(uri))
    }

    @Test fun dueReminderClearsOnlyItsReminderAndDoesNotReappearFromStaleEditor() {
        val at = System.currentTimeMillis() - 1000L
        val entry = Rules.newEntry("Private Gedanken bleiben privat").copy(reminderAt = at)
        val stale = AppData(entries = listOf(entry), draft = "Anderer Entwurf")
        store.write(stale)
        val intent = Intent(context, ReminderReceiver::class.java).setAction("de.appshelf.weiter.LOCAL_ALARM")
            .putExtra("kind", "reminder").putExtra("id", entry.id).putExtra("at", at)
        ReminderReceiver().onReceive(context, intent)
        val delivered = store.read()
        assertNull(delivered.entries.single().reminderAt)
        assertEquals(entry.thought, delivered.entries.single().thought)
        assertEquals(stale.draft, delivered.draft)
        assertNull(ReminderScheduler.normalizeDelivered(context, stale).entries.single().reminderAt)
        ReminderReceiver().onReceive(context, intent)
        assertEquals(delivered, store.read())
    }

    @Test fun focusTimerPersistsAndSchedulesAnOfflineAlarm() {
        val entry = Rules.clarify(Rules.newEntry("Kleiner Schritt").copy(nextStep = "Brief öffnen"))
        val timer = TimerState(entry.id, System.currentTimeMillis() + 300_000L, 5)
        store.write(AppData(entries = listOf(entry), timer = timer))
        assertEquals(timer, LocalStore(context).read().timer)
        ReminderScheduler.sync(context, store.read())
        assertNotNull(alarmFor(Uri.parse("weiter://alarm/timer/${entry.id}")))
        assertNull(BackupCodec.decode(store.exportJson(store.read())).timer)
    }

    @Test fun appHasNoNetworkOrLocationPermissionAndStartsWithoutMicrophoneGrant() {
        val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        val permissions = info.requestedPermissions?.toSet().orEmpty()
        assertFalse(Manifest.permission.INTERNET in permissions)
        assertFalse(Manifest.permission.ACCESS_FINE_LOCATION in permissions)
        assertFalse(Manifest.permission.ACCESS_COARSE_LOCATION in permissions)
        assertEquals(PackageManager.PERMISSION_DENIED, context.checkSelfPermission(Manifest.permission.RECORD_AUDIO))
        ActivityScenario.launch(MainActivity::class.java).use {
            val text = Rules.newEntry("Ohne Internet und Mikrofon speichern")
            store.write(AppData(entries = listOf(text)))
            assertEquals(text, LocalStore(context).read().entries.single())
        }
    }

    @Test fun optionalPhotoIsCopiedLocallyAndIncludedInBackupWithoutStorageGrant() {
        val directory = java.io.File(context.cacheDir, "shared-attachments").apply { mkdirs() }
        val file = java.io.File(directory, "instrumentation-photo.png")
        val bitmap = android.graphics.Bitmap.createBitmap(24, 18, android.graphics.Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(android.graphics.Color.rgb(20, 120, 100))
        file.outputStream().use { assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)) }
        bitmap.recycle()
        try {
            val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.files", file)
            val photo = AttachmentTools.readPhoto(context, uri)
            assertEquals("image/jpeg", photo.mime)
            assertFalse(photo.base64.isBlank())
            val decoded = android.util.Base64.decode(photo.base64, android.util.Base64.NO_WRAP)
            val copied = requireNotNull(android.graphics.BitmapFactory.decodeByteArray(decoded, 0, decoded.size))
            assertEquals(24, copied.width)
            copied.recycle()
            val entry = Rules.newEntry("Foto vom Formular").copy(attachments = listOf(photo))
            store.write(AppData(entries = listOf(entry)))
            file.delete()
            val backup = BackupCodec.decode(store.exportJson(store.read()))
            assertEquals(photo, backup.entries.single().attachments.single())
            assertEquals(PackageManager.PERMISSION_DENIED,
                context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE))
        } finally { file.delete() }
    }

    private fun alarmFor(uri: Uri): PendingIntent? = PendingIntent.getBroadcast(context, 1,
        Intent(context, ReminderReceiver::class.java).setAction("de.appshelf.weiter.LOCAL_ALARM").setData(uri),
        PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
}
