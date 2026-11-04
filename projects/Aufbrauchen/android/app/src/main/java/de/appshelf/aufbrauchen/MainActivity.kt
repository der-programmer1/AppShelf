package de.appshelf.aufbrauchen

import android.app.DatePickerDialog
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    private val model: AppModel by viewModels()
    private val dayHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val dayCheck =
        object : Runnable {
            override fun run() {
                model.refreshDay()
                dayHandler.postDelayed(this, 60000)
            }
        }

    override fun onResume() {
        super.onResume()
        dayHandler.post(dayCheck)
    }

    override fun onPause() {
        dayHandler.removeCallbacks(dayCheck)
        super.onPause()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { AppTheme { AppScreen(model) } }
    }
}

@Composable
private fun AppTheme(content: @Composable () -> Unit) {
    val colors =
        if (isSystemInDarkTheme())
            darkColorScheme(
                primary = Color(0xffb1d5a2),
                onPrimary = Color(0xff153421),
                background = Color(0xff151e19),
                surface = Color(0xff1d2b22),
                onSurface = Color(0xfff0f5e9),
                secondaryContainer = Color(0xff283d2d),
            )
        else
            lightColorScheme(
                primary = Color(0xff27634b),
                background = Color(0xfff8f6ef),
                surface = Color(0xfffffefa),
                onSurface = Color(0xff213b31),
                secondaryContainer = Color(0xffeaf0e2),
            )
    MaterialTheme(colorScheme = colors, content = content)
}

private fun dayText(day: String) =
    runCatching { LocalDate.parse(day).format(DateTimeFormatter.ofPattern("dd.MM.yyyy")) }
        .getOrDefault(day)

