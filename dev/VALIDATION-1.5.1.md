# In-place update verification — 1.5.1

Verified on 29 September 2026 inside the existing installed directory:
`C:/Users/Noah/Downloads/skirmish-arena-reimagined-live-update-1.5.0-pwa`.
The folder name, database location, account origin, stable save key and native
launcher remain the same. This update did not create another game or release ZIP.
The prior `VALIDATION-1.5.0.md` and `AUDIT.md` are historical evidence.

## Implemented changes

- Brightfield Blocks retains its actual roads, twelve house footprints, exits,
  cover and navigation. Presentation adds textured ground, sidewalks, raised
  curbs, crossings, paving joints, driveways, windows, trim, pitched roofs,
  thicker fences, volumetric trees and local Blender street/yard props.
- Every house has a smooth roof/upper-wall cutaway for nearby or interior
  combat. Overlapping foliage fades. Operators stand on the visible six-unit
  interior floor rather than intersecting it. Health/name/reload overlays project
  above the model and remain readable over cutaway geometry.
- All eight operator palettes and twelve weapon identities are represented in
  articulated procedural models. Animation uses the real movement, aiming,
  shot, reload, hit, death and respawn state. Class-specific mechanisms include
  Pump travel/shell loading, rifle magazines, P90 top-feed magazine, sniper bolt
  and pistol slides.
- The exact supplied official combat values apply to all twelve weapons.
  X-16 Auto is an automatic sidearm with 21/30 damage, 0.19-second cadence,
  26/104 ammunition and 1.60-second reload. Bots, careers, loadouts, models and
  current-patch telemetry include it. Primary Meta has nine rows; Sidearm Meta
  has three. Existing analytics and refresh behavior remain integrated.
- The sheet's inconsistent derived tile conversions were normalized using the
  established 70-unit tile size: AR-15 preferred range 900 is 12.86 tiles,
  X-16 Auto preferred range 430 is 6.14 tiles. Preferred range and combat values
  were preserved; the provided 13.36/5.91 derived labels were not accurate.
- The 2.5D mini/full map now receives Classic's actual player spotting result,
  preserving viewport and line-of-sight restrictions in player matches while
  showing all living participants to spectators.

## Automated checks

The full `npm test` chain passed during implementation. After the server's final
cached-client/season-transition fixes, `npm run test:server` passed all **11**
integration tests. Focused checks were run again for the final minimap correction.
Evidence JSON files retain the hash of the source actually tested.

Final `game.js` SHA-256:
`fe9e5bdab3b4fd3a0d64d1085c6dd6e71f8cd609a870f7fdb3c12edadf77403f`.
The final platform report references this exact source and includes the spotting
regression. Release file hashes and final observations are also recorded in
`verification-results-1.5.1.json`.

- Mechanics, district/navigation/migration, Meta, player-platform/countdown,
  P90 behavior and natural player-match checks passed. Navigation includes
  6,195 walkable cells and 72 actual building-exit routes.
- `balance-update-check.cjs` validates all twelve complete definitions,
  STK/TTK/loadout values, archived prior telemetry, unchanged bot IDs/careers,
  automatic X-16 Auto firing/reloading and real contribution counters.
- `models-25d-check.mjs`: **8/8** checks pass for weapon geometry, skin palettes,
  finite transforms, movement/aim/ADS, mechanisms, reloads, reactions,
  death/respawn and shared resource disposal.
- `environment-25d-check.mjs`: **5/5** checks pass, including all twelve house
  cutaways/restoration, foliage fading, finite geometry/asset placements and
  absence of simulation mutations.
- `tools/blender_validate.mjs` parses the actual exported GLB with the shipped
  Three loader, checks dimensions/normals/finite geometry and verifies memoized
  loading, independent shared-resource clones and static instance batches.
- `cloud-client-check.cjs`: **25** cloud/PWA checks pass, covering checkpoint
  ordering, offline/rejected/timed-out writes, recovery, conflicts, expired
  sessions, safe imports/logout, activation timing and a single reload.
- Server regressions cover actual eleven-to-twelve-weapon world migration,
  normalized SQL records, archive preservation, dormant season rollover and
  a cached old-client checkpoint before activation. Arbitrary/rehashed balance
  sheets, identity tampering, fresh-account old-sheet writes, stale revisions,
  fabricated new-weapon history and rollback after upgrading are rejected.

## Actual simulation observations

`simulation-results-balance4.json` records a seeded **100-match** run of the new
balance: 5,893.73 simulated seconds, 9,072 live kills and 2,501,036.39 actual
damage. X-16 Auto recorded 443 kills, 287 deaths and 6,913 shots. Combat, career,
match and patch counters reconcile. This used game source hash
`01d06c53ab609c89592e7176638d4499b0a71bd69f53005e05017c1f18244791`.
Later changes added presentation/snapshot fields and build labels; this report
is not represented as a 100-match run of those later bytes.

