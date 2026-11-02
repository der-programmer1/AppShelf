package de.appshelf.weiter

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onParent
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate

@RunWith(AndroidJUnit4::class)
class WeiterUiAndroidTest {
    @get:Rule val ui = createEmptyComposeRule()
    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var store: LocalStore
    private var scenario: ActivityScenario<MainActivity>? = null

    @Before fun resetOwnData() {
        store = LocalStore(context)
        ReminderScheduler.sync(context, AppData())
        context.getSharedPreferences("weiter_alarm_state", Context.MODE_PRIVATE).edit().clear().commit()
        store.write(AppData())
    }

    @After fun closeOwnActivity() {
        scenario?.close()
        ReminderScheduler.sync(context, AppData())
    }

    @Test fun captureClarifyAndShowTodayWithEditableReminder() {
        launch()
        ui.onNodeWithTag("capture_open").performClick()
        ui.onNodeWithTag("capture_text").performTextInput("Paket zurückschicken")
        awaitSaved { it.draft == "Paket zurückschicken" }
        ui.onNodeWithTag("capture_save").performClick()
        ui.waitUntil(5000) { store.read().entries.size == 1 }
        val id = store.read().entries.single().id
        assertEquals(EntryStatus.INBOX, store.read().entries.single().status)
        mainNode("entry_open_$id").performClick()
        ui.onNodeWithTag("edit_next_step").performScrollTo().performTextInput("Retourenlabel herunterladen")
        awaitSaved { it.entries.single().nextStep == "Retourenlabel herunterladen" }
        ui.onNodeWithTag("choose_today").performScrollTo().performClick()
        awaitSaved { it.entries.single().dueDate == Rules.today() }
        // Bring the horizontal row into the vertical viewport before scrolling its chip.
        // performScrollTo() intentionally acts on only the nearest scrollable ancestor.
        ui.onNodeWithTag("reminder_tomorrow").onParent().performScrollTo()
        ui.onNodeWithTag("reminder_tomorrow").performScrollTo().assertIsDisplayed().performClick()
        awaitSaved { it.entries.single().reminderAt != null }
        val selectedReminder = store.read().entries.single().reminderAt
        ui.onNodeWithTag("clarify_save").performScrollTo().performClick()
        awaitSaved { it.entries.single().status == EntryStatus.TODAY }
        val task = store.read().entries.single()
        assertEquals("Retourenlabel herunterladen", task.nextStep)
        assertEquals(Rules.today(), task.dueDate)
        assertNotNull(task.reminderAt)
        assertEquals("Clarification must preserve the chosen reminder", selectedReminder, task.reminderAt)
        val reminderDate = java.time.Instant.ofEpochMilli(task.reminderAt!!).atZone(java.time.ZoneId.systemDefault()).toLocalDate()
        assertEquals(LocalDate.now().plusDays(1), reminderDate)
        ui.onNodeWithTag("editor_back").performClick()
        ui.onNodeWithTag("nav_today").performClick()
        mainNode("entry_open_$id").assertIsDisplayed()
        ui.onNodeWithText("Retourenlabel herunterladen").assertIsDisplayed()
    }

    @Test fun draftAndPartialClarificationSurviveBackAndRecreation() {
        launch()
        ui.onNodeWithTag("capture_open").performClick()
        ui.onNodeWithTag("capture_text").performTextInput("Morgen Waschmittel kaufen")
        awaitSaved { it.draft == "Morgen Waschmittel kaufen" }
        ui.onNodeWithText("Später weiterschreiben").performClick()
        assertEquals("Morgen Waschmittel kaufen", store.read().draft)
        scenario!!.recreate()
        ui.onNodeWithTag("capture_open").performClick()
        ui.onNodeWithTag("capture_text").assertTextContains("Morgen Waschmittel kaufen")
        ui.onNodeWithTag("capture_save").performClick()
        ui.waitUntil(5000) { store.read().entries.size == 1 }
        val id = store.read().entries.single().id
        mainNode("entry_open_$id").performClick()
        ui.onNodeWithTag("suggest_tomorrow").performScrollTo().assertIsDisplayed()
        assertNull(store.read().entries.single().dueDate)
        ui.onNodeWithTag("suggest_tomorrow").performClick()
        awaitSaved { it.entries.single().dueDate == LocalDate.now().plusDays(1).toString() }
        assertEquals(LocalDate.now().plusDays(1).toString(), store.read().entries.single().dueDate)
        ui.onNodeWithTag("choose_today").performScrollTo().performClick()
        awaitSaved { it.entries.single().dueDate == Rules.today() }
        assertEquals(Rules.today(), store.read().entries.single().dueDate)
        ui.onNodeWithTag("edit_next_step").performScrollTo().performTextInput("Waschmittel auf dem Heimweg kaufen")
        awaitSaved { it.entries.single().nextStep == "Waschmittel auf dem Heimweg kaufen" }
        ui.onNodeWithTag("editor_back").performClick()
        scenario!!.recreate()
        assertEquals(EntryStatus.INBOX, store.read().entries.single().status)
        mainNode("entry_open_$id").performClick()
        ui.onNodeWithTag("edit_next_step").performScrollTo().assertTextContains("Waschmittel auf dem Heimweg kaufen")
    }

