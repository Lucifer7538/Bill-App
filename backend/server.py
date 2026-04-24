import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional
import os
import re
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import requests
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt # --- NEW: MQTT LIBRARY ---
import smtplib
from email.mime.text import MIMEText
import random

OTP_STORE = {} # Temporary memory to store the forgot password codes
LOGIN_OTP_STORE = {} # Temporary memory for 2FA logins

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
active_tokens_collection = db.active_tokens

# --- NEW: HIVEMQ CLOUD CONFIGURATION ---
MQTT_BROKER = "c625cc8e0231406e84c51c94ba9a220d.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USER = "QR-Display"
MQTT_PASS = "Khushal@7538"
MQTT_TOPIC = "Jalaram/QR"
STATUS_TOPIC = "Jalaram/status"

# In-memory store for IoT status
IOT_HEARTBEAT = {"last_seen": None}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
AUTH_PASSCODE = os.environ.get("AUTH_PASSCODE", "1234")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ENABLED = bool(SUPABASE_URL and SUPABASE_KEY and "YOUR_" not in SUPABASE_URL)

# --- NEW: MQTT CLIENT INITIALIZATION ---
mqtt_client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)

def on_connect(client, userdata, flags, rc, properties):
    if rc == 0:
        print("✅ Backend connected to HiveMQ Cloud")
        client.subscribe(STATUS_TOPIC)
    else:
        print(f"❌ MQTT Connection failed with code {rc}")

def on_message(client, userdata, msg):
    """Listens for heartbeat pulses from the ESP32"""
    if msg.topic == STATUS_TOPIC:
        IOT_HEARTBEAT["last_seen"] = datetime.now(timezone.utc)

mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message
mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
mqtt_client.tls_set() # Required for HiveMQ Cloud TLS

def now_iso(): return datetime.now(timezone.utc).isoformat()

def safe_float(val):
    if val is None or val == "": return 0.0
    try: return float(val)
    except (ValueError, TypeError): return 0.0

# --- HELPER FUNCTIONS FOR BULLETPROOF DATA EXTRACTION ---
def get_val(data: dict, keys: List[str]):
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

async def require_auth(authorization: str = Header(None)):
    if not authorization: raise HTTPException(401, "No Token")
    token = authorization.replace("Bearer ", "").strip()
    
    # Now the guard checks the database for the permanent token!
    token_doc = await active_tokens_collection.find_one({"token": token})
    if not token_doc: raise HTTPException(401, "Login Expired")
    
    return token

@app.get("/")
async def root(): return {"status": "online", "server": "Jalaram-Master-V12", "msg": "Backend is awake"}

# --- RESTORED & UPGRADED LOGIN ENDPOINTS ---
@api_router.post("/auth/login")
async def login_step_one(payload: dict, background_tasks: BackgroundTasks):
    print(f"🕵️ DEBUG LOGIN - Payload received: {payload}")
    
    settings = await settings_collection.find_one({"key": "app_settings"})
    db_passcode = settings.get("app_passcode") if settings else None
    active_pass = db_passcode if db_passcode else AUTH_PASSCODE
    
    attempt = payload.get("passcode", "") or payload.get("password", "")
    attempt = str(attempt).strip()
    
    if attempt != str(active_pass): 
        print(f"❌ DEBUG LOGIN - Failed: Invalid Passcode")
        raise HTTPException(401, "Invalid Passcode")
        
    admin_email = settings.get("admin_email", "") if settings else ""
    if not admin_email:
        raise HTTPException(400, "Admin email not set in settings. Cannot send 2FA.")

    # Generate the 6-digit login OTP
    otp = str(random.randint(100000, 999999))
    LOGIN_OTP_STORE[admin_email] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=5),
        "remember_me": payload.get("remember_me", False)
    }
    
    sender = os.environ.get("SMTP_USER", "jalaramjewellers26@gmail.com") 
    password = os.environ.get("SMTP_PASS", "") 
    
    def send_2fa_email():
        try:
            msg = MIMEText(f"Your Jalaram Jewellers Login 2FA Code is: {otp}\nValid for 5 minutes.")
            msg['Subject'] = 'Login Verification Code'
            msg['From'] = sender
            msg['To'] = admin_email
            
            with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
                server.login(sender, password)
                server.send_message(msg)
            print("✅ 2FA Email Sent!")
        except Exception as e:
            print(f"❌ Failed to send 2FA email: {e}")

    background_tasks.add_task(send_2fa_email)
    return {"status": "otp_sent", "message": "2FA code sent to admin email."}

