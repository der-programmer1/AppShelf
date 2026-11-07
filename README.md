# AppShelf

AppShelf is a project library for apps, web apps, games, tools, APKs and source
archives. Cloudflare Pages builds the site from `apps/inbox/` and serves the
static output in `dist/`. The catalogue and its downloads work without JavaScript.

It is a personal archive for independent projects, not an official app store.
Each project entry can contain its own description, screenshots, APK/AAB, source
downloads and an optional browser demo.

## Add an app

Create a folder under `apps/inbox/` and add an `app.json`, a README, at least
one screenshot for a published project, and the files visitors should download:

```text
apps/inbox/my-app/
├── app.json
├── README.md
├── app.apk
├── app.aab
├── source.zip
└── screenshots/
    ├── 01-home.png
    └── 02-detail.png
```

For a browser project, add a self-contained `demo/index.html` folder. The build
publishes it below the project's detail page.

The minimum manifest is:

```json
{
  "name": "My App",
  "slug": "my-app",
  "projectType": "app",
  "version": "1.0.0",
  "description": "A short description.",
  "category": "Everyday",
  "tags": ["Android", "offline"],
  "platform": ["Android"],
  "status": "published",
  "updatedAt": "2026-11-01"
}
```

`projectType` can be `app`, `web-app`, `game` or `tool`. Existing manifests
without this field remain compatible and are treated as `app` entries.

Set `cardDescription` to a short line for the catalogue card and `techStack`
to an array of technology labels in priority order. The card shows up to three
labels and shows the screenshot selected by `preview`, or the first screenshot.
Selecting the preview opens the project details.
Set `githubUrl` only for a public GitHub repository that should be linked.
Omit it for projects without public source code. If `githubPrivate` is
`true`, the build excludes the URL from the catalogue and detail pages even
when one is present in the manifest. Legacy source-path fields do not add links.

The catalogue and detail pages offer a **Dunkelmodus** toggle. They follow the
system appearance until a visitor chooses a mode, then remember it locally.
Without JavaScript the catalogue remains usable and follows the system setting.

Open a pull request with the project folder. The catalogue checks require a
readable APK and source ZIP for published Android entries. The repository also contains the instructions for an optional
Codex night automation under [`automation/app-product-agent-command.md`](automation/app-product-agent-command.md).
That command researches real everyday problems, builds at most one project per
run and prepares marketing drafts without posting them automatically.
Draft entries with `"status": "draft"` stay out of the public catalogue.

## Local preview

```bash
npm ci
npm test
npm run build
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080` to preview the generated catalogue locally.

The build copies screenshots, writes APK SHA-256 digests, and creates SVG QR
codes for web launches and APK downloads. Cloudflare builds serve downloads
from the same site, including for private GitHub repositories. The build uses
`CF_PAGES_URL` for QR codes, or `PAGES_BASE_URL` when explicitly set. Local
builds default to `http://localhost:8080`.

## Cloudflare Pages setup

- Connect the repository and use `main` as the production branch.
- Build command: `npm run build`. Output directory: `dist`.
- Set `PAGES_BASE_URL` to the stable production URL in the production
  environment if QR codes should point to a custom domain or a stable URL.
  Preview builds can use the injected `CF_PAGES_URL`.
- Each published file must fit within the
  [Cloudflare Pages asset limit](https://developers.cloudflare.com/pages/platform/limits/#file-size).
