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

# Database
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

settings_collection = db.shop_settings
customers_collection = db.customers
bills_collection = db.bills
counters_collection = db.number_counters
ledger_logs_collection = db.ledger_logs 

app = FastAPI()

# 🚨 FIX: CORS MUST BE AT THE TOP 🚨
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
ACTIVE_TOKENS: Dict[str, str] = {}
AUTH_PASSCODE = os.environ["AUTH_PASSCODE"]

# --- Models ---
class LoginRequest(BaseModel): passcode: str
class AuthTokenResponse(BaseModel): access_token: str; token_type: str = "bearer"; expires_at: str
class BranchDef(BaseModel): id: str; name: str; address: str; map_url: str; invoice_upi_id: str; estimate_upi_id: str; cash_balance: float = 0.0; estimate_bank_balance: float = 0.0; invoice_bank_balance: float = 0.0
class SettingsPayload(BaseModel): shop_name: str; tagline: str; phone_numbers: List[str]; email: str; branches: List[BranchDef]; silver_rate_per_gram: float; making_charge_per_gram: float; default_hsn: str; formula_note: str; logo_data_url: Optional[str] = None; about_qr_data_url: Optional[str] = None; theme_color: str = "#000000"
class LedgerAdjustPayload(BaseModel): branch_id: str; reason: str; cash_change: float = 0.0; estimate_bank_change: float = 0.0; invoice_bank_change: float = 0.0
class BalancesPayload(BaseModel): branch_id: str; cash_balance: float; estimate_bank_balance: float; invoice_bank_balance: float
class CustomerRecord(BaseModel): id: str = Field(default_factory=lambda: str(uuid.uuid4())); name: str; phone: str = ""; address: str = ""; email: str = ""; updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
class LineItemPayload(BaseModel): description: str; hsn: str = ""; weight: float = 0; quantity: float = 1; rate_override: Optional[float] = None; amount_override: Optional[float] = None
class BillTotals(BaseModel): subtotal: float; taxable_amount: float; cgst: float; sgst: float; igst: float; mdr: float; discount: float; exchange: float; round_off: float; grand_total: float
class BillDraftPayload(BaseModel): mode: Literal["invoice", "estimate"]; branch_id: str; document_number: Optional[str] = None; date: str; customer_name: str; customer_phone: str = ""; customer_address: str = ""; customer_email: str = ""; payment_method: Literal["Cash", "UPI", "Card", "Split"]; is_payment_done: bool; split_cash: float = 0; split_upi: float = 0; discount: float = 0; exchange: float = 0; round_off: Optional[float] = None; notes: str = ""; items: List[LineItemPayload]
class BillSaveResponse(BaseModel): bill_id: str; mode: str; branch_id: str; document_number: str; date: str; totals: BillTotals; message: str

# --- Core Logic ---
def now_iso(): return datetime.now(timezone.utc).isoformat()

async def update_ledger(bill: dict, reverse: bool = False):
    m = -1 if reverse else 1
    method, mode, branch_id = bill.get("payment_method"), bill.get("mode"), bill.get("branch_id")
    total = float(bill.get("totals", {}).get("grand_total", 0))
    c, e_b, i_b = 0.0, 0.0, 0.0
    if method == "Cash": c = total
    elif method in ["UPI", "Card"]:
        if mode == "estimate": e_b = total
        else: i_b = total
    elif method == "Split":
        c = float(bill.get("split_cash", 0))
        if mode == "estimate": e_b = total - c
        else: i_b = total - c
    
    await settings_collection.update_one({"key": "app_settings", "branches.id": branch_id}, {"$inc": {"branches.$.cash_balance": c*m, "branches.$.estimate_bank_balance": e_b*m, "branches.$.invoice_bank_balance": i_b*m}})
    await ledger_logs_collection.insert_one({"id": str(uuid.uuid4()), "branch_id": branch_id, "date": now_iso(), "reason": f"{'REFUND' if reverse else 'SALE'}: {bill.get('document_number')}", "cash_change": c*m, "estimate_bank_change": e_b*m, "invoice_bank_change": i_b*m})

def require_auth(authorization: str = Header(...)):
    token = authorization.split(" ")[1] if " " in authorization else ""
    if token not in ACTIVE_TOKENS: raise HTTPException(status_code=401)
    return token

# --- Routes ---
@app.get("/")
async def root(): return {"status": "online", "message": "Jalaram Backend Awake"}

@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    if payload.passcode != AUTH_PASSCODE: raise HTTPException(401)
    t = str(uuid.uuid4())
    ACTIVE_TOKENS[t] = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
    return {"access_token": t, "expires_at": ACTIVE_TOKENS[t]}

@api_router.get("/settings")
async def get_settings(_=Depends(require_auth)):
    return await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})

@api_router.post("/settings/ledger/adjust")
async def adjust(payload: LedgerAdjustPayload, _=Depends(require_auth)):
    await settings_collection.update_one({"key": "app_settings", "branches.id": payload.branch_id}, {"$inc": {"branches.$.cash_balance": payload.cash_change, "branches.$.estimate_bank_balance": payload.estimate_bank_change, "branches.$.invoice_bank_balance": payload.invoice_bank_change}})
    log = {"id": str(uuid.uuid4()), "branch_id": payload.branch_id, "date": now_iso(), "reason": payload.reason, "cash_change": payload.cash_change, "estimate_bank_change": payload.estimate_bank_change, "invoice_bank_change": payload.invoice_bank_change}
    await ledger_logs_collection.insert_one(log)
    return {"message": "ok"}

@api_router.get("/settings/ledger/logs")
async def get_logs(branch_id: str = Query(...), _=Depends(require_auth)):
    return await ledger_logs_collection.find({"branch_id": branch_id}, {"_id": 0}).sort("date", -1).to_list(50)

@api_router.post("/bills/save")
async def save_bill(payload: BillDraftPayload, _=Depends(require_auth)):
    # Basic math for saving
    subtotal = sum(float(i.amount_override or (i.weight * 255)) for i in payload.items)
    totals = {"subtotal": subtotal, "taxable_amount": subtotal, "cgst": 0, "sgst": 0, "igst": 0, "mdr": 0, "discount": payload.discount, "exchange": payload.exchange, "round_off": payload.round_off or 0, "grand_total": subtotal - payload.discount - payload.exchange + (payload.round_off or 0)}
    bill_doc = {**payload.model_dump(), "id": str(uuid.uuid4()), "totals": totals, "created_at": now_iso()}
    await bills_collection.insert_one(bill_doc)
    if payload.is_payment_done: await update_ledger(bill_doc)
    return {"document_number": payload.document_number, "totals": totals, "message": "Saved"}

app.include_router(api_router)
