import time
import uuid


# Auth and session verification tests
def test_api_root_health(api_client, api_base_url):
    response = api_client.get(f"{api_base_url}/api/")
    assert response.status_code == 200
    assert response.json().get("message") == "Jalaram Jewellers Billing API"


def test_login_invalid_passcode(api_client, api_base_url):
    response = api_client.post(f"{api_base_url}/api/auth/login", json={"passcode": "0000"})
    assert response.status_code == 401
    assert "Invalid passcode" in response.text


def test_verify_session(authenticated_client, api_base_url):
    response = authenticated_client.get(f"{api_base_url}/api/auth/verify")
    assert response.status_code == 200
    assert response.json().get("valid") is True


# Cloud placeholder/fallback status tests
def test_cloud_status_reports_placeholder_mode(authenticated_client, api_base_url):
    response = authenticated_client.get(f"{api_base_url}/api/cloud/status")
    assert response.status_code == 200

    data = response.json()
    assert data.get("provider") == "supabase"
    assert data.get("enabled") is False
    assert data.get("mode") == "placeholder-or-mongo-fallback"


# Settings persistence tests
def test_settings_update_and_get_persistence(authenticated_client, api_base_url):
    get_before = authenticated_client.get(f"{api_base_url}/api/settings")
    assert get_before.status_code == 200
    original = get_before.json()

    marker = f"TEST_TAG_{int(time.time())}"
    updated = {**original, "tagline": marker}

    put_response = authenticated_client.put(f"{api_base_url}/api/settings", json=updated)
    assert put_response.status_code == 200
    assert put_response.json().get("tagline") == marker

    get_after = authenticated_client.get(f"{api_base_url}/api/settings")
    assert get_after.status_code == 200
    assert get_after.json().get("tagline") == marker

    authenticated_client.put(f"{api_base_url}/api/settings", json=original)


# Document numbering tests
def test_next_number_invoice_prefix_and_sequence(authenticated_client, api_base_url):
    first = authenticated_client.get(f"{api_base_url}/api/bills/next-number", params={"mode": "invoice"})
    second = authenticated_client.get(f"{api_base_url}/api/bills/next-number", params={"mode": "invoice"})

    assert first.status_code == 200
    assert second.status_code == 200

    first_number = first.json().get("document_number", "")
    second_number = second.json().get("document_number", "")
    assert first_number.startswith("INV-")
    assert second_number.startswith("INV-")

    first_serial = int(first_number.split("-")[1])
    second_serial = int(second_number.split("-")[1])
    assert second_serial == first_serial + 1


def test_next_number_estimate_prefix(authenticated_client, api_base_url):
    response = authenticated_client.get(f"{api_base_url}/api/bills/next-number", params={"mode": "estimate"})
    assert response.status_code == 200
    assert response.json().get("document_number", "").startswith("EST-")


# Bill save, totals, and customer suggestion integration tests
def test_save_invoice_and_verify_recent(authenticated_client, api_base_url):
    customer_name = f"TEST_Customer_{uuid.uuid4().hex[:8]}"
    payload = {
        "mode": "invoice",
        "date": "2026-02-15",
        "customer_name": customer_name,
        "customer_phone": "9990011223",
        "customer_address": "TEST Address",
        "customer_email": "test@example.com",
        "payment_method": "Card",
        "discount": 10,
        "exchange": 5,
        "round_off": None,
        "notes": "TEST invoice save",
        "items": [
            {
                "description": "Silver chain",
                "hsn": "7113",
                "weight": 10,
                "quantity": 1,
                "rate_override": 100,
                "amount_override": None,
            }
        ],
    }

    save_response = authenticated_client.post(f"{api_base_url}/api/bills/save", json=payload)
    assert save_response.status_code == 200

    saved = save_response.json()
    assert saved.get("mode") == "invoice"
    assert saved.get("document_number", "").startswith("INV-")
    assert saved.get("totals", {}).get("igst") == 30.0
    assert saved.get("totals", {}).get("mdr") == 20.9

    recent = authenticated_client.get(f"{api_base_url}/api/bills/recent", params={"limit": 20})
    assert recent.status_code == 200
    ids = [bill.get("id") for bill in recent.json()]
    assert saved.get("bill_id") in ids


def test_customer_suggest_after_save(authenticated_client, api_base_url):
    customer_name = f"TEST_Suggest_{uuid.uuid4().hex[:6]}"
    payload = {
        "mode": "estimate",
        "date": "2026-02-16",
        "customer_name": customer_name,
        "customer_phone": "8887766554",
        "customer_address": "TEST Suggest Addr",
        "customer_email": "suggest@example.com",
        "payment_method": "Cash",
        "discount": 0,
        "exchange": 0,
        "round_off": None,
        "notes": "TEST suggest",
        "items": [
            {
                "description": "Bangle",
                "hsn": "",
                "weight": 3,
                "quantity": 2,
                "rate_override": 90,
                "amount_override": None,
            }
        ],
    }
    save_response = authenticated_client.post(f"{api_base_url}/api/bills/save", json=payload)
    assert save_response.status_code == 200

    suggest = authenticated_client.get(
        f"{api_base_url}/api/customers/suggest",
        params={"query": customer_name[:8]},
    )
    assert suggest.status_code == 200

    names = [entry.get("name") for entry in suggest.json()]
    assert customer_name in names


def test_save_estimate_uses_quantity_formula(authenticated_client, api_base_url):
    payload = {
        "mode": "estimate",
        "date": "2026-02-17",
        "customer_name": f"TEST_Qty_{uuid.uuid4().hex[:5]}",
        "customer_phone": "7776655443",
        "payment_method": "Cash",
        "discount": 0,
        "exchange": 0,
        "round_off": 0,
        "notes": "TEST qty formula",
        "items": [
            {
                "description": "Ring",
                "hsn": "",
                "weight": 2,
                "quantity": 3,
                "rate_override": 100,
                "amount_override": None,
            }
        ],
    }

    response = authenticated_client.post(f"{api_base_url}/api/bills/save", json=payload)
    assert response.status_code == 200

    data = response.json()
    totals = data.get("totals", {})
    assert totals.get("subtotal") == 600.0
    assert totals.get("igst") == 0.0
    assert totals.get("cgst") == 0.0
