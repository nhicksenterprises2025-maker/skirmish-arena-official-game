# OVERCLOCK handoff — Runs 1 and 2 complete

Continue in this checkout on main. One staged release: **1.12.0 / application 1.12 OVERCLOCK**, shell **overclock-4** for Run 2 (Run 1 measured shell overclock-3). Installed/public baseline remains **1.11.0 BLUE CIRCUIT**. No publication or installation performed. Keep **Weapon Balance 8.0**, fingerprint **b-b9bdf00b**, analytics schema **1**. Run 3 accumulates verified notes into this release; update timestamp/cache revision at final delivery. No Store/Stripe work was performed in Run 1.

## Modified paths and contracts

- `game.js`: saved `CONFIG.maximumFPS` = 0 (Unlimited), 60,120,144,165,200,240,300,360. Missing/invalid → Unlimited, preserving the existing effective default. Settings → Game → View & display applies live. `renderFrameDue()` gates only rendering/debug on the existing rAF chain; simulation/audio remain before that gate. Deadline resets on cap/focus/visibility/resize, with no busy loop or extra rAF.
- `game.js`, `styles.css`, `renderer-25d.mjs`: saved integer `CONFIG.hudSize` 75–140, default 100, live preview/Reset under Gameplay. Snapshot carries `hudSize`, `hudMinimapTop`, `hudMinimapBottom` (CSS pixels, cached via ResizeObserver/resize). HUD panels reflow; minimap fits between header and lower HUD at short window sizes. Full map, Phone, menus, reticle, aim, camera and world labels stay unchanged. Four Settings tabs retained. Renderer diagnostic memory values are resource **counts**, not bytes.
- `environment-25d.mjs`: resolve/freeze fixed local/world matrices once, including asynchronous GLB instance groups. Actors, shadows, tree/roof cutaways remain dynamic; geometry/layout/collision unchanged.
- `vendor/three.core.js`: local UUID-only patch uses a reusable Web Crypto buffer. Preserve this on vendor updates: render/preview object creation must not advance gameplay Math.random. UUID API/format unchanged; supported browser/WebView2/Node runtime provides Web Crypto.
- `dev/release-meta.cjs`: synchronizes existing visible launcher/home labels and match-version fallback. Generated metadata: `version.json`, `build-meta.js`, `index.html`, root/launcher package + lock files, launcher Cargo manifest/lock, Tauri config and `launcher/ui/index.html`. Prior release history retained exactly. App IDs, storage keys and update channel unchanged.
- Tests: `dev/overclock-timing-check.cjs`, `dev/overclock-ui-check.cjs`, `dev/overclock-render-rng-check.mjs`, updated `dev/environment-25d-check.mjs`.

## Actual measurements

Evidence and reusable native harness: `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/overclock-run1/`. Native baseline launches `C:/Users/Noah/AppData/Local/Skirmish Arena Reimagined/skirmish-launcher.exe`; candidate launches `launcher/src-tauri/target/release/skirmish-launcher.exe`. Both use isolated clones of the prior synthetic authenticated account, never owner data. Final candidate verifies actual game, renderer, environment, Three, CSS, HTML and metadata SHA-256 against source.

Ryzen 7 5700 (8c/16t), 31.88 GiB RAM, RTX 5060 / 8,151 MiB, driver 617.14; Windows 1920×1080@120Hz, game 1920×1080,DPR 1, WebView2/ANGLE D3D11. Antialiasing, ACES 1.08 and PCF soft 1536² shadows unchanged. Four scheduled ten-participant slots continue simulating; only the viewed match renders. Combat camera holds a stationary human at spawn while the matches play; combat is naturally evolving, not a replay.

Before → final candidate. Combat/effects/tactical samples 40s; Phone/models repeat six opens/closes. Rates measure real render submissions, not simulation ticks or proven physical presentations.

| Scene | Submissions/s | Frame p95 ms | Mean render CPU ms | Mean sampled GPU ms | JS heap range MiB |
| --- | ---: | ---: | ---: | ---: | --- |
| Combat | 118.25 → 118.85 | 9.80 → 9.40 | 5.01 → 5.77 | 3.23 → 5.46 | 59.06–128.04 → 54.79–144.52 |
| Combat/effects | 118.46 → 118.03 | 9.70 → 9.70 | 5.18 → 5.81 | 3.48 → 4.23 | 58.96–138.85 → 60.22–144.25 |
| Tactical | 73.04 → 83.65 | 17.20 → 14.50 | 11.69 → 10.24 | 9.15 → 8.24 | 56.21–140.57 → 62.29–170.09 |
| Phone cycling | 71.95 → 75.02 | 17.50 → 19.90 | 11.77 → 11.36 | 9.12 → 9.11 | 110.24–158.30 → 61.38–96.37 |
| Model cycling | 67.09 → 83.14 | 20.70 → 15.30 | 12.14 → 10.08 | 9.71 → 8.10 | 68.70–158.18 → 61.13–121.46 |

