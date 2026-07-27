import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from routes import auth
from routes import alerts
from routes import logs
from routes import maintenance
from routes import reports
from routes import traffic

load_dotenv()

app = FastAPI(title="IDS Backend API")

origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
if not origins or "*" in origins:
    raise RuntimeError("CORS_ORIGINS must contain explicit trusted origins")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Ingest-API-Key"],
)

app.include_router(maintenance.router)
app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(logs.router)
app.include_router(reports.router)
app.include_router(traffic.router)


@app.get("/")
def home():
    return {
        "ok": True,
        "message": "IDS backend is running"
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "IDS Backend API"
    }


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title="IDS Backend API",
        version="1.0.0",
        description="Network Intrusion Detection System API",
        routes=app.routes,
    )

    openapi_schema.setdefault("components", {})
    openapi_schema["components"]["securitySchemes"] = {
        "HTTPBearer": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token obtained from login endpoint"
        }
    }

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi
