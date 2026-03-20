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

# --- 🚨 CRITICAL CORS FIX 🚨 ---
# This allows your iPad/Phone to talk to Render from ANY Vercel link
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

# --- Models ---
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

# --- Utilities ---

def supabase_headers(prefer: Optional[str] = "return=representation") -> Dict[str, str]:
    headers = {
        "apikey": supabase_service_role_key,
        "Authorization": f"Bearer {supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer: headers["Prefer"] = prefer
    return headers

async def call_supabase_rest(method: str, path: str, *, params: Optional[Dict[str, str]] = None, payload: Optional[Dict] = None, prefer: Optional[str] = "return=representation") -> Optional[requests.Response]:
    if not SUPABASE_ENABLED: return None
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}"
    def _request(): return requests.request(method=method, url=endpoint, headers=supabase_headers(prefer=prefer), params=params, json=payload, timeout=10)
    try:
        response = await asyncio.to_thread(_request)
        if response.status_code >= 400: return None
        return response
    except Exception: return None

async def reserve_document_number_supabase(mode: str, branch_id: str) -> Optional[int]:
    rpc_response = await call_supabase_rest("POST", "rpc/next_document_number", payload={"p_mode": f"{branch_id}_{mode}"}, prefer=None)
    if rpc_response is not None:
        try:
            rpc_data = rpc_response.json()
            if isinstance(rpc_data, int): return rpc_data
            if isinstance(rpc_data, dict):
                val = rpc_data.get("value") or rpc_data.get("next_value") or rpc_data.get("counter")
                if isinstance(val, int): return val
        except Exception: pass

    get_response = await call_supabase_rest("GET", supabase_counters_table, params={"mode": f"eq.{branch_id}_{mode}", "select": "mode,value", "limit": "1"}, prefer=None)
    if get_response is None: return None
    rows = get_response.json()
    current_value = int(rows[0].get("value", 0)) if rows else 0
    next_value = current_value + 1

    if rows:
        patch_response = await call_supabase_rest("PATCH", supabase_counters_table, params={"mode": f"eq.{branch_id}_{mode}"}, payload={"value": next_value, "updated_at": now_iso()})
        if patch_response is not None: return next_value
    else:
        create_response = await call_supabase_rest("POST", supabase_counters_table, payload={"mode": f"{branch_id}_{mode}", "value": 1, "updated_at": now_iso()})
        if create_response is not None: return 1
    return None

async def suggest_customers_supabase(query: str) -> Optional[List[CustomerRecord]]:
    search = query.strip().replace("*", "")
    response = await call_supabase_rest("GET", supabase_customers_table, params={"select": "id,name,phone,address,email,updated_at", "or": f"(name.ilike.*{search}*,phone.ilike.*{search}*)", "order": "updated_at.desc", "limit": "8"}, prefer=None)
    if response is None: return None
    docs = response.json()
    return [CustomerRecord(id=str(doc.get("id") or uuid.uuid4()), name=doc.get("name", ""), phone=doc.get("phone", ""), address=doc.get("address", ""), email=doc.get("email", ""), updated_at=doc.get("updated_at") or now_iso()) for doc in docs]

async def sync_customer_supabase(customer_doc: Dict) -> None:
    if not SUPABASE_ENABLED: return
    lookup_field = "phone" if customer_doc.get("phone") else "name"
    lookup_value = customer_doc.get(lookup_field, "")
    existing = await call_supabase_rest("GET", supabase_customers_table, params={lookup_field: f"eq.{lookup_value}", "select": "id", "limit": "1"}, prefer=None)
    if existing is not None:
        rows = existing.json()
        if rows:
            await call_supabase_rest("PATCH", supabase_customers_table, params={lookup_field: f"eq.{lookup_value}"}, payload={"name": customer_doc.get("name", ""), "phone": customer_doc.get("phone", ""), "address": customer_doc.get("address", ""), "email": customer_doc.get("email", ""), "updated_at": customer_doc.get("updated_at", now_iso())})
            return
    await call_supabase_rest("POST", supabase_customers_table, payload=customer_doc)

