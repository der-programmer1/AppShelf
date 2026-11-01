package de.appshelf.leistenplan;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    static final String PREFS = "project_v1";
    private static final int INK = Color.rgb(20, 51, 43);
    private static final int GREEN = Color.rgb(23, 108, 88);
    private static final int MUTED = Color.rgb(82, 99, 88);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private SharedPreferences preferences;
    private EditText stock, kerf, parts;
    private TextView status, empty;
    private LinearLayout result, loading;
    private Button calculate, example, reset, share;
    private CuttingPlanner.Plan plan;
    private boolean busy, binding, storageReadable = true;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        buildUi();
        boolean restorePlan = false;
        binding = true;
        try {
            stock.setText(state != null ? state.getString("stock", "2500") : preferences.getString("stock", "2500"));
            kerf.setText(state != null ? state.getString("kerf", "3") : preferences.getString("kerf", "3"));
            parts.setText(state != null ? state.getString("parts", "") : preferences.getString("parts", ""));
            restorePlan = state != null ? state.getBoolean("show_plan") : preferences.getBoolean("show_plan", false);
        } catch (ClassCastException ex) {
            storageReadable = false;
            stock.setText("2500"); kerf.setText("3"); parts.setText("");
            status.setText("Das gespeicherte Projekt ist nicht lesbar. Bitte mit „Neues Projekt“ ausdrücklich zurücksetzen.");
        }
        binding = false;
        if (restorePlan && storageReadable) main.post(this::calculate);
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(244, 244, 235));
        LinearLayout page = column();
        page.setPadding(dp(20), dp(22), dp(20), dp(26));
        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            page.setPadding(dp(20), dp(22) + insets.getSystemWindowInsetTop(), dp(20), dp(26) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));
        TextView brand = text("LeistenPlan", 30, INK); brand.setTypeface(null, Typeface.BOLD); page.addView(brand);
        TextView badge = text("OFFLINE · OHNE BERECHTIGUNGEN", 11, GREEN); badge.setPadding(0, dp(6), 0, dp(18)); page.addView(badge);
        TextView heading = text("Deine Längen.\nEin klarer Plan.", 26, INK); heading.setTypeface(null, Typeface.BOLD); page.addView(heading);
        TextView intro = text("Verteile Abschnitte auf gleich lange Leisten – mit Schnittverlust und Restlängen.", 15, MUTED); intro.setPadding(0, dp(10), 0, dp(18)); page.addView(intro);

        LinearLayout form = column();
        form.setBackground(background(Color.WHITE, 18, Color.rgb(218, 225, 212)));
        form.setPadding(dp(16), dp(16), dp(16), dp(16)); page.addView(form);
        LinearLayout row = new LinearLayout(this);
        LinearLayout left = column(), right = column();
        row.addView(left, new LinearLayout.LayoutParams(0, -2, 1));
        LinearLayout.LayoutParams rightParams = new LinearLayout.LayoutParams(0, -2, 1); rightParams.leftMargin = dp(12); row.addView(right, rightParams);
        stock = input(R.id.stock, false, 30); kerf = input(R.id.kerf, false, 30);
        labelled(left, "Rohlänge (mm)", stock); labelled(right, "Schnittbreite (mm)", kerf); form.addView(row);
        TextView units = text("Millimeter, höchstens eine Nachkommastelle. Rohlänge und Schnittbreite für dein Material anpassen.", 12, MUTED); units.setPadding(0, dp(7), 0, dp(14)); form.addView(units);
        parts = input(R.id.pieces, true, 4000); parts.setMinLines(4); parts.setHint("600 x 2\n400 x 3\n250,5");
        labelled(form, "Abschnitte (mm) · eine Länge je Zeile", parts);
        TextView format = text("Optional: Länge x Anzahl. Bis zu 20 Zeilen und insgesamt 100 Abschnitte.", 12, MUTED); format.setPadding(0, dp(6), 0, dp(8)); form.addView(format);
        example = button("Beispiel laden", R.id.example, false); example.setOnClickListener(v -> loadExample()); form.addView(example, fullButton());
        calculate = button("Plan berechnen", R.id.calculate, true); calculate.setOnClickListener(v -> calculate()); form.addView(calculate, fullButton());
        loading = new LinearLayout(this); loading.setGravity(Gravity.CENTER_VERTICAL); loading.setPadding(0, dp(12), 0, dp(4));
        ProgressBar progress = new ProgressBar(this); loading.addView(progress, new LinearLayout.LayoutParams(dp(24), dp(24)));
        TextView loadingText = text("  Plan wird berechnet …", 14, MUTED); loading.addView(loadingText); loading.setVisibility(View.GONE); form.addView(loading);
        status = text("", 14, Color.rgb(150, 35, 35)); status.setId(R.id.status); status.setPadding(0, dp(8), 0, 0); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); form.addView(status);
        empty = text("Noch kein Plan: Trage deine Abschnitte ein oder lade das gekennzeichnete Beispiel.", 14, MUTED); empty.setPadding(0, dp(20), 0, dp(14)); page.addView(empty);
        result = column(); result.setId(R.id.result); page.addView(result);
        share = button("Plan als Text teilen", R.id.share, true); share.setVisibility(View.GONE); share.setOnClickListener(v -> share()); page.addView(share, fullButton());
        reset = button("Neues Projekt", R.id.reset, false); reset.setOnClickListener(v -> confirmReset()); page.addView(reset, fullButton());
        TextView limits = text("Ein Verteilungsvorschlag, keine Optimalitätsgarantie. Keine Zugabe für Endbeschnitt, Defekte oder Einspannung. Maße vor Verwendung prüfen.", 12, MUTED); limits.setPadding(0, dp(16), 0, dp(10)); page.addView(limits);
        page.addView(text("Unabhängiges persönliches Projekt. Keine offizielle Store-App. Keine Anmeldung, keine Analyse und keine Netzwerkanfragen.", 11, MUTED));
        TextWatcher changed = new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                if (!binding && !busy) { clearResult(); if (storageReadable) status.setText(""); }
            }
            @Override public void afterTextChanged(Editable s) {}
        };
        stock.addTextChangedListener(changed); kerf.addTextChangedListener(changed); parts.addTextChangedListener(changed);
        setContentView(scroll);
        scroll.requestApplyInsets();
    }

    private EditText input(int id, boolean multiline, int max) {
        EditText input = new EditText(this); input.setId(id); input.setSaveEnabled(false);
        input.setTextSize(17); input.setTextColor(INK); input.setHintTextColor(MUTED); input.setMinHeight(dp(48));
        input.setPadding(dp(10), dp(10), dp(10), dp(10));
        input.setBackground(background(Color.rgb(246, 248, 242), 8, Color.rgb(193, 206, 190)));
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(max)});
        input.setInputType(multiline ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS : InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (multiline) input.setGravity(Gravity.TOP | Gravity.START); else input.setSingleLine(true);
        return input;
    }

    private void calculate() {
        if (busy) return;
        if (!storageReadable) { status.setText("Bitte das nicht lesbare Projekt zuerst mit „Neues Projekt“ zurücksetzen."); return; }
        final String stockValue = stock.getText().toString(), kerfValue = kerf.getText().toString(), partsValue = parts.getText().toString();
        final CuttingPlanner.Request request;
        try { request = CuttingPlanner.parse(stockValue, kerfValue, partsValue); }
        catch (IllegalArgumentException ex) { clearResult(); status.setText(ex.getMessage()); return; }
        InputMethodManager keyboard = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(parts.getWindowToken(), 0);
        status.setText(""); clearResult(); setBusy(true);
        worker.execute(() -> {
            try {
                if (!preferences.edit().putString("stock", stockValue).putString("kerf", kerfValue).putString("parts", partsValue).putBoolean("show_plan", true).commit()) throw new IllegalStateException("Das Projekt konnte nicht lokal gespeichert werden. Bitte freien Speicher prüfen und erneut versuchen.");
                CuttingPlanner.Plan calculated = CuttingPlanner.plan(request);
                main.post(() -> { if (!isDestroyed() && !isFinishing()) { setBusy(false); showPlan(calculated); } });
            } catch (RuntimeException ex) {
                main.post(() -> { if (!isDestroyed() && !isFinishing()) { setBusy(false); status.setText(ex.getMessage() == null ? "Die Berechnung ist fehlgeschlagen. Bitte erneut versuchen." : ex.getMessage()); } });
            }
        });
    }

    private void setBusy(boolean value) {
        busy = value; loading.setVisibility(value ? View.VISIBLE : View.GONE);
        stock.setEnabled(!value); kerf.setEnabled(!value); parts.setEnabled(!value);
        calculate.setEnabled(!value); example.setEnabled(!value); reset.setEnabled(!value); share.setEnabled(!value);
    }
    private void clearResult() { plan = null; result.removeAllViews(); share.setVisibility(View.GONE); empty.setVisibility(View.VISIBLE); }

    private void showPlan(CuttingPlanner.Plan value) {
        plan = value; empty.setVisibility(View.GONE); result.removeAllViews();
        TextView heading = text(value.summary(), 24, INK); heading.setTypeface(null, Typeface.BOLD); heading.setPadding(0, dp(22), 0, dp(10)); result.addView(heading);
        TextView totals = text("Rest gesamt: " + CuttingPlanner.format(value.offcut) + " mm\nSchnittverlust: " + CuttingPlanner.format(value.loss) + " mm", 16, INK); totals.setPadding(0, 0, 0, dp(14)); result.addView(totals);
        int index = 0;
        for (CuttingPlanner.Board board : value.boards) {
            LinearLayout card = column(); card.setPadding(dp(14), dp(14), dp(14), dp(14)); card.setBackground(background(Color.WHITE, 14, Color.rgb(218, 225, 212)));
            TextView title = text("Leiste " + (++index) + " · " + CuttingPlanner.format(value.request.stock) + " mm", 18, INK); title.setTypeface(null, Typeface.BOLD); card.addView(title);
            card.addView(new CutBar(board, value.request.stock, value.request.kerf), new LinearLayout.LayoutParams(-1, dp(38)));
            StringBuilder pieces = new StringBuilder();
            for (int length : board.parts) { if (pieces.length() > 0) pieces.append(" + "); pieces.append(CuttingPlanner.format(length)); }
            TextView detail = text(pieces + " mm\nRest: " + CuttingPlanner.format(board.offcut) + " mm · Schnittverlust: " + CuttingPlanner.format(board.loss) + " mm", 14, MUTED); detail.setTextIsSelectable(true); card.addView(detail);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.bottomMargin = dp(12); result.addView(card, params);
        }
        share.setVisibility(View.VISIBLE);
    }

    private void loadExample() {
        if (busy || !storageReadable) return;
        binding = true; stock.setText("2500"); kerf.setText("3"); parts.setText("1200 x 2\n600 x 2\n400 x 2"); binding = false;
        clearResult(); status.setText("Beispiel geladen. Werte anpassen oder „Plan berechnen“ wählen.");
    }

    private void confirmReset() {
        if (busy) return;
        new AlertDialog.Builder(this).setTitle("Projekt zurücksetzen?").setMessage("Deine gespeicherten Eingaben und der aktuelle Plan werden entfernt.")
                .setNegativeButton("Abbrechen", null).setPositiveButton("Zurücksetzen", (dialog, which) -> {
                    if (!preferences.edit().clear().commit()) { status.setText("Das Projekt konnte nicht zurückgesetzt werden. Deine Eingaben bleiben erhalten."); return; }
                    storageReadable = true; binding = true; stock.setText("2500"); kerf.setText("3"); parts.setText(""); binding = false;
                    clearResult(); status.setText("");
                }).show();
    }

    private void share() {
        if (plan == null) return;
        Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, plan.asText());
        try { startActivity(Intent.createChooser(intent, "Leistenplan teilen")); }
        catch (ActivityNotFoundException ex) { status.setText("Auf diesem Gerät ist keine App zum Teilen verfügbar."); }
    }

    @Override public void onSaveInstanceState(Bundle state) {
        state.putString("stock", stock.getText().toString()); state.putString("kerf", kerf.getText().toString()); state.putString("parts", parts.getText().toString()); state.putBoolean("show_plan", plan != null || busy);
        super.onSaveInstanceState(state);
    }
    @Override public void onPause() {
        if (storageReadable && !busy) {
            boolean saved = preferences.edit().putString("stock", stock.getText().toString()).putString("kerf", kerf.getText().toString()).putString("parts", parts.getText().toString()).putBoolean("show_plan", plan != null).commit();
            if (!saved) Toast.makeText(this, "Eingaben konnten nicht gespeichert werden. Bitte freien Speicher prüfen.", Toast.LENGTH_LONG).show();
        }
        super.onPause();
    }
    @Override public void onDestroy() { worker.shutdownNow(); super.onDestroy(); }

    private LinearLayout column() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view; }
    private TextView text(String value, int size, int color) { TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setLineSpacing(dp(2), 1.05f); return view; }
    private void labelled(LinearLayout parent, String label, EditText input) { TextView title = text(label, 13, INK); title.setLabelFor(input.getId()); title.setPadding(0, 0, 0, dp(6)); parent.addView(title); parent.addView(input, new LinearLayout.LayoutParams(-1, -2)); }
    private Button button(String title, int id, boolean primary) { Button button = new Button(this); button.setId(id); button.setText(title); button.setAllCaps(false); button.setTextSize(15); button.setMinHeight(dp(48)); button.setTextColor(primary ? Color.WHITE : INK); button.setBackground(background(primary ? GREEN : Color.rgb(227, 235, 218), 10, primary ? GREEN : Color.rgb(193, 206, 190))); return button; }
    private LinearLayout.LayoutParams fullButton() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(52)); p.topMargin = dp(10); return p; }
    private GradientDrawable background(int color, int radius, int stroke) { GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(dp(radius)); drawable.setStroke(dp(1), stroke); return drawable; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private final class CutBar extends View {
        private final CuttingPlanner.Board board;
        private final int stockLength, kerfLength;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        CutBar(CuttingPlanner.Board board, int stockLength, int kerfLength) {
            super(MainActivity.this); this.board = board; this.stockLength = stockLength; this.kerfLength = kerfLength;
            setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas); float scale = getWidth() / (float) stockLength; float cursor = 0; float top = dp(9), bottom = getHeight() - dp(7);
            paint.setColor(Color.rgb(226, 229, 219)); canvas.drawRect(0, top, getWidth(), bottom, paint);
            int index = 0;
            for (int length : board.parts) {
                if (index > 0) cursor += kerfLength;
                paint.setColor(index % 2 == 0 ? GREEN : Color.rgb(155, 190, 89)); canvas.drawRect(cursor * scale, top, (cursor + length) * scale, bottom, paint);
                cursor += length; index++;
            }
        }
    }
}
