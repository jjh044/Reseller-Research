# Reseller Research AI

A lightweight prototype for one-page brand intelligence sheets for clothing resellers.

## Current Flow

1. User enters a clothing brand or uploads/snaps a clothing label photo.
2. Label photos are sent to the local Node proxy, which uses OpenAI vision to identify the brand.
3. The detected or entered brand is sent to RapidAPI's eBay Average Selling Price endpoint.
4. If the eBay API is unavailable or quota-limited, the app falls back to a local estimate.
5. The local Node proxy sends the normalized marketplace data to OpenAI for an AI readout.
6. The page renders ASP, sell-through rate, strong categories, and highest sold items.
7. User exports the generated cheat sheet through the PDF-ready print flow.

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
# Optional:
# OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_API_KEY` is required for label photo identification. The app can still generate mock-backed
brand sheets without it, but the label scanner will return an API key error.

Then run the local proxy server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

Opening `index.html` directly still works, but it uses mock fallback data because browser JavaScript should not contain API keys.

Use **Download PDF** after generating a sheet. The browser print dialog will open with print-specific styling for saving the brand sheet as a PDF.
