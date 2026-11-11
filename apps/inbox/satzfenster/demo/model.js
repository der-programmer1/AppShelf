export const limits = Object.freeze({ exercises: 16, sessionMinutes: 180, sets: 12, setMinutes: 15 });

function integerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function emptyPlan() {
  return { minutes: 25, deadline: null, exercises: [] };
}

export function validExercise({ name, sets, minutes }) {
  return typeof name === "string" && name.trim().length > 0 && name.length <= 64
    && integerBetween(sets, 1, limits.sets) && integerBetween(minutes, 1, limits.setMinutes);
}

export function restorePlan(raw) {
  const plan = emptyPlan();
  if (!raw || typeof raw !== "object") return plan;

  if (integerBetween(raw.minutes, 1, limits.sessionMinutes)) plan.minutes = raw.minutes;
  if (Number.isSafeInteger(raw.deadline) && raw.deadline > 0 && raw.deadline <= 8.64e15) {
    plan.deadline = raw.deadline;
  }

  const ids = new Set();
  for (const entry of Array.isArray(raw.exercises) ? raw.exercises.slice(0, limits.exercises) : []) {
    if (!entry || !validExercise(entry) || typeof entry.id !== "string" || !entry.id || ids.has(entry.id)) continue;
    ids.add(entry.id);
    plan.exercises.push({
      id: entry.id,
      name: entry.name.trim(),
      sets: entry.sets,
      minutes: entry.minutes,
      core: entry.core === true,
      completed: integerBetween(entry.completed, 0, entry.sets) ? entry.completed : 0,
      blocked: entry.blocked === true,
    });
  }
  return plan;
}

export function secondsLeft(plan, now) {
  return plan.deadline === null ? plan.minutes * 60 : Math.max(0, Math.ceil((plan.deadline - now) / 1000));
}

export function estimate(exercises, seconds) {
  const byId = new Map();
  let unallocated = seconds;
  let scheduled = 0;
  let deferred = 0;
  let blocked = 0;
  let next = null;

  const ordered = [...exercises.filter((entry) => entry.core), ...exercises.filter((entry) => !entry.core)];
  for (const entry of ordered) {
    const pending = entry.sets - entry.completed;
    const setSeconds = entry.minutes * 60;
    const fit = entry.blocked ? 0 : Math.min(pending, Math.floor(unallocated / setSeconds));
    const waiting = entry.blocked ? pending : 0;
    const later = pending - fit - waiting;
    byId.set(entry.id, { fit, later, waiting });
    scheduled += fit;
    deferred += later;
    blocked += waiting;
    unallocated -= fit * setSeconds;
    if (fit && !next) next = entry;
  }
  return { byId, scheduled, deferred, blocked, next };
}
