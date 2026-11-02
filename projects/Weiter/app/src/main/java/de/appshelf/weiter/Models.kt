package de.appshelf.weiter

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

enum class EntryStatus { INBOX, TODAY, PARKED, DONE, TRASH }
enum class Place { HOME, OUTSIDE, ONLINE, WAITING }

data class Attachment(val id: String, val name: String, val mime: String, val base64: String)

data class Entry(
    val id: String,
    val thought: String,
    val nextStep: String = "",
    val notes: String = "",
    val status: EntryStatus = EntryStatus.INBOX,
    val place: Place = Place.HOME,
    val minutes: Int = 5,
    val dueDate: String? = null,
    val reminderAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = createdAt,
    val completedDate: String? = null,
    val previousStatus: EntryStatus? = null,
    val attachments: List<Attachment> = emptyList(),
    val links: List<String> = emptyList()
)

data class TimerState(val entryId: String, val endsAt: Long, val durationMinutes: Int)
data class AppData(val entries: List<Entry> = emptyList(), val draft: String = "", val timer: TimerState? = null)

/** Predictable local transitions; reaching a date never deletes or rewrites a task. */
object Rules {
    fun today(now: Long = System.currentTimeMillis()): String =
        Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault()).toLocalDate().toString()

    fun newEntry(text: String, now: Long = System.currentTimeMillis()): Entry {
        val thought = text.trim()
        require(thought.isNotEmpty()) { "Schreibe zuerst einen Gedanken auf." }
        require(thought.length <= BackupCodec.MAX_TEXT_LENGTH) { "Der Gedanke ist zu lang." }
        val links = Regex("https?://[^\\s<>\\\"]+", RegexOption.IGNORE_CASE)
            .findAll(thought).map { it.value.trimEnd('.', ',', ';', ')', '!', '?') }
            .filter { it.length <= 2048 && BackupCodec.validLink(it) }.distinct().take(64).toList()
        return Entry(id = UUID.randomUUID().toString(), thought = thought, createdAt = now, updatedAt = now, links = links)
    }

    fun complete(entry: Entry, now: Long = System.currentTimeMillis()): Entry {
        require(entry.status != EntryStatus.TRASH) { "Stelle den Eintrag zuerst wieder her." }
        if (entry.status == EntryStatus.DONE) return entry
        return entry.copy(status = EntryStatus.DONE, previousStatus = entry.status,
            completedDate = today(now), updatedAt = now)
    }

    fun reopen(entry: Entry, now: Long = System.currentTimeMillis()): Entry {
        require(entry.status == EntryStatus.DONE) { "Dieser Eintrag ist bereits offen." }
        val status = entry.previousStatus?.takeIf { it in OPEN_STATUSES }
            ?: openStatus(entry, today(now))
        return entry.copy(status = status, previousStatus = null, completedDate = null, updatedAt = now)
    }

    fun trash(entry: Entry, now: Long = System.currentTimeMillis()): Entry {
        if (entry.status == EntryStatus.TRASH) return entry
        // Keep the open state through DONE -> TRASH -> restore -> reopen as well.
        return entry.copy(status = EntryStatus.TRASH,
            previousStatus = if (entry.status == EntryStatus.DONE) entry.previousStatus ?: EntryStatus.DONE else entry.status,
            completedDate = if (entry.status == EntryStatus.DONE) entry.completedDate ?: today(now) else null,
            updatedAt = now)
    }

    fun restore(entry: Entry, now: Long = System.currentTimeMillis()): Entry {
        require(entry.status == EntryStatus.TRASH) { "Dieser Eintrag liegt nicht im Papierkorb." }
        val status = if (entry.completedDate != null) EntryStatus.DONE else
            entry.previousStatus?.takeIf { it != EntryStatus.TRASH } ?: openStatus(entry, today(now))
        return entry.copy(status = status,
            previousStatus = if (status == EntryStatus.DONE) entry.previousStatus?.takeIf { it in OPEN_STATUSES } else null,
            completedDate = if (status == EntryStatus.DONE) entry.completedDate else null, updatedAt = now)
    }

    fun park(entry: Entry, date: String?, now: Long = System.currentTimeMillis()): Entry {
        date?.let { LocalDate.parse(it) }
        return entry.copy(status = EntryStatus.PARKED, dueDate = date,
            previousStatus = null, completedDate = null, updatedAt = now)
    }

    fun clarify(entry: Entry, now: Long = System.currentTimeMillis()): Entry {
        require(entry.nextStep.isNotBlank()) { "Formuliere einen konkreten nächsten Schritt." }
        entry.dueDate?.let { LocalDate.parse(it) }
        val status = when {
            entry.dueDate != null && entry.dueDate > today(now) -> EntryStatus.PARKED
            entry.status == EntryStatus.PARKED && entry.dueDate == null -> EntryStatus.PARKED
            else -> EntryStatus.TODAY
        }
        return entry.copy(nextStep = entry.nextStep.trim(), status = status,
            previousStatus = null, completedDate = null, updatedAt = now)
    }

    fun todayEntries(data: AppData, today: String = today()): List<Entry> =
        data.entries.filter { it.status == EntryStatus.TODAY ||
            (it.status == EntryStatus.PARKED && it.dueDate != null && it.dueDate <= today) }
            .sortedWith(compareBy<Entry> { it.createdAt }.thenBy { it.id })

    fun parkedEntries(data: AppData, today: String = today()): List<Entry> =
        data.entries.filter { it.status == EntryStatus.PARKED && (it.dueDate == null || it.dueDate > today) }
            .sortedWith(compareBy<Entry> { it.dueDate ?: "9999-12-31" }.thenBy { it.createdAt }.thenBy { it.id })

    private fun openStatus(entry: Entry, today: String): EntryStatus = when {
        entry.nextStep.isBlank() -> EntryStatus.INBOX
        entry.dueDate != null && entry.dueDate > today -> EntryStatus.PARKED
        else -> EntryStatus.TODAY
    }

    private val OPEN_STATUSES = setOf(EntryStatus.INBOX, EntryStatus.TODAY, EntryStatus.PARKED)
}
