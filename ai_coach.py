import os
from google import genai
import streamlit as st

def get_player_match_history(supabase_client, steam_id64: str):
    """
    Fetches cached match telemetry payloads for the user from Supabase safely.
    """
    try:
        response = supabase_client.table("matches").select("match_data").eq("steam_id64", steam_id64).execute()
        return response.data if response.data else [{"note": "No match data synced yet. Play a match or run a sample sync."}]
    except Exception as e:
        return [{"note": f"Could not fetch matches: {str(e)}"}]

def generate_coaching_response(supabase_client, steam_id64: str, user_query: str, gemini_api_key: str):
    """
    Fetches match history from Supabase and injects it into Gemini to generate personalized CS2 coaching notes.
    """
    client = genai.Client(api_key=gemini_api_key)
    
    # Fetch cached telemetry data from Supabase
    matches = get_player_match_history(supabase_client, steam_id64)
    
    context_payload = f"Player match telemetry history: {matches}"
    
    prompt = f"""
    You are RoundSync, an expert, direct, and tactical Counter-Strike 2 AI coach.
    Here is the player's recent match history data cached from their games:
    {context_payload}
    
    Player's Question / Request: {user_query}
    
    Provide sharp, data-driven, actionable feedback to help them improve their gameplay, aim, or tactical awareness. Keep your response concise and focused.
    """
    
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=prompt,
    )
    return response.text