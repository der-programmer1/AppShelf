import { GATES, truthTable } from "./logicEngine.js";

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Private browsing may disable persistence. */
    }
  },
};

/** Entirely local Socratic coach. No model, API, messages, or camera data leave the device. */
export class AICoach {
  constructor() {
    this.score = Math.max(
      0,
      Math.min(10000000, Number(storage.get("logic-cam-score")) || 0),
    );
    this.streak = 0;
    this.round = 0;
    this.current = null;
  }
  next(engine, selectedId) {
    this.round++;
    const { graph, result } = engine;
    const diagnostic = result.diagnostics.find((d) =>
      ["FLOATING", "CYCLE", "MULTIPLE_DRIVERS"].includes(d.code),
    );
    if (diagnostic && this.round % 2 === 1) {
      const answers = {
        FLOATING: [
          "Mit einem definierten Eingang verbinden",
          "Der offene Pin ist automatisch 0",
          "Das Gatter erhält immer 1",
        ],
        CYCLE: [
          "Die Rückkopplung auftrennen",
          "Einen weiteren Ausgang ergänzen",
          "Die Kamera heller einstellen",
        ],
        MULTIPLE_DRIVERS: [
          "Pro Eingang genau einen Treiber verwenden",
          "Beide Treiber immer auf 1 setzen",
          "Den Ausgang als Eingang markieren",
        ],
      };
      this.current = {
        kind: "debug",
        title: "Finde den Fehler",
        text: diagnostic.message + " Wie behebst du das?",
        choices: answers[diagnostic.code],
        correct: 0,
        explanation:
          "Ein kombinatorischer Graph braucht definierte Eingänge, eindeutige Treiber und keine Rückkopplung. Ein offener Anschluss bleibt unbekannt (?).",
        answered: false,
      };
      return this.current;
    }
    const gates = graph.nodes.filter((n) => Object.hasOwn(GATES, n.type));
    const selected = gates.find((n) => n.id === selectedId);
    const gate =
      selected ?? gates[(this.round - 1) % Math.max(1, gates.length)];
    if (!gate) {
      this.current = {
        kind: "learn",
        title: "Ein guter Anfang",
        text: "Welches Gatter liefert nur dann 1, wenn beide Eingänge 1 sind?",
        choices: ["AND", "OR", "XOR"],
        correct: 0,
        explanation:
          "AND ist die logische UND-Verknüpfung. Nur 1 UND 1 ergibt 1.",
        answered: false,
      };
      return this.current;
    }
    const inputs = result.pins.get(gate.id) ?? [];
    const upstream = graph.nodes.filter(
      (n) => n.type === "INPUT" && result.values.get(n.id) !== null,
    );
    const candidate = upstream[(this.round - 1) % Math.max(1, upstream.length)];
    if (candidate && inputs.every((v) => v !== null) && this.round % 3 !== 0) {
      const changed = 1 - result.values.get(candidate.id);
      const simulated = engine.solve({ [candidate.id]: changed });
      const answer = simulated.values.get(gate.id);
      this.current = {
        kind: "predict",
        title: "Was wäre, wenn …",
        text: `${gate.type} ist aktiv. Was liegt am Ausgang dieses Gatters an, wenn du Eingang ${candidate.label} von ${1 - changed} auf ${changed} setzt?`,
        choices: ["0 · LOW", "1 · HIGH", "? · Nicht bestimmbar"],
        correct: answer === null ? 2 : answer,
        explanation: `Mit ${candidate.label} = ${changed} erhält ${gate.type} die Eingänge ${(simulated.pins.get(gate.id) ?? []).map((v) => v ?? "?").join(" und ")}. Sein Ausgang ist ${answer ?? "?"}. Alle anderen Eingänge bleiben gleich.`,
        gateId: gate.id,
        answered: false,
      };
    } else {
      const table = truthTable(gate.type),
        row = table[this.round % table.length];
      this.current = {
        kind: "gate",
        title: `Verstehe ${gate.type}`,
        text: `Was liefert ein ${gate.type}-Gatter bei ${row.inputs.map((v, i) => `${String.fromCharCode(65 + i)} = ${v}`).join(" und ")}?`,
        choices: ["0 · LOW", "1 · HIGH", "? · Nicht bestimmbar"],
        correct: row.output,
        explanation: `${gate.type}(${row.inputs.join(", ")}) = ${row.output}. ${gate.type === "XOR" ? "XOR liefert 1, wenn seine beiden Eingänge verschieden sind." : gate.type === "NOT" ? "NOT kehrt seinen Eingang um." : "Vergleiche die Kombination mit der Wahrheitstabelle."}`,
        gateId: gate.id,
        answered: false,
      };
    }
    return this.current;
  }
  answer(index) {
    const question = this.current;
    if (
      !question ||
      question.answered ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= question.choices.length
    )
      return null;
    question.answered = true;
    question.selected = index;
    const correct = index === question.correct;
    this.streak = correct ? this.streak + 1 : 0;
    const points = correct ? 100 : 0;
    this.score += points;
    storage.set("logic-cam-score", String(this.score));
    return { correct, points, explanation: question.explanation };
  }
}