The separate 600-second P90 check recorded 1,783 real aimed engagements:
9.6492 tiles average engagement range, 7.7447 average kill range, 92.04% within
5–16 tiles and none above eighteen. Close emergency shots remain possible
while separation goals try to recover the intended range. These test results
were never inserted into the user's gameplay telemetry.

## Browser, update and performance evidence

Task-owned browser profiles used disposable test accounts/databases on ports
8804/8805. No test account was added to the installed account database.

- Real login, cloud checkpoint and reload retained selected P90/X-16 Auto
  loadouts and advanced the acknowledged revision.
- Primary/sidearm selection and weapon detail models worked. X-16 Auto body/head
  TTK displayed 2.09/1.52 seconds from the official current stats. Missing or
  immature measurements use the existing dash/LOW SAMPLE behavior.
- At a 390-pixel viewport, the page remained 390 pixels wide. Table content
  scrolled within its 296-pixel panel with sticky headers/weapon columns.
- The PWA transition used **the actual original 1.5.0 ZIP bytes**, including its
  old eleven-weapon game and worker. After logging into that cached release,
  publishing current files and clicking **Update Game**, the client checkpointed
  old progress, activated 1.5.1 and persisted twelve current weapons plus the
  preserved eleven-weapon archive. The observed world reached revision 13,
  current patch `b-381e3c8d-2`, with one archive. The fixture is documented in
  `pwa-upgrade-server.cjs` and uses an isolated in-memory database.
- After loading the final source, the real renderer consumed Boolean spotting
  fields for all ten match actors. A final checkpoint succeeded without pending
  or rejected progress at revision 78. Reload retained 2.5D mode, schema 17 and
  the preserved archive.
- The worker cache contained all **18** runtime assets. Renderer/model/GLB/loader
  requests succeeded with browser networking disabled. Offline Update reports
  the connection failure instead of inventing an up-to-date result.
- Live WebGL diagnostics showed one watched match with ten actors, twelve
  houses and sixty Blender prop placements. No browser errors were recorded.
  Screenshots include `1.5.1-battlefield-25d.png`, `1.5.1-player-25d.png`,
  `1.5.1-primary-meta.png`, `1.5.1-sidearm-meta.png`, `1.5.1-meta-mobile.png`
  and `1.5.1-after-pwa-upgrade.png`.
- Geometry batching reduced an observed spectator render from 2,406 calls /
  14.73 ms renderer work to about 1,205 calls / 6.84 ms. Player samples showed
  roughly 430–456 calls / 4.1–4.2 ms. A later active spectator frame showed
  1,233 calls / 7.82 ms. These are local renderer diagnostics, not full-frame
  FPS guarantees. Pixel ratio is capped at 1.5, shadows at 1536, geometry is
  frustum culled and static details are batched/instanced. Other matches do not
  receive separate 3D scenes.

## Blender source and limitation

Actual installed **Blender 5.2.2 LTS** generated/exported the shipped local asset
library and rendered its preview. The editable `.blend`, GLB, manifest, report,
scripts and pipeline documentation are included. Fourteen models comprise
52 meshes, 7,470 triangles and a 604,244-byte GLB.

A callable direct Blender AI addon/MCP service was not available in this
session. No direct AI connection is claimed. The working local Blender pipeline
and `docs/BLENDER_PIPELINE.md` provide clean ingestion for models produced by
that workflow, including local offline loading and animations.

## Installed server and preservation

The existing local server was restarted from this installation after backing
up its live database using SQLite's online backup API. It reports web version
**1.5.1**, database schema **2**, at `http://127.0.0.1:8803/`.

Latest pre-restart backup:
`C:/Users/Noah/AppData/Local/SkirmishArenaServer/backups/pre-1.5.1-1790719404153.sqlite`.
Both backup and live database returned `integrity_check: ok`.

Before/after restart counts matched: one account, one session, one world,
50 bots, 50 bot careers, 550 historical bot-weapon rows, eleven historical
player-weapon and patch rows, one message and 26 world backups. Existing
eleven-weapon records intentionally stay intact until that account activates
the update; migration then archives that patch and begins the new sample.
No production account/world reset, test signup or synthetic telemetry write
was performed.

All checked runtime endpoints returned HTTP 200; the GLB is served as
`model/gltf-binary`. The native launcher remains version 1.5.0 because its
binary did not change; it opens the updated game at the same account origin.
The existing original ZIP is the source rollback archive. Public hosting and
GPT inference still use the existing deployment configuration; this update
does not fabricate a hosted service or provider credentials.
