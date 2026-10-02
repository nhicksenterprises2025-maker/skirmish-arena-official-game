"""LIVE CIRCUIT detail kits authored with the existing local Blender pipeline.

Run: blender --background --factory-startup --python tools/blender_live_circuit.py
The established articulated models remain authoritative for pose and silhouette.
These small, material-batched meshes attach to their named presentation nodes.
All authoring helpers accept the renderer's X-forward, Y-up game coordinates.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

PROJECT = Path(__file__).resolve().parent.parent
OUTPUT = PROJECT / "assets" / "25d"
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)
bpy.context.preferences.filepaths.save_version = 0

SWATCHES = {
    "sar_vest": ("293c36", .84, .03),
    "sar_accent": ("8eaa82", .80, .02),
    "sar_boot": ("23342e", .88, .02),
    "hardware": ("6c7e7b", .58, .30),
    "recess": ("17272d", .88, .08),
    "phone_frame": ("485961", .47, .42),
    "phone_case": ("17242b", .72, .02),
    "phone_glass": ("09141b", .21, .10),
    "phone_lens": ("597d87", .23, .18),
}
MATERIALS = {}
for name, (color, roughness, metallic) in SWATCHES.items():
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    srgb = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in srgb]
    mat.diffuse_color = (*linear, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    MATERIALS[name] = mat

ROOTS, ATTACHMENTS = [], {}
root = parent = None

def xyz(v):
    return (v[0], -v[2], v[1])

def asset(name):
    global root, parent
    root = bpy.data.objects.new(name, None)
    root["presentation_only"] = True
    bpy.context.collection.objects.link(root)
    ROOTS.append(root)
    ATTACHMENTS[name] = {}
    parent = root
    return root

def attachment(name):
    global parent
    parent = bpy.data.objects.new(root.name + "__" + name, None)
    parent.parent = root
    parent["attachment"] = name
    bpy.context.collection.objects.link(parent)
    ATTACHMENTS[root.name][name] = parent.name
    return parent

def finish(obj, name, material):
    obj.name = root.name + "_" + name
    obj.data.materials.append(MATERIALS[material])
    obj.parent = parent
    return obj

def block(name, size, at, material, bevel=.3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(at))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Restrained machined edges", "BEVEL")
        mod.width = min(bevel, min(size)*.22)
        mod.segments = 2 if root.name == "phone-device" else 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, material)

def pin(name, radius, depth, at, material="hardware", axis="Z", vertices=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz(at))
    obj = bpy.context.object
    if axis == "Z":
        obj.rotation_euler.x = math.pi/2
    elif axis == "X":
        obj.rotation_euler.y = math.pi/2
    return finish(obj, name, material)

def strip(name, a, b, width, depth, material):
    direction = Vector(xyz(b))-Vector(xyz(a))
    mid = (Vector(a)+Vector(b))/2
    obj = block(name, (width, direction.length, depth), mid, material, .16)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj

# Shared restrained operator finishing; all pieces seat on existing rig surfaces.
# Identity comes from the unchanged eight palettes and procedural kit silhouettes.
asset("operator-detail")
attachment("torso")
for side in (-1, 1):
    block("unit_identification_patch", (4.8, 3.2, .6), (-1, 36.5, side*17), "sar_accent", .3)
block("backpack_seam", (.6, 11, 12), (-16.6, 37, 0), "sar_vest", .15)
attachment("pelvis")
for side in (-1, 1):
    block("belt_loop", (1.2, 3, .6), (2, 26, side*13.6), "sar_vest", .15)
attachment("foot")
block("toe_guard", (2.5, 2.6, 7.4), (4.7, -.35, 0), "sar_boot", .45)
block("heel_cap", (1.4, 3.2, 7.2), (-5, -.25, 0), "sar_boot", .35)
attachment("cuff")
block("glove_wrist_guard", (2.6, .8, 5.5), (0, 2.5, 0), "sar_vest", .25)

# FIELDCRAFT expands the original kits to every weapon. Attachments stay in the
# existing mechanism's local coordinates: a slide, magazine or pump still moves.
WEAPONS = {
    "Auto 12": "weapon-detail-auto12", "War Head LMG": "weapon-detail-war-head",
    "P90": "weapon-detail-p90", "SR-Aug": "weapon-detail-sr-aug",
    "SPAS-12": "weapon-detail-spas12", "X-16 Auto": "weapon-detail-x16-auto",
    "AR-15": "weapon-detail-ar15", "AK47": "weapon-detail-ak47",
    "SMG-9": "weapon-detail-smg9", "Pump Shotgun": "weapon-detail-pump",
    "LR-762": "weapon-detail-lr762", "LW Tundra": "weapon-detail-tundra",
    "9mm": "weapon-detail-9mm", "X16": "weapon-detail-x16",
}
for weapon, name in WEAPONS.items():
    asset(name)
    attachment("body")
    if weapon in ("AR-15", "SMG-9", "LR-762"):
        marksman = weapon == "LR-762"
        end = 53 if marksman else 47 if weapon == "AR-15" else 38
        for side in (-1, 1):
            block("bolt_cover", (11, 3.3, .75), (14, 2.6, side*5.2), "recess", .25)
            for x in range(30, end, 5):
                block("handguard_slot", (3.1, 2.3, .55), (x, .8, side*(4.6 if weapon == "SMG-9" else 5.1)), "recess", .2)
            pin("takedown_pin", .85, .5, (25, -1.5, side*5.1))
        if weapon == "SMG-9":
            block("stock_heel", (1.5, 10, 8.3), (-19.5, 0, 0), "recess", .4)
        else:
            block("stock_cheekrest", (13, 2.6, 8.3), (-15, 3.3, 0), "recess", .65)
        block("receiver_top_latch", (4, 1.7, 10.6), (-2, 5.9, 0), "hardware", .25)
        if marksman:
            pin("optic_elevation_dial", 2.7, 3.5, (18, 14.9, 0), axis="Y", vertices=12)
            pin("optic_windage_dial", 2.4, 2.3, (18, 11.3, 4.5), vertices=12)
            for side in (-1, 1):
                strip("folded_bipod", (37, -5.7, side*5.2), (53, -4.8, side*5.2), 1.5, 1.5, "hardware")
        attachment("mag")
    elif weapon == "AK47":
        for side in (-1, 1):
            block("stamped_receiver", (24, 6, .65), (10, -.3, side*4.65), "hardware", .5)
            for x in (0, 6, 21):
                pin("receiver_rivet", .65, .6, (x, -1.3, side*4.9), "recess")
            strip("selector_lever", (7, 2, side*5.1), (23, -1.6, side*5.1), 1.2, .7, "recess")
            for x in (31, 38, 45):
                block("wood_guard_vent", (3.2, 1.4, .6), (x, 3.5, side*5.1), "recess", .2)
        block("gas_tube", (23, 2.5, 3.6), (44, 6.5, 0), "hardware", .5)
        pin("rear_sling_mount", 2, .7, (-22, -.5, 4.15), "hardware")
        attachment("mag")
        for side in (-1, 1):
            strip("magazine_reinforcement", (25, -9, side*3.7), (32, -24, side*3.7), 1, .7, "hardware")
    elif weapon == "Pump Shotgun":
        for side in (-1, 1):
            block("receiver_inlay", (18, 4.2, .6), (8, .5, side*4.65), "hardware", .45)
            pin("receiver_pin", .7, .6, (1, -.5, side*4.9), "recess")
            pin("receiver_pin", .7, .6, (16, -.5, side*4.9), "recess")
        block("barrel_rib", (45, 1.3, 2.1), (45, 4.3, 0), "hardware", .25)
        block("barrel_clamp", (3.3, 9, 5.6), (59, -.5, 0), "hardware", .6)
        block("stock_comb", (13, 2, 8.5), (-16, 3.8, 0), "recess", .4)
        attachment("pump")
        for side in (-1, 1):
            block("pump_grip_inlay", (15, 3.5, .6), (0, -2, side*5.5), "recess", .4)
    elif weapon == "LW Tundra":
        for side in (-1, 1):
            block("receiver_raceway", (17, 2.5, .65), (11, 2.6, side*4.6), "recess", .35)
            strip("bipod_leg", (46, -3, side*5.5), (64, -7, side*5.5), 1.6, 1.8, "hardware")
        block("folded_bipod_mount", (4, 6.5, 12), (46, -1.8, 0), "recess", .4)
        pin("scope_elevation", 3.0, 3.8, (17, 14.6, 0), axis="Y", vertices=12)
        pin("scope_windage", 2.8, 2.4, (17, 10.8, 4.5), vertices=12)
        attachment("mag")
        block("magazine_base", (10.5, 1.6, 9.3), (0, -9.6, 0), "recess", .4)
    elif weapon in ("9mm", "X16"):
        for side in (-1, 1):
            pin("frame_crosspin", .65, .5, (10, -.7, side*3.6), "hardware")
            block("frame_rail", (11, 1.2, .55), (22, -.7, side*3.65), "recess", .25)
        attachment("slide")
        for side in (-1, 1):
            block("chamber_relief", (7.5, 2.3, .55), (22, 3.5, side*(3.85 if weapon == "X16" else 4.35)), "hardware", .3)
        block("rear_notch", (2.2, 1.5, 5.5), (3, 7.4 if weapon == "X16" else 8.0, 0), "recess", .2)
        attachment("mag")
        block("heel_plate", (8, 1.5, 8.5), (0, -8.6, 0), "hardware", .35)
    elif weapon == "Auto 12":
        for side in (-1, 1):
            block("receiver_plate", (17, 5.6, .55), (13, 1.0, side*5.65), "hardware", .5)
            for x in (33, 39, 45):
                block("foregrip_recess", (3.5, 1.8, .6), (x, -.8, side*5.15), "recess", .25)
        block("stock_cheek_pad", (13, 2.3, 8.4), (-14, 3.1, 0), "recess", .6)
        attachment("mag")
        for side in (-1, 1):
            pin("drum_fastener", 1.9, .5, (0, -3, side*4.5), "hardware")
    elif weapon == "War Head LMG":
        block("feed_cover", (20, 1.0, 9.6), (15, 8.4, 0), "hardware", .4)
        block("feed_hinge", (3, 2.0, 12.3), (4, 8.7, 0), "recess", .3)
        for side in (-1, 1):
            block("receiver_inspection_cover", (14, 6, .6), (14, 0, side*6.15), "hardware", .45)
            for x in (39, 44, 49, 54):
                block("cooling_slot", (2.8, 1.25, .6), (x, -1.8, side*5.65), "recess", .18)
        attachment("mag")
        block("box_latch", (7.5, 3.0, .65), (0, 4.8, 7.6), "hardware", .3)
        block("box_retaining_band", (24, 1.7, 13.6), (0, -3.8, 0), "recess", .3)
    elif weapon == "P90":
        for side in (-1, 1):
            block("rear_service_panel", (10.4, 5.3, .7), (-10.7, .4, side*5.3), "hardware", .55)
            for x in (33, 36):
                block("forward_grip_groove", (1.1, 4.3, .55), (x, -3.9, side*5.2), "recess", .2)
        block("buttpad_ridge", (1.1, 8.6, 11.3), (-20.3, -.7, 0), "recess", .25)
        attachment("mag")
        for x in (-18, 18):
            block("top_feed_endcap", (2.5, 5.2, 9.1), (x, -.1, 0), "recess", .3)
        block("feed_latch", (4.2, 1.3, 6), (-11, 3.9, 0), "hardware", .3)
    elif weapon == "SR-Aug":
        for side in (-1, 1):
            block("bullpup_buttpanel", (12, 6, .55), (-15, 1.0, side*5.15), "hardware", .5)
            pin("buttpanel_screw", .65, .7, (-20, 1, side*5.4), "recess")
            block("ejection_recess", (8, 2.7, .65), (-7, 3.4, side*5.15), "recess", .35)
            block("front_service_rail", (13.5, 1.0, .7), (29, -.25, side*5.35), "hardware", .25)
        block("gas_block", (3.5, 6.7, 6.7), (43, .2, 0), "recess", .45)
        block("charging_handle", (6.7, 1.6, 2.1), (5, 5.4, 4.5), "hardware", .4)
        attachment("mag")
    elif weapon == "SPAS-12":
        for side in (-1, 1):
            block("receiver_service_plate", (17, 5.2, .55), (10, 0, side*5.15), "hardware", .5)
            for x in (3.5, 16.5):
                pin("receiver_pin", .65, .65, (x, 0, side*5.4), "recess")
            for x in (32, 38, 44, 50):
                block("heatguard_slot", (3.2, 1.7, .6), (x, 1.5, side*5.65), "recess", .2)
        block("front_barrel_clamp", (2.8, 10.3, 6.0), (60, -.5, 0), "hardware", .4)
    elif weapon == "X-16 Auto":
        for side in (-1, 1):
            block("frame_selector", (3.0, 1.0, .6), (9, -.5, side*3.65), "hardware", .2)
            pin("selector_pivot", .75, .8, (7.4, -.5, side*3.8), "recess")
        block("compensator_base", (1.1, 5.3, 8.9), (35, 3, 0), "hardware", .2)
        attachment("slide")
        for side in (-1, 1):
            block("slide_inspection_panel", (8, 2.2, .55), (22, 3.2, side*4.35), "hardware", .3)
        block("optic_ready_cover", (8, .7, 6), (10, 8.0, 0), "hardware", .3)
        attachment("mag")
        block("extended_feed_base", (7, 1.7, 8), (0, -19.0, 0), "recess", .4)

    # Rework the original six kits as well: larger machining and support shapes,
    # not merely the same old detail under a different material or light.
    parent = bpy.data.objects[ATTACHMENTS[name]["body"]]
    if weapon == "Auto 12":
        for side in (-1,1):
            block("drum_release_paddle", (3.5, 4.3, .8), (26, -5.5, side*5.65), "hardware", .4)
        block("heat_shield_ridge", (18, 2.2, 7.2), (41, 6.4, 0), "hardware", .45)
    elif weapon == "War Head LMG":
        for x in (27, 43):
            block("carry_handle_mount", (3.2, 6.2, 3), (x, 10.0, 0), "recess", .4)
        block("carry_handle", (20, 3.2, 4.5), (35, 13.2, 0), "recess", .8)
    elif weapon == "P90":
        for side in (-1,1):
            pin("optic_crossbolt", 1.2, .7, (38, 10, side*2.5), "hardware")
    elif weapon == "SR-Aug":
        for side in (-1,1):
            block("barrel_release_latch", (3.7, 3.4, 1.1), (39.5, 2.4, side*4.2), "hardware", .4)
        block("buttplate_edge", (1.7, 12.5, 9.5), (-26, -.5, 0), "recess", .45)
    elif weapon == "SPAS-12":
        block("folded_stock_cheek", (24, 2, 10), (-9, 12.0, 0), "hardware", .5)
        pin("rear_sling_eye", 2.2, .8, (-22, 3, 5), "hardware")
    elif weapon == "X-16 Auto":
        for side in (-1,1):
            block("compensator_relief", (3.5, 2.2, .6), (38, 3.7, side*4.7), "hardware", .35)
            block("frame_dust_cover", (12, 1.4, .65), (26, -3, side*4.35), "recess", .25)

# Full Blender-created device: front is +Z, portrait up is +Y. DOM app content
# is intentionally ordinary UI, aligned over the physical screen rectangle.
asset("phone-device")
block("aluminium_frame", (174, 330, 15), (0, 0, 0), "phone_frame", 8)
block("rear_shell", (170, 326, 13.2), (0, 0, -1.2), "phone_case", 8)
block("front_bezel", (167, 323, 2.6), (0, 0, 7.7), "phone_case", 6)
block("screen_glass", (151, 287, .9), (0, -1.5, 9.25), "phone_glass", 5)
block("earpiece", (29, 2.0, .65), (0, 153, 9.7), "phone_frame", .6)
pin("front_camera", 2.4, .5, (24, 152.8, 9.7), "phone_lens", vertices=16)
block("home_mark", (24, 1.8, .5), (0, -151, 9.85), "phone_frame", .6)
block("power_button", (2.0, 32, 6.2), (87.1, 76, -.3), "phone_frame", .7)
for y in (62, 98):
    block("volume_button", (2, 25, 6.2), (-87.1, y, -.3), "phone_frame", .7)
for x in (-45, -35, -25, 25, 35, 45):
    block("speaker_slot", (4.6, .7, 2.3), (x, -165.2, -.6), "phone_case", .4)
block("charging_socket", (17, .7, 4), (0, -165.3, -.4), "phone_case", .6)
block("rear_camera_island", (31, 38, 2.8), (-52, 116, -9), "phone_frame", 5)
for y in (108, 124):
    pin("rear_camera", 5.8, .7, (-53, y, -11), "phone_glass", vertices=12)
    pin("rear_lens", 3.7, 1.0, (-53, y, -11.5), "phone_lens", vertices=12)
pin("rear_flash", 2.4, .6, (-41, 116, -11), "phone_lens", vertices=12)
# Raised camera rims, reinforced corners and panel seams improve the physical
# device without moving the exact readable front-screen anchor.
for x in (-84.5, 84.5):
    for y in (-151, 151):
        block("corner_protector", (4.1, 20, 13.3), (x, y, -.6), "phone_case", 1.1)
for x in (-85.5, 85.5):
    block("frame_highlight", (.6, 202, 1.1), (x, -11, 6.7), "phone_frame", .16)
for x in range(-12, 13, 4):
    block("earpiece_grille", (1.4, 1.4, .8), (x, 153, 10.0), "phone_case", .18)
for y in (108, 124):
    pin("rear_camera_ring", 6.4, .45, (-53, y, -11.1), "phone_frame", vertices=16)
    pin("rear_optical_glass", 4.4, .6, (-53, y, -11.8), "phone_lens", vertices=16)

# Do not export empty optional detail attachments after simplifying a kit.
# The base model still owns every magazine/slide/pump and its animation.
for asset_root in ROOTS:
    for key, node_name in list(ATTACHMENTS[asset_root.name].items()):
        node = bpy.data.objects[node_name]
        if not any(child.type == "MESH" for child in node.children):
            del ATTACHMENTS[asset_root.name][key]
            bpy.data.objects.remove(node, do_unlink=True)

# Batch by material INSIDE each semantic attachment, never across an articulated
# group. Independent actor clones share the exported geometry/material buffers.
for asset_root in ROOTS:
    groups = list(asset_root.children) if ATTACHMENTS[asset_root.name] else [asset_root]
    for group in groups:
        by_mat = {}
        for obj in list(group.children):
            if obj.type == "MESH":
                by_mat.setdefault(obj.data.materials[0].name, []).append(obj)
        for mat_name, objects in by_mat.items():
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            if len(objects) > 1:
                bpy.ops.object.join()
            obj = bpy.context.object
            obj.name = group.name + "_" + mat_name
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.parent = group

entries = []
for asset_root in ROOTS:
    descendants = [obj for obj in asset_root.children_recursive if obj.type == "MESH"]
    bounds = [obj.matrix_world @ Vector(corner) for obj in descendants for corner in obj.bound_box]
    lo = [min(v[i] for v in bounds) for i in range(3)]
    hi = [max(v[i] for v in bounds) for i in range(3)]
    dimensions = {"x": round(hi[0]-lo[0], 3), "y": round(hi[2]-lo[2], 3), "z": round(hi[1]-lo[1], 3)}
    entry = {"name": asset_root.name, "node": asset_root.name, "file": "live-circuit-details.glb", "dimensions": dimensions, "castShadow": True, "presentationOnly": True}
    if ATTACHMENTS[asset_root.name]:
        entry["attachments"] = ATTACHMENTS[asset_root.name]
    if asset_root.name == "operator-detail":
        entry["paletteMaterials"] = {"sar_vest": "vest", "sar_accent": "accent"}
        entry["appliesTo"] = "all-existing-operator-palettes"
    if asset_root.name.startswith("weapon-detail-"):
        entry["weapon"] = next(name for name, value in WEAPONS.items() if value == asset_root.name)
    if asset_root.name == "phone-device":
        entry["screen"] = {"width":151, "height":287, "center":{"x":0,"y":-1.5,"z":9.7}, "normal":"+Z", "safeInset":5}
    entries.append(entry)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "live-circuit-details.glb"), export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_materials="EXPORT", export_cameras=False, export_lights=False, export_extras=True)
manifest_path = OUTPUT / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["models"] = [e for e in manifest["models"] if e.get("file") != "live-circuit-details.glb"] + entries
manifest["version"] = "brightfield-fieldcraft-visual-fix-1"
manifest["detailGenerator"] = f"Blender {bpy.app.version_string}; tools/blender_live_circuit.py"
manifest_path.write_text(json.dumps(manifest, indent=2)+"\n", encoding="utf-8")

# Editable file is a tidy asset board; GLB roots above remain at their local origin.
for i, asset_root in enumerate(ROOTS):
    asset_root.location = ((i%4)*180, (i//4)*160, 0)
bpy.context.scene.unit_settings.system = "NONE"
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "live-circuit-details.blend"))
report = {"status":"PASS", "blender":bpy.app.version_string, "assets":len(ROOTS), "operators":"all existing operator palettes via shared kit", "detailedWeapons":list(WEAPONS), "meshes":len([o for o in bpy.data.objects if o.type=="MESH"]), "triangles":sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH"), "glbBytes":(OUTPUT / "live-circuit-details.glb").stat().st_size, "contract":"named local-coordinate attachments; +X forward, Y up; no collision or animation authority", "source":"editable local Blender authoring"}
(OUTPUT / "live-circuit-build-report.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
print("LIVE_CIRCUIT_ASSET_BUILD " + json.dumps(report))
