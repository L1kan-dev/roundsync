import re
import time
import streamlit as st
import pandas as pd
from supabase import create_client
from steam_auth import get_steam_signin_url, validate_steam_callback
from ai_coach import generate_coaching_response
from sync_pipeline import process_single_demo, sync_user_matches, get_single_match_info

# Page Config
st.set_page_config(page_title="RoundSync - CS2 AI Coach", page_icon="🎮", layout="wide")

# Initialize Supabase Client
def init_supabase():
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets.get("SUPABASE_SERVICE_ROLE_KEY") or st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

supabase = init_supabase()

# Initialize Session State
if "steam_id64" not in st.session_state:
    st.session_state.steam_id64 = None

# Handle Steam OpenID Callback Parameters
query_params = st.query_params
if "openid.claimed_id" in query_params and not st.session_state.steam_id64:
    steam_id = validate_steam_callback(query_params)
    if steam_id:
        st.session_state.steam_id64 = str(steam_id)
        try:
            supabase.table("users").upsert({
                "steam_id64": str(steam_id)
            }, on_conflict="steam_id64").execute()
        except Exception as e:
            print(f"Failed to sync user to Supabase: {e}")
            
        st.success(f"Successfully authenticated with Steam! SteamID: {steam_id}")
        st.query_params.clear()
        st.rerun()

# Sidebar Navigation
st.sidebar.markdown("### 🎯 **RoundSync**")
nav_selection = st.sidebar.radio(
    "Navigation",
    ["🏠 Home / Auth", "📊 Stats Dashboard", "🤖 AI Coach Chat"],
    label_visibility="collapsed"
)

if "Home" in nav_selection:
    app_mode = "Home / Auth"
elif "Stats" in nav_selection:
    app_mode = "Stats Dashboard"
else:
    app_mode = "AI Coach Chat"

st.title("RoundSync 🎯 Automated CS2 AI Coach")

# TAB 1: HOME / AUTH
if app_mode == "Home / Auth":
    st.subheader("Welcome to RoundSync")
    
    if st.session_state.steam_id64:
        st.success(f"Signed in as SteamID: `{st.session_state.steam_id64}`")
        
        # Fetch user profile
        user_query = supabase.table("users").select("*").eq("steam_id64", st.session_state.steam_id64).execute()
        user_data = user_query.data[0] if user_query.data else None

        # 1. ONE-TIME ONBOARDING
        if not user_data or not user_data.get("last_known_code") or not user_data.get("game_auth_code"):
            st.markdown("### 🔑 One-Time Setup")
            st.info("Provide your CS2 Game Auth Code and 1 recent Match Share Code to enable automatic tracking.")
            
            auth_code_input = st.text_input("Game Authentication Code", type="password")
            share_code_input = st.text_input("1 Recent Match Share Code (e.g. CSGO-XXXXX-...)")
            
            if st.button("Verify & Activate Auto-Sync", type="primary"):
                if auth_code_input and share_code_input:
                    with st.spinner("Verifying credentials with Valve API..."):
                        match_info = get_single_match_info(
                            st.session_state.steam_id64, 
                            auth_code_input, 
                            share_code_input
                        )
                        
                        if not match_info.get("is_valid"):
                            st.error("❌ Verification Failed: Invalid Game Auth Code or Match Share Code. Please check your inputs.")
                        else:
                            st.info("Credentials verified! Syncing match history...")
                            sync_user_matches(
                                steam_id64=st.session_state.steam_id64,
                                auth_code=auth_code_input,
                                start_code=share_code_input,
                                supabase=supabase
                            )
                            supabase.table("users").upsert({
                                "steam_id64": st.session_state.steam_id64,
                                "game_auth_code": auth_code_input,
                                "last_known_code": share_code_input
                            }, on_conflict="steam_id64").execute()
                            
                            st.success("Setup complete and matches synced successfully!")
                            st.rerun()
                else:
                    st.error("Please fill in both fields.")

        # 2. AUTO-SYNC FOR RETURNING USERS
        else:
            existing_code = user_data.get("game_auth_code")
            last_code = user_data.get("last_known_code")
            
            st.markdown("### 🔄 Sync Match History")
            st.caption(f"Last synced match code: `{last_code}`")
            
            if st.button("Check & Auto-Sync New Matches"):
                with st.spinner("Checking Valve servers for new matches..."):
                    try:
                        new_count = sync_user_matches(
                            steam_id64=st.session_state.steam_id64,
                            auth_code=existing_code,
                            start_code=last_code,
                            supabase=supabase
                        )
                        if new_count > 0:
                            st.toast(f"Successfully synced {new_count} new match(es)!")
                            st.rerun()
                        else:
                            st.info("You are already up to date!")
                    except Exception as e:
                        st.error(f"Sync failed: {e}")

            st.divider()
            if st.button("🚨 Reset Account & Clear Data"):
                supabase.table("matches").delete().eq("steam_id64", st.session_state.steam_id64).execute()
                supabase.table("users").delete().eq("steam_id64", st.session_state.steam_id64).execute()
                st.session_state.clear()
                st.rerun()

    else:
        st.info("Please sign in with your Steam account to analyze your CS2 matches.")
        login_url = get_steam_signin_url()
        
        st.markdown(
            f"""
            <div style="margin-top: 10px;">
                <a href="{login_url}" target="_self" style="display: inline-block; background-color: #ff4b4b; color: white; padding: 0.5rem 1rem; border-radius: 0.25rem; text-decoration: none; font-weight: 600;">
                    🎮 Sign in through Steam
                </a>
            </div>
            """,
            unsafe_allow_html=True
        )

