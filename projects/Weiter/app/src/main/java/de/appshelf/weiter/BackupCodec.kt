package de.appshelf.weiter

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.json.JSONTokener
import java.net.URI
import java.time.LocalDate
import java.util.Base64

/** Versioned, bounded backup format. Decoding is pure and cannot modify local data. */
object BackupCodec {
    const val MAX_TEXT_LENGTH = 10_000
    const val MAX_NOTES_LENGTH = 50_000
    const val MAX_ENTRIES = 2_000
    const val MAX_ATTACHMENTS = 8
    const val MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024
    const val MAX_TOTAL_ATTACHMENT_BYTES = 16 * 1024 * 1024
    const val MAX_JSON_BYTES = 24 * 1024 * 1024
    private const val MAX_TIMESTAMP = 253_402_300_799_999L
    private val idPattern = Regex("[A-Za-z0-9_-]{1,128}")
    private val datePattern = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")
    private val mimeTypes = setOf("image/jpeg", "image/png", "image/webp", "audio/mp4", "audio/3gpp",
        "audio/m4a", "audio/aac", "audio/mpeg", "audio/ogg", "audio/wav")

    fun encode(data: AppData): String = encodeDocument(data.copy(timer = null), false)
    fun decode(text: String): AppData = decodeDocument(text, false)
    internal fun encodeStorage(data: AppData): String = encodeDocument(data, true)
    internal fun decodeStorage(text: String): AppData = decodeDocument(text, true)

    /** Imported IDs never replace local records; repeated imports are idempotent. */
    fun merge(local: AppData, incoming: AppData): AppData {
        validate(local)
        validate(incoming)
        val existingIds = local.entries.mapTo(HashSet()) { it.id }
        val merged = local.copy(entries = local.entries + incoming.entries.filter { it.id !in existingIds },
            draft = local.draft.ifBlank { incoming.draft })
        validate(merged)
        return merged
    }

    fun validate(data: AppData) {
        require(data.entries.size <= MAX_ENTRIES) { "Die Sicherung enthält zu viele Einträge." }
        require(data.draft.length <= MAX_TEXT_LENGTH) { "Der Entwurf ist zu lang." }
        validUnicode(data.draft)
        val ids = HashSet<String>()
        val attachmentIds = HashSet<String>()
        var attachmentBytes = 0L
        data.entries.forEach { entry ->
            validId(entry.id)
            require(ids.add(entry.id)) { "Die Sicherung enthält doppelte Einträge." }
            require(entry.thought.length <= MAX_TEXT_LENGTH && entry.nextStep.length <= MAX_TEXT_LENGTH &&
                entry.notes.length <= MAX_NOTES_LENGTH) { "Ein Text in der Sicherung ist zu lang." }
            validUnicode(entry.thought)
            validUnicode(entry.nextStep)
            validUnicode(entry.notes)
            require(entry.minutes in 1..1440) { "Die Dauer muss zwischen 1 und 1440 Minuten liegen." }
            validTimestamp(entry.createdAt)
            validTimestamp(entry.updatedAt)
            entry.reminderAt?.let { validTimestamp(it); require(it > 0) { "Die Erinnerung ist ungültig." } }
            entry.dueDate?.let(::validDate)
            entry.completedDate?.let(::validDate)
            require(entry.attachments.size <= MAX_ATTACHMENTS) { "Ein Eintrag enthält zu viele Anhänge." }
            entry.attachments.forEach { attachment ->
                validId(attachment.id)
                require(attachmentIds.add(attachment.id)) { "Die Sicherung enthält doppelte Anhänge." }
                require(attachment.name.isNotBlank() && attachment.name.length <= 200 &&
                    attachment.name != "." && attachment.name != ".." &&
                    attachment.name.none { it == '/' || it == '\\' || it.isISOControl() }) {
                    "Ein Anhang hat einen ungültigen Dateinamen."
                }
                validUnicode(attachment.name)
                require(attachment.mime in mimeTypes) { "Dieser Anhangtyp wird nicht unterstützt." }
                require(attachment.base64.isNotEmpty() && attachment.base64.length <= 4 * ((MAX_ATTACHMENT_BYTES + 2) / 3)) {
                    "Ein Anhang ist leer oder zu groß."
                }
                val decoded = try { Base64.getDecoder().decode(attachment.base64) }
                    catch (_: IllegalArgumentException) { throw IllegalArgumentException("Ein Anhang ist ungültig kodiert.") }
                require(decoded.isNotEmpty() && decoded.size <= MAX_ATTACHMENT_BYTES &&
                    Base64.getEncoder().encodeToString(decoded) == attachment.base64) { "Ein Anhang ist ungültig kodiert." }
                attachmentBytes += decoded.size
                require(attachmentBytes <= MAX_TOTAL_ATTACHMENT_BYTES) { "Die Anhänge der Sicherung sind insgesamt zu groß." }
            }
            require(entry.links.size <= 64) { "Ein Eintrag enthält zu viele Links." }
            entry.links.forEach { link ->
                validUnicode(link)
                require(link.length in 1..2048 && validLink(link)) { "Ein gespeicherter Link ist ungültig." }
            }
        }
        data.timer?.let { timer ->
            validId(timer.entryId)
            require(timer.entryId in ids && timer.durationMinutes in 1..1440) { "Der Fokus-Timer ist ungültig." }
            validTimestamp(timer.endsAt)
            require(timer.endsAt > 0) { "Der Fokus-Timer ist ungültig." }
        }
    }

