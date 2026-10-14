"""Author mastery crests in the existing editable Blender / decoder-free GLB pipeline.

Weapon assignments come from the running project's registry and mastery classifier.
No gameplay geometry, rank art, collision, or weapon constants are modified.
"""
import bpy
import hashlib
import json
import math
import subprocess
from pathlib import Path
from mathutils import Vector

PROJECT = Path(__file__).resolve().parent.parent
OUTPUT = PROJECT / "assets" / "25d" / "mastery"
OUTPUT.mkdir(parents=True, exist_ok=True)
registry = json.loads(subprocess.check_output(
    ["node", "-e", "const {engine}=require('./dev/simulate.cjs'),M=require('./weapon-mastery.js');const weapons=engine().context.SAR.getWeapons();process.stdout.write(JSON.stringify({weapons:Object.fromEntries(Object.entries(weapons).map(([name,definition])=>[name,{class:M.weaponClass(name,definition)}])),tiers:M.CONFIG.badgeTiers}));"],
    cwd=PROJECT, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)))
TIERS = registry["tiers"]
CLASSES = ["rifle", "smg", "shotgun", "marksman", "sniper", "lmg", "sidearm", "burst"]
assert TIERS == [1, 3, 5, 7, 10]
assert all(entry["class"] in CLASSES for entry in registry["weapons"].values())
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
MATERIALS = {}
for name, color, roughness, metallic in [
    ("charcoal", "25372c", .64, .18), ("steel", "b5c0ae", .43, .58),
    ("sage", "738569", .51, .32), ("brass", "b4a177", .47, .62)]:
    mat = bpy.data.materials.new("mastery_" + name)
    mat.use_nodes = True
    srgb = [int(color[i:i+2], 16)/255 for i in (0, 2, 4)]
    linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in srgb]
    mat.diffuse_color = (*linear, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    MATERIALS[name] = mat
ROOTS, ENTRIES = [], []
root = None

def xyz(x, y, z):
    return (x, -z, y)

def prism(name, points, back, front, finish, bevel=.22, crown=0):
    n = len(points)
    vertices = [xyz(x, y, z) for z in (back, front) for x, y in points]
    faces = [tuple(range(n-1, -1, -1))]
    if crown:
        vertices.append(xyz(sum(x for x, _ in points)/n, sum(y for _, y in points)/n, front+crown))
        faces += [(n+i, n+(i+1)%n, n*2) for i in range(n)]
    else:
        faces.append(tuple(range(n, n*2)))
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(root.name + "_" + name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    mesh.materials.append(MATERIALS[finish])
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    if bevel:
        mod = obj.modifiers.new("Machined edge", "BEVEL")
        mod.width, mod.segments = bevel, 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def rect(name, x, y, width, height, back=2.9, front=4.8, finish="steel"):
    return prism(name, [(x-width/2, y-height/2), (x+width/2, y-height/2),
                        (x+width/2, y+height/2), (x-width/2, y+height/2)], back, front, finish)

def weapon_icon(family):
    # Broad relief silhouettes remain readable in a 64–96 px crest. Functional
    # magazine/stock/barrel shapes overlap the receiver rather than floating.
    if family == "sidearm":
        prism("sidearm", [(-14,12),(15,12),(15,6),(1,6),(-2,-5),(-10,-5),(-6,6),(-14,6)], 2.5, 5.3, "steel", .35)
        rect("slide", 0, 9, 23, 1.5, 5.1, 5.8, "sage")
    elif family == "shotgun":
        prism("shotgun", [(-19,9),(-12,9),(-7,12),(12,12),(12,9),(23,9),(23,6),(3,6),(0,-3),(-4,-3),(-2,5),(-8,5),(-15,0),(-19,0)], 2.5, 5.3, "steel", .28)
        rect("pump", 8, 6, 12, 4, 5.1, 5.8, "sage")
        rect("tube", 16, 3.8, 14, 2, 2.9, 4.8, "brass")
    else:
        long_barrel = family in ("sniper", "marksman")
        barrel = 24 if long_barrel else 21
        stock_end = -24 if long_barrel else -20
        prism("weapon", [(stock_end,10),(-11,10),(-7,13),(10,13),(10,10),(barrel,10),
                         (barrel,7),(3,7),(0,-2),(-4,-2),(-2,6),(-8,6),(stock_end,2)], 2.5, 5.3, "steel", .30)
        if family == "lmg":
            rect("feed_box", 0, 2, 10, 10, 3, 5.8, "brass")
            rect("heat_guard", 12, 11, 13, 4, 5.1, 5.8, "sage")
        elif family == "smg":
            rect("compact_magazine", -1, 2, 4, 10, 3, 5.5, "sage")
            rect("short_receiver", 5, 10, 9, 6, 5.1, 5.8, "sage")
        else:
            prism("magazine", [(-1,7),(4,7),(5,-3),(0,-4)], 3, 5.8, "sage")
        if long_barrel:
            # Mount touches the actual receiver and the optic; no detached scope.
            rect("optic_mount", -1, 15, 13, 4, 2.8, 4.9, "sage")
            rect("optic", -1, 17.5, 19 if family == "sniper" else 13, 4, 2.6, 5.4, "brass")
        elif family == "burst":
            for i in range(3):
                rect("burst_round_%s" % i, -10+i*5, 17, 2.2, 5, 2.7, 4.5, "brass")

for family in CLASSES:
    for tier in TIERS:
        root = bpy.data.objects.new("mastery-%s-tier-%s" % (family, tier), None)
        root["mastery_class"], root["mastery_tier"], root["presentation_only"] = family, tier, True
        bpy.context.collection.objects.link(root)
        ROOTS.append(root)
        plate = [(-22,28),(22,28),(29,20),(29,-17),(20,-28),(-20,-28),(-29,-17),(-29,20)]
        prism("steel_frame", plate, -3, 1.5, "steel", .65)
        prism("formed_field", [(x*.90,y*.90) for x,y in plate], 1.3, 2.9, "charcoal", .25, .45)
        # The service stripe changes finish at higher tiers; broad attached
        # shoulders carry prestige without extra floating ornament.
        rect("service_stripe", 0, 23, 30, 2, 2.7, 3.6, "sage" if tier < 7 else "brass")
        if tier >= 3:
            rect("lower_rim", 0, -25, 24, 2, 1.2, 3.5, "sage")
        if tier >= 5:
            for side in (-1,1):
                prism("shoulder_%s" % side, [(side*23,18),(side*33,16),(side*33,-5),(side*26,-12)], -1.6, 1.8, "sage" if tier < 10 else "brass", .30)
        if tier >= 7:
            for side in (-1,1):
                prism("upper_guard_%s" % side, [(side*17,25),(side*25,31),(side*32,24),(side*26,19)], -1, 2.4, "steel", .30)
        if tier == 10:
            prism("apex", [(-7,27),(0,36),(7,27),(0,25)], -1.2, 3.1, "brass", .35)
        weapon_icon(family)
        rect("tier_shelf", 0, -17.5, 21, 12, 2.5, 3.8, "sage")
        text_curve = bpy.data.curves.new(root.name + "_tier_number", "FONT")
        text_curve.body, text_curve.align_x, text_curve.align_y = str(tier), "CENTER", "CENTER"
        text_curve.size, text_curve.extrude, text_curve.bevel_depth, text_curve.resolution_u = 9.5, .60, .05, 2
        number = bpy.data.objects.new(text_curve.name, text_curve)
        bpy.context.collection.objects.link(number)
        number.parent = root
        number.location, number.rotation_euler = xyz(0,-17.5,3.7), (math.pi/2,0,0)
        text_curve.materials.append(MATERIALS["steel"])
        bpy.ops.object.select_all(action="DESELECT")
        number.select_set(True)
        bpy.context.view_layer.objects.active = number
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        bpy.context.view_layer.update()
        bounds = [obj.matrix_world @ Vector(corner) for obj in root.children if obj.type == "MESH" for corner in obj.bound_box]
        dimensions = [max(v[i] for v in bounds)-min(v[i] for v in bounds) for i in range(3)]
        ENTRIES.append({"name":root.name,"node":root.name,"file":"weapon-mastery.glb","weaponClass":family,"tier":tier,
                        "weapons":[name for name,entry in registry["weapons"].items() if entry["class"] == family],
                        "dimensions":{"x":round(dimensions[0],3),"y":round(dimensions[2],3),"z":round(dimensions[1],3)},
                        "castShadow":False,"presentationOnly":True,"construction":"extruded chamfered service plate; formed enamel; mounted weapon silhouette and tier numeral"})

# Save named unbatched components before preparing material-batched exports.
for index, badge in enumerate(ROOTS):
    badge.location = ((index%5-2)*84, 0, (3.5-index//5)*84)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "weapon-mastery.blend"))
for badge in ROOTS:
    badge.location = (0,0,0)
    by_material = {}
    for obj in list(badge.children):
        by_material.setdefault(obj.data.materials[0].name,[]).append(obj)
    for name, objects in by_material.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects)>1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = badge.name + "_" + name
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.ops.object.select_all(action="SELECT")
glb = OUTPUT / "weapon-mastery.glb"
bpy.ops.export_scene.gltf(filepath=str(glb),export_format="GLB",use_selection=True,export_yup=True,
                          export_apply=True,export_materials="EXPORT",export_cameras=False,export_lights=False,export_extras=True)
glb_hash = hashlib.sha256(glb.read_bytes()).hexdigest()
manifest = {"schema":1,"version":"weapon-mastery-"+glb_hash[:12],"units":"game-world-units","upAxis":"Y","frontAxis":"+Z","origin":"center",
            "generator":"Blender "+bpy.app.version_string+"; tools/blender_mastery.py","weaponSource":"game.js WEAPONS via dev/simulate.cjs; weapon-mastery.js weaponClass",
            "badgeTiers":TIERS,"weapons":registry["weapons"],"defaultClass":"rifle",
            "files":{"weapon-mastery.glb":{"sha256":glb_hash,"bytes":glb.stat().st_size}},"models":ENTRIES}
(OUTPUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
meshes = [obj for badge in ROOTS for obj in badge.children if obj.type == "MESH"]
report = {"status":"PASS","blender":bpy.app.version_string,"weaponCount":len(registry["weapons"]),"badgeCount":len(ENTRIES),"classes":CLASSES,"tiers":TIERS,
          "triangles":sum(len(poly.vertices)-2 for mesh in meshes for poly in mesh.data.polygons),"meshes":len(meshes),"glbBytes":glb.stat().st_size,"glbSha256":glb_hash,
          "source":"editable named components in weapon-mastery.blend; live registry and configurable badge tiers read via Node",
          "contract":"mastery only; centered Y-up +Z service crests; four shared PBR materials; maximum four draws; no decoder or texture dependencies"}
(OUTPUT/"build-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")

# Exported geometry proof, not runtime sprites. The application renders GLB.
scene = bpy.context.scene
scene.render.engine, scene.render.film_transparent = "BLENDER_EEVEE", True
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 800, 1280, 100
scene.render.image_settings.file_format, scene.render.image_settings.color_mode = "PNG", "RGBA"
scene.world.color = (.25,.25,.25)
scene.view_settings.view_transform = "Standard"
camera_data = bpy.data.cameras.new("Mastery proof")
camera = bpy.data.objects.new("Mastery proof",camera_data)
bpy.context.collection.objects.link(camera)
camera_data.type, camera_data.ortho_scale = "ORTHO", 720
camera_data.clip_end = 2500
camera.location = (70,-1100,45)
camera.rotation_euler = (-camera.location).to_track_quat("-Z","Y").to_euler()
scene.camera = camera
for name, position, energy, size in [("Softbox",(-280,-300,480),3000000,650),("Fill",(300,-250,-120),1600000,550),("Rim",(-200,100,200),1800000,500)]:
    data = bpy.data.lights.new(name,"AREA")
    data.energy, data.shape, data.size = energy,"DISK",size
    light = bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (-light.location).to_track_quat("-Z","Y").to_euler()
for index, badge in enumerate(ROOTS):
    badge.location = ((index%5-2)*84, 0, (3.5-index//5)*84)
scene.render.filepath = str(OUTPUT/"proof-board.png")
bpy.ops.render.render(write_still=True)
print("WEAPON_MASTERY_ASSETS "+json.dumps(report))
