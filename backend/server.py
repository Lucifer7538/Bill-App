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
from starlette.middleware.cors import CORSMiddleware

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

app = FastAPI()
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

class LoginRequest(BaseModel):
    passcode: str

class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str

class SettingsPayload(BaseModel):
    shop_name: str = "Jalaram Jewellers"
    tagline: str = "The Silver Specialist"
    address: str = "Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2 BBSR-9"
    phone_numbers: List[str] = Field(default_factory=lambda: ["+91 9583221115", "+91 9776177296", "+91 7538977527"])
    email: str = "jalaramjewellers26@gmail.com"
    gstin: str = "21AAUFJ1925F1ZH"
    silver_rate_per_10g: float = 1200.0
    making_charge_per_gram: float = 80.0
    formula_note: str = "Line total = Weight × ((Silver rate per 10g / 10) + Making charge per gram)"
    logo_data_url: Optional[str] = None
    about_qr_data_url: Optional[str] = None
    invoice_upi_id: str = "eazypay.0000048595@icici"
    estimate_upi_id: str = "7538977527@ybl"

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
    document_number: Optional[str] = None
    date: str
    customer_name: str
    customer_phone: str = ""
    customer_address: str = ""
    customer_email: str = ""
    payment_method: Literal["Cash", "UPI", "Card"] = "Cash"
    discount: float = 0
    exchange: float = 0
    round_off: Optional[float] = None
    notes: str = ""
    items: List[LineItemPayload] = Field(default_factory=list)

class NumberResponse(BaseModel):
    document_number: str

class BillTotals(BaseModel):
    subtotal: float
    taxable_amount: float
    cgst: float
    igst: float
    mdr: float
    discount: float
    exchange: float
    round_off: float
    grand_total: float

class BillSaveResponse(BaseModel):
    bill_id: str
    mode: Literal["invoice", "estimate"]
    document_number: str
    date: str
    totals: BillTotals
    message: str

class ResetCounterRequest(BaseModel):
    mode: Literal["invoice", "estimate"]

class VerifySessionResponse(BaseModel):
    valid: bool

class CloudStatusResponse(BaseModel):
    provider: str
    enabled: bool
    mode: str

def supabase_headers(prefer: Optional[str] = "return=representation") -> Dict[str, str]:
    headers = {
        "apikey": supabase_service_role_key,
        "Authorization": f"Bearer {supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers

async def call_supabase_rest(
    method: str,
    path: str,
    *,
    params: Optional[Dict[str, str]] = None,
    payload: Optional[Dict] = None,
    prefer: Optional[str] = "return=representation",
) -> Optional[requests.Response]:
    if not SUPABASE_ENABLED:
        return None
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}"
    def _request():
        return requests.request(
            method=method,
            url=endpoint,
            headers=supabase_headers(prefer=prefer),
            params=params,
            json=payload,
            timeout=10,
        )
    try:
        response = await asyncio.to_thread(_request)
        if response.status_code >= 400:
            logging.warning("Supabase request failed: %s %s -> %s", method, path, response.status_code)
            return None
        return response
    except Exception as exc:
        logging.warning("Supabase connection error: %s", exc)
        return None

async def reserve_document_number_supabase(mode: str) -> Optional[int]:
    rpc_response = await call_supabase_rest(
        "POST",
        "rpc/next_document_number",
        payload={"p_mode": mode},
        prefer=None,
    )
    if rpc_response is not None:
        try:
            rpc_data = rpc_response.json()
            if isinstance(rpc_data, int): return rpc_data
            if isinstance(rpc_data, dict):
                val = rpc_data.get("value") or rpc_data.get("next_value") or rpc_data.get("counter")
                if isinstance(val, int): return val
        except Exception:
            pass

    get_response = await call_supabase_rest(
        "GET",
        supabase_counters_table,
        params={"mode": f"eq.{mode}", "select": "mode,value", "limit": "1"},
        prefer=None,
    )
    if get_response is None: return None
    rows = get_response.json()
    current_value = int(rows[0].get("value", 0)) if rows else 0
    next_value = current_value + 1

    if rows:
        patch_response = await call_supabase_rest(
            "PATCH",
            supabase_counters_table,
            params={"mode": f"eq.{mode}"},
            payload={"value": next_value, "updated_at": now_iso()},
        )
        if patch_response is not None: return next_value
    else:
        create_response = await call_supabase_rest(
            "POST",
            supabase_counters_table,
            payload={"mode": mode, "value": 1, "updated_at": now_iso()},
        )
        if create_response is not None: return 1
    return None

