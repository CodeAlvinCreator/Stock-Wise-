from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

from app.config import Config

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app)

    from app import models  # noqa: F401
    from app.routes.auth import auth_bp
    from app.routes.products import products_bp
    from app.routes.stock_movements import bp as stock_movements_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(products_bp)
    app.register_blueprint(stock_movements_bp)

    @app.get("/api/health")
    def health():
        # Render calls this to decide if a deploy is healthy. It also runs a
        # tiny query, so a broken DATABASE_URL shows up here straight away.
        db.session.execute(text("SELECT 1"))
        return {"status": "ok"}, 200

    return app
