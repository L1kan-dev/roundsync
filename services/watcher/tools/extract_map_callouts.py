"""
Extracts real callout names + coordinates from CS2's own map files (env_cs_place
entities inside each map's .vmap, via Source 2's entity lump) and loads them into
the `dim_map_callout` Supabase table.

This is the reference data category 2 (utility effectiveness) needs to eventually
judge whether a smoke blocked the correct sightline/chokepoint. It does NOT judge
correctness itself yet -- that needs path-finding/sightline logic on top of this,
which isn't built. This script only produces the raw named-zone geometry.

Requirements:
  - CS2 installed locally (needs the actual .vpk map files under
    <CS2 install>/game/csgo/maps/).
  - Source2Viewer-CLI (the actively-maintained ValveResourceFormat CLI, NOT the
    abandoned CS2CalloutExtractor tool -- that one crashes on the current map
    format because it assumes `model` is a plain string; it's actually a typed
    `resource_name:` reference now). Download the matching platform build from
    https://github.com/ValveResourceFormat/ValveResourceFormat/releases
    (the `cli-windows-x64.zip` / `cli-linux-x64.zip` / etc asset).

Usage:
  python extract_map_callouts.py <path-to-cs2-install> <path-to-Source2Viewer-CLI-dir> [out-dir]

Re-run this (and load_map_callouts.py) whenever CS2 gets a map update -- there is
no automatic staleness detection, only staleness TRACKING: each row is tagged with
the game's ClientVersion (from steam.inf) at extraction time, and
sync_pipeline.py's parse_header() already captures a matching build number in
`game_directory` (e.g. "csgo_v2000885") for every newly-parsed match, so a future
consumer of this data can compare and flag when it's gone stale.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

if len(sys.argv) < 3:
    print("Usage: python extract_map_callouts.py <cs2-install-dir> <source2viewer-cli-dir> [out-dir]")
    sys.exit(1)

CS2_INSTALL_DIR = Path(sys.argv[1])
CS2_MAPS_DIR = CS2_INSTALL_DIR / "game" / "csgo" / "maps"
S2V_CLI = Path(sys.argv[2]) / "Source2Viewer-CLI.exe"
if not S2V_CLI.exists():
    S2V_CLI = Path(sys.argv[2]) / "Source2Viewer-CLI"  # non-Windows build name
if not S2V_CLI.exists():
    print(f"Source2Viewer-CLI not found under {sys.argv[2]}")
    sys.exit(1)

OUT_DIR = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("./callout_export")
OUT_DIR.mkdir(exist_ok=True)

# Full de_ map pool present in the game files as of this writing -- includes
# maps outside the current competitive rotation too, since the active pool
# rotates and it costs nothing extra to have the data ready.
MAPS = [
    "de_ancient", "de_anubis", "de_boulder", "de_cache", "de_debris",
    "de_dust2", "de_eldorado", "de_fachwerk", "de_inferno", "de_mirage",
    "de_nuke", "de_overpass", "de_poseidon", "de_train", "de_vertigo",
]

ENTITY_BLOCK_RE = re.compile(
    r"place_name\s+\"([^\"]+)\"[^\n]*\n"
    r"classname\s+\"env_cs_place\"[^\n]*\n"
    r"compile_source_id\s+\d+[^\n]*\n"
    r"origin\s+\[\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\]"
)


def get_client_version() -> int:
    steam_inf = CS2_INSTALL_DIR / "game" / "csgo" / "steam.inf"
    text = steam_inf.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"ClientVersion=(\d+)", text)
    if not match:
        raise RuntimeError(f"Could not find ClientVersion in {steam_inf}")
    return int(match.group(1))


def main():
    client_version = get_client_version()
    print(f"CS2 ClientVersion: {client_version} (matches sync_pipeline.py's game_directory field, e.g. 'csgo_v{client_version}')")

    all_callouts = {}
    for map_name in MAPS:
        vpk_path = CS2_MAPS_DIR / f"{map_name}.vpk"
        if not vpk_path.exists():
            print(f"SKIP {map_name}: vpk not found")
            continue

        list_result = subprocess.run(
            [str(S2V_CLI), "-i", str(vpk_path), "-l"],
            capture_output=True, text=True, timeout=60,
        )
        ents_lines = [l for l in list_result.stdout.splitlines() if "entities/default_ents.vents_c" in l]
        if not ents_lines:
            ents_lines = [l for l in list_result.stdout.splitlines() if "entities/" in l and ".vents_c" in l]
        if not ents_lines:
            print(f"SKIP {map_name}: no vents_c entity file found")
            continue
        vents_path = ents_lines[0].split(" CRC:")[0].strip()

        out_file = OUT_DIR / f"{map_name}_ents.txt"
        decompile_result = subprocess.run(
            [str(S2V_CLI), "-i", str(vpk_path), "-o", str(out_file), "-d", "--vpk_filepath", vents_path],
            capture_output=True, text=True, timeout=60,
        )
        if not out_file.exists():
            print(f"FAIL {map_name}: decompile did not produce output. stderr: {decompile_result.stderr[:300]}")
            continue

        text = out_file.read_text(encoding="utf-8", errors="replace")
        matches = ENTITY_BLOCK_RE.findall(text)
        callouts = [
            {"callout_name": name, "origin_x": float(x), "origin_y": float(y), "origin_z": float(z)}
            for name, x, y, z in matches
        ]
        all_callouts[map_name] = callouts
        print(f"OK {map_name}: {len(callouts)} callouts")

    output = {"client_version": client_version, "maps": all_callouts}
    with open(OUT_DIR / "all_callouts.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print()
    print(f"TOTAL MAPS: {len(all_callouts)}")
    print(f"TOTAL CALLOUTS: {sum(len(v) for v in all_callouts.values())}")
    print(f"Wrote {OUT_DIR / 'all_callouts.json'} -- run load_map_callouts.py against it next.")


if __name__ == "__main__":
    main()
