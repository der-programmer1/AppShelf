"""Test runner only: real HTTP app, with an explicitly fake upstream transport."""
from pathlib import Path
import sys
import httpx
import uvicorn

backend = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(backend))
sys.path.insert(0, str(backend / "tests"))
from app import create_app, Settings
from provider import CodexProvider
from test_app import Upstream, TOKEN, KEY

port = int(sys.argv[1])
upstream = Upstream()
settings = Settings(api_key=KEY, access_token=TOKEN, origins=(f"http://127.0.0.1:{port}",))
provider = CodexProvider(KEY, settings.model, transport=httpx.MockTransport(upstream.handle), poll_interval=.001)
uvicorn.run(create_app(settings, provider), host="127.0.0.1", port=port, access_log=False, log_level="warning")