async def suggest_customers_supabase(query: str) -> Optional[List[CustomerRecord]]:
    search = query.strip().replace("*", "")
    response = await call_supabase_rest(
        "GET",
        supabase_customers_table,
        params={
            "select": "id,name,phone,address,email,updated_at",
            "or": f"(name.ilike.*{search}*,phone.ilike.*{search}*)",
            "order": "updated_at.desc",
            "limit": "8",
        },
        prefer=None,
    )
    if response is None: return None
    docs = response.json()
    return [
        CustomerRecord(
            id=str(doc.get("id") or uuid.uuid4()),
            name=doc.get("name", ""),
            phone=doc.get("phone", ""),
            address=doc.get("address", ""),
            email=doc.get("email", ""),
            updated_at=doc.get("updated_at") or now_iso(),
        ) for doc in docs
    ]

async def sync_customer_supabase(customer_doc: Dict) -> None:
    if not SUPABASE_ENABLED: return
    lookup_field = "phone" if customer_doc.get("phone") else "name"
    lookup_value = customer_doc.get(lookup_field, "")
    existing = await call_supabase_rest(
        "GET",
        supabase_customers_table,
        params={lookup_field: f"eq.{lookup_value}", "select": "id", "limit": "1"},
        prefer=None,
    )
    if existing is not None:
        rows = existing.json()
        if rows:
            await call_supabase_rest(
                "PATCH",
                supabase_customers_table,
                params={lookup_field: f"eq.{lookup_value}"},
                payload={
                    "name": customer_doc.get("name", ""),
                    "phone": customer_doc.get("phone", ""),
                    "address": customer_doc.get("address", ""),
                    "email": customer_doc.get("email", ""),
                    "updated_at": customer_doc.get("updated_at", now_iso()),
                },
            )
            return
    await call_supabase_rest("POST", supabase_customers_table, payload=customer_doc)

def _extract_token(authorization: str) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return authorization.split(" ", 1)[1].strip()

def require_auth(authorization: str = Header(...)) -> str:
    token = _extract_token(authorization)
    expires_at = ACTIVE_TOKENS.get(token)
    if not expires_at:
        raise HTTPException(status_code=401, detail="Invalid session token")
    expiry = datetime.fromisoformat(expires_at)
    if now_utc() > expiry:
        ACTIVE_TOKENS.pop(token, None)
        raise HTTPException(status_code=401, detail="Session expired")
    return token

async def get_or_create_settings() -> SettingsPayload:
    doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    if doc:
        return SettingsPayload(**{k: v for k, v in doc.items() if k not in {"key", "updated_at"}})
    default_settings = SettingsPayload().model_dump()
    await settings_collection.insert_one({**default_settings, "key": "app_settings", "updated_at": now_iso()})
    return SettingsPayload(**default_settings)

