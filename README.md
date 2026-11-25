# Stock-Wise-
StockWise is an offline-first inventory management system designed for Rwandan SMEs to track stock, detect discrepancies, improve inventory accuracy, and maintain reliable records for better financial accountability and business decision-making.

## Demo Video: https://youtu.be/CWRCux4a-RM
## Live Link: https://stock-wise-ten-pi.vercel.app

## Features

- **Shops and roles.** Registering creates a shop and makes you its `owner`. Owners add `staff` (or other owners) from the Team screen.
- **Products** with SKU, unit, cost price in RWF, and a reorder level. Products at or below their reorder level are flagged "Low stock" on the Products screen.
- **Stock movements** (purchase, sale, return, damage). Stock is always the sum of the movement ledger, never a number someone typed in.
- **Blind stock counts.** The expected figure only appears after the count is saved. A count that doesn't match creates a discrepancy.
- **Discrepancy workflow:** `open` → `investigated` (staff or owner records a cause and a finding) → `resolved` (owner only; stock is corrected to the counted figure).
- **Offline first.** Movements and stock counts recorded with no connection are queued on the phone and sent when it is back online. Each one carries an id made on the phone, so a replayed request is never saved twice.
- **Audit log.** Every change (products, movements, counts, investigations, resolutions, new team members) writes an audit row. Owners can read it on the Audit log screen.
- **Inventory value report** in RWF, and a downloadable **loan-readiness PDF** for lenders.
- Every business only ever sees its own data. Another shop's ids get `404`, so they can't be probed.

## Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then set a long JWT_SECRET_KEY
flask db upgrade          # creates the SQLite database
flask run                 # http://localhost:5000
```

Run the tests and the linter from inside `backend/`:

```bash
pytest
ruff check .
```

pytest settings are in `backend/pytest.ini`, and ruff settings are in `backend/pyproject.toml`.

### Frontend

You need Node.js 20 or newer.

```bash
cd frontend
npm ci
cp .env.example .env      # points the app at http://localhost:5000
npm run dev               # http://localhost:5173
```

Checks (the same ones CI runs): `npm run lint` and `npm run build`. See `frontend/README.md` for the screens.

### Environment variables

| Variable | Where | Required | Default | What it does |
|---|---|---|---|---|
| `DATABASE_URL` | backend | in production | `sqlite:///stockwise.db` | SQLAlchemy database URL. Render fills it in from the `stockwise-db` database. |
| `JWT_SECRET_KEY` | backend | yes | random on every start | Signs login tokens. Use at least 32 random characters. Render generates one. |
| `CORS_ORIGINS` | backend | in production | `http://localhost:5173` | Websites allowed to call the API, comma separated. Set it to the Vercel URL. |
| `FLASK_APP` | backend | for `flask` commands | | `run.py` |
| `VITE_API_URL` | frontend | in production | `http://localhost:5000` | Where the API is. Read at build time, so rebuild after changing it. |

## API reference

All request and response bodies are JSON unless stated otherwise. "Token" means the header `Authorization: Bearer <access_token>` from login.

### Errors

Every error has the same shape:

```json
{ "error": "quantity must be a whole number from 1 to 2,147,483,647", "field": "quantity" }
```

`field` is only there for validation errors (`400`), so the app can show the message next to the right input.

| Status | Meaning |
|---|---|
| `400` | Bad input: a missing or wrong field, or a body that isn't a JSON object |
| `401` | No token, an invalid or expired token, a user that no longer exists, or a wrong password at login |
| `403` | Logged in, but your role can't do this (usually owner-only) |
| `404` | Not found, **including another business's ids** |
| `405` | Wrong HTTP method |
| `409` | Conflict: email already used, wrong discrepancy status, or a client id already used by another business |
| `500` | Unexpected server error. Details are logged on the server and never sent to the client |

### Health

| Method and path | Auth | Responses |
|---|---|---|
| `GET /api/health` | none | `200 {"status": "ok"}`. It also runs a tiny database query, so it fails if the database can't be reached. Render uses it to decide whether a deploy is healthy. |

### Auth and team (`backend/app/routes/auth.py`)

**`POST /api/auth/register`**: no token to create a shop; an owner's token to add someone to an existing shop.

| Field | Required | Notes |
|---|---|---|
| `name` | yes | up to 120 characters |
| `email` | yes | must look like an email and be unique |
| `password` | yes | 8 characters to 72 bytes |
| `business_name` | one of these two | create a new business; you become its `owner` (any `role` sent is ignored) |
| `business_id` | one of these two | join an existing business; needs a token of an owner of that business |
| `role` | no | only used with `business_id`: `staff` (default) or `owner` |

Responses: `201` returns `{id, email, role, business_id}`. `400` bad input, `403` you aren't an owner of that business (the role is read from the database, not the token), `409` email already used. Adding someone writes a `user.created` audit row.

