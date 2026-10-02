# 1.6.0 — LIVE CIRCUIT validation

Verified October 1, 2026 in the existing project and native Windows desktop client.

- Full gameplay suite passed, including actual matches, balance/meta preservation, physical headshots, resolved damage numbers, pointer capture, audio, models and 37,440 spread projectiles.
- Server suite passed 34 tests. Client checks passed, including six durable-storage quota/migration/restart/account-isolation cases. Update lifecycle checks passed, including Windows ownership/checkpoint handoff and a same-version cache whose update promise waits for activation.
- Tournament core passed official 72-hour schedules, registration, BO3/BO5 series, distinct placements, exact once-only payouts, custom zero earnings, persistence and replay. Profile tests passed wins, losses, zero-kill completion and tournament isolation through real combat and restart.
- Native UI passed nine groups: 2.5D-only loadout/operators, Phone, all 50 contacts, history/drafts, no generation on open, private owner controls, categorized notes, Calendar and four-match spectating. Native AR-15 and Tundra checks each passed five movement/ADS/cursor-distance groups.
- An uninterrupted native tournament match completed through ordinary gameplay. The actual ten-player result persisted once, advanced the bracket and preserved the normal player profile. Leaving and replaying the next unfinished game produced no duplicate result.
- All 22 models across the two GLBs validated; detail attachments cover all eight operators, the six requested weapons and the Blender phone. All 14 weapons passed distinct firing/reload/handling checks with licensed sources.
- A real local dialogue request returned asynchronously, generated a factually valid repeating-burst answer and persisted across restart without changing the world. Burst contradiction and temporary-provider-failure regressions passed. The original reported historical generation failure could not be attributed conclusively.
- The previous installed launcher completed its actual signed-update path. The final installed 1.6.0 executable and resources match the build; two final native launches loaded the existing authenticated account without a server blocker and committed its accepted world. Careers, familiarity, profiles, seasons, active telemetry and archives were retained.
- Existing Balance 6.0 fingerprint `b-ac586356` remains unchanged. Database schema 4 is additive; world schema 17 remains compatible. No lifetime or active-patch reset was performed for this release.

Final signed installer SHA-256: `da92179ea4ee092c131b3badc5f071f84d6ae7bd9008d643192d7ea96cd63fcc`.
Final native executable SHA-256: `86aaa382da8072e09f0af0d7528877e57ab83dc29e40783729202887cf796713`.
Activated shell: `sar-shell-1.6.0-live-circuit-2`.

Native checks used isolated accounts/databases for combat; existing-account checks did not start a human match. Account secrets, databases and private launcher configuration are excluded from the packaged resources. Windows itself was not restarted during this verification.
