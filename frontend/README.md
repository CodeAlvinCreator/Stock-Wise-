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
| `/products` | Product list with stock badges, search, filters, add product | `GET /api/products`, `POST /api/products`, `GET /api/products/<id>/stock` |
| `/movements` | Record a purchase, sale, return or damage, with a stock preview | `POST /api/movements` |
| `/count` | Blind stock count: expected number shown only after saving | `POST /api/counts` |
| `/reports` | Inventory value report (owner only), printable for lenders | `GET /api/reports/valuation` |

## Files

- `src/api.ts`: every API call, the login token, and the TypeScript types for API data
- `src/auth/`: login state. `business_id` and `role` are read from the JWT
- `src/useProducts.ts`: loads this shop's products and their current stock
- `src/components/`: app bar + bottom navigation (`Screen`), stock badge
- `src/pages/`: one file per screen
- `src/index.css`: all styles. Colours match the Figma file's "StockWise colors" variables

## Checks (the same ones CI runs)

```
npm run lint
npm run build
```

## Known gaps

- `GET /api/products` returns every shop's products, so the app filters by the logged-in shop.
  The backend should filter instead.
- `POST /api/counts` compares against `quantity_on_hand`, which movements don't update, so
  "expected" is wrong after any movement. It should use the movement-based stock.
- Offline mode (service worker + IndexedDB queue) is planned for Sprint 3.
