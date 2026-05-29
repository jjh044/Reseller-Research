# Reseller Research AI

A lightweight prototype for one-page brand intelligence sheets for clothing resellers.

## Current Flow

1. User enters a clothing brand.
2. The local Node proxy requests RapidAPI's eBay Average Selling Price endpoint.
3. The local Node proxy sends the normalized marketplace data to OpenAI for an AI readout.
4. The page renders ASP, sell-through rate, strong categories, and highest sold items.
5. User exports the generated cheat sheet through the PDF-ready print flow.

## Future API Integration Points

- Replace the current `window.print()` PDF handoff with server-side PDF generation if you want one-click file creation without the browser print dialog.
- Keep the rendered data shape stable where possible:
  - `brand`
  - `generatedAt`
  - `source`
  - `categories[]`
  - `aiInsights`

## Run

Run the local proxy server with your RapidAPI and OpenAI keys:

```powershell
$env:RAPIDAPI_KEY="your-rapidapi-key"
$env:OPENAI_API_KEY="your-openai-api-key"
# Optional: $env:OPENAI_MODEL="gpt-4o-mini"
node server.js
```

Then open `http://localhost:3000`.

Opening `index.html` directly still works, but it uses mock fallback data because browser JavaScript should not contain API keys.

Use **Download PDF** after generating a sheet. The browser print dialog will open with print-specific styling for saving the brand sheet as a PDF.
