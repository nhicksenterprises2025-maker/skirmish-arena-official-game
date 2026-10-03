# FIELDCRAFT local Blender content pipeline

This is an asset pipeline inside the existing game. Assets never alter collision,
weapon balance, accounts, save data, careers, or telemetry. Operators, weapons and
their previews use the existing 2.5D renderer. Missing required art has a clear
recovery state; never introduce a flat placeholder or a second simulation.

BLUE CIRCUIT Run 2 adds the separate, lazy ranked crest library through the same
GLB loader. Its exact registry mapping, editable Blender source, rebuild command,
export metrics and current weapon-construction audit are in
[BLUE-CIRCUIT-ASSETS.md](BLUE-CIRCUIT-ASSETS.md). It is staged for the combined
release; gameplay libraries are unchanged by the new badge library.

## What was actually used

The installed `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`
reported Blender **5.2.2 LTS**. The update used that executable to build and export
the shipped neighborhood prop library. No external model-generation service was
called. The local preferences inspected during the update exposed only Blender's
built-in addons; no running Blender AI/MCP addon or callable Blender AI connector
was found. This is local Blender modeling and a working import path, rather than
a claim that an unavailable AI service generated the assets.

The neighborhood library contains mailbox, streetlamp, bench, parked car, shrub, round tree,
columnar tree, crate, utility box, trash can, fence panel, roof module, drain grate,
and a flower planter. It uses the established sage, olive, wood, and dark steel
palette, small beveled edges, and readable stylized silhouettes. Materials are
local glTF PBR colors; there are no texture downloads, paid dependencies, runtime
Blender requirement, compression decoders, or hosted generation calls.

FIELDCRAFT retains those 14 model names and adds refined prop geometry, windows,
trim, mechanical fixtures and vegetation shapes. `brightfield-props.glb` is
820,456 bytes, 10,342 triangles and 57 material meshes. The existing
`live-circuit-details.glb` path now contains all 14 weapon detail kits, the
shared operator kit and the Phone: 16 assets, 871,148 bytes, 11,708 triangles
and 53 material meshes. Both libraries together are 1,691,604 bytes.

All eight operator palettes receive the shared kit and four gear silhouette
families. Weapon details follow their existing receiver, magazine, slide and
bolt attachments. The Phone's screen anchor and safe inset remain unchanged.
The environment also uses procedural 2.5D building and ground detail in
`environment-25d.mjs`; cover footprints, collision and the map layout remain
authoritative in the existing simulation. Static instances are batched in
1,024-unit spatial districts rather than one draw per prop placement.

## Rebuild the shipped library

From the existing game directory in PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_assets.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_live_circuit.py
node .\tools\blender_validate.mjs
node .\dev\live-circuit-assets-check.mjs
node .\dev\models-25d-check.mjs
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_preview.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_live_circuit_preview.py
```

The first builder updates `assets/25d/brightfield-props.glb`, `manifest.json`, the editable
`brightfield-props.blend`, and a `build-report.json`. The preview command renders a
local asset board to `assets/25d/preview.png` without saving changes to the source.
Open the .blend normally to edit the models. Each model is organized under its
named parent object, and the editable file arranges parents in a board for browsing.
The generated GLB places every template at its own ground-centered origin.
The second builder appends the current weapon/operator/Phone detail entries and
saves `live-circuit-details.glb`, `live-circuit-details.blend` and its build report.
Always run it after the prop builder so both libraries remain in the manifest.
The historical tool and asset names remain stable for packaging compatibility.

## Import an asset created by Blender AI or another local Blender workflow

1. Keep the asset's styling consistent with the game. Use compact geometry,
   matte colors, dark steel/timber trim, and simple readable shapes. Aim for a few
   materials per prop and under 2,000 triangles for small set dressing.
2. In Blender, put the asset under a clearly named empty parent, with that parent
   at `(0, 0, 0)`. Center the footprint around the origin and place the ground at
   Blender Z = 0. Apply object rotation and scale. Models use **game world units**;
   a game tile is 70 units. The car template is about 138 units long. Do not scale
   these models as though a world unit were a meter.
3. Select the parent and its children. Export **glTF 2.0 → GLB**, **Selected Objects**,
   **+Y Up**, export materials, and apply modifiers. Embed any textures in the GLB.
   Avoid Draco, Meshopt, or KTX2 compression unless the corresponding local decoder
   is deliberately added to the game and its PWA cache.
4. Save the GLB inside `assets/25d/`. Add or replace a model entry in `manifest.json`:

```json
{
  "name": "mailbox",
  "node": "mailbox",
  "file": "custom-mailbox.glb",
  "scale": 1,
  "rotationY": 0,
  "castShadow": true
}
```

`node` selects the named GLB parent; omit it when the entire GLB scene represents
one model. `scale` normalizes source scale. `rotationY` rotates around the exported
vertical axis in radians. Optional `dimensions` record expected `{x,y,z}` extents
in runtime coordinates and are checked by the validator. Run the validation
command above after editing the manifest. When replacing a shipped entry, keep
its `name`, since renderer placements refer to that name.

5. Add the local GLB to the server's static asset allowlist and the service
   worker's asset list, and bump the existing build/cache version through the
   same update mechanism as other game files.
   Reload the existing game or press its Update button. Imported models are
   presentation assets; add gameplay collision only through the authoritative
   map code if collision was intentionally requested.

## Renderer API

```js
import { loadAssetLibrary } from './asset-loader-25d.mjs';
const library = await loadAssetLibrary();
const prop = library.cloneModel('mailbox');
prop.position.set(worldX, groundHeight, worldY);
scene.add(prop);
```

The exported coordinate system is Three Y up; the simulation's X/Y plane maps to
Three X/Z. `library.dimensions(name)` returns measured `{x,y,z}` extents.
`library.names` lists supported models. Loads are memoized and failed loads can
be retried. Menu and gameplay art must retain the required 2.5D presentation and
show the existing recovery state when required rendering is unavailable.

Repeated static props should use instancing:

```js
library.addInstances('shrub', [
  {x: 100, y: 0, z: 200, rotationY: 0, scale: 1},
  {x: 180, y: 0, z: 200, rotationY: 1.2, scale: .8}
], scene);
```

Each mesh/material needs one draw per model batch, regardless of prop count.
Instance placements can also use `scale:{x,y,z}` to fit actual cover footprints.
The caller owns instance buffers; dispose each InstancedMesh when tearing down a
scene. Geometry/materials marked `userData.assetShared` stay owned by the cached
library and must not be disposed just because a clone was removed. Animated custom
GLB models can use `library.animations(name)` with a per-clone AnimationMixer; the
clone API duplicates skeletons while keeping mesh/material data shared.

Official references: [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html),
[Three GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), and the pinned
[Three r186 loader source](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/loaders/GLTFLoader.js).

The local addon files in `vendor/addons` are the upstream r186 Three addon sources
with their `three` imports redirected to the existing local `three.module.js`.
The project's existing MIT Three license applies. The game does not fetch code
from a CDN at runtime.

The visual hotfix seats rails, optic feet, side fittings and stock supports in
the shared weapon-local construction. The Tundra front scope foot stays within
its receiver rail; the P90 sight tower clears its moving top magazine. Operator
finishing uses fewer attached pieces on the same rig and palettes. Run
`node dev/model-construction-check.mjs` to check real upper-component contact
and all operator/weapon animation combinations, in addition to the checks above.
