import urllib.parse
import streamlit as st

def get_dynamic_redirect_uri() -> str:
    """
    Dynamically determines the correct redirect URI for local development or Streamlit Cloud.
    """
    # 1. Check if an explicit APP_URL is defined in Streamlit secrets
    try:
        if "APP_URL" in st.secrets:
            return st.secrets["APP_URL"]
    except Exception:
        pass

    # 2. Try to infer automatically from Streamlit context headers
    try:
        headers = st.context.headers
        host = headers.get("host")
        if host:
            proto = "https" if "localhost" not in host else "http"
            return f"{proto}://{host}/"
    except Exception:
        pass

    # 3. Fallback for local testing
    return "http://localhost:8501/"

def get_steam_signin_url(redirect_uri: str = None) -> str:
    """
    Constructs the official Steam OpenID 2.0 login redirect URL manually.
    """
    if not redirect_uri:
        redirect_uri = get_dynamic_redirect_uri()

    steam_login_url = "https://steamcommunity.com/openid/login"
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": redirect_uri,
        "openid.realm": redirect_uri,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{steam_login_url}?{urllib.parse.urlencode(params)}"

def validate_steam_callback(query_params: dict) -> str:
    """
    Extracts and validates the SteamID64 from the OpenID callback query parameters.
    """
    cleaned_params = {
        key: (val[0] if isinstance(val, list) else val) 
        for key, val in query_params.items()
    }
    
    claimed_id = cleaned_params.get("openid.claimed_id", "")
    if "openid.mode" in cleaned_params and cleaned_params["openid.mode"] == "id_res":
        parts = claimed_id.split("/")
        steam_id = parts[-1]
        if steam_id.isdigit() and len(steam_id) == 17:
            return steam_id
            
    return None