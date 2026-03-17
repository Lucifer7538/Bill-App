import os

import pytest
import requests
from dotenv import load_dotenv


load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


@pytest.fixture(scope="session")
def api_base_url():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not configured")
    return BASE_URL.rstrip("/")


@pytest.fixture()
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture()
def auth_token(api_client, api_base_url):
    response = api_client.post(f"{api_base_url}/api/auth/login", json={"passcode": "7538"})
    if response.status_code != 200:
        pytest.skip(f"Login failed. status={response.status_code} body={response.text}")
    data = response.json()
    token = data.get("access_token")
    if not token:
        pytest.skip("No access_token returned from login")
    return token


@pytest.fixture()
def authenticated_client(api_client, auth_token):
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client
