# BillMark

BillMark looks up California Assembly and Senate bills through the official California Legislative Information record and displays a clearly separated official record and BillMark analysis.

## Architecture

- `index.html` — mobile-first search and bill-result interface
- `api/bill.js` — server-side `/api/bill` endpoint with a 10-minute cache
- `lib/bill-data.js` — bill normalization and official-record retrieval/parsing

The browser only calls `/api/bill`; California legislative retrieval happens server-side. Each successful result includes a direct link to its official California legislative record.

## Local checks

```sh
node --check api/bill.js
node --check lib/bill-data.js
```

The runtime fetches the official `leginfo.legislature.ca.gov` bill record. If that source is unavailable, the API returns a clear unavailable-source response rather than inventing bill data.
