# AppShelf

AppShelf is a GitHub-Pages app library for many small apps, APKs and source
archives. It is intentionally buildless: GitHub Actions uses Node.js to scan
`apps/inbox/`, create a searchable catalogue and deploy the generated `dist/`
folder to GitHub Pages.

It is a personal archive for independent projects, not an official app store.
Each app entry can contain its own description, screenshots, APK/AAB and source
downloads.

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

The minimum manifest is:

```json
{
  "name": "My App",
  "slug": "my-app",
  "version": "1.0.0",
  "description": "A short description.",
  "category": "Everyday",
  "tags": ["Android", "offline"],
  "platform": ["Android"],
  "status": "published",
  "updatedAt": "2026-11-01"
}
```

Push the folder to GitHub. The workflow validates it, creates or updates a
release for its APK/AAB/source assets, builds the catalogue and deploys Pages.
Draft entries with `"status": "draft"` stay out of the public catalogue.

## Local preview

```bash
npm test
npm run build
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. The included `example-workbench` entry is only a
content example and intentionally has no fake APK.

## GitHub Pages setup

1. Put the contents of this ZIP into a GitHub repository.
2. In the repository settings, enable Pages with **GitHub Actions** as source.
3. Push to the `main` branch.
4. Add app packages under `apps/inbox/` and push again.

The workflow uses the repository's built-in `GITHUB_TOKEN`; no personal token
is embedded in the website. APKs and source archives are linked from GitHub
Releases so the Pages output stays small.
