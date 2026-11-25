# StockWise frontend

React + Vite + TypeScript app for StockWise. It talks to the Flask API in `../backend`.

## Run it on your laptop

You need Node.js 20 or newer (`node -v` to check).

```
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173. The backend must also be running (`cd backend && flask run`),
because `.env` points the app at `http://localhost:5000`. To use the live Render API instead,
put its URL in `.env` as `VITE_API_URL`.

## Screens

| Route | Screen | API it calls |
| --- | --- | --- |
| `/login` | Log in or register a new shop | `POST /api/auth/login`, `POST /api/auth/register` |
| `/products` | Product list with stock, low-stock badges and warning, search, filters, add product | `GET /api/products`, `POST /api/products` |
| `/movements` | Record a purchase, sale, return or damage, with a stock preview. Queued offline | `POST /api/movements` |
| `/count` | Blind stock count: expected number shown only after saving. Queued offline | `POST /api/counts` |
| `/discrepancies` | Open, investigated and resolved discrepancies. Owners resolve here | `GET /api/discrepancies`, `POST /api/discrepancies/<id>/resolve` |
| `/investigate` | Record the cause and finding for an open discrepancy | `GET /api/discrepancies`, `POST /api/discrepancies/<id>/investigate` |
| `/reports` | Inventory value (owner only) and the loan-readiness PDF download | `GET /api/reports/valuation`, `GET /api/reports/loan-readiness` |
| `/team` | Owner only: team list and add a team member | `GET /api/auth/team`, `POST /api/auth/register` |
| `/audit` | Owner only: who did what, newest first | `GET /api/audit-logs` |

## Files

- `src/api.ts`: every API call, the login token, error handling and the TypeScript types for API data.
  Every request goes through `send()`: no network becomes an `ApiError` with status 0, a 401 logs the
  user out, and other errors carry the backend's `{error, field}` message
- `src/auth/`: login state. `business_id` and `role` are read from the JWT
- `src/offline/`: the IndexedDB outbox. Movements and counts saved offline are sent in order when the
  phone is back online. Items the server refuses are shown in a banner, never dropped silently
- `src/useProducts.ts`, `src/useDiscrepancies.ts`: load data for the screens
- `src/components/`: app bar + bottom navigation (`Screen`), stock badge, form field errors
- `src/pages/`: one file per screen
- `src/index.css`: all styles. Colours match the Figma file's "StockWise colors" variables

## Checks (the same ones CI runs)

```
npm run lint
npm run build
```

## Deploying on Vercel

Set the project's Root Directory to `frontend` and the environment variable `VITE_API_URL` to the
Render API URL (no trailing slash). Vite reads it at build time, so redeploy after changing it.
The API's `CORS_ORIGINS` must include the Vercel URL, or the browser blocks every request.
