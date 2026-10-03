# BLUE CIRCUIT rank assets and assembly audit

Run 2 asset work is staged, not published. These are presentation resources; the
application, weapon balance, simulation anchors, user data and telemetry are unchanged.

## Ranked crest library

`tools/blender_blue_circuit_ranks.py` reads `SARProgression.ranks` directly from
`progression.js` through Node. There is no second rank list. Each of the 26 manifest
entries records the exact `rankName`, zero-based `rankIndex`, ELO `threshold`, family,
Roman division, mesh dimensions and thumbnail hash. The names follow
`rank-badge-beginner-i` through `rank-badge-ascendant`.

The shared shield, navy field, brushed silver rim and blue enamel retain a single
visual language. Divisions use modeled I/II/III. Families progress through chevrons,
medallions, compass forms and broader attached shoulders; the last three tiers have
distinct apex details. These identify ranked ELO only, never account level or Power.

Actual authoring/export tool: installed Blender **5.2.2 LTS** at the existing path.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools/blender_blue_circuit_ranks.py
node dev/blue-circuit-asset-check.mjs
```

Outputs in `assets/25d/ranks/`:

- `blue-circuit-ranks.blend`: editable named individual pieces, arranged in a board.
- `blue-circuit-ranks.glb`: optimized runtime copies batched by material per badge.
- `manifest.json`: the existing schema-1 model format plus canonical rank metadata
  and SHA-256/byte metadata. Its content-derived version is independent of release
  and balance versions.
- Twenty-six 192 × 192 transparent PNG thumbnails rendered in Blender from those
  same exported badge meshes, with individual hashes.
- `build-report.json`: actual Blender version, counts, size and hash.

The decoder-free GLB is **1,141,300 bytes**, with **19,348 triangles / 95 meshes**
across all 26 ranks. A displayed badge requires at most four material draws. There
are four shared local PBR finishes and no texture or network dependencies. Thumbnails
total **768,768 bytes**. Editable source and build report are not runtime dependencies.

The separate manifest stays lazy: `loadAssetLibrary(new URL('./assets/25d/ranks/manifest.json',
import.meta.url))` loads one shared rank GLB without loading gameplay prop libraries.
Use its entry with `entry.rankIndex === summary.ranked.rankIndex`, then call
`library.cloneModel(entry.name)`. The crest faces **+Z**, with **+Y up**. Every clone
owns its transforms and shares geometry/materials under the existing ownership
contract. The per-card inspector accepts `{kind:'rank', rankIndex}`.

Keep runtime manifest, GLB and PNGs in the existing server/cache/staging lists. Do
not publish during Run 2; Run 3 performs the combined shell/version update. Never
clear account storage to update art.

## Current weapon construction audit

Inspected `models-25d.mjs`, `tools/blender_live_circuit.py`, actual exported GLB
attachment nodes, `asset-loader-25d.mjs` reparenting, and rest/animation bindings.
The current baseline already includes the prior construction repair: connected
optic feet/rails, receiver-seated carry-handle supports, the Tundra forward foot
inside its rail and the P90 sight tower clear of its moving top magazine.

No new source placement, duplicated scale, parenting or animation fault was
reproduced. Attachment parent origins/rotations/scales are identities; receiver,
magazine, slide, bolt and pump details follow their intended nodes. Stocks and
receiver joints remain in the same shared local construction. Correct components
and existing weapon exports were therefore left unchanged; no camera masking,
oversized mounts, re-export, weapon-anchor change or timing change was introduced.

Actual baseline checks run:

- `node dev/model-construction-check.mjs`: solid mesh contact through upper
  attachments for all 14 weapons; identity attachment transforms; **14,000 poses**
  across eight operators, fourteen weapons, 360° and idle/walk/ADS/fire/reload.
- `node dev/models-25d-check.mjs`: **nine tests**, including hand-to-grip reach,
  muzzle/feed presence, optimized meshes, walk/sprint, ADS, pump/bolt/slide cycling,
  magazine removal/return, P90 top feed, hit/death/respawn and shared-resource safety.
- `node dev/blue-circuit-asset-check.mjs`: **four groups**, covering exact registry,
  real GLB bounds/geometry/hashes/budgets, memoized loading/clone isolation, rendered
  thumbnails and editable Blender source.

The browser acceptance fixture owns comparable card/lobby screenshots and actual
current-renderer framing checks. Native installed packaging is deliberately left
to Run 3; this asset audit does not claim an installed upgrade was performed.
