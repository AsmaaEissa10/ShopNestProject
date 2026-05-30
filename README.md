# ShopNest Registration Demo

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` from `.env.example` and add your Supabase URL and anon key.
3. Start the app:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173`

## Supabase setup

1. Create a Supabase project.
2. In `Project Settings > API`, copy `anon` key and URL.
3. In `Authentication > Settings`, enable email confirmations and add OAuth providers if needed.
4. Add `http://localhost:5173/register/confirm` as an auth redirect URL in Supabase.
5. Use `supabase/schema.sql` to create the app table schema.

## Required environment variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Vercel deployment

1. Add this repository to Vercel.
2. Set build command: `npm run build`.
3. Set output directory: `dist`.
4. Add the environment variables above in Vercel project settings.
5. Deploy and verify `/register/confirm` loads correctly.

> The `vercel.json` file includes an SPA fallback route for Vite so client-side routes work.
