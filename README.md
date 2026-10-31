# StudySprint

StudySprint is a study-planning dashboard with a focus timer, diary, daily timetable, progress tracking, sleep log, and file vault. It uses HTML, CSS, JavaScript, an Express server, and Supabase for authentication, database sync, and private cloud file storage.

## Repository contents

The project source is uploaded as [`ALL_SOURCE_CODE.txt`](./ALL_SOURCE_CODE.txt). It is a combined text archive, not a set of runnable files in separate folders. Each section is labeled with a `FILE: path` heading. To run the app, recreate the files locally using those paths.

The full project includes a `client/` frontend, a `server/` Express backend, and `supabase/schema.sql` for database and storage policies.

## Run locally

1. Install Node.js LTS.
2. Recreate the project files from `ALL_SOURCE_CODE.txt`, preserving each `FILE: path`.
3. Copy `.env.example` to `.env` and set your Supabase project URL and **anon/publishable key**.
4. In the Supabase Dashboard SQL Editor, run `supabase/schema.sql`.
5. From the project folder run:

   ```powershell
   npm install
   npm run dev
   ```

6. Open the local URL printed by Vite (usually `http://localhost:5173`). Add that URL to Supabase Authentication URL settings if you enable email confirmation.

## Supabase and security

- Supabase Auth manages email/password accounts and sessions.
- `study_state` stores each signed-in user's app data in Postgres; row-level security restricts access to that user's row.
- `study_files` stores file metadata, while file contents go to a private Supabase Storage bucket with per-user policies.
- Use only the project URL and public anon/publishable key in browser configuration. **Never publish a `service_role` key or commit your `.env` file.**

This repository currently stores source as one text archive. Recreate the project files before running or deploying it. For production, build with `npm run build` and host the Express server on a Node.js host with `NODE_ENV=production` and the Supabase settings configured as environment variables. GitHub Pages cannot run the Express backend.
