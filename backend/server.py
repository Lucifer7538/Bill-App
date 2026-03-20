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

# --- 🚨 MASTER FIX 1: SECURITY (CORS) 🚨 ---
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

# --- Supabase Logic ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ENABLED = bool(SUPABASE_URL and SUPABASE_KEY and "YOUR_" not in SUPABASE_URL)

def now_iso(): return datetime.now(timezone.utc).isoformat()

# --- Middleware Helper ---
def require_auth(authorization: str = Header(None)):
    if not authorization: raise HTTPException(401, "No Token")
    token = authorization.replace("Bearer ", "").strip()
    if token not in ACTIVE_TOKENS: raise HTTPException(401, "Session Expired")
    return token

# --- Automated Ledger Logging ---
async def update_ledger(bill: dict, reverse: bool = False):
    m = -1 if reverse else 1
    method, mode, branch_id = bill.get("payment_method"), bill.get("mode"), bill.get("branch_id")
    total = float(bill.get("totals", {}).get("grand_total", 0))
    c, eb, ib = 0.0, 0.0, 0.0
    
    if method == "Cash": c = total
    elif method in ["UPI", "Card"]:
        if mode == "estimate": eb = total
        else: ib = total
    elif method == "Split":
        c = float(bill.get("split_cash", 0))
        if mode == "estimate": eb = total - c
        else: ib = total - c

    if c == 0 and eb == 0 and ib == 0: return

    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": branch_id},
        {"$inc": {"branches.$.cash_balance": c*m, "branches.$.estimate_bank_balance": eb*m, "branches.$.invoice_bank_balance": ib*m}}
    )
    await ledger_logs_collection.insert_one({
        "id": str(uuid.uuid4()), "branch_id": branch_id, "date": now_iso(),
        "reason": f"{'REFUND' if reverse else 'SALE'}: {bill.get('document_number')}",
        "cash_change": c*m, "estimate_bank_change": eb*m, "invoice_bank_change": ib*m
    })

# --- Routes ---

# ✅ MASTER FIX 2: CRON-JOB WAKEUP
@app.get("/")
async def wakeup(): return {"status": "online", "message": "Jalaram Server Awake"}

@api_router.post("/auth/login")
async def login(payload: dict):
    if payload.get("passcode") != AUTH_PASSCODE: raise HTTPException(401)
    t = str(uuid.uuid4())
    ACTIVE_TOKENS[t] = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
    return {"access_token": t, "expires_at": ACTIVE_TOKENS[t]}

@api_router.get("/auth/verify")
async def verify(_=Depends(require_auth)): return {"valid": True}

@api_router.get("/cloud/status")
async def cloud_status(_=Depends(require_auth)):
    return {"provider": "supabase", "enabled": SUPABASE_ENABLED, "mode": "live" if SUPABASE_ENABLED else "fallback"}

@api_router.get("/settings")
async def get_settings(_=Depends(require_auth)):
    doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    if not doc: return {"shop_name": "Jalaram Jewellers", "branches": [{"id":"B1", "name":"Main Branch", "address":"", "map_url":"#", "invoice_upi_id":"", "estimate_upi_id":"", "cash_balance":0, "estimate_bank_balance":0, "invoice_bank_balance":0}]}
    return doc

@api_router.put("/settings")
async def update_settings(payload: dict, _=Depends(require_auth)):
    await settings_collection.update_one({"key": "app_settings"}, {"$set": {**payload, "updated_at": now_iso()}}, upsert=True)
    return payload

@api_router.put("/settings/balances")
async def set_balances(payload: dict, _=Depends(require_auth)):
    await settings_collection.update_one({"key": "app_settings", "branches.id": payload.get("branch_id")}, {"$set": {"branches.$.cash_balance": payload.get("cash_balance"), "branches.$.estimate_bank_balance": payload.get("estimate_bank_balance"), "branches.$.invoice_bank_balance": payload.get("invoice_bank_balance")}})
    return {"status": "ok"}

