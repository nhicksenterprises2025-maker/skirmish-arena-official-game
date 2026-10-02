"""Author Brightfield's reusable stylized props using local Blender.

Run: blender --background --factory-startup --python tools/blender_assets.py
Models use game units. Blender Z is vertical, converted to glTF/Three Y-up.
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
bpy.context.preferences.filepaths.save_version = 0
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)

PALETTE = {
    "iron": "263a3d", "metal": "627b7b", "glass": "9cbdba",
    "wood": "b49467", "wood_dark": "806343", "paint": "bdcbb4",
    "roof": "6c7e78", "roof_light": "85958b", "rubber": "253337",
    "green": "497948", "leaf": "609454", "leaf_light": "80a761",
    "trunk": "786148", "cream": "e4dec0", "red": "ba6c50",
    "car": "759991", "headlamp": "e3dcb3", "flower": "dfab78",
}
MATS = {}
for name, color in PALETTE.items():
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    # Color values are sRGB art swatches; shader colors are linear.
    rgb = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    material.diffuse_color = (*linear, 1)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = .82 if name not in ("metal", "glass") else .5
    shader.inputs["Metallic"].default_value = .15 if name in ("metal", "iron") else 0
    MATS[name] = material

ROOTS = []
current = None

def asset(name):
    global current
    current = bpy.data.objects.new(name, None)
    current["asset_name"] = name
    current["presentation_only"] = True
    bpy.context.collection.objects.link(current)
    ROOTS.append(current)
    return current

def finish_object(obj, name, material, bevel=0):
    obj.name = current.name + "_" + name
    obj.data.materials.append(MATS[material])
    obj.parent = current
    if bevel:
        modifier = obj.modifiers.new("Small edge highlights", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def block(name, size, at, material, bevel=.7, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rotation:
        obj.rotation_euler = rotation
    return finish_object(obj, name, material, min(bevel, min(size) * .2))

def cylinder(name, radius, height, at, material, vertices=10, rotation=None, top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if top is None else top, depth=height, location=at)
    obj = bpy.context.object
    if rotation:
        obj.rotation_euler = rotation
    return finish_object(obj, name, material)

def leaf(name, radius, at, material, scale=(1, 1, 1), subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=at)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_object(obj, name, material)

def beam(name, a, b, width, depth, material):
    direction = Vector(b) - Vector(a)
    obj = block(name, (width, depth, direction.length), (Vector(a) + Vector(b)) / 2, material)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj

# Mailbox: raised rounded enclosure, slot, little red flag, grounded timber post.
asset("mailbox")
block("post", (6, 6, 39), (0, 0, 19.5), "wood_dark")
block("foot", (12, 12, 3), (0, 0, 1.5), "metal")
block("box", (27, 15, 14), (3, 0, 43), "paint", 2)
cylinder("round_top", 7.5, 27, (3, 0, 49), "paint", 10, (0, math.pi/2, 0))
block("door", (1.7, 14, 12), (17, 0, 43), "metal")
block("mail_slot", (1.8, 9, 1.2), (18, 0, 44.5), "iron", .1)
block("flag_stem", (1.5, 1.5, 14), (6, -8, 53), "red")
block("flag", (8, 1.5, 5), (9.5, -8, 57), "red")

asset("streetlamp")
cylinder("base", 8, 5, (0, 0, 2.5), "iron")
cylinder("post", 3.2, 116, (0, 0, 61), "metal", 8, top=2.5)
beam("arm", (0, 0, 116), (20, 0, 129), 3.5, 3.5, "metal")
block("hood", (25, 15, 5), (22, 0, 129), "iron", 1)
block("lamp", (18, 10, 2), (22, 0, 125.5), "headlamp", .5)

asset("bench")
for x in (-26, 26):
    for y in (-10, 10):
        block("leg", (4, 4, 20), (x, y, 10), "iron")
    beam("back_support", (x, 10, 6), (x, 16, 41), 4, 4, "iron")
for y in (-9, -2, 5, 12):
    block("seat_slat", (68, 5.5, 3.5), (0, y, 23), "wood")
for z in (30, 37):
    block("back_slat", (68, 3, 5), (0, 16, z), "wood")
for x in (-31, 31):
    block("arm_rest", (4, 30, 3), (x, 1, 32), "metal")

asset("parked_car")
block("chassis", (133, 58, 21), (0, 0, 22), "car", 5)
block("bonnet", (39, 56, 10), (47, 0, 32), "car", 3)
block("rear_deck", (28, 54, 7), (-53, 0, 31), "car", 2)
block("cabin", (64, 48, 22), (-5, 0, 42), "glass", 5)
block("roof", (44, 43, 5), (-8, 0, 55), "car", 2)
for x in (-34, 10):
    block("cabin_pillar", (4, 50, 22), (x, 0, 43), "car", .7)
for y in (-25, 25):
    block("door", (64, 3, 16), (-5, y, 29), "car", 1)
    block("handle", (8, 1.5, 2), (-8, y * 1.05, 32), "iron", .3)
    block("mirror", (7, 8, 5), (22, y * 1.25, 39), "iron", 1)
for x in (-44, 43):
    for y in (-29, 29):
        cylinder("tire", 14, 7, (x, y, 14), "rubber", 12, (math.pi/2, 0, 0))
        cylinder("wheel", 8, 7.5, (x, y, 14), "metal", 8, (math.pi/2, 0, 0))
for y in (-18, 18):
    block("headlamp", (3, 12, 6), (68, y, 30), "headlamp", 1)
    block("tail_lamp", (3, 10, 5), (-68, y, 29), "red", 1)
block("front_grille", (3, 23, 6), (68, 0, 23), "iron")
for x in (-69, 69):
    block("bumper", (4, 53, 5), (x, 0, 16), "metal")

asset("shrub")
for x, y, z, r, color in [(-11, 1, 14, 19, "green"), (11, 0, 18, 22, "leaf"), (0, -7, 25, 18, "leaf_light")]:
    leaf("foliage", r, (x, y, z), color, (1.15, .9, .85), 2)

asset("tree_round")
cylinder("trunk", 7, 70, (0, 0, 35), "trunk", 8, top=4.5)
for a, b in [((0,0,45), (-23,0,79)), ((0,0,48), (21,5,86)), ((0,0,57), (0,-19,91))]:
    beam("branch", a, b, 5, 5, "trunk")
for x, y, z, r, color in [(-20, 4, 82, 34, "green"), (21, 0, 93, 38, "leaf"), (0, -19, 101, 35, "green"), (-3, 7, 115, 37, "leaf_light")]:
    leaf("crown", r, (x, y, z), color, (1, 1, .9), 2)

asset("tree_columnar")
cylinder("trunk", 5, 49, (0, 0, 24.5), "trunk", 8, top=3)
for z, r, color in [(43, 29, "green"), (65, 25, "leaf"), (89, 19, "leaf_light")]:
    cylinder("crown", r, 55, (0, 0, z), color, 10, top=3)

asset("crate")
block("core", (65, 62, 56), (0, 0, 28), "wood_dark", 1)
for x in (-31, 31):
    for z in (6, 19, 32, 45):
        block("board", (3, 61, 11), (x, 0, z), "wood")
for y in (-30, 30):
    for z in (6, 19, 32, 45):
        block("board", (62, 3, 11), (0, y, z), "wood")
    beam("brace", (-28, y * 1.05, 5), (28, y * 1.05, 52), 5, 3, "wood_dark")
for x in (-24, -8, 8, 24):
    block("lid", (14, 61, 3), (x, 0, 58), "wood")
for x in (-21, 21):
    block("strap", (2, 64, 2), (x, 0, 60), "metal", .2)

asset("utility_box")
block("foot", (42, 31, 5), (0, 0, 2.5), "cream")
block("cabinet", (35, 24, 43), (0, 0, 25), "metal", 1.5)
block("lid", (39, 28, 4), (0, 0, 49), "paint")
block("door", (32, 2, 37), (0, -13, 26), "paint")
for z in (30, 34, 38):
    block("vent", (19, 1, 1.3), (-3, -14.5, z), "iron", .1)
block("handle", (2, 2, 8), (11, -15, 24), "iron", .3)
block("warning_plate", (8, 1, 7), (0, -15, 14), "headlamp")

asset("trash_can")
cylinder("body", 13, 31, (0, 0, 16), "metal", 12, top=15)
cylinder("rim", 16, 3, (0, 0, 32), "iron", 12)
cylinder("lid", 16, 5, (0, 0, 35), "metal", 12, top=12)
block("handle", (10, 4, 3), (0, 0, 39), "iron")
for angle in range(0, 360, 45):
    a = math.radians(angle)
    block("rib", (2, 2, 26), (13.5*math.cos(a), 13.5*math.sin(a), 16), "iron", .3)

asset("fence_panel")
for x in (-41, 41):
    block("post", (8, 8, 44), (x, 0, 22), "wood_dark")
    block("cap", (10, 10, 3), (x, 0, 46), "wood")
for z in (13, 33):
    block("rail", (85, 5, 6), (0, 0, z), "wood_dark")
for x in range(-32, 33, 8):
    block("picket", (6, 4, 36), (x, -3, 25), "wood")

asset("roof_module")
# Unit-size roof for scaling to the actual house. It does not create a fake floor.
width, depth, rise = 240, 210, 37
vertices = [(-width/2,-depth/2,0), (width/2,-depth/2,0), (width/2,depth/2,0), (-width/2,depth/2,0), (-width/2,0,rise), (width/2,0,rise)]
mesh = bpy.data.meshes.new("Pitched roof surface")
mesh.from_pydata(vertices, [], [(0,1,5,4), (4,5,2,3), (0,4,3), (1,2,5)])
mesh.update()
obj = bpy.data.objects.new("roof", mesh)
bpy.context.collection.objects.link(obj)
finish_object(obj, "surface", "roof")
block("ridge", (244, 6, 4), (0,0,rise+1), "roof_light")
for y in (-depth/2, depth/2):
    block("eave", (247, 5, 7), (0,y,-1), "cream")
for x in range(-105, 106, 30):
    for y in (-1,1):
        beam("shingle_seam", (x, y*depth/2, 1), (x, 0, rise+1), 1.1, .5, "roof_light")
block("chimney", (17, 20, 30), (-67, 23, 45), "wood_dark")
block("chimney_cap", (22, 25, 4), (-67,23,62), "cream")

asset("drain_grate")
block("frame", (33, 23, 2), (0,0,1), "iron", .2)
for x in range(-13, 14, 5):
    block("grate", (2, 19, 1), (x, 0, 2.5), "metal", .1)

asset("planter")
block("planter", (41, 25, 14), (0,0,7), "wood_dark", 1.5)
block("soil", (35,19,2), (0,0,15), "trunk")
for x,y in [(-13,-4), (0,3), (12,-3), (7,6), (-5,-6)]:
    cylinder("stem", .7, 9, (x,y,19), "green", 5)
    leaf("bloom", 3.5, (x,y,24), "flower", (1,1,.4), 1)
    leaf("leaf", 4, (x+2,y,19), "leaf", (1,.5,.35), 1)

# FIELDCRAFT: secondary construction makes the same silhouettes feel assembled,
# rather than replacing them or introducing new gameplay footprints.
for current in ROOTS:
    if current.name == "bench":
        for x in (-26, 26):
            block("foot_plate", (11, 8, 1.6), (x, -10, .8), "metal", .4)
            for y in (-9, 5):
                cylinder("seat_bolt", .85, .35, (x, y, 25), "metal", 8)
            for z in (30, 37):
                cylinder("back_bolt", .85, .4, (x, 13.9, z), "iron", 8, (math.pi/2, 0, 0))
        block("lower_stretcher", (53, 3, 3), (0, 7, 9), "iron", .4)
    elif current.name == "parked_car":
        for y in (-25.7, 25.7):
            block("window_sill", (60, 1.5, 1.6), (-5, y, 37), "iron", .3)
            block("lower_door_trim", (66, 1.3, 2), (-5, y, 23), "metal", .3)
            block("door_shut_line", (1, 1.2, 12), (-6, y*1.03, 29), "iron", .15)
        for x in (-44, 43):
            for y in (-33, 33):
                cylinder("hub", 3.5, 1, (x, y, 14), "iron", 10, (math.pi/2, 0, 0))
                for angle in (0, math.pi/2):
                    block("wheel_spoke", (11, 1, 1.6), (x, y, 14), "metal", .2, (0, angle, 0))
        block("registration_plate", (1, 15, 5), (-71.2, 0, 24), "cream", .3)
        for y in (-23, 23):
            block("hood_shut_line", (33, .65, .65), (47, y, 37.3), "iron", .12)
        for x in (-23, -3):
            beam("wiper", (x, -18, 42), (x+13, -19, 44), .75, .75, "iron")
    elif current.name == "utility_box":
        for z in (13, 40):
            block("door_hinge", (2.8, 2.4, 5), (-16.2, -14.1, z), "iron", .45)
        block("rear_cable_guard", (9, 2.5, 31), (7, 13.2, 21), "iron", .5)
        cylinder("fan_rim", 7.5, 1.4, (0, 0, 52), "iron", 12)
        cylinder("fan_hub", 2.4, 1.8, (0, 0, 52.8), "metal", 10)
        for angle in (0, math.pi/3, math.pi*2/3):
            block("fan_grille", (13, 1.0, .6), (0, 0, 53.8), "metal", .1, (0, 0, angle))
    elif current.name == "mailbox":
        block("door_latch", (2, 4, 3), (18.3, 0, 50), "iron", .35)
        for x in (-6, 11):
            block("post_brace", (3, 11, 2), (x, 0, 34.8), "wood", .35)
        block("address_plate", (9, .6, 4), (1, -8, 43), "cream", .25)
    elif current.name == "streetlamp":
        cylinder("collar", 4.7, 4, (0, 0, 16), "iron", 10)
        block("service_hatch", (4.4, 1.3, 10), (0, -3.1, 21), "iron", .4)
        for x in (16, 22, 28):
            block("lamp_grille", (1, 10, 1), (x, 0, 124.2), "metal", .15)
    elif current.name == "crate":
        for x in (-26, 26):
            for y in (-32, 32):
                for z in (7, 46):
                    cylinder("brace_nail", .7, .6, (x, y, z), "metal", 6, (math.pi/2, 0, 0))
    elif current.name == "fence_panel":
        for x in (-41, 41):
            cylinder("post_cap", 6.8, 3.5, (x, 0, 49), "wood_dark", 4, (0,0,math.pi/4), top=0)
        for x in (-24, 0, 24):
            for z in (13, 33):
                cylinder("rail_nail", .75, .5, (x, -5.2, z), "metal", 6, (math.pi/2, 0, 0))
    elif current.name == "tree_round":
        for x,y,z,r in [(-33,-8,78,15),(28,18,91,15),(4,19,122,18),(-23,-24,109,16)]:
            leaf("crown_breakup", r, (x,y,z), "leaf", (1,.8,.75), 1)
        for angle in (0, 2.1, 4.2):
            beam("root_flare", (0,0,14), (12*math.cos(angle),12*math.sin(angle),1), 3, 3, "trunk")
    elif current.name == "shrub":
        for x,y,z in [(-15,-7,28),(8,-12,30),(19,6,32),(-3,7,34)]:
            leaf("leaf_tip", 6.5, (x,y,z), "leaf_light", (1,.6,.75), 1)
    elif current.name == "planter":
        for y in (-13.2, 13.2):
            block("planter_rim", (44, 2.2, 2.3), (0,y,14), "wood", .3)
        for x in (-14, 0, 14):
            block("panel_seam", (.7, .6, 9), (x,-12.8,7), "trunk", .1)

# Join each material into a single mesh per prop: simple to clone and instance.
for root in ROOTS:
    material_objects = {}
    for obj in list(root.children):
        material_objects.setdefault(obj.data.materials[0].name, []).append(obj)
    for material, objects in material_objects.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = root.name + "_" + material
        # Bake offsets/rotation into mesh, leave each mesh at its asset origin.
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.parent = root

models = []
for root in ROOTS:
    children = [obj for obj in root.children if obj.type == "MESH"]
    bounds = [obj.matrix_world @ Vector(corner) for obj in children for corner in obj.bound_box]
    lo = [min(v[i] for v in bounds) for i in range(3)]
    hi = [max(v[i] for v in bounds) for i in range(3)]
    # Blender +Y maps to glTF -Z; footprint extent remains equal.
    size = {"x": round(hi[0]-lo[0], 3), "y": round(hi[2]-lo[2], 3), "z": round(hi[1]-lo[1], 3)}
    models.append({"name":root.name,"node":root.name,"file":"brightfield-props.glb","dimensions":size,"castShadow":root.name not in ("drain_grate",)})

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "brightfield-props.glb"), export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_materials="EXPORT", export_cameras=False, export_lights=False, export_extras=True)
manifest = {"schema":1,"version":"brightfield-props-1","units":"game-world-units","upAxis":"Y","origin":"ground-center","generator":f"Blender {bpy.app.version_string}; tools/blender_assets.py","models":models}
(OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n", encoding="utf-8")

# Arrange the editable .blend as an asset board. The exported GLB stays centered.
for i, root in enumerate(ROOTS):
    root.location = ((i % 5) * 280, (i // 5) * 240, 0)
bpy.context.scene.unit_settings.system = "NONE"
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "brightfield-props.blend"))
report = {"blender":bpy.app.version_string,"assets":len(ROOTS),"meshes":len([o for o in bpy.data.objects if o.type=="MESH"]),"triangles":sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH"),"glbBytes":(OUTPUT / "brightfield-props.glb").stat().st_size,"source":"local Blender procedural authoring; no remote AI generation"}
(OUTPUT / "build-report.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
print("BRIGHTFIELD_ASSET_BUILD " + json.dumps(report))
