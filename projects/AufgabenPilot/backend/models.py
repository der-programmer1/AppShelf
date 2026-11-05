from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Upload(StrictModel):
    name: str = Field(min_length=1, max_length=150)
    mime: Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]
    data: str = Field(min_length=4, max_length=11_200_000)


class PlanRequest(StrictModel):
    consent: Literal[True]
    text: str = Field(default="", max_length=12000)
    subject: str = Field(default="", max_length=100)
    grade: str = Field(default="", max_length=60)
    minutes: int = Field(default=60, ge=15, le=240)
    files: list[Upload] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def has_input(self):
        if not self.text.strip() and not self.files:
            raise ValueError("Mindestens eine Aufgabe oder eine Datei angeben.")
        return self


class Task(StrictModel):
    id: int = Field(ge=1, le=12)
    title: str = Field(min_length=1, max_length=150)
    source: str = Field(max_length=200)
    question: str = Field(min_length=1, max_length=4000)
    needs_clarification: bool
    clarification: str = Field(max_length=700)
    estimated_minutes: int = Field(ge=1, le=180)
    hint: str = Field(max_length=1200)
    steps: list[str] = Field(max_length=8)
    answer: str | None
    self_check: str = Field(max_length=1000)

    @model_validator(mode="after")
    def readable_answer(self):
        if any(len(step) > 1500 for step in self.steps):
            raise ValueError("Lösungsschritte zu lang.")
        if self.answer is not None and len(self.answer) > 7000:
            raise ValueError("Lösung zu lang.")
        if self.needs_clarification:
            if self.answer is not None or self.steps or not self.clarification.strip():
                raise ValueError("Unklare Aufgaben benötigen eine Rückfrage, keine Lösung.")
        elif not self.answer or not self.answer.strip():
            raise ValueError("Eine lesbare Aufgabe benötigt eine Lösung.")
        return self


class Analysis(StrictModel):
    title: str = Field(min_length=1, max_length=150)
    summary: str = Field(max_length=1400)
    warnings: list[str] = Field(max_length=8)
    tasks: list[Task] = Field(max_length=12)

    @model_validator(mode="after")
    def consistent_tasks(self):
        if [task.id for task in self.tasks] != list(range(1, len(self.tasks) + 1)):
            raise ValueError("Aufgaben müssen fortlaufend nummeriert sein.")
        if any(len(warning) > 700 for warning in self.warnings):
            raise ValueError("Hinweis zu lang.")
        return self


def output_schema():
    """Keep every schema property required for structured model output."""
    schema = Analysis.model_json_schema()
    return schema


def build_schedule(analysis: Analysis, minutes: int):
    """Deterministic time budget, 25-minute focus blocks and 5-minute breaks."""
    blocks, remaining = [], []
    elapsed = focus = 0
    for task in analysis.tasks:
        if task.needs_clarification:
            remaining.append(task.id)
            continue
        left = task.estimated_minutes
        while left and elapsed < minutes:
            if focus == 25:
                # A break is useful only when at least one work minute follows.
                if minutes - elapsed <= 5:
                    break
                blocks.append({"kind": "break", "task_id": None, "start": elapsed, "minutes": 5, "label": "Kurze Pause"})
                elapsed += 5
                focus = 0
            duration = min(left, 25 - focus, minutes - elapsed)
            blocks.append({"kind": "work", "task_id": task.id, "start": elapsed, "minutes": duration, "label": task.title})
            elapsed += duration
            focus += duration
            left -= duration
        if left:
            remaining.append(task.id)
    return {"blocks": blocks, "used_minutes": elapsed, "available_minutes": minutes, "remaining_task_ids": remaining}
