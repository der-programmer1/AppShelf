# Validation — 2026-11-10

Version 1.1.0: `npm test`: **51 passed, 0 failed** (Node.js, bundled OpenCV 4.13.0 WebAssembly).

`npm run check`: JavaScript syntax, ES-module imports, 112 unique HTML IDs, UI references across the modules, local files, SVG symbols, JSON files, and 21 offline-cache assets passed validation.

Coverage includes all six truth tables; controlling values with unknown pins; compiled DAG propagation; graph isolation; floating pins; multiple drivers; feedback SCCs; invalid imports; coach correctness and duplicate-answer scoring; camera permissions, stream release and cancelled acquisition; video/AR coordinate mapping; actual OpenCV recognition of AND, OR, NOT, XOR, NAND and NOR with both fixed and adaptive thresholding; traced wires and open gaps; symbol scaling; blank paper.

Electrical coverage adds open/closed switches, series and parallel lamps, a dangling branch, a bypassed lamp, short circuits, absent/multiple sources, endpoint validation, actual blue-ink segmentation on gray graph paper, battery/lamp/open-switch recognition and three traced wire nets, a plain closed-wire circuit, manual component precedence and a quarter-turn image. The supplied drawing's geometry was reconstructed as a test fixture; the original attachment was not accessible as an image file in the execution environment. No recognition-accuracy claim is based on the original photograph.

The 150-node combinational graph test completed 2,000 updates at approximately **0.05 ms/update on this host**. This is a host-side logic benchmark, not a smartphone camera or rendering benchmark.

Browser verification: Chromium, 1440×1000 desktop and 390×844 touch viewport, served at `/AppShelf/apps/logic-cam/demo/`. Passed input toggling, coach feedback, gate-type correction, placement and undo, mobile drawer controls, no horizontal overflow, camera acquisition error and recovery, service-worker control and offline reload. A real dedicated OpenCV worker loaded the bundled WASM and recognized a synthetic AND circuit with two inputs, one output and three wires. No uncaught JavaScript errors occurred. The catalogue screenshots were captured from this browser session.

The version 1.1 browser suite also passed local photo import and automatic electrical recognition, on-screen and image-tapped switch simulation, hiding an automatic component and replacing it with manually marked terminals, native fullscreen and exit, a forced no-Fullscreen-API viewport fallback, portrait/quarter-turn photo projection, pointer alignment after landscape resize, a simulated live camera stream that survives fullscreen and releases on exit to sandbox, and offline reload with the updated service worker. Run `tests/browser.mjs` with Playwright and an installed Chromium; `LOGIC_CAM_ROOT` selects the generated demo for deployment checks. Simulated video verifies lifecycle only, not real-world camera recognition.

Not verified: physical smartphone hardware, Safari/WebKit, real camera footage and arbitrary handwriting. Reproducible synthetic CV and browser checks do not establish real-world recognition accuracy.