Combat p50/p99: 8.30/13.00 → 8.30/13.30 ms; Combat/effects p50/p99: 8.30/12.90 → 8.30/13.00 ms; Tactical p50/p99: 13.20/23.80 → 11.60/19.30 ms. Native start-to-ready: 6.64 → 8.35s; candidate warm reopen 6.71s. First upgrade includes cache activation; no loading-speed improvement claim. Final native tactical cap samples: 60: 60.00, 144: 83.31, 240: 83.63, 300: 83.23, unlimited: 84.32 submissions/s.

CPU profiling identified shadow/object submission, vertex-array binding, frustum checks and matrix calculation. Baseline tactical view ~3,014 draw calls, combat 537; natural roster/visibility changes affect counts. Paired 6,000-iteration static-matrix microbenchmark: mean 0.1225→0.0356ms, p95 0.2007→0.0585ms; geometry/world/instance matrices exactly equal. This saves ~0.087ms in that operation, not a whole-frame percentage claim.

Both builds completed ~102s combat/preview cycling. Closed-card resident models return to 0, one preview context remains, preview rAF stops. Stress scenes can cross match/view transitions, so their aggregate FPS is not a like-for-like speed comparison. Final stress JS heap ranged 61.17–116.65MiB; geometry count stabilized at 1,079 for the final 44.01s. This is bounded observation, not proof of no leaks. Separate ~8.5s/32KiB heap samples estimate 70.57 → 69.31MB/s allocation; CPU sampled GC 15.43 → 17.38ms (0.19 → 0.21%). Sampled intervals add overhead, are not exact GC events, and establish no causal improvement.

Local dialogue: baseline validated one reply in 53.85s while playing; quiet 118.86→generation 89.88 submissions/s, p95 9.5→21.9ms, system GPU peaked 98–99% (7,640MiB VRAM). Candidate quiet → generation: 119.89 → 112.67 submissions/s; p95 8.90 → 12.50 ms. Reply status COMPLETED, validated=true, combat maintained=true; 106.54s request-to-observed-completion. Integration untouched; GPU contention remains.

## Verification actually run

- Timing: 6 groups: all nine caps, exact controlled simulation/save/audio-event/substep equality; fire/burst/projectile/movement/dash/regen/clocks, real results, overtime and four-slot cooldowns; duplicate finalization; jitter/live switches/60Hz host/focus/hidden/resume. Uses seeded host timestamps and graphics/audio output stubs, not arbitrary-refresh full-render determinism.
- Real Edge/WebGL HUD: 48 layouts (combat frozen only in an intercepted test response) (four modes × four sizes including 800×520 × three scales), plus 6 minimum-window cases; 7+5 groups, no page errors. Coordinate clicks, Phone/fullmap/reticle/world invariance, settings persistence/Reset, protected progression/ELO/careers/seasons/constants/archives.
- RNG: 4 groups, 10,000 UUIDs, real pool allocations, 56 shipped GLB models, 14 weapons/eight operators and map assets with Math.random throwing. Environment: 7 groups: exact matrices, shipped instances/bounds/cutaways/authority. Input: 11 groups; Blue Circuit game: 5 and progression: 9 groups.
- Native final `after-results.json`, `after-reopen-results.json`: real combat, caps, previews/stress, hash identity, saved HUD 113% / FPS 144 and exact progression/balance/archive preservation. Transitions: cap60-resized-window, cap60-fullscreen, cap144-live-switch-fullscreen, cap144-focus-return, unlimited-live-switch. No native transition limitation recorded.
- Real offline authenticated-cache restart, production asset allowlists, shell-only cache replacement and preview lifecycle passed (`dev/blue-circuit-cache-check.cjs`). Updater lifecycle/graceful Windows service handoff passed (`dev/updater-lifecycle-check.cjs`). Launcher checks, syntax, diff checks, metadata/history equality and native `tauri build --no-bundle` passed; pre-existing unused Rust helper warning only.

## Limits / next runs