@api_router.post("/auth/verify-login")
async def verify_login_step_two(payload: dict):
    otp_attempt = payload.get("otp", "").strip()
    
    settings = await settings_collection.find_one({"key": "app_settings"})
    admin_email = settings.get("admin_email", "") if settings else ""
    
    stored_data = LOGIN_OTP_STORE.get(admin_email)
    
    if not stored_data or datetime.now(timezone.utc) > stored_data["expires"]:
        raise HTTPException(401, "OTP has expired or was not requested.")
        
    if str(stored_data["otp"]) != str(otp_attempt):
        raise HTTPException(401, "Invalid Verification Code.")
        
    # Success! Create a permanent token in the database
    t = str(uuid.uuid4())
    await active_tokens_collection.insert_one({"token": t, "created_at": now_iso()})
    
    del LOGIN_OTP_STORE[admin_email] # Burn the OTP
    print("✅ DEBUG LOGIN - 2FA Success! User is securely logged in permanently.")
    
    return {"access_token": t}

@api_router.post("/auth/logout-all")
async def logout_all_devices(_=Depends(require_auth)):
    # Wipes the database collection entirely. Every single logged-in device gets kicked out.
    await active_tokens_collection.delete_many({})
    return {"message": "All devices have been successfully logged out."}

# --- THIS IS THE MISSING HEARTBEAT ENDPOINT THAT WAS CAUSING THE CRASH ---
@api_router.get("/auth/verify")
async def verify(_=Depends(require_auth)): 
    return {"valid": True}
# -----------------------------------------------------------------------

@api_router.post("/auth/forgot-password")
async def forgot_password(background_tasks: BackgroundTasks):
    settings = await settings_collection.find_one({"key": "app_settings"})
    admin_email = settings.get("admin_email", "") if settings else ""
    
    if not admin_email or "@" not in admin_email:
        raise HTTPException(400, "Admin email not configured in settings.")
    
    otp = str(random.randint(100000, 999999))
    OTP_STORE[admin_email] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    
    # It tries to read your .env file first, then falls back to the hardcoded string
    sender = os.environ.get("SMTP_USER", "jalaramjewellers26@gmail.com") 
    password = os.environ.get("SMTP_PASS", "") 
    
    def send_email_sync():
        try:
            msg = MIMEText(f"Your password reset OTP is: {otp}\nThis code is valid for 10 minutes.")
            msg['Subject'] = 'Password Reset OTP'
            msg['From'] = sender
            msg['To'] = admin_email
            
            with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
                server.login(sender, password)
                server.send_message(msg)
            print("✅ OTP Email Sent Successfully!")
        except Exception as e:
            print(f"❌ Failed to send OTP email: {e}")

    # Sends the email in the background so the frontend doesn't freeze
    background_tasks.add_task(send_email_sync)
    
    return {"message": "If the email is registered, an OTP will be sent shortly."}

@api_router.post("/auth/reset-password")
async def reset_password(payload: dict):
    # We only pull the OTP and the new passcode from the frontend now
    otp = payload.get("otp", "").strip()
    new_passcode = payload.get("new_passcode", "").strip()
    
    if not otp or not new_passcode:
        raise HTTPException(400, "OTP and new passcode are required.")
        
    # We fetch the admin email straight from the database settings
    settings = await settings_collection.find_one({"key": "app_settings"})
    admin_email = settings.get("admin_email", "") if settings else ""
    
    if not admin_email:
        raise HTTPException(400, "Admin email not configured in settings.")
        
    # Now we check the temporary memory using that database email
    stored_data = OTP_STORE.get(admin_email)
    if not stored_data:
        raise HTTPException(400, "No active OTP request found.")
        
    if datetime.now(timezone.utc) > stored_data["expires"]:
        del OTP_STORE[admin_email]  
        raise HTTPException(401, "OTP has expired. Please request a new one.")
        
    if str(stored_data["otp"]) != str(otp):
        raise HTTPException(401, "Invalid OTP.")
        
    # Success! Update the password
    await settings_collection.update_one(
        {"key": "app_settings"},
        {"$set": {"app_passcode": str(new_passcode), "updated_at": now_iso()}},
        upsert=True
    )
    
    del OTP_STORE[admin_email]
    
    return {"status": "success", "message": "Passcode reset successfully! You can now log in."}

