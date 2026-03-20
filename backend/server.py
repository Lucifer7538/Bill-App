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

# Database Connection
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

# 🚨 SECURITY FIX: This allows your iPad to Save from any Vercel URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
ACTIVE_TOKENS: Dict[str, str] = {}
AUTH_PASSCODE = os.environ.get("AUTH_PASSCODE", "1234")

# --- Supabase Check ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ENABLED = bool(SUPABASE_URL and SUPABASE_KEY and "YOUR_" not in SUPABASE_URL)

def now_iso(): return datetime.now(timezone.utc).isoformat()

# --- Models ---
class LoginRequest(BaseModel): passcode: str

# --- Middleware ---
def require_auth(authorization: str = Header(None)):
    if not authorization: raise HTTPException(401, "No Token")
    token = authorization.replace("Bearer ", "").strip()
    if token not in ACTIVE_TOKENS: raise HTTPException(401, "Login Expired")
    return token

# --- Routes ---

# ✅ ROOT ROUTE: Fixes cron-job "404/422" errors
@app.get("/")
async def root():
    return {"status": "online", "message": "Jalaram Server Awake"}

@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    if payload.passcode != AUTH_PASSCODE: raise HTTPException(401)
    token = str(uuid.uuid4())
    ACTIVE_TOKENS[token] = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
    return {"access_token": token, "expires_at": ACTIVE_TOKENS[token]}

@api_router.get("/auth/verify")
async def verify(_=Depends(require_auth)): return {"valid": True}

@api_router.get("/cloud/status")
async def cloud_status(_=Depends(require_auth)):
    return {"provider": "supabase", "enabled": SUPABASE_ENABLED, "mode": "live" if SUPABASE_ENABLED else "fallback"}

# ✅ SETTINGS GET: Returns default if DB is empty
@api_router.get("/settings")
async def get_settings(_=Depends(require_auth)):
    doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    if not doc:
        return {"shop_name": "Jalaram Jewellers", "branches": [{"id":"B1", "name":"Main Branch", "address":"", "map_url":"#", "invoice_upi_id":"", "estimate_upi_id":"", "cash_balance":0, "estimate_bank_balance":0, "invoice_bank_balance":0}], "silver_rate_per_gram": 240, "making_charge_per_gram": 15, "default_hsn": "7113"}
    return doc

# ✅ SETTINGS PUT: This version is more "relaxed" to stop the save errors
@api_router.put("/settings")
async def update_settings(payload: dict, _=Depends(require_auth)):
    try:
        # We use 'dict' instead of a strict model to prevent 422 errors
        await settings_collection.update_one(
            {"key": "app_settings"}, 
            {"$set": {**payload, "updated_at": now_iso()}}, 
            upsert=True
        )
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/bills/next-number")
async def next_num(mode: str, branch_id: str, _=Depends(require_auth)):
    doc = await counters_collection.find_one_and_update(
        {"mode": mode, "branch_id": branch_id}, 
        {"$inc": {"value": 1}}, 
        upsert=True, 
        return_document=ReturnDocument.AFTER
    )
    val = doc.get("value", 1)
    prefix = "INV" if mode == "invoice" else "EST"
    return {"document_number": f"{branch_id}-{prefix}-{val:04d}"}

@api_router.post("/bills/save")
async def save_bill(payload: dict, _=Depends(require_auth)):
    bill_id = str(uuid.uuid4())
    doc = {**payload, "id": bill_id, "created_at": now_iso()}
    await bills_collection.insert_one(doc)
    # Basic Ledger update logic
    if payload.get("is_payment_done"):
        branch_id = payload.get("branch_id")
        method = payload.get("payment_method")
        total = float(payload.get("totals", {}).get("grand_total", 0))
        c, eb, ib = 0.0, 0.0, 0.0
        if method == "Cash": c = total
        elif method in ["UPI", "Card"]:
            if payload.get("mode") == "estimate": eb = total
            else: ib = total
        await settings_collection.update_one({"key": "app_settings", "branches.id": branch_id}, {"$inc": {"branches.$.cash_balance": c, "branches.$.estimate_bank_balance": eb, "branches.$.invoice_bank_balance": ib}})
        await ledger_logs_collection.insert_one({"id": str(uuid.uuid4()), "branch_id": branch_id, "date": now_iso(), "reason": f"Sale {payload.get('document_number')}", "cash_change": c, "estimate_bank_change": eb, "invoice_bank_change": ib})
    return {"document_number": payload.get("document_number"), "message": "Saved"}

@api_router.get("/bills/recent")
async def recent_bills(limit: int = 20, branch_filter: str = "ALL", _=Depends(require_auth)):
    q = {"branch_id": branch_filter} if branch_filter != "ALL" else {}
    return await bills_collection.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)

@api_router.get("/bills/today")
async def today_bills(date: str, branch_id: str, _=Depends(require_auth)):
    return await bills_collection.find({"date": date, "branch_id": branch_id}, {"_id": 0}).to_list(100)

@api_router.get("/settings/ledger/logs")
async def get_logs(branch_id: str, _=Depends(require_auth)):
    return await ledger_logs_collection.find({"branch_id": branch_id}, {"_id": 0}).sort("date", -1).to_list(50)

app.include_router(api_router)