No 300 FPS claim: host rAF cadence and reported display refresh are ~120 Hz; tactical rendering also exceeds 3.33 ms. Small natural-scene differences are not causal speedup proof. GPU queries sample WebGL work; system GPU includes other processes. JS heap is not process RAM/VRAM; allocation/GC statistics are samples, not exact pauses/events. Owner account was not used for benchmarks. This is a staged candidate, not an installed update. Keep these performance/settings contracts through Runs 2/3 and repeat relevant integration checks before one final publication.

## Run 2 — Arena Credits and collection

Implementation stays in the same checkout and branch. Lobby has Play above Loadout/Weapon Meta, Operator/Phone, Tournaments/Store, Shop/Exit Game. Existing account menu, four Settings tabs, progression and separate weapon/operator showcases remain. Store supports operator/tier/owned filters, nine products per page, visible on-demand previews, included styles, exact confirmation balances, purchase then equip, and free base appearances. Shop displays the server catalog and disabled checkout. No live Stripe request, installation or publication occurred.

### Wallet and trust boundary

`server/migrations/006_overclock_commerce.sql` is additive SQLite schema 6. The existing database migration path makes a recoverable pre-schema backup; existing world JSON is untouched. Tables: `ac_wallets`, immutable `ac_ledger`, `cosmetic_orders`, `cosmetic_entitlements`, `cosmetic_equipment`, `ac_match_reports`. Wallets are keyed by stable user ID + environment, start at zero, and do not scan historical matches. No prior AC tables existed in this baseline. Amounts are exact safe integer hundredths: standard TDM/Deathmatch 100 units, Ranked TDM 150 total; tournament AC is disabled pending a design decision. XP, ELO, tournament dollars and AC remain separate.

`server/wallet.cjs` resolves account/session and catalog prices on the server. A `BEGIN IMMEDIATE` transaction inserts the negative ledger entry, completed order and entitlement together; the ledger trigger applies the balance and rejects negative/unsafe arithmetic. Unique order, entitlement and reward identities prevent repeat grants/spending. Purchase retry identity is account + request ID; match reward identity is account + match ID + `match-completion`, without an application-version component. `SAR_COMMERCE_ENV` is `production` by default; accepted alternatives `sandbox` and `test` have separate balances, orders and ownership. A database CHECK permits `test-fixture` entries only in `test`. There is no HTTP credit-grant endpoint.

**Live-payments blocker:** the existing match engine and submitted world are client-owned. Existing world/XP validation checks consistency; it does not independently verify human participation or anti-AFK activity. New eligible completion reports are stored as `PENDING_VALIDATION`, never spendable in production or sandbox. The internal `settleVerifiedMatch` adapter exercises exact grant arithmetic and exclusions in isolated tests only; non-test use fails `RESULT_VALIDATION_UNAVAILABLE`. A future trusted result host/participation validator is required. The bundled local server/database are also under the PC owner's control: real-money fulfillment needs a trusted hosted authority, not only a signed callback into editable local SQLite. Do not remove these gates merely to make Shop buttons work.

`game.js` records only new completed human standard/ranked results after the existing world checkpoint; no startup/history backfill. Practice, custom, bots, spectating, abandoned matches and all tournaments report nothing. `commerce.js` keeps pending IDs, purchase request IDs and cached selections in `SARStorage` under origin + environment + account. Purchase IDs are durably flushed before the HTTP request. Account/environment guards discard stale responses. Terminal ineligible reports cannot block later reports. Cached balances/entitlements serve offline presentation only; all purchases require a current online wallet and backend ownership. Cached owned selections replay on reconnect after ownership is rechecked. `cloud.js` starts optional commerce asynchronously and resets it on logout.

### Run 3 interfaces and catalogs

All commerce routes use the existing authenticated API/session/CSRF boundary and no-store responses:

- `GET /api/commerce/catalog`: schema 1, environment, exact packs/operators/cosmetics, `checkoutAvailable:false`, `earningStatus:'validation-required'`. A cosmetic is available only when every included asset has verified manifest metadata and matching file size/SHA-256.
- `GET /api/wallet`: `{accountId, environment, balanceUnits, entitlements:[{cosmeticId,purchasedAt}], equipped:{[operatorId]:{cosmeticId,styleId}}, pendingEarnUnits, pendingEarnCount, earningStatus}`.
- `POST /api/store/purchase`: exactly `{cosmeticId,requestId}`; returns `{order:{id,requestId,cosmeticId,priceUnits,status:'COMPLETED'},wallet,replayed}`. Client prices, balance, ownership and account IDs are rejected.
- `POST /api/store/equip`: `{operatorId,cosmeticId,styleId}`; `cosmeticId:null,styleId:'main'` restores the free base appearance. Included signature alternates require no second purchase.
- `POST /api/wallet/match-report`: exactly `{matchId}`; returns 202 with `{report:{matchId,units,status:'PENDING_VALIDATION'},wallet}`. Requires a newly synced existing XP receipt after wallet activation; it never settles money.
- `POST /api/shop/checkout`: authenticated `{packId,requestId}` interface; known packs return 503 `CHECKOUT_UNAVAILABLE`, without creating an order, payment or credit. Run 3 maps stable pack IDs to verified sandbox Price IDs; it must reuse this wallet rather than introduce a second balance.

Authoritative catalog: `server/commerce-catalog.cjs`. USD cents and AC units stay distinct:

| Pack ID | USD cents | AC units |
| --- | ---: | ---: |
| ac-500 | 699 | 50000 |
| ac-1000 | 1099 | 100000 |
| ac-1500 | 1499 | 150000 |
| ac-3000 | 2499 | 300000 |
| ac-7500 | 4999 | 750000 |
| ac-17500 | 9999 | 1750000 |

Stable operator IDs retain the original names/order/palettes: `urban-assault`, `woodland-scout`, `desert-runner`, `blue-strike`, `crimson-guard`, `steel-recon`, `ranger-elite`, `night-ops`. Products:

- Each operator's `.helmet-off`, `.polar-camo`, `.carbon-camo`: 500 AC each (24 products).
- 1,000 AC: `urban-assault.urban-utility`, `steel-recon.alpine-scout`, `ranger-elite.workshop`, `woodland-scout.signal-runner`.
- 1,500 AC: `steel-recon.cold-front`, `urban-assault.containment`, `ranger-elite.recon-pilot`, `night-ops.midnight-circuit`.
- 2,500 AC: `blue-strike.black-ice` includes `main`/`white-ice`; `steel-recon.aegis` includes `main`/`aegis-arctic`; `crimson-guard.monarch` includes `main`/`monarch-platinum`. Each includes its named lobby idle pose. All other products use style `main`.

### Assets and runtime integration

Actual Blender 5.2.2 LTS authoring/export: `tools/blender_overclock_cosmetics.py`, editable `assets/25d/cosmetics/overclock-collection.blend`, manifest/build report and 35 GLBs. All 35 products/38 styles verified, 3,888,944 runtime bytes and 47,584 authored triangles across the collection. [Collection maintenance](OVERCLOCK-COSMETICS.md) records attachment/runtime APIs and reproducible checks. Base source assets are untouched.

`cosmetics-25d.mjs` lazy-loads and deduplicates each product, shares GLB geometry/materials, retains active references and at most six idle libraries. `models-25d.mjs`, `inspect-25d.mjs`, `renderer-25d.mjs` reuse the existing rig, fixed attachment conventions, preview rotation/disposal and observed animation. Only the human snapshot selects account-owned cosmetics. Hitboxes/head regions, timing, weapons and team indicators remain in their existing simulation/presentation paths. Signature poses are static lobby-only poses, not a combat timing change.

`sw.js` installs only the small cosmetic manifest and runtime code with the shell. Product GLBs load on demand, are SHA-256 checked, and only previously cached same-hash models survive a shell upgrade. Changed bytes fail with a useful 503 instead of mixing versions. Account APIs, editable sources and user data are never added to the shell cache. `launcher/scripts/stage-backend.cjs` validates and packages all 35 runtime GLBs plus modules/migration, excluding Blender sources and any account data. Native bundling includes the whole small catalog for local offline use; browser boot does not fetch the wardrobe.

Native attempts exposed required startup integration corrections: `launcher/src-tauri/src/backend.rs` and `desktop-launch.js` still expected database schema 5. The launcher rejected the healthy schema 6 service; after that was fixed, the desktop preflight rejected it separately. Failures and isolated startup logs are retained under `before-schema-fix-results.json`, `before-preflight-fix-results.json` and their fixture profiles. Both contracts now require schema 6; schema 5 requires migration/handoff and newer schemas remain protected. `launcher/scripts/backend-bundle-check.cjs` verifies BOTH the Rust health/handoff constant and desktop preflight against the packaged backend's `LATEST_DB_SCHEMA`, preventing a future build from silently shipping this mismatch. Lifecycle fixtures now use the real latest schema, and explicitly reject earlier/newer schema values with diagnostic messages. Eight Rust backend tests pass, including version/schema rejection, exclusive startup and ownership boundaries.

