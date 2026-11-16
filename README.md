# Stock-Wise-
StockWise is an offline-first inventory management system designed for Rwandan SMEs to track stock, detect discrepancies, improve inventory accuracy, and maintain reliable records for better financial accountability and business decision-making.

## Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then set a long JWT_SECRET_KEY
```

Run the tests and the linter from inside `backend/`:

```bash
pytest
ruff check .
```

pytest settings are in `backend/pytest.ini`, and ruff settings are in `backend/pyproject.toml`.

## Authentication API

Code: `backend/app/routes/auth.py`. Passwords are hashed with bcrypt, and login returns a JWT.

### `POST /api/auth/register`

| Field | Required | Notes |
|---|---|---|
| `name` | yes | |
| `email` | yes | must be unique |
| `password` | yes | |
| `business_name` | one of these two | create a new business; you become its `owner` |
| `business_id` | one of these two | join an existing business; needs an owner's token |
| `role` | no | only used with `business_id`: `staff` (default) or `owner` |

How roles work:
- **New business:** send `business_name` with no token. The person registering becomes the `owner`, and any `role` they send is ignored.
- **Adding someone to a business:** an owner sends `business_id` with the header `Authorization: Bearer <owner's token>`. Without an owner token for that same business, the response is `403`.

Responses: `201` returns the user (`id`, `email`, `role`, `business_id`), `400` means a field is missing or the role isn't allowed, `403` means you aren't an owner of that business, and `409` means the email is already used.

### `POST /api/auth/login`

Body: `{ "email": ..., "password": ... }`

Responses: `200` returns `{ "access_token": ... }`, and `401` means the email or password is wrong. The token's identity is the user id. It also carries the `role` and `business_id` claims.

### `GET /api/health`

Returns `{"status": "ok"}` with `200`. It also runs a tiny database query, so if the database can't be reached this endpoint returns an error. Render uses it to decide whether a deploy is healthy.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`:

- **Backend (ruff + pytest):** runs `ruff check .` and `pytest -v` on Python 3.12.
- **Frontend (lint + build):** runs `npm ci`, `npm run lint` and `npm run build`, but only once `frontend/package-lock.json` exists. Until then it's skipped, with a note in the run summary.

If you push again before a run finishes, the older run is cancelled. After this is merged, turn on branch protection for `main` (GitHub → Settings → Branches) and make the "Backend (ruff + pytest)" check required, so a PR with a red X can't be merged.

## Deployment (Render)

`render.yaml` is a Render Blueprint. It sets up one Flask API (`stockwise-api`) and one PostgreSQL database (`stockwise-db`), both on the free plan in Frankfurt.

To set it up the first time: in the Render dashboard, choose **New → Blueprint** and pick this GitHub repo.

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

## Known issues / things to watch

- **Users need a business.** In `models.py`, `User.business_id` and `User.name` are required, so register needs `name` plus either `business_id` or `business_name`. Clients that send only email and password get a `400`.
- **Roles are `owner` and `staff` only.** They're listed in `ALLOWED_ROLES` in `auth.py`. If the team adds a role such as `manager`, add it there too. Other routes should check the `role` claim in the token before allowing owner-only actions.
- **Set `JWT_SECRET_KEY` in `.env`.** Without it, the app creates a random secret each time it starts, so everyone gets logged out on every restart. Use at least 32 random characters (`.env.example` shows how to make one). Shorter keys make PyJWT print `InsecureKeyLengthWarning`. Every teammate needs their own `.env`, because it's gitignored. In production, every server must use the same secret.
- **Versions are pinned.** `requirements.txt` lists exact versions, so CI installs the same thing every time. To upgrade a package, change its version, run `pip install -r requirements.txt`, and re-run `pytest` and `ruff check .` before committing. `pyproject.toml` also limits ruff to rules `E4, E7, E9, F`.
- **Python versions differ.** CI uses Python 3.12, but the local venv may be newer (for example 3.14). Avoid syntax or features from versions newer than 3.12.
- **`ModuleNotFoundError: No module named 'app'`** when running pytest means you're not in `backend/`, or `pytest.ini` is missing its `pythonpath` setting.
- **Render's free database expires.** The free PostgreSQL database is deleted 30 days after it's created (with a 14-day grace period), and its data goes with it. Create it close to your demo date, or move to a paid plan.
- **Render's free web service sleeps.** It goes to sleep after about 15 minutes with no requests, so the next request can take around a minute while it wakes up. Open the app a minute before a demo.
- **Model changes need a migration.** If you change `models.py`, run `flask db migrate -m "..."` and commit the new file in `migrations/versions/`. Otherwise the Postgres database on Render won't get the change.
- **CORS is open to every website.** `CORS(app)` in `app/__init__.py` lets any site call the API. Once the frontend has its own URL, allow only that address.
- **Frontend CI needs scripts.** As soon as `frontend/package-lock.json` is committed, CI runs `npm run lint` and `npm run build`, so `frontend/package.json` must define both scripts or CI fails.
- **Mixed line endings.** Some files (for example `backend/.gitignore` and `backend/pytest.ini`) use Windows CRLF line endings and others use LF. Patches copied from chat lose the CRLF, so they may fail to apply to those files. Line endings also cause merge conflicts. PR #5 saved `backend/app/__init__.py` with CRLF, so git saw every line as changed and PR #6 conflicted on the whole file. A `.gitattributes` file containing `* text=auto eol=lf`, agreed by the whole team, would prevent this.
- **Several people editing `app/__init__.py`.** Every new route file registers its blueprint there, so branches often conflict in that file. To resolve: start from `main`'s copy of the file, keeping its line endings and import order, and re-add only your own lines. Keep every `from app.routes... import` line and every `app.register_blueprint(...)` call from both sides. Then run `pytest` before committing. Keeping your branch's copy as close to `main`'s as possible lets git merge future changes on its own. Rewriting the whole file (for example, changing line endings or re-sorting imports) makes the next merge conflict again.
- **Merge `main` into your branch often.** If `main` gets new PRs while yours is open, GitHub shows conflicts again. Before pushing, run `git fetch origin && git merge origin/main`.
- **Short test secret in `tests/test_counts.py`.** It sets `JWT_SECRET_KEY = "test-secret"`, so pytest prints `InsecureKeyLengthWarning`. It's harmless, and it goes away if that line is removed, because `conftest.py` already sets a long test key.
- **Keep junk files out of commits.** `.DS_Store` (macOS) is ignored by the root `.gitignore`. If it shows up in `git status`, don't commit it.
