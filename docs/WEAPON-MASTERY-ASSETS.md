# Weapon mastery crests

Weapon Mastery uses its own badge art, separate from competitive Rank.
`weapon-mastery.js` defines the five badge tiers (1, 3, 5, 7, 10) and the
registry-based weapon classifier. `tools/blender_mastery.py` reads the current
game registry through `dev/simulate.cjs`, then authors 40 dimensional crests:
rifle, SMG, shotgun, marksman, sniper, LMG, sidearm and burst, at each tier.
New weapons use the matching class asset without requiring a copied weapon list.

The source uses named editable parts, an extruded chamfered service plate,
formed enamel, attached weapon relief and modeled tier numerals. Higher tiers
add restrained shoulders and an apex. Colors match the established charcoal,
sage and metal palette. These assets never alter guns, hitboxes or gameplay.

Actual local Blender **5.2.2 LTS** exported `assets/25d/mastery/weapon-mastery.glb`:
40,160 triangles, 151 material-batched meshes, four shared PBR finishes and
1,986,464 bytes. Each displayed crest requires at most four mesh draws.
`weapon-mastery.blend` retains all 450 unbatched named mesh components arranged
in a browsing board. `manifest.json` records exact hashes, dimensions and live
weapon/class assignments; `build-report.json` records export metrics.

Rebuild through the existing pipeline:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_mastery.py
node .\dev\weapon-mastery-assets-check.mjs
node .\dev\weapon-mastery-badges-browser-check.cjs
```

`inspect-25d.mjs` accepts `{kind:'mastery', weapon, weaponDef, tier}` in the
existing `paintInspection` and `mountCardPreview` APIs. Supply the live weapon
definition. Inspection uses one shared on-demand WebGL renderer, memoized asset
loading, bounded model/thumbnail caches and the existing keyboard/drag controls.
Hidden or removed previews do not keep rendering. Runtime loads only the GLB
and manifest, with no texture, compression decoder or additional dependency.

`proof-board.png` is an authoring verification render; it is not runtime badge
art. Automated checks validate all 75 current weapon/tier mappings, FAL,
future class coverage, physical relief/normals, 1,280 independent rotations,
64/96-pixel runtime rendering, a full 360-degree view and one lazy GLB fetch.