### Run 2 verification

Evidence: `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/overclock-run2/`.

- Backend wallet: 9 groups plus 11 existing platform groups passed. Exact 100/150 test settlement, exclusion rules, integer arithmetic, production gates, strict request tampering rejection, repeat/conflicting identities, injected rollback, true concurrent SQLite worker connections, migrations/backups, ownership persistence and account/environment isolation.
- Game integration: 5 groups in `dev/overclock-commerce-game-check.cjs`, using actual resolved combat finalization and observed transport; one new report after checkpoint, no duplicate/historical report, all excluded modes, preserved official XP multiplier. This does not assert anti-cheat validation.
- Client: 7 groups in `dev/overclock-commerce-client-check.cjs`: offline queue, world-sync ordering, retries, stale account response, account-specific environment discovery/cache, environment outbox isolation and terminal-report handling.
- Real Edge/WebGL Store: 6 groups in `dev/overclock-commerce-ui-check.cjs`. Exact lobby/catalog/filter/pagination, signature confirmation before/after balances, storage-write/flush failure blocks purchase, real purchase/equip, model rotation, reload, offline selection/replay, free base, lost response after commit, delayed account response, layouts at 1920/1024/800 widths, released card resources and four Settings tabs. Existing persisted fields were preserved; baseline bot loadout-pick counters may increase on startup as before.
- A separate real-browser lobby check at 800×520 and 1024×768 verified all nine buttons, compact balance and every account-menu action are reachable/clickable with no horizontal overflow; screenshots were visually inspected.
- Genuine service-worker offline restart: 4 groups in `dev/overclock-commerce-cache-check.cjs`: same-hash carry-forward, changed-hash eviction, lazy loads/allowlists, wrong bytes rejected, authenticated offline world + owned model + XP/career restored, no spendable cache authority and unrelated storage retained.
- Art: 3,724 rig poses (38 appearances × 14 weapons × seven states), 912 full-turn WebGL views, palette/head/grip/muzzle/team invariants, lazy cache bounds/disposal, existing nine model groups and 14,000 base construction poses. Editable Blender source reopened and all 38 roots verified. Standard and collection boards visually reviewed.
- Run 1 preservation rerun: six timing groups/all nine FPS settings, 11 input groups, four render-RNG groups, seven real WebGL HUD groups/48 layouts across four modes, cloud/offline client suites, launcher restrictions and updater lifecycle/graceful Windows service handoff. Native and final packaging evidence follows below.


### Run 2 native result

The staged executable launched through the real native launcher/backend/WebView2 path, reached the lobby and played a standard human match with the exported White Ice appearance. All 17 sampled running assets (including commerce, cosmetic code/manifest/GLB and the desktop bootstrap) match current source hashes. Backend automatically started with schema 6. The test used a cloned synthetic account and isolated test wallet; no owner data or installed app was changed. No installer/update was published.

Same host/driver/1920×1080/DPR1/WebView2 and existing graphics as Run 1. Forty-second combat/effects/tactical samples, six Phone/model cycles. Run 1 → Run 2:

| Scene | Render submissions/s | Frame p95 ms | Mean render CPU ms | Mean sampled GPU ms |
| --- | ---: | ---: | ---: | ---: |
| normal-combat | 118.85 → 119.69 | 9.40 → 9.10 | 5.77 → 4.40 | 5.46 → 2.56 |
| combat-effects | 118.03 → 119.73 | 9.70 → 9.00 | 5.81 → 4.64 | 4.23 → 2.92 |
| tactical-spectating | 83.65 → 83.96 | 14.50 → 14.40 | 10.24 → 10.31 | 8.24 → 8.28 |
| phone-open-close | 75.02 → 83.43 | 19.90 → 14.40 | 11.36 → 10.31 | 9.11 → 8.15 |
| models-open-close | 83.14 → 82.71 | 15.30 → 15.40 | 10.08 → 10.24 | 8.10 → 8.17 |

New Store open/close workload: 80.98 submissions/s, p95 15.80 ms. Six additional combat/Store cycles completed; JS heap observed 62.66–176.53 MiB. Final cosmetic cache: 7 resident, 1 active, 6 idle (limit 6 idle). Closed previews: 0 resident card models, animation scheduled false. These are bounded observations, not proof of no leaks; the new Store workload has no old Store baseline.

