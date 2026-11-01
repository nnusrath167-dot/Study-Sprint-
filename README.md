## Live app

[Open StudySprint](https://studysprint-nnusrath167.onrender.com)

**Production status:** The Render app is connected to the existing **Study-Sprint** Supabase project. Supabase Auth, the row-level-security-protected Postgres tables, and private cloud storage are configured. Create an account on the app's Profile page to sync study data; Supabase may require email confirmation before the first sign-in. Render uses the public publishable key only—never a service-role key.

# StudySprint — Supabase full-stack app

StudySprint keeps the HTML/CSS/JavaScript study dashboard and adds Supabase email/password authentication, per-user cloud sync, and private cloud file uploads. Express serves the public Supabase configuration; Supabase Auth, Postgres, Storage, and row-level security provide the backend services.

## Folder structure

```text
StudySprint-Supabase/
├── client/
│   ├── index.html       # StudySprint UI and account form
│   ├── style.css        # Responsive theme and components
│   ├── script.js        # Timer, diary, timetable, reminders, charts
│   └── cloud.js         # Supabase Auth, account sync, private file vault
├── server/
│   └── index.js         # Express config/health endpoints; production static server
├── supabase/
│   └── schema.sql       # Tables, private bucket, and RLS policies
├── .env.example         # Template only; copy to .env
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

## Setup in VS Code

1. Install Node.js LTS and VS Code.
2. Create a free Supabase project. In **Project Settings → API**, copy the Project URL and anon/publishable key. Never use a service-role key in browser code.
3. Copy `.env.example` to `.env` and add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. In Supabase **SQL Editor**, run `supabase/schema.sql`. It creates the tables, private file bucket, and per-user security policies.
5. Run `npm install`, then `npm run dev`. Open the local URL Vite prints (normally `http://localhost:5173`).
6. Add the local URL to Supabase **Authentication → URL Configuration** if you use email confirmation locally.

## Deploy on Render

The included `render.yaml` is a Blueprint for the Express app. The existing app is hosted on Render's free web-service plan at the live link above.

For a new deployment, connect the repository through Render, configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Supabase's API settings, set `NODE_ENV=production`, and confirm the schema has been applied. Add the deployed URL to Supabase Authentication's allowed redirect URLs. The current Render service may require a manual deploy after GitHub changes. Free services can spin down while idle, making the first request slower. GitHub Pages cannot run this Express backend.

## Upload to GitHub

1. Check `git status --short` before committing.
2. Commit and push source changes to the repository's `main` branch.
3. Keep `.env`, other `.env.*` files, `node_modules/`, and generated `dist/` output out of Git. `.env.example` is safe to publish.
4. Never add a Supabase service-role key to frontend code, `.env`, GitHub, or a public deployment.

## How the backend works

- Supabase Auth creates and verifies accounts. Passwords are handled by Supabase Auth; StudySprint does not store them.
- `study_state` stores each user's app state in a JSONB row. Cloud sync runs after changes and periodically.
- `study_files` stores file metadata; bytes are in a **private** Supabase Storage bucket. Signed download links expire quickly.
- Postgres row-level security and Storage policies use `auth.uid()` so users cannot read another account's records or files.
- The browser receives only the public anon/publishable key. RLS is the security boundary; do not use a service-role key in the app.

## Scope and limitations

This is a learning starter, not a production-reviewed authentication system. Email confirmation may be required; configure SMTP for dependable confirmation emails. Timetable reminders and alarms require the browser to remain open. The study helper is prepared/offline content, not live AI. The Profile page is a user's personal account view, not a privileged admin role.

## Files to study

- `client/index.html`: feature page structure and form controls.
- `client/style.css`: visual theme and responsive layout.
- `client/script.js`: study app interactions.
- `client/cloud.js`: Supabase account, data sync, and file storage.
- `server/index.js`: Express backend.
- `supabase/schema.sql`: database tables and access policies.
## Live app

[Open StudySprint](https://studysprint-nnusrath167.onrender.com)

# StudySprint — Supabase full-stack starter

StudySprint keeps the original HTML/CSS/JavaScript dashboard and adds real Supabase email/password authentication, per-user cloud sync, and private cloud file uploads. Express serves the Supabase public configuration to the frontend; Supabase Auth, Postgres, Storage, and row-level security provide the backend services.

## Folder structure

```text
StudySprint-Supabase/
├── client/
│   ├── index.html       # StudySprint UI and account form
│   ├── style.css        # Responsive theme and components
│   ├── script.js        # Timer, diary, timetable, reminders, charts
│   └── cloud.js         # Supabase Auth, account sync, private file vault
├── server/
│   └── index.js         # Express config/health endpoints; production static server
├── supabase/
│   └── schema.sql       # Tables, private bucket, and RLS policies
├── .env.example         # Template only; copy to .env
├── .gitignore           # Excludes .env and generated dependencies
├── package.json
├── package-lock.json   # Generated by npm install; pins dependency versions
├── vite.config.js
└── README.md
```

## Setup in VS Code

1. Install Node.js LTS and VS Code.
2. Create a free Supabase project at supabase.com. In **Project Settings → API**, copy the Project URL and anon/publishable key. Never use or share a `service_role` key in frontend code.
3. Open this project folder in VS Code. Copy `.env.example` to a new file named `.env`, then replace the placeholders with your Supabase Project URL and anon/publishable key.
4. In Supabase **SQL Editor**, run the complete `supabase/schema.sql` file. It creates the tables, private file bucket, and per-user security policies.
5. In the VS Code terminal, run `npm install`, then `npm run dev`. Open the local URL Vite prints (normally `http://localhost:5173`).
6. In Supabase **Authentication → URL Configuration**, add the local app URL (for example, `http://localhost:5173`) to the allowed redirect URLs if you later enable email confirmation.

## Deploy on Render

The included `render.yaml` is a Render Blueprint for the Express app.

1. Make sure the project files (including `render.yaml`) are in a GitHub repository.
2. In Render, choose **New → Blueprint**, connect the repository, and create the service.
3. In the new service's environment settings, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` from your Supabase project's API settings. Use only the anon/publishable key, never the `service_role` key.
4. Confirm the database schema in `supabase/schema.sql` has been run in Supabase.
5. Wait for Render's build and deploy to finish. Render will show the public `*.onrender.com` app URL. Add that URL to Supabase Authentication's allowed redirect URLs if email confirmation is enabled.

Render's free web service may spin down while idle, so the first request after inactivity can take longer. GitHub Pages cannot run this Express backend.

## Upload to GitHub

1. From this project folder in PowerShell, initialize the repository and add its GitHub remote:

   ```powershell
   git init
   git add .
   git status --short
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git add .
   git status --short
   git commit -m "Add StudySprint app source"
   git push -u origin main
   ```

3. Check `git status --short` before committing. `.env`, other `.env.*` files, `node_modules/`, and generated `dist/` output are ignored; `.env.example` is safe to publish.
4. For a live deployment, configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables in the Node hosting provider, set `NODE_ENV=production`, and deploy the repository. Never add a Supabase `service_role` key to the frontend, `.env`, GitHub, or a public deployment.

## How the backend works

- Supabase Auth creates/verifies users and manages sessions. Passwords are handled by Supabase Auth; StudySprint does not store them.
- `study_state` stores the app's per-user settings, tasks, timer history, timetable, goals, and other localStorage-backed state in a JSONB row. Cloud sync runs after changes and periodically.
- `study_files` stores metadata; file bytes are stored in a **private** Supabase Storage bucket. Signed download links expire quickly.
- Postgres row-level security and Storage policies check `auth.uid()` so an authenticated user cannot read another account's records or files.
- The browser only receives the public anon/publishable key. This is expected; the SQL policies are the security boundary. Do not add service-role keys to `.env` used by this app or commit any `.env` file.

## Scope and limitations

This is a learning starter, not a production-reviewed authentication system. Supabase email confirmation may need to be completed before first sign-in. Configure SMTP for dependable confirmation emails. The timetable and alarm still depend on the browser remaining open; cloud sync does not turn them into reliable background push notifications. The included study helper is prepared/offline content, not a live AI. The Profile page is the signed-in user's account screen, not a privileged admin role; real admin permissions require an explicit server-side role policy.

## Files to study

- `client/index.html`: feature page structure and form controls.
- `client/style.css`: visual design, theme, and responsive layout.
- `client/script.js`: existing beginner-level app interactions.
- `client/cloud.js`: Supabase account, data synchronization, and file storage calls.
- `server/index.js`: Express backend.
- `supabase/schema.sql`: database and access-control policies.
