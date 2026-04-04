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
from pymongo import ReturnDocument
import requests
from fastapi.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

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

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ENABLED = bool(SUPABASE_URL and SUPABASE_KEY and "YOUR_" not in SUPABASE_URL)

def now_iso(): return datetime.now(timezone.utc).isoformat()

def safe_float(val):
    if val is None or val == "": return 0.0
    try: return float(val)
    except (ValueError, TypeError): return 0.0

# --- HELPER FUNCTIONS FOR BULLETPROOF DATA EXTRACTION ---
def get_val(data: dict, keys: List[str]):
    """Safely extracts loyalty/credit values whether they are at root or nested in totals/loyalty objects."""
    for k in keys:
        if k in data and data[k] not in [None, ""]: return safe_float(data[k])
    if "totals" in data and isinstance(data["totals"], dict):
        for k in keys:
            if k in data["totals"] and data["totals"][k] not in [None, ""]: return safe_float(data["totals"][k])
    if "loyalty" in data and isinstance(data["loyalty"], dict):
        for k in keys:
            if k in data["loyalty"] and data["loyalty"][k] not in [None, ""]: return safe_float(data["loyalty"][k])
    return 0.0

def get_customer_info(data: dict):
    """Safely extracts customer info whether at root or nested."""
    name = data.get("customer_name", "")
    phone = data.get("customer_phone", "")
    addr = data.get("customer_address", "")
    email = data.get("customer_email", "")
    
    if "customer" in data and isinstance(data["customer"], dict):
        if not name: name = data["customer"].get("name", "")
        if not phone: phone = data["customer"].get("phone", "")
        if not addr: addr = data["customer"].get("address", "")
        if not email: email = data["customer"].get("email", "")
        
    return str(name).strip(), str(phone).strip(), str(addr).strip(), str(email).strip()
# -----------------------------------------------------------

def get_bill_ledger_values(bill: dict):
    c, eb, ib = 0.0, 0.0, 0.0
    mode = bill.get("mode")
    tx_type = bill.get("tx_type", "sale")

    def add_vals(method, amount, split_c):
        nonlocal c, eb, ib
        if method == "Cash": c += amount
        elif method in ["UPI", "Card"]:
            if mode == "estimate": eb += amount
            else: ib += amount
        elif method == "Split":
            c += split_c
            if mode == "estimate": eb += (amount - split_c)
            else: ib += (amount - split_c)

    if tx_type == "sale":
        if bill.get("is_payment_done"):
            total = safe_float(bill.get("totals", {}).get("grand_total", 0))
            add_vals(bill.get("payment_method"), total, safe_float(bill.get("split_cash", 0)))
    else:
        if bill.get("is_advance_paid"):
            add_vals(bill.get("advance_method"), safe_float(bill.get("advance_amount", 0)), safe_float(bill.get("advance_split_cash", 0)))
        if bill.get("is_balance_paid"):
            total = safe_float(bill.get("totals", {}).get("grand_total", 0))
            adv = safe_float(bill.get("advance_amount", 0))
            bal = max(0.0, total - adv)
            add_vals(bill.get("balance_method"), bal, safe_float(bill.get("balance_split_cash", 0)))
    return c, eb, ib

async def apply_ledger_diff(branch_id: str, diff_c: float, diff_eb: float, diff_ib: float, reason: str):
    if diff_c == 0 and diff_eb == 0 and diff_ib == 0: return
    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": branch_id},
        {"$inc": {"branches.$.cash_balance": diff_c, "branches.$.estimate_bank_balance": diff_eb, "branches.$.invoice_bank_balance": diff_ib}}
    )
    await ledger_logs_collection.insert_one({
        "id": str(uuid.uuid4()), "branch_id": branch_id, "date": now_iso(),
        "reason": reason, "cash_change": diff_c, "estimate_bank_change": diff_eb, "invoice_bank_change": diff_ib
    })

def require_auth(authorization: str = Header(None)):
    if not authorization: raise HTTPException(401, "No Token")
    token = authorization.replace("Bearer ", "").strip()
    if token not in ACTIVE_TOKENS: raise HTTPException(401, "Login Expired")
    return token

