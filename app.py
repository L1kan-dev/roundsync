import re
import streamlit as st
from supabase import create_client
from steam_auth import get_steam_signin_url, validate_steam_callback
from sync_pipeline import process_and_sync_matches
from ai_coach import generate_coaching_response

# Page Config
st.set_page_config(page_title="RoundSync - CS2 AI Coach", page_icon="🎮", layout="wide")

# Initialize Supabase Client
@st.cache_resource
def init_supabase():
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

supabase = init_supabase()

# Initialize Session State for Steam Authentication
if "steam_id64" not in st.session_state:
    st.session_state.steam_id64 = None

# App Layout Shell
st.title("RoundSync 🎯 Automated CS2 AI Coach")
st.sidebar.title("Navigation")
app_mode = st.sidebar.selectbox("Choose a view", ["Home / Auth", "Stats Dashboard", "AI Coach Chat"])

# Handle Steam OpenID Callback Parameters in URL
query_params = st.query_params
if "openid.claimed_id" in query_params and not st.session_state.steam_id64:
    steam_id = validate_steam_callback(query_params)
    if steam_id:
        st.session_state.steam_id64 = str(steam_id)
        
        # Upsert user record directly into Supabase
        try:
            supabase.table("users").upsert({
                "steam_id64": str(steam_id)
            }, on_conflict="steam_id64").execute()
        except Exception as e:
            print(f"Failed to sync user to Supabase: {e}")
            
        st.success(f"Successfully authenticated with Steam! SteamID: {steam_id}")
        st.query_params.clear()
        st.rerun()
    else:
        st.error("Steam authentication validation failed.")

if app_mode == "Home / Auth":
    st.subheader("Welcome to RoundSync")
    
    if st.session_state.steam_id64:
        st.success(f"Signed in as SteamID: `{st.session_state.steam_id64}`")
        
        # --- 1. GAME AUTH CODE SECTION ---
        st.markdown("### 🔑 CS2 Game Authentication")
        st.write("To automatically fetch your match history, provide your CS2 Game Authentication Code. You can generate this in Steam: **Inventory > Trade Offers > Who can send me Trade Offers? > Third-Party Sites** (or via the Steam Personal Data page).")
        
        # Fetch existing code to pre-fill the input
        user_data = supabase.table("users").select("game_auth_code").eq("steam_id64", st.session_state.steam_id64).execute()
        existing_code = user_data.data[0].get("game_auth_code") if user_data.data else None
        
        with st.form("auth_code_form"):
            auth_input = st.text_input("Game Auth Code", value=existing_code if existing_code else "", type="password")
            submitted = st.form_submit_button("Save Auth Code")
            
            if submitted:
                try:
                    supabase.table("users").update({"game_auth_code": auth_input}).eq("steam_id64", st.session_state.steam_id64).execute()
                    st.success("Game Auth Code securely saved to Supabase!")
                    existing_code = auth_input
                except Exception as e:
                    st.error(f"Failed to save Auth Code: {e}")

        # --- 2. MATCH SYNC SECTION ---
        st.markdown("### 🔄 Sync Match History")
        raw_match_input = st.text_input("Latest Match Share Code or Steam Link", placeholder="Paste CSGO-XXXXX... or http://replay...")
        
        cleaned_match_code = None
        if raw_match_input:
            if raw_match_input.strip().startswith(("http://", "https://")):
                cleaned_match_code = raw_match_input.strip()
                st.caption("Detected Direct Replay Link")
            else:
                match = re.search(r"(CSGO-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5})", raw_match_input)
                if match:
                    cleaned_match_code = match.group(1)
                    st.caption(f"Detected Match Code: `{cleaned_match_code}`")
                else:
                    st.warning("Could not detect a valid CS2 Match Code or Replay Link.")

        if st.button("Sync Latest Matches", disabled=not (existing_code and cleaned_match_code)):
            progress_bar = st.progress(0.0)
            status_text = st.empty()

            def update_ui_progress(downloaded, total, elapsed, stage):
                if stage == "downloading":
                    speed_mbps = (downloaded / (1024 * 1024)) / elapsed if elapsed > 0 else 0
                    downloaded_mb = downloaded / (1024 * 1024)

                    if total and total > 0:
                        total_mb = total / (1024 * 1024)
                        percent = min(downloaded / total, 0.70)  # Reserve 70-100% for decompress/parse
                        progress_bar.progress(percent)
                        status_text.markdown(
                            f"⬇️ **Downloading:** `{downloaded_mb:.1f} MB` / `{total_mb:.1f} MB` ({downloaded/total*100:.0f}%) "
                            f"| **Speed:** `{speed_mbps:.2f} MB/s` | **Time:** `{elapsed:.1f}s`"
                        )
                    else:
                        progress_bar.progress(0.35)
                        status_text.markdown(
                            f"⬇️ **Downloading:** `{downloaded_mb:.1f} MB` "
                            f"| **Speed:** `{speed_mbps:.2f} MB/s` | **Time:** `{elapsed:.1f}s`"
                        )

                elif stage == "decompressing":
                    progress_bar.progress(0.75)
                    status_text.markdown("📦 **Decompressing `.dem.bz2` replay file...**")

                elif stage == "parsing":
                    progress_bar.progress(0.88)
                    status_text.markdown("⚡ **Parsing tick telemetry with `demoparser2`...**")

                elif stage == "saving":
                    progress_bar.progress(0.96)
                    status_text.markdown("💾 **Caching telemetry into Supabase...**")

            try:
                process_and_sync_matches(
                    supabase_client=supabase,
                    steam_id64=st.session_state.steam_id64,
                    auth_code=existing_code,
                    match_code=cleaned_match_code,
                    progress_callback=update_ui_progress
                )
                progress_bar.progress(1.0)
                status_text.empty()
                st.success("Match successfully parsed and cached in Supabase!")
                st.rerun()
            except Exception as e:
                status_text.empty()
                st.error(f"Sync failed: {e}")
                    
        if st.button("Sign Out"):
            st.session_state.steam_id64 = None
            st.rerun()
    else:
        st.write("Sign in with your Steam account to link your match history and unlock personalized AI coaching.")
        redirect_uri = "http://localhost:8501"
        steam_login_url = get_steam_signin_url(redirect_uri)
        
        st.markdown(
            f"""
            <a href="{steam_login_url}" target="_self">
                <button style="background-color: #171a21; color: white; border: none; padding: 10px 20px; font-size: 16px; border-radius: 5px; cursor: pointer;">
                    🚀 Sign in with Steam
                </button>
            </a>
            """,
            unsafe_allow_html=True
        )

