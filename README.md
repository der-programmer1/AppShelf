# AppShelf

AppShelf is a GitHub-Pages project library for apps, web apps, games, tools,
APKs and source archives. It is intentionally buildless: GitHub Actions uses
Node.js to scan `apps/inbox/`, create a searchable catalogue and deploy the
generated `dist/` folder to GitHub Pages.

It is a personal archive for independent projects, not an official app store.
Each project entry can contain its own description, screenshots, APK/AAB, source
downloads and an optional browser demo.

## Add an app

Create a folder under `apps/inbox/` and add an `app.json`, a README, optional
screenshots and the files visitors should download:

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
```

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

Push the folder to GitHub. The workflow validates every project and, for
published Android entries, checks that a readable APK and source ZIP are
present. It then creates or
updates a release for its APK/AAB/source assets, builds the catalogue and
deploys Pages. The repository also contains the instructions for an optional
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

The build copies each app preview into the Pages artifact and creates an SVG
QR code for the app detail page. In GitHub Actions, the QR target is derived
automatically from `GITHUB_REPOSITORY`.

## Fortschritt & Neuigkeiten

The homepage shows the latest completed change. The full, newest-first history is
available at `updates/`. Both views are rendered during the build and can be read
without JavaScript. This is a public changelog, not an email newsletter: it has no
signup, tracking or data collection.

Edit `site/updates.json` in the same PR as a visitor-visible change. Its root is
`{ "schemaVersion": 1, "entries": [...] }`. Each entry requires `date` (a real
`YYYY-MM-DD` date), `category`, `title`, `summary`, `details`, `app`, `appSlug`,
`version`, `href` and `linkLabel`. Supported categories are `Neue App`,
`Verbesserung`, `Web-Version`, `Qualität` and `Wartung`. Use a local
`apps/<appSlug>/` detail-page link or `updates/` for an AppShelf-wide change.
Keep newest dates first and do not duplicate an existing change. Do not add
speculative announcements, failed builds, personal data or internal file paths.
An entry prepared in an open PR becomes public only after merge and deployment.

`npm test` validates the feed and tests invalid JSON, dates, order, duplicates,
links, escaped text and generated output. Direct `npm run build` / Pages builds
also reject an invalid feed. The build writes `dist/updates.json` with an
automatic `generatedAt` timestamp matching `catalog.json`; do not add that
timestamp to the source. No Android app version changes when only the changelog
is updated. To roll back the feature, revert its complete PR rather than removing
only the JSON file required by the build.

## GitHub Pages setup

1. Put the contents of this ZIP into a GitHub repository.
2. In the repository settings, enable Pages with **GitHub Actions** as source.
3. Push to the `main` branch.
4. Add app packages under `apps/inbox/` and push again.

The workflow uses the repository's built-in `GITHUB_TOKEN`; no personal token
is embedded in the website. APKs and source archives are linked from GitHub
Releases so the Pages output stays small.
