# OVERCLOCK collection maintenance

Run 2 uses the installed Blender 5.2.2 LTS executable. `tools/blender_overclock_cosmetics.py` authored and exported 35 product GLBs with 38 appearances; the three signature alternates and lobby poses are included in their product. `assets/25d/cosmetics/overclock-collection.blend` is the editable source board. The source was reopened in Blender and all 38 roots checked. No external asset generator or new engine is involved.

The existing eight operator IDs and base assets remain intact. New exports replace only the fixed torso/head appearance. The existing articulated limbs, weapon/hand anchors, team rings and combat animation consume the same observed actor state. Head removal never changes a simulation collider. Palette brightness stays within the readable base-art range. Camo changes existing face finishes; it does not add runtime textures.

`assets/25d/cosmetics/manifest.json` maps each stable `operator.variant` ID to `operatorId`, `verified`, `styles`, `lobbyPose` and `editableSource`. Each style contains a project-relative GLB `file`, root `node`, `palette`, named local `attachments`, `sha256`, `bytes`, `meshes` and `triangles`. There are no per-item JSON manifests. The server catalog owns prices and entitlements; this art manifest is not purchase authority.

`cosmetics-25d.mjs` loads this small manifest on first appearance use, then only the requested product GLB. Shared product loads are deduplicated; live instances retain references and the cache keeps at most six unused libraries. Disposed libraries release their geometry/material buffers. Existing preview mounting and visibility rules govern cards, so hidden products do not create render loops. Signature poses are static lobby-only rig poses and are never read by combat animation.

Call `await ensureCosmeticAssets({id,operatorId,styleId})` before `buildOperator(team,skin,palette,selection)`. Preview options are `{kind:'operator',skin,palette,unarmed:true,cosmetic:selection,lobbyIdle:true}`. Gameplay snapshots carry only the selected human actor's `cosmetic`. The renderer preserves observed animation state while the appearance loads, exposes loading/ready/unavailable in diagnostics, and does not mutate the actor or gameplay random stream. The current equipped asset can use the existing offline shell asset cache; cached ownership remains non-authoritative.

Rebuild and verify from the project root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools/blender_overclock_cosmetics.py
node dev/overclock-cosmetics-check.mjs
node dev/overclock-cosmetic-preview-check.cjs
node dev/models-25d-check.mjs
```

The builder deliberately writes `verified:false` until the exports are checked. After both checks and visual review, update that flag and the manifest/build-report validation record. Never ship a partially rebuilt catalog as purchasable. Runtime packaging includes the manifest and 35 GLBs, not Blender sources, reports or screenshots; lazy cache activation avoids a wardrobe download at boot.

Verified in Run 2: 3,724 rig poses covering 38 appearances × 14 weapons × idle, movement, sprint, ADS, firing, reload and death; 912 rendered orientations covering every appearance through 360 degrees; stable anchors, unchanged input snapshots and team indicators; concurrent lazy loads, invalid style/operator rejection, bounded cache and preview disposal. The standard/collection WebGL boards were visually inspected, and helmet intersections were corrected before final export. Total runtime GLBs: 3,888,944 bytes, 47,584 authored triangles across the entire catalog. Across all 14 weapons, a fully armed appearance peaks at 75 mesh objects / 5,494 triangles versus 75 / 5,110 for the corresponding base registry. A separate game-angle contact sheet renders all 38 at normal scale (maximum 69 draw calls / 5,012 triangles with AR-15 or SR-Aug). The rig test also rejects any use of the gameplay Math.random stream. These are resource counts, not an FPS guarantee; the combined-game native checks belong to the main OVERCLOCK handoff.

## Exposed-face and default face-cover refinement

The helmet-off head formerly combined an ellipsoid, rectangular face patch, box
nose and two dark eye blocks. The shared Blender source now builds a connected
tapered jaw/cheek surface, a seated nose bridge, small modeled eyelids/eyes and
brows, and a restrained neutral mouth. The existing eight skin/hair palettes,
headsets, silhouette height and head attachment remain intact. Owned helmet-off
items keep these improved assets even if the storefront retires their listings.

Default operators use the same existing procedural model route in
`models-25d.mjs`: the former rectangular mouth block is now a fitted cheek/chin
cover, with a coherent head/neck underneath and closer-fitting paired goggles.
Covered identities remain covered. Containment, Aegis and Monarch retain their
closed faceplates. There are no changes to collision, headshot regions, palettes,
animation timing, muzzle/grip anchors, inventory or entitlements.

To repair exposed faces without re-exporting other products:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools/blender_overclock_cosmetics.py -- --variants helmet-off
node dev/overclock-cosmetics-check.mjs
node dev/overclock-cosmetic-preview-check.cjs
node dev/overclock-face-preview-check.cjs
```

Selective export rebuilds the complete editable board but preserves unselected
GLBs and manifest records byte-for-byte. Only eight helmet-off GLBs changed in
this pass; 27 other product GLBs remain intact. The manifest uses a content-derived
asset version and fresh per-file hashes; this is independent of release/balance
versions. The rebuilt records were marked verified only after runtime checks.

Current totals: **3,884,516 bytes / 48,064 authored triangles** across the catalog.
Rig verification passed **3,724 poses**, up to **76 meshes / 5,494 triangles** for an
armed appearance; corresponding base maximum is **75 / 5,248**. Shared batching,
lazy loading and six-idle-item disposal remain unchanged. Additional checks passed
nine model tests, 14,000 construction poses, 912 actual rendered orientations,
38 normal game-camera appearances, and 48 face closeups plus 16 normal card views.

Comparable screenshots are stored outside the project at
`C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/overclock-faces/`:
`operator-faces-before.png`, `operator-faces-after.png`,
`operator-preview-scale-before.png`, and `operator-preview-scale-after.png`.
The before fixture reads preserved original assets; neither fixture opens an
account or modifies saved data. Native install/update checks belong to release
integration, not this isolated face-render check.
