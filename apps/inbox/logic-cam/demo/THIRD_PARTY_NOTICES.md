# Third-party components

## OpenCV.js

- Source distribution URL: https://docs.opencv.org/4.x/opencv.js
- Downloaded: 2026-11-10. Bundled build reports OpenCV **4.13.0**.
- Local file: `vendor/opencv.js`; WebAssembly is embedded in the JavaScript distribution.
- SHA-256: `63366510248adf3a7eddf3e793dd825404efb7df3749f4d6f8557c7fa4ca8aa0`.
- OpenCV: https://opencv.org/ and https://github.com/opencv/opencv
- License: Apache License 2.0; the upstream license is included in `vendor/OPENCV-LICENSE.txt`.
- The moving `4.x` URL was used only when assembling this package. Runtime uses the bundled, fixed bytes and never downloads OpenCV remotely.

## Tailwind CSS

- Optional CDN runtime: https://cdn.tailwindcss.com/3.4.17
- Project and license: https://github.com/tailwindlabs/tailwindcss (MIT).
- Tailwind's Play CDN is intended for development. This deliverable includes all required styles locally in `style.css` and has no dependency on the CDN for layout or offline use. You can remove the CDN tag for a production deployment with no external scripts.

Icons and the print template were authored as local SVGs for this app. No external fonts, trackers, or icon CDN are required.
