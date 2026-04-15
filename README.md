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

## Troubleshooting

- **`Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY`** — Copy `.env.example` to `.env` and fill in values from **Project Settings → API**. Restart `npm run dev`.

- **Others’ messages only after refresh** — Confirm `messages` is in the `supabase_realtime` publication and that `schema.sql` ran without errors. Check the browser console for Realtime errors. The app polls every few seconds as a fallback.

- **“Chat with one specific person”** — This app is a single shared room, not private DMs. Building DMs would need extra tables (e.g. conversations, participants) and UI.
