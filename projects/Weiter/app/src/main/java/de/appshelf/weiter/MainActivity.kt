package de.appshelf.weiter

import android.Manifest
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import java.io.File
import java.util.concurrent.Executors

/** The activity routes only explicit user actions to Android pickers and permissions. */
class MainActivity : ComponentActivity() {
    private lateinit var store: LocalStore
    private var data by mutableStateOf(AppData())
    private var message by mutableStateOf<String?>(null)
    private var fatalError by mutableStateOf(false)
    private var notificationPermission by mutableStateOf(false)
    private var recording by mutableStateOf(false)
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private var photoEntry: String? = null
    private var recordingEntry: String? = null
    private var pendingRecord: String? = null
    private val io = Executors.newSingleThreadExecutor()
    private var listening = false
    private val changed = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) { reload() }
    }

    private val notifyPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        notificationPermission = ReminderScheduler.permissionGranted(this)
        ReminderScheduler.sync(this, data)
        message = if (it) "Benachrichtigungen sind aktiviert." else "Deine Aufgaben bleiben nutzbar. Benachrichtigungen kannst du später in Android aktivieren."
    }
    private val microphonePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val id = pendingRecord
        pendingRecord = null
        if (granted && id != null) startRecording(id)
        else message = "Ohne Mikrofonfreigabe kannst du Gedanken weiterhin als Text oder Foto festhalten."
    }
    private val photoPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val id = photoEntry
        photoEntry = null
        if (uri != null && id != null) {
            runIo("Das Foto konnte nicht übernommen werden.") {
                val attachment = AttachmentTools.readPhoto(this, uri)
                addAttachment(id, attachment)
            }
        }
    }
    private val exportPicker = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) runIo("Die Sicherung konnte nicht geschrieben werden. Bitte wähle eine beschreibbare Datei.") {
            val json = store.exportJson(store.read())
            contentResolver.openOutputStream(uri, "wt")?.use { it.write(json.toByteArray(Charsets.UTF_8)) }
                ?: error("No output")
            runOnUiThread { message = "JSON-Sicherung gespeichert. Sie enthält auch deine Anhänge. Bewahre sie privat auf." }
        }
    }
    private val importPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runIo("Keine Daten importiert. Die Datei ist ungültig, zu groß oder konnte nicht gelesen werden.") {
            val bytes = contentResolver.openInputStream(uri)?.use { it.readBytesLimited(24 * 1024 * 1024) }
                ?: error("No input")
            val text = Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString()
            store.importJson(text)
            sendBroadcast(Intent(DATA_CHANGED).setPackage(packageName))
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                data = store.read()
                ReminderScheduler.sync(this, data)
                message = "Sicherung hinzugefügt. Vorhandene Einträge wurden beibehalten; gleiche IDs nicht doppelt angelegt."
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = LocalStore(applicationContext)
        photoEntry = savedInstanceState?.getString("photoEntry")
        pendingRecord = savedInstanceState?.getString("pendingRecord")
        reload()
        if (savedInstanceState == null && !fatalError) receiveShare(intent)
        setContent {
            if (fatalError) {
                MaterialTheme {
                    AlertDialog(onDismissRequest = {}, title = { Text("Daten konnten nicht geöffnet werden") },
                        text = { Text("Weiter hat deine Datei nicht ersetzt. Schließe die App und versuche es erneut. Deine vorhandenen Daten bleiben erhalten.") },
                        confirmButton = { Button(onClick = { reload() }) { Text("Erneut versuchen") } })
                }
            } else {
                WeiterApp(data = data, onChange = ::save,
                    onExport = { launchPicker { exportPicker.launch("Weiter-${Rules.today()}.json") } },
                    onImport = { launchPicker { importPicker.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) } },
                    onPhoto = { id -> photoEntry = id; launchPicker { photoPicker.launch(arrayOf("image/*")) } },
                    onRecord = ::requestRecording,
                    onOpenAttachment = { attachment ->
                        try { AttachmentTools.open(this, attachment) }
                        catch (_: Exception) { message = "Für diesen Anhang ist keine passende App verfügbar." }
                    },
                    onReminderPermission = {
                        if (Build.VERSION.SDK_INT >= 33 && !ReminderScheduler.permissionGranted(this)) notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        else startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName))
                    }, notificationPermission = notificationPermission,
                    message = message, onMessageDismiss = { message = null })
                if (recording) MaterialTheme {
                    AlertDialog(onDismissRequest = { finishRecording(true) },
                        title = { Text("Sprachnotiz aufnehmen") },
                        text = { Text("Die Aufnahme bleibt auf deinem Gerät. Beim Verlassen wird sie gespeichert. Maximal 3 Minuten.") },
                        confirmButton = { Button(onClick = { finishRecording(true) }) { Text("Aufnahme speichern") } },
                        dismissButton = { Button(onClick = { finishRecording(false) }) { Text("Verwerfen") } })
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (!fatalError) receiveShare(intent)
    }

    override fun onResume() {
        super.onResume()
        if (!listening) {
            ContextCompat.registerReceiver(this, changed, IntentFilter(DATA_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
            listening = true
        }
        if (::store.isInitialized) reload()
    }

    override fun onPause() {
        if (recording) finishRecording(true)
        if (listening) { unregisterReceiver(changed); listening = false }
        super.onPause()
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("photoEntry", photoEntry)
        outState.putString("pendingRecord", pendingRecord)
        super.onSaveInstanceState(outState)
    }

    private fun reload() {
        try {
            data = store.read()
            fatalError = false
            notificationPermission = ReminderScheduler.permissionGranted(this)
            ReminderScheduler.sync(this, data)
        } catch (_: Exception) { fatalError = true }
    }

    private fun save(previous: AppData, next: AppData) {
        try {
            val before = previous.entries.associateBy { it.id }
            val after = next.entries.associateBy { it.id }
            data = store.transform { current ->
                val merged = current.entries.map { entry ->
                    val candidate = after[entry.id]
                    if (candidate != null && before[entry.id] != null) patchEntry(entry, before.getValue(entry.id), candidate) else entry
                } + next.entries.filter { it.id !in before && current.entries.none { currentEntry -> currentEntry.id == it.id } }
                ReminderScheduler.normalizeDelivered(this, current.copy(entries = merged,
                    draft = if (next.draft != previous.draft) next.draft else current.draft,
                    timer = if (next.timer != previous.timer) next.timer else current.timer))
            }
            if (alarmSignature(previous) != alarmSignature(data)) ReminderScheduler.sync(this, data)
        } catch (_: Exception) {
            message = "Nicht gespeichert: Bitte prüfe freien Speicher und Eingaben. Deine zuletzt gespeicherten Daten sind erhalten."
        }
    }

    private fun alarmSignature(value: AppData): Pair<List<Pair<String, Long?>>, TimerState?> =
        value.entries.filter { it.status != EntryStatus.DONE && it.status != EntryStatus.TRASH }
            .map { it.id to it.reminderAt } to value.timer

    private fun receiveShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("text/") != true || intent.getBooleanExtra("weiter-share-consumed", false)) return
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim().orEmpty()
        if (text.isEmpty()) { message = "Der geteilte Text ist leer."; return }
        if (text.length > 10_000) { message = "Der geteilte Text ist zu lang. Bitte teile höchstens 10.000 Zeichen."; return }
        try {
            val current = store.read()
            val entry = Rules.newEntry(text)
            save(current, current.copy(entries = current.entries + entry))
            if (data.entries.any { it.id == entry.id }) {
                // Do not mutate the caller's launch Intent while Android is matching it.
                setIntent(Intent(intent).apply {
                    removeExtra(Intent.EXTRA_TEXT)
                    putExtra("weiter-share-consumed", true)
                })
                message = "Geteilter Text wurde in der Inbox gespeichert."
            }
        } catch (_: Exception) { message = "Der geteilte Text konnte nicht gespeichert werden." }
    }

    private fun addAttachment(id: String, attachment: Attachment) {
        try {
            store.transform { current ->
                val target = current.entries.firstOrNull { it.id == id } ?: return@transform current
                require(target.attachments.size < 8)
                current.copy(entries = current.entries.map {
                    if (it.id == id) it.copy(attachments = it.attachments + attachment, updatedAt = System.currentTimeMillis()) else it
                })
            }
            sendBroadcast(Intent(DATA_CHANGED).setPackage(packageName))
            runOnUiThread { if (!isDestroyed) { reload(); message = "Anhang lokal gespeichert." } }
        } catch (_: Exception) { runOnUiThread { if (!isDestroyed) message = "Der Anhang konnte nicht gespeichert werden. Bis zu acht Anhänge pro Eintrag sind möglich. Deine Texte bleiben erhalten." } }
    }

    private fun requestRecording(id: String) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startRecording(id)
        else { pendingRecord = id; microphonePermission.launch(Manifest.permission.RECORD_AUDIO) }
    }

    private fun startRecording(id: String) {
        try {
            recordingEntry = id
            recordingFile = File.createTempFile("voice-", ".m4a", cacheDir)
            recorder = AttachmentTools.createRecorder(this, recordingFile!!)
            recorder!!.start()
            recorder!!.setOnInfoListener { _, what, _ ->
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) runOnUiThread { finishRecording(true) }
            }
            recording = true
        } catch (_: Exception) {
            recorder?.release(); recorder = null
            recordingFile?.delete(); recordingFile = null
            message = "Aufnahme nicht möglich. Du kannst weiterhin Text und Fotos verwenden."
        }
    }

    private fun finishRecording(keep: Boolean) {
        if (!recording) return
        recording = false
        val file = recordingFile
        val id = recordingEntry
        try {
            recorder?.stop()
            if (keep && file != null && id != null) addAttachment(id, AttachmentTools.readAudio(file))
        } catch (_: Exception) { message = "Die Aufnahme war zu kurz oder konnte nicht gespeichert werden. Bitte versuche es erneut." }
        finally { recorder?.release(); recorder = null; file?.delete(); recordingFile = null; recordingEntry = null }
    }

    private fun runIo(failure: String, action: () -> Unit) {
        io.execute {
            try { action() }
            catch (_: Exception) { runOnUiThread { if (!isDestroyed) message = failure } }
        }
    }

    private fun launchPicker(action: () -> Unit) {
        try { action() }
        catch (_: android.content.ActivityNotFoundException) {
            message = "Die Android-Dateiauswahl ist auf diesem Gerät nicht verfügbar. Deine Daten bleiben gespeichert."
        }
    }

    companion object { private const val DATA_CHANGED = "de.appshelf.weiter.DATA_CHANGED" }
}

