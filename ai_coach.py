from google import genai
import streamlit as st

def get_ai_coaching_advice(player_match_stats: str, user_query: str):
    client = genai.Client(api_key=st.secrets["GEMINI_API_KEY"])

    prompt = f"""
    You are RoundSync, an expert, direct CS2 AI coach. 
    Here is the player's recent match telemetry payload:
    {player_match_stats}

    User Question: {user_query}

    Provide sharp, actionable, data-driven improvement advice.
    """

    response = client.models.generate_content(
        model="gemini-2.5-flash", # Or gemini-3.5-flash depending on your key configuration
        contents=prompt,
    )
    return response.text