# --- NEW: IOT CONTROL ENDPOINTS ---

@api_router.get("/cloud/mqtt/status")
async def get_mqtt_status(_=Depends(require_auth)):
    """Checks if the ESP32 has pulsed in the last 30 seconds"""
    last = IOT_HEARTBEAT["last_seen"]
    if not last: return {"online": False}
    
    is_live = (datetime.now(timezone.utc) - last) < timedelta(seconds=30)
    return {"online": is_live, "last_seen": last.isoformat()}

@api_router.post("/cloud/mqtt/publish")
async def publish_mqtt(payload: dict, _=Depends(require_auth)):
    """Publishes a message (QR JSON or SUCCESS) to the HiveMQ topic"""
    try:
        topic = payload.get("topic", MQTT_TOPIC)
        msg = payload.get("message", "")
        mqtt_client.publish(topic, msg, qos=1)
        return {"status": "published"}
    except Exception as e:
        raise HTTPException(500, detail=str(e))

# ----------------------------------

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
        # --- NEW: BRANCH ID GUARDRAIL ---
        if not branch_id:
            raise HTTPException(status_code=400, detail="CRITICAL: branch_id is required to adjust the ledger.")
        # --------------------------------
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
    
    if mode == "invoice":
        # Auto-calculate the Indian Financial Year
        now = datetime.now(timezone.utc)
        if now.month >= 4:
            fy = f"{now.strftime('%y')}-{(now.year + 1) % 100:02d}"
        else:
            fy = f"{(now.year - 1) % 100:02d}-{now.strftime('%y')}"
            
        # Both branches output exactly what the CA wants. 
        # :03d guarantees 001, 002... and automatically scales to 1000, 1001 when reached.
        return {"document_number": f"JW/{fy}/{val:03d}"}
        
    else:
        # Keep Estimates formatting as they were
        prefix = "EST"
        settings = await settings_collection.find_one({"key": "app_settings"})
        short_branch = branch_id
        if settings and "branches" in settings:
            for idx, b in enumerate(settings["branches"]):
                if str(b.get("id")) == str(branch_id):
                    short_branch = f"B{idx + 1}"
                    break
                    
        return {"document_number": f"{short_branch}-{prefix}-{val:04d}"}
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
    # --- NEW: BRANCH ID GUARDRAIL ---
    if not branch_id:
        raise HTTPException(status_code=400, detail="CRITICAL: branch_id is missing from the payload.")
    # --------------------------------

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
        # --- NEW: BRANCH ID GUARDRAIL ---
    if not payload.get("branch_id"):
        raise HTTPException(status_code=400, detail="CRITICAL: branch_id is missing from the update payload.")
    # --------------------------------

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

@api_router.delete("/bills/{document_number:path}")
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

    # --- AUTO-CORRECT THE BILL COUNTER IN THE DATABASE ---
    if bill:
        mode = bill.get("mode")
        branch_id = bill.get("branch_id")
        if mode and branch_id:
            # Find all remaining bills for this branch and mode
            remaining_bills = await bills_collection.find({"mode": mode, "branch_id": branch_id}).to_list(None)
            highest_val = 0
            for b in remaining_bills:
                match = re.search(r'\d+$', b.get("document_number", ""))
                if match:
                    v = int(match.group())
                    if v > highest_val: 
                        highest_val = v
                
            # Tell the database to dial the counter back to the actual highest existing bill
            await counters_collection.update_one(
                {"mode": mode, "branch_id": branch_id}, 
                {"$set": {"value": highest_val}}, 
                upsert=True
            )
    # -----------------------------------------------------

    return {"message": "Deleted and Counter Auto-Corrected"}
