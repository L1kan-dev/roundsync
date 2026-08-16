from demoparser2 import DemoParser
import pandas as pd

def parse_match_demo(dem_file_path: str):
    parser = DemoParser(dem_file_path)

    # Extract key events (e.g., player deaths, weapon fires)
    deaths_df = parser.parse_event("player_death")

    # Return summary statistics or structured dictionary payload
    return {
        "total_deaths": len(deaths_df),
        "raw_events_sample": deaths_df.head(10).to_dict(orient="records")
    }