package de.appshelf.weiter

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DayFormat = DateTimeFormatter.ofPattern("EEE, d. MMM", Locale.GERMAN)
private val TimeFormat = DateTimeFormatter.ofPattern("HH:mm", Locale.GERMAN)
private fun localTime(epoch: Long) = Instant.ofEpochMilli(epoch).atZone(ZoneId.systemDefault())
private fun dateLabel(date: String?): String = when (date) {
    null -> "Ohne Datum"
    Rules.today() -> "Heute"
    LocalDate.now().plusDays(1).toString() -> "Morgen"
    else -> runCatching { LocalDate.parse(date).format(DayFormat) }.getOrDefault(date)
}
private fun Place.label() = when (this) { Place.HOME -> "Zuhause"; Place.OUTSIDE -> "Unterwegs"; Place.ONLINE -> "Online"; Place.WAITING -> "Warten auf" }
private fun EntryStatus.label() = when (this) { EntryStatus.INBOX -> "Inbox"; EntryStatus.TODAY -> "Heute"; EntryStatus.PARKED -> "Parkplatz"; EntryStatus.DONE -> "Erledigt"; EntryStatus.TRASH -> "Papierkorb" }
private fun Entry.title() = nextStep.ifBlank { thought.ifBlank { "Unbenannter Gedanke" } }
private fun Entry.changed() = copy(updatedAt = System.currentTimeMillis())
private fun reminderTime(offset: Long): Long {
    val day = LocalDate.now().plusDays(offset)
    val chosen = if (offset == 0L) {
        val soon = LocalDateTime.now().plusMinutes(10)
        if (soon.toLocalDate() == day) soon else day.atTime(23, 59, 59)
    } else day.atTime(9, 0)
    return chosen.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
}

@Composable
private fun WeiterTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) darkColorScheme(
        primary = Color(0xFFA0D7C2), onPrimary = Color(0xFF073D32), primaryContainer = Color(0xFF254C40), onPrimaryContainer = Color(0xFFD5F5E6),
        secondary = Color(0xFFBACDC1), background = Color(0xFF111D19), onBackground = Color(0xFFE8EEE6),
        surface = Color(0xFF17251F), onSurface = Color(0xFFE8EEE6), surfaceVariant = Color(0xFF304039), onSurfaceVariant = Color(0xFFCAD6CD),
        outline = Color(0xFF8D9F93), error = Color(0xFFFFB4AB)
    ) else lightColorScheme(
        primary = Color(0xFF155E49), onPrimary = Color.White, primaryContainer = Color(0xFFD9ECDD), onPrimaryContainer = Color(0xFF123D2F),
        secondary = Color(0xFF4B6357), background = Color(0xFFF6F3EB), onBackground = Color(0xFF1D2C24),
        surface = Color(0xFFFFFDF7), onSurface = Color(0xFF1D2C24), surfaceVariant = Color(0xFFE6EADF), onSurfaceVariant = Color(0xFF43564A),
        outline = Color(0xFF77897C), error = Color(0xFFAA302B)
    )
    MaterialTheme(colorScheme = colors, typography = Typography(
        headlineLarge = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 34.sp, lineHeight = 39.sp, fontWeight = FontWeight.Bold),
        headlineMedium = androidx.compose.ui.text.TextStyle(fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold),
        titleLarge = androidx.compose.ui.text.TextStyle(fontSize = 23.sp, lineHeight = 29.sp, fontWeight = FontWeight.SemiBold),
        titleMedium = androidx.compose.ui.text.TextStyle(fontSize = 19.sp, lineHeight = 25.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = androidx.compose.ui.text.TextStyle(fontSize = 17.sp, lineHeight = 25.sp),
        bodyMedium = androidx.compose.ui.text.TextStyle(fontSize = 16.sp, lineHeight = 23.sp),
        labelLarge = androidx.compose.ui.text.TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
        labelMedium = androidx.compose.ui.text.TextStyle(fontSize = 14.sp, lineHeight = 19.sp, fontWeight = FontWeight.Medium),
        labelSmall = androidx.compose.ui.text.TextStyle(fontSize = 12.sp, lineHeight = 17.sp, fontWeight = FontWeight.Medium)
    ), content = content)
}

