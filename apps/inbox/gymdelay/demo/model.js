export const PRESETS = [5, 10, 15, 30, 60];
export function safeDuration(seconds) {
  return Math.max(5, Math.min(60, Math.round(Number(seconds) || 30)));
}
export function startCountdown(trackId, seconds, now = Date.now()) {
  if (!trackId) throw Error("Wähle zuerst eine Audiodatei.");
  return {
    trackId,
    endsAt: now + safeDuration(seconds) * 1000,
    duration: safeDuration(seconds),
  };
}
export function secondsLeft(timer, now = Date.now()) {
  return timer ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0;
}
export function canResume(timer, trackId, now = Date.now()) {
  return !!timer && timer.trackId === trackId && secondsLeft(timer, now) === 0;
}
export function validAudio(file) {
  return (
    file &&
    file.size > 0 &&
    file.size <= 100 * 1024 * 1024 &&
    (/^(audio\/|video\/mp4)/.test(file.type) ||
      (!file.type && /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(file.name)))
  );
}
