# Map callout data (`dim_map_callout`)

Reference geometry for named map zones (Apartments, Palace, Connector, etc.),
extracted directly from CS2's own map files. This is what the eventual smoke-
effectiveness judgment (category 2 of the coaching fact-table design, currently
deliberately deferred) will need — knowing which named chokepoint a smoke landed
in or blocked line-of-sight to.

## Why this exists as a separate offline extraction, not live game data

CS2 stores callout names as `env_cs_place` entities inside each map's compiled
`.vmap` file — not in demo files, not reachable via the Game Coordinator. The
only way to get it is decompiling the actual map files.

## Re-running this (needed after CS2 map updates — geometry is not automatically kept fresh)

1. Requires CS2 installed locally, and the actively-maintained
   [Source2Viewer-CLI](https://github.com/ValveResourceFormat/ValveResourceFormat/releases)
   (grab the zip matching your OS, e.g. `cli-windows-x64.zip`).

   **Do not use `CS2CalloutExtractor`** (a different, abandoned third-party tool
   that looked promising in initial research) — it crashes on the current map
   format (`InvalidCastException` on the `model` property, which is now a typed
   `resource_name:` reference, not a plain string). Confirmed by actually running
   it, not assumed.

2. Extract:
   ```
   python extract_map_callouts.py "<CS2 install dir>" "<Source2Viewer-CLI dir>" ./callout_export
   ```

3. Load into Supabase:
   ```
   python load_map_callouts.py ./callout_export/all_callouts.json
   ```

## Staleness tracking, not staleness prevention

Every row is tagged with `extracted_client_version` (from CS2's local
`steam.inf`, `ClientVersion=`). `sync_pipeline.py`'s `parse_header()` already
captures a matching build number in every parsed match's `game_directory` field
(e.g. `"csgo_v2000885"`). **Nothing currently compares these automatically** —
there's no code today that flags "this match's client version doesn't match the
callout data's extraction version." That comparison needs to be built once
something actually consumes `dim_map_callout` for a real judgment (the eventual
smoke-correctness feature) — this is a known, deliberate gap, not an oversight.

## What this data does NOT include yet

Just named-zone center points (`origin_x/y/z`), not full bounding volumes. A
smoke-correctness check would ideally know the full 3D extent of each callout
zone, not just its center — that requires parsing the zone's `.vmdl` model +
physics hull data too, which the abandoned `CS2CalloutExtractor` attempted and
crashed on. Not attempted here; nearest-callout-center is the current fidelity
level. Upgrade path if ever needed, not started.