@api_router.post("/settings/ledger/adjust")
async def adjust(payload: dict, _=Depends(require_auth)):
    branch_id = payload.get("branch_id")
    await settings_collection.update_one({"key": "app_settings", "branches.id": branch_id}, {"$inc": {"branches.$.cash_balance": payload.get("cash_change", 0), "branches.$.estimate_bank_balance": payload.get("estimate_bank_change", 0), "branches.$.invoice_bank_balance": payload.get("invoice_bank_change", 0)}})
    await ledger_logs_collection.insert_one({**payload, "id": str(uuid.uuid4()), "date": now_iso()})
    return {"status": "ok"}

@api_router.get("/settings/ledger/logs")
async def get_logs(branch_id: str = Query(...), _=Depends(require_auth)):
    return await ledger_logs_collection.find({"branch_id": branch_id}, {"_id": 0}).sort("date", -1).to_list(50)

@api_router.get("/bills/next-number")
async def next_num(mode: str, branch_id: str, _=Depends(require_auth)):
    doc = await counters_collection.find_one_and_update({"mode": mode, "branch_id": branch_id}, {"$inc": {"value": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    val, p = doc.get("value", 1), ("INV" if mode == "invoice" else "EST")
    return {"document_number": f"{branch_id}-{p}-{val:04d}"}

@api_router.post("/bills/save")
async def save_bill(payload: dict, _=Depends(require_auth)):
    bill_id = str(uuid.uuid4())
    doc = {**payload, "id": bill_id, "created_at": now_iso()}
    await bills_collection.insert_one(doc)
    if payload.get("is_payment_done"): await update_ledger(doc)
    return {"document_number": payload.get("document_number"), "message": "Saved"}

@api_router.put("/bills/{document_number}")
async def update_bill(document_number: str, payload: dict, _=Depends(require_auth)):
    existing = await bills_collection.find_one({"document_number": document_number})
    if existing and existing.get("is_payment_done"): await update_ledger(existing, reverse=True)
    await bills_collection.update_one({"document_number": document_number}, {"$set": {**payload, "updated_at": now_iso()}})
    if payload.get("is_payment_done"): await update_ledger(payload)
    return {"message": "Updated"}

@api_router.put("/bills/{document_number}/toggle-payment")
async def toggle_pay(document_number: str, payload: dict, _=Depends(require_auth)):
    bill = await bills_collection.find_one({"document_number": document_number})
    new_status = payload.get("is_payment_done")
    if new_status and not bill.get("is_payment_done"): await update_ledger(bill)
    elif not new_status and bill.get("is_payment_done"): await update_ledger(bill, reverse=True)
    await bills_collection.update_one({"document_number": document_number}, {"$set": {"is_payment_done": new_status}})
    return {"message": "Toggled"}

@api_router.delete("/bills/{document_number}")
async def delete_bill(document_number: str, _=Depends(require_auth)):
    bill = await bills_collection.find_one({"document_number": document_number})
    if bill and bill.get("is_payment_done"): await update_ledger(bill, reverse=True)
    await bills_collection.delete_one({"document_number": document_number})
    return {"message": "Deleted"}

@api_router.get("/bills/recent")
async def recent(limit: int = 20, branch_filter: str = "ALL", _=Depends(require_auth)):
    q = {"branch_id": branch_filter} if branch_filter != "ALL" else {}
    return await bills_collection.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)

@api_router.get("/bills/today")
async def today(date: str, branch_id: str, _=Depends(require_auth)):
    return await bills_collection.find({"date": date, "branch_id": branch_id}, {"_id": 0}).to_list(100)

@api_router.get("/customers/suggest")
async def suggest(query: str = Query(...), _=Depends(require_auth)):
    regex = {"$regex": re.escape(query.strip()), "$options": "i"}
    return await customers_collection.find({"$or": [{"name": regex}, {"phone": regex}]}, {"_id": 0}).to_list(8)

@api_router.get("/system/storage")
async def storage(_=Depends(require_auth)):
    try:
        s = await db.command("dbstats")
        u = s.get("dataSize", 0)
        return {"used_bytes": u, "quota_bytes": 512*1024*1024, "percentage": round((u/(512*1024*1024))*100, 2)}
    except: return {"used_bytes": 0, "quota_bytes": 512*1024*1024, "percentage": 0}

@api_router.get("/bills/public/{document_number}")
async def get_public(document_number: str):
    bill = await bills_collection.find_one({"document_number": document_number}, {"_id": 0})
    settings = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    return {"bill": bill, "settings": settings}

app.include_router(api_router)
