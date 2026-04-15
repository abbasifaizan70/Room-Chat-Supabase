# Supabase chat

Private **direct messages** and **group chats** with a WhatsApp-style sidebar: React + TypeScript + Vite, [Supabase](https://supabase.com) auth, Postgres, Row Level Security, and Realtime. Search by **username**, start a 1:1 chat, or **New group** to name a room and add people.

## Features

- Email/password sign-up and sign-in; optional **Continue with Google** (enable the Google provider in Supabase)
- Sidebar inbox (last message preview), main pane with aligned bubbles (yours vs theirs)
- Search people by display name (`profiles.username`)
- **Groups**: name a chat, pick members, message everyone; **Add people** from the group header
- Direct conversations (`direct_conversations` / `direct_messages`) and groups (`group_chats` / `group_messages`) with RLS
- RPCs: `get_or_create_dm`, `list_my_dms`, `create_group_chat`, `add_group_members`, `list_my_group_chats`
- Realtime + polling on the active conversation

## Prerequisites

- [Node.js](https://nodejs.org/) (current LTS is fine)
- A [Supabase](https://supabase.com) project

## 1. Create and configure Supabase

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a project and wait until it is ready.

2. **API keys** — **Project Settings → API**:
   - Copy **Project URL** → `VITE_SUPABASE_URL`
   - Copy the **`anon` `public`** key → `VITE_SUPABASE_ANON_KEY` (use this in the browser only; never expose the `service_role` key in frontend code).

3. **Database schema** — **SQL → New query**, paste and run [`supabase/schema.sql`](supabase/schema.sql) (creates `profiles`, signup trigger, and the legacy `messages` table if you still need it).

4. **Direct messages** — Run [`supabase/direct_messages.sql`](supabase/direct_messages.sql) in the SQL Editor. This adds `direct_conversations`, `direct_messages`, RLS, `get_or_create_dm`, `list_my_dms`, and Realtime on `direct_messages`. If `alter publication … direct_messages` errors because the table is already in the publication, skip that line.

5. **Group chats** — Run [`supabase/group_chats.sql`](supabase/group_chats.sql). This adds `group_chats`, `group_chat_members`, `group_messages`, the `is_group_member` helper (avoids RLS recursion), RPCs `create_group_chat` and `add_group_members`, `list_my_group_chats`, and Realtime on `group_messages`. Skip the last line if the table is already published.

   If you previously ran an older `group_chats.sql` and see **infinite recursion detected in policy for relation "group_chat_members"**, run [`supabase/group_chats_fix_rls.sql`](supabase/group_chats_fix_rls.sql) once in the SQL Editor.

   If the **Members** modal shows **0 people** or Add people never shows **In group** for existing members, run [`supabase/list_group_members.sql`](supabase/list_group_members.sql) (adds the `list_group_members` RPC the app uses to load members reliably).

6. **Auth URLs** — **Authentication → URL configuration**:
   - Set **Site URL** to your main app URL (e.g. `http://localhost:5173` for local dev).
   - Under **Redirect URLs**, list every URL OAuth and email links may return to (e.g. `http://localhost:5173/` and your production URL). These must match what the app sends as `redirectTo` (see optional `VITE_AUTH_REDIRECT_URL` below).

7. **Google sign-in (optional)** — **Authentication → Providers → Google**:
   - Turn **Google** on. Supabase shows **Authorized redirect URI** for the callback (like `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`) — copy it.
   - In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials** → **Create credentials** → **OAuth client ID** → Application type **Web application**.
   - Under **Authorized redirect URIs**, add the Supabase callback URL exactly (the one from the dashboard).
   - Paste **Client ID** and **Client Secret** into Supabase’s Google provider settings and save.
   - Your app’s own URL (`http://localhost:5173/` and any deployed URL) must stay listed under **Redirect URLs** in Supabase (step 6) so users return to the app after Google.

8. **Realtime** — Under **Database → Publications**, ensure **`direct_messages`** and **`group_messages`** are in **`supabase_realtime`** (the SQL files usually add them).

## 2. Run the app locally

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
# Optional: fixed OAuth return URL (must match a Redirect URL in Supabase exactly)
# VITE_AUTH_REDIRECT_URL=http://localhost:5173/
```

If you omit `VITE_AUTH_REDIRECT_URL`, the app uses the current browser origin plus Vite’s `base` path (from [`vite.config.ts`](vite.config.ts), or `VITE_BASE_PATH` when building for GitHub Pages). Set `VITE_AUTH_REDIRECT_URL` when you want an explicit URL (for example a stable value in CI).

Start the dev server:

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Restart the dev server after changing `.env`.

### Testing with two users

Create two accounts (different emails). Each user should set a distinct **display name** at signup. Sign in as user A in one browser and user B in another; search for B’s username from A’s sidebar and start a chat—only those two users can read that thread.

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
| `src/App.tsx`        | Auth shell |
| `src/DmChatApp.tsx`  | Sidebar inbox, search, chat pane, DM Realtime |
| `src/lib/supabase.ts`| Supabase client (`VITE_*` env vars) |
| `supabase/schema.sql`| Profiles, legacy `messages`, signup trigger |
| `supabase/direct_messages.sql` | 1:1 DMs, RPCs, RLS, Realtime |
| `supabase/group_chats.sql` | Group chats, members, messages, RPCs, Realtime |
| `supabase/list_group_members.sql` | Optional: add `list_group_members` RPC if members list is empty |
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
   - Optional: `VITE_AUTH_REDIRECT_URL` — e.g. `https://YOUR_USERNAME.github.io/YOUR_REPO/` (same string as in Supabase **Redirect URLs**). The deploy workflow passes it into the build so OAuth returns to the Pages URL instead of inferring at runtime.

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

- **DMs not updating live** — Confirm `direct_messages` is in the `supabase_realtime` publication and that [`supabase/direct_messages.sql`](supabase/direct_messages.sql) ran. The app also polls the open thread periodically.