@app.get("/")
async def root(): return {"status": "online", "server": "Jalaram-Master-V12", "msg": "Backend is awake"}

@api_router.post("/auth/login")
async def login(payload: dict):
    if str(payload.get("passcode")) != str(AUTH_PASSCODE): raise HTTPException(401)
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
    if not doc:
        return {"shop_name": "Jalaram Jewellers", "branches": [{"id":"B1", "name":"Main Branch", "address":"", "location_url":"", "map_url":"#", "invoice_upi_id":"", "estimate_upi_id":"", "gstin":"", "cash_balance":0, "estimate_bank_balance":0, "invoice_bank_balance":0}]}
    return doc

@api_router.put("/settings")
async def update_settings(payload: dict, _=Depends(require_auth)):
    await settings_collection.update_one({"key": "app_settings"}, {"$set": {**payload, "updated_at": now_iso()}}, upsert=True)
    return payload

@api_router.put("/settings/balances")
async def set_balances(payload: dict, _=Depends(require_auth)):
    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": payload.get("branch_id")},
        {"$set": {"branches.$.cash_balance": payload.get("cash_balance"), "branches.$.estimate_bank_balance": payload.get("estimate_bank_balance"), "branches.$.invoice_bank_balance": payload.get("invoice_bank_balance")}}
    )
    return {"status": "success"}

@api_router.post("/settings/ledger/adjust")
async def adjust(payload: dict, _=Depends(require_auth)):
    try:
        branch_id = payload.get("branch_id")
        await settings_collection.update_one(
            {"key": "app_settings", "branches.id": branch_id},
            {"$inc": {"branches.$.cash_balance": payload.get("cash_change", 0), "branches.$.estimate_bank_balance": payload.get("estimate_bank_change", 0), "branches.$.invoice_bank_balance": payload.get("invoice_bank_change", 0)}}
        )
        await ledger_logs_collection.insert_one({**payload, "id": str(uuid.uuid4()), "date": now_iso()})
        return {"status": "success"}
    except Exception as e: raise HTTPException(500, detail=str(e))

@api_router.get("/settings/ledger/logs")
async def get_logs(branch_id: str = Query(...), _=Depends(require_auth)):
    return await ledger_logs_collection.find({"branch_id": branch_id}, {"_id": 0}).sort("date", -1).to_list(50)

@api_router.get("/bills/next-number")
async def next_num(mode: str, branch_id: str, _=Depends(require_auth)):
    doc = await counters_collection.find_one({"mode": mode, "branch_id": branch_id})
    val = (doc.get("value", 0) if doc else 0) + 1
    prefix = "INV" if mode == "invoice" else "EST"
    return {"document_number": f"{branch_id}-{prefix}-{val:04d}"}

@api_router.post("/bills/reset-counter")
async def reset_counter(payload: dict, _=Depends(require_auth)):
    try:
        mode = payload.get("mode")
        branch_id = payload.get("branch_id")
        await counters_collection.update_one({"mode": mode, "branch_id": branch_id}, {"$set": {"value": 0}}, upsert=True)
        return {"message": "Counter reset successfully"}
    except Exception as e: raise HTTPException(500, detail=str(e))

