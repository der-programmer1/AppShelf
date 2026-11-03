import {
  database,
  button,
  registerOffline,
  persistentStorage,
} from "./storage.js";
import {
  PRESETS,
  safeDuration,
  startCountdown,
  secondsLeft,
  canResume,
  validAudio,
} from "./model.js";
const $ = (id) => document.getElementById(id),
  db = database("gymdelay"),
  audio = $("player");
let state = { preset: 30, track: null, timer: null, position: 0 },
  url = null,
  ready = false,
  busy = false,
  changing = false,
  queue = Promise.resolve(),
  generation = 0,
  lastTick = Date.now(),
  lastPosition = 0;
function status(message) {
  $("status").textContent = message;
}
function run(task) {
  return task().catch((e) =>
    status(e.message || "Diese Aktion konnte nicht abgeschlossen werden."),
  );
}
function save() {
  const snapshot = structuredClone(state);
  const result = queue.then(() => db.set("state", snapshot));
  queue = result.catch(() => {});
  return result;
}
function render() {
  $("presets").replaceChildren(
    ...PRESETS.map((n) => {
      const b = button(`${n} s`, () =>
        run(async () => {
          state.preset = n;
          await save();
          render();
        }),
      );
      b.setAttribute("aria-pressed", String(n === state.preset));
      b.disabled = !!state.timer || busy;
      return b;
    }),
  );
  $("trackName").textContent =
    state.track?.name || "Noch keine Datei ausgewählt";
  $("start").disabled = !ready || !state.track || busy || !!state.timer;
  $("cancel").disabled = !state.timer;
  $("audioFile").disabled = changing;
  $("progress").max = state.timer?.duration || state.preset;
  $("countdown").textContent = state.timer
    ? secondsLeft(state.timer)
    : state.preset;
  $("progress").value = state.timer
    ? state.timer.duration - secondsLeft(state.timer)
    : 0;
  $("countdownState").textContent = state.timer
    ? "Sekunden · Musik ist pausiert"
    : "Sekunden bis zur Musik";
}
async function loadTrack() {
  if (url) URL.revokeObjectURL(url);
  if (!state.track) {
    audio.removeAttribute("src");
    audio.load();
    return;
  }
  const stored = await db.get("audio");
  if (
    !stored ||
    stored.id !== state.track.id ||
    !(stored.bytes instanceof ArrayBuffer)
  )
    throw Error(
      "Die gespeicherte Audiodatei ist nicht verfügbar. Bitte erneut auswählen.",
    );
  url = URL.createObjectURL(new Blob([stored.bytes], { type: stored.mime }));
  audio.src = url;
  audio.load();
  audio.addEventListener(
    "loadedmetadata",
    () => {
      if (Number.isFinite(audio.duration) && state.position < audio.duration)
        audio.currentTime = state.position;
    },
    { once: true },
  );
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.track.name,
      artist: "GymDelay · lokale Datei",
      artwork: [
        {
          src: new URL("icon-192.png", location.href).href,
          sizes: "192x192",
          type: "image/png",
        },
      ],
    });
  }
}
async function choose(file) {
  if (!validAudio(file))
    throw Error(
      "Bitte eine unterstützte Audiodatei zwischen 1 Byte und 100 MB auswählen.",
    );
  generation++;
  changing = true;
  busy = true;
  audio.pause();
  state = { ...state, timer: null, position: audio.currentTime };
  render();
  try {
    await save();
    const bytes = await file.arrayBuffer(),
      id = crypto.randomUUID();
    const next = {
      ...state,
      track: { id, name: file.name },
      timer: null,
      position: 0,
    };
    await queue;
    // ArrayBuffer is portable to WebKit builds where IDB Blob/File persistence fails.
    await db.setMany([
      ["audio", { id, bytes, mime: file.type || "audio/mpeg" }],
      ["state", next],
    ]);
    state = next;
    $("resume").hidden = true;
    await loadTrack();
    status(
      "Song lokal gespeichert. Du kannst ihn im Player anhören und den Countdown starten.",
    );
    persistentStorage();
  } finally {
    changing = false;
    busy = false;
    render();
  }
}
async function start() {
  if (!state.track || busy || state.timer) return;
  busy = true;
  const token = ++generation,
    trackId = state.track.id;
  // play() is invoked inside the user gesture; Safari can retain the playback permission.
  const primed = audio.play();
  try {
    await primed;
    if (token !== generation || trackId !== state.track?.id) {
      audio.pause();
      return;
    }
    audio.pause();
    state.position = audio.currentTime;
    state.timer = startCountdown(trackId, state.preset);
    $("resume").hidden = true;
    await save();
    status("Musik pausiert. Mach dich bereit.");
    lastTick = Date.now();
  } catch {
    audio.pause();
    state.timer = null;
    status(
      "Der Browser kann diese Datei nicht starten. Prüfe das Format oder starte zuerst den Player.",
    );
  } finally {
    busy = false;
    render();
  }
}
async function cancel() {
  generation++;
  audio.pause();
  state.position = audio.currentTime;
  state.timer = null;
  await save();
  $("resume").hidden = true;
  render();
  status("Abgebrochen. Die Musik bleibt pausiert.");
}
async function finish(late) {
  const timer = state.timer,
    trackId = state.track?.id;
  if (!canResume(timer, trackId) || busy) return;
  busy = true;
  const token = ++generation;
  state.timer = null;
  try {
    await save();
    render();
    if (late || document.hidden) {
      $("resume").hidden = false;
      status(
        "Countdown abgelaufen. Der Browser war im Hintergrund. Tippe zum Fortsetzen.",
      );
      return;
    }
    await audio.play();
    if (token !== generation || trackId !== state.track?.id) {
      audio.pause();
      return;
    }
    status("Bereit. Deine Musik läuft weiter.");
    $("resume").hidden = true;
  } catch {
    audio.pause();
    $("resume").hidden = false;
    status(
      "Countdown geschafft. Safari benötigt einen Fingertipp zum Fortsetzen.",
    );
  } finally {
    busy = false;
    render();
  }
}
async function resume() {
  if (!state.track) return;
  try {
    await audio.play();
    $("resume").hidden = true;
    status("Deine Musik läuft weiter.");
  } catch {
    status(
      "Audio konnte nicht abgespielt werden. Bitte eine andere Datei wählen.",
    );
  }
}
async function tick() {
  const now = Date.now(),
    late = now - lastTick > 2500;
  lastTick = now;
  if (state.timer) {
    if (state.timer.trackId !== state.track?.id) {
      await cancel();
      return;
    }
    if (!secondsLeft(state.timer, now))
      await finish(late || now - state.timer.endsAt > 2500);
    else {
      $("countdown").textContent = secondsLeft(state.timer, now);
      $("progress").value =
        state.timer.duration - secondsLeft(state.timer, now);
    }
  }
  if (
    ready &&
    !changing &&
    state.track &&
    !audio.paused &&
    now - lastPosition > 5000
  ) {
    lastPosition = now;
    state.position = audio.currentTime;
    await save();
  }
}
$("audioFile").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) run(() => choose(file));
};
$("start").onclick = () => run(start);
$("cancel").onclick = () => run(cancel);
$("resume").onclick = () => run(resume);
audio.addEventListener("play", () => {
  if (state.timer || (busy && state.timer)) audio.pause();
  $("mediaState").textContent = state.timer
    ? "Während des Countdowns pausiert."
    : "Musik läuft in diesem Player.";
});
audio.addEventListener("pause", () => {
  if (ready && !changing && state.track) {
    state.position = audio.currentTime;
    run(save);
  }
  $("mediaState").textContent = "Pausiert";
});
audio.addEventListener("seeked", () => {
  state.position = audio.currentTime;
  if (ready && !changing) run(save);
});
audio.addEventListener("error", () => {
  if (state.track)
    status(
      "Diese Audiodatei kann der Browser nicht lesen. Bitte MP3, M4A oder WAV versuchen.",
    );
});
audio.addEventListener("ended", () => {
  $("mediaState").textContent = "Song beendet";
});
$("deleteAudio").onclick = () =>
  run(async () => {
    if (
      !confirm(
        "Den lokal gespeicherten Song, seine Position und den Countdown löschen?",
      )
    )
      return;
    generation++;
    audio.pause();
    await queue;
    await db.clear();
    state = { preset: 30, track: null, timer: null, position: 0 };
    $("resume").hidden = true;
    await loadTrack();
    render();
    status("Song und lokale GymDelay-Daten gelöscht.");
  });
