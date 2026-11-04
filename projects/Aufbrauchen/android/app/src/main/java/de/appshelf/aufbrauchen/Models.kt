package de.appshelf.aufbrauchen

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

object Labels {
    val units =
        linkedMapOf(
            "piece" to "Stück",
            "pack" to "Packung",
            "g" to "g",
            "kg" to "kg",
            "ml" to "ml",
            "l" to "l",
        )
    val places =
        linkedMapOf(
            "fridge" to "Kühlschrank",
            "freezer" to "Gefrierfach",
            "pantry" to "Vorratsschrank",
            "other" to "Anderer Ort",
        )
    val categories =
        linkedMapOf(
            "produce" to "Obst & Gemüse",
            "dairy" to "Milchprodukte & Eier",
            "dry" to "Brot & Trockenwaren",
            "frozen" to "Tiefgekühltes",
            "drinks" to "Getränke",
            "other" to "Sonstiges",
        )
    val dateKinds =
        linkedMapOf(
            "best_before" to "Mindesthaltbarkeit",
            "use_by" to "Verbrauchsdatum",
            "none" to "Ohne Datum",
        )
}

data class Settings(val soonDays: Int = 3, val onboarded: Boolean = false)

data class Item(
    val id: String,
    val name: String,
    val quantityMilli: Long,
    val unit: String,
    val place: String,
    val category: String,
    val date: String?,
    val dateKind: String,
    val openedOn: String?,
    val note: String,
    val favorite: Boolean,
    val status: String,
    val previousStatus: String?,
    val createdAt: Long,
    val updatedAt: Long,
    val closedAt: Long?,
    val rev: Long,
)

data class Shopping(
    val id: String,
    val name: String,
    val quantityMilli: Long,
    val unit: String,
    val note: String,
    val status: String,
    val previousStatus: String?,
    val stockId: String?,
    val createdAt: Long,
    val updatedAt: Long,
    val rev: Long,
)

data class Data(
    val revision: Long = 0,
    val settings: Settings = Settings(),
    val items: List<Item> = emptyList(),
    val shopping: List<Shopping> = emptyList(),
)

data class Editor(
    val kind: String,
    val id: String,
    val baseRev: Long,
    val sourceShopId: String?,
    val sourceShopRev: Long,
    val values: Map<String, String>,
)

data class Undo(val before: Data, val afterRevision: Long, val label: String)

data class State(val data: Data = Data(), val editor: Editor? = null, val undo: Undo? = null)

object Rules {
    const val MAX_QUANTITY = 1_000_000_000L

