package de.appshelf.aufbrauchen

import android.app.Application
import android.content.ContentResolver
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** One ordered writer; every command reads the current file inside the store lock. */
class AppModel(application: Application) : AndroidViewModel(application) {
    private val store = LocalStore(application)
    private val commands = Channel<suspend () -> Unit>(Channel.UNLIMITED)
    var state by mutableStateOf(State())
        private set

    var ready by mutableStateOf(false)
        private set

    var message by mutableStateOf("")
        private set

    var errorMessage by mutableStateOf("")
        private set

    var day by mutableStateOf(Rules.today())
        private set

    fun refreshDay() {
        day = Rules.today()
    }

    var formEditor by mutableStateOf<Editor?>(null)
        private set

    var editorVisible by mutableStateOf(false)
        private set

    var working by mutableStateOf(false)
        private set

    init {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val saved = store.read()
                withContext(Dispatchers.Main) {
                    state = saved
                    ready = true
                }
            } catch (_: Exception) {
                withContext(Dispatchers.Main) {
                    message =
                        "Lokaler Speicher konnte nicht gelesen werden. Vorhandene Daten wurden nicht überschrieben."
                    errorMessage = message
                }
            }
            for (command in commands) try {
                command()
            } catch (error: Exception) {
                withContext(Dispatchers.Main) {
                    working = false
                    message =
                        error.message ?: "Speichern fehlgeschlagen. Bitte freien Speicher prüfen."
                    errorMessage = message
                }
            }
        }
    }

    private fun enqueue(block: suspend () -> Unit) {
        commands.trySend(block)
    }

    fun notice(text: String) {
        message = text
    }

    fun change(update: (State) -> State, success: (() -> Unit)? = null) {
        if (!ready) return
        enqueue {
            val next = store.transform(update)
            withContext(Dispatchers.Main) {
                state = next
                errorMessage = ""
                success?.invoke()
            }
        }
    }

    fun mutate(label: String, update: (Data) -> Data) {
        change({ Rules.commit(it, update(it.data), label) }, { message = label })
    }

    fun act(id: String, operation: String, label: String) {
        mutate(label) { Rules.action(it, id, operation) }
    }

    fun begin(draft: Editor) {
        errorMessage = ""
        val existing = state.editor
        if (existing != null && existing.id != draft.id) {
            formEditor = existing
            editorVisible = true
            message = "Speichere oder verwirf zuerst deinen offenen Entwurf."
            return
        }
        formEditor = existing ?: draft
        editorVisible = true
        change({
            require(it.editor == null || it.editor.id == draft.id) {
                "Es gibt bereits einen anderen Entwurf."
            }
            it.copy(editor = it.editor ?: draft)
        })
    }

    fun resume() {
        errorMessage = ""
        state.editor?.let {
            formEditor = it
            editorVisible = true
        }
    }

    fun edit(key: String, value: String) {
        val draft = formEditor ?: return
        val edited = draft.copy(values = draft.values + (key to value))
        formEditor = edited
        change({
            require(it.editor?.id == edited.id) { "Der Entwurf wurde bereits abgeschlossen." }
            it.copy(editor = edited)
        })
    }

    fun closeEditor() {
        editorVisible = false
        formEditor = null
    }

    fun discardEditor() {
        change(
            { it.copy(editor = null) },
            {
                closeEditor()
                message = "Entwurf verworfen."
            },
        )
    }

    fun saveEditor() {
        if (working) return
        val draft = formEditor ?: return
        working = true
        change(
            {
                require(it.editor?.id == draft.id) { "Der Entwurf ist nicht mehr geöffnet." }
                Rules.commit(
                        it,
                        Rules.saveEditor(it.data, draft),
                        if (draft.kind == "item") "Vorrat gespeichert." else "Einkauf gespeichert.",
                    )
                    .copy(editor = null)
            },
            {
                working = false
                closeEditor()
                message =
                    if (draft.sourceShopId != null) "Einkauf genau einmal in den Vorrat übernommen."
                    else "Eintrag gespeichert."
            },
        )
    }

    fun template(row: Item) {
        val draft = Rules.editor("item")
        begin(
            draft.copy(
                values =
                    draft.values +
                        mapOf(
                            "name" to row.name,
                            "amount" to Rules.amount(row.quantityMilli),
                            "unit" to row.unit,
                            "place" to row.place,
                            "category" to row.category,
                            "note" to row.note,
                            "favorite" to row.favorite.toString(),
                        )
            )
        )
    }

    fun removeTemplate(row: Item) {
        mutate("Vorlage entfernt.") { data ->
            data.items
                .filter { it.favorite && it.unit == row.unit && it.name.equals(row.name, true) }
                .fold(data) { next, item -> Rules.action(next, item.id, "favorite") }
        }
    }

    fun consume(id: String, text: String, reorder: Boolean, onSuccess: () -> Unit) {
        if (working) return
        val q =
            try {
                Rules.quantity(text)
            } catch (e: Exception) {
                message = e.message ?: "Ungültige Menge."
                errorMessage = message
                return
            }
        working = true
        change(
            { s ->
                val item =
                    s.data.items.firstOrNull { it.id == id } ?: error("Vorrat nicht gefunden.")
                var next = Rules.action(s.data, id, "consume", value = q)
                if (reorder) next = Rules.addShopping(next, item.name, q, item.unit, item.note)
                Rules.commit(s, next, "Verbrauch gespeichert.")
            },
            {
                working = false
                message = "Verbrauch gespeichert."
                onSuccess()
            },
        )
    }

    fun export(resolver: ContentResolver, uri: Uri) {
        enqueue {
            val bytes = Codec.encode(store.read().data).toByteArray(Charsets.UTF_8)
            resolver.openOutputStream(uri, "wt")?.use { it.write(bytes) }
                ?: error("Sicherung konnte nicht geöffnet werden.")
            withContext(Dispatchers.Main) { message = "JSON-Sicherung gespeichert." }
        }
    }

    fun import(resolver: ContentResolver, uri: Uri) {
        enqueue {
            val text =
                resolver.openInputStream(uri)?.use { utf8(it.bounded(Codec.MAX_DOCUMENT)) }
                    ?: error("Datei konnte nicht geöffnet werden.")
            val incoming = Codec.decode(text)
            val next =
                store.transform {
                    Rules.commit(it, Rules.merge(it.data, incoming), "Sicherung zusammengeführt.")
                }
            withContext(Dispatchers.Main) {
                state = next
                message =
                    "Sicherung geprüft und zusammengeführt. Vorhandene Einträge wurden beibehalten."
            }
        }
    }

    fun undo() {
        change(Rules::undo) { message = "Letzter Schritt rückgängig gemacht." }
    }

    fun clear() {
        change({ State() }) {
            closeEditor()
            message = "Alle lokalen Aufbrauchen-Daten gelöscht."
        }
    }
}