/** Apply only edited fields; an alarm or asynchronous attachment must not lose concurrent data. */
internal fun patchEntry(current: Entry, old: Entry, next: Entry): Entry = current.copy(
    thought = if (old.thought != next.thought) next.thought else current.thought,
    nextStep = if (old.nextStep != next.nextStep) next.nextStep else current.nextStep,
    notes = if (old.notes != next.notes) next.notes else current.notes,
    status = if (old.status != next.status) next.status else current.status,
    place = if (old.place != next.place) next.place else current.place,
    minutes = if (old.minutes != next.minutes) next.minutes else current.minutes,
    dueDate = if (old.dueDate != next.dueDate) next.dueDate else current.dueDate,
    reminderAt = if (old.reminderAt != next.reminderAt) next.reminderAt else current.reminderAt,
    updatedAt = maxOf(current.updatedAt, next.updatedAt),
    completedDate = if (old.completedDate != next.completedDate) next.completedDate else current.completedDate,
    previousStatus = if (old.previousStatus != next.previousStatus) next.previousStatus else current.previousStatus,
    attachments = current.attachments.filter { attachment -> old.attachments.none { it.id == attachment.id } || next.attachments.any { it.id == attachment.id } } +
        next.attachments.filter { attachment -> old.attachments.none { it.id == attachment.id } && current.attachments.none { it.id == attachment.id } },
    links = if (old.links != next.links) next.links else current.links
)

private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
        val n = read(buffer)
        if (n < 0) return out.toByteArray()
        require(out.size() + n <= limit)
        out.write(buffer, 0, n)
    }
}
