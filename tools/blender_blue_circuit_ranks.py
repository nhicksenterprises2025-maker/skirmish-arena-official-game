"""Build BLUE CIRCUIT's ranked crests with the installed Blender workflow.

The only rank list is progression.js; Node exports it directly to this generator.
Run: blender --background --factory-startup --python tools/blender_blue_circuit_ranks.py
The exported badge is centered, faces +Z, and is Y-up in the existing GLB loader.
"""
import bpy
import hashlib
import json
import re
import subprocess
from pathlib import Path
from mathutils import Vector

PROJECT = Path(__file__).resolve().parent.parent
OUTPUT = PROJECT / "assets" / "25d" / "ranks"
OUTPUT.mkdir(parents=True, exist_ok=True)
RANKS = json.loads(subprocess.check_output(
    ["node", "-e", "process.stdout.write(JSON.stringify(require('./progression.js').ranks))"],
    cwd=PROJECT, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)))
assert len(RANKS) == 26 and RANKS[0]["name"] == "Beginner I" and RANKS[-1]["name"] == "Ascendant"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0

SWATCHES = {"navy": ("182e47", .68, .20), "blue": ("386789", .53, .32),
            "silver": ("bacbd3", .40, .55), "light": ("88b6d4", .45, .42)}
MATERIALS = {}
for name, (color, roughness, metallic) in SWATCHES.items():
    mat = bpy.data.materials.new("rank_" + name)
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

