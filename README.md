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
2. Create the tables and policies:
   - Run `supabase/schema.sql` in the Supabase SQL editor.
3. Configure environment:
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

## Notes
- Real-time updates: listens to `items` changes for the specific `box_id`.
- Offline support: add-item requests queue in `localStorage` and sync when back online.
- Design: dark background `#121212`, accent `#FF6B00`, glassmorphism item cards.
- Icon: Place your box icon at `public/icon.png` (used by PWA manifest).
