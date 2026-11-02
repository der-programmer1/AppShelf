package de.appshelf.weiter

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class BackupCodecTest {
    private val entry = Entry("entry-1", "Paket zurückschicken", "Etikett drucken", "Ohne Konto", EntryStatus.TODAY,
        Place.ONLINE, 15, "2026-11-02", 1_800_000_000_000L, 1_700_000_000_000L, 1_700_000_000_001L,
        attachments = listOf(Attachment("photo-1", "Foto.jpg", "image/jpeg", "/9j/2Q==")), links = listOf("https://example.org/form?q=1"))
    private val data = AppData(listOf(entry), "Noch ein Gedanke", TimerState("entry-1", 1_900_000_000_000L, 25))

    @Test fun backupRoundTripPreservesAllPortableFieldsAndAttachments() {
        val text = BackupCodec.encode(data)
        assertEquals(data.copy(timer = null), BackupCodec.decode(text))
        assertFalse(JSONObject(text).has("timer"))
    }

    @Test fun localStorageRoundTripPreservesRunningTimer() {
        assertEquals(data, BackupCodec.decodeStorage(BackupCodec.encodeStorage(data)))
    }

    @Test fun emptyBackupIsValid() {
        assertEquals(AppData(), BackupCodec.decode(BackupCodec.encode(AppData())))
    }

    @Test fun wrongFileMissingFieldsAndFutureVersionsAreRejected() {
        expectInvalid { BackupCodec.decode("not JSON") }
        expectInvalid { BackupCodec.decode("[]") }
        expectInvalid { BackupCodec.decode("{}") }
        expectInvalid { BackupCodec.decode("{\"format\":\"other\",\"version\":1,\"entries\":[],\"draft\":\"\"}") }
        expectInvalid { BackupCodec.decode(document().put("version", 2).toString()) }
        expectInvalid { BackupCodec.decode(document().put("unexpected", true).toString()) }
    }

    @Test fun trailingGarbageIsRejected() {
        expectInvalid { BackupCodec.decode(BackupCodec.encode(data) + "secret trailing text") }
        expectInvalid { BackupCodec.decode(BackupCodec.encode(data) + " {}") }
    }

    @Test fun hostileNestingIsRejectedBeforeRecursiveParsing() {
        expectInvalid { BackupCodec.decode("[".repeat(1000) + "]".repeat(1000)) }
        val bracesInText = data.copy(draft = "[".repeat(1000) + "\\\" example")
        assertEquals(bracesInText.copy(timer = null), BackupCodec.decode(BackupCodec.encode(bracesInText)))
    }

    @Test fun lenientAndroidJsonExtensionsAndDuplicateKeysAreRejected() {
        val encoded = BackupCodec.encode(data)
        listOf(
            "/* comment */" + encoded,
            encoded.replace('"', '\''),
            encoded.replaceFirst("\"format\":", "format:"),
            encoded.dropLast(1) + ",}",
            encoded.replaceFirst("\"version\":1", "\"version\":01"),
            encoded.replaceFirst("\"draft\":", "\"draft\":\"first\",\"draft\":"),
            "{\"format\":\"weiter-backup\",\"version\":1,\"draft\":\"\\x\",\"entries\":[]}"
        ).forEach { malformed -> expectInvalid { BackupCodec.decode(malformed) } }
    }

    @Test fun emojiAndEscapedUnicodeRoundTripButIsolatedSurrogatesAreRejected() {
        val emoji = data.copy(draft = "Weiter 🧭: Schritt für Schritt")
        assertEquals(emoji.copy(timer = null), BackupCodec.decode(BackupCodec.encode(emoji)))
        expectInvalid { BackupCodec.encode(data.copy(draft = "\uD800")) }
        expectInvalid { BackupCodec.decode("{\"format\":\"weiter-backup\",\"version\":1,\"draft\":\"\\uD800\",\"entries\":[]}") }
    }

    @Test fun numericStringsAndFractionsAreRejected() {
        expectEntryInvalid("minutes", "15")
        expectEntryInvalid("minutes", 1.5)
        expectEntryInvalid("createdAt", "1700000000000")
        expectEntryInvalid("reminderAt", 1.1)
    }

    @Test fun unknownStatusContextAndInvalidTypesAreRejected() {
        expectEntryInvalid("status", "MAYBE")
        expectEntryInvalid("place", "MOON")
        expectEntryInvalid("thought", JSONObject.NULL)
        expectEntryInvalid("attachments", "not an array")
    }

    @Test fun duplicateAndPathBearingIdsAreRejected() {
        val root = document()
        root.getJSONArray("entries").put(root.getJSONArray("entries").getJSONObject(0))
        expectInvalid { BackupCodec.decode(root.toString()) }
        expectEntryInvalid("id", "../../state")
    }

    @Test fun invalidDatesTimestampsAndDurationAreRejected() {
        expectEntryInvalid("dueDate", "2026-02-30")
        expectEntryInvalid("completedDate", "tomorrow")
        expectEntryInvalid("createdAt", -1)
        expectEntryInvalid("updatedAt", -1)
        expectEntryInvalid("minutes", 0)
        expectEntryInvalid("minutes", 1441)
    }

    @Test fun malformedAttachmentAndUnsafeNamesAreRejected() {
        listOf("../secret", "a/b.jpg", "a\\b.jpg", "a\u0000b.jpg", "").forEach { name ->
            val root = document()
            root.getJSONArray("entries").getJSONObject(0).getJSONArray("attachments").getJSONObject(0).put("name", name)
            expectInvalid { BackupCodec.decode(root.toString()) }
        }
        listOf("%%%", "/9j/2Q", "").forEach { invalid ->
            val root = document()
            root.getJSONArray("entries").getJSONObject(0).getJSONArray("attachments").getJSONObject(0).put("base64", invalid)
            expectInvalid { BackupCodec.decode(root.toString()) }
        }
        val root = document()
        root.getJSONArray("entries").getJSONObject(0).getJSONArray("attachments").getJSONObject(0).put("mime", "application/x-executable")
        expectInvalid { BackupCodec.decode(root.toString()) }
    }

    @Test fun tooManyAttachmentsAndOversizeTextAreRejected() {
        val root = document()
        val attachments = root.getJSONArray("entries").getJSONObject(0).getJSONArray("attachments")
        repeat(8) { index -> attachments.put(JSONObject().put("id", "attachment-$index").put("name", "Foto.jpg")
            .put("mime", "image/jpeg").put("base64", "/9j/2Q==")) }
        expectInvalid { BackupCodec.decode(root.toString()) }
        expectEntryInvalid("thought", "a".repeat(BackupCodec.MAX_TEXT_LENGTH + 1))
    }

    @Test fun importMergesNewRecordsButPreservesLocalConflictsDraftAndTimer() {
        val incoming = AppData(listOf(entry.copy(thought = "Should never overwrite"), entry.copy(id = "entry-2", attachments = emptyList())), "Imported draft")
        val merged = BackupCodec.merge(data, incoming)
        assertEquals(2, merged.entries.size)
        assertEquals(entry, merged.entries.first())
        assertEquals(data.draft, merged.draft)
        assertEquals(data.timer, merged.timer)
        assertEquals(merged, BackupCodec.merge(merged, incoming))
    }

    @Test fun importUsesPortableDraftWhenLocalDraftIsEmpty() {
        assertEquals("Imported", BackupCodec.merge(AppData(), AppData(draft = "Imported")).draft)
    }

    @Test fun invalidImportCannotChangeExistingDataOrItsExport() {
        val before = BackupCodec.encode(data)
        expectInvalid {
            val incoming = BackupCodec.decode(document().put("entries", JSONArray().put(JSONObject().put("id", "broken"))).toString())
            BackupCodec.merge(data, incoming)
        }
        assertEquals(before, BackupCodec.encode(data))
        expectInvalid { BackupCodec.merge(data, AppData(listOf(entry.copy(id = "bad/id")))) }
        assertEquals(before, BackupCodec.encode(data))
    }

    @Test fun malformedExternalLinksAreRejected() {
        expectEntryInvalid("links", JSONArray().put("file:///private/state"))
        expectEntryInvalid("links", JSONArray().put("javascript:alert(1)"))
    }

    @Test fun invalidTimerCannotBeWrittenToLocalStorage() {
        expectInvalid { BackupCodec.encodeStorage(data.copy(timer = TimerState("missing-entry", 1000, 5))) }
        expectInvalid { BackupCodec.encodeStorage(data.copy(timer = TimerState(entry.id, 1000, 0))) }
    }

    @Test fun incompleteEditedFieldsRemainSafelyPersistable() {
        val editing = AppData(listOf(entry.copy(thought = "", nextStep = "", attachments = emptyList())))
        assertEquals(editing, BackupCodec.decode(BackupCodec.encode(editing)))
    }

    private fun document() = JSONObject(BackupCodec.encode(data))
    private fun expectEntryInvalid(key: String, value: Any) {
        val root = document()
        root.getJSONArray("entries").getJSONObject(0).put(key, value)
        expectInvalid { BackupCodec.decode(root.toString()) }
    }
    private fun expectInvalid(block: () -> Unit) {
        try { block(); fail("Expected validation failure") } catch (_: IllegalArgumentException) { }
    }
}
