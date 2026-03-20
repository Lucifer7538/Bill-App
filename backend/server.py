import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional
import logging
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

# Setup directories and environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

settings_collection = db.shop_settings
customers_collection = db.customers
bills_collection = db.bills
counters_collection = db.number_counters
ledger_logs_collection = db.ledger_logs 

app = FastAPI()

# --- 🚨 FIX 1: CRITICAL CORS SECURITY 🚨 ---
# This MUST be at the top. It allows your iPad/Phone to talk to the server 
# from any of your Vercel links without getting a "Network Error".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

AUTH_TOKEN_EXPIRY_HOURS = 12
ACTIVE_TOKENS: Dict[str, str] = {}
AUTH_PASSCODE = os.environ["AUTH_PASSCODE"]

supabase_url = os.environ.get("SUPABASE_URL", "").strip()
supabase_service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
supabase_customers_table = os.environ.get("SUPABASE_CUSTOMERS_TABLE", "customers").strip() or "customers"
supabase_counters_table = os.environ.get("SUPABASE_COUNTERS_TABLE", "number_counters").strip() or "number_counters"

def _is_placeholder(value: str) -> bool:
    if not value: return True
    markers = ["<", "YOUR_", "CHANGE_ME", "placeholder"]
    return any(marker.lower() in value.lower() for marker in markers)

SUPABASE_ENABLED = bool(
    supabase_url and 
    supabase_service_role_key and 
    not _is_placeholder(supabase_url) and 
    not _is_placeholder(supabase_service_role_key)
)

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def now_iso() -> str:
    return now_utc().isoformat()

# --- Pydantic Models ---

class LoginRequest(BaseModel):
    passcode: str

class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str

class BranchDef(BaseModel):
    id: str
    name: str
    address: str
    map_url: str
    invoice_upi_id: str
    estimate_upi_id: str
    cash_balance: float = 0.0
    estimate_bank_balance: float = 0.0
    invoice_bank_balance: float = 0.0

class SettingsPayload(BaseModel):
    shop_name: str = "Jalaram Jewellers"
    tagline: str = "The Silver Specialist"
    phone_numbers: List[str] = Field(default_factory=lambda: ["+91 9583221115", "+91 9776177296", "+91 7538977527"])
    email: str = "jalaramjewellers26@gmail.com"
    shop_name_color: str = "#000000"
    shop_name_size: int = 26
    shop_name_font: str = "sans-serif"
    shop_name_align: str = "center"
    tagline_color: str = "#475569"
    tagline_size: int = 12
    tagline_font: str = "sans-serif"
    tagline_align: str = "center"
    address_color: str = "#475569"
    address_size: int = 14
    address_font: str = "sans-serif"
    address_align: str = "center"
    phone_color: str = "#475569"
    phone_size: int = 13
    phone_font: str = "sans-serif"
    phone_align: str = "center"
    email_color: str = "#475569"
    email_size: int = 13
    email_font: str = "sans-serif"
    email_align: str = "center"
    gstin: str = "21AAUFJ1925F1ZH"
    silver_rate_per_gram: float = 240.0
    making_charge_per_gram: float = 15.0
    default_hsn: str = "7113"
    formula_note: str = "Line total = Weight × (Silver rate per gram + Making charge per gram)"
    logo_data_url: Optional[str] = None
    about_qr_data_url: Optional[str] = None
    theme_color: str = "#000000"
    branches: List[BranchDef] = Field(default_factory=lambda: [
        BranchDef(id="B1", name="Branch 1 (Old Town)", address="Branch- 1 : Plot No.525, Vivekananda Marg, Near Indian Bank, Old Town, BBSR-2", map_url="https://g.page/r/CVvnomQZn7zxEBE/review", invoice_upi_id="eazypay.0000048595@icici", estimate_upi_id="7538977527@ybl"),
        BranchDef(id="B2", name="Branch 2 (Unit-2)", address="Branch - 2 : Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2, BBSR-9", map_url="#", invoice_upi_id="eazypay.0000048595@icici", estimate_upi_id="7538977527@ybl")
    ])

class LedgerAdjustPayload(BaseModel):
    branch_id: str
    reason: str
    cash_change: float = 0.0
    estimate_bank_change: float = 0.0
    invoice_bank_change: float = 0.0

class BalancesPayload(BaseModel):
    branch_id: str
    cash_balance: float
    estimate_bank_balance: float
    invoice_bank_balance: float

class CustomerRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str = ""
    address: str = ""
    email: str = ""
    updated_at: str = Field(default_factory=now_iso)

class LineItemPayload(BaseModel):
    description: str
    hsn: str = ""
    weight: float = 0
    quantity: float = 1
    rate_override: Optional[float] = None
    amount_override: Optional[float] = None

class BillDraftPayload(BaseModel):
    mode: Literal["invoice", "estimate"]
    branch_id: str = "B1"
    document_number: Optional[str] = None
    date: str
    customer_name: str
    customer_phone: str = ""
    customer_address: str = ""
    customer_email: str = ""
    payment_method: Literal["Cash", "UPI", "Card", "Split"] = "Cash"
    is_payment_done: bool = False
    split_cash: float = 0
    split_upi: float = 0
    discount: float = 0
    exchange: float = 0
    round_off: Optional[float] = None
    notes: str = ""
    items: List[LineItemPayload] = Field(default_factory=list)

class PaymentToggle(BaseModel):
    is_payment_done: bool

class NumberResponse(BaseModel):
    document_number: str

class BillTotals(BaseModel):
    subtotal: float
    taxable_amount: float
    cgst: float
    sgst: float  
    igst: float
    mdr: float
    discount: float
    exchange: float
    round_off: float
    grand_total: float

class BillSaveResponse(BaseModel):
    bill_id: str
    mode: Literal["invoice", "estimate"]
    branch_id: str
    document_number: str
    date: str
    totals: BillTotals
    message: str

class ResetCounterRequest(BaseModel):
    mode: Literal["invoice", "estimate"]
    branch_id: str

class VerifySessionResponse(BaseModel):
    valid: bool

class CloudStatusResponse(BaseModel):
    provider: str
    enabled: bool
    mode: str

# --- Internal Helper Functions ---

async def call_supabase_rest(method: str, path: str, *, params=None, payload=None, prefer="return=representation"):
    if not SUPABASE_ENABLED: return None
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}"
    headers = {"apikey": supabase_service_role_key, "Authorization": f"Bearer {supabase_service_role_key}", "Content-Type": "application/json"}
    if prefer: headers["Prefer"] = prefer
    try:
        def _request(): return requests.request(method=method, url=endpoint, headers=headers, params=params, json=payload, timeout=10)
        response = await asyncio.to_thread(_request)
        return response if response.status_code < 400 else None
    except: return None

# ✅ FIX 2: AUTO-LOGGING SYSTEM
# Every time a sale is made, it now automatically adds a row to Ledger History.
async def update_ledger(bill: dict, reverse: bool = False):
    multiplier = -1 if reverse else 1
    cash_amt, est_bank_amt, inv_bank_amt = 0.0, 0.0, 0.0
    method = bill.get("payment_method", "Cash")
    mode = bill.get("mode", "invoice")
    branch_id = bill.get("branch_id", "B1")
    totals = bill.get("totals", {})
    grand_total = float(totals.get("grand_total", 0.0))

    if method == "Cash":
        cash_amt = grand_total
    elif method in ["UPI", "Card"]:
        if mode == "estimate": est_bank_amt = grand_total
        else: inv_bank_amt = grand_total
    elif method == "Split":
        split_c = float(bill.get("split_cash", 0.0))
        cash_amt = split_c
        bank_part = max(0.0, grand_total - split_c)
        if mode == "estimate": est_bank_amt = bank_part
        else: inv_bank_amt = bank_part

    if cash_amt == 0 and est_bank_amt == 0 and inv_bank_amt == 0: return

    # Update the actual vault balance
    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": branch_id},
        {"$inc": {
            "branches.$.cash_balance": cash_amt * multiplier,
            "branches.$.estimate_bank_balance": est_bank_amt * multiplier,
            "branches.$.invoice_bank_balance": inv_bank_amt * multiplier
        }}
    )

    # Create the automated log row for the UI
    log_entry = {
        "id": str(uuid.uuid4()),
        "branch_id": branch_id,
        "date": now_iso(),
        "reason": f"{'CANCEL: ' if reverse else 'SALE: '} {bill.get('document_number')} ({bill.get('customer', {}).get('name', 'Walk-in')})",
        "cash_change": cash_amt * multiplier,
        "estimate_bank_change": est_bank_amt * multiplier,
        "invoice_bank_change": inv_bank_amt * multiplier
    }
    await ledger_logs_collection.insert_one(log_entry)

