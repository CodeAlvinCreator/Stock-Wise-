import pytest
from flask_jwt_extended import create_access_token

from app import create_app
from app.config import parse_origins
from tests.conftest import TestConfig


def test_unknown_route_returns_json_404(client):
    response = client.get("/api/nothing-here")
    assert response.status_code == 404
    assert response.get_json() == {"error": "not found"}


def test_wrong_method_returns_json_405(client):
    response = client.delete("/api/health")
    assert response.status_code == 405
    assert response.get_json() == {"error": "method not allowed"}


def test_missing_token_returns_json_401(client):
    response = client.get("/api/products")
    assert response.status_code == 401
    assert response.get_json() == {"error": "login required"}


def test_garbage_token_returns_json_401(client):
    response = client.get("/api/products", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
    assert response.get_json() == {"error": "invalid login token"}


def test_token_for_deleted_user_returns_401(client):
    token = create_access_token(identity="no-such-user")
    response = client.get("/api/products", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.get_json() == {"error": "this account no longer exists"}


def test_unexpected_error_returns_generic_500(app, client):
    @app.get("/api/boom")
    def boom():
        raise RuntimeError("secret database password in this message")

    response = client.get("/api/boom")

    assert response.status_code == 500
    assert response.get_json() == {"error": "something went wrong on the server"}


class FrontendConfig(TestConfig):
    CORS_ORIGINS = ["https://stockwise.example.com"]


@pytest.fixture
def cors_client():
    return create_app(FrontendConfig).test_client()


def test_cors_allows_listed_origin(cors_client):
    response = cors_client.get(
        "/api/nothing-here", headers={"Origin": "https://stockwise.example.com"}
    )
    assert response.headers["Access-Control-Allow-Origin"] == "https://stockwise.example.com"


def test_cors_blocks_other_origins(cors_client):
    response = cors_client.get("/api/nothing-here", headers={"Origin": "https://evil.example.com"})
    assert "Access-Control-Allow-Origin" not in response.headers


def test_cors_origins_env_value_is_split_on_commas():
    assert parse_origins("https://a.example.com, https://b.example.com,") == [
        "https://a.example.com",
        "https://b.example.com",
    ]
