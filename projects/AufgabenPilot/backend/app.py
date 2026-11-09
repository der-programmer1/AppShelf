import asyncio
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
import hmac
import json
import os
from pathlib import Path
import time
from urllib.parse import urlsplit
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from media import MediaError, prepare_files
from models import PlanRequest, build_schedule
from provider import CodexProvider, ProviderError

MAX_REQUEST_BYTES = 12 * 1024 * 1024


@dataclass
class Settings:
    api_key: str = ""
    access_token: str = ""
    model: str = "gpt-6-astra"
    origins: tuple = ("https://der-programmer1.github.io", "http://localhost:8000", "http://127.0.0.1:8000")
    hourly_limit: int = 20
    timeout: int = 120

    @property
    def ready(self):
        return bool(self.api_key.strip()) and len(self.access_token) >= 20

    @classmethod
    def from_env(cls):
        settings = cls(
            api_key=os.environ.get("OPENAI_API_KEY", "").strip(),
            access_token=os.environ.get("APP_ACCESS_TOKEN", "").strip(),
            model=os.environ.get("OPENAI_MODEL", "gpt-6-astra").strip(),
            origins=tuple(value.strip() for value in os.environ.get("ALLOWED_ORIGINS", ",".join(cls.origins)).split(",") if value.strip()),
            hourly_limit=int(os.environ.get("RATE_LIMIT_PER_HOUR", "20")),
            timeout=int(os.environ.get("AI_TIMEOUT_SECONDS", "120")),
        )
        if settings.access_token and len(settings.access_token) < 20:
            raise ValueError("APP_ACCESS_TOKEN muss mindestens 20 Zeichen lang sein.")
        if not 1 <= settings.hourly_limit <= 500 or not 10 <= settings.timeout <= 180:
            raise ValueError("Ungültige Anfragelimit- oder Timeout-Konfiguration.")
        if not settings.model or len(settings.model) > 100:
            raise ValueError("OPENAI_MODEL fehlt oder ist ungültig.")
        for origin in settings.origins:
            parsed = urlsplit(origin)
            if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password \
                    or parsed.path or parsed.query or parsed.fragment:
                raise ValueError("ALLOWED_ORIGINS muss exakte HTTP(S)-Ursprünge ohne Pfad enthalten.")
        return settings


class PublicError(Exception):
    def __init__(self, message, status):
        self.message, self.status = message, status


class Budget:
    def __init__(self, limit):
        self.limit, self.active, self.times = limit, 0, deque()
        self.lock = asyncio.Lock()

    @asynccontextmanager
    async def reserve(self):
        async with self.lock:
            now = time.monotonic()
            while self.times and self.times[0] <= now - 3600:
                self.times.popleft()
            if self.active >= 2 or len(self.times) >= self.limit:
                raise PublicError("Das Anfragelimit ist erreicht. Bitte später erneut versuchen.", 429)
            self.times.append(now)
            self.active += 1
        try:
            yield
        finally:
            async with self.lock:
                self.active -= 1


def create_app(settings=None, provider=None):
    settings = settings or Settings.from_env()
    provider = provider or CodexProvider(settings.api_key, settings.model, settings.timeout)
    budget = Budget(settings.hourly_limit)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.origins),
                       allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"],
                       allow_credentials=False)

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' blob: data:; connect-src 'self' https: http://localhost:8000 http://127.0.0.1:8000; "
            "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'"
        )
        if request.url.path.startswith("/api/") or request.url.path == "/health":
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(PublicError)
    @app.exception_handler(ProviderError)
    async def public_error(request, error):
        return JSONResponse({"error": error.message}, status_code=error.status)

    @app.get("/health")
    async def health():
        return {"status": "ready" if settings.ready else "configuration_required", "provider": "codex-agents"}

    @app.post("/api/plan")
    async def plan(request: Request):
        origin = request.headers.get("origin")
        if origin and origin not in settings.origins:
            raise PublicError("Dieser Website-Ursprung ist nicht freigegeben.", 403)
        if not settings.ready:
            raise PublicError("Der Dienst ist noch nicht eingerichtet. OPENAI_API_KEY und APP_ACCESS_TOKEN auf dem Backend eintragen.", 503)
        expected = ("Bearer " + settings.access_token).encode()
        if not hmac.compare_digest(request.headers.get("authorization", "").encode(), expected):
            raise PublicError("Der App-Zugangscode fehlt oder ist falsch.", 401)
        if request.headers.get("content-type", "").split(";")[0].strip() != "application/json":
            raise PublicError("Die Anfrage muss JSON enthalten.", 415)
        async with budget.reserve():
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                    raise PublicError("Der Upload ist zu groß. Bitte höchstens 8 MB je Datei und weniger Dateien auf einmal senden.", 413)
                body.extend(chunk)
            try:
                payload = PlanRequest.model_validate(json.loads(body))
            except (ValueError, ValidationError, UnicodeDecodeError) as error:
                raise PublicError("Eingabe prüfen: Zustimmung erforderlich, 15–240 Minuten, höchstens drei Dateien und eine Aufgabe.", 422) from error
            finally:
                body.clear()
            try:
                images = await run_in_threadpool(prepare_files, payload.files)
            except MediaError as error:
                raise PublicError(str(error), 422) from error
            # Drop original file data before waiting for the cloud analysis.
            payload.files.clear()
            result, cleaned = await provider.generate(payload, images, request.is_disconnected)
            images.clear()
            return {**result.model_dump(), "schedule": build_schedule(result, payload.minutes),
                    "cleanup_confirmed": cleaned}

    web = Path(__file__).resolve().parent.parent / "web"
    app.mount("/", StaticFiles(directory=web, html=True), name="web")
    return app


app = create_app()
