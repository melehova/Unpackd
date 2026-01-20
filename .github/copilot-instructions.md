🛠️ Unpackd: Technical Manifest for GitHub Copilot
Project Name: Unpackd Objective: A cross-platform PWA for tracking moving inventory via URL-encoded NTAG215 stickers.

1. Tech Stack & Architecture
Framework: Vite + React (latest).

Styling: Tailwind CSS (Mobile-first, Dark Mode primary).

Backend: Supabase (PostgreSQL + Real-time).

Routing: Hash-based routing (to support GitHub Pages deployment) e.g., /#/box/BOX_ID.

PWA Plugin: vite-plugin-pwa for manifest and offline service worker.

2. Database Schema (Supabase SQL)
Table boxes: id (uuid, pk), nfc_id (text, unique), label (text), created_at (ts).

Table items: id (uuid, pk), box_id (fk -> boxes.id, cascade delete), name (text), quantity (int, default 1).

RLS Policy: Enable public read/write access for the duration of the migration (unauthenticated or single-token).

3. Design System & Style Conventions
Theme: Dark Mode by default. Background: #121212. Primary Accent: #FF6B00 (Safety Orange).

Visuals: Minimalist, geometric forms. Use "Glassmorphism" for item cards (semi-transparent backdrop-blur).

UX: High-contrast text and large tap targets (min 44px). Focus on one-handed mobile use.

Asset Path: The generated icon (closed box with 'u' and 'n' on sides) is stored as /public/icon.png. Use this for the PWA manifest.

4. Core Logic Requirements
Dynamic Box Creation: If a user visits a /box/:id route that does not exist in the DB, show a "New Box Found" state to initialize the box record.

Real-time Sync: Use supabase.channel() to listen for changes on the items table so multiple users see updates instantly.

Offline Support: Implement a basic "Sync Queue" using localStorage. If the network is down, store the "Add Item" request locally and push to Supabase once navigator.onLine is true.