**`POST /api/auth/login`**: body `{email, password}`. `200` returns `{"access_token": ...}`. The token's identity is the user id, and it carries `role` and `business_id` claims. `400` if either field is missing, `401` wrong email or password.

**`GET /api/auth/team`**: token, owner only. `200` returns `{"users": [{id, name, email, role, business_id}]}` for your business. `403` for staff.

### Products (`backend/app/routes/products.py`)

Any logged-in user of the business. `business_id` always comes from the logged-in user; a `business_id` in the body is ignored.

| Method and path | Body | Responses |
|---|---|---|
| `GET /api/products` | | `200` list of your products, sorted by name, each with `stock` worked out from the movement ledger |
| `GET /api/products/<id>` | | `200` the product, `404` missing or another business's |
| `POST /api/products` | `name` (required, max 150), `sku` (max 60), `unit` (max 30), `unit_cost`, `reorder_level`, `quantity_on_hand` (whole numbers, 0 or more, default 0) | `201` the product, `400` bad input |
| `PUT /api/products/<id>` | any of the fields above | `200` the product, `400` bad input, `404` missing or another business's |
| `GET /api/products/<id>/stock` | | `200 {product_id, name, stock}`, `404` |

Create writes `product.created` and update writes `product.updated` (details list the fields that were sent).

### Stock movements (`backend/app/routes/stock_movements.py`)

**`POST /api/movements`**: token, any role.

| Field | Required | Notes |
|---|---|---|
| `product_id` | yes | must belong to your business, otherwise `404` |
| `movement_type` | yes | `purchase`, `return` (add stock), `sale`, `damage` (remove stock). `adjustment_in`/`adjustment_out` are only created by resolving a discrepancy |
| `quantity` | yes | whole number, 1 or more |
| `note` | no | up to 255 characters |
| `id` | no | a UUID made by the client, for offline replay |

Responses: `201` the new movement. `200` the saved movement when the same `id` is sent again (nothing new is saved and no second audit row is written). `400` bad input, `404` product not found, `409` the `id` is already used by another business. Writes `movement.created`.

### Stock counts (`backend/app/routes/stock_counts.py`)

**`POST /api/counts`**: token, any role. Body `{product_id, counted_quantity, id?}`. `counted_quantity` is a whole number, 0 or more. `id` is an optional client UUID, the same replay pattern as movements.

The expected figure comes from the movement ledger. If the count differs, an `open` discrepancy is created.

Responses: `201 {count: {id, product_id, expected_quantity, counted_quantity}, kind: "shortage" | "surplus" | "match", discrepancy: {id, difference, status} | null}`. `200` with the same body when an `id` is replayed. `400`, `404`, `409` as for movements. Writes `count.created`.

### Discrepancies (`backend/app/routes/discrepancies.py`)

Every discrepancy response has `{id, product_id, product_name, difference, value_rwf, status, cause, finding, created_at, investigated_at, resolved_at}`. `difference` is counted minus expected, so it is negative for a shortage.

| Method and path | Auth | Body | Responses |
|---|---|---|---|
| `GET /api/discrepancies?status=` | any role | | `200 {"discrepancies": [...]}`, newest first. `status` is optional: `open`, `investigated` or `resolved`, otherwise `400` |
| `POST /api/discrepancies/<id>/investigate` | any role | `cause`, `finding` | `200` the discrepancy. `400` bad cause or finding, `404`, `409` not `open`. Writes `discrepancy.investigated` |
| `POST /api/discrepancies/<id>/resolve` | owner | | `200 {discrepancy, movement_id, stock_after}`. `403` staff, `404`, `409` not `investigated`. Writes `discrepancy.resolved` |

`cause` must be one of `unrecorded_sale`, `damaged_or_expired`, `theft`, `counting_mistake`, `supplier_short_delivery`, `other`. `finding` is text of 1 to 1000 characters.

Resolving adds an `adjustment_in` or `adjustment_out` movement of the counted difference and sets `quantity_on_hand` to the new ledger stock, so stock matches the count. The status change, the correction and the audit row are saved in one transaction. The status is changed with `UPDATE ... WHERE status = 'investigated'`, so if two owners press Resolve at once, only one correction is made and the other gets `409`.

### Reports (`backend/app/routes/reports.py`)

Owner only (`403` for staff).

**`GET /api/reports/valuation`**: `200 {business_id, currency, total_value, product_count, items: [{product_id, name, sku, unit, stock, unit_cost, value}], warnings: {negative_stock, missing_unit_cost}, generated_at}`. Stock comes from the movement ledger. A negative balance is valued at 0 and listed in `warnings`.

**`GET /api/reports/loan-readiness?from=YYYY-MM-DD&to=YYYY-MM-DD`**: returns a PDF (`application/pdf`, as a download). Both dates are optional and included; the default is the last 90 days. `400` if a date is malformed or `from` is after `to`. The PDF has:

- business name, report date and period
- total stock value in RWF and a per-product table (today's values, from `build_valuation`)
- discrepancies in the period: count, total units, value lost to shortages, breakdown by cause, percentage resolved
- inventory accuracy: counts that matched exactly divided by all counts in the period
- audit trail: number of actions logged in the period and the latest 20

The numbers are built in `backend/app/services/loan_report.py` (`build_loan_report`), separately from the PDF layout, so they are unit tested directly.

### Audit log (`backend/app/routes/audit.py`)

**`GET /api/audit-logs?limit=`**: token, owner only. `limit` is optional: default 50, maximum 200 (bigger values are cut to 200). `200 {"audit_logs": [{id, action, entity_type, entity_id, user_id, user_name, details, created_at}]}`, newest first, only for your business. `400` if `limit` isn't a positive whole number.

Writing a row from a route (`backend/app/services/audit.py`):

```python
from app.services.audit import log_action

log_action(user, "discrepancy.investigated", "discrepancy", discrepancy.id, {"cause": cause})
db.session.commit()
```

- **It does not commit.** Call it before your own `db.session.commit()`, so the change and its audit row are saved together, or neither is saved.
- **The id must exist first.** Call `db.session.flush()` before `log_action` when you log a row you just created.
- Action names use `<entity>.<past tense verb>`: `product.created`, `product.updated`, `movement.created`, `count.created`, `discrepancy.investigated`, `discrepancy.resolved`, `user.created`.

### Writing a new route

- Use `@jwt_required()` and `current_user` from `flask_jwt_extended`. The user is loaded from the database by `app/errors.py`, and a token for a deleted user gets `401`.
- Read input with the helpers in `app/services/validation.py` (`json_body`, `read_string`, `read_int`, `read_uuid`). They raise `ValidationError`, which becomes a `400` naming the field.
- Use `abort(404, description="...")` for errors and `require_owner(user, "...")` from `app/services/access.py` for owner-only routes.
- Load rows through the user's business (for example `get_business_product` in `products.py`) so another business's ids get `404`.

## User guide

1. **Register your shop.** Open the app, choose "Register a new shop" and fill in your name, the shop name, your email and a password. You are the owner.
2. **Add your team.** Reports → Owner tools → Team. Enter the person's name, email and a temporary password, and choose Staff or Owner. They can log in straight away.
3. **Add products.** Products → "+ Add product", with the cost per unit in RWF and the stock level at which you want a "Low stock" warning.
4. **Record a movement.** Movements → pick the product, choose Purchase, Sale, Return or Damage, enter the quantity and save. The card shows what the stock will be after saving. With no connection it says "Saved offline" and syncs by itself later.
5. **Count stock.** Count → type what is physically on the shelf for each product and press Save. Only then do you see the expected figure. A difference shows "Investigate now". Counts also work offline.
6. **Investigate.** Press "Investigate now" (or Issues → Open → "Investigate open discrepancies"), choose what most likely happened, write what you found and send it to the owner.
7. **Resolve (owner).** Issues → Investigated → Resolve. Confirm, and the stock is corrected to the counted figure. The discrepancy moves to Resolved.
8. **Download the loan-readiness report (owner).** Reports → choose the From and To dates → "Download loan-readiness report". The PDF opens or saves, ready to send to a lender.
9. **Check the audit log (owner).** Reports → Owner tools → Audit log shows who did what, and when.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`:

- **Backend (ruff + pytest):** runs `ruff check .` and `pytest -v` on Python 3.12.
- **Frontend (lint + build):** runs `npm ci`, `npm run lint` and `npm run build` on Node 22.

If you push again before a run finishes, the older run is cancelled. Turn on branch protection for `main` (GitHub → Settings → Branches) and make both checks required, so a PR with a red X can't be merged.

## Deployment

### API on Render

`render.yaml` is a Render Blueprint. It sets up one Flask API (`stockwise-api`) and one PostgreSQL database (`stockwise-db`), both on the free plan in Frankfurt.

To set it up the first time: in the Render dashboard, choose **New → Blueprint** and pick this GitHub repo. Render asks for `CORS_ORIGINS` (marked `sync: false`); enter the Vercel URL of the frontend.

On every deploy:

1. Render deploys from `main`, and only after CI passes (`autoDeployTrigger: checksPass`).
2. Render runs `pip install -r requirements.txt` inside `backend/`.
3. At startup, Render runs `flask db upgrade` (database migrations) and then starts `gunicorn run:app`.
4. Render checks `/api/health` before it switches traffic over to the new version.

Render creates `DATABASE_URL` and `JWT_SECRET_KEY` for you. The secret is a random value generated once, so it isn't in the repo.

To try the production start command on your machine:

```bash
cd backend
DATABASE_URL=sqlite:///local-test.db FLASK_APP=run.py PORT=5000 \
  sh -c 'flask db upgrade && gunicorn run:app --bind 0.0.0.0:$PORT'
curl localhost:5000/api/health
```

### Frontend on Vercel

Import the repo in Vercel with **Root Directory** `frontend` (Vite is detected, the build command is `npm run build` and the output is `dist`). Set `VITE_API_URL` to the Render API URL, with no trailing slash, then redeploy, because Vite bakes it in at build time. `frontend/vercel.json` sends every path to `index.html`, so reloading `/products` works.

## Known issues / things to watch

- **Users need a business.** In `models.py`, `User.business_id` and `User.name` are required, so register needs `name` plus either `business_id` or `business_name`.
- **Roles are `owner` and `staff` only.** They're listed in `ALLOWED_ROLES` in `auth.py`. If the team adds a role such as `manager`, add it there and check every `require_owner` call.
- **Logins last 15 minutes.** That's flask-jwt-extended's default `JWT_ACCESS_TOKEN_EXPIRES`. When a token expires the app logs the user out and shows the login page; anything queued offline is kept and sent after the next login. There are no refresh tokens yet.
- **No way to remove a user or reset a password yet.** An owner can add people but not deactivate them. There is also no rate limit on login attempts.
- **The login token is kept in `localStorage`.** That is simple and works offline, but any script running on the page could read it, so don't add third-party scripts to the frontend.
- **Discrepancy cause names.** The API uses `damaged_or_expired`, `counting_mistake` and `supplier_short_delivery` (the names agreed with the Investigate screen). Renaming them now would need a data migration for rows already saved.
- **Resolving corrects by the counted difference.** If sales were recorded between the count and the resolve, stock ends at the counted figure minus those sales, which is what is really on the shelf. `quantity_on_hand` is updated to match, but stock is always read from the ledger.
- **Offline counts are compared when they sync.** The expected figure is worked out when the count reaches the server. Movements queued earlier on the same phone are sent first, but movements from another phone in between change the expected figure.
- **Set `JWT_SECRET_KEY` in `.env`.** Without it, the app creates a random secret each time it starts, so everyone gets logged out on every restart. Use at least 32 random characters (`.env.example` shows how to make one). In production, every server must use the same secret.
- **Versions are pinned.** `requirements.txt` lists exact versions, so CI installs the same thing every time. To upgrade a package, change its version, run `pip install -r requirements.txt`, and re-run `pytest` and `ruff check .` before committing. `pyproject.toml` also limits ruff to rules `E4, E7, E9, F`.
- **Python versions differ.** CI uses Python 3.12, but the local venv may be newer. Avoid syntax or features from versions newer than 3.12.
- **`ModuleNotFoundError: No module named 'app'`** when running pytest means you're not in `backend/`, or `pytest.ini` is missing its `pythonpath` setting.
- **Render's free database expires.** The free PostgreSQL database is deleted 30 days after it's created (with a 14-day grace period), and its data goes with it. Create it close to your demo date, or move to a paid plan.
- **Render's free web service sleeps.** It goes to sleep after about 15 minutes with no requests, so the next request can take around a minute while it wakes up. Open the app a minute before a demo.
- **Model changes need a migration.** If you change `models.py`, run `flask db migrate -m "..."` and commit the new file in `migrations/versions/`. Otherwise the Postgres database on Render won't get the change. `flask db check` tells you if one is missing.
- **Mixed line endings.** Some files (for example `backend/.gitignore`, `backend/pytest.ini` and `backend/app/routes/products.py`) use Windows CRLF line endings and others use LF. The new `.gitattributes` (`* text=auto eol=lf`) makes git store every new or LF file with LF, while files already committed with CRLF are left as they are until someone renormalises them on purpose (`git add --renormalize .` in its own PR, agreed by the whole team). Until then, keep each file's existing line endings when you edit it.
- **Several people editing `app/__init__.py`.** Every new route file registers its blueprint there, so branches often conflict in that file. To resolve: start from `main`'s copy of the file, keeping its line endings and import order, and re-add only your own lines. Then run `pytest` before committing.
- **Merge `main` into your branch often.** If `main` gets new PRs while yours is open, GitHub shows conflicts again. Before pushing, run `git fetch origin && git merge origin/main`.
- **Tests need real users.** Routes load the user from the token, so tests must seed a `Business` and `User` and sign the token with `identity=user.id` (see `tests/test_products.py`). A fake identity such as `"test-user"` gets `401`.
- **Keep junk files out of commits.** `.DS_Store` (macOS) is ignored by the root `.gitignore`. Editor folders such as `.vscode/` aren't ignored by the repo; to hide yours without changing a shared file, add `.vscode/` to `.git/info/exclude`.
