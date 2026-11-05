import asyncio
import base64
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
import unittest
import httpx
from PIL import Image
from app import create_app, Settings, MAX_REQUEST_BYTES
from media import prepare_files, MediaError
from models import Analysis, Upload, build_schedule
from provider import CodexProvider

TOKEN = "test-access-code-with-at-least-32-characters"
KEY = "not-a-real-openai-key"


def fixture():
    # Explicitly artificial contract answer. Production has no fallback answers.
    return {"title": "Vertragstest: Lineare Gleichung", "summary": "Eine Testaufgabe.",
            "warnings": [], "tasks": [{
                "id": 1, "title": "Gleichung lösen", "source": "Eingabetext",
                "question": "3x + 5 = 20", "needs_clarification": False, "clarification": "",
                "estimated_minutes": 30, "hint": "Beginne mit minus fünf.",
                "steps": ["3x = 15", "x = 5"], "answer": "x = 5",
                "self_check": "3 · 5 + 5 = 20",
            }]}


class Upstream:
    def __init__(self, mode="success"):
        self.mode, self.requests, self.polls = mode, [], 0

    async def handle(self, request):
        self.requests.append(request)
        route = request.url.path
        if request.method == "POST" and route == "/v1/agents/sessions":
            if self.mode == "rate":
                return httpx.Response(429, json={"error": {"message": KEY + " private upstream error"}})
            return httpx.Response(200, json={"id": "sess_contract", "status": "idle"})
        if route.endswith("/turns"):
            self.polls += 1
            status = "queued" if self.mode == "timeout" or self.polls == 1 else "completed"
            if self.mode == "waiting":
                status = "waiting"
            return httpx.Response(200, json={"data": [{"id": "turn_contract", "status": status}]})
        if route.endswith("/items"):
            result = fixture()
            if self.mode == "invalid":
                result["tasks"][0]["needs_clarification"] = True
            text = "not JSON" if self.mode == "malformed" else json.dumps(result)
            return httpx.Response(200, json={"data": [
                {"type": "message", "role": "assistant", "phase": "commentary", "status": "completed",
                 "turn_id": "turn_contract", "content": [{"type": "output_text", "text": "Never display commentary."}]},
                {"type": "message", "role": "assistant", "phase": "final_answer", "status": "completed",
                 "turn_id": "turn_contract", "content": [{"type": "output_text", "text": text}]},
            ]})
        if route.endswith("/events"):
            return httpx.Response(200, json={})
        if request.method == "DELETE":
            return httpx.Response(500 if self.mode == "cleanup" else 200, json={})
        raise AssertionError("Unexpected upstream request: " + str(request.url))


