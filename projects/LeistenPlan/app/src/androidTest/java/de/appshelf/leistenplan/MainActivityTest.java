package de.appshelf.leistenplan;

import android.content.Context;
import android.widget.EditText;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.action.ViewActions.scrollTo;
import static androidx.test.espresso.matcher.ViewMatchers.withId;
import static androidx.test.espresso.matcher.ViewMatchers.withText;

@RunWith(AndroidJUnit4.class)
public final class MainActivityTest {
    @Before public void clearOwnTestProject() { Context app=ApplicationProvider.getApplicationContext();assertTrue(app.getSharedPreferences(MainActivity.PREFS,Context.MODE_PRIVATE).edit().clear().commit()); }
    private void enter(ActivityScenario<MainActivity> scenario,String lengths) { scenario.onActivity(a->{((EditText)a.findViewById(R.id.stock)).setText("1000");((EditText)a.findViewById(R.id.kerf)).setText("3");((EditText)a.findViewById(R.id.pieces)).setText(lengths);a.findViewById(R.id.calculate).performClick();}); }
    private void awaitPlan(ActivityScenario<MainActivity> scenario) throws Exception {
        long deadline=System.currentTimeMillis()+30000;AtomicBoolean ready=new AtomicBoolean(false);
        while(System.currentTimeMillis()<deadline) { scenario.onActivity(a->ready.set(((android.view.ViewGroup)a.findViewById(R.id.result)).getChildCount()>0));if(ready.get())return;Thread.sleep(100); }
        fail("No calculated result within 30 seconds");
    }
    @Test public void emptyInputShowsARealError() { try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)) { enter(s,"");s.onActivity(a->{assertTrue(((TextView)a.findViewById(R.id.status)).getText().toString().contains("mindestens einen Abschnitt"));assertEquals(0,((android.view.ViewGroup)a.findViewById(R.id.result)).getChildCount());}); } }
    @Test public void exactBoundaryPlanSurvivesRotationAndRelaunch() throws Exception {
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)) {
            enter(s,"500\n497");awaitPlan(s);
            s.onActivity(a->assertEquals("1 Leiste · 2 Abschnitte",((TextView)((android.view.ViewGroup)a.findViewById(R.id.result)).getChildAt(0)).getText().toString()));
            s.recreate();awaitPlan(s);s.onActivity(a->assertEquals("500\n497",((EditText)a.findViewById(R.id.pieces)).getText().toString()));
        }
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)) { awaitPlan(s);s.onActivity(a->assertEquals("1000",((EditText)a.findViewById(R.id.stock)).getText().toString())); }
    }
    @Test public void resetNeedsConfirmationAndCancellationKeepsProject() throws Exception {
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)) {
            enter(s,"500\n497");awaitPlan(s);onView(withId(R.id.reset)).perform(scrollTo(),click());onView(withText("Abbrechen")).perform(click());
            s.onActivity(a->assertEquals("500\n497",((EditText)a.findViewById(R.id.pieces)).getText().toString()));
            onView(withId(R.id.reset)).perform(scrollTo(),click());onView(withText("Zurücksetzen")).perform(click());
            s.onActivity(a->{assertEquals("",((EditText)a.findViewById(R.id.pieces)).getText().toString());assertEquals(0,((android.view.ViewGroup)a.findViewById(R.id.result)).getChildCount());});
        }
    }
}
