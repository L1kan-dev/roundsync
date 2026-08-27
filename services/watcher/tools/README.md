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

## Staleness tracking AND a real check (added 2026-08-27)

Every row is tagged with `extracted_client_version` (from CS2's local
`steam.inf`, `ClientVersion=`). `sync_pipeline.py` now reads the matching
build number out of every parsed match's own `game_directory` field (e.g.
`"csgo_v2000885"`) and compares it against `dim_map_callout`'s
`extracted_client_version` for that map every time a bomb plant needs
resolving. If the match's version is newer than the stored callout data,
it prints a `⚠️ STALE CALLOUT DATA` warning naming the map — visible in the
watcher's logs, not silent. It does **not** block anything (the bomb-site
resolver still runs on the old coordinates, which is still better than no
coordinates), it just makes an actual CS2 map update to a re-extracted
map's zones visible instead of silently assumed current.

## What this data does NOT include yet

Just named-zone center points (`origin_x/y/z`), not full bounding volumes. A
smoke-correctness check would ideally know the full 3D extent of each callout
zone, not just its center — that requires parsing the zone's `.vmdl` model +
physics hull data too, which the abandoned `CS2CalloutExtractor` attempted and
crashed on. Not attempted here; nearest-callout-center is the current fidelity
level. Upgrade path if ever needed, not started.