def prism(name, points, back, front, finish, bevel=.22):
    """A closed, gently chamfered plate in runtime XY, extruded along Z."""
    n = len(points)
    vertices = [xyz(x, y, z) for z in (back, front) for x, y in points]
    faces = [tuple(range(n-1, -1, -1)), tuple(range(n, n*2))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    data = bpy.data.meshes.new(root.name + "_" + name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(MATERIALS[finish])
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Recalculate winding after the coordinate-system conversion.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    if bevel:
        mod = obj.modifiers.new("Cut metal edge", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def rect(name, x, y, w, h, back, front, finish):
    return prism(name, [(x-w/2,y-h/2),(x+w/2,y-h/2),(x+w/2,y+h/2),(x-w/2,y+h/2)], back, front, finish)

def chevron(name, y, width=23, finish="silver", back=2.9, front=4.5):
    return prism(name, [(-width/2,y+2), (0,y-5), (width/2,y+2),
                        (width/2,y+6), (0,y-1), (-width/2,y+6)], back, front, finish)

def diamond(name, x, y, size, back, front, finish):
    return prism(name, [(x,y+size),(x+size*.72,y),(x,y-size),(x-size*.72,y)], back, front, finish)

families = []
for index, rank in enumerate(RANKS):
    name = rank["name"]
    match = re.match(r"^(.*?) (I{1,3})$", name)
    family, division = (match.group(1), len(match.group(2))) if match else (name, 0)
    if family not in families:
        families.append(family)
    prestige = families.index(family)
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    root = bpy.data.objects.new("rank-badge-" + slug, None)
    root["rank_name"] = name
    root["rank_index"] = index
    root["elo_threshold"] = rank["threshold"]
    root["presentation_only"] = True
    bpy.context.collection.objects.link(root)
    ROOTS.append(root)

    # Every family shares the same tactical shield; added prestige comes from
    # broad, attached shoulders and larger heraldry, never miniature ornament.
    crest = [(-20,27),(20,27),(26,19),(22,-13),(0,-31),(-22,-13),(-26,19)]
    prism("crest_rim", crest, -2.3, 1.2, "silver")
    prism("navy_enamel", [(x*.90,y*.90) for x,y in crest], 1, 2.8, "navy")
    rect("header", 0, 20, 30, 3, 2.7, 3.7, "blue" if prestige < 6 else "light")

    if prestige >= 3:
        # One to three broad external fins remain physically seated in the rim.
        fins = 1 if prestige < 6 else 2 if prestige < 9 else 3
        for side in (-1, 1):
            for fin in range(fins):
                y = 13 - fin*8
                points = [(side*20,y+4),(side*(31+prestige*.35),y+8),
                          (side*(30+prestige*.35),y),(side*21,y-5)]
                prism("shoulder_%s_%s" % (side,fin), points, -1.8, .7, "blue" if prestige < 8 else "silver")

    if prestige < 3:
        for row in range(prestige+1):
            chevron("service_chevron_%s" % row, 9-row*6, 25-row*2)
    else:
        diamond("center_medallion", 0, 5, 13, 2.6, 4.4, "blue" if prestige < 6 else "silver")
        diamond("center_field", 0, 5, 9.5, 4.25, 4.9, "navy")
        if prestige in (3, 4, 5):
            chevron("veteran_chevron", 6, 13, "light", 4.8, 5.8)
            if prestige >= 4:
                rect("veteran_spine", 0, 6, 2.6, 14, 5.5, 6.1, "silver")
            if prestige == 5:
                rect("veteran_crossbar", 0, 6, 13, 2.6, 5.5, 6.1, "silver")
        else:
            # Compass cores progress from diamond to four/eight point forms.
            diamond("compass_core", 0, 5, 7.5, 4.8, 6.2, "light")
            if prestige >= 7:
                prism("compass_horizontal", [(-9,5),(0,8),(9,5),(0,2)], 4.8, 5.9, "silver")
            if prestige >= 8:
                for side in (-1,1):
                    prism("compass_diagonal_%s" % side, [(side*-5,-1),(side*6,10),(side*4,2)], 4.8, 5.7, "light")

    if prestige >= 6:
        crown_height = 30 + max(0, prestige-8)*2
        prism("crown", [(-15,26),(-13,crown_height),(0,crown_height+5),(13,crown_height),(15,26)], -1.5, .9, "silver")
        diamond("crown_inlay",0,crown_height-1,3,-.1,1.6,"blue")
    if division:
        # Roman I/II/III are modeled, not texture labels. Spacing stays readable
        # in a compact 80-pixel badge and each division has a distinct silhouette.
        for stroke in range(division):
            x = (stroke-(division-1)/2)*5
            rect("division_%s" % (stroke+1),x,-17,2.2,8,2.5,4.2,"silver")
            rect("division_cap_%s" % (stroke+1),x,-12.8,3.5,1.2,2.5,4.2,"silver")
            rect("division_foot_%s" % (stroke+1),x,-21.2,3.5,1.2,2.5,4.2,"silver")
    else:
        diamond("apex_jewel",0,-17,5.5,2.6,4.5,"light")
        if prestige >= 10:
            for side in (-1,1):
                chevron("apex_guard_%s" % side,-16,13,"silver",2.7,3.6).location.x=side*8
        if prestige == 11:
            prism("ascendant_spine",[(-1.5,-29),(1.5,-29),(1.5,26),(0,30),(-1.5,26)],.8,2.9,"light")

    # One runtime mesh per finish, while the editable source preserves semantic
    # named pieces. Export a temporary copy, then return to the authoring scene.
    root.update_tag()
    bpy.context.view_layer.update()
    bounds = [obj.matrix_world @ Vector(corner) for obj in root.children if obj.type == "MESH" for corner in obj.bound_box]
    lo = [min(v[i] for v in bounds) for i in range(3)]
    hi = [max(v[i] for v in bounds) for i in range(3)]
    ENTRIES.append({"name":root.name,"node":root.name,"file":"blue-circuit-ranks.glb",
                    "rankName":name,"rankIndex":index,"threshold":rank["threshold"],
                    "family":family,"division":division,"thumbnail":slug+".png",
                    "dimensions":{"x":round(hi[0]-lo[0],3),"y":round(hi[2]-lo[2],3),"z":round(hi[1]-lo[1],3)},
                    "castShadow":False,"presentationOnly":True})

# Preserve unbatched editable sources, arranged as a board for convenient editing.
for index, badge in enumerate(ROOTS):
    badge.location = ((index%7-3)*86, 0, (1.5-index//7)*91)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "blue-circuit-ranks.blend"))
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
glb = OUTPUT / "blue-circuit-ranks.glb"
bpy.ops.export_scene.gltf(filepath=str(glb),export_format="GLB",use_selection=True,export_yup=True,
                          export_apply=True,export_materials="EXPORT",export_cameras=False,
                          export_lights=False,export_extras=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = scene.render.resolution_y = 192
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.world.color = (.25,.25,.25)
scene.view_settings.view_transform = "Standard"
def aim(obj):
    obj.rotation_euler = (-obj.location).to_track_quat("-Z","Y").to_euler()
camera_data = bpy.data.cameras.new("Crest thumbnails")
camera = bpy.data.objects.new("Crest thumbnails",camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (18,-180,18)
camera_data.type = "ORTHO"
camera_data.ortho_scale = 92
aim(camera)
scene.camera = camera
for name, position, energy, size in [("Softbox",(-60,-120,95),150000,120),("Fill",(90,-75,20),80000,100),("Rim",(-20,70,75),90000,75)]:
    data=bpy.data.lights.new(name,"AREA")
    data.energy=energy
    data.shape="DISK"
    data.size=size
    light=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(light)
    light.location=position
    aim(light)
for badge in ROOTS:
    for child in badge.children:
        child.hide_render=True
for badge, entry in zip(ROOTS, ENTRIES):
    for child in badge.children:
        child.hide_render=False
    scene.render.filepath=str(OUTPUT/entry["thumbnail"])
    bpy.ops.render.render(write_still=True)
    entry["thumbnailSha256"]=hashlib.sha256((OUTPUT/entry["thumbnail"]).read_bytes()).hexdigest()
    for child in badge.children:
        child.hide_render=True

glb_hash=hashlib.sha256(glb.read_bytes()).hexdigest()
manifest={"schema":1,"version":"blue-circuit-ranks-"+glb_hash[:12],"units":"game-world-units",
          "upAxis":"Y","frontAxis":"+Z","origin":"center","generator":"Blender "+bpy.app.version_string+"; tools/blender_blue_circuit_ranks.py",
          "rankSource":"progression.js SARProgression.ranks","files":{"blue-circuit-ranks.glb":{"sha256":glb_hash,"bytes":glb.stat().st_size}},"models":ENTRIES}
(OUTPUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
meshes=[obj for badge in ROOTS for obj in badge.children if obj.type=="MESH"]
report={"status":"PASS","blender":bpy.app.version_string,"rankCount":len(ENTRIES),"families":families,
        "triangles":sum(len(poly.vertices)-2 for mesh in meshes for poly in mesh.data.polygons),
        "meshes":len(meshes),"glbBytes":glb.stat().st_size,"glbSha256":glb_hash,
        "thumbnailBytes":sum((OUTPUT/entry["thumbnail"]).stat().st_size for entry in ENTRIES),
        "source":"editable named geometry in blue-circuit-ranks.blend; exact registry read via Node",
        "contract":"ranked ELO only; 26 centered Y-up +Z crests; four materials; no texture or decoder dependencies"}
(OUTPUT/"build-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print("BLUE_CIRCUIT_RANKS "+json.dumps(report))
