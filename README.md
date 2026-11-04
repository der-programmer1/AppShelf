# AppShelf

AppShelf is a GitHub-Pages project library for apps, web apps, games, tools,
APKs and source archives. GitHub Actions uses Node.js to scan `apps/inbox/`,
render the catalogue and detail pages as static HTML, and deploy `dist/` to
GitHub Pages. Search and sorting operate on the rendered cards in the browser.

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

Set `techStack` to an array of technology labels, and optionally use `preview`
to select the catalogue image by filename. The first screenshot is the default.
Use `sourcePath` for a project directory in this repository or `repositoryUrl`
for a separate GitHub repository. The default source link is the app's inbox folder.

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

The build copies screenshots, writes APK SHA-256 digests, and creates SVG QR
codes for web launches and APK downloads. In CI, APK codes point directly to the
versioned GitHub Release asset. Set `PAGES_BASE_URL` when previewing on a phone
or deploying to a custom domain. Otherwise the base is derived from
`GITHUB_REPOSITORY` in Actions and defaults to `http://localhost:8080` locally.

## Activity timeline

The homepage shows the three latest published changes and links to the
repository's commit history. The old `updates/` address redirects to this
section.

Every successful publication rebuilds the history from Git's first-parent
history. A merged PR appears once, without intermediate work from unmerged
branches. Entries have stable identities, dates, app links and optional links to
the actual change on GitHub. Source-only work does not claim a new APK. Draft apps
are excluded. Re-imports are not repeatedly announced as a new app. A rebuild
alone does not create another announcement.

For a detailed, reader-friendly feature description, optionally edit
`site/updates.json` in the same PR. Its root is
`{ "schemaVersion": 1, "entries": [...] }`. Each entry requires `date` (a real
`YYYY-MM-DD` date), `category`, `title`, `summary`, `details`, `app`, `appSlug`,
`version`, `href` and `linkLabel`. Supported categories are `Neue App`,
`Verbesserung`, `Web-Version`, `Qualität` and `Wartung`. Use a local
`apps/<appSlug>/` detail-page link or `updates/` for an AppShelf-wide change.
Keep newest dates first and do not duplicate an existing change. Do not add
speculative announcements, failed builds, personal data or internal file paths.
An editorial story replaces the generic announcement for that app in the same
publication; later changes are still detected automatically. No manual entry is
required for the automatic history to update.
An entry prepared in an open PR becomes public only after merge and deployment.

Builds need a full Git checkout (`fetch-depth: 0` in Actions). For a shallow local
clone, run `git fetch --unshallow` first. Missing history fails clearly instead of
fabricating announcements. Git is the change record, not proof that every old
commit was deployed separately: a successful Pages deployment presents the
history accumulated in its published project state.

`npm test` validates the feed and tests invalid JSON, dates, order, duplicates,
links, escaped text, real temporary Git histories, same-version updates, merged
branches and generated output. Direct `npm run build` / Pages builds also reject
an invalid feed. The build writes `dist/updates.json` with the combined history,
stable entry IDs, an `automatic` flag and an
automatic `generatedAt` timestamp matching `catalog.json`; do not add that
timestamp to the source. Every push to `main` triggers the publication workflow.

## GitHub Pages setup

1. Put the contents of this ZIP into a GitHub repository.
2. In the repository settings, enable Pages with **GitHub Actions** as source.
3. Push to the `main` branch.
4. Add app packages under `apps/inbox/` and push again.

The workflow uses the repository's built-in `GITHUB_TOKEN`; no personal token
is embedded in the website. APKs and source archives are linked from GitHub
Releases so the Pages output stays small.
