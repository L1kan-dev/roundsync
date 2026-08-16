import urllib.parse

def get_steam_signin_url(redirect_uri: str) -> str:
    """
    Constructs the official Steam OpenID 2.0 login redirect URL manually.
    """
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
    # Streamlit query_params can sometimes return lists or strings
    cleaned_params = {
        key: (val[0] if isinstance(val, list) else val) 
        for key, val in query_params.items()
    }
    
    # Check if mode is valid and identity claimed is present
    claimed_id = cleaned_params.get("openid.claimed_id", "")
    if "openid.mode" in cleaned_params and cleaned_params["openid.mode"] == "id_res":
        # The SteamID64 is the trailing digits of the claimed_id URL
        # e.g., https://steamcommunity.com/openid/id/76561198xxxxxxxxx
        parts = claimed_id.split("/")
        steam_id = parts[-1]
        if steam_id.isdigit() and len(steam_id) == 17:
            return steam_id
            
    return None