# ✅ UPDATED: Automatic Ledger Update & Log Creation
async def update_ledger(bill: dict, reverse: bool = False):
    multiplier = -1 if reverse else 1
    cash_amt = 0.0
    est_bank_amt = 0.0
    inv_bank_amt = 0.0

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
        split_b = max(0.0, grand_total - split_c)
        cash_amt = split_c
        if mode == "estimate": est_bank_amt = split_b
        else: inv_bank_amt = split_b

    if cash_amt == 0 and est_bank_amt == 0 and inv_bank_amt == 0:
        return

    # 1. Update balances
    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": branch_id},
        {"$inc": {
            "branches.$.cash_balance": cash_amt * multiplier,
            "branches.$.estimate_bank_balance": est_bank_amt * multiplier,
            "branches.$.invoice_bank_balance": inv_bank_amt * multiplier
        }}
    )

    # 2. ✅ AUTO-LOG: Create a record in ledger_logs so it shows up in history!
    log_entry = {
        "id": str(uuid.uuid4()),
        "branch_id": branch_id,
        "date": now_iso(),
        "reason": f"{'CANCELLED: ' if reverse else ''}Sale {bill.get('document_number')} ({bill.get('customer',{}).get('name','Customer')})",
        "cash_change": cash_amt * multiplier,
        "estimate_bank_change": est_bank_amt * multiplier,
        "invoice_bank_change": inv_bank_amt * multiplier
    }
    await ledger_logs_collection.insert_one(log_entry)

def _extract_token(authorization: str) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return authorization.split(" ", 1)[1].strip()

def require_auth(authorization: str = Header(...)) -> str:
    token = _extract_token(authorization)
    expires_at = ACTIVE_TOKENS.get(token)
    if not expires_at: raise HTTPException(status_code=401, detail="Invalid session token")
    expiry = datetime.fromisoformat(expires_at)
    if now_utc() > expiry:
        ACTIVE_TOKENS.pop(token, None)
        raise HTTPException(status_code=401, detail="Session expired")
    return token

async def get_or_create_settings() -> SettingsPayload:
    doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    if doc and "branches" in doc:
        return SettingsPayload(**{k: v for k, v in doc.items() if k not in {"key", "updated_at"}})
    default_settings = SettingsPayload().model_dump()
    await settings_collection.update_one({"key": "app_settings"}, {"$set": {**default_settings, "updated_at": now_iso()}}, upsert=True)
    return SettingsPayload(**default_settings)