Native start-to-ready 8.36s; reopen 6.64s. Reopen retained the owned White Ice style, zero remaining test balance, saved FPS 144/HUD113%, exact latest XP and unchanged balance fingerprint/archive count. Startup still includes the existing minimum display. Natural scene/roster changes and GPU contention limit causal before/after conclusions; no 300 FPS claim. Detailed reports: `after-results.json`, `after-reopen-results.json`, `native-comparison.json`; screenshots include native lobby, combat and tactical views.

Cold preview work remains a bounded limitation: the largest synchronous preview render observed was 83.2ms versus 41.2ms in Run 1; preview batch wall time reached 181.8ms, including asynchronous asset loading. This can produce a first-inspection hitch even though sustained combat/tactical frame times stayed comparable. Tactical JS heap peaked at 196.24MiB versus 170.09MiB; garbage-collection timing and the added retained appearance prevent interpreting those peaks as a leak. Resources returned to the documented idle bounds. This run does not establish low-end hardware performance or zero allocation growth over hours.

Run 2 is complete as an unpublished checkpoint. Remaining Run 3 blockers are trusted match/participation validation, trusted hosted purchase fulfillment and the actual sandbox checkout integration. Tournament AC remains a pending design decision. Preserve production/sandbox gates and environment isolation until those are solved.

## Run 3 — Sandbox fulfillment and release verification

The same application release remains **1.12.0 / OVERCLOCK**, now shell revision **overclock-5**. Weapon Balance **8.0**, fingerprint **b-b9bdf00b**, analytics schema **1**, game world schema **17**, stable application identity and account paths are unchanged. Database schema **7** adds payment records; it does not migrate or reset XP, careers, seasons or weapon telemetry. The public download and owner installation are not silently changed by these isolated tests.

### Payment/runtime changes

`server/payments.cjs` uses pinned Stripe Node **23.0.0**, API **2026-09-30.endive**, only when explicit Sandbox configuration validates. The six Run 2 pack amounts remain exact; underscore IDs are accepted aliases for the original hyphen IDs. `server/migrations/007_overclock_payments.sql` adds immutable order snapshots, unique environment/account/session/payment identities, handled events and linked refund/dispute review records. `server/db.cjs`, native backend schema checks and the uncached desktop preflight now agree on schema 7.

The existing authenticated HTTP server exposes Checkout, owned order list/status/reconciliation and one raw-signature public webhook endpoint. Existing browser write-origin protections remain in place. Orders persist before the first provider request, including the exact create parameters, USD/AC snapshot and stable idempotency key. API and webhook retries reuse those records. A paid Session, exact line item, succeeded PaymentIntent and captured card charge must match the account/environment/order before a single SQLite transaction credits the existing ledger and records fulfillment/event handling. Review events never automatically subtract credits or revoke appearances. No payment path awards match XP.

`commerce.js`/`commerce.css` retain the existing blue Shop layout and add test-only purchase/status controls, durable account/environment-scoped request IDs, bounded visible polling, reconnect discovery and explicit pending/delivered/expired/failed/review states. Checkout URLs are not persisted in the browser cache. Cancellation remains pending until verified expiry; navigating to a return page does not deliver credits. A new native command is limited to the exact trusted game window/origin and HTTPS `checkout.stripe.com/c/pay/cs_test_...` URLs, using Windows' direct URL opener without a command interpreter. No card inputs are added to the game.

The packaged backend includes the exact Stripe CommonJS runtime under native SHA-256 integrity checks. Runtime environment secrets, account databases and test fixtures remain outside installer assets. `dev/overclock-payment-preflight.cjs` performs read-only provider checks with an ephemeral database and prints only safe readiness codes. Default configuration reports `SANDBOX_DISABLED`. Optional initial Sandbox catalog verification may wait for bounded provider calls; cached commerce presentation and essential game startup remain independent.

### Access and activation state

The official Stripe plugin exposed **New business sandbox**, `acct_1TGJWg1F1wnVf2XK`, Sandbox mode. Read-only inventory found no Products or Prices. Its existing Default payment configuration enables non-card methods, so it has not been used for checkout or changed. Account confirmation is pending, and local runtime credentials/webhook forwarding are unavailable. No Stripe account writes, real hosted payments, refunds or financial configuration changes have been performed. Proposed exact catalog payloads are recorded in [overclock-sandbox-catalog-plan.json](overclock-sandbox-catalog-plan.json), with no invented resource IDs.