# TAB 2: STATS DASHBOARD
elif app_mode == "Stats Dashboard":
    st.subheader("Your Performance Trends")
    if not st.session_state.steam_id64:
        st.warning("Please sign in with Steam on the 'Home / Auth' tab first.")
    else:
        matches_response = supabase.table("matches").select("*").eq("steam_id64", st.session_state.steam_id64).execute()
        
        if not matches_response.data:
            st.info("No matches found in the database. Head to the 'Home / Auth' tab to sync your latest matches.")
        else:
            raw_matches = matches_response.data
            telemetry_list = []
            
            for row in raw_matches:
                data = row.get("match_data", {})
                if "telemetry" in data:
                    t = data["telemetry"]
                    # Filter only fully parsed matches to prevent crashes on pending matches
                    if t.get("status") == "fully_parsed":
                        t["match_id"] = row.get("match_id", "Unknown")
                        telemetry_list.append(t)

            if not telemetry_list:
                st.warning("Matches found, but no parsed telemetry is available yet. Ensure your background watcher is running!")
            else:
                df_stats = pd.DataFrame(telemetry_list)

                # Ensure required columns exist with default fallbacks
                for col in ["kd_ratio", "adr", "headshot_pct", "kills", "deaths", "flashes_thrown", "smokes_thrown"]:
                    if col not in df_stats.columns:
                        df_stats[col] = 0

                avg_kd = round(df_stats["kd_ratio"].mean(), 2)
                avg_adr = round(df_stats["adr"].mean(), 1)
                avg_hs_pct = round(df_stats["headshot_pct"].mean(), 1)
                total_flashes = int(df_stats["flashes_thrown"].sum())
                total_smokes = int(df_stats["smokes_thrown"].sum())

                m1, m2, m3, m4 = st.columns(4)
                m1.metric(label="Matches Analyzed", value=len(df_stats))
                m2.metric(label="Avg K/D Ratio", value=f"{avg_kd}")
                m3.metric(label="Avg ADR", value=f"{avg_adr}")
                m4.metric(label="Avg Headshot %", value=f"{avg_hs_pct}%")

                st.divider()

                col_left, col_right = st.columns(2)
                with col_left:
                    st.write("### 📈 K/D Ratio per Match")
                    st.line_chart(df_stats.set_index("match_id")["kd_ratio"])

                with col_right:
                    st.write("### 🎯 ADR per Match")
                    st.bar_chart(df_stats.set_index("match_id")["adr"])

                st.write("### 💣 Utility Usage Breakdown")
                u_col1, u_col2 = st.columns(2)
                u_col1.metric(label="Total Flashbangs Thrown", value=total_flashes)
                u_col2.metric(label="Total Smokes Thrown", value=total_smokes)

                with st.expander("View Breakdown Table"):
                    st.dataframe(
                        df_stats[["match_id", "kills", "deaths", "kd_ratio", "adr", "headshot_pct", "flashes_thrown", "smokes_thrown"]],
                        use_container_width=True
                    )

# TAB 3: AI COACH CHAT
elif app_mode == "AI Coach Chat":
    st.subheader("Conversational AI Coach")
    if not st.session_state.steam_id64:
        st.warning("Please sign in with Steam first to give your AI coach access to your match telemetry.")
    else:
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
                with st.spinner("Analyzing your match telemetry with Gemini..."):
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