@Composable
private fun AppScreen(vm: AppModel) {
    val state = vm.state
    var tab by remember { mutableStateOf("Heute") }
    var search by remember { mutableStateOf("") }
    var place by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var consuming by remember { mutableStateOf<Item?>(null) }
    var clearConfirm by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val export =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("application/json")
        ) {
            it?.let { uri -> vm.export(context.contentResolver, uri) }
        }
    val import =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {
            it?.let { uri -> vm.import(context.contentResolver, uri) }
        }
    BackHandler(vm.editorVisible) { vm.closeEditor() }
    Scaffold(
        bottomBar = {
            NavigationBar {
                for (name in listOf("Heute", "Vorrat", "Einkauf", "Mehr")) NavigationBarItem(
                    selected = tab == name,
                    onClick = { tab = name },
                    icon = { Text(name) },
                    modifier = Modifier.testTag("tab-$name"),
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            item {
                Column(Modifier.padding(top = 20.dp)) {
                    Text(
                        "AUFBRAUCHEN",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        "Erst aufbrauchen.\nDann nachkaufen.",
                        fontSize = 34.sp,
                        lineHeight = 38.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(vertical = 12.dp),
                    )
                    Text("Vorräte im Blick. Zuerst das, was bald dran ist.")
                    Button(
                        onClick = { vm.begin(Rules.editor("item")) },
                        enabled = vm.ready,
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp).testTag("add-item"),
                    ) {
                        Text("+ Vorrat hinzufügen")
                    }
                    if (state.editor != null && !vm.editorVisible)
                        TextButton(onClick = vm::resume) { Text("Bearbeitungsentwurf fortsetzen") }
                }
            }
            if (vm.message.isNotBlank())
                item {
                    Text(
                        vm.message,
                        modifier = Modifier.testTag("status"),
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            if (state.undo != null)
                item {
                    Surface(
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(state.undo.label, Modifier.weight(1f))
                            TextButton(onClick = vm::undo, modifier = Modifier.testTag("undo")) {
                                Text("Rückgängig")
                            }
                        }
                    }
                }
            if (!vm.ready)
                item {
                    Text(
                        "Lokaler Speicher wird geöffnet. Bei einem Fehler wird nichts überschrieben."
                    )
                }
            else {
                if (!state.data.settings.onboarded)
                    item {
                        Card {
                            Column(
                                Modifier.padding(18.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Text(
                                    "Dein Vorrat in drei Schritten",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    "1. Lebensmittel mit Menge, Lagerort und optionalem Datum eintragen.\n2. Unter Heute sehen, was zuerst dran ist, und verbrauchte Mengen abziehen.\n3. Einkaufen und die gekauften Lebensmittel wieder einlagern."
                                )
                                Text(
                                    "Alle Daten bleiben lokal. Die App prüft Lebensmittel nicht auf Frische."
                                )
                                Button(
                                    onClick = {
                                        vm.change({
                                            it.copy(
                                                data =
                                                    it.data.copy(
                                                        revision = it.data.revision + 1,
                                                        settings =
                                                            it.data.settings.copy(onboarded = true),
                                                    ),
                                                undo = null,
                                            )
                                        })
                                    }
                                ) {
                                    Text("Verstanden")
                                }
                            }
                        }
                    }
                when (tab) {
                    "Heute" -> {
                        val due = Rules.due(state.data, vm.day)
                        item {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Stat(Rules.stock(state.data).size, "Vorräte", Modifier.weight(1f))
                                Stat(due.size, "bald dran", Modifier.weight(1f))
                                Stat(
                                    state.data.shopping.count { it.status == "open" },
                                    "auf der Liste",
                                    Modifier.weight(1f),
                                )
                            }
                        }
                        item {
                            Text("Das kommt zuerst", style = MaterialTheme.typography.headlineSmall)
                            Text(
                                "Heute und die nächsten ${state.data.settings.soonDays} Tage",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                        if (due.isEmpty())
                            item {
                                Empty(
                                    "Alles im Blick",
                                    if (state.data.items.isEmpty())
                                        "Füge deinen ersten Vorrat hinzu. Es werden keine Beispielvorräte angelegt."
                                    else
                                        "Kein eingetragenes Datum ist im gewählten Zeitraum fällig. Lebensmittel ohne Datum findest du unter Vorrat.",
                                )
                            }
                        items(due, key = { "today-" + it.id }) {
                            ItemCard(it, vm, { consuming = it })
                        }
                        val favorites = Rules.favorites(state.data)
                        if (favorites.isNotEmpty()) {
                            item {
                                Text("Deine Vorlagen", style = MaterialTheme.typography.titleLarge)
                            }
                            items(favorites, key = { "template-" + it.id }) { item ->
                                Row(Modifier.fillMaxWidth()) {
                                    OutlinedButton(
                                        onClick = { vm.template(item) },
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Text("+ ${item.name}")
                                    }
                                    TextButton(onClick = { vm.removeTemplate(item) }) {
                                        Text("Entfernen")
                                    }
                                }
                            }
                        }
                        item {
                            Fold("Was bedeuten die Datumsangaben?") {
                                Text(
                                    "Mindesthaltbarkeit ist kein automatisches Wegwerfdatum. Das Verbrauchsdatum (‚zu verbrauchen bis‘) ist eine Sicherheitsgrenze. Aufbrauchen zeigt deine Einträge und prüft keine Lebensmittel auf Frische."
                                )
                            }
                        }
                    }
                    "Vorrat" -> {
                        item {
                            Text("Dein Vorrat", style = MaterialTheme.typography.headlineSmall)
                            OutlinedTextField(
                                value = search,
                                onValueChange = { search = it },
                                label = { Text("Name oder Notiz suchen") },
                                modifier = Modifier.fillMaxWidth().testTag("search"),
                            )
                            Choice("Lagerort", place, mapOf("" to "Alle") + Labels.places) {
                                place = it
                            }
                            Choice("Gruppe", category, mapOf("" to "Alle") + Labels.categories) {
                                category = it
                            }
                        }
                        val q = search.trim()
                        val rows =
                            Rules.ordered(
                                Rules.stock(state.data).filter {
                                    (place.isEmpty() || it.place == place) &&
                                        (category.isEmpty() || it.category == category) &&
                                        (q.isEmpty() ||
                                            it.name.contains(q, true) ||
                                            it.note.contains(q, true))
                                }
                            )
                        if (rows.isEmpty())
                            item {
                                Empty(
                                    "Keine passenden Vorräte",
                                    "Füge einen Vorrat hinzu oder ändere deine Suche und Filter.",
                                )
                            }
                        items(rows, key = { "stock-" + it.id }) {
                            ItemCard(it, vm, { consuming = it })
                        }
                    }
                    "Einkauf" -> {
                        item {
                            Text(
                                "Dein nächster Einkauf",
                                style = MaterialTheme.typography.headlineSmall,
                            )
                            Button(
                                onClick = { vm.begin(Rules.editor("shop")) },
                                modifier = Modifier.testTag("add-shop"),
                            ) {
                                Text("+ Einkaufsposition")
                            }
                            Text("Gekauft abhaken und anschließend mit Menge und Datum einlagern.")
                        }
                        val shopping =
                            state.data.shopping
                                .filter { it.status in setOf("open", "checked") }
                                .sortedBy { it.createdAt }
                        if (shopping.isEmpty())
                            item {
                                Empty(
                                    "Alles auf der Liste erledigt",
                                    "Neue Position eintragen oder an einem Vorrat ‚Einkaufen‘ wählen.",
                                )
                            }
                        items(shopping, key = { "shop-" + it.id }) { ShopCard(it, vm) }
                        val stocked = state.data.shopping.filter { it.status == "stocked" }
                        if (stocked.isNotEmpty())
                            item {
                                Fold("Bereits eingelagert (${stocked.size})") {
                                    stocked.reversed().forEach { row ->
                                        Text(
                                            "${row.name} · ${Rules.amount(row.quantityMilli)} ${Labels.units[row.unit]}"
                                        )
                                        TextButton(
                                            onClick = {
                                                val draft = Rules.editor("shop")
                                                vm.begin(
                                                    draft.copy(
                                                        values =
                                                            draft.values +
                                                                mapOf(
                                                                    "name" to row.name,
                                                                    "amount" to
                                                                        Rules.amount(
                                                                            row.quantityMilli
                                                                        ),
                                                                    "unit" to row.unit,
                                                                )
                                                    )
                                                )
                                            }
                                        ) {
                                            Text("Erneut einkaufen")
                                        }
                                    }
                                }
                            }
                    }
                    "Mehr" -> {
                        item {
                            Text(
                                "Deine Daten, dein Überblick",
                                style = MaterialTheme.typography.headlineSmall,
                            )
                            Choice(
                                "Unter Heute anzeigen",
                                state.data.settings.soonDays.toString(),
                                linkedMapOf(
                                    "1" to "1 Tag",
                                    "3" to "3 Tage",
                                    "7" to "7 Tage",
                                    "14" to "14 Tage",
                                ),
                            ) { days ->
                                vm.mutate("Zeitraum angepasst.") {
                                    it.copy(settings = it.settings.copy(soonDays = days.toInt()))
                                }
                            }
                        }
                        item {
                            Card {
                                Column(
                                    Modifier.padding(18.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Text(
                                        "Lokale Sicherung",
                                        style = MaterialTheme.typography.titleLarge,
                                    )
                                    Text(
                                        "JSON-Sicherungen sind mit der Web-App austauschbar. Vorhandene Kennungen bleiben beim Import erhalten; ungültige Dateien verändern keine Daten. Die Sicherung ist nicht verschlüsselt. Entwürfe bleiben nur lokal."
                                    )
                                    Button(
                                        onClick = {
                                            export.launch("Aufbrauchen-${Rules.today()}.json")
                                        },
                                        modifier = Modifier.testTag("export"),
                                    ) {
                                        Text("JSON exportieren")
                                    }
                                    OutlinedButton(
                                        onClick = {
                                            import.launch(
                                                arrayOf(
                                                    "application/json",
                                                    "text/plain",
                                                    "application/octet-stream",
                                                )
                                            )
                                        },
                                        modifier = Modifier.testTag("import"),
                                    ) {
                                        Text("JSON importieren")
                                    }
                                }
                            }
                        }
                        val closed =
                            state.data.items
                                .filter { it.status in setOf("used", "discarded") }
                                .sortedByDescending { it.closedAt }
                        item {
                            Fold("Aufgebraucht & entsorgt (${closed.size})") {
                                if (closed.isEmpty()) Text("Noch keine abgeschlossenen Vorräte.")
                                closed.forEach { ItemCard(it, vm, { consuming = it }, true) }
                            }
                        }
                        val trash = state.data.items.filter { it.status == "trash" }
                        val shops = state.data.shopping.filter { it.status == "trash" }
                        item {
                            Fold("Papierkorb (${trash.size+shops.size})") {
                                if (trash.isEmpty() && shops.isEmpty())
                                    Text("Der Papierkorb ist leer. Keine automatische Bereinigung.")
                                trash.forEach { ItemCard(it, vm, { consuming = it }, true) }
                                shops.forEach { ShopCard(it, vm) }
                            }
                        }
                        item {
                            Fold("Datenschutz & Nutzung") {
                                Text(
                                    "Keine Konten, kein Tracking, keine Werbung, kein Backend und keine Internetberechtigung. Deine Daten bleiben auf diesem Gerät. Android und Web synchronisieren sich nicht automatisch. Exportiere regelmäßig eine Sicherung."
                                )
                                Text(
                                    "Die Datumsübersicht wird beim Öffnen aktualisiert. Es gibt keine Hintergrundalarme und keine Frischeprüfung. MHD und Verbrauchsdatum sind unterschiedliche Angaben."
                                )
                                Text(
                                    "Unabhängiges persönliches Projekt, keine offizielle Store-App. APK außerhalb des Play Stores. Aufbrauchen 1.0.0"
                                )
                            }
                        }
                        item {
                            OutlinedButton(
                                onClick = { clearConfirm = true },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Alle lokalen Aufbrauchen-Daten löschen")
                            }
                        }
                    }
                }
            }
        }
    }
    if (vm.editorVisible && vm.formEditor != null) EditorDialog(vm)
    consuming?.let { ConsumeDialog(it, vm) { consuming = null } }
    if (clearConfirm)
        AlertDialog(
            onDismissRequest = { clearConfirm = false },
            title = { Text("Alle lokalen Daten löschen?") },
            text = {
                Text(
                    "Vorräte, Einkaufspositionen, Entwürfe und Rückgängig-Daten werden gelöscht. Exportiere vorher eine Sicherung."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        clearConfirm = false
                        vm.clear()
                    }
                ) {
                    Text("Alles löschen")
                }
            },
            dismissButton = { TextButton(onClick = { clearConfirm = false }) { Text("Abbrechen") } },
        )
}

@Composable
private fun Stat(number: Int, label: String, modifier: Modifier) {
    Surface(
        modifier,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.secondaryContainer,
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(number.toString(), fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text(label, fontSize = 12.sp)
        }
    }
}

@Composable
private fun Empty(title: String, text: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(text)
        }
    }
}

@Composable
private fun Fold(title: String, content: @Composable ColumnScope.() -> Unit) {
    var open by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TextButton(onClick = { open = !open }) { Text((if (open) "⌄ " else "› ") + title) }
            if (open) content()
        }
    }
}