@Composable
fun WeiterApp(
    data: AppData,
    onChange: (AppData, AppData) -> Unit,
    onExport: () -> Unit,
    onImport: () -> Unit,
    onPhoto: (String) -> Unit,
    onRecord: (String) -> Unit,
    onOpenAttachment: (Attachment) -> Unit,
    onReminderPermission: () -> Unit,
    notificationPermission: Boolean,
    message: String?,
    onMessageDismiss: () -> Unit
) {
    WeiterTheme {
        var tab by rememberSaveable { mutableStateOf("Heute") }
        var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
        var capture by rememberSaveable { mutableStateOf(false) }
        var undoId by rememberSaveable { mutableStateOf<String?>(null) }
        var timerId by rememberSaveable { mutableStateOf<String?>(null) }
        var currentDay by remember { mutableStateOf(Rules.today()) }
        LaunchedEffect(Unit) { while (true) { delay(30_000); currentDay = Rules.today() } }
        val todayKey = currentDay
        val snackbar = remember { SnackbarHostState() }
        val scope = rememberCoroutineScope()
        var deletionSnackbarJob by remember { mutableStateOf<Job?>(null) }
        val currentData by rememberUpdatedState(data)
        val currentChange by rememberUpdatedState(onChange)
        val entry = data.entries.firstOrNull { it.id == selectedId }
        fun updateFrom(base: Entry, next: Entry) {
            // Event handlers can still capture the previously rendered entry. Only
            // fields deliberately edited by that handler may replace newer values.
            val entries = currentData.entries.map { current ->
                if (current.id == base.id) patchEntry(current, base, next).changed() else current
            }
            val updated = entries.find { it.id == base.id }
            val timer = currentData.timer.takeUnless {
                it?.entryId == base.id && updated?.status in listOf(EntryStatus.DONE, EntryStatus.TRASH)
            }
            currentChange(currentData, currentData.copy(entries = entries, timer = timer))
        }
        fun remove(entry: Entry) {
            updateFrom(entry, Rules.trash(entry))
            undoId = entry.id
            selectedId = null
            deletionSnackbarJob?.cancel()
            deletionSnackbarJob = scope.launch {
                val result = snackbar.showSnackbar("In den Papierkorb verschoben", "Rückgängig", duration = SnackbarDuration.Long)
                if (result == SnackbarResult.ActionPerformed) {
                    currentData.entries.find { it.id == entry.id && it.status == EntryStatus.TRASH }?.let { updateFrom(it, Rules.restore(it)) }
                    if (undoId == entry.id) undoId = null
                }
            }
        }
        LaunchedEffect(message) {
            if (message != null) { snackbar.showSnackbar(message, duration = SnackbarDuration.Long); onMessageDismiss() }
        }
        BackHandler(enabled = entry != null || capture || timerId != null) {
            when { timerId != null -> timerId = null; capture -> capture = false; else -> selectedId = null }
        }
        Scaffold(
            modifier = Modifier.imePadding(),
            containerColor = MaterialTheme.colorScheme.background,
            snackbarHost = { SnackbarHost(snackbar) },
            topBar = {
                Surface(color = MaterialTheme.colorScheme.background) {
                    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 18.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (entry != null) {
                            TextButton(onClick = { selectedId = null }, modifier = Modifier.heightIn(min = 48.dp).testTag("editor_back")) { Text("‹ Zurück") }
                            Spacer(Modifier.weight(1f))
                            Text("Wird lokal gespeichert", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            WayMark()
                            Spacer(Modifier.width(10.dp))
                            Text("Weiter", style = MaterialTheme.typography.titleLarge)
                            Spacer(Modifier.weight(1f))
                            Text("Lokal · ohne Konto", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            },
            bottomBar = {
                if (entry == null) Column {
                    if (tab !in listOf("Mehr", "Erledigt", "Papierkorb")) Surface(color = MaterialTheme.colorScheme.background) {
                        Button(onClick = { capture = true }, modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp).heightIn(min = 56.dp).testTag("capture_open")) {
                            Text("＋ Gedanken festhalten")
                        }
                    }
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                        listOf("Heute", "Inbox", "Parkplatz", "Mehr").forEachIndexed { index, name ->
                            NavigationBarItem(selected = tab == name || (name == "Mehr" && tab in listOf("Erledigt", "Papierkorb")), onClick = { tab = name },
                                modifier = Modifier.testTag("nav_${listOf("today", "inbox", "parked", "more")[index]}"),
                                icon = { Text(listOf("✓", "+", "⌁", "···")[index], fontSize = 22.sp, modifier = Modifier.clearAndSetSemantics { }) },
                                label = { Text(name, maxLines = 2, overflow = TextOverflow.Ellipsis) })
                        }
                    }
                }
            }
        ) { padding ->
            if (entry != null) {
                EntryEditor(entry, { next -> updateFrom(entry, next) }, onDone = { updateFrom(entry, Rules.complete(entry)); selectedId = null },
                    onDelete = { remove(entry) }, onPhoto = { onPhoto(entry.id) }, onRecord = { onRecord(entry.id) },
                    onOpenAttachment = onOpenAttachment, onTimer = { timerId = entry.id }, onReminderPermission = onReminderPermission,
                    notificationPermission = notificationPermission, modifier = Modifier.padding(padding))
            } else {
                val today = Rules.todayEntries(data, todayKey)
                val doneToday = data.entries.count { it.status == EntryStatus.DONE && it.completedDate == todayKey }
                LazyColumn(Modifier.fillMaxSize().padding(padding).testTag("main_list"), contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 10.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    item {
                        Text(if (tab == "Heute") LocalDate.parse(todayKey).format(DayFormat).uppercase(Locale.GERMAN) else "DEIN RAUM FÜR GEDANKEN", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(6.dp))
                        Text(when (tab) { "Heute" -> "Ein Schritt\nnach dem anderen."; "Inbox" -> "Erst festhalten.\nDann klar machen."; "Parkplatz" -> "Später hat\nseinen Platz."; "Erledigt" -> "Das hast du geschafft."; "Papierkorb" -> "Nichts geht verloren."; else -> "Deine Daten.\nDein Tempo." }, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
                    }
                    if (data.timer != null) item { TimerBanner(data.timer, data.entries.find { it.id == data.timer.entryId }?.title() ?: "Dein Fokus", onStop = { onChange(currentData, currentData.copy(timer = null)) }) }
                    if (undoId != null && data.entries.any { it.id == undoId && it.status == EntryStatus.TRASH }) item {
                        OutlinedCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text("Zuletzt gelöscht", style = MaterialTheme.typography.labelLarge)
                                TextButton(onClick = {
                                    // The persistent undo and snackbar are the same action.
                                    // Cancel an active or queued deletion notice so it cannot
                                    // obscure task actions after the entry was restored.
                                    deletionSnackbarJob?.cancel()
                                    deletionSnackbarJob = null
                                    snackbar.currentSnackbarData?.takeIf { it.visuals.message == "In den Papierkorb verschoben" }?.dismiss()
                                    currentData.entries.find { it.id == undoId && it.status == EntryStatus.TRASH }?.let { updateFrom(it, Rules.restore(it)) }
                                    undoId = null
                                }, modifier = Modifier.testTag("undo_delete")) { Text("Löschen rückgängig machen") }
                            }
                        }
                    }
                    when (tab) {
                        "Heute" -> {
                            item {
                                Text("Aus einem Gedanken wird der nächste machbare Schritt.", style = MaterialTheme.typography.bodyLarge)
                                Spacer(Modifier.height(14.dp))
                                ProgressCard(doneToday, today.size)
                            }
                            if (today.isEmpty()) item { EmptyCard("Was steht dir im Kopf?", "Paket zurückschicken, Arzt anrufen oder ein Formular ausfüllen: Halte den Gedanken fest. In der Inbox machst du daraus einen kleinen nächsten Schritt.") }
                            if (today.isNotEmpty()) {
                                item { SectionLabel("Deine nächsten drei", "Klein anfangen ist genug.") }
                                items(today.take(3), key = { it.id }) { task -> EntryCard(task, { selectedId = task.id }, { updateFrom(task, Rules.complete(task)) }, { timerId = task.id }) }
                                if (today.size > 3) {
                                    item { SectionLabel("Weitere offene Schritte", "Alles bleibt sichtbar. Du musst nicht alles heute schaffen.") }
                                    items(today.drop(3), key = { it.id }) { task -> EntryCard(task, { selectedId = task.id }, { updateFrom(task, Rules.complete(task)) }, { timerId = task.id }) }
                                }
                            }
                            val inboxCount = data.entries.count { it.status == EntryStatus.INBOX }
                            if (inboxCount > 0) item {
                                OutlinedButton(onClick = { tab = "Inbox" }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("$inboxCount ${if (inboxCount == 1) "Gedanke wartet" else "Gedanken warten"} in der Inbox") }
                            }
                        }
                        "Inbox" -> {
                            item { Text("Hier darf es ungeordnet sein. Öffne einen Gedanken und frage dich: Was kann ich als Nächstes wirklich tun?", style = MaterialTheme.typography.bodyLarge) }
                            val inbox = data.entries.filter { it.status == EntryStatus.INBOX }.sortedByDescending { it.createdAt }
                            if (inbox.isEmpty()) item { EmptyCard("Dein Kopf darf leichter werden.", "Nutze „Gedanken festhalten“ oder teile Text aus WhatsApp, Browser oder Notizen mit Weiter. Er landet hier – komplett lokal.") }
                            items(inbox, key = { it.id }) { task -> EntryCard(task, { selectedId = task.id }, { updateFrom(task, Rules.complete(task)) }, { timerId = task.id }) }
                        }
                        "Parkplatz" -> {
                            item { Text("Ideen und Aufgaben, die später dran sind. Datierte Schritte erscheinen am passenden Tag in Heute. Es wird nichts automatisch gelöscht.", style = MaterialTheme.typography.bodyLarge) }
                            val parked = Rules.parkedEntries(data, todayKey)
                            if (parked.isEmpty()) item { EmptyCard("Platz für später.", "Öffne eine Aufgabe und wähle Morgen, Nächste Woche oder Ohne Datum. So bleibt Heute überschaubar.") }
                            items(parked, key = { it.id }) { task ->
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    EntryCard(task, { selectedId = task.id }, { updateFrom(task, Rules.complete(task)) }, { timerId = task.id })
                                    QuickParkRow(task, { next -> updateFrom(task, next) }, onDelete = { remove(task) })
                                }
                            }
                        }
                        "Erledigt" -> {
                            item { Text("Erledigte Schritte bleiben erhalten. Du kannst sie jederzeit wieder öffnen.", style = MaterialTheme.typography.bodyLarge) }
                            val completed = data.entries.filter { it.status == EntryStatus.DONE }.sortedByDescending { it.updatedAt }
                            if (completed.isEmpty()) item { EmptyCard("Dein erster Haken kommt noch.", "Markiere einen Schritt als erledigt. Er wird hier aufbewahrt.") }
                            items(completed, key = { it.id }) { task ->
                                OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                                    Text(task.title(), style = MaterialTheme.typography.titleMedium)
                                    Text("Erledigt${task.completedDate?.let { " · ${dateLabel(it)}" } ?: ""}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    ActionFlow(listOf("Öffnen" to { selectedId = task.id }, "Wieder öffnen" to { updateFrom(task, Rules.reopen(task)) }, "Löschen" to { remove(task) }))
                                } }
                            }
                        }
                        "Papierkorb" -> {
                            item { Text("Gelöschte Einträge bleiben hier, bis du sie wiederherstellst. Weiter löscht sie niemals automatisch.", style = MaterialTheme.typography.bodyLarge) }
                            val trash = data.entries.filter { it.status == EntryStatus.TRASH }.sortedByDescending { it.updatedAt }
                            if (trash.isEmpty()) item { EmptyCard("Der Papierkorb ist leer.", "Wenn du etwas löschst, kannst du es hier wiederherstellen.") }
                            items(trash, key = { it.id }) { task ->
                                OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                                    Text(task.title(), style = MaterialTheme.typography.titleMedium)
                                    Button(onClick = { updateFrom(task, Rules.restore(task)) }, modifier = Modifier.heightIn(min = 48.dp).testTag("restore_${task.id}")) { Text("Wiederherstellen") }
                                } }
                            }
                        }
                        else -> {
                            item { SectionLabel("Aufbewahrt", "Deine Einträge bleiben bei dir.") }
                            item { OutlinedButton(onClick = { tab = "Erledigt" }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("open_done")) { Text("Erledigt (${data.entries.count { it.status == EntryStatus.DONE }})") } }
                            item { OutlinedButton(onClick = { tab = "Papierkorb" }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("open_trash")) { Text("Papierkorb (${data.entries.count { it.status == EntryStatus.TRASH }})") } }
                            item { SectionLabel("Lokale Sicherung", "Du entscheidest, wo die Datei liegt.") }
                            item {
                                OutlinedCard { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Text("Eine JSON-Datei enthält deine Gedanken, Schritte, Notizen und Anhänge. Bewahre sie an einem Ort auf, dem du vertraust. Die Datei ist nicht verschlüsselt.")
                                    Button(onClick = onExport, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("backup_export")) { Text("Sicherung exportieren") }
                                    OutlinedButton(onClick = onImport, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("backup_import")) { Text("Sicherung importieren") }
                                    Text("Ein Import ergänzt neue Einträge. Vorhandene IDs bleiben erhalten; ungültige Dateien verändern deine Daten nicht. Ein laufender Timer wird nicht übertragen.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                } }
                            }
                            item { SectionLabel("Erinnerungen", "Optional und lokal auf diesem Gerät.") }
                            item { PermissionCard(notificationPermission, onReminderPermission) }
                            item { SectionLabel("Über Weiter", "Version 1.0.0") }
                            item { Text("Weiter ist ein unabhängiges persönliches Projekt. Die Grundfunktion läuft offline, lokal und ohne Benutzerkonto oder Backend. Keine Werbung, kein Tracking und keine externe KI.\n\nEs handelt sich nicht um eine offizielle Store-App. Die APK wird außerhalb des Play Stores verteilt. Fotos wählst du selbst aus; das Mikrofon wird nur für eine freiwillige Sprachnotiz angefragt. Texteingabe funktioniert auch ohne diese Berechtigung.\n\nErinnerungen und Timer nutzen lokale Android-Alarme. Android kann Benachrichtigungen im Energiesparmodus verzögern; nach einem erzwungenen Stopp muss Weiter wieder geöffnet werden.", style = MaterialTheme.typography.bodyMedium) }
                        }
                    }
                }
            }
        }
        if (capture) CaptureDialog(data.draft, onDraft = { onChange(currentData, currentData.copy(draft = it.take(10000))) }, onDismiss = { capture = false }, onSave = {
            if (currentData.draft.isNotBlank()) {
                val created = Rules.newEntry(currentData.draft.trim())
                onChange(currentData, currentData.copy(entries = currentData.entries + created, draft = ""))
                capture = false
                tab = "Inbox"
            }
        })
        timerId?.let { id ->
            val task = data.entries.find { it.id == id }
            if (task != null) TimerDialog(task, onDismiss = { timerId = null }, onStart = { minutes ->
                onChange(currentData, currentData.copy(timer = TimerState(id, System.currentTimeMillis() + minutes * 60_000L, minutes)))
                timerId = null
            }) else timerId = null
        }
    }
}