async def reserve_document_number(mode: str, branch_id: str) -> str:
    prefix = "INV" if mode == "invoice" else "EST"
    if SUPABASE_ENABLED:
        cloud_value = await reserve_document_number_supabase(mode, branch_id)
        if cloud_value is not None: return f"{branch_id}-{prefix}-{int(cloud_value):04d}"
    
    updated_doc = await counters_collection.find_one_and_update(
        {"mode": mode, "branch_id": branch_id}, {"$inc": {"value": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    serial = int(updated_doc.get("value", 1))
    return f"{branch_id}-{prefix}-{serial:04d}"

def compute_item_amount(item: LineItemPayload, mode: str, settings: SettingsPayload) -> Dict:
    default_rate = settings.silver_rate_per_gram + settings.making_charge_per_gram
    effective_rate = float(item.rate_override) if item.rate_override is not None else default_rate
    quantity = max(float(item.quantity), 1)
    computed = float(item.weight) * effective_rate * quantity if mode == "estimate" else float(item.weight) * effective_rate
    amount = float(item.amount_override) if (item.amount_override is not None and item.amount_override >= 0) else computed
    return {"effective_rate": round(effective_rate, 2), "quantity": round(quantity, 3), "amount": round(amount, 2)}

def compute_totals(payload: BillDraftPayload, settings: SettingsPayload, line_amounts: List[float]) -> BillTotals:
    taxable_amount = round(sum(line_amounts), 2)
    cgst = round(taxable_amount * 0.015, 2) if payload.mode == "invoice" else 0.0
    sgst = round(taxable_amount * 0.015, 2) if payload.mode == "invoice" else 0.0
    igst = 0.0 
    mdr = round((taxable_amount + cgst + sgst + igst) * 0.02, 2) if payload.payment_method == "Card" else 0.0
    base_total = taxable_amount + cgst + sgst + igst + mdr - payload.discount - payload.exchange
    round_off = round(payload.round_off, 2) if payload.round_off is not None else round(round(base_total) - base_total, 2)
    return BillTotals(subtotal=taxable_amount, taxable_amount=taxable_amount, cgst=cgst, sgst=sgst, igst=igst, mdr=mdr, discount=round(payload.discount, 2), exchange=round(payload.exchange, 2), round_off=round_off, grand_total=round(base_total + round_off, 2))

# --- Routes ---

# ✅ UPDATED: Root response is public and simple for CRON-JOB to succeed!
@app.get("/")
async def root():
    return {"status": "online", "message": "Jalaram Jewellers API is awake."}

@api_router.post("/auth/login", response_model=AuthTokenResponse)
async def login(payload: LoginRequest):
    if payload.passcode.strip() != AUTH_PASSCODE: raise HTTPException(status_code=401, detail="Invalid passcode")
    token = str(uuid.uuid4())
    expires_at = now_utc() + timedelta(hours=AUTH_TOKEN_EXPIRY_HOURS)
    ACTIVE_TOKENS[token] = expires_at.isoformat()
    return AuthTokenResponse(access_token=token, expires_at=expires_at.isoformat())

@api_router.get("/auth/verify", response_model=VerifySessionResponse)
async def verify_session(_: str = Depends(require_auth)):
    return VerifySessionResponse(valid=True)

@api_router.get("/cloud/status", response_model=CloudStatusResponse)
async def cloud_status(_: str = Depends(require_auth)):
    return CloudStatusResponse(provider="supabase", enabled=SUPABASE_ENABLED, mode="supabase-live" if SUPABASE_ENABLED else "placeholder")

@api_router.get("/settings", response_model=SettingsPayload)
async def get_settings(_: str = Depends(require_auth)):
    return await get_or_create_settings()

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
    
    log_entry = {
        "id": str(uuid.uuid4()),
        "branch_id": payload.branch_id,
        "date": now_iso(),
        "reason": payload.reason,
        "cash_change": payload.cash_change,
        "estimate_bank_change": payload.estimate_bank_change,
        "invoice_bank_change": payload.invoice_bank_change
    }
    await ledger_logs_collection.insert_one(log_entry)
    return {"message": "Ledger updated", "log": log_entry}

@api_router.put("/settings/balances")
async def update_balances(payload: BalancesPayload, _: str = Depends(require_auth)):
    await settings_collection.update_one(
        {"key": "app_settings", "branches.id": payload.branch_id},
        {"$set": {
            "branches.$.cash_balance": payload.cash_balance,
            "branches.$.estimate_bank_balance": payload.estimate_bank_balance,
            "branches.$.invoice_bank_balance": payload.invoice_bank_balance
        }}
    )
    return {"message": "Ledger balances manually updated"}

@api_router.get("/settings/ledger/logs")
async def get_ledger_logs(branch_id: str = Query(...), _: str = Depends(require_auth)):
    docs = await ledger_logs_collection.find({"branch_id": branch_id}, {"_id": 0}).sort("date", -1).to_list(30)
    return docs

@api_router.get("/bills/next-number", response_model=NumberResponse)
async def get_next_number(mode: Literal["invoice", "estimate"] = Query(...), branch_id: str = Query(...), _: str = Depends(require_auth)):
    prefix = "INV" if mode == "invoice" else "EST"
    if SUPABASE_ENABLED:
        get_response = await call_supabase_rest("GET", supabase_counters_table, params={"mode": f"eq.{branch_id}_{mode}", "select": "value", "limit": "1"}, prefer=None)
        if get_response is not None and get_response.json():
            rows = get_response.json()
            if rows: return NumberResponse(document_number=f"{branch_id}-{prefix}-{int(rows[0].get('value', 0)) + 1:04d}")
        return NumberResponse(document_number=f"{branch_id}-{prefix}-0001")
    
    doc = await counters_collection.find_one({"mode": mode, "branch_id": branch_id})
    next_val = int(doc.get("value", 0)) + 1 if doc else 1
    return NumberResponse(document_number=f"{branch_id}-{prefix}-{next_val:04d}")

@api_router.get("/customers/suggest", response_model=List[CustomerRecord])
async def suggest_customers(query: str = Query(..., min_length=2), _: str = Depends(require_auth)):
    if SUPABASE_ENABLED:
        res = await suggest_customers_supabase(query)
        if res is not None: return res
    regex = {"$regex": re.escape(query.strip()), "$options": "i"}
    docs = await customers_collection.find({"$or": [{"name": regex}, {"phone": regex}]}, {"_id": 0}).sort("updated_at", -1).to_list(8)
    return [CustomerRecord(**doc) for doc in docs]

@api_router.post("/bills/save", response_model=BillSaveResponse)
async def save_bill(payload: BillDraftPayload, _: str = Depends(require_auth)):
    settings = await get_or_create_settings()
    line_entries, line_amounts = [], []
    for idx, item in enumerate(payload.items, start=1):
        computed = compute_item_amount(item, payload.mode, settings)
        line_amounts.append(computed["amount"])
        line_entries.append({**item.model_dump(), "sl_no": idx, "rate": computed["effective_rate"], "amount": computed["amount"]})
    totals = compute_totals(payload, settings, line_amounts)
    
    provided_num = payload.document_number.strip() if payload.document_number else ""
    if provided_num:
        existing = await bills_collection.find_one({"document_number": provided_num})
        if existing: raise HTTPException(status_code=400, detail=f"Bill number '{provided_num}' already exists!")
        doc_num = provided_num
        match = re.search(r'\d+$', doc_num)
        if match:
            new_val = int(match.group())
            await counters_collection.update_one({"mode": payload.mode, "branch_id": payload.branch_id}, {"$set": {"value": new_val}}, upsert=True)
    else: doc_num = await reserve_document_number(payload.mode, payload.branch_id) 
    
    bill_id = str(uuid.uuid4())
    bill_doc = {
        "id": bill_id, "mode": payload.mode, "branch_id": payload.branch_id, "document_number": doc_num, "date": payload.date,
        "customer": {"name": payload.customer_name, "phone": payload.customer_phone, "address": payload.customer_address, "email": payload.customer_email},
        "payment_method": payload.payment_method, "is_payment_done": payload.is_payment_done, 
        "split_cash": payload.split_cash, "split_upi": payload.split_upi,
        "notes": payload.notes, "items": line_entries, "totals": totals.model_dump(), "created_at": now_iso()
    }
    await bills_collection.insert_one(bill_doc)

    if payload.is_payment_done: await update_ledger(bill_doc)
    
    cust_doc = CustomerRecord(name=payload.customer_name, phone=payload.customer_phone, address=payload.customer_address, email=payload.customer_email).model_dump()
    await customers_collection.update_one({"phone": payload.customer_phone} if payload.customer_phone else {"name": payload.customer_name}, {"$set": cust_doc}, upsert=True)
    await sync_customer_supabase(cust_doc)
    return BillSaveResponse(bill_id=bill_id, mode=payload.mode, branch_id=payload.branch_id, document_number=doc_num, date=payload.date, totals=totals, message="Bill saved successfully")

@api_router.put("/bills/{document_number}", response_model=BillSaveResponse)
async def update_bill(document_number: str, payload: BillDraftPayload, _: str = Depends(require_auth)):
    existing_bill = await bills_collection.find_one({"document_number": document_number})
    if not existing_bill: raise HTTPException(status_code=404, detail="Bill not found")

    settings = await get_or_create_settings()
    line_entries, line_amounts = [], []
    for idx, item in enumerate(payload.items, start=1):
        computed = compute_item_amount(item, payload.mode, settings)
        line_amounts.append(computed["amount"])
        line_entries.append({**item.model_dump(), "sl_no": idx, "rate": computed["effective_rate"], "amount": computed["amount"]})
    totals = compute_totals(payload, settings, line_amounts)
    
    update_data = {
        "mode": payload.mode, "branch_id": payload.branch_id, "date": payload.date, "customer": {"name": payload.customer_name, "phone": payload.customer_phone, "address": payload.customer_address, "email": payload.customer_email},
        "payment_method": payload.payment_method, "is_payment_done": payload.is_payment_done, "split_cash": payload.split_cash, "split_upi": payload.split_upi,
        "notes": payload.notes, "items": line_entries, "totals": totals.model_dump(), "updated_at": now_iso()
    }

    if existing_bill.get("is_payment_done"): await update_ledger(existing_bill, reverse=True)
    await bills_collection.update_one({"document_number": document_number}, {"$set": update_data})
    if payload.is_payment_done: await update_ledger(update_data)
    
    cust_doc = CustomerRecord(name=payload.customer_name, phone=payload.customer_phone, address=payload.customer_address, email=payload.customer_email).model_dump()
    await customers_collection.update_one({"phone": payload.customer_phone} if payload.customer_phone else {"name": payload.customer_name}, {"$set": cust_doc}, upsert=True)
    await sync_customer_supabase(cust_doc)
    return BillSaveResponse(bill_id=existing_bill["id"], mode=payload.mode, branch_id=payload.branch_id, document_number=document_number, date=payload.date, totals=totals, message="Bill updated successfully")

@api_router.put("/bills/{document_number}/toggle-payment")
async def toggle_payment_status(document_number: str, payload: PaymentToggle, _: str = Depends(require_auth)):
    existing = await bills_collection.find_one({"document_number": document_number})
    if not existing: raise HTTPException(status_code=404, detail="Bill not found")

    currently_done = existing.get("is_payment_done", False)
    if payload.is_payment_done and not currently_done: await update_ledger(existing)
    elif not payload.is_payment_done and currently_done: await update_ledger(existing, reverse=True)

    await bills_collection.update_one({"document_number": document_number}, {"$set": {"is_payment_done": payload.is_payment_done, "updated_at": now_iso()}})
    return {"message": f"Payment status updated to {payload.is_payment_done}"}

@api_router.delete("/bills/{document_number}")
async def delete_bill(document_number: str, _: str = Depends(require_auth)):
    existing = await bills_collection.find_one({"document_number": document_number})
    if not existing: raise HTTPException(status_code=404, detail="Bill not found")
    if existing.get("is_payment_done"): await update_ledger(existing, reverse=True)
    await bills_collection.delete_one({"document_number": document_number})
    return {"message": f"Bill {document_number} deleted successfully"}

@api_router.get("/bills/recent")
async def recent_bills(limit: int = Query(default=15, ge=1, le=50), search: Optional[str] = Query(None), branch_filter: str = Query("ALL"), _: str = Depends(require_auth)):
    query = {}
    if branch_filter != "ALL": query["branch_id"] = branch_filter
    if search and search.strip():
        regex = {"$regex": re.escape(search.strip()), "$options": "i"}
        search_query = {"$or": [{"document_number": regex}, {"customer.name": regex}, {"customer.phone": regex}]}
        if query: query = {"$and": [query, search_query]}
        else: query = search_query
    return await bills_collection.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

@api_router.get("/bills/today")
async def today_bills(date: str = Query(...), branch_id: str = Query(...), _: str = Depends(require_auth)):
    return await bills_collection.find({"date": date, "branch_id": branch_id}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.post("/bills/reset-counter")
async def reset_counter(payload: ResetCounterRequest, _: str = Depends(require_auth)):
    await counters_collection.update_one({"mode": payload.mode, "branch_id": payload.branch_id}, {"$set": {"value": 0}}, upsert=True)
    return {"message": f"{payload.mode.capitalize()} counter reset successfully"}

@api_router.get("/bills/public/{document_number}")
async def get_public_bill(document_number: str):
    bill = await bills_collection.find_one({"document_number": document_number}, {"_id": 0})
    if not bill: raise HTTPException(status_code=404, detail="Bill not found")
    settings_doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    settings_data = {k: v for k, v in settings_doc.items() if k not in {"key", "updated_at"}} if settings_doc else SettingsPayload().model_dump()
    return {"bill": bill, "settings": settings_data}

@api_router.get("/system/storage")
async def get_storage_stats(_: str = Depends(require_auth)):
    try:
        stats = await db.command("dbstats")
        used_bytes = stats.get("dataSize", 0) 
        quota_bytes = 512 * 1024 * 1024 
        percentage = min(100.0, (used_bytes / quota_bytes) * 100) if quota_bytes > 0 else 0
        return {"used_bytes": used_bytes, "quota_bytes": quota_bytes, "percentage": round(percentage, 2)}
    except Exception: return {"used_bytes": 0, "quota_bytes": 512 * 1024 * 1024, "percentage": 0}

@api_router.get("/bills/export")
async def export_bills(_: str = Depends(require_auth)):
    return await bills_collection.find({}, {"_id": 0}).sort("created_at", -1).to_list(None)

@api_router.delete("/bills/all")
async def delete_all_bills(_: str = Depends(require_auth)):
    result = await bills_collection.delete_many({})
    return {"message": f"Successfully deleted {result.deleted_count} bills.", "deleted_count": result.deleted_count}

app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
