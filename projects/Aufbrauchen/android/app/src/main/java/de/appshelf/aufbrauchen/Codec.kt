package de.appshelf.aufbrauchen

import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

object Codec {
    const val MAX_DOCUMENT = 8 * 1024 * 1024
    const val MAX_STORAGE = 24 * 1024 * 1024
    private val itemKeys =
        setOf(
            "id",
            "name",
            "quantityMilli",
            "unit",
            "place",
            "category",
            "date",
            "dateKind",
            "openedOn",
            "note",
            "favorite",
            "status",
            "previousStatus",
            "createdAt",
            "updatedAt",
            "closedAt",
            "rev",
        )
    private val shopKeys =
        setOf(
            "id",
            "name",
            "quantityMilli",
            "unit",
            "note",
            "status",
            "previousStatus",
            "stockId",
            "createdAt",
            "updatedAt",
            "rev",
        )
    private val valueKeys =
        setOf(
            "name",
            "amount",
            "unit",
            "place",
            "category",
            "date",
            "dateKind",
            "openedOn",
            "note",
            "favorite",
        )

    private fun check(ok: Boolean) {
        require(ok) { "Die Datei ist ungültig oder unvollständig." }
    }

    private fun text(value: String, max: Int) {
        check(value.length <= max)
        var high = false
        value.forEach { c ->
            when {
                high -> {
                    check(c.isLowSurrogate())
                    high = false
                }
                c.isHighSurrogate() -> high = true
                c.isLowSurrogate() -> check(false)
            }
        }
        check(!high)
    }

    private fun id(value: String) {
        check(Regex("[A-Za-z0-9_-]{1,128}").matches(value))
    }

    private fun integer(value: Long, min: Long, max: Long) {
        check(value in min..max)
    }

