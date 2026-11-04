package de.appshelf.aufbrauchen

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppAndroidTest {
    @get:Rule val ui = createEmptyComposeRule()
    private lateinit var scenario: ActivityScenario<MainActivity>
    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private val store: LocalStore
        get() = LocalStore(context)

    @Before
    fun setUp() {
        store.transform { State(Data(settings = Settings(onboarded = true))) }
        scenario = ActivityScenario.launch(MainActivity::class.java)
        ui.waitUntil(15000) {
            runCatching { ui.onNodeWithTag("add-item").assertIsEnabled() }.isSuccess
        }
    }

    @After
    fun tearDown() {
        scenario.close()
    }

    private fun saved(predicate: (State) -> Boolean) {
        ui.waitUntil(15000) { predicate(store.read()) }
    }

    private fun add(name: String = "Joghurt") {
        ui.onNodeWithTag("add-item").performClick()
        ui.onNodeWithTag("edit-name").performTextInput(name)
        ui.onNodeWithTag("edit-amount").performTextClearance()
        ui.onNodeWithTag("edit-amount").performTextInput("1,5")
        ui.onNodeWithTag("save-editor").performScrollTo().performClick()
        saved { it.data.items.size == 1 && it.editor == null }
    }

    @Test
    fun capturePersistsAcrossRecreation() {
        add()
        assertEquals(1500L, store.read().data.items[0].quantityMilli)
        scenario.recreate()
        ui.waitUntil(15000) {
            runCatching { ui.onNodeWithTag("add-item").assertIsEnabled() }.isSuccess
        }
        assertEquals("Joghurt", store.read().data.items[0].name)
        assertEquals(1, store.read().data.items.size)
    }

    @Test
    fun draftSurvivesBackAndRecreation() {
        ui.onNodeWithTag("add-item").performClick()
        ui.onNodeWithTag("edit-name").performTextInput("Brot für morgen")
        saved { it.editor?.values?.get("name") == "Brot für morgen" }
        ui.onNodeWithTag("close-editor").performScrollTo().performClick()
        scenario.recreate()
        ui.waitUntil(15000) {
            runCatching { ui.onNodeWithText("Bearbeitungsentwurf fortsetzen").assertExists() }
                .isSuccess
        }
        ui.onNodeWithText("Bearbeitungsentwurf fortsetzen").performClick()
        ui.onNodeWithTag("edit-name").assertTextContains("Brot für morgen")
        assertEquals(0, store.read().data.items.size)
    }

    @Test
    fun consumptionAndUndoUseTheActualStore() {
        add()
        val id = store.read().data.items.single().id
        scenario.onActivity { activity ->
            val vm = androidx.lifecycle.ViewModelProvider(activity)[AppModel::class.java]
            vm.consume(id, "0,5", false) {}
        }
        saved { it.data.items.single().quantityMilli == 1000L }
        ui.onNodeWithTag("undo").performClick()
        saved { it.data.items.single().quantityMilli == 1500L }
        assertEquals("stock", store.read().data.items.single().status)
    }

    @Test
    fun purchaseTransferIsAtomicAndInvalidImportNeverWrites() {
        val e = Rules.editor("shop", "shop-1")
        store.transform {
            val d =
                Rules.saveEditor(
                    it.data,
                    e.copy(values = e.values + mapOf("name" to "Reis", "amount" to "2")),
                )
            State(Rules.action(d, "shop-1", "check"))
        }
        val current = store.read()
        val draft = Rules.editor("item", "rice", source = current.data.shopping.single())
        store.transform { Rules.commit(it, Rules.saveEditor(it.data, draft), "Einlagern") }
        assertEquals("stocked", store.read().data.shopping.single().status)
        assertEquals(1, store.read().data.items.size)
        val before = store.read()
        assertTrue(
            runCatching {
                    store.transform {
                        Rules.commit(
                            it,
                            Rules.saveEditor(it.data, draft.copy(id = "duplicate")),
                            "Doppelt",
                        )
                    }
                }
                .isFailure
        )
        assertEquals(before, store.read())
        assertTrue(
            runCatching {
                    val incoming = Codec.decode("{\"items\":[{}]}")
                    store.transform { Rules.commit(it, Rules.merge(it.data, incoming), "Import") }
                }
                .isFailure
        )
        assertEquals(before, store.read())
    }
}
