# AppShelf

AppShelf is a GitHub-Pages project library for apps, web apps, games, tools,
APKs and source archives. GitHub Actions uses Node.js to scan `apps/inbox/`,
render the catalogue and detail pages as static HTML, and deploy `dist/` to
GitHub Pages. The catalogue renders and its download controls work without JavaScript.

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
publishes it below the project's detail page. For an already hosted web app,
set `webUrl` to its public HTTPS URL instead. Its launch button and QR code
open that existing site; the build does not copy or redeploy the external app.
Use either `webUrl` or `demoDir`, not both.

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
labels. Catalogue cards use the selected screenshot preview, as in the earlier
AppShelf design, and link the image to the project's details.
Set `githubUrl` only for a public GitHub repository that should be linked.
Omit it for projects without public source code. If `githubPrivate` is
`true`, the build excludes the URL from the catalogue and detail pages even
when one is present in the manifest. Legacy source-path fields do not add links.

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

## GitHub Pages setup

1. Put the contents of this ZIP into a GitHub repository.
2. In the repository settings, enable Pages with **GitHub Actions** as source.
3. Push to the `main` branch.
4. Add app packages under `apps/inbox/` and push again.

The repository's additional Cloudflare Workers build can serve the same static
`dist/` through `wrangler.jsonc`; it needs no application server. Set
`PAGES_BASE_URL` to its public URL if QR codes should point to that host.

The workflow uses the repository's built-in `GITHUB_TOKEN`; no personal token
is embedded in the website. APKs and source archives are linked from GitHub
Releases so the Pages output stays small.