@api_router.post("/bills/save")
async def save_bill(payload: dict, _=Depends(require_auth)):
    bill_id = str(uuid.uuid4())
    doc_num = payload.get("document_number", "")
    mode = payload.get("mode")
    branch_id = payload.get("branch_id")

    match = re.search(r'\d+$', doc_num)
    if match:
        new_val = int(match.group())
        await counters_collection.update_one({"mode": mode, "branch_id": branch_id}, {"$set": {"value": new_val}}, upsert=True)

    c_name, c_phone, c_addr, c_email = get_customer_info(payload)
    
    earned_pts = get_val(payload, ["earned_points", "loyalty_earned", "earned_loyalty"])
    redeemed_pts = get_val(payload, ["redeemed_points", "loyalty_redeemed", "redeemed_loyalty"])
    points_diff = earned_pts - redeemed_pts

    saved_credit = get_val(payload, ["saved_credit", "credit_saved", "earned_credit", "store_credit"])
    applied_credit = get_val(payload, ["applied_credit", "credit_applied", "used_credit", "redeemed_credit"])
    credit_diff = saved_credit - applied_credit

    if c_name or c_phone:
        query = {"phone": c_phone} if c_phone else {"name": c_name}
        await customers_collection.update_one(
            query,
            {
                "$set": {
                    "name": c_name, "phone": c_phone,
                    "address": c_addr,
                    "email": c_email,
                    "updated_at": now_iso()
                },
                "$inc": {
                    "points": points_diff,
                    "loyalty_points": points_diff,
                    "credit": credit_diff, 
                    "store_credit": credit_diff
                }
            },
            upsert=True
        )

    doc = {**payload, "id": bill_id, "created_at": now_iso()}
    await bills_collection.insert_one(doc)
    c, eb, ib = get_bill_ledger_values(doc)
    await apply_ledger_diff(branch_id, c, eb, ib, f"{doc.get('tx_type', 'sale').upper()}: {doc_num}")
    return {"id": bill_id, "document_number": doc_num}

@api_router.put("/bills/update-by-id/{bill_id}")
async def update_bill_by_id(bill_id: str, payload: dict, _=Depends(require_auth)):
    existing = await bills_collection.find_one({"id": bill_id})
    if not existing: raise HTTPException(404, "Bill ID not found")

    doc_num = payload.get("document_number", "")
    match = re.search(r'\d+$', doc_num)
    if match:
        new_val = int(match.group())
        await counters_collection.update_one({"mode": payload.get("mode"), "branch_id": payload.get("branch_id")}, {"$set": {"value": new_val}}, upsert=True)

    old_earned = get_val(existing, ["earned_points", "loyalty_earned", "earned_loyalty"])
    old_redeemed = get_val(existing, ["redeemed_points", "loyalty_redeemed", "redeemed_loyalty"])
    new_earned = get_val(payload, ["earned_points", "loyalty_earned", "earned_loyalty"])
    new_redeemed = get_val(payload, ["redeemed_points", "loyalty_redeemed", "redeemed_loyalty"])
    points_diff = (new_earned - old_earned) - (new_redeemed - old_redeemed)

    old_saved = get_val(existing, ["saved_credit", "credit_saved", "earned_credit", "store_credit"])
    old_applied = get_val(existing, ["applied_credit", "credit_applied", "used_credit", "redeemed_credit"])
    new_saved = get_val(payload, ["saved_credit", "credit_saved", "earned_credit", "store_credit"])
    new_applied = get_val(payload, ["applied_credit", "credit_applied", "used_credit", "redeemed_credit"])
    credit_diff = (new_saved - old_saved) - (new_applied - old_applied)

    c_name, c_phone, c_addr, c_email = get_customer_info(payload)
    
    if c_name or c_phone:
        query = {"phone": c_phone} if c_phone else {"name": c_name}
        await customers_collection.update_one(
            query,
            {
                "$set": {
                    "name": c_name, "phone": c_phone,
                    "address": c_addr,
                    "email": c_email,
                    "updated_at": now_iso()
                },
                "$inc": {
                    "points": points_diff,
                    "loyalty_points": points_diff,
                    "credit": credit_diff,
                    "store_credit": credit_diff
                }
            },
            upsert=True
        )

    old_b = existing.get("branch_id")
    new_b = payload.get("branch_id")
    old_c, old_eb, old_ib = get_bill_ledger_values(existing)
    new_c, new_eb, new_ib = get_bill_ledger_values(payload)

    if old_b == new_b:
        await apply_ledger_diff(new_b, new_c - old_c, new_eb - old_eb, new_ib - old_ib, f"UPDATE: {doc_num}")
    else:
        await apply_ledger_diff(old_b, -old_c, -old_eb, -old_ib, f"MIGRATE OUT: {existing.get('document_number')}")
        await apply_ledger_diff(new_b, new_c, new_eb, new_ib, f"MIGRATE IN: {doc_num}")

    await bills_collection.update_one({"id": bill_id}, {"$set": {**payload, "updated_at": now_iso()}})
    return {"message": "Update Successful"}

