package de.appshelf.weiter

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class RulesTest {
    private val day = "2026-11-02"
    private val now = LocalDate.parse(day).atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    @Test fun freshThoughtHasIdentityTimestampsAndInboxStatus() {
        val first = Rules.newEntry("  Paket zurückschicken  ", now)
        val second = Rules.newEntry("Paket zurückschicken", now)
        assertEquals("Paket zurückschicken", first.thought)
        assertEquals(EntryStatus.INBOX, first.status)
        assertEquals(now, first.createdAt)
        assertEquals(now, first.updatedAt)
        assertNotEquals(first.id, second.id)
    }

    @Test fun emptyInitialThoughtIsRejected() {
        expectInvalid { Rules.newEntry(" \n\t", now) }
    }

    @Test fun sharedLinksAreExtractedWithoutCallingNetwork() {
        val entry = Rules.newEntry("Hier https://example.org/form?q=1. Oder https://example.org/form?q=1.", now)
        assertEquals(listOf("https://example.org/form?q=1"), entry.links)
        assertTrue(Rules.newEntry("http:// und kein gültiger Link", now).links.isEmpty())
        val malformed = Rules.newEntry("Nachsehen: https://example.com/[x", now)
        assertTrue(malformed.links.isEmpty())
        assertEquals(malformed, BackupCodec.decode(BackupCodec.encode(AppData(listOf(malformed)))).entries.single())
    }

    @Test fun concreteStepCanBeClarifiedForToday() {
        val inbox = Rules.newEntry("Arzt", now).copy(nextStep = "  Telefonnummer heraussuchen  ", minutes = 5, place = Place.ONLINE)
        val task = Rules.clarify(inbox, now + 100)
        assertEquals(EntryStatus.TODAY, task.status)
        assertEquals("Telefonnummer heraussuchen", task.nextStep)
        assertEquals(inbox.id, task.id)
        assertEquals(now + 100, task.updatedAt)
    }

    @Test fun clarificationRejectsVagueEmptyNextStep() {
        expectInvalid { Rules.clarify(Rules.newEntry("Formular", now), now) }
    }

    @Test fun futureDateParksClarifiedEntry() {
        val task = Rules.clarify(Rules.newEntry("Waschmittel", now).copy(nextStep = "Waschmittel kaufen", dueDate = "2026-11-03"), now)
        assertEquals(EntryStatus.PARKED, task.status)
        assertEquals("2026-11-03", task.dueDate)
    }

    @Test fun explicitLaterWithoutDateStaysParked() {
        val task = Rules.clarify(Rules.newEntry("Idee", now).copy(nextStep = "Skizze zeichnen", status = EntryStatus.PARKED), now)
        assertEquals(EntryStatus.PARKED, task.status)
        assertNull(task.dueDate)
    }

    @Test fun parkedDueEntryAppearsTodayWithoutMutatingOrDeletingIt() {
        val due = Rules.park(Rules.newEntry("Morgen", now), "2026-11-03", now)
        val data = AppData(listOf(due))
        assertTrue(Rules.todayEntries(data, day).isEmpty())
        assertEquals(listOf(due), Rules.todayEntries(data, "2026-11-03"))
        assertEquals(listOf(due), Rules.todayEntries(data, "2026-11-04"))
        assertEquals(EntryStatus.PARKED, data.entries.single().status)
        assertTrue(Rules.parkedEntries(data, "2026-11-03").isEmpty())
    }

    @Test fun everyTodayEntryRemainsAvailableBeyondTopThree() {
        val tasks = (0..6).map { Rules.clarify(Rules.newEntry("Aufgabe $it", now + it).copy(nextStep = "Schritt $it"), now + it) }
        val data = AppData(tasks.reversed())
        assertEquals(tasks, Rules.todayEntries(data, day))
        assertEquals(7, Rules.todayEntries(data, day).size)
    }

    @Test fun completeAndReopenRestorePreviousContextAndKeepContent() {
        val initial = Rules.park(Rules.newEntry("Paket", now).copy(nextStep = "Etikett drucken", notes = "Bestellnummer separat", place = Place.ONLINE), "2026-11-09", now)
        val done = Rules.complete(initial, now + 1)
        assertEquals(EntryStatus.DONE, done.status)
        assertEquals(day, done.completedDate)
        val reopened = Rules.reopen(done, now + 2)
        assertEquals(EntryStatus.PARKED, reopened.status)
        assertEquals(initial.thought, reopened.thought)
        assertEquals(initial.notes, reopened.notes)
        assertEquals(initial.dueDate, reopened.dueDate)
        assertNull(reopened.completedDate)
    }

    @Test fun inboxCanBeDoneThenReopenedAsInbox() {
        val entry = Rules.newEntry("Schon erledigt", now)
        assertEquals(EntryStatus.INBOX, Rules.reopen(Rules.complete(entry, now), now).status)
    }

    @Test fun deletingAndUndoPreserveAllUserData() {
        val attachment = Attachment("photo-1", "Foto.jpg", "image/jpeg", "/9j/2Q==")
        val entry = Rules.newEntry("Paket", now).copy(nextStep = "Etikett drucken", notes = "Notiz", place = Place.HOME,
            reminderAt = now + 60_000, attachments = listOf(attachment))
        val deleted = Rules.trash(entry, now + 1)
        assertEquals(EntryStatus.TRASH, deleted.status)
        val restored = Rules.restore(deleted, now + 2)
        assertEquals(entry.copy(updatedAt = now + 2), restored)
    }

    @Test fun deletedCompletedTaskRestoresAsCompleted() {
        val done = Rules.complete(Rules.newEntry("Erledigt", now), now)
        val restored = Rules.restore(Rules.trash(done, now + 1), now + 2)
        assertEquals(EntryStatus.DONE, restored.status)
        assertEquals(day, restored.completedDate)
    }

    @Test fun undatedParkedTaskSurvivesCompleteDeleteRestoreAndReopen() {
        val parked = Rules.park(Rules.newEntry("Später", now).copy(nextStep = "Skizze zeichnen"), null, now)
        val done = Rules.complete(parked, now)
        val restored = Rules.restore(Rules.trash(done, now), now)
        assertEquals(EntryStatus.DONE, restored.status)
        assertEquals(EntryStatus.PARKED, Rules.reopen(restored, now).status)
    }

    @Test fun trashIsExcludedFromTodayAndParkedViews() {
        val deleted = Rules.trash(Rules.park(Rules.newEntry("Parken", now), "2026-11-03", now), now)
        assertTrue(Rules.todayEntries(AppData(listOf(deleted)), day).isEmpty())
        assertTrue(Rules.parkedEntries(AppData(listOf(deleted)), day).isEmpty())
    }

    private fun expectInvalid(block: () -> Unit) {
        try { block(); fail("Expected validation failure") } catch (_: IllegalArgumentException) { }
    }
}