async def reserve_document_number(mode: str) -> str:
    prefix = "INV" if mode == "invoice" else "EST"
    if SUPABASE_ENABLED:
        cloud_value = await reserve_document_number_supabase(mode)
        if cloud_value is not None: return f"{prefix}-{int(cloud_value):04d}"
    
    updated_doc = await counters_collection.find_one_and_update(
        {"mode": mode},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    serial = int(updated_doc.get("value", 1))
    return f"{prefix}-{serial:04d}"

def compute_item_amount(item: LineItemPayload, mode: str, settings: SettingsPayload) -> Dict:
    default_rate = (settings.silver_rate_per_10g / 10) + settings.making_charge_per_gram
    effective_rate = float(item.rate_override) if item.rate_override is not None else default_rate
    quantity = max(float(item.quantity), 1)
    
    computed = float(item.weight) * effective_rate * quantity if mode == "estimate" else float(item.weight) * effective_rate
    amount = float(item.amount_override) if (item.amount_override is not None and item.amount_override >= 0) else computed
    
    return {
        "effective_rate": round(effective_rate, 2),
        "quantity": round(quantity, 3),
        "amount": round(amount, 2),
    }

def compute_totals(payload: BillDraftPayload, settings: SettingsPayload, line_amounts: List[float]) -> BillTotals:
    taxable_amount = round(sum(line_amounts), 2)
    cgst = round(taxable_amount * 0.015, 2) if payload.mode == "invoice" else 0.0
    igst = round(taxable_amount * 0.03, 2) if payload.mode == "invoice" else 0.0
    mdr = round((taxable_amount + cgst + igst) * 0.02, 2) if payload.payment_method == "Card" else 0.0
    
    base_total = taxable_amount + cgst + igst + mdr - payload.discount - payload.exchange
    round_off = round(payload.round_off, 2) if payload.round_off is not None else round(round(base_total) - base_total, 2)
    
    return BillTotals(
        subtotal=taxable_amount, taxable_amount=taxable_amount,
        cgst=cgst, igst=igst, mdr=mdr,
        discount=round(payload.discount, 2), exchange=round(payload.exchange, 2),
        round_off=round_off, grand_total=round(base_total + round_off, 2),
    )

@api_router.get("/")
async def root():
    return {"message": "Jalaram Jewellers Billing API"}

@api_router.post("/auth/login", response_model=AuthTokenResponse)
async def login(payload: LoginRequest):
    if payload.passcode.strip() != AUTH_PASSCODE:
        raise HTTPException(status_code=401, detail="Invalid passcode")
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

@api_router.get("/bills/next-number", response_model=NumberResponse)
async def get_next_number(mode: Literal["invoice", "estimate"] = Query(...), _: str = Depends(require_auth)):
    return NumberResponse(document_number=await reserve_document_number(mode))

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
    doc_num = payload.document_number or await reserve_document_number(payload.mode)
    bill_id = str(uuid.uuid4())
    
    bill_doc = {
        "id": bill_id, "mode": payload.mode, "document_number": doc_num, "date": payload.date,
        "customer": {"name": payload.customer_name, "phone": payload.customer_phone, "address": payload.customer_address, "email": payload.customer_email},
        "payment_method": payload.payment_method, "notes": payload.notes, "items": line_entries, "totals": totals.model_dump(), "created_at": now_iso()
    }
    await bills_collection.insert_one(bill_doc)
    
    cust_doc = CustomerRecord(name=payload.customer_name, phone=payload.customer_phone, address=payload.customer_address, email=payload.customer_email).model_dump()
    await customers_collection.update_one({"phone": payload.customer_phone} if payload.customer_phone else {"name": payload.customer_name}, {"$set": cust_doc}, upsert=True)
    await sync_customer_supabase(cust_doc)
    
    return BillSaveResponse(bill_id=bill_id, mode=payload.mode, document_number=doc_num, date=payload.date, totals=totals, message="Bill saved successfully")

@api_router.put("/bills/{document_number}", response_model=BillSaveResponse)
async def update_bill(document_number: str, payload: BillDraftPayload, _: str = Depends(require_auth)):
    existing_bill = await bills_collection.find_one({"document_number": document_number})
    if not existing_bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    settings = await get_or_create_settings()
    line_entries, line_amounts = [], []
    for idx, item in enumerate(payload.items, start=1):
        computed = compute_item_amount(item, payload.mode, settings)
        line_amounts.append(computed["amount"])
        line_entries.append({**item.model_dump(), "sl_no": idx, "rate": computed["effective_rate"], "amount": computed["amount"]})
    
    totals = compute_totals(payload, settings, line_amounts)
    
    update_data = {
        "mode": payload.mode,
        "date": payload.date,
        "customer": {"name": payload.customer_name, "phone": payload.customer_phone, "address": payload.customer_address, "email": payload.customer_email},
        "payment_method": payload.payment_method,
        "notes": payload.notes,
        "items": line_entries,
        "totals": totals.model_dump(),
        "updated_at": now_iso()
    }
    
    await bills_collection.update_one(
        {"document_number": document_number},
        {"$set": update_data}
    )
    
    cust_doc = CustomerRecord(name=payload.customer_name, phone=payload.customer_phone, address=payload.customer_address, email=payload.customer_email).model_dump()
    await customers_collection.update_one({"phone": payload.customer_phone} if payload.customer_phone else {"name": payload.customer_name}, {"$set": cust_doc}, upsert=True)
    await sync_customer_supabase(cust_doc)
    
    return BillSaveResponse(
        bill_id=existing_bill["id"], 
        mode=payload.mode, 
        document_number=document_number, 
        date=payload.date, 
        totals=totals, 
        message="Bill updated successfully"
    )

@api_router.delete("/bills/{document_number}")
async def delete_bill(document_number: str, _: str = Depends(require_auth)):
    result = await bills_collection.delete_one({"document_number": document_number})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bill not found")
        
    return {"message": f"Bill {document_number} deleted successfully"}

# --- UPDATED GET RECENT BILLS WITH SEARCH ---
@api_router.get("/bills/recent")
async def recent_bills(
    limit: int = Query(default=15, ge=1, le=50), 
    search: Optional[str] = Query(None), 
    _: str = Depends(require_auth)
):
    query = {}
    if search and search.strip():
        # Do a case-insensitive search across document number, name, and phone
        regex = {"$regex": re.escape(search.strip()), "$options": "i"}
        query = {
            "$or": [
                {"document_number": regex},
                {"customer.name": regex},
                {"customer.phone": regex}
            ]
        }
    return await bills_collection.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

# --- NEW RESET COUNTER ENDPOINT ---
@api_router.post("/bills/reset-counter")
async def reset_counter(payload: ResetCounterRequest, _: str = Depends(require_auth)):
    # Reset local MongoDB Counter
    await counters_collection.update_one(
        {"mode": payload.mode},
        {"$set": {"value": 0}},
        upsert=True
    )
    
    # Reset Supabase Counter if enabled
    if SUPABASE_ENABLED:
        existing = await call_supabase_rest(
            "GET",
            supabase_counters_table,
            params={"mode": f"eq.{payload.mode}", "select": "mode", "limit": "1"},
            prefer=None
        )
        if existing is not None and existing.json():
            await call_supabase_rest(
                "PATCH",
                supabase_counters_table,
                params={"mode": f"eq.{payload.mode}"},
                payload={"value": 0, "updated_at": now_iso()}
            )
        else:
            await call_supabase_rest(
                "POST",
                supabase_counters_table,
                payload={"mode": payload.mode, "value": 0, "updated_at": now_iso()}
            )
            
    return {"message": f"{payload.mode.capitalize()} counter reset successfully"}

@api_router.get("/bills/public/{document_number}")
async def get_public_bill(document_number: str):
    bill = await bills_collection.find_one({"document_number": document_number}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
        
    settings_doc = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    if settings_doc:
        settings_data = {k: v for k, v in settings_doc.items() if k not in {"key", "updated_at"}}
    else:
        settings_data = SettingsPayload().model_dump()
        
    return {
        "bill": bill,
        "settings": settings_data
    }

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