    private fun date(value: String) {
        require(
            Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}").matches(value) &&
                !value.startsWith("0000") &&
                runCatching { LocalDate.parse(value).toString() == value }.getOrDefault(false)
        ) {
            "Bitte ein gültiges Datum wählen."
        }
    }

    private fun common(
        id: String,
        name: String,
        q: Long,
        unit: String,
        note: String,
        created: Long,
        updated: Long,
        rev: Long,
        ids: MutableSet<String>,
    ) {
        id(id)
        require(ids.add(id)) { "Die Datei enthält doppelte Kennungen." }
        text(name, 120)
        require(name.isNotBlank()) { "Bitte einen Namen eingeben." }
        text(note, 2000)
        integer(q, 1, Rules.MAX_QUANTITY)
        check(unit in Labels.units)
        integer(created, 0, 253402300799999)
        integer(updated, created, 253402300799999)
        integer(rev, 1, 1000000000000)
    }

    fun validate(data: Data) {
        integer(data.revision, 0, 1000000000000)
        check(data.settings.soonDays in setOf(1, 3, 7, 14))
        require(data.items.size <= 5000 && data.shopping.size <= 2000) {
            "Zu viele Einträge: maximal 5000 Vorräte und 2000 Einkaufspositionen."
        }
        val ids = HashSet<String>()
        data.items.forEach { r ->
            common(
                r.id,
                r.name,
                r.quantityMilli,
                r.unit,
                r.note,
                r.createdAt,
                r.updatedAt,
                r.rev,
                ids,
            )
            check(
                r.place in Labels.places &&
                    r.category in Labels.categories &&
                    r.dateKind in Labels.dateKinds
            )
            r.date?.let(::date)
            r.openedOn?.let(::date)
            check(r.dateKind != "none" || r.date == null)
            check(r.status in setOf("stock", "used", "discarded", "trash"))
            check(
                r.previousStatus == null || r.previousStatus in setOf("stock", "used", "discarded")
            )
            r.closedAt?.let { integer(it, 0, 253402300799999) }
            check(r.status != "stock" || r.closedAt == null)
            check(r.status !in setOf("used", "discarded") || r.closedAt != null)
            check(r.status != "trash" || r.previousStatus != null)
        }
        val itemIds = data.items.mapTo(HashSet()) { it.id }
        data.shopping.forEach { r ->
            common(
                r.id,
                r.name,
                r.quantityMilli,
                r.unit,
                r.note,
                r.createdAt,
                r.updatedAt,
                r.rev,
                ids,
            )
            check(r.status in setOf("open", "checked", "stocked", "trash"))
            check(
                r.previousStatus == null || r.previousStatus in setOf("open", "checked", "stocked")
            )
            check(r.status != "trash" || r.previousStatus != null)
            r.stockId?.let {
                id(it)
                require(it in itemIds) { "Ein Einkauf verweist auf einen fehlenden Vorrat." }
            }
            check(
                (r.status == "stocked" || r.status == "trash" && r.previousStatus == "stocked") ==
                    (r.stockId != null)
            )
        }
        require(document(data).toString().toByteArray(Charsets.UTF_8).size <= MAX_DOCUMENT) {
            "Die Daten sind größer als 8 MB. Bitte vor weiteren Einträgen eine Sicherung exportieren."
        }
    }

    fun validateEditor(editor: Editor?) {
        if (editor == null) return
        check(editor.kind in setOf("item", "shop"))
        id(editor.id)
        integer(editor.baseRev, 0, 1000000000000)
        editor.sourceShopId?.let(::id)
        integer(editor.sourceShopRev, 0, 1000000000000)
        check(editor.values.keys == valueKeys)
        editor.values.forEach { (key, value) ->
            text(value, if (key == "note") 2000 else if (key == "name") 120 else 80)
        }
    }

    fun validateState(state: State) {
        validate(state.data)
        validateEditor(state.editor)
        state.undo?.let {
            validate(it.before)
            integer(it.afterRevision, 0, 1000000000000)
            text(it.label, 200)
        }
    }

    fun encode(data: Data): String {
        validate(data)
        return document(data).toString()
    }

    fun decode(source: String): Data =
        parse(source, MAX_DOCUMENT).let(::readDocument).also(::validate)

    fun encodeState(state: State): String {
        validateState(state)
        val json =
            JSONObject()
                .put("data", document(state.data))
                .put("editor", state.editor?.let(::editorJson) ?: JSONObject.NULL)
                .put(
                    "undo",
                    state.undo?.let {
                        JSONObject()
                            .put("before", document(it.before))
                            .put("afterRevision", it.afterRevision)
                            .put("label", it.label)
                    } ?: JSONObject.NULL,
                )
                .toString()
        require(json.toByteArray(Charsets.UTF_8).size <= MAX_STORAGE) {
            "Der lokale Speicher ist voll. Bitte eine Sicherung exportieren."
        }
        return json
    }

    fun decodeState(source: String): State {
        val root = parse(source, MAX_STORAGE)
        keys(root, setOf("data", "editor", "undo"))
        val data = readDocument(objectValue(root, "data"))
        val editor = if (root.isNull("editor")) null else readEditor(objectValue(root, "editor"))
        val undo =
            if (root.isNull("undo")) null
            else
                objectValue(root, "undo").let {
                    keys(it, setOf("before", "afterRevision", "label"))
                    Undo(
                        readDocument(objectValue(it, "before")),
                        number(it, "afterRevision"),
                        string(it, "label"),
                    )
                }
        return State(data, editor, undo).also(::validateState)
    }

    private fun parse(source: String, max: Int): JSONObject {
        require(source.toByteArray(Charsets.UTF_8).size <= max) {
            "Die Sicherungsdatei ist zu groß."
        }
        StrictJsonSyntax(source).validate()
        return try {
            JSONObject(source)
        } catch (_: Exception) {
            throw IllegalArgumentException("Die Datei enthält kein gültiges JSON.")
        }
    }

    private fun keys(obj: JSONObject, expected: Set<String>) {
        val actual = HashSet<String>()
        obj.keys().forEach { actual.add(it) }
        check(actual == expected)
    }

    private fun string(obj: JSONObject, key: String) =
        (obj.get(key) as? String)
            ?: throw IllegalArgumentException("Die Datei enthält einen ungültigen Text.")

    private fun nullable(obj: JSONObject, key: String) =
        if (obj.isNull(key)) null else string(obj, key)

    private fun number(obj: JSONObject, key: String): Long {
        val v = obj.get(key)
        check(v is Int || v is Long)
        return (v as Number).toLong()
    }

    private fun boolean(obj: JSONObject, key: String) =
        (obj.get(key) as? Boolean)
            ?: throw IllegalArgumentException("Die Datei enthält einen ungültigen Schalter.")

    private fun objectValue(obj: JSONObject, key: String) =
        (obj.get(key) as? JSONObject)
            ?: throw IllegalArgumentException("Die Dateistruktur ist ungültig.")

    private fun <T> array(obj: JSONObject, key: String, parse: (JSONObject) -> T): List<T> {
        val rows =
            obj.get(key) as? JSONArray
                ?: throw IllegalArgumentException("Die Dateistruktur ist ungültig.")
        require(rows.length() <= 7000)
        return (0 until rows.length()).map {
            parse(
                rows.get(it) as? JSONObject
                    ?: throw IllegalArgumentException("Die Dateistruktur ist ungültig.")
            )
        }
    }

    private fun document(data: Data) =
        JSONObject()
            .put("format", "aufbrauchen-backup")
            .put("version", 1)
            .put("revision", data.revision)
            .put(
                "settings",
                JSONObject()
                    .put("soonDays", data.settings.soonDays)
                    .put("onboarded", data.settings.onboarded),
            )
            .put("items", JSONArray().also { a -> data.items.forEach { a.put(itemJson(it)) } })
            .put(
                "shopping",
                JSONArray().also { a -> data.shopping.forEach { a.put(shopJson(it)) } },
            )

    private fun itemJson(r: Item) =
        JSONObject()
            .put("id", r.id)
            .put("name", r.name)
            .put("quantityMilli", r.quantityMilli)
            .put("unit", r.unit)
            .put("place", r.place)
            .put("category", r.category)
            .put("date", r.date ?: JSONObject.NULL)
            .put("dateKind", r.dateKind)
            .put("openedOn", r.openedOn ?: JSONObject.NULL)
            .put("note", r.note)
            .put("favorite", r.favorite)
            .put("status", r.status)
            .put("previousStatus", r.previousStatus ?: JSONObject.NULL)
            .put("createdAt", r.createdAt)
            .put("updatedAt", r.updatedAt)
            .put("closedAt", r.closedAt ?: JSONObject.NULL)
            .put("rev", r.rev)

    private fun shopJson(r: Shopping) =
        JSONObject()
            .put("id", r.id)
            .put("name", r.name)
            .put("quantityMilli", r.quantityMilli)
            .put("unit", r.unit)
            .put("note", r.note)
            .put("status", r.status)
            .put("previousStatus", r.previousStatus ?: JSONObject.NULL)
            .put("stockId", r.stockId ?: JSONObject.NULL)
            .put("createdAt", r.createdAt)
            .put("updatedAt", r.updatedAt)
            .put("rev", r.rev)

    private fun editorJson(e: Editor) =
        JSONObject()
            .put("kind", e.kind)
            .put("id", e.id)
            .put("baseRev", e.baseRev)
            .put("sourceShopId", e.sourceShopId ?: JSONObject.NULL)
            .put("sourceShopRev", e.sourceShopRev)
            .put("values", JSONObject(e.values))

    private fun readDocument(root: JSONObject): Data {
        keys(root, setOf("format", "version", "revision", "settings", "items", "shopping"))
        require(string(root, "format") == "aufbrauchen-backup" && number(root, "version") == 1L) {
            "Das ist keine Aufbrauchen-Sicherung der Version 1."
        }
        val settings = objectValue(root, "settings")
        keys(settings, setOf("soonDays", "onboarded"))
        val days = number(settings, "soonDays")
        check(days in setOf(1L, 3L, 7L, 14L))
        return Data(
            number(root, "revision"),
            Settings(days.toInt(), boolean(settings, "onboarded")),
            array(root, "items", ::readItem),
            array(root, "shopping", ::readShop),
        )
    }

    private fun readItem(r: JSONObject): Item {
        keys(r, itemKeys)
        return Item(
            string(r, "id"),
            string(r, "name"),
            number(r, "quantityMilli"),
            string(r, "unit"),
            string(r, "place"),
            string(r, "category"),
            nullable(r, "date"),
            string(r, "dateKind"),
            nullable(r, "openedOn"),
            string(r, "note"),
            boolean(r, "favorite"),
            string(r, "status"),
            nullable(r, "previousStatus"),
            number(r, "createdAt"),
            number(r, "updatedAt"),
            if (r.isNull("closedAt")) null else number(r, "closedAt"),
            number(r, "rev"),
        )
    }

    private fun readShop(r: JSONObject): Shopping {
        keys(r, shopKeys)
        return Shopping(
            string(r, "id"),
            string(r, "name"),
            number(r, "quantityMilli"),
            string(r, "unit"),
            string(r, "note"),
            string(r, "status"),
            nullable(r, "previousStatus"),
            nullable(r, "stockId"),
            number(r, "createdAt"),
            number(r, "updatedAt"),
            number(r, "rev"),
        )
    }

    private fun readEditor(r: JSONObject): Editor {
        keys(r, setOf("kind", "id", "baseRev", "sourceShopId", "sourceShopRev", "values"))
        val values = objectValue(r, "values")
        keys(values, valueKeys)
        return Editor(
            string(r, "kind"),
            string(r, "id"),
            number(r, "baseRev"),
            nullable(r, "sourceShopId"),
            number(r, "sourceShopRev"),
            valueKeys.associateWith { string(values, it) },
        )
    }
}