def require_auth(authorization: str = Header(...)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token missing")
    token = authorization.split(" ", 1)[1].strip()
    if token not in ACTIVE_TOKENS: raise HTTPException(status_code=401, detail="Session expired")
    return token

async def get_or_create_settings() -> SettingsPayload:
    doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    if doc and "branches" in doc: return SettingsPayload(**doc)
    default_settings = SettingsPayload().model_dump()
    await settings_collection.update_one({"key": "app_settings"}, {"$set": {**default_settings, "updated_at": now_iso()}}, upsert=True)
    return SettingsPayload(**default_settings)

async def reserve_document_number(mode: str, branch_id: str) -> str:
    prefix = "INV" if mode == "invoice" else "EST"
    updated_doc = await counters_collection.find_one_and_update(
        {"mode": mode, "branch_id": branch_id}, {"$inc": {"value": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    serial = int(updated_doc.get("value", 1))
    return f"{branch_id}-{prefix}-{serial:04d}"

# --- API Routes ---

# ✅ FIX 3: PUBLIC ROOT PATH
# This fixes the "404 Not Found" error in your Cron-Job and keeps the server awake.
@app.get("/")
async def root():
    return {"status": "online", "server": "Jalaram-Backend-V3", "message": "Awake and Ready"}

@api_router.post("/auth/login", response_model=AuthTokenResponse)
async def login(payload: LoginRequest):
    if payload.passcode.strip() != AUTH_PASSCODE: raise HTTPException(status_code=401, detail="Invalid passcode")
    token = str(uuid.uuid4())
    expires_at = now_utc() + timedelta(hours=AUTH_TOKEN_EXPIRY_HOURS)
    ACTIVE_TOKENS[token] = expires_at.isoformat()
    return AuthTokenResponse(access_token=token, expires_at=expires_at.isoformat())

@api_router.get("/auth/verify", response_model=VerifySessionResponse)
async def verify_session(_: str = Depends(require_auth)): return VerifySessionResponse(valid=True)

@api_router.get("/cloud/status", response_model=CloudStatusResponse)
async def cloud_status(_: str = Depends(require_auth)):
    return CloudStatusResponse(provider="supabase", enabled=SUPABASE_ENABLED, mode="live" if SUPABASE_ENABLED else "local-only")

@api_router.get("/settings", response_model=SettingsPayload)
async def get_settings(_: str = Depends(require_auth)): return await get_or_create_settings()

@api_router.put("/settings", response_model=SettingsPayload)
async def update_settings(payload: SettingsPayload, _: str = Depends(require_auth)):
    await settings_collection.update_one({"key": "app_settings"}, {"$set": {**payload.model_dump(), "updated_at": now_iso()}}, upsert=True)
    return payload

@api_router.post("/settings/ledger/adjust")
async def adjust_ledger(payload: LedgerAdjustPayload, _: str = Depends(require_auth)):
    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": payload.branch_id},
        {"$inc": {
            "branches.$.cash_balance": payload.cash_change,
            "branches.$.estimate_bank_balance": payload.estimate_bank_change,
            "branches.$.invoice_bank_balance": payload.invoice_bank_change
        }}
    )
    log_entry = {"id": str(uuid.uuid4()), "branch_id": payload.branch_id, "date": now_iso(), "reason": payload.reason, "cash_change": payload.cash_change, "estimate_bank_change": payload.estimate_bank_change, "invoice_bank_change": payload.invoice_bank_change}
    await ledger_logs_collection.insert_one(log_entry)
    return {"message": "Adjusted", "log": log_entry}

@api_router.put("/settings/balances")
async def update_balances(payload: BalancesPayload, _: str = Depends(require_auth)):
    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": payload.branch_id},
        {"$set": {"branches.$.cash_balance": payload.cash_balance, "branches.$.estimate_bank_balance": payload.estimate_bank_balance, "branches.$.invoice_bank_balance": payload.invoice_bank_balance}}
    )
    return {"message": "Balances set"}

@api_router.get("/settings/ledger/logs")
async def get_ledger_logs(branch_id: str = Query(...), _: str = Depends(require_auth)):
    return await ledger_logs_collection.find({"branch_id": branch_id}, {"_id": 0}).sort("date", -1).to_list(50)

@api_router.get("/bills/next-number", response_model=NumberResponse)
async def get_next_number(mode: str = Query(...), branch_id: str = Query(...), _: str = Depends(require_auth)):
    num_str = await reserve_document_number(mode, branch_id)
    return NumberResponse(document_number=num_str)

@api_router.get("/customers/suggest", response_model=List[CustomerRecord])
async def suggest_customers(query: str = Query(..., min_length=2), _: str = Depends(require_auth)):
    regex = {"$regex": re.escape(query.strip()), "$options": "i"}
    docs = await customers_collection.find({"$or": [{"name": regex}, {"phone": regex}]}, {"_id": 0}).sort("updated_at", -1).to_list(8)
    return [CustomerRecord(**doc) for doc in docs]

@api_router.post("/bills/save", response_model=BillSaveResponse)
async def save_bill(payload: BillDraftPayload, _: str = Depends(require_auth)):
    settings = await get_or_create_settings()
    doc_num = payload.document_number or await reserve_document_number(payload.mode, payload.branch_id)
    
    # Simple totals calc
    subtotal = sum(float(i.amount_override if i.amount_override is not None else (i.weight * (settings.silver_rate_per_gram + settings.making_charge_per_gram))) for i in payload.items)
    cgst = round(subtotal * 0.015, 2) if payload.mode == "invoice" else 0.0
    sgst = round(subtotal * 0.015, 2) if payload.mode == "invoice" else 0.0
    grand_total = round(subtotal + cgst + sgst - payload.discount - payload.exchange + (payload.round_off or 0), 2)
    
    totals = BillTotals(subtotal=subtotal, taxable_amount=subtotal, cgst=cgst, sgst=sgst, igst=0, mdr=0, discount=payload.discount, exchange=payload.exchange, round_off=payload.round_off or 0, grand_total=grand_total)

    bill_doc = {
        "id": str(uuid.uuid4()), "mode": payload.mode, "branch_id": payload.branch_id, "document_number": doc_num, "date": payload.date,
        "customer": {"name": payload.customer_name, "phone": payload.customer_phone, "address": payload.customer_address, "email": payload.customer_email},
        "payment_method": payload.payment_method, "is_payment_done": payload.is_payment_done, "split_cash": payload.split_cash, "split_upi": payload.split_upi,
        "totals": totals.model_dump(), "created_at": now_iso(), "items": [i.model_dump() for i in payload.items]
    }
    await bills_collection.insert_one(bill_doc)
    if payload.is_payment_done: await update_ledger(bill_doc)
    
    cust_data = CustomerRecord(name=payload.customer_name, phone=payload.customer_phone, address=payload.customer_address, email=payload.customer_email).model_dump()
    await customers_collection.update_one({"phone": payload.customer_phone} if payload.customer_phone else {"name": payload.customer_name}, {"$set": cust_data}, upsert=True)
    return BillSaveResponse(bill_id=bill_doc["id"], mode=payload.mode, branch_id=payload.branch_id, document_number=doc_num, date=payload.date, totals=totals, message="Success")

@api_router.get("/bills/recent")
async def recent_bills(limit: int = 20, branch_filter: str = "ALL", _: str = Depends(require_auth)):
    q = {"branch_id": branch_filter} if branch_filter != "ALL" else {}
    return await bills_collection.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)

@api_router.get("/bills/today")
async def today_bills(date: str = Query(...), branch_id: str = Query(...), _: str = Depends(require_auth)):
    return await bills_collection.find({"date": date, "branch_id": branch_id}, {"_id": 0}).to_list(100)

@api_router.delete("/bills/{document_number}")
async def delete_bill(document_number: str, _: str = Depends(require_auth)):
    existing = await bills_collection.find_one({"document_number": document_number})
    if existing and existing.get("is_payment_done"): await update_ledger(existing, reverse=True)
    await bills_collection.delete_one({"document_number": document_number})
    return {"message": "Deleted"}

@api_router.get("/system/storage")
async def get_storage_stats(_: str = Depends(require_auth)):
    try:
        stats = await db.command("dbstats")
        used = stats.get("dataSize", 0)
        return {"used_bytes": used, "quota_bytes": 512*1024*1024, "percentage": round((used/(512*1024*1024))*100, 2)}
    except: return {"used_bytes": 0, "quota_bytes": 512*1024*1024, "percentage": 0}

app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()