    @Test fun parkingDeletionUndoCompletionAndReopenWorkThroughUi() {
        val entry = Rules.clarify(Rules.newEntry("Arzt anrufen").copy(nextStep = "Praxisnummer wählen"))
        store.write(AppData(entries = listOf(entry)))
        launch()
        mainNode("entry_open_${entry.id}").performClick()
        ui.onNodeWithTag("editor_more").performScrollTo().performClick()
        ui.onNodeWithTag("park_tomorrow_${entry.id}").performScrollTo().performClick()
        awaitSaved { it.entries.single().status == EntryStatus.PARKED }
        assertEquals(EntryStatus.PARKED, store.read().entries.single().status)
        ui.onNodeWithTag("delete_${entry.id}").performScrollTo().performClick()
        awaitSaved { it.entries.single().status == EntryStatus.TRASH }
        assertEquals(EntryStatus.TRASH, store.read().entries.single().status)
        mainNode("undo_delete").performClick()
        awaitSaved { it.entries.single().status == EntryStatus.PARKED }
        assertEquals(EntryStatus.PARKED, store.read().entries.single().status)
        ui.onNodeWithTag("nav_parked").performClick()
        mainNode("park_today_${entry.id}").performClick()
        awaitSaved { it.entries.single().status == EntryStatus.TODAY }
        assertEquals(EntryStatus.TODAY, store.read().entries.single().status)
        ui.onNodeWithTag("nav_today").performClick()
        mainNode("complete_${entry.id}").performClick()
        awaitSaved { it.entries.single().status == EntryStatus.DONE }
        assertEquals(EntryStatus.DONE, store.read().entries.single().status)
        ui.onNodeWithTag("nav_more").performClick()
        mainNode("open_done").performClick()
        ui.onNodeWithTag("main_list").performScrollToNode(hasText("Öffnen"))
        ui.onNodeWithText("Öffnen").performClick()
        ui.onNodeWithTag("editor_more").performScrollTo().performClick()
        ui.onNodeWithTag("reopen_task").performScrollTo().performClick()
        awaitSaved { it.entries.single().status == EntryStatus.TODAY }
        assertEquals(EntryStatus.TODAY, store.read().entries.single().status)
        assertNull(store.read().entries.single().completedDate)
    }

    @Test fun customFocusTimerSurvivesActivityRecreationAndCanBeStopped() {
        val entry = Rules.clarify(Rules.newEntry("Formular ausfüllen").copy(nextStep = "Erste Seite lesen"))
        store.write(AppData(entries = listOf(entry)))
        launch()
        mainNode("entry_open_${entry.id}").performClick()
        ui.onNodeWithTag("editor_more").performScrollTo().performClick()
        ui.onNodeWithTag("timer_open").performScrollTo().performClick()
        ui.onNodeWithTag("timer_custom").performTextReplacement("7")
        ui.onNodeWithTag("timer_custom_start").performClick()
        awaitSaved { it.timer?.durationMinutes == 7 }
        assertEquals(7, store.read().timer?.durationMinutes)
        val deadline = store.read().timer!!.endsAt
        ui.onNodeWithTag("editor_back").performClick()
        mainNode("timer_active").assertIsDisplayed()
        scenario!!.recreate()
        mainNode("timer_active").assertIsDisplayed()
        assertEquals(deadline, store.read().timer?.endsAt)
        mainNode("timer_stop").performClick()
        awaitSaved { it.timer == null }
        assertNull(store.read().timer)
    }

    /** Wait for the user-visible action to finish saving; never replay an action to make it pass. */
    private fun awaitSaved(condition: (AppData) -> Boolean) {
        ui.waitForIdle()
        ui.waitUntil(10_000) { condition(store.read()) }
    }

    private fun mainNode(tag: String): SemanticsNodeInteraction {
        ui.onNodeWithTag("main_list").performScrollToNode(hasTestTag(tag))
        return ui.onNodeWithTag(tag)
    }

    private fun launch() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
        ui.waitForIdle()
    }
}
