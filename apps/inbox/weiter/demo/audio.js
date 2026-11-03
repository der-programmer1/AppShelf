// Portable PCM WAV keeps Chrome WebM recordings compatible with Android backups.
export function encodeWav(channels, sampleRate) {
  if (
    !channels.length ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 96000 ||
    !channels[0].length ||
    channels.some((c) => c.length !== channels[0].length)
  )
    throw Error("Ungültige Audiodaten.");
  const samples = channels[0].length;
  if (samples * 2 + 44 > 3 * 1024 * 1024)
    throw Error(
      "Die Aufnahme ist zu lang. Bitte eine kürzere Sprachnotiz aufnehmen.",
    );
  const bytes = new ArrayBuffer(44 + samples * 2),
    view = new DataView(bytes);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    let value = 0;
    for (const channel of channels) value += channel[i] / channels.length;
    value = Math.max(-1, Math.min(1, value));
    view.setInt16(
      44 + i * 2,
      Math.round(value * (value < 0 ? 32768 : 32767)),
      true,
    );
  }
  return new Blob([bytes], { type: "audio/wav" });
}
export async function prepareRecording(chunks, mime) {
  const blob = new Blob(chunks, { type: mime });
  if (!mime.startsWith("audio/webm")) return blob;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio)
    throw Error(
      "Aufnahme konnte nicht konvertiert werden. Bitte eine M4A/MP3-Datei hinzufügen.",
    );
  const context = new Audio({ sampleRate: 16000 });
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(
      Array.from({ length: buffer.numberOfChannels }, (_, i) =>
        buffer.getChannelData(i),
      ),
      buffer.sampleRate,
    );
  } finally {
    await context.close();
  }
}
