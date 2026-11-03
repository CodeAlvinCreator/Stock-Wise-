import os
import secrets

from dotenv import load_dotenv

load_dotenv()


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///stockwise.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Set JWT_SECRET_KEY in .env. If it is missing, a random key is used,
    # which means every login token stops working when the app restarts.
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_hex(32)