    /** The Android org.json parser is intentionally lenient; reject non-JSON first. */
    private fun checkNesting(text: String) { StrictJsonSyntax(text).validate() }

    private fun encodeDocument(data: AppData, storage: Boolean): String {
        validate(data)
        val document = JSONObject().put("format", if (storage) "weiter-local" else "weiter-backup")
            .put("version", 1).put("draft", data.draft)
            .put("entries", JSONArray().also { entries -> data.entries.forEach { entries.put(encodeEntry(it)) } })
        if (storage) document.put("timer", data.timer?.let {
            JSONObject().put("entryId", it.entryId).put("endsAt", it.endsAt).put("durationMinutes", it.durationMinutes)
        } ?: JSONObject.NULL)
        val encoded = document.toString()
        require(encoded.toByteArray(Charsets.UTF_8).size <= MAX_JSON_BYTES) { "Die Sicherungsdatei ist zu groß." }
        return encoded
    }

    private fun encodeEntry(entry: Entry): JSONObject = JSONObject()
        .put("id", entry.id).put("thought", entry.thought).put("nextStep", entry.nextStep).put("notes", entry.notes)
        .put("status", entry.status.name).put("place", entry.place.name).put("minutes", entry.minutes)
        .put("dueDate", entry.dueDate ?: JSONObject.NULL).put("reminderAt", entry.reminderAt ?: JSONObject.NULL)
        .put("createdAt", entry.createdAt).put("updatedAt", entry.updatedAt)
        .put("completedDate", entry.completedDate ?: JSONObject.NULL)
        .put("previousStatus", entry.previousStatus?.name ?: JSONObject.NULL)
        .put("attachments", JSONArray().also { array -> entry.attachments.forEach {
            array.put(JSONObject().put("id", it.id).put("name", it.name).put("mime", it.mime).put("base64", it.base64))
        } }).put("links", JSONArray().also { array -> entry.links.forEach { array.put(it) } })

    private fun decodeDocument(text: String, storage: Boolean): AppData {
        require(text.toByteArray(Charsets.UTF_8).size <= MAX_JSON_BYTES) { "Die Sicherungsdatei ist zu groß." }
        checkNesting(text)
        try {
            val tokener = JSONTokener(text)
            val root = tokener.nextValue() as? JSONObject ?: badFormat()
            require(tokener.nextClean() == '\u0000') { "Die Datei enthält zusätzliche ungültige Daten." }
            val rootKeys = setOf("format", "version", "draft", "entries") + if (storage) setOf("timer") else emptySet()
            checkKeys(root, rootKeys)
            require(string(root, "format") == if (storage) "weiter-local" else "weiter-backup") { "Das ist keine passende Weiter-Sicherung." }
            require(integer(root, "version") == 1L) { "Diese Sicherungsversion wird nicht unterstützt." }
            val entries = array(root, "entries")
            require(entries.length() <= MAX_ENTRIES) { "Die Sicherung enthält zu viele Einträge." }
            val decoded = ArrayList<Entry>(entries.length())
            for (index in 0 until entries.length()) {
                val value = entries.get(index) as? JSONObject ?: badFormat()
                decoded.add(decodeEntry(value))
            }
            val timer = if (storage && !root.isNull("timer")) {
                val value = root.get("timer") as? JSONObject ?: badFormat()
                checkKeys(value, setOf("entryId", "endsAt", "durationMinutes"))
                TimerState(string(value, "entryId"), integer(value, "endsAt"), int(value, "durationMinutes"))
            } else null
            return AppData(decoded, string(root, "draft"), timer).also(::validate)
        } catch (_: JSONException) {
            throw IllegalArgumentException("Die Datei enthält kein gültiges Weiter-JSON.")
        }
    }

