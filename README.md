# Supabase chat

A minimal **shared lobby** chat: React + TypeScript + Vite on the front end, [Supabase](https://supabase.com) for auth, Postgres, Row Level Security, and Realtime. Everyone who signs into the **same Supabase project** sees the same **`general`** room—there is no direct messaging between two picked users.

## Features

- Email/password sign-up and sign-in
- Messages stored in Postgres with RLS (users only read/write allowed rows)
- Profiles with display names, created automatically on sign-up
- Live updates via Supabase Realtime (`postgres_changes` on `messages`), plus a short polling fallback so new messages appear even if Realtime is misconfigured

## Prerequisites

- [Node.js](https://nodejs.org/) (current LTS is fine)
- A [Supabase](https://supabase.com) project

## 1. Create and configure Supabase

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a project and wait until it is ready.

2. **API keys** — **Project Settings → API**:
   - Copy **Project URL** → `VITE_SUPABASE_URL`
   - Copy the **`anon` `public`** key → `VITE_SUPABASE_ANON_KEY` (use this in the browser only; never expose the `service_role` key in frontend code).

3. **Database schema** — **SQL → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), then run it.  
   This creates `profiles` and `messages`, RLS policies, a trigger to create a profile on sign-up, and adds `messages` to the `supabase_realtime` publication for Realtime.

   If `alter publication supabase_realtime add table public.messages` errors because the table is already published, you can skip that line.

4. **Auth URLs (local dev)** — **Authentication → URL configuration**:
   - Set **Site URL** to your dev origin (e.g. `http://localhost:5173`).
   - Add the same URL under **Redirect URLs** if you use email confirmation links.

5. **Realtime** — Under **Database → Publications** (or **Replication**, depending on the UI), ensure **`messages`** is included in **`supabase_realtime`**. The SQL in step 3 normally does this; toggle it on if needed.

## 2. Run the app locally

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Start the dev server:

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Restart the dev server after changing `.env`.

### Testing with two users

Use two browsers or one normal window plus a private/incognito window, create two accounts, and sign in to both. You should see the same lobby and each other’s messages.

## Scripts

| Command        | Description                    |
|----------------|--------------------------------|
| `npm run dev`  | Start Vite dev server with HMR |
| `npm run build`| Typecheck and production build   |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint                     |

## Project layout

| Path                 | Role |
|----------------------|------|
| `src/App.tsx`        | Auth UI, lobby, messages, Realtime + polling |
| `src/lib/supabase.ts`| Supabase client (`VITE_*` env vars) |
| `supabase/schema.sql`| Tables, RLS, triggers, Realtime publication |
| `.github/workflows/deploy-github-pages.yml` | CI: build + deploy to GitHub Pages |

## Deploy with GitHub (Pages)

This repo includes a workflow that builds on every push to `main` and deploys the `dist` folder to **GitHub Pages** at:

`https://<your-username>.github.io/<repository-name>/`

### 1. Push the project to GitHub

From your machine (install [Git](https://git-scm.com/) if needed):

```bash
cd /path/to/supabase-chat
git init
git add .
git status   # confirm .env is NOT listed (.gitignore excludes it)
git commit -m "Initial commit"
```

On [GitHub](https://github.com/new), create a **new repository** (empty, no README). Then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Use your real username and repo name in place of `YOUR_USERNAME` / `YOUR_REPO`.

### 2. Add Supabase variables as repository secrets

GitHub cannot read your local `.env`. Add the same values as **encrypted secrets**:

1. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. Create secrets whose **names match exactly** (Vite only reads these at build time):
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — the **anon public** key (same as in `.env`)

Do not use names like `SUPABASE_URL` without the `VITE_` prefix—the build will not see them, and the live site will show a configuration error or throw `supabaseUrl is required`.

Add these as **repository** secrets (not only under an Environment), unless you also wire that Environment into the workflow—otherwise the build step receives empty values.

The workflow injects them at build time (Vite bakes `VITE_*` into the static JS). After adding or changing secrets, **re-run the deploy workflow** (or push a commit) so the site rebuilds. The workflow includes a step that **fails the build** if either secret is missing, so you get a clear error in GitHub Actions instead of a broken site.

### 3. Enable GitHub Pages from Actions (do this before the first deploy)

The deploy step will return **404 / Failed to create deployment** until Pages is configured in the repo.

1. Repo → **Settings** → **Pages**
2. Under **Build and deployment** → **Source**, choose **GitHub Actions** (not “Deploy from a branch”).
3. If you only see branch options, pick **GitHub Actions** from the source dropdown and save.

Then push to `main` or **Actions** → **Deploy to GitHub Pages** → **Run workflow**. When the workflow is green, open the site URL from the **deploy** job or **Settings → Pages**.

### 4. Allow your production URL in Supabase Auth

In Supabase: **Authentication → URL configuration**:

- Add your GitHub Pages URL to **Redirect URLs**, e.g. `https://YOUR_USERNAME.github.io/YOUR_REPO/`
- Optionally set **Site URL** to that same URL if this app is only used there

Without this, sign-in redirects or email links can fail in production.

### Notes

- **Repository name** — The Vite `base` path is set automatically from the repo name so asset URLs work under `…/github.io/repo-name/`. If you rename the repo, push again so the workflow runs with the new name.
- **`username.github.io` special case** — If the repo is named `YOUR_USERNAME.github.io`, the site is served at the domain root (`https://YOUR_USERNAME.github.io/`). Then set `base` to `/` only: either remove `VITE_BASE_PATH` from the workflow or change [`vite.config.ts`](vite.config.ts) for that case.
- **Other hosts (Vercel, Netlify, Cloudflare Pages)** — Connect the same GitHub repo; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in that host’s environment UI. Those URLs usually use `/` as the path—do **not** set `VITE_BASE_PATH` (leave default `/`).

## Troubleshooting

- **`Uncaught Error: supabaseUrl is required`** — The production build was compiled **without** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Add both as **Actions** repository secrets (exact names above), then redeploy. Locally, use a `.env` file; never commit it.

- **`deploy-pages` / `Failed to create deployment` / `HttpError: Not Found` (404)** — GitHub Pages is not set to deploy from **GitHub Actions** yet, or the setting was never saved. Open **Settings → Pages**, set **Source** to **GitHub Actions**, save, then **re-run the failed workflow** (or push an empty commit). Do not use “Deploy from a branch” if you use this workflow.

- **`Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY`** — Copy `.env.example` to `.env` and fill in values from **Project Settings → API**. Restart `npm run dev`.

- **Others’ messages only after refresh** — Confirm `messages` is in the `supabase_realtime` publication and that `schema.sql` ran without errors. Check the browser console for Realtime errors. The app polls every few seconds as a fallback.

- **“Chat with one specific person”** — This app is a single shared room, not private DMs. Building DMs would need extra tables (e.g. conversations, participants) and UI.
