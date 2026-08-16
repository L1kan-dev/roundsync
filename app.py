import streamlit as st
from supabase import create_client

# Page Config
st.set_page_config(page_title="RoundSync - CS2 AI Coach", page_icon="🎮", layout="wide")

# Initialize Supabase Client
@st.cache_resource
def init_supabase():
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

supabase = init_supabase()

# App Layout Shell
st.title("RoundSync 🎯 Automated CS2 AI Coach")
st.sidebar.title("Navigation")
app_mode = st.sidebar.selectbox("Choose a view", ["Home / Auth", "Stats Dashboard", "AI Coach Chat"])

if app_mode == "Home / Auth":
    st.subheader("Welcome to RoundSync")
    st.write("Sign in to sync your match history and unlock personalized AI coaching.")
    # Placeholder for Steam OpenID / Supabase Auth login UI

elif app_mode == "Stats Dashboard":
    st.subheader("Your Performance Trends")
    st.info("Match telemetry cached from Supabase will display here.")

elif app_mode == "AI Coach Chat":
    st.subheader("Conversational AI Coach")
    st.chat_input("Ask your AI coach about your positioning, aim, or recent matches...")