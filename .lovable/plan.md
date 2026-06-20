## Goal

Prepare The Lily Pad for Vercel auto-deployment from GitHub, with Vercel Web Analytics and Speed Insights wired into the React app.

## What you'll do in Vercel (manual, one-time)

1. Push the project to GitHub via Lovable's GitHub integration (Plus menu → GitHub → Connect).
2. In Vercel: **Add New → Project → Import** your GitHub repo (using your project ID to link to the existing Vercel project if applicable).
3. Framework preset: **Vite**. Build command `npm run build`, output `dist`.
4. Add environment variables in Vercel → Settings → Environment Variables (copy from local `.env`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
   - any other `VITE_*` vars the app uses (Helius, etc.)
5. After first deploy, every push to the default branch auto-deploys; PRs get preview URLs.

## What I'll change in the codebase

### 1. `vercel.json` (new)
SPA rewrite so client-side routes (`/admin`, `/launchpad/...`, etc.) don't 404 on refresh, plus security headers and a long cache for hashed assets.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }],
  "headers": [
    { "source": "/assets/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]}
  ]
}
```

### 2. Install Vercel packages
```
bun add @vercel/analytics @vercel/speed-insights
```

### 3. Wire Analytics + Speed Insights into `src/App.tsx`
Add the React components near the root so they only load in production on Vercel:

```tsx
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
// ...inside the root render tree:
<Analytics />
<SpeedInsights />
```

### 4. `.vercelignore` (new)
Skip files Vercel doesn't need (anchor program, contracts source, scripts, test files, docs, reference projects) to keep deploy uploads small.

## Notes / non-goals

- I won't touch `src/integrations/supabase/client.ts` or `.env` (auto-managed).
- No changes to the Reown/WalletConnect singleton work from the last turn.
- Vercel project ID itself doesn't need to be committed; it's used inside Vercel's dashboard when importing the GitHub repo. If you'd rather use the Vercel CLI (`vercel link --project <id>`) instead of dashboard import, say so and I'll add a CLI section.
- Lovable Cloud's edge functions stay on Lovable Cloud; Vercel only hosts the frontend.

Approve and I'll implement.