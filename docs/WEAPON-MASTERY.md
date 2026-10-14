# Weapon mastery

`weapon-mastery.js` owns progression, action weights, challenge definitions,
badge tiers and class selection. `CONFIG.revision` is independent of application,
balance, AI, account XP and Ranked versions. The current track has ten levels;
future weapons enter automatically through the shipped weapon registry.

`server/weapon-mastery.cjs` accepts resolved authoritative results, with one
immutable receipt per account/game. It checks membership, eligibility, revision
and weapon totals before updating the separate ledger. Official scheduled games
use the trusted simulation result path; unverified client tournament reports
cannot award mastery. Historical completed matches are not replayed into the new
track. Existing careers and Weapon Meta stay intact.

Combat awards use actual HP removed, kills and headshot kills. Equipped-time XP
requires observed combat and is capped relative to combat XP. A win requires
meaningful use of that weapon. Life-streak challenges use recorded per-weapon
kills and reset on death. Missed shots and zero-XP damage still enter eligible
weapon statistics. Challenges award their bonus once.

Eligible sessions are casual permanent modes, Ranked TDM/Deathmatch and official
tournaments. Custom, practice, custom tournaments, replay, debug and unapproved
limited-time sessions do not qualify. Reconnect, result redelivery and opening UI
cannot add progress. Offline mastery is an account-scoped verified cache for
inspection; the client cannot upload a replacement mastery ledger.

Schema 15 adds six mastery tables. Existing database contents remain untouched;
the established migration workflow preserves a verified original before
applying the migration. Trusted older imports may omit only tables introduced
after their declared schema. Current exports must include mastery records.

Five cosmetic badges unlock through each weapon's track. Additional rewards are
explicit immutable definitions in `SAR_MASTERY_REWARDS`, a bounded JSON array:

```json
[{"id":"fal-profile","name":"FAL Profile","weapon":"FAL","level":3,"type":"profile-icon","payload":{"asset":"/assets/branding/app-256.png"}}]
```

Supported types are `mastery-badge`, `profile-icon`, `profile-banner` and future
`weapon-cosmetic`. Public assets must exist; weapon cosmetics require exported
GLB assets. Empty configuration adds no extra rewards. No gameplay buff or
currency reward is granted. Claims require stable request IDs and equipment
requires owned rewards. Sandbox/production ownership remains separated.

`docs/WEAPON-MASTERY-ASSETS.md` records the editable Blender sources, export and
shared inspection pipeline. Runtime ships only the manifest and GLB. The
Loadout mastery button opens real progress, statistics, challenges and rewards.
The existing Ranked weapon badge remains a separate competitive cosmetic.
