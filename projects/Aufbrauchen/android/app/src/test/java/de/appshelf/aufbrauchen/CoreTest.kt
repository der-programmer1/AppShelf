package de.appshelf.aufbrauchen

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CoreTest {
    private val now = 1_793_793_600_000L

    private fun data(): Data {
        val e = Rules.editor("item", "item-1")
        return Rules.saveEditor(
            Data(),
            e.copy(
                values =
                    e.values +
                        mapOf(
                            "name" to "Äpfel",
                            "amount" to "1,5",
                            "unit" to "kg",
                            "date" to "2026-11-05",
                        )
            ),
            now,
        )
    }

    @Test
    fun exactQuantitiesAndBoundaries() {
        listOf("0,001" to 1L, "1.5" to 1500L, "0001,25" to 1250L, "1000000" to 1000000000L)
            .forEach { (s, n) ->
                assertEquals(n, Rules.quantity(s))
                assertEquals(n, Rules.quantity(Rules.amount(n)))
            }
        listOf("0", "-1", "1,2345", "1e3", "Infinity", "1000000,001", " ", "1,").forEach {
            assertTrue(runCatching { Rules.quantity(it) }.isFailure)
        }
    }

    @Test
    fun calendarDatesDoNotDeleteFood() {
        assertEquals("2028-02-29", Rules.plusDays("2028-02-28", 1))
        assertEquals("2026-10-26", Rules.plusDays("2026-10-24", 2))
        val d = data()
        assertEquals(1, Rules.due(d, "2026-11-02").size)
        assertEquals(0, Rules.due(d, "2026-10-31").size)
        assertEquals(1, d.items.size)
    }

    @Test
    fun completeBackupRoundTrip() {
        var d = data()
        d = Rules.action(d, "item-1", "consume", now + 1, 250)
        d = Rules.action(d, "item-1", "shopping", now + 2, newId = "shop-1")
        assertEquals(d, Codec.decode(Codec.encode(d)))
    }

    @Test
    fun invalidFieldsNeverAlterData() {
        val d = data()
        val original = Codec.encode(d)
        listOf(
                "quantityMilli" to 0,
                "quantityMilli" to 1.5,
                "name" to "",
                "date" to "2026-02-30",
                "dateKind" to "unknown",
                "status" to "unknown",
                "unit" to "unknown",
                "rev" to "1",
                "note" to "\uD800",
            )
            .forEach { (field, value) ->
                val json = JSONObject(original)
                json.getJSONArray("items").getJSONObject(0).put(field, value)
                assertTrue(field, runCatching { Codec.decode(json.toString()) }.isFailure)
            }
        assertEquals(original, Codec.encode(d))
    }

    @Test
    fun strictSyntaxRejectsDuplicatesAndExtensions() {
        val good = Codec.encode(Data())
        listOf(
                "{\"format\":\"a\",\"format\":\"b\"}",
                good + "{}",
                "/* comment */" + good,
                "[".repeat(1000) + "]".repeat(1000),
                good.replace("\"revision\":0", "\"revision\":01"),
            )
            .forEach { assertTrue(runCatching { Codec.decode(it) }.isFailure) }
    }

    @Test
    fun mergePreservesLocalConflictsAndSettings() {
        val local = data()
        val e = Rules.editor("item", "new-1")
        val fresh =
            Rules.saveEditor(Data(), e.copy(values = e.values + mapOf("name" to "Reis")), now)
        val incoming =
            local.copy(
                settings = Settings(14),
                items = listOf(local.items[0].copy(name = "Nicht überschreiben")) + fresh.items,
            )
        val merged = Rules.merge(local, incoming)
        assertEquals("Äpfel", merged.items[0].name)
        assertEquals(3, merged.settings.soonDays)
        assertEquals(2, merged.items.size)
        assertEquals(merged, Rules.merge(merged, incoming))
    }

    @Test
    fun undoRetainsAllItemFields() {
        val state = State(data())
        val changed =
            Rules.commit(state, Rules.action(state.data, "item-1", "trash", now + 1), "Gelöscht")
        val undo = Rules.undo(changed)
        assertEquals(state.data.items, undo.data.items)
        assertEquals(2L, undo.data.revision)
        assertNull(undo.undo)
        assertTrue(
            runCatching { Rules.undo(changed.copy(data = changed.data.copy(revision = 99))) }
                .isFailure
        )
    }

    @Test
    fun crossTypeIdConflictsAndBrokenReferencesRejected() {
        val local = data()
        val shop = Shopping("item-1", "Einkauf", 1000, "piece", "", "open", null, null, now, now, 1)
        assertTrue(runCatching { Rules.merge(local, Data(shopping = listOf(shop))) }.isFailure)
        assertTrue(
            runCatching {
                    Codec.validate(
                        Data(
                            shopping =
                                listOf(
                                    shop.copy(
                                        id = "shop-a",
                                        status = "stocked",
                                        stockId = "missing",
                                    )
                                )
                        )
                    )
                }
                .isFailure
        )
    }

    @Test
    fun duplicateRecordsAndOversizedBackupsRejected() {
        assertTrue(runCatching { Codec.decode("") }.isFailure)
        assertTrue(runCatching { Codec.decode(" ".repeat(Codec.MAX_DOCUMENT + 1)) }.isFailure)
        val d = data()
        assertTrue(runCatching { Codec.validate(d.copy(items = d.items + d.items)) }.isFailure)
    }

    @Test
    fun localEnvelopeRetainsDraftAndUndo() {
        val e =
            Rules.editor("item", "draft-1").let {
                it.copy(values = it.values + ("name" to "Noch ein Gedanke"))
            }
        val s = State(data(), e)
        val changed =
            Rules.commit(s, Rules.action(s.data, "item-1", "favorite", now + 1), "Vorlage")
        assertEquals(changed, Codec.decodeState(Codec.encodeState(changed)))
    }
}