See [OVERCLOCK-PAYMENTS.md](OVERCLOCK-PAYMENTS.md) for configuration names, official documentation, the catalog mapping and the live-readiness checklist. Production checkout is hard-disabled. Match reward reports remain pending outside isolated fixtures because active human results are not server-authoritatively validated. The tested standard/ranked rates remain **1 / 1.5 AC**, with excluded modes awarding none; these formulas are not falsely presented as activated spendable rewards.

### Targeted verification

Secret-free evidence is under `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/overclock-run3/`.

- Backend: **32/32** groups passed (12 payment, nine wallet, 11 existing platform). Covers six pack mappings, SDK-generated raw signatures, unpaid/expiry/failure, later success, strict price/quantity/account/environment/payment checks, atomic rollback, duplicate API/events, four independent concurrent SQLite workers, restart, frozen parameters across configuration changes, authenticated HTTP/CSRF, neutral return pages, refund/dispute review and real catalog cosmetic purchase/equip. These are explicitly isolated provider fixtures, not completed Stripe-hosted transactions.
- Client: ten checkout groups, seven existing commerce groups; real Edge/game UI: five checkout groups and six Store groups. Screenshots at 1920/1024/800 widths were inspected. Checkout transport and hosted page were fixtures. A real native external-browser launch with an actual Sandbox Session URL remains unverified.
- Preservation: six frame timing groups across all caps, four render-RNG groups, five real match/report integration groups, cloud and offline clients, seven HUD groups/48 layouts, four genuine service-worker/cache/offline restart groups. Account scope, owned cosmetics, XP/careers, storage and balance history stayed intact.
- Native unit checks: eight backend/schema/handoff tests, one checkout URL validation test and launcher capability/signature checks passed. Native runtime benchmark, reopen and signed package evidence are recorded below after completion.

### Run 3 native benchmark and reopen

The release executable launched its colocated `backend/node.exe` and `backend/server/desktop-service.cjs`, through the actual native launcher, WebView2 and packaged-resource integrity path. It did not fall back to a development server. The isolated Run 2 schema-6 profile migrated to schema 7, retained an original backup, and reached the lobby/game with its owned White Ice style and unchanged initial progression/balance history. All **17 served asset hashes** and **336 native integrity entries**, including **253 Stripe runtime files**, matched the staged source.

Same hardware, WebView2 154, 1920×1080/DPR1/120 Hz, HUD 100%, Unlimited except explicit cap checks. Forty-second combat/effects/tactical samples and six Phone/model/Store cycles:

| Scene | Run 1 submissions/s / p95 ms | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Combat | 118.85 / 9.40 | 119.69 / 9.10 | 119.62 / 9.00 |
| Effects | 118.03 / 9.70 | 119.73 / 9.00 | 119.53 / 9.00 |
| Tactical | 83.65 / 14.50 | 83.96 / 14.40 | 83.37 / 14.10 |
| Phone open/close | 75.02 / 19.90 | 83.43 / 14.40 | 82.71 / 14.30 |
| Model open/close | 83.14 / 15.30 | 82.71 / 15.40 | 81.27 / 14.70 |
| Store open/close | — | 80.98 / 15.80 | 81.82 / 15.40 |

Native cap-60 produced 59.93 submissions/s; 144 and Unlimited followed available throughput. Six further Store/combat cycles retained at most six idle cosmetic libraries plus one active library. Closed card previews returned to zero models and no scheduled animation. The longest synchronous cold preview render remained **82.2 ms** (Run 2: 83.2 ms), with **178.1 ms** maximum preview batch wall time; a first-inspection hitch remains possible. These measurements do not prove no long-term leaks or low-end hardware performance, and naturally changing bot rosters limit causal comparisons.

Start-to-ready **7.011 s**, reopen **6.786 s**. Reopen retained the latest saved XP, owned/equipped White Ice, zero test wallet balance, FPS 144 and HUD 113%, plus the unchanged balance fingerprint/archive count. An initial full run at the saved HUD113% was preserved as `hud113-after-results.json` and excluded from the matched-settings comparison. Runtime reports: `after-results.json`, `after-reopen-results.json`, `native-comparison.json`, `native-resource-verification.json`.

The owner's installed 1.11 executable, live account/profile and database were not modified. This verifies the release executable and its packaged-resource startup path; it does not claim an NSIS installation was executed. Real hosted Stripe payment, a real card decline and real native Checkout browser opening remain unverified while access/setup is pending.