@api_router.put("/bills/{document_number}/toggle-payment")
async def toggle_pay(document_number: str, payload: dict, _=Depends(require_auth)):
    try:
        bill = await bills_collection.find_one({"document_number": document_number})
        if not bill: raise HTTPException(404, "Bill not found")
        if bill.get("tx_type") in ["booking", "service"]: raise HTTPException(400, "Please click Edit to manage Booking or Service balances.")
        old_c, old_eb, old_ib = get_bill_ledger_values(bill)
        new_status = payload.get("is_payment_done")
        bill["is_payment_done"] = new_status
        new_c, new_eb, new_ib = get_bill_ledger_values(bill)
        await apply_ledger_diff(bill.get("branch_id"), new_c - old_c, new_eb - old_eb, new_ib - old_ib, f"TOGGLE: {document_number}")
        await bills_collection.update_one({"document_number": document_number}, {"$set": {"is_payment_done": new_status}})
        return {"message": "Payment Status Toggled"}
    except Exception as e: raise HTTPException(500, detail=str(e))

@api_router.delete("/bills/{document_number}")
async def delete_bill(document_number: str, _=Depends(require_auth)):
    bill = await bills_collection.find_one({"document_number": document_number})
    if bill:
        c, eb, ib = get_bill_ledger_values(bill)
        await apply_ledger_diff(bill.get("branch_id"), -c, -eb, -ib, f"DELETE/REFUND: {document_number}")
        
        earned_pts = get_val(bill, ["earned_points", "loyalty_earned", "earned_loyalty"])
        redeemed_pts = get_val(bill, ["redeemed_points", "loyalty_redeemed", "redeemed_loyalty"])
        points_revert = redeemed_pts - earned_pts 

        saved_credit = get_val(bill, ["saved_credit", "credit_saved", "earned_credit", "store_credit"])
        applied_credit = get_val(bill, ["applied_credit", "credit_applied", "used_credit", "redeemed_credit"])
        credit_revert = applied_credit - saved_credit

        c_name, c_phone, _, _ = get_customer_info(bill)
        if c_name or c_phone:
            query = {"phone": c_phone} if c_phone else {"name": c_name}
            await customers_collection.update_one(
                query, 
                {"$inc": {
                    "points": points_revert,
                    "loyalty_points": points_revert,
                    "credit": credit_revert,
                    "store_credit": credit_revert
                }}
            )

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

# --- NEW SYNC ROUTE (SECURITY TEMPORARILY REMOVED) ---
@api_router.post("/system/sync-old-points")
async def sync_old_points():
    await customers_collection.update_many(
        {}, 
        {"$set": {"points": 0, "loyalty_points": 0, "credit": 0, "store_credit": 0}}
    )
    
    bills = await bills_collection.find({}).to_list(None)
    updated_count = 0
    
    for bill in bills:
        c_name, c_phone, _, _ = get_customer_info(bill)
        
        if not c_name and not c_phone: 
            continue
            
        earned = get_val(bill, ["earned_points", "loyalty_earned", "earned_loyalty"])
        redeemed = get_val(bill, ["redeemed_points", "loyalty_redeemed", "redeemed_loyalty"])
        saved_cred = get_val(bill, ["saved_credit", "credit_saved", "earned_credit", "store_credit"])
        applied_cred = get_val(bill, ["applied_credit", "credit_applied", "used_credit", "redeemed_credit"])
        
        points_to_add = earned - redeemed
        credit_to_add = saved_cred - applied_cred
        
        if points_to_add != 0 or credit_to_add != 0:
            query = {"phone": c_phone} if c_phone else {"name": c_name}
            await customers_collection.update_one(
                query,
                {"$inc": {
                    "points": points_to_add,
                    "loyalty_points": points_to_add,
                    "credit": credit_to_add,
                    "store_credit": credit_to_add
                }},
                upsert=True
            )
            updated_count += 1
            
    return {"message": f"Successfully synced points from {updated_count} old bills to customer profiles!"}
# ----------------------------------------------------

app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()