@api_router.delete("/bills/all")
async def delete_all_bills(_=Depends(require_auth)):
    try:
        await bills_collection.delete_many({})
        return {"message": "All bill data wiped successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

@api_router.get("/bills/public/id/{bill_id}")
async def get_public(bill_id: str):
    # This searches for the hidden UUID we put in the link!
    bill = await bills_collection.find_one({"id": bill_id}, {"_id": 0})
    
    if not bill:
        raise HTTPException(404, "Bill not found")
        
    settings = await settings_collection.find_one({"key": "app_settings"}, {"_id": 0})
    return {"bill": bill, "settings": settings}
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
        if not c_name and not c_phone: continue
        earned = get_val(bill, ["earned_points", "loyalty_earned", "earned_loyalty"])
        redeemed = get_val(bill, ["redeemed_points", "loyalty_redeemed", "redeemed_loyalty"])
        saved_cred = get_val(bill, ["saved_credit", "credit_saved", "earned_credit", "store_credit"])
        applied_cred = get_val(bill, ["applied_credit", "credit_applied", "used_credit", "redeemed_credit"])
        points_to_add = earned - redeemed
        credit_to_add = saved_cred - applied_cred
        if points_to_add != 0 or credit_to_add != 0:
            query = {"phone": c_phone} if c_phone else {"name": c_name}
            await customers_collection.update_one(query, {"$inc": {"points": points_to_add, "loyalty_points": points_to_add, "credit": credit_to_add, "store_credit": credit_to_add}}, upsert=True)
            updated_count += 1
    return {"message": f"Successfully synced points from {updated_count} old bills!"}

# --- THE PYTHON WHATSAPP AGENT (BACKGROUND TASK) ---
async def run_whatsapp_agent(target_audience: str, message: str, branch_id: str):
    print(f"🤖 WhatsApp Agent Started! Target: {target_audience}")
    
    # 1. Fetch the target audience from MongoDB
    query = {"phone": {"$ne": ""}, "phone": {"$exists": True}}
    
    if target_audience == "recent":
        # Customers from the last 30 days
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        query["updated_at"] = {"$gte": thirty_days_ago}
        
    customers = await customers_collection.find(query).to_list(None)
    print(f"🤖 Found {len(customers)} customers to message.")

    # 2. Loop through customers and send messages
    for idx, customer in enumerate(customers):
        raw_phone = customer.get("phone", "")
        # Clean the phone number (remove spaces, dashes)
        clean_phone = "".join(filter(str.isdigit, raw_phone))
        
        # Ensure it has the India country code
        if len(clean_phone) == 10:
            clean_phone = f"91{clean_phone}"
            
        if len(clean_phone) < 10:
            continue # Skip invalid numbers

        # Personalize the message
        personalized_msg = message.replace("{name}", customer.get("name", "Valued Customer"))

        # ---------------------------------------------------------
        # ⚠️ INSERT YOUR WHATSAPP API LOGIC HERE ⚠️
        # Example using a standard API (like UltraMsg or Meta Cloud)
        # ---------------------------------------------------------
        try:
            print(f"[{idx+1}/{len(customers)}] Sending to {clean_phone}...")
            
            # Example API Call (Uncomment and replace with your provider's details)
            # api_url = "https://api.ultramsg.com/YOUR_INSTANCE_ID/messages/chat"
            # payload = {
            #     "token": "YOUR_API_TOKEN",
            #     "to": clean_phone,
            #     "body": personalized_msg
            # }
            # requests.post(api_url, json=payload)
            
            # Anti-Ban Safety Delay: Wait 3 to 5 seconds between messages
            await asyncio.sleep(4) 
            
        except Exception as e:
            print(f"❌ Failed to send to {clean_phone}: {e}")

    print("✅ WhatsApp Broadcast Complete!")

# --- THE API ENDPOINT TO TRIGGER THE AGENT ---
@api_router.post("/whatsapp/broadcast")
async def start_broadcast(payload: dict, background_tasks: BackgroundTasks, _=Depends(require_auth)):
    target_audience = payload.get("audience", "all")
    message = payload.get("message", "")
    branch_id = payload.get("branch_id", "B1")
    
    if not message:
        raise HTTPException(400, "Message cannot be empty.")

    # Send the task to the background so the frontend doesn't get stuck loading
    background_tasks.add_task(run_whatsapp_agent, target_audience, message, branch_id)
    
    return {"status": "success", "message": "🤖 Background agent triggered successfully!"}

app.include_router(api_router)

# --- NEW: SYSTEM LIFECYCLE EVENTS ---

@app.on_event("startup")
async def startup_event():
    """Connect to HiveMQ Cloud on server start"""
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT)
        mqtt_client.loop_start()
    except Exception as e:
        print(f"⚠️ MQTT Startup Error: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    mqtt_client.loop_stop()
    client.close()
