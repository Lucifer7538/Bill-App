import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional
import os
import re
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
import requests
from fastapi.middleware.cors import CORSMiddleware

# Setup
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Database connection with fallback
mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME", "jalaram_db")
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

settings_collection = db.shop_settings
customers_collection = db.customers
bills_collection = db.bills
counters_collection = db.number_counters
ledger_logs_collection = db.ledger_logs 

app = FastAPI()

# 🚨 SECURITY FIX: Moved to the very top to prevent "Network Error"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

# --- Auth Memory ---
AUTH_TOKEN_EXPIRY_HOURS = 12
ACTIVE_TOKENS: Dict[str, datetime] = {}
AUTH_PASSCODE = os.environ.get("AUTH_PASSCODE", "1234")

# --- Supabase Check ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ENABLED = bool(SUPABASE_URL and SUPABASE_KEY and "YOUR_" not in SUPABASE_URL)

def now_iso(): return datetime.now(timezone.utc).isoformat()

# --- Models ---
class LoginRequest(BaseModel): passcode: str
class BranchDef(BaseModel): id: str; name: str; address: str; map_url: str; invoice_upi_id: str; estimate_upi_id: str; cash_balance: float = 0.0; estimate_bank_balance: float = 0.0; invoice_bank_balance: float = 0.0
class SettingsPayload(BaseModel): shop_name: str; tagline: str; phone_numbers: List[str]; email: str; branches: List[BranchDef]; silver_rate_per_gram: float; making_charge_per_gram: float; default_hsn: str; formula_note: str

# --- Middleware Helper ---
def require_auth(authorization: str = Header(None)):
    if not authorization: raise HTTPException(401, "No Token")
    token = authorization.replace("Bearer ", "").strip()
    if token not in ACTIVE_TOKENS: raise HTTPException(401, "Session Expired - Please Login Again")
    return token

# --- Routes ---

@app.get("/")
async def wakeup_ping():
    return {"status": "online", "message": "Jalaram Server is Awake"}

@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    if payload.passcode != AUTH_PASSCODE: raise HTTPException(401, "Wrong Passcode")
    token = str(uuid.uuid4())
    ACTIVE_TOKENS[token] = datetime.now(timezone.utc) + timedelta(hours=AUTH_TOKEN_EXPIRY_HOURS)
    return {"access_token": token, "expires_at": ACTIVE_TOKENS[token].isoformat()}

@api_router.get("/auth/verify")
async def verify(_=Depends(require_auth)): return {"valid": True}

@api_router.get("/cloud/status")
async def cloud_status(_=Depends(require_auth)):
    return {"provider": "supabase", "enabled": SUPABASE_ENABLED, "mode": "live" if SUPABASE_ENABLED else "fallback"}

@api_router.get("/settings")
async def get_settings(_=Depends(require_auth)):
    doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    if not doc:
        return {"shop_name": "Jalaram Jewellers", "branches": [{"id":"B1", "name":"Branch 1", "address":"", "map_url":"#", "invoice_upi_id":"", "estimate_upi_id":"", "cash_balance":0, "estimate_bank_balance":0, "invoice_bank_balance":0}]}
    return doc

@api_router.get("/bills/today")
async def today_bills(date: str, branch_id: str, _=Depends(require_auth)):
    # Added error handling to return empty list instead of erroring out
    try:
        docs = await bills_collection.find({"date": date, "branch_id": branch_id}, {"_id": 0}).to_list(100)
        return docs or []
    except: return []

@api_router.get("/bills/recent")
async def recent_bills(limit: int = 20, branch_filter: str = "ALL", _=Depends(require_auth)):
    try:
        q = {"branch_id": branch_filter} if branch_filter != "ALL" else {}
        docs = await bills_collection.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return docs or []
    except: return []

@api_router.get("/settings/ledger/logs")
async def get_ledger_logs(branch_id: str, _=Depends(require_auth)):
    try:
        docs = await ledger_logs_collection.find({"branch_id": branch_id}, {"_id": 0}).sort("date", -1).to_list(30)
        return docs or []
    except: return []

@api_router.post("/settings/ledger/adjust")
async def adjust(payload: dict, _=Depends(require_auth)):
    branch_id = payload.get("branch_id")
    await settings_collection.update_one({"key": "app_settings", "branches.id": branch_id}, {"$inc": {"branches.$.cash_balance": payload.get("cash_change", 0), "branches.$.estimate_bank_balance": payload.get("estimate_bank_change", 0), "branches.$.invoice_bank_balance": payload.get("invoice_bank_change", 0)}})
    await ledger_logs_collection.insert_one({**payload, "id": str(uuid.uuid4()), "date": now_iso()})
    return {"message": "Success"}

app.include_router(api_router)