@Composable
private fun ItemCard(item: Item, vm: AppModel, onConsume: () -> Unit, archive: Boolean = false) {
    Card(Modifier.fillMaxWidth().testTag("item-${item.id}")) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    item.name,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                if (!archive)
                    TextButton(onClick = { vm.act(item.id, "favorite", "Vorlage aktualisiert.") }) {
                        Text(if (item.favorite) "★ Gemerkt" else "☆ Merken")
                    }
            }
            Text(
                "${Rules.amount(item.quantityMilli)} ${Labels.units[item.unit]}",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                "${Labels.places[item.place]} · ${Labels.categories[item.category]}",
                style = MaterialTheme.typography.bodySmall,
            )
            item.date?.let { day ->
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = MaterialTheme.colorScheme.secondaryContainer,
                ) {
                    Text(
                        "${Labels.dateKinds[item.dateKind]} · ${dayText(day)}" +
                            (if (day < vm.day) " · Datum überschritten"
                            else if (day == vm.day) " · Heute" else ""),
                        Modifier.padding(8.dp),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            item.openedOn?.let {
                Text("Geöffnet am ${dayText(it)}", style = MaterialTheme.typography.bodySmall)
            }
            if (item.note.isNotBlank()) Text(item.note)
            if (item.status == "trash")
                OutlinedButton(
                    onClick = { vm.act(item.id, "restore", "Vorrat wiederhergestellt.") }
                ) {
                    Text("Wiederherstellen")
                }
            else if (archive) {
                Text(
                    if (item.status == "used") "Als aufgebraucht markiert"
                    else "Als entsorgt markiert"
                )
                OutlinedButton(onClick = { vm.act(item.id, "reopen", "Vorrat wieder geöffnet.") }) {
                    Text("Wieder öffnen")
                }
                TextButton(onClick = { vm.template(item) }) { Text("Erneut erfassen") }
                TextButton(
                    onClick = { vm.act(item.id, "trash", "In den Papierkorb verschoben.") }
                ) {
                    Text("Löschen")
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onConsume) { Text("Verbrauchen") }
                    OutlinedButton(
                        onClick = {
                            vm.act(item.id, "shopping", "Menge auf die Einkaufsliste übernommen.")
                        }
                    ) {
                        Text("Einkaufen")
                    }
                }
                Row {
                    TextButton(onClick = { vm.begin(Rules.editor("item", item = item)) }) {
                        Text("Bearbeiten")
                    }
                    var more by remember { mutableStateOf(false) }
                    Box {
                        TextButton(onClick = { more = true }) { Text("Weitere Aktionen") }
                        DropdownMenu(expanded = more, onDismissRequest = { more = false }) {
                            DropdownMenuItem(
                                text = { Text("Als entsorgt markieren") },
                                onClick = {
                                    more = false
                                    vm.act(item.id, "discard", "Als entsorgt markiert.")
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Löschen") },
                                onClick = {
                                    more = false
                                    vm.act(item.id, "trash", "In den Papierkorb verschoben.")
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ShopCard(row: Shopping, vm: AppModel) {
    Card(Modifier.fillMaxWidth().testTag("shop-${row.id}")) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row {
                Checkbox(
                    checked = row.status == "checked",
                    enabled = row.status != "trash",
                    onCheckedChange = { vm.act(row.id, "check", "Einkaufsstatus aktualisiert.") },
                )
                Column {
                    Text(row.name, style = MaterialTheme.typography.titleLarge)
                    Text("${Rules.amount(row.quantityMilli)} ${Labels.units[row.unit]}")
                }
            }
            if (row.note.isNotBlank()) Text(row.note)
            if (row.status == "trash")
                OutlinedButton(
                    onClick = { vm.act(row.id, "restore", "Einkauf wiederhergestellt.") }
                ) {
                    Text("Wiederherstellen")
                }
            else {
                if (row.status == "checked")
                    Button(
                        onClick = { vm.begin(Rules.editor("item", source = row)) },
                        modifier = Modifier.testTag("stock-purchase"),
                    ) {
                        Text("In Vorrat übernehmen")
                    }
                Row {
                    TextButton(onClick = { vm.begin(Rules.editor("shop", shop = row)) }) {
                        Text("Bearbeiten")
                    }
                    TextButton(
                        onClick = {
                            vm.act(row.id, "trash", "Einkauf in den Papierkorb verschoben.")
                        }
                    ) {
                        Text("Löschen")
                    }
                }
            }
        }
    }
}

@Composable
private fun Choice(
    label: String,
    value: String,
    options: Map<String, String>,
    onChange: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Box {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                Text(options[value] ?: value)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { (id, name) ->
                    DropdownMenuItem(
                        text = { Text(name) },
                        onClick = {
                            expanded = false
                            onChange(id)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun DateField(label: String, value: String, onChange: (String) -> Unit) {
    val context = LocalContext.current
    Column {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Row {
            OutlinedButton(
                onClick = {
                    val date = runCatching { LocalDate.parse(value) }.getOrDefault(LocalDate.now())
                    DatePickerDialog(
                            context,
                            { _, year, month, day ->
                                onChange(LocalDate.of(year, month + 1, day).toString())
                            },
                            date.year,
                            date.monthValue - 1,
                            date.dayOfMonth,
                        )
                        .show()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text(if (value.isBlank()) "Datum wählen" else dayText(value))
            }
            if (value.isNotBlank()) TextButton(onClick = { onChange("") }) { Text("Entfernen") }
        }
    }
}

@Composable
private fun EditorDialog(vm: AppModel) {
    val draft = vm.formEditor ?: return
    val v = draft.values
    var discard by remember { mutableStateOf(false) }
    Dialog(onDismissRequest = vm::closeEditor) {
        Surface(shape = MaterialTheme.shapes.large) {
            Column(
                Modifier.fillMaxWidth()
                    .heightIn(max = 680.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    if (draft.kind == "shop") "Einkauf eintragen"
                    else if (draft.sourceShopId != null) "Einkauf einlagern"
                    else if (draft.baseRev > 0) "Vorrat bearbeiten" else "Vorrat hinzufügen",
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    "Beim Schließen bleibt dein Entwurf erhalten.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedTextField(
                    value = v.getValue("name"),
                    onValueChange = { if (it.length <= 120) vm.edit("name", it) },
                    label = { Text("Name") },
                    modifier = Modifier.fillMaxWidth().testTag("edit-name"),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = v.getValue("amount"),
                    onValueChange = { if (it.length <= 12) vm.edit("amount", it) },
                    label = { Text("Menge") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth().testTag("edit-amount"),
                    singleLine = true,
                )
                Choice("Einheit", v.getValue("unit"), Labels.units) { vm.edit("unit", it) }
                if (draft.kind == "item") {
                    Choice("Lagerort", v.getValue("place"), Labels.places) { vm.edit("place", it) }
                    Choice("Lebensmittelgruppe", v.getValue("category"), Labels.categories) {
                        vm.edit("category", it)
                    }
                    Choice("Datumsart", v.getValue("dateKind"), Labels.dateKinds) {
                        vm.edit("dateKind", it)
                    }
                    if (v["dateKind"] != "none") {
                        DateField("Datum (optional)", v.getValue("date")) { vm.edit("date", it) }
                        Row {
                            TextButton(onClick = { vm.edit("date", Rules.today()) }) {
                                Text("Heute")
                            }
                            TextButton(
                                onClick = { vm.edit("date", Rules.plusDays(Rules.today(), 1)) }
                            ) {
                                Text("Morgen")
                            }
                            TextButton(
                                onClick = { vm.edit("date", Rules.plusDays(Rules.today(), 7)) }
                            ) {
                                Text("In 1 Woche")
                            }
                        }
                    }
                    DateField("Geöffnet am (optional)", v.getValue("openedOn")) {
                        vm.edit("openedOn", it)
                    }
                    Row {
                        Checkbox(
                            checked = v["favorite"] == "true",
                            onCheckedChange = { vm.edit("favorite", it.toString()) },
                        )
                        Text("Als Vorlage merken")
                    }
                }
                OutlinedTextField(
                    value = v.getValue("note"),
                    onValueChange = { if (it.length <= 2000) vm.edit("note", it) },
                    label = { Text("Notiz (optional)") },
                    modifier = Modifier.fillMaxWidth().testTag("edit-note"),
                )
                if (vm.errorMessage.isNotBlank())
                    Text(
                        vm.errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.testTag("editor-status"),
                    )
                Button(
                    onClick = vm::saveEditor,
                    enabled = !vm.working,
                    modifier = Modifier.fillMaxWidth().testTag("save-editor"),
                ) {
                    Text(if (vm.working) "Wird gespeichert …" else "Speichern")
                }
                OutlinedButton(
                    onClick = vm::closeEditor,
                    modifier = Modifier.fillMaxWidth().testTag("close-editor"),
                ) {
                    Text("Schließen")
                }
                TextButton(onClick = { discard = true }) { Text("Entwurf verwerfen") }
            }
        }
    }
    if (discard)
        AlertDialog(
            onDismissRequest = { discard = false },
            title = { Text("Entwurf verwerfen?") },
            text = { Text("Gespeicherte Einträge bleiben erhalten.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        discard = false
                        vm.discardEditor()
                    }
                ) {
                    Text("Verwerfen")
                }
            },
            dismissButton = { TextButton(onClick = { discard = false }) { Text("Abbrechen") } },
        )
}

@Composable
private fun ConsumeDialog(item: Item, vm: AppModel, onClose: () -> Unit) {
    var text by remember(item.id) { mutableStateOf(Rules.amount(item.quantityMilli)) }
    var reorder by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("${item.name} verbrauchen") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Vorhanden: ${Rules.amount(item.quantityMilli)} ${Labels.units[item.unit]}")
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text("Verbrauchte Menge") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.testTag("consume-amount"),
                )
                Row {
                    TextButton(
                        onClick = { text = Rules.amount(maxOf(1, item.quantityMilli / 2)) }
                    ) {
                        Text("Etwa die Hälfte")
                    }
                    TextButton(onClick = { text = Rules.amount(item.quantityMilli) }) {
                        Text("Alles")
                    }
                }
                Row {
                    Checkbox(checked = reorder, onCheckedChange = { reorder = it })
                    Text("Verbrauchte Menge auf die Einkaufsliste")
                }
                Text(vm.errorMessage, color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            Button(
                onClick = { vm.consume(item.id, text, reorder, onClose) },
                enabled = !vm.working,
                modifier = Modifier.testTag("confirm-consume"),
            ) {
                Text("Verbrauchen")
            }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Abbrechen") } },
    )
}