### Signed local release package

`launcher/scripts/build.ps1` produced one **1.12.0 — OVERCLOCK** NSIS installer and updater signature using the existing signing key. `launcher/scripts/release.cjs` signed a staged loopback update manifest in `overclock-run3/release/`; it was not copied to the active update service or published to GitHub. The folder includes the installer, its signature, manifest/signature, release notes and `SHA256SUMS.txt`. No Windows Authenticode publisher certificate is claimed.

Installer: **29,910,674 bytes**, SHA-256 **59d071ec297289ccec423b66127ee29fe4dc47ab116b904bafae58e610c4f599**. The existing `verify-release.cjs` now accepts optional staged release/executable paths so the same isolated verification can run before publication. All seven checks passed: valid signed download; rejection of altered manifest, altered installer, signed wrong checksum, signed wrong version and public HTTP download; unchanged fixture database. See `signed-release-verification.json`.

Tauri's NSIS build patches the executable's bundle type, so the exact final executable was reopened and tested separately after signing. `after-final-package-reopen-results.json` and `final-package-resource-verification.json` confirm lobby/game readiness in **7.782 s**, preserved saved XP/ownership/FPS/HUD/balance history, all 17 served hashes and all 336 native resource hashes. Final executable SHA-256: **deb6cc346ab4eb0ba95f0c3f61aab4b237f28b3fdad6636ce19e117303fb7d23**. The final native test closed its owned processes normally.

Local code, fixture verification and signed packaging are complete. **Run 3's real hosted-payment acceptance remains blocked** on account confirmation and secure Sandbox setup; it is not represented as a successful real purchase. The existing production payment and unverified-earned-credit gates remain closed. The first cold model-inspection hitch and unexecuted NSIS installation remain explicitly unverified/limited items.

## 1.12.1 — operator faces, curated Store and test skin

This follow-up uses the working1.12.0 baseline. Shared base faces/covers/goggles and eight exposed-face Blender assets were refined. The other27 cosmetic GLBs remain unchanged. Store keeps Containment, Aegis and Monarch for new sales; all35 original IDs, old orders, owned styles and equipment remain usable. The32 simple variants are retired from sale.

The owner approved a $0.50 Sandbox skin offer because USD card checkout cannot charge $0.01. Seven real Sandbox Product/Price pairs (six unchanged credit packs and Polar Camo) were created and read back; IDs are in `overclock-sandbox-catalog-verified.json`. No payment was performed. The runtime still lacks a private test API key, webhook connection and approved card-only method configuration; the developer connector cannot substitute for them. Production money collection remains disabled.

Direct skin fulfillment verifies the existing immutable order against Stripe and atomically records the existing entitlement, with zero AC movement. Schema8 preserves existing linked commerce rows and a recoverable schema7 backup. The migration checks foreign keys before commit; an injected failure rolls back and retries without resetting progress. A concurrency test also covers changing Stripe account configuration during an order retry.

Verified before packaging: backend43/43; client checkout13 and account/cache7; real Edge/WebGL Store7 and checkout7; actual service-worker offline-cache4; frame-timing6; render RNG4. Art checks cover model9,14,000 construction poses,3,724 cosmetic poses,912 orientations,38 gameplay-angle renders and before/after face boards. Browser payment responses are explicitly fixtures, not completed hosted payments. Weapon Balance8.0/b-b9bdf00b and analytics schema1 remain unchanged.

Evidence is outside release assets under `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/overclock-1.12.1/` and `overclock-faces/`. Signed package and native startup results are recorded after completion below.

### Signed1.12.1 delivery

The signed NSIS installer is29,927,063 bytes; SHA-256`ce7942fb57baeb19dcb7ed1075f0f63b0d6f7c425be3c9f0b87640a990f35a38`. Seven native signed-update checks and11 release lifecycle checks passed. The actual final executable passed isolated schema7-to8 startup, authenticated lobby, three sale items, retained owned White Ice, eight served asset hashes, close/reopen, and real ten-participant TDM startup/pause without XP awards. Owner account data was not used.

The signed manifest/artifact were published to both the project release feed and the running installed local service. Live HTTP readback matches the staged manifest/signature and complete installer bytes/hash. This publishes1.12.1 for the launcher's Update button; it does not claim that the owner installed it. A Codex-virtualized legacy launcher copy also showed the1.12.1 offer and was closed rather than left running. A real Stripe purchase remains blocked on secure runtime setup; Sandbox catalog creation alone is not checkout activation.
