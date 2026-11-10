# Validation — 2026-11-10

`npm test`: **39 passed, 0 failed** (Node.js, bundled OpenCV 4.13.0 WebAssembly).

`npm run check`: JavaScript syntax, ES-module imports, 88 unique HTML IDs, all UI references, local files, SVG symbols, JSON files, and 14 offline-cache assets passed validation.

Coverage includes all six truth tables; controlling values with unknown pins; compiled DAG propagation; graph isolation; floating pins; multiple drivers; feedback SCCs; invalid imports; coach correctness and duplicate-answer scoring; camera permissions, stream release and cancelled acquisition; video/AR coordinate mapping; actual OpenCV recognition of AND, OR, NOT, XOR, NAND and NOR with both fixed and adaptive thresholding; traced wires and open gaps; symbol scaling; blank paper.

The 150-node combinational graph test completed 2,000 updates at approximately **0.05 ms/update on this host**. This is a host-side logic benchmark, not a smartphone camera or rendering benchmark.

Browser verification: Chromium, 1440×1000 desktop and 390×844 touch viewport, served at `/AppShelf/apps/logic-cam/demo/`. Passed input toggling, coach feedback, gate-type correction, placement and undo, mobile drawer controls, no horizontal overflow, camera acquisition error and recovery, service-worker control and offline reload. A real dedicated OpenCV worker loaded the bundled WASM and recognized a synthetic AND circuit with two inputs, one output and three wires. No uncaught JavaScript errors occurred. The catalogue screenshots were captured from this browser session.

Not verified: physical smartphone hardware, Safari/WebKit, real camera footage and arbitrary handwriting. Reproducible synthetic CV and browser checks do not establish real-world recognition accuracy.
