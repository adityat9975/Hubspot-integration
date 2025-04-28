import os
from fastapi import FastAPI, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from redis import asyncio as redis
from dotenv import load_dotenv
from fastapi.responses import JSONResponse

# Integration routers
from integrations.hubspot import router as hubspot_router
from integrations.airtable import router as airtable_router
from integrations.notion import router as notion_router

# Load environment variables
load_dotenv()

app = FastAPI(
    title="VectorShift Integrations API",
    description="API for managing third-party integrations",
    version="1.0.0"
)

# CORS setup
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    os.getenv("FRONTEND_URL", "")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis connection
@app.on_event("startup")
async def startup_event():
    app.state.redis = redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6380)),
        password=os.getenv("REDIS_PASSWORD", None),
        decode_responses=True
    )

@app.on_event("shutdown")
async def shutdown_event():
    await app.state.redis.close()

# Health check
@app.get("/")
async def health_check():
    return {
        "status": "healthy",
        "services": {
            "redis": await app.state.redis.ping()
        }
    }

# Middleware for error handling
@app.middleware("http")
async def handle_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Internal server error: {str(e)}"}
        )

# Include routers for structured routing
app.include_router(hubspot_router, prefix="/integrations/hubspot", tags=["HubSpot"])
app.include_router(airtable_router, prefix="/integrations/airtable", tags=["Airtable"])
app.include_router(notion_router, prefix="/integrations/notion", tags=["Notion"])