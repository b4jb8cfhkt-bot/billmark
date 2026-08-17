# BillMark Live Search MVP

This version makes the bill lookup real for the current 2025–26 California session.

The browser calls `/api/bill`. The serverless function constructs the official California Legislative Information bill URL, retrieves the official page, extracts basic metadata and the Legislative Counsel's Digest, and returns it to the mobile UI.

This avoids browser CORS issues because the official site is fetched server-side.

## Deploy
Import this folder into Vercel. No API key is required for the basic official-record lookup.

## Next
- add session disambiguation
- improve official-page parsing
- retrieve bill history and all versions
- compare versions
- add grounded AI explanation
- add Stripe
- add watch/email
