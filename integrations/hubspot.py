import os
import json
import base64
import secrets
import urllib.parse
from fastapi import APIRouter, Request, HTTPException, Form
from fastapi.responses import HTMLResponse
from typing import Dict, Any
import requests
import logging
import httpx

from redis_client import add_key_value_redis, get_value_redis, delete_key_redis

router = APIRouter()

# Constants
CLIENT_ID = os.getenv("HUBSPOT_CLIENT_ID", "16e4a19c-1d1f-468a-b3d0-b3c4b2a04d03")
CLIENT_SECRET = os.getenv("HUBSPOT_CLIENT_SECRET", "fed22754-b29f-434c-b72b-ee03e09edcd9")
SCOPES = "crm.objects.companies.read crm.objects.contacts.read"
REDIRECT_URI = os.getenv("HUBSPOT_REDIRECT_URI", "http://localhost:8000/integrations/hubspot/oauth2callback")

# Authorization URL
authorization_url = (
    f"https://app.hubspot.com/oauth/authorize?client_id={urllib.parse.quote(CLIENT_ID)}"
    f"&scope={urllib.parse.quote(SCOPES)}"
    f"&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
)

# Helper Functions
async def save_state_to_redis(org_id: str, user_id: str, state_data: dict, expire: int = 600):
    encoded_state = base64.urlsafe_b64encode(json.dumps(state_data).encode("utf-8")).decode("utf-8")
    await add_key_value_redis(f"hubspot_state:{org_id}:{user_id}", encoded_state, expire)
    return encoded_state

async def validate_state(encoded_state: str, org_id: str, user_id: str):
    try:
        state_data = json.loads(base64.urlsafe_b64decode(encoded_state).decode("utf-8"))
    except (json.JSONDecodeError, base64.binascii.Error):
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    saved_state = await get_value_redis(f"hubspot_state:{org_id}:{user_id}")
    if not saved_state:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    try:
        saved_state = json.loads(base64.urlsafe_b64decode(saved_state).decode("utf-8"))
    except (json.JSONDecodeError, base64.binascii.Error):
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    if state_data.get("state") != saved_state.get("state"):
        raise HTTPException(status_code=400, detail="State parameter mismatch")

    return state_data

# Routes
@router.post("/authorize")
async def authorize_hubspot_integration(user_id: str = Form(...), org_id: str = Form(...)):
    
    state_data = {
        "state": secrets.token_urlsafe(32),
        "user_id": user_id,
        "org_id": org_id,
    }
    encoded_state = await save_state_to_redis(org_id, user_id, state_data)
    return {"url": f"{authorization_url}&state={encoded_state}"}

@router.get("/oath2callback")
async def hubspot_callback(request: Request):
    if request.query_params.get("error"):
        raise HTTPException(status_code=400, detail=request.query_params.get("error_description"))

    code = request.query_params.get("code")
    encoded_state = request.query_params.get("state")
    if not encoded_state:
        raise HTTPException(status_code=400, detail="State parameter is missing")

    state_data = await validate_state(encoded_state, state_data["org_id"], state_data["user_id"])

    async with httpx.AsyncClient() as client:
        try:
            token_response = await client.post(
                "https://api.hubspot.com/oauth/v1/token",
                data={
                    "grant_type": "authorization_code",
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "redirect_uri": REDIRECT_URI,
                    "code": code,
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
            )
            token_response.raise_for_status()
            response_data = token_response.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)

    await delete_key_redis(f"hubspot_state:{state_data['org_id']}:{state_data['user_id']}")
    await add_key_value_redis(
        f"hubspot_credentials:{state_data['org_id']}:{state_data['user_id']}",
        json.dumps(response_data),
        expire=600,
    )

    return HTMLResponse(content="<html><script>window.close();</script></html>")

@router.post("/credentials")
async def get_hubspot_credentials_integration(user_id: str = Form(...), org_id: str = Form(...)):
    credentials = await get_value_redis(f"hubspot_credentials:{org_id}:{user_id}")
    if not credentials:
        raise HTTPException(status_code=400, detail="No HubSpot credentials found")
    try:
        credentials = json.loads(credentials)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid HubSpot credentials format")

    await delete_key_redis(f"hubspot_credentials:{org_id}:{user_id}")
    return credentials

@router.post("/load")
async def get_hubspot_contacts(credentials: str = Form(...)):
    credentials = json.loads(credentials) if isinstance(credentials, str) else credentials
    url = "https://api.hubapi.com/crm/v3/objects/companies"
    list_of_responses = []

    def fetch_items(access_token: str, url: str, aggregated_response: list, limit=None):
        params = {"limit": limit} if limit else {}
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.get(url, headers=headers, params=params)

        if response.status_code == 200:
            results = response.json().get("results", [])
            for item in results:
                aggregated_response.append(item)
            if response.json().get("paging", {}).get("next", {}).get("link"):
                fetch_items(access_token, response.json()["paging"]["next"]["link"], aggregated_response)
        else:
            logging.error(f"Error fetching items: {response.status_code} - {response.text}")

    fetch_items(credentials.get("access_token"), url, list_of_responses)

    return list_of_responses

__all__ = [
    "router",
    "authorize_hubspot_integration",
    "hubspot_callback",
    "get_hubspot_credentials_integration",
    "get_hubspot_contacts",
]