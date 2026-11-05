"""Synchronize AppShelf's frontend and verify a complete, secret-free handoff."""
import argparse
from pathlib import Path
import shutil
import zipfile

project = Path(__file__).resolve().parents[1]
root = project.parents[1]
entry = root / "apps/inbox/aufgabenpilot"
archive = entry / "AufgabenPilot-0.1.0-source.zip"
args = argparse.ArgumentParser()
args.add_argument("--sync", action="store_true")
args.add_argument("--check", action="store_true")
options = args.parse_args()
paths = [project / name for name in ("README.md", "Dockerfile", ".dockerignore", ".gitignore", "compose.yaml", "Caddyfile")]
for folder in ("backend", "web", "tests", "scripts"):
    for path in sorted((project / folder).rglob("*")):
        if not path.is_file() or any(part in {".venv", "__pycache__", "node_modules", "test-results"} for part in path.parts):
            continue
        if path.name.startswith(".env") and path.name != ".env.example":
            continue
        if path.suffix in {".py", ".js", ".mjs", ".html", ".css", ".svg", ".txt", ".md"} or path.name == ".env.example":
            paths.append(path)
relative = {path.relative_to(project).as_posix(): path for path in paths}
web_files = {path.relative_to(project / "web").as_posix(): path for path in (project / "web").rglob("*") if path.is_file()}
if options.sync:
    entry.mkdir(parents=True, exist_ok=True)
    target = entry / "demo"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(project / "web", target)
    shutil.copyfile(project / "README.md", entry / "README.md")
if options.check:
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None, "Source ZIP CRC failure"
        assert set(bundle.namelist()) == set(relative), "Source ZIP is incomplete or contains unexpected files"
        for name, path in relative.items():
            assert bundle.read(name) == path.read_bytes(), f"Source mismatch: {name}"
else:
    entry.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for name, path in relative.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 5, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, path.read_bytes())
assert (entry / "README.md").read_bytes() == (project / "README.md").read_bytes(), "README differs"
demo = entry / "demo"
assert {path.relative_to(demo).as_posix() for path in demo.rglob("*") if path.is_file()} == set(web_files), "Demo file list differs"
for name, path in web_files.items():
    assert (demo / name).read_bytes() == path.read_bytes(), f"Demo mismatch: {name}"
print(f"AufgabenPilot: {len(relative)} source files and {len(web_files)} frontend files byte-identical; ZIP valid.")
