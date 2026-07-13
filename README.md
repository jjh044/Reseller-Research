# FlipFile

A sourcing intelligence app for clothing resellers.

## Current Flow

1. User enters a clothing brand or uploads/snaps a clothing label photo.
2. Label photos are sent to the local Node proxy, which uses OpenAI vision to identify the brand.
3. The detected or entered brand is sent to RapidAPI's eBay Average Selling Price endpoint.
4. Successful eBay comp results are cached in Convex for repeat searches and stale fallback.
5. The local Node proxy sends the normalized marketplace data to OpenAI for an AI readout.
6. The page renders ASP, sell-through rate, data confidence, strongest categories, max buy target, profit range, visual BOLO sold listings, and clothing-tag references.
7. User saves the Brand file to their account or exports the generated cheat sheet through the PDF-ready print flow.

## Future API Integration Points

- Replace the current `window.print()` PDF handoff with server-side PDF generation if you want one-click file creation without the browser print dialog.
- Keep the rendered data shape stable where possible:
  - `brand`
  - `generatedAt`
  - `source`
  - `categories[]`
  - `aiInsights`

## Run

Create a local `.env` file from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and add your keys:

```text
RAPIDAPI_KEY=your-rapidapi-key
OPENAI_API_KEY=your-openai-api-key
CONVEX_HTTP_URL=https://your-deployment.convex.site
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your-clerk-publishable-key
CLERK_SECRET_KEY=sk_test_your-clerk-secret-key
# Optional:
# OPENAI_MODEL=gpt-4o-mini
# RAPIDAPI_GOOGLE_IMAGES_HOST=google-search72.p.rapidapi.com
# RAPIDAPI_GOOGLE_IMAGES_PATH=/imagesearch
# GOOGLE_CSE_API_KEY=your-google-custom-search-api-key
# GOOGLE_CSE_ID=your-programmable-search-engine-id
```

`OPENAI_API_KEY` is required for label photo identification. The app can still generate mock-backed
brand sheets without it, but the label scanner will return an API key error.

The Tags section uses RapidAPI Google Images first, then OpenAI vision verifies that each candidate is
an actual clothing tag or sewn label close-up. OpenAI image search and Google CSE are fallback paths.
If your RapidAPI Google Images product uses a different route, set `RAPIDAPI_GOOGLE_IMAGES_PATH`.

Then run the local proxy server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

Before shipping a mobile-facing change, run:

```powershell
npm run check
```

The check script verifies JavaScript syntax plus iPhone-critical release invariants: safe viewport metadata, standalone manifest, 16px text controls to prevent Safari focus zoom, horizontal overflow clipping, compressed label-image payloads, request timeouts, and service-readiness reporting.

Opening `index.html` directly still works, but it uses mock fallback data because browser JavaScript should not contain API keys.

Use **Download PDF** after generating a sheet. The browser print dialog will open with print-specific styling for saving the brand sheet as a PDF.

## Public Pages

- `/partners` - creator partner page for reseller influencers and rev-share outreach.
- `/privacy.html` - privacy policy.
- `/terms.html` - terms.

## Convex Storage

The Brand file syncs to Convex when `CONVEX_HTTP_URL` is configured. If that value is missing, the app falls back to browser `localStorage` so saving still works during setup.
Marketplace comp responses also cache in Convex for 24 hours per brand. If RapidAPI or eBay is temporarily blocked and a previous cache record exists, the app can return the stale cached result with a clear `stale-cache` data label instead of pretending the data is fresh.

1. Create or open a Convex project.
2. From this app folder, install dependencies:
   ```powershell
   C:\Program Files\nodejs\npm.cmd install
   ```
3. Link and deploy the Convex backend:
   ```powershell
   C:\Program Files\nodejs\npx.cmd convex dev
   C:\Program Files\nodejs\npx.cmd convex deploy
   ```
4. Copy the Convex HTTP actions URL, which should look like `https://your-deployment.convex.site`.
5. Add `CONVEX_HTTP_URL` to the linked Vercel project for Production and Preview.
6. Redeploy the Vercel project.

With Clerk configured, saved Brand files are tied to the signed-in Clerk user id.

## User Accounts

User accounts are handled by Clerk. The app requires sign in before the main dashboard is shown, and Brand file API requests verify the Clerk session before saving or loading reports.

Configure these Vercel environment variables for Production and Preview:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

In Clerk, enable Email address sign-up/sign-in and password authentication. Clerk handles forgot-password emails and the user menu/logout flow.

## Launch Features

- Live, cached-live, and estimated data labels.
- Confidence and sample-size notes on every report.
- Retry handling and structured server logs for marketplace API failures.
- iPhone-safe viewport rules, safe-area layout, no focus zoom on text fields, and compressed label photos for faster in-store scanning.
- App service readiness is exposed through `/api/config` so missing marketplace, AI, or auth setup can surface in the UI.
- Max buy price, profit range, and avoid notes.
- Quick Decision max-buy boxes for every researched brand.
- Visual BOLO cards backed by real eBay sold-listing images and prices.
- A bottom-of-report Tags gallery with up to three relevant eBay tag references.
- Recent search history on the report screen.
- Account-synced saved Brand files.
- Mobile-first label scanner with separate camera and upload actions.
- Public `privacy.html` and `terms.html` pages.
- Feedback links to `creativesolutionssupport@gmail.com`.