    private fun decodeEntry(value: JSONObject): Entry {
        checkKeys(value, setOf("id", "thought", "nextStep", "notes", "status", "place", "minutes", "dueDate", "reminderAt",
            "createdAt", "updatedAt", "completedDate", "previousStatus", "attachments", "links"))
        val attachmentArray = array(value, "attachments")
        require(attachmentArray.length() <= MAX_ATTACHMENTS) { "Ein Eintrag enthält zu viele Anhänge." }
        val attachments = ArrayList<Attachment>()
        for (index in 0 until attachmentArray.length()) {
            val attachment = attachmentArray.get(index) as? JSONObject ?: badFormat()
            checkKeys(attachment, setOf("id", "name", "mime", "base64"))
            attachments.add(Attachment(string(attachment, "id"), string(attachment, "name"),
                string(attachment, "mime"), string(attachment, "base64")))
        }
        val linkArray = array(value, "links")
        require(linkArray.length() <= 64) { "Ein Eintrag enthält zu viele Links." }
        val links = (0 until linkArray.length()).map { linkArray.get(it) as? String ?: badFormat() }
        return Entry(id = string(value, "id"), thought = string(value, "thought"), nextStep = string(value, "nextStep"),
            notes = string(value, "notes"), status = enumValue(string(value, "status")), place = enumValue(string(value, "place")),
            minutes = int(value, "minutes"), dueDate = nullableString(value, "dueDate"),
            reminderAt = if (value.isNull("reminderAt")) null else integer(value, "reminderAt"),
            createdAt = integer(value, "createdAt"), updatedAt = integer(value, "updatedAt"),
            completedDate = nullableString(value, "completedDate"),
            previousStatus = nullableString(value, "previousStatus")?.let { enumValue<EntryStatus>(it) },
            attachments = attachments, links = links)
    }

    private inline fun <reified T : Enum<T>> enumValue(value: String): T =
        enumValues<T>().firstOrNull { it.name == value } ?: throw IllegalArgumentException("Die Sicherung enthält einen unbekannten Status oder Kontext.")

    private fun checkKeys(value: JSONObject, expected: Set<String>) {
        val found = HashSet<String>()
        val keys = value.keys()
        while (keys.hasNext()) found.add(keys.next())
        require(found == expected) { "Die Struktur der Sicherungsdatei ist ungültig oder unvollständig." }
    }
    private fun string(value: JSONObject, key: String): String = value.get(key) as? String ?: badFormat()
    private fun nullableString(value: JSONObject, key: String): String? = if (value.isNull(key)) null else string(value, key)
    private fun array(value: JSONObject, key: String): JSONArray = value.get(key) as? JSONArray ?: badFormat()
    private fun integer(value: JSONObject, key: String): Long {
        val number = value.get(key)
        require(number is Int || number is Long) { "Die Sicherung enthält eine ungültige Zahl." }
        return (number as Number).toLong()
    }
    private fun int(value: JSONObject, key: String): Int = integer(value, key).also {
        require(it in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) { "Die Sicherung enthält eine zu große Zahl." }
    }.toInt()
    private fun validId(id: String) { require(idPattern.matches(id)) { "Die Sicherung enthält eine ungültige Kennung." } }
    private fun validTimestamp(value: Long) { require(value in 0..MAX_TIMESTAMP) { "Die Sicherung enthält ein ungültiges Datum." } }
    private fun validDate(value: String) {
        require(datePattern.matches(value)) { "Die Sicherung enthält ein ungültiges Tagesdatum." }
        try { require(LocalDate.parse(value).toString() == value) }
        catch (_: Exception) { throw IllegalArgumentException("Die Sicherung enthält ein ungültiges Tagesdatum.") }
    }
    private fun validUnicode(value: String) {
        var high = false
        value.forEach { character ->
            when {
                high -> { require(character.isLowSurrogate()) { "Ein Text enthält ungültige Unicode-Zeichen." }; high = false }
                character.isHighSurrogate() -> high = true
                character.isLowSurrogate() -> throw IllegalArgumentException("Ein Text enthält ungültige Unicode-Zeichen.")
            }
        }
        require(!high) { "Ein Text enthält ungültige Unicode-Zeichen." }
    }
    internal fun validLink(value: String): Boolean = try {
        val uri = URI(value)
        (uri.scheme.equals("http", true) || uri.scheme.equals("https", true)) && !uri.rawAuthority.isNullOrBlank()
    } catch (_: Exception) { false }
    private fun badFormat(): Nothing = throw IllegalArgumentException("Die Struktur der Sicherungsdatei ist ungültig.")
}

