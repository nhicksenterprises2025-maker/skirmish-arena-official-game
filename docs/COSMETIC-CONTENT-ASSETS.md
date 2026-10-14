# Cosmetic collection maintenance

`tools/blender_cosmetic_content.py` authors ten original head/torso constructions
in **Blender 5.2.2 LTS**, using the current articulated operator attachment
contract. Field Ranger and Metro Unit are Basic; Frontier and Sentinel are
Detailed; Nightfall, Hazard and Vector are Cool Detailed; Obsidian, Aegis Prime
and Specter are Premium. Their signature appearances use the corresponding
operator ID plus `.signature`. Premium prices are exactly 2,500 AC.

Each construction has different helmet and armor geometry, attached equipment,
palette and finishes. Existing runtime arms, legs, hands, gun mounts, animation
and gameplay collision remain authoritative. Neck, helmet, carrier and details
are checked for contact before material joining; exported triangle components
are checked again through the actual runtime loader. No textures, external
models, compression decoder or model-generation service are required.

The editable source is `assets/25d/cosmetics/cosmetic-content.blend`. Ten
origin-centered GLBs total 737,796 bytes, with at most 1,064 triangles and twelve
material meshes per appearance. The same source contains twelve original
extruded medallions and eight landscape/graphic banner panels. Blender renders
their 256×256 and 768×192 PNGs for ordinary profile UI; small icons do not create
another renderer. `content-manifest.json` records source, dimensions, exact
hashes and readiness for every image. Existing mastery crests remain in their
separate weapon-mastery library.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_cosmetic_content.py
node .\dev\cosmetic-content-assets-check.mjs
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_cosmetic_content_check.py
node .\dev\overclock-cosmetics-check.mjs
```

Export initially marks new assets unverified. The runtime-loader test checks
ten different head and torso geometries, all fifteen weapon rigs in seven
states (1,050 checks), full rotations (250 checks), unchanged anchors and actor
snapshots, image hashes/dimensions, and the bounded six-item idle cache before
marking these entries ready. The legacy collection test still validates all
35 original products/38 styles and 3,990 weapon-rig states. Browser/end-screen
checks cover the actual integrated presentation separately.

The collection exporter updates only its twenty artwork entries and preserves
victory-pose definitions and other manifest fields. The older OVERCLOCK builder
retains entries from later collections instead of replacing the shared catalog.
Rebuild merging was exercised for preservation, idempotency and precedence of
newly rebuilt records. Do not replace user ownership to refresh art.

`content-operators-proof.png` is a source construction board of head/torso
attachments, not a gameplay screenshot. The source-check command reopens the
saved Blender file, verifies identity attachment transforms and renders this
board without modifying the source. Installed builds ship the declared GLBs,
profile PNGs and runtime definitions; editable sources and proof boards stay
in the project.
