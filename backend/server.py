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

# 🚨 FIX 1: SECURITY SETTINGS (MUST BE AT TOP) 🚨
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

# --- Models ---
class LoginRequest(BaseModel): passcode: str
class AuthTokenResponse(BaseModel): access_token: str; expires_at: str
class BranchDef(BaseModel): 
    id: str; name: str; address: str; map_url: str; 
    invoice_upi_id: str; estimate_upi_id: str; 
    cash_balance: float = 0.0; estimate_bank_balance: float = 0.0; invoice_bank_balance: float = 0.0

class SettingsPayload(BaseModel): 
    shop_name: str = "Jalaram Jewellers"
    tagline: str = "The Silver Specialist"
    phone_numbers: List[str] = ["+91 9583221115"]
    email: str = "jalaramjewellers26@gmail.com"
    branches: List[BranchDef] = []
    silver_rate_per_gram: float = 240.0
    making_charge_per_gram: float = 15.0
    default_hsn: str = "7113"
    formula_note: str = "Total = Wt x (Rate + Making)"

# --- Core Helper ---
def now_iso(): return datetime.now(timezone.utc).isoformat()

async def update_ledger(bill: dict, reverse: bool = False):
    m = -1 if reverse else 1
    method = bill.get("payment_method")
    branch_id = bill.get("branch_id")
    total = float(bill.get("totals", {}).get("grand_total", 0))
    c, eb, ib = 0.0, 0.0, 0.0
    if method == "Cash": c = total
    elif method in ["UPI", "Card"]:
        if bill.get("mode") == "estimate": eb = total
        else: ib = total
    await settings_collection.update_one({"key": "app_settings", "branches.id": branch_id}, {"$inc": {"branches.$.cash_balance": c*m, "branches.$.estimate_bank_balance": eb*m, "branches.$.invoice_bank_balance": ib*m}})
    await ledger_logs_collection.insert_one({"id": str(uuid.uuid4()), "branch_id": branch_id, "date": now_iso(), "reason": f"Sale {bill.get('document_number')}", "cash_change": c*m, "estimate_bank_change": eb*m, "invoice_bank_change": ib*m})

def require_auth(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "").strip()
    if token not in ACTIVE_TOKENS: raise HTTPException(status_code=401, detail="Session Expired")
    return token

# --- Routes ---

# ✅ FIX 2: ROOT ROUTE (FOR CRON-JOB SUCCESS)
@app.get("/")
async def root(): return {"status": "online", "msg": "Jalaram Server Awake"}

@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    if payload.passcode != AUTH_PASSCODE: raise HTTPException(401, "Wrong Passcode")
    token = str(uuid.uuid4())
    ACTIVE_TOKENS[token] = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
    return {"access_token": token, "expires_at": ACTIVE_TOKENS[token]}

@api_router.get("/auth/verify")
async def verify(_=Depends(require_auth)): return {"valid": True}

# ✅ FIX 3: BULLETPROOF SETTINGS ROUTE
@api_router.get("/settings")
async def get_settings(_=Depends(require_auth)):
    doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    if not doc:
        # If DB is empty, return a basic template so the app doesn't crash
        return {
            "shop_name": "Jalaram Jewellers", 
            "branches": [
                {"id": "B1", "name": "Main Branch", "address": "Update in settings", "map_url": "#", "invoice_upi_id": "", "estimate_upi_id": "", "cash_balance": 0, "estimate_bank_balance": 0, "invoice_bank_balance": 0}
            ],
            "silver_rate_per_gram": 240, "making_charge_per_gram": 15, "default_hsn": "7113"
        }
    return doc

@api_router.put("/settings")
async def update_settings(payload: dict, _=Depends(require_auth)):
    await settings_collection.update_one({"key": "app_settings"}, {"$set": {**payload, "updated_at": now_iso()}}, upsert=True)
    return payload

@api_router.post("/settings/ledger/adjust")
async def adjust(payload: dict, _=Depends(require_auth)):
    # Simple adjustment logic
    branch_id = payload.get("branch_id")
    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": branch_id},
        {"$inc": {
            "branches.$.cash_balance": payload.get("cash_change", 0),
            "branches.$.estimate_bank_balance": payload.get("estimate_bank_change", 0),
            "branches.$.invoice_bank_balance": payload.get("invoice_bank_change", 0)
        }}
    )
    log = {**payload, "id": str(uuid.uuid4()), "date": now_iso()}
    await ledger_logs_collection.insert_one(log)
    return {"status": "success"}

@api_router.get("/settings/ledger/logs")
async def get_logs(branch_id: str = Query(...), _=Depends(require_auth)):
    return await ledger_logs_collection.find({"branch_id": branch_id}, {"_id": 0}).sort("date", -1).to_list(50)

@api_router.get("/bills/next-number")
async def next_num(mode: str, branch_id: str, _=Depends(require_auth)):
    doc = await counters_collection.find_one_and_update({"mode": mode, "branch_id": branch_id}, {"$inc": {"value": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    val = doc.get("value", 1)
    prefix = "INV" if mode == "invoice" else "EST"
    return {"document_number": f"{branch_id}-{prefix}-{val:04d}"}

@api_router.post("/bills/save")
async def save_bill(payload: dict, _=Depends(require_auth)):
    bill_id = str(uuid.uuid4())
    doc = {**payload, "id": bill_id, "created_at": now_iso()}
    await bills_collection.insert_one(doc)
    if payload.get("is_payment_done"): await update_ledger(doc)
    return {"document_number": payload.get("document_number"), "message": "Saved"}

app.include_router(api_router)