/** Bounded RFC 8259 syntax check, including duplicate keys and well-formed Unicode strings. */
private class StrictJsonSyntax(private val text: String) {
    private var position = 0

    fun validate() {
        whitespace()
        value(0)
        whitespace()
        require(position == text.length) { "Die Datei enthält zusätzliche ungültige Daten." }
    }

    private fun value(depth: Int) {
        require(depth <= 12) { "Die Sicherungsdatei ist zu tief verschachtelt." }
        whitespace()
        when (peek()) {
            '{' -> objectValue(depth)
            '[' -> arrayValue(depth)
            '"' -> stringValue()
            't' -> literal("true")
            'f' -> literal("false")
            'n' -> literal("null")
            '-', in '0'..'9' -> number()
            else -> invalid()
        }
    }

    private fun objectValue(depth: Int) {
        position++
        whitespace()
        if (take('}')) return
        val keys = HashSet<String>()
        while (true) {
            whitespace()
            require(peek() == '"') { "Die Sicherungsdatei enthält ungültiges JSON." }
            require(keys.add(stringValue(capture = true))) { "Die Sicherungsdatei enthält doppelte Feldnamen." }
            whitespace()
            if (!take(':')) invalid()
            value(depth + 1)
            whitespace()
            if (take('}')) return
            if (!take(',')) invalid()
        }
    }

    private fun arrayValue(depth: Int) {
        position++
        whitespace()
        if (take(']')) return
        while (true) {
            value(depth + 1)
            whitespace()
            if (take(']')) return
            if (!take(',')) invalid()
        }
    }

    private fun stringValue(capture: Boolean = false): String {
        if (!take('"')) invalid()
        val decoded = if (capture) StringBuilder() else null
        var highSurrogate = false
        while (position < text.length) {
            val source = text[position++]
            if (source == '"') {
                if (highSurrogate) invalid()
                return decoded?.toString().orEmpty()
            }
            val character = if (source == '\\') {
                if (position >= text.length) invalid()
                when (text[position++]) {
                    '"' -> '"'
                    '\\' -> '\\'
                    '/' -> '/'
                    'b' -> '\b'
                    'f' -> '\u000c'
                    'n' -> '\n'
                    'r' -> '\r'
                    't' -> '\t'
                    'u' -> {
                        if (text.length - position < 4) invalid()
                        var code = 0
                        repeat(4) {
                            val digit = when (val hex = text[position++]) {
                                in '0'..'9' -> hex - '0'
                                in 'a'..'f' -> hex - 'a' + 10
                                in 'A'..'F' -> hex - 'A' + 10
                                else -> invalid()
                            }
                            code = code * 16 + digit
                        }
                        code.toChar()
                    }
                    else -> invalid()
                }
            } else {
                if (source < ' ') invalid()
                source
            }
            when {
                highSurrogate -> { if (!character.isLowSurrogate()) invalid(); highSurrogate = false }
                character.isHighSurrogate() -> highSurrogate = true
                character.isLowSurrogate() -> invalid()
            }
            decoded?.append(character)
        }
        invalid()
    }

    private fun number() {
        take('-')
        if (take('0')) {
            if (peek() in '0'..'9') invalid()
        } else {
            if (peek() !in '1'..'9') invalid()
            while (peek() in '0'..'9') position++
        }
        if (take('.')) digits()
        if (take('e') || take('E')) {
            if (!take('+')) take('-')
            digits()
        }
    }

    private fun digits() {
        if (peek() !in '0'..'9') invalid()
        while (peek() in '0'..'9') position++
    }
    private fun literal(word: String) {
        if (!text.startsWith(word, position)) invalid()
        position += word.length
    }
    private fun whitespace() {
        while (peek() in charArrayOf(' ', '\t', '\n', '\r')) position++
    }
    private fun peek(): Char = text.getOrNull(position) ?: '\u0000'
    private fun take(character: Char): Boolean {
        if (peek() != character) return false
        position++
        return true
    }
    private fun invalid(): Nothing = throw IllegalArgumentException("Die Sicherungsdatei enthält ungültiges JSON.")
}
