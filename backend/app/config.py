import os
import secrets

from dotenv import load_dotenv

load_dotenv()


def parse_origins(raw):
    """Split a comma separated CORS_ORIGINS value into a clean list."""
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///stockwise.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Set JWT_SECRET_KEY in .env. If it is missing, a random key is used,
    # which means every login token stops working when the app restarts.
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_hex(32)
    # Only these sites may call the API from a browser. In production this is
    # the Vercel URL, comma separated if there is more than one.
    CORS_ORIGINS = parse_origins(os.getenv("CORS_ORIGINS", "http://localhost:5173"))
