# Unpackd

A cross-platform PWA for tracking moving inventory via URL-encoded NTAG215 stickers.

## Tech Stack
- Vite + React (TypeScript)
- Tailwind CSS (Dark mode default)
- Supabase (PostgreSQL + Real-time)
- Hash-based routing (`/#/box/BOX_ID`)
- PWA via `vite-plugin-pwa`

## Setup

1. Create a Supabase project and copy URL + anon key.
2. Configure environment:
   - Copy `.env.example` to `.env.local` and set values.

```bash
cp .env.example .env.local
# edit .env.local with your Supabase URL and anon key
```

4. Install dependencies and run dev:

```bash
npm install
npm run dev
```

Open the app and navigate to `/#/box/BOX_ID` to initialize or manage a box.

## Schema & Types
- The database schema is managed directly in your Supabase project.
- Generated types are in `supabase/Supabase API.ts` and are used across the app for type safety.

## Notes
- Real-time updates: listens to `items` changes for the specific `box_id`.
- Offline support: add-item requests queue in `localStorage` and sync when back online.
- Design: dark background `#121212`, accent `#FF6B00`, glassmorphism item cards.
- Icon: Place your box icon at `public/icon.png` (used by PWA manifest).

## Web NFC Tag Assignment
- Requirements: Supported on Android Chrome. Desktop browsers generally do not support Web NFC.
- Assigning a tag: Open a box page (e.g., `/#/box/BOX_ID`) and tap "Assign NFC Tag". When prompted, place an empty NTAG215 (or compatible) tag near the device to write a URL record that opens this box.
- Scanning behavior: After writing, scanning the tag will open the app to that box route. If the box does not yet exist, you'll see "New Box Found" and can initialize it.

## Deployment (GitHub Pages)

We deploy via GitHub Actions to the `gh-pages` branch using `peaceiris/actions-gh-pages`.

Important:
- Set Vite base path to `'/Unpackd/'` in `vite.config.ts` so assets load correctly from the repo subdirectory.
- The workflow needs `permissions: contents: write` to push to `gh-pages`.
- Vite builds to `./dist`; publish that folder.

Public URL:
- `https://<your-username>.github.io/Unpackd/`

Workflow file: `.github/workflows/deploy.yml`

```yaml
name: Deploy PWA to GitHub Pages
on:
   push:
      branches: [main]
permissions:
   contents: write
jobs:
   build-and-deploy:
      runs-on: ubuntu-latest
      steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
            with:
               node-version: 20
               cache: 'npm'
         - run: npm ci
         - run: npm run build
         - name: Deploy
            uses: peaceiris/actions-gh-pages@v3
            with:
               github_token: ${{ secrets.GITHUB_TOKEN }}
               publish_dir: ./dist
```

After the first successful run:
- In repository Settings → Pages, ensure Source is `gh-pages` / root.
- Visit `https://<your-username>.github.io/Unpackd/`.

Troubleshooting:
- 403 Forbidden on deploy: add the `permissions` block above.
- 404/blank assets on Pages: verify `base: '/Unpackd/'` in `vite.config.ts` and rebuild.
- Wrong landing route: manifest `start_url` should be `/Unpackd/#/` for hash routing.