elif app_mode == "Stats Dashboard":
    st.subheader("Your Performance Trends")
    if not st.session_state.steam_id64:
        st.warning("Please sign in with Steam on the 'Home / Auth' tab first.")
    else:
        matches_response = supabase.table("matches").select("*").eq("steam_id64", st.session_state.steam_id64).execute()
        
        if not matches_response.data:
            st.info("No matches found in the database. Head to the 'Home / Auth' tab to sync your latest matches.")
        else:
            st.success(f"Loaded {len(matches_response.data)} cached matches!")
            
            col1, col2, col3 = st.columns(3)
            col1.metric(label="Matches Analyzed", value=len(matches_response.data))
            col2.metric(label="Avg K/D Ratio", value="1.15", delta="0.05")
            col3.metric(label="Win Rate", value="55%", delta="-2%")
            
            with st.expander("View Raw Match Data (JSONB)"):
                st.json(matches_response.data)

elif app_mode == "AI Coach Chat":
    st.subheader("Conversational AI Coach")
    
    if not st.session_state.steam_id64:
        st.warning("Please sign in with Steam first to give your AI coach access to your match telemetry.")
    else:
        st.write("Ask your AI coach questions about your positioning, aim consistency, or recent matches.")
        
        if "messages" not in st.session_state:
            st.session_state.messages = []

        for message in st.session_state.messages:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])

        if user_prompt := st.chat_input("How can I improve my entry fragging?"):
            st.session_state.messages.append({"role": "user", "content": user_prompt})
            with st.chat_message("user"):
                st.markdown(user_prompt)

            with st.chat_message("assistant"):
                with st.spinner("Analyzing your match telemetry with Gemini Flash..."):
                    try:
                        ai_reply = generate_coaching_response(
                            supabase, 
                            st.session_state.steam_id64, 
                            user_prompt, 
                            st.secrets["GEMINI_API_KEY"]
                        )
                        st.markdown(ai_reply)
                        st.session_state.messages.append({"role": "assistant", "content": ai_reply})
                    except Exception as e:
                        st.error(f"Failed to generate AI response: {e}")