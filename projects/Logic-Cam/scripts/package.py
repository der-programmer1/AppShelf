"""Build the AppShelf demo and source ZIP from the portable Logic-Cam project.

Run with --check in CI to reject stale generated files without modifying them.
The camera/logic code is copied verbatim; only the local documentation filename
changes to avoid duplicate README release-asset names in the shared publisher.
"""
import argparse
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
ENTRY = REPO / "apps/inbox/logic-cam"
DEMO = ENTRY / "demo"
RUNTIME_FILES = {
    "index.html", "style.css", "sw.js", ".nojekyll", "manifest.webmanifest",
    "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "TEST_REPORT.md",
}
EXCLUDED = {".git", "node_modules", "__pycache__", "dist", "test-results"}


def source_files():
    return sorted(p for p in ROOT.rglob("*") if p.is_file()
                  and not any(part in EXCLUDED for part in p.relative_to(ROOT).parts))


def demo_files():
    expected = {}
    for source in source_files():
        relative = source.relative_to(ROOT).as_posix()
        if relative not in RUNTIME_FILES and relative.split("/")[0] not in {"js", "vendor", "assets"}:
            continue
        data = source.read_bytes()
        if relative == "README.md":
            relative = "guide.md"
        if relative in {"index.html", "sw.js"}:
            data = data.replace(b"README.md", b"guide.md")
        if relative == "index.html":
            # AppShelf publishes dependency-free clients; the portable source
            # retains the requested optional CDN integration and local fallback.
            data = re.sub(
                rb'<script\b[^>]*src="https://cdn\.tailwindcss\.com/3\.4\.17"[^>]*>\s*</script>',
                b"", data, flags=re.S,
            )
            data = re.sub(rb'\s*<!-- Optional Tailwind[^>]*-->\s*', b"\n", data)
            data = data.replace(b'src="js/app.js"', b'src="app.js"')
        if relative == "sw.js":
            data = data.replace(b"const ASSETS = [", b'const ASSETS = [\n  "./app.js",')
        expected[relative] = data
    expected["icon.svg"] = (ROOT / "assets/icon.svg").read_bytes()
    expected["app.js"] = b'import "./js/app.js";\n'
    return expected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = demo_files()
    archive_path = ENTRY / "logic-cam-source.zip"
    if args.check:
        for relative, data in expected.items():
            target = DEMO / relative
            if not target.is_file() or target.read_bytes() != data:
                raise RuntimeError(f"Stale or missing demo: {target.relative_to(REPO)}")
        actual = {p.relative_to(DEMO).as_posix() for p in DEMO.rglob("*") if p.is_file()}
        if actual != set(expected):
            raise RuntimeError("Demo contains unexpected files")
        with zipfile.ZipFile(archive_path) as archive:
            expected_names = {"logic-cam/" + p.relative_to(ROOT).as_posix() for p in source_files()}
            if set(archive.namelist()) != expected_names or archive.testzip() is not None:
                raise RuntimeError("Source archive is incomplete")
            for source in source_files():
                if archive.read("logic-cam/" + source.relative_to(ROOT).as_posix()) != source.read_bytes():
                    raise RuntimeError("Source archive contains stale code")
        print(f"Logic-Cam package verified: {len(expected)} demo files and complete source ZIP.")
        return
    for relative, data in expected.items():
        target = DEMO / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    ENTRY.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source in source_files():
            archive.write(source, "logic-cam/" + source.relative_to(ROOT).as_posix())
    print(f"Packaged {len(expected)} demo files; source ZIP: {archive_path.stat().st_size:,} bytes.")


if __name__ == "__main__":
    main()