    fun today(now: Long = System.currentTimeMillis()): String =
        Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault()).toLocalDate().toString()

    fun plusDays(day: String, count: Int): String =
        LocalDate.parse(day).plusDays(count.toLong()).toString()

    fun quantity(text: String): Long {
        val source = text.trim()
        require(Regex("\\d{1,7}(?:[.,]\\d{1,3})?").matches(source)) {
            "Bitte eine Menge mit höchstens drei Nachkommastellen eingeben."
        }
        val parts = source.replace(',', '.').split('.')
        val value = parts[0].toLong() * 1000 + (parts.getOrNull(1) ?: "").padEnd(3, '0').toLong()
        require(value in 1..MAX_QUANTITY) { "Die Menge muss zwischen 0,001 und 1000000 liegen." }
        return value
    }

    fun amount(value: Long): String =
        (value / 1000).toString() +
            (value % 1000).toString().padStart(3, '0').trimEnd('0').let {
                if (it.isBlank()) "" else ",$it"
            }

    fun editor(
        kind: String,
        id: String = UUID.randomUUID().toString(),
        item: Item? = null,
        shop: Shopping? = null,
        source: Shopping? = null,
    ): Editor =
        Editor(
            kind,
            item?.id ?: shop?.id ?: id,
            item?.rev ?: shop?.rev ?: 0,
            source?.id,
            source?.rev ?: 0,
            linkedMapOf(
                "name" to (item?.name ?: shop?.name ?: source?.name ?: ""),
                "amount" to
                    amount(
                        item?.quantityMilli ?: shop?.quantityMilli ?: source?.quantityMilli ?: 1000
                    ),
                "unit" to (item?.unit ?: shop?.unit ?: source?.unit ?: "piece"),
                "place" to (item?.place ?: "fridge"),
                "category" to (item?.category ?: "other"),
                "date" to (item?.date ?: ""),
                "dateKind" to (item?.dateKind ?: "best_before"),
                "openedOn" to (item?.openedOn ?: ""),
                "note" to (item?.note ?: shop?.note ?: source?.note ?: ""),
                "favorite" to (item?.favorite ?: false).toString(),
            ),
        )

    fun saveEditor(data: Data, draft: Editor, now: Long = System.currentTimeMillis()): Data {
        Codec.validateEditor(draft)
        val v = draft.values
        val old = data.items.find { it.id == draft.id }
        val shop = data.shopping.find { it.id == draft.id }
        val rev = if (draft.kind == "item") old?.rev ?: 0 else shop?.rev ?: 0
        require(rev == draft.baseRev) {
            "Der Eintrag wurde zwischenzeitlich geändert. Dein Entwurf bleibt erhalten. Öffne den aktuellen Eintrag neu."
        }
        require(
            if (draft.kind == "item") old == null || old.status == "stock"
            else shop == null || shop.status in setOf("open", "checked")
        ) {
            "Diesen Eintrag zuerst wiederherstellen."
        }
        val name = v.getValue("name").trim()
        val q = quantity(v.getValue("amount"))
        val unit = v.getValue("unit")
        val note = v.getValue("note").trim()
        val created = if (draft.kind == "item") old?.createdAt ?: now else shop?.createdAt ?: now
        val changed = if (draft.kind == "item") old?.updatedAt else shop?.updatedAt
        val updated = changed?.let { maxOf(now, it + 1) } ?: now
        var next =
            if (draft.kind == "item") {
                val row =
                    Item(
                        draft.id,
                        name,
                        q,
                        unit,
                        v.getValue("place"),
                        v.getValue("category"),
                        if (v["dateKind"] == "none") null else v.getValue("date").ifBlank { null },
                        v.getValue("dateKind"),
                        v.getValue("openedOn").ifBlank { null },
                        note,
                        v["favorite"] == "true",
                        "stock",
                        null,
                        created,
                        updated,
                        null,
                        rev + 1,
                    )
                data.copy(
                    items =
                        if (old == null) data.items + row
                        else data.items.map { if (it.id == row.id) row else it }
                )
            } else {
                val row =
                    Shopping(
                        draft.id,
                        name,
                        q,
                        unit,
                        note,
                        shop?.status ?: "open",
                        null,
                        null,
                        created,
                        updated,
                        rev + 1,
                    )
                data.copy(
                    shopping =
                        if (shop == null) data.shopping + row
                        else data.shopping.map { if (it.id == row.id) row else it }
                )
            }
        draft.sourceShopId?.let { sourceId ->
            require(draft.kind == "item" && old == null)
            val source =
                next.shopping.firstOrNull { it.id == sourceId } ?: error("Einkauf nicht gefunden.")
            require(source.status == "checked" && source.rev == draft.sourceShopRev) {
                "Dieser Einkauf wurde bereits übernommen oder geändert. Dein Entwurf bleibt erhalten."
            }
            next =
                next.copy(
                    shopping =
                        next.shopping.map {
                            if (it.id == sourceId)
                                it.copy(
                                    status = "stocked",
                                    stockId = draft.id,
                                    updatedAt = maxOf(now, it.updatedAt + 1),
                                    rev = it.rev + 1,
                                )
                            else it
                        }
                )
        }
        return next.also(Codec::validate)
    }

    fun action(
        data: Data,
        id: String,
        operation: String,
        now: Long = System.currentTimeMillis(),
        value: Long? = null,
        newId: String = UUID.randomUUID().toString(),
    ): Data {
        val item = data.items.find { it.id == id }
        val shop = data.shopping.find { it.id == id }
        require(item != null || shop != null) { "Eintrag nicht gefunden." }
        if (item != null) {
            var changed = item.copy(updatedAt = maxOf(now, item.updatedAt + 1), rev = item.rev + 1)
            when (operation) {
                "trash" -> {
                    if (item.status == "trash") return data
                    changed = changed.copy(status = "trash", previousStatus = item.status)
                }
                "restore" -> {
                    require(item.status == "trash")
                    changed = changed.copy(status = item.previousStatus!!, previousStatus = null)
                }
                "consume" -> {
                    require(item.status == "stock")
                    require(value != null && value in 1..item.quantityMilli) {
                        "Bitte höchstens die vorhandene Menge verbrauchen."
                    }
                    changed =
                        if (value == item.quantityMilli)
                            changed.copy(status = "used", closedAt = now)
                        else changed.copy(quantityMilli = item.quantityMilli - value)
                }
                "discard" -> {
                    require(item.status == "stock")
                    changed = changed.copy(status = "discarded", closedAt = now)
                }
                "reopen" -> {
                    require(item.status in setOf("used", "discarded"))
                    changed = changed.copy(status = "stock", closedAt = null)
                }
                "favorite" -> {
                    require(item.status != "trash")
                    changed = changed.copy(favorite = !item.favorite)
                }
                "shopping" -> {
                    require(item.status == "stock")
                    return addShopping(
                        data,
                        item.name,
                        item.quantityMilli,
                        item.unit,
                        item.note,
                        newId,
                        now,
                    )
                }
                else -> error("Unbekannte Aktion.")
            }
            return data
                .copy(items = data.items.map { if (it.id == id) changed else it })
                .also(Codec::validate)
        }
        val row = shop!!
        var changed = row.copy(updatedAt = maxOf(now, row.updatedAt + 1), rev = row.rev + 1)
        when (operation) {
            "trash" -> {
                if (row.status == "trash") return data
                changed = changed.copy(status = "trash", previousStatus = row.status)
            }
            "restore" -> {
                require(row.status == "trash")
                changed = changed.copy(status = row.previousStatus!!, previousStatus = null)
            }
            "check" -> {
                require(row.status in setOf("open", "checked"))
                changed = changed.copy(status = if (row.status == "open") "checked" else "open")
            }
            else -> error("Unbekannte Aktion.")
        }
        return data
            .copy(shopping = data.shopping.map { if (it.id == id) changed else it })
            .also(Codec::validate)
    }

    fun addShopping(
        data: Data,
        name: String,
        q: Long,
        unit: String,
        note: String,
        id: String = UUID.randomUUID().toString(),
        now: Long = System.currentTimeMillis(),
    ): Data {
        require(q in 1..MAX_QUANTITY)
        val match =
            data.shopping.find {
                it.status == "open" && it.unit == unit && it.name.trim().equals(name.trim(), true)
            }
        val rows =
            if (match != null) {
                require(match.quantityMilli + q <= MAX_QUANTITY) {
                    "Die gemeinsame Menge ist zu groß."
                }
                data.shopping.map {
                    if (it.id == match.id)
                        it.copy(
                            quantityMilli = it.quantityMilli + q,
                            updatedAt = maxOf(now, it.updatedAt + 1),
                            rev = it.rev + 1,
                        )
                    else it
                }
            } else
                data.shopping +
                    Shopping(id, name.trim(), q, unit, note, "open", null, null, now, now, 1)
        return data.copy(shopping = rows).also(Codec::validate)
    }

    fun merge(local: Data, incoming: Data): Data {
        Codec.validate(local)
        Codec.validate(incoming)
        val ids =
            local.items.associate { it.id to "item" } + local.shopping.associate { it.id to "shop" }
        require(
            incoming.items.none { ids[it.id]?.let { kind -> kind != "item" } == true } &&
                incoming.shopping.none { ids[it.id]?.let { kind -> kind != "shop" } == true }
        ) {
            "Eine Kennung gehört bereits zu einem anderen Eintrag."
        }
        return local
            .copy(
                items = local.items + incoming.items.filter { it.id !in ids },
                shopping = local.shopping + incoming.shopping.filter { it.id !in ids },
            )
            .also(Codec::validate)
    }

    fun commit(state: State, next: Data, label: String): State {
        Codec.validate(next)
        val data = next.copy(revision = state.data.revision + 1)
        return state
            .copy(data = data, undo = Undo(state.data, data.revision, label))
            .also(Codec::validateState)
    }

    fun undo(state: State): State {
        val undo = state.undo
        require(undo != null && undo.afterRevision == state.data.revision) {
            "Dieser Schritt kann nicht mehr rückgängig gemacht werden."
        }
        return state
            .copy(data = undo.before.copy(revision = state.data.revision + 1), undo = null)
            .also(Codec::validateState)
    }

    fun stock(data: Data) = data.items.filter { it.status == "stock" }

    fun ordered(items: List<Item>) =
        items.sortedWith(
            compareBy<Item> { it.date ?: "9999-12-31" }
                .thenBy { it.name.lowercase() }
                .thenBy { it.id }
        )

    fun due(data: Data, day: String = today()) =
        ordered(
            stock(data).filter {
                it.date != null && it.date <= plusDays(day, data.settings.soonDays)
            }
        )

    fun favorites(data: Data) =
        data.items
            .filter { it.favorite && it.status != "trash" }
            .sortedByDescending { it.updatedAt }
            .distinctBy { it.name.lowercase() + "|" + it.unit }
}
