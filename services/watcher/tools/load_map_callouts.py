"""
Loads the output of extract_map_callouts.py into the `dim_map_callout` Supabase
table. Wipes and replaces ALL rows each run (simplest correct behavior for a
reference table that's fully regenerated from the game files each time, not
incrementally updated).

Usage:
  python load_map_callouts.py <path-to-all_callouts.json>

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (same
as sync_pipeline.py).
"""

import json
import os
import sys
from supabase import create_client

if len(sys.argv) < 2:
    print("Usage: python load_map_callouts.py <path-to-all_callouts.json>")
    sys.exit(1)

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
if not url or not key:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env variables.")
supabase = create_client(url, key)

payload = json.load(open(sys.argv[1], encoding="utf-8"))
client_version = payload["client_version"]

rows = []
for map_name, callouts in payload["maps"].items():
    for c in callouts:
        rows.append({
            "map_name": map_name,
            "callout_name": c["callout_name"],
            "origin_x": c["origin_x"],
            "origin_y": c["origin_y"],
            "origin_z": c["origin_z"],
            "extracted_client_version": client_version,
        })

print(f"Replacing dim_map_callout with {len(rows)} rows (client_version {client_version})...")
supabase.table("dim_map_callout").delete().neq("id", 0).execute()

batch_size = 200
for i in range(0, len(rows), batch_size):
    batch = rows[i:i + batch_size]
    supabase.table("dim_map_callout").insert(batch).execute()
    print(f"  inserted {i + len(batch)}/{len(rows)}")

print("Done.")
