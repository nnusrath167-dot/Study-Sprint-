# StudySprint

[Open the live app](https://studysprint-nnusrath167.onrender.com)

StudySprint is a study planner with focus sessions, a diary, routine and sleep tracking, progress charts, an offline study helper, and a private file vault. Supabase Auth, Postgres, and Storage are configured for per-user accounts and cloud sync. Render serves the web app and its public Supabase configuration; only the Supabase publishable key is exposed to the browser. The database row-level security policies protect private user records.

## Install on desktop

StudySprint is a progressive web app (PWA). Open the HTTPS app in a supported browser such as Chrome or Edge. When the **Install app** button appears in StudySprint, select it and confirm. You can also use the browser menu's install option. The installed app opens in its own window.

The app shell can open offline after an initial online visit. Supabase sign-in, cloud sync, and private cloud files require an internet connection.

## Google Play status

The PWA is not yet a signed Android App Bundle and has not been submitted to Google Play. A Play release still needs an Android Trusted Web Activity package, a signing key and Digital Asset Links fingerprint, a completed Play Console listing and policy declarations, and Google's review.

Before release, choose a permanent Android application ID, publish a complete privacy policy and support contact, provide an account/data deletion path, finish the Play Console Data safety and content-rating forms, and prepare the store listing assets. Google currently requires personal developer accounts created after November 13, 2023 to complete a closed test with at least 12 opted-in testers for 14 continuous days before applying for production access.

## Project files

```text
client/
  index.html           StudySprint interface
  style.css            Responsive styles
  script.js            Timers, tasks, routines, reminders, charts
  cloud.js             Supabase Auth, state sync, private file storage
  pwa.js               Install prompt and offline support registration
  public/
    manifest.webmanifest
    service-worker.js  Offline app shell; API responses are never cached
    icons/studysprint.svg
server/index.js        Express API and production static server
supabase/schema.sql    Tables, private bucket, row-level security policies
render.yaml            Render deployment blueprint
```

## Run locally

1. Install Node.js LTS and run `npm install`.
2. Copy `.env.example` to `.env`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` using the Supabase Project URL and public anon/publishable key. Never use a service-role key in the browser or commit `.env`.
3. Run `supabase/schema.sql` in the Supabase SQL Editor.
4. Run `npm run dev` and open the local Vite URL (normally `http://localhost:5173`).
5. Add the local and production app URLs to Supabase Authentication's allowed redirect URLs if email confirmation is enabled.

## Deploy

The project includes a Render Blueprint in `render.yaml`. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `NODE_ENV=production` in the hosting service. Apply the database schema before using accounts. Render's free service may spin down while idle, making the first request slower. GitHub Pages cannot host this Express backend.

## Data and limitations

- Supabase Auth manages account passwords. StudySprint does not store passwords.
- Each account's app state is stored in its own `study_state` row. Row-level security restricts access to the signed-in user's row.
- File metadata is stored in `study_files`; uploaded bytes are in a private Supabase Storage bucket with per-user policies.
- Browser-only timers and reminders need the app to remain open; the web app does not provide background push alarms.
- The study helper is offline content, not a live AI feature. The profile page is a personal account view, not an administrator console.
- Verify account signup, email confirmation, cross-device sync, and file operations using test accounts before release. Do not publish until the privacy policy and account-deletion flow are complete.