if ("mediaSession" in navigator) {
  for (const [name, handler] of Object.entries({
    play: () => (state.timer ? undefined : run(resume)),
    pause: () => audio.pause(),
    stop: () => run(cancel),
    seekto: (details) => {
      if (Number.isFinite(details.seekTime))
        audio.currentTime = details.seekTime;
    },
  }))
    try {
      navigator.mediaSession.setActionHandler(name, handler);
    } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) run(tick);
  else if (ready && state.track) {
    state.position = audio.currentTime;
    run(save);
  }
});
window.addEventListener("pagehide", () => {
  if (ready && state.track) {
    state.position = audio.currentTime;
    run(save);
  }
});
async function init() {
  try {
    const saved = await db.get("state");
    if (saved) {
      state = { ...saved, preset: safeDuration(saved.preset) };
      if (
        state.timer &&
        (!Number.isFinite(state.timer.endsAt) ||
          !PRESETS.includes(state.timer.duration) ||
          state.timer.trackId !== state.track?.id)
      )
        state.timer = null;
    }
    await loadTrack();
    ready = true;
    render();
    if (state.timer) {
      if (secondsLeft(state.timer))
        status("Countdown wiederhergestellt. Lass die App sichtbar.");
      else {
        state.timer = null;
        await save();
        $("resume").hidden = false;
        status(
          "Countdown während deiner Abwesenheit abgelaufen. Tippe zum Fortsetzen.",
        );
      }
    }
    registerOffline($("offlineStatus"));
  } catch (e) {
    status(e.message);
  }
}
setInterval(() => run(tick), 200);
init();