@Composable
private fun WayMark() {
    val mark = MaterialTheme.colorScheme.primary
    val ink = MaterialTheme.colorScheme.onPrimary
    Canvas(Modifier.size(37.dp).clip(RoundedCornerShape(12.dp)).background(mark).clearAndSetSemantics { }) {
        val p = Path().apply { moveTo(size.width * .27f, size.height * .73f); lineTo(size.width * .27f, size.height * .46f); quadraticTo(size.width * .27f, size.height * .30f, size.width * .44f, size.height * .30f); lineTo(size.width * .72f, size.height * .30f); moveTo(size.width * .55f, size.height * .16f); lineTo(size.width * .72f, size.height * .30f); lineTo(size.width * .55f, size.height * .46f) }
        drawPath(p, ink, style = androidx.compose.ui.graphics.drawscope.Stroke(width = size.width * .065f, cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
    }
}

@Composable
private fun SectionLabel(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EmptyCard(title: String, body: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(22.dp)) {
        Column(Modifier.fillMaxWidth().padding(22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(body, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun ProgressCard(done: Int, open: Int) {
    val total = done + open
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Dein Tag", style = MaterialTheme.typography.labelLarge)
                Text("$done erledigt · $open offen", style = MaterialTheme.typography.labelMedium)
            }
            LinearProgressIndicator(progress = { if (total == 0) 0f else done.toFloat() / total }, modifier = Modifier.fillMaxWidth().height(7.dp).clip(CircleShape).semantics { contentDescription = "$done von $total heutigen Schritten erledigt" })
            Text(if (done > 0) "Jeder erledigte Schritt zählt." else "Ein kleiner Anfang reicht.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun EntryCard(entry: Entry, onOpen: () -> Unit, onDone: () -> Unit, onTimer: () -> Unit) {
    Card(Modifier.fillMaxWidth().testTag("entry_${entry.id}"), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(entry.title(), style = MaterialTheme.typography.titleMedium, maxLines = 4, overflow = TextOverflow.Ellipsis, modifier = Modifier.fillMaxWidth().clickable(onClickLabel = "Eintrag öffnen", onClick = onOpen).padding(vertical = 6.dp).testTag("entry_open_${entry.id}"))
            Text(if (entry.status == EntryStatus.INBOX) "Noch ungeklärt · Inbox" else "${entry.minutes} Min. · ${entry.place.label()} · ${dateLabel(entry.dueDate ?: if (entry.status == EntryStatus.TODAY) Rules.today() else null)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (entry.attachments.isNotEmpty() || entry.reminderAt != null) Text(listOfNotNull(if (entry.attachments.isNotEmpty()) "${entry.attachments.size} Anhänge" else null, entry.reminderAt?.let { "Erinnerung ${dateLabel(localTime(it).toLocalDate().toString())}, ${localTime(it).format(TimeFormat)}" }).joinToString(" · "), style = MaterialTheme.typography.labelSmall)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onOpen, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text(if (entry.status == EntryStatus.INBOX) "Klar machen" else "Öffnen") }
                TextButton(onClick = onDone, modifier = Modifier.heightIn(min = 48.dp).testTag("complete_${entry.id}")) { Text("✓ Erledigt") }
            }
            if (entry.status != EntryStatus.INBOX) TextButton(onClick = onTimer, modifier = Modifier.heightIn(min = 48.dp)) { Text("Fokus starten") }
        }
    }
}

@Composable
private fun CaptureDialog(draft: String, onDraft: (String) -> Unit, onDismiss: () -> Unit, onSave: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Was geht dir durch den Kopf?") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Nur festhalten. Den nächsten Schritt machst du später klar.")
            OutlinedTextField(value = draft, onValueChange = onDraft, label = { Text("Dein Gedanke") }, placeholder = { Text("Zum Beispiel: Paket zurückschicken") }, minLines = 3, maxLines = 7, modifier = Modifier.fillMaxWidth().testTag("capture_text"))
            Text("Dein Entwurf bleibt beim Zurückgehen erhalten.", style = MaterialTheme.typography.labelSmall)
        }
    }, confirmButton = { Button(onClick = onSave, enabled = draft.isNotBlank(), modifier = Modifier.testTag("capture_save")) { Text("In Inbox speichern") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Später weiterschreiben") } })
}

@Composable
private fun PermissionCard(granted: Boolean, onRequest: () -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (granted) "Benachrichtigungen sind erlaubt." else "Benachrichtigungen sind derzeit nicht erlaubt.", style = MaterialTheme.typography.bodyLarge)
            Text("Texteingabe, Aufgaben und Timeransicht funktionieren auch ohne Benachrichtigungen. Erinnerungen kannst du weiterhin speichern. Android kann Alarme verzögern.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = onRequest, modifier = Modifier.heightIn(min = 48.dp).testTag("notification_permission")) { Text(if (granted) "Benachrichtigungen verwalten" else "Benachrichtigungen erlauben") }
        }
    }
}

@Composable
private fun ActionFlow(actions: List<Pair<String, () -> Unit>>) {
    Column {
        actions.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (label, action) -> TextButton(onClick = action, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text(label) } }
            }
        }
    }
}

