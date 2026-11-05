const node = (tag, text = "", className = "") => {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
};

export function validateResult(value) {
  const string = (text, max = 12000) => typeof text === "string" && text.length <= max;
  if (!value || !string(value.title, 150) || !string(value.summary, 1400)
      || !Array.isArray(value.tasks) || value.tasks.length > 12
      || !Array.isArray(value.warnings) || value.warnings.length > 8
      || !value.warnings.every((warning) => string(warning, 700))
      || typeof value.cleanup_confirmed !== "boolean") throw new Error("Der Server hat keinen gültigen Plan zurückgegeben.");
  for (const [index, task] of value.tasks.entries()) {
    if (!task || task.id !== index + 1 || !string(task.title, 150) || !string(task.question, 4000)
        || !string(task.source, 200) || !string(task.hint, 1200) || !string(task.self_check, 1000)
        || !string(task.clarification, 700) || typeof task.needs_clarification !== "boolean"
        || !Number.isInteger(task.estimated_minutes) || task.estimated_minutes < 1 || task.estimated_minutes > 180
        || !Array.isArray(task.steps) || task.steps.length > 8 || !task.steps.every((step) => string(step, 1500))
        || (task.needs_clarification ? task.answer !== null || task.steps.length > 0 : !string(task.answer, 7000) || !task.answer.trim())) {
      throw new Error("Der Server hat eine unvollständige Aufgabe zurückgegeben.");
    }
  }
  const schedule = value.schedule;
  if (!schedule || !Array.isArray(schedule.blocks) || schedule.blocks.length > 40
      || !Number.isInteger(schedule.available_minutes) || schedule.available_minutes < 15 || schedule.available_minutes > 240
      || !Number.isInteger(schedule.used_minutes) || schedule.used_minutes < 0 || schedule.used_minutes > schedule.available_minutes
      || !Array.isArray(schedule.remaining_task_ids) || !schedule.remaining_task_ids.every((id) => value.tasks.some((task) => task.id === id))) {
    throw new Error("Der Zeitplan ist ungültig.");
  }
  let cursor = 0;
  for (const block of schedule.blocks) {
    if (!block || !["work", "break"].includes(block.kind) || block.start !== cursor
        || !Number.isInteger(block.minutes) || block.minutes < 1 || block.minutes > 25
        || !string(block.label, 150) || (block.kind === "work" && !value.tasks.some((task) => task.id === block.task_id))) {
      throw new Error("Der Zeitplan enthält einen ungültigen Zeitblock.");
    }
    cursor += block.minutes;
  }
  if (cursor !== schedule.used_minutes) throw new Error("Die Zeitblöcke sind unvollständig.");
  return value;
}

const disclosure = (label, content) => {
  const details = node("details");
  details.append(node("summary", label), ...content);
  return details;
};

export function renderResult(target, value) {
  const fragment = document.createDocumentFragment();
  const header = node("div", "", "result-header");
  header.append(node("h3", value.title), node("p", value.summary));
  header.append(node("p", "KI-Lösungen können Fehler enthalten. Vergleiche den Lösungsweg mit deinem Unterrichtsmaterial.", "small"));
  const timeline = node("ol", "", "schedule");
  timeline.setAttribute("aria-label", "Zeitblöcke");
  for (const block of value.schedule.blocks) {
    const row = node("li", "", block.kind);
    row.append(node("time", String(block.start) + "–" + (block.start + block.minutes) + " min"), node("span", block.label));
    timeline.append(row);
  }
  if (value.tasks.length) header.append(node("p", value.schedule.used_minutes + " von " + value.schedule.available_minutes + " Minuten verplant."), timeline);
  fragment.append(header);
  for (const warning of value.warnings) fragment.append(node("p", warning, "notice"));
  if (!value.cleanup_confirmed) fragment.append(node("p", "Die Löschung der OpenAI-Sitzung konnte nicht bestätigt werden. Bitte die Sitzung im Betreiberkonto prüfen.", "notice"));
  if (value.schedule.remaining_task_ids.length) {
    fragment.append(node("p", "Noch offen: Aufgabe " + value.schedule.remaining_task_ids.join(", ") + ". Das Zeitfenster reicht nicht vollständig aus oder es fehlen Angaben.", "notice"));
  }
  for (const task of value.tasks) {
    const article = node("article", "", "task-card");
    article.append(node("h3", task.id + ". " + task.title), node("p", task.source + " · etwa " + task.estimated_minutes + " Min.", "task-meta"), node("p", task.question, "question"));
    if (task.needs_clarification) {
      article.append(node("p", "Rückfrage: " + task.clarification, "notice"));
    } else {
      if (task.hint) article.append(disclosure("Erst ein Hinweis", [node("p", task.hint, "answer")]));
      const solution = [];
      if (task.steps.length) {
        const steps = node("ol");
        for (const step of task.steps) steps.append(node("li", step));
        solution.push(steps);
      }
      solution.push(node("p", task.answer, "answer"));
      if (task.self_check) solution.push(node("p", "Selbstkontrolle: " + task.self_check, "answer"));
      const details = disclosure("Lösung & Erklärung anzeigen", solution);
      details.classList.add("solution");
      article.append(details);
      const done = node("label", "", "task-done");
      const checkbox = node("input");
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", () => article.classList.toggle("done", checkbox.checked));
      done.append(checkbox, node("span", "Aufgabe erledigt"));
      article.append(done);
    }
    fragment.append(article);
  }
  target.replaceChildren(fragment);
}

export function exportText(value) {
  const lines = ["AUFGABENPILOT · FA2-BEARBEITUNGSPLAN", value.title, "", value.summary, "",
    "ZEITPLAN (" + value.schedule.available_minutes + " Minuten)"];
  for (const block of value.schedule.blocks) lines.push(block.start + "–" + (block.start + block.minutes) + " Min.: " + block.label);
  if (value.schedule.remaining_task_ids.length) lines.push("Noch offen: Aufgabe " + value.schedule.remaining_task_ids.join(", "));
  for (const warning of value.warnings) lines.push("Hinweis: " + warning);
  for (const task of value.tasks) {
    lines.push("", task.id + ". " + task.title, "Quelle: " + task.source, task.question);
    if (task.needs_clarification) lines.push("Rückfrage: " + task.clarification);
    else lines.push("Hinweis: " + task.hint, "Lösungsweg:", ...task.steps.map((step, index) => (index + 1) + ". " + step),
      "Antwort: " + task.answer, "Selbstkontrolle: " + task.self_check);
  }
  lines.push("", "KI-Lösungen können Fehler enthalten. Mit Unterrichtsmaterial vergleichen.");
  return lines.join("\n");
}