def image_upload():
    output = BytesIO()
    Image.new("RGB", (32, 20), "white").save(output, "PNG")
    return {"name": "Hausaufgaben.png", "mime": "image/png", "data": base64.b64encode(output.getvalue()).decode()}


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.upstream = Upstream()
        self.settings = Settings(api_key=KEY, access_token=TOKEN)
        self.app = self.build_app()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://localhost:8000")

    def build_app(self, mode="success", timeout=1):
        self.upstream.mode = mode
        provider = CodexProvider(KEY, "gpt-6-astra", timeout=timeout,
                                 transport=httpx.MockTransport(self.upstream.handle), poll_interval=.001)
        return create_app(self.settings, provider)

    async def asyncTearDown(self):
        await self.client.aclose()

    async def post(self, payload=None, **kwargs):
        return await self.client.post("/api/plan", json=payload if payload is not None else
                                      {"consent": True, "text": "3x+5=20", "minutes": 60},
                                      headers=kwargs.pop("headers", {"Authorization": "Bearer " + TOKEN}), **kwargs)

    async def test_real_contract_and_deterministic_schedule(self):
        response = await self.post()
        self.assertEqual(response.status_code, 200, response.text)
        value = response.json()
        self.assertEqual(value["tasks"][0]["answer"], "x = 5")
        self.assertEqual([b["kind"] for b in value["schedule"]["blocks"]], ["work", "break", "work"])
        self.assertTrue(value["cleanup_confirmed"])
        self.assertGreaterEqual(self.upstream.polls, 2, "idle creation must not be treated as completion")
        creation = self.upstream.requests[0]
        self.assertEqual(creation.headers["openai-beta"], "agents=v1")
        self.assertTrue(creation.headers["idempotency-key"])
        payload = json.loads(creation.content)
        self.assertEqual(payload["environment"], {"type": "none"})
        self.assertEqual(payload["agent"]["tools"], [])
        self.assertEqual(payload["agent"]["multi_agent"], {"enabled": False})
        self.assertEqual(payload["agent"]["text"]["format"]["type"], "json_schema")
        self.assertNotIn("store", payload, "Agents session deletion is used; Responses-only fields are not invented")
        self.assertEqual(self.upstream.requests[-1].method, "DELETE")
        self.assertNotIn(KEY, response.text)

    async def test_image_is_reencoded_and_forwarded_as_image(self):
        response = await self.post({"consent": True, "files": [image_upload()]})
        self.assertEqual(response.status_code, 200, response.text)
        content = json.loads(self.upstream.requests[0].content)["input"][0]["content"]
        self.assertEqual(content[1]["type"], "input_image")
        self.assertTrue(content[1]["image_url"].startswith("data:image/jpeg;base64,"))
        self.assertLess(len(content[1]["image_url"]), 1_048_576)
        self.assertNotIn("Hausaufgaben.png", content[0]["text"])

    async def test_authentication_prevents_upstream_calls(self):
        response = await self.post(headers={"Authorization": "Bearer wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.upstream.requests, [])

    async def test_missing_key_is_clear_503_without_fake_answer(self):
        app = create_app(Settings(access_token=TOKEN))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost:8000") as client:
            self.assertEqual((await client.get("/health")).json()["status"], "configuration_required")
            response = await client.post("/api/plan", json={"consent": True, "text": "Aufgabe"})
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("tasks", response.json())

    async def test_invalid_inputs_have_no_upstream_side_effects(self):
        for payload in [
            {"consent": False, "text": "Aufgabe"}, {"text": "Aufgabe"},
            {"consent": True}, {"consent": True, "text": "Aufgabe", "minutes": "60"},
            {"consent": True, "text": "Aufgabe", "minutes": 241},
            {"consent": True, "text": "Aufgabe", "unexpected": "field"},
            {"consent": True, "files": [{**image_upload(), "data": "%%%%"}]},
            {"consent": True, "files": [{**image_upload(), "mime": "image/jpeg"}]},
        ]:
            with self.subTest(payload=str(payload)[:80]):
                self.assertEqual((await self.post(payload)).status_code, 422)
        self.assertEqual(self.upstream.requests, [])

    async def test_origin_and_cors(self):
        response = await self.post(headers={"Authorization": "Bearer " + TOKEN, "Origin": "https://evil.invalid"})
        self.assertEqual(response.status_code, 403)
        preflight = await self.client.options("/api/plan", headers={
            "Origin": "https://der-programmer1.github.io", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type"})
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers["access-control-allow-origin"], "https://der-programmer1.github.io")
        self.assertNotIn("access-control-allow-credentials", preflight.headers)
        self.assertEqual(self.upstream.requests, [])

    async def test_body_limit(self):
        response = await self.client.post("/api/plan", content=b" " * (MAX_REQUEST_BYTES + 1),
                                          headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.upstream.requests, [])

    async def test_rate_limit_counts_attempts_globally(self):
        self.settings.hourly_limit = 1
        app = self.build_app()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost:8000") as client:
            self.assertEqual((await client.post("/api/plan", json={"consent": True, "text": "A"},
                                               headers={"Authorization": "Bearer " + TOKEN})).status_code, 200)
            self.assertEqual((await client.post("/api/plan", json={"consent": True, "text": "A"},
                                               headers={"Authorization": "Bearer " + TOKEN})).status_code, 429)

    async def test_invalid_or_unreadable_model_output_is_rejected(self):
        for mode in ("invalid", "malformed"):
            self.upstream.mode = mode
            response = await self.post()
            self.assertEqual(response.status_code, 502)
            self.assertNotIn("tasks", response.json())

    async def test_provider_rate_error_never_leaks_key(self):
        self.upstream.mode = "rate"
        response = await self.post()
        self.assertEqual(response.status_code, 429)
        self.assertNotIn(KEY, response.text)

    async def test_timeout_cancels_and_deletes_known_session(self):
        app = self.build_app(mode="timeout", timeout=.01)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost:8000") as client:
            response = await client.post("/api/plan", json={"consent": True, "text": "Aufgabe"},
                                         headers={"Authorization": "Bearer " + TOKEN})
            self.assertEqual(response.status_code, 504, response.text)
        self.assertTrue(any(r.url.path.endswith("/events") for r in self.upstream.requests))
        self.assertEqual(self.upstream.requests[-1].method, "DELETE")

    async def test_waiting_for_external_action_is_an_error(self):
        self.upstream.mode = "waiting"
        self.assertEqual((await self.post()).status_code, 502)
        self.assertEqual(self.upstream.requests[-1].method, "DELETE")

    async def test_failed_cleanup_is_reported(self):
        self.upstream.mode = "cleanup"
        response = await self.post()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["cleanup_confirmed"])

    async def test_static_frontend_cannot_read_backend_files(self):
        for route in ("/.env", "/app.py", "/backend/.env", "/../backend/.env"):
            self.assertEqual((await self.client.get(route)).status_code, 404)
        response = await self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("AufgabenPilot", response.text)
        self.assertIn("frame-ancestors 'none'", response.headers["content-security-policy"])

    async def test_no_client_secret_or_html_injection(self):
        web = Path(__file__).resolve().parents[2] / "web"
        for name in ("app.js", "render.js", "config.js"):
            text = (web / name).read_text()
            self.assertNotIn("innerHTML", text)
            self.assertNotIn("OPENAI_API_KEY=", text)
            self.assertNotIn(KEY, text)


class MediaAndPlanTests(unittest.TestCase):
    def test_pdf_is_rendered_into_real_page_images(self):
        output = BytesIO()
        image = Image.new("RGB", (400, 600), "white")
        image.save(output, "PDF", save_all=True, append_images=[image])
        upload = Upload(name="Aufgaben.pdf", mime="application/pdf", data=base64.b64encode(output.getvalue()).decode())
        pages = prepare_files([upload])
        self.assertEqual([label for label, _ in pages], ["Dokument 1, Seite 1", "Dokument 1, Seite 2"])
        for _, data in pages:
            with Image.open(BytesIO(base64.b64decode(data.split(",")[1]))) as page:
                self.assertEqual(page.format, "JPEG")
                self.assertGreater(page.height, page.width)

    def test_pdf_page_limit_has_no_silent_truncation(self):
        output = BytesIO()
        image = Image.new("RGB", (50, 50), "white")
        image.save(output, "PDF", save_all=True, append_images=[image] * 3)
        with self.assertRaises(MediaError):
            prepare_files([Upload(name="too-many.pdf", mime="application/pdf", data=base64.b64encode(output.getvalue()).decode())])

    def test_exif_orientation_and_metadata_removal(self):
        output = BytesIO()
        image = Image.new("RGB", (40, 20), "white")
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = "private metadata"
        image.save(output, "JPEG", exif=exif)
        result = prepare_files([Upload(name="photo.jpg", mime="image/jpeg", data=base64.b64encode(output.getvalue()).decode())])
        with Image.open(BytesIO(base64.b64decode(result[0][1].split(",")[1]))) as clean:
            self.assertEqual(clean.size, (20, 40))
            self.assertEqual(len(clean.getexif()), 0)

    def test_schedule_never_exceeds_budget_or_invents_time(self):
        analysis = Analysis.model_validate(fixture())
        short = build_schedule(analysis, 25)
        self.assertEqual(short["used_minutes"], 25)
        self.assertEqual(short["remaining_task_ids"], [1])
        full = build_schedule(analysis, 60)
        self.assertEqual(full["used_minutes"], 35)
        self.assertEqual(full["remaining_task_ids"], [])
        self.assertEqual(sum(block["minutes"] for block in full["blocks"]), 35)

    def test_unclear_tasks_do_not_get_solutions_or_time_blocks(self):
        value = fixture()
        value["tasks"][0].update(needs_clarification=True, clarification="Welche Zahl steht vor x?", answer=None, steps=[])
        plan = build_schedule(Analysis.model_validate(value), 60)
        self.assertEqual(plan["blocks"], [])
        self.assertEqual(plan["remaining_task_ids"], [1])


if __name__ == "__main__":
    unittest.main()