@Composable
private fun QuickParkRow(entry: Entry, onUpdate: (Entry) -> Unit, onDelete: () -> Unit) {
    val actions = listOf(
        Triple("Heute", "today") { onUpdate(entry.copy(status = EntryStatus.TODAY, dueDate = Rules.today(), completedDate = null).changed()) },
        Triple("Morgen", "tomorrow") { onUpdate(Rules.park(entry, LocalDate.now().plusDays(1).toString())) },
        Triple("Nächste Woche", "week") { onUpdate(Rules.park(entry, LocalDate.now().plusWeeks(1).toString())) },
        Triple("Ohne Datum", "undated") { onUpdate(Rules.park(entry, null)) }
    )
    Column {
        actions.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (label, tag, action) -> TextButton(onClick = action, modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("park_${tag}_${entry.id}")) { Text(label) } }
            }
        }
        TextButton(onClick = onDelete, modifier = Modifier.heightIn(min = 48.dp).testTag("delete_${entry.id}")) { Text("Löschen", color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun EntryEditor(
    entry: Entry, onUpdate: (Entry) -> Unit, onDone: () -> Unit, onDelete: () -> Unit,
    onPhoto: () -> Unit, onRecord: () -> Unit, onOpenAttachment: (Attachment) -> Unit,
    onTimer: () -> Unit, onReminderPermission: () -> Unit, notificationPermission: Boolean, modifier: Modifier
) {
    val context = LocalContext.current
    var minuteText by rememberSaveable(entry.id) { mutableStateOf(entry.minutes.toString()) }
    var more by rememberSaveable(entry.id) { mutableStateOf(false) }
    var reminderError by rememberSaveable(entry.id) { mutableStateOf<String?>(null) }
    fun patch(transform: (Entry) -> Entry) = onUpdate(transform(entry).changed())
    fun chooseReminder(offset: Long) {
        val chosen = reminderTime(offset)
        if (chosen <= System.currentTimeMillis()) reminderError = "Heute ist fast vorbei. Wähle eine Erinnerung für morgen."
        else { reminderError = null; patch { it.copy(reminderAt = chosen) } }
    }
    Column(modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 36.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Text(entry.status.label().uppercase(Locale.GERMAN), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        Text(if (entry.status == EntryStatus.INBOX) "Mach es\ngreifbar." else "Dein nächster Schritt.", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
        Text("Alle Änderungen werden direkt auf diesem Gerät gespeichert.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(entry.thought, { value -> if (value.length <= 10000) patch { it.copy(thought = value) } }, label = { Text("Ursprünglicher Gedanke") }, modifier = Modifier.fillMaxWidth().testTag("edit_thought"), minLines = 2, maxLines = 5)
        if (entry.thought.contains("morgen", ignoreCase = true) && entry.status == EntryStatus.INBOX) {
            OutlinedCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Du hast „morgen“ geschrieben.", style = MaterialTheme.typography.titleMedium)
                    Text("Soll dieser Schritt morgen dran sein? Der Vorschlag wird erst mit deinem Tippen übernommen und bleibt änderbar.")
                    OutlinedButton(onClick = { patch { it.copy(status = EntryStatus.INBOX, dueDate = LocalDate.now().plusDays(1).toString()) } }, modifier = Modifier.testTag("suggest_tomorrow")) { Text("Morgen vorschlagen") }
                }
            }
        }
        SectionLabel("1. Was kannst du konkret tun?", "Ein kleiner, sichtbarer Schritt. Zum Beispiel: Retourenlabel herunterladen.")
        OutlinedTextField(entry.nextStep, { value -> if (value.length <= 10000) patch { it.copy(nextStep = value) } }, label = { Text("Konkreter nächster Schritt") }, modifier = Modifier.fillMaxWidth().testTag("edit_next_step"), minLines = 2, maxLines = 6)
        if (entry.nextStep.isBlank()) OutlinedButton(onClick = { patch { it.copy(nextStep = it.thought) } }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Gedanken als Ausgangspunkt übernehmen") }
        SectionLabel("2. Wie viel Zeit ungefähr?", "Eine Schätzung reicht. Du kannst sie jederzeit ändern.")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(5, 15, 25).forEach { amount -> FilterChip(selected = entry.minutes == amount, onClick = { minuteText = amount.toString(); patch { it.copy(minutes = amount) } }, label = { Text("$amount Min.") }, modifier = Modifier.heightIn(min = 48.dp)) }
        }
        OutlinedTextField(minuteText, { value ->
            if (value.length <= 3 && value.all(Char::isDigit)) {
                minuteText = value
                value.toIntOrNull()?.takeIf { it in 1..240 }?.let { amount -> patch { it.copy(minutes = amount) } }
            }
        }, label = { Text("Eigene Dauer in Minuten") }, supportingText = { Text("1 bis 240 Minuten. Gespeichert: ${entry.minutes} Minuten.") }, isError = minuteText.toIntOrNull() !in 1..240, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth().testTag("edit_minutes"))
        SectionLabel("3. Wo passt es am besten?", "Ein Ort oder Kontext hilft beim Wiederfinden.")
        Place.entries.chunked(2).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { place -> FilterChip(selected = entry.place == place, onClick = { patch { it.copy(place = place) } }, label = { Text(place.label()) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) }
        } }
        SectionLabel("4. Heute oder später?", "Aktuell: ${dateLabel(entry.dueDate ?: if (entry.status == EntryStatus.TODAY) Rules.today() else null)}")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = entry.status != EntryStatus.PARKED && (entry.dueDate == null || entry.dueDate!! <= Rules.today()), onClick = { patch { it.copy(status = if (it.status == EntryStatus.INBOX) EntryStatus.INBOX else EntryStatus.TODAY, dueDate = Rules.today()) } }, label = { Text("Heute") }, modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("choose_today"))
            FilterChip(selected = entry.status == EntryStatus.PARKED || (entry.dueDate != null && entry.dueDate!! > Rules.today()), onClick = { patch { it.copy(status = if (it.status == EntryStatus.INBOX) EntryStatus.INBOX else EntryStatus.PARKED, dueDate = LocalDate.now().plusDays(1).toString()) } }, label = { Text("Später") }, modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("choose_later"))
        }
        ActionFlow(listOf(
            "Morgen" to { patch { it.copy(status = if (it.status == EntryStatus.INBOX) EntryStatus.INBOX else EntryStatus.PARKED, dueDate = LocalDate.now().plusDays(1).toString()) } },
            "Nächste Woche" to { patch { it.copy(status = if (it.status == EntryStatus.INBOX) EntryStatus.INBOX else EntryStatus.PARKED, dueDate = LocalDate.now().plusWeeks(1).toString()) } },
            "Ohne Datum" to { patch { it.copy(status = EntryStatus.PARKED, dueDate = null) } },
            "Datum wählen" to {
                val initial = runCatching { entry.dueDate?.let(LocalDate::parse) ?: LocalDate.now().plusDays(1) }.getOrDefault(LocalDate.now())
                DatePickerDialog(context, { _, year, month, day ->
                    val selected = LocalDate.of(year, month + 1, day).toString()
                    patch { it.copy(status = if (it.status == EntryStatus.INBOX) EntryStatus.INBOX else if (selected <= Rules.today()) EntryStatus.TODAY else EntryStatus.PARKED, dueDate = selected) }
                }, initial.year, initial.monthValue - 1, initial.dayOfMonth).show()
            }
        ))
        SectionLabel("5. Eine Erinnerung?", "Optional. Es wird nichts ungefragt eingeschaltet.")
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = entry.reminderAt == null, onClick = { reminderError = null; patch { it.copy(reminderAt = null) } }, label = { Text("Keine") }, modifier = Modifier.heightIn(min = 48.dp).testTag("reminder_none"))
            FilterChip(selected = entry.reminderAt?.let { localTime(it).toLocalDate() == LocalDate.now() } == true, onClick = { chooseReminder(0) }, label = { Text("Heute") }, modifier = Modifier.heightIn(min = 48.dp).testTag("reminder_today"))
            FilterChip(selected = entry.reminderAt?.let { localTime(it).toLocalDate() == LocalDate.now().plusDays(1) } == true, onClick = { chooseReminder(1) }, label = { Text("Morgen") }, modifier = Modifier.heightIn(min = 48.dp).testTag("reminder_tomorrow"))
        }
        reminderError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        entry.reminderAt?.let { reminder ->
            Text("Erinnerung: ${dateLabel(localTime(reminder).toLocalDate().toString())} um ${localTime(reminder).format(TimeFormat)} Uhr", style = MaterialTheme.typography.bodyLarge)
            OutlinedButton(onClick = {
                val initial = localTime(reminder)
                TimePickerDialog(context, { _, hour, minute ->
                    val time = initial.toLocalDate().atTime(hour, minute).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                    if (time <= System.currentTimeMillis()) reminderError = "Wähle eine Uhrzeit, die noch vor dir liegt. Deine bisherige Erinnerung bleibt erhalten."
                    else { reminderError = null; patch { it.copy(reminderAt = time) } }
                }, initial.hour, initial.minute, true).show()
            }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Uhrzeit ändern") }
            if (reminder <= System.currentTimeMillis()) Text("Diese Uhrzeit liegt bereits in der Vergangenheit. Wähle eine neue Zeit für die nächste Erinnerung.", color = MaterialTheme.colorScheme.error)
            if (!notificationPermission) PermissionCard(false, onReminderPermission)
        }
        if (entry.status !in listOf(EntryStatus.DONE, EntryStatus.TRASH)) {
            Button(onClick = { onUpdate(Rules.clarify(entry)); }, enabled = entry.nextStep.isNotBlank() && minuteText.toIntOrNull() in 1..240 && (entry.reminderAt == null || entry.reminderAt!! > System.currentTimeMillis()), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("clarify_save")) { Text(if (entry.status == EntryStatus.INBOX) "Als nächsten Schritt übernehmen" else "Schritt bestätigen") }
            Text(if (entry.nextStep.isBlank()) "Ergänze zuerst einen konkreten nächsten Schritt." else "Deine Angaben bleiben bearbeitbar.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        HorizontalDivider()
        TextButton(onClick = { more = !more }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("editor_more")) { Text(if (more) "Notizen & Anhänge einklappen" else "Notizen, Anhänge & weitere Aktionen") }
        if (more) {
            OutlinedTextField(entry.notes, { value -> if (value.length <= 50000) patch { it.copy(notes = value) } }, label = { Text("Notizen") }, minLines = 3, maxLines = 8, modifier = Modifier.fillMaxWidth().testTag("edit_notes"))
            if (entry.links.isNotEmpty()) { Text("Geteilte Links", style = MaterialTheme.typography.titleMedium); entry.links.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) } }
            Text("Anhänge sind freiwillig und bleiben lokal. Ein Foto wählst du über den Android-Dateidialog; Sprachnotizen benötigen deine Mikrofonfreigabe.", style = MaterialTheme.typography.bodyMedium)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onPhoto, enabled = entry.attachments.size < 8, modifier = Modifier.weight(1f).heightIn(min = 52.dp).testTag("attach_photo")) { Text("Foto hinzufügen") }
                OutlinedButton(onClick = onRecord, enabled = entry.attachments.size < 8, modifier = Modifier.weight(1f).heightIn(min = 52.dp).testTag("attach_voice")) { Text("Sprachnotiz") }
            }
            entry.attachments.forEach { attachment ->
                OutlinedCard { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    Text(attachment.name, style = MaterialTheme.typography.bodyMedium)
                    Row {
                        TextButton(onClick = { onOpenAttachment(attachment) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Anhang öffnen") }
                        TextButton(onClick = { patch { it.copy(attachments = it.attachments.filterNot { item -> item.id == attachment.id }) } }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Entfernen") }
                    }
                } }
            }
            Text("Verschieben", style = MaterialTheme.typography.titleMedium)
            QuickParkRow(entry, onUpdate, onDelete)
            if (entry.status == EntryStatus.DONE) {
                Button(onClick = { onUpdate(Rules.reopen(entry)) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("reopen_task")) { Text("Wieder öffnen") }
            } else if (entry.status == EntryStatus.TRASH) {
                Button(onClick = { onUpdate(Rules.restore(entry)) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Wiederherstellen") }
            } else {
                Button(onClick = onDone, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("editor_complete")) { Text("✓ Als erledigt markieren") }
                OutlinedButton(onClick = onTimer, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("timer_open")) { Text("Fokus-Timer starten") }
            }
            Text("Erstellt ${localTime(entry.createdAt).format(DateTimeFormatter.ofPattern("d. MMM yyyy, HH:mm", Locale.GERMAN))}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun TimerDialog(entry: Entry, onDismiss: () -> Unit, onStart: (Int) -> Unit) {
    var custom by rememberSaveable(entry.id) { mutableStateOf(entry.minutes.toString()) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Zeit für einen Schritt.") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(entry.title(), style = MaterialTheme.typography.titleMedium)
            Text("Der Timer läuft offline weiter, wenn du die App verlässt. Ein neuer Timer ersetzt den laufenden.")
            listOf(5, 15, 25).forEach { amount -> OutlinedButton(onClick = { onStart(amount) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("timer_$amount")) { Text("$amount Minuten starten") } }
            OutlinedTextField(custom, { if (it.length <= 3 && it.all(Char::isDigit)) custom = it }, label = { Text("Eigene Dauer (Minuten)") }, supportingText = { Text("1 bis 240 Minuten") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth().testTag("timer_custom"))
        }
    }, confirmButton = { TextButton(onClick = { custom.toIntOrNull()?.takeIf { it in 1..240 }?.let(onStart) }, enabled = custom.toIntOrNull() in 1..240, modifier = Modifier.testTag("timer_custom_start")) { Text("Eigene Dauer starten") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Zurück") } })
}

@Composable
private fun TimerBanner(timer: TimerState, title: String, onStop: () -> Unit) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(timer.endsAt) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    val remaining = ((timer.endsAt - now + 999) / 1000).coerceAtLeast(0)
    Card(Modifier.fillMaxWidth().testTag("timer_active"), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (remaining == 0L) "Fokuszeit beendet" else "Dein Fokus läuft", style = MaterialTheme.typography.labelLarge)
            Text(title, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
            Text(String.format(Locale.GERMAN, "%02d:%02d", remaining / 60, remaining % 60), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { contentDescription = "Noch ${remaining / 60} Minuten und ${remaining % 60} Sekunden" })
            TextButton(onClick = onStop, modifier = Modifier.heightIn(min = 48.dp).testTag("timer_stop")) { Text(if (remaining == 0L) "Timer schließen" else "Timer beenden") }
        }
    }
}
