"""Author the two map libraries using the existing local, decoder-free GLB pipeline.
Run Blender --background --factory-startup --python tools/blender_map_ecosystem.py.
Ground-centered templates use game world units; authoritative footprints stay in map-data.js.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "25d"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
PALETTE = {"iron":"344840", "steel":"64786c", "paint":"8f9e8b", "cream":"d0ccb2", "timber":"a28a63", "orange":"b39164", "panel":"4f685e"}
MATS = {}
for name, colour in PALETTE.items():
    mat = bpy.data.materials.new("map_" + name)
    mat.use_nodes = True
    rgb = [int(colour[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [v / 12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    mat.diffuse_color = (*linear, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = .82
    shader.inputs["Metallic"].default_value = .12 if name in ("steel", "iron") else 0
    MATS[name] = mat
ROOTS = []
current = None

def asset(name):
    global current
    current = bpy.data.objects.new(name, None)
    current["presentation_only"] = True
    bpy.context.collection.objects.link(current)
    ROOTS.append(current)

def finish(obj, name, material):
    obj.name = current.name + "_" + name
    obj.parent = current
    obj.data.materials.append(MATS[material])
    return obj

def block(name, dimensions, at, material, bevel=.6):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.object
    obj.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Restrained edge highlight", "BEVEL")
        mod.width = min(bevel, min(dimensions)*.15)
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, material)

def cylinder(name, radius, length, at, material, rotation=None, vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=length, location=at)
    obj = bpy.context.object
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, name, material)

def beam(name, a, b, width, material):
    vec = Vector(b)-Vector(a)
    obj = block(name, (width,width,vec.length), (Vector(a)+Vector(b))/2, material)
    obj.rotation_euler = vec.to_track_quat("Z","Y").to_euler()

# Compact press: broad grounded casting, seated die and clearly supported crosshead.
asset("foundry_press")
block("foundation", (128,80,8), (0,0,4), "iron")
block("casting", (120,74,30), (0,0,23), "paint", 2)
for x in (-44,44):
    block("upright", (16,56,52), (x,0,59), "steel", 1)
block("crosshead", (112,60,14), (0,0,82), "paint", 1.5)
block("bed", (74,60,9), (0,0,40), "iron", .8)
block("die", (44,40,10), (0,0,50), "steel", .5)
cylinder("ram", 9,25,(0,0,66),"steel")
block("control", (20,9,14), (40,-33,59), "panel")
for x in (-20,20):
    block("base_access",(24,1,11),(x,-37.2,22),"panel",.2)

# Rack is a solid enclosed stock cart: its visual base matches its impassable footprint.
asset("foundry_rack")
block("base",(160,80,7),(0,0,3.5),"iron")
block("stock",(150,72,43),(0,0,29),"timber",1.2)
for x in (-72,72):
    block("end_cap",(8,80,57),(x,0,31),"steel")
for z in (17,34,50):
    block("band",(160,4,4),(0,-37,z),"iron",.2)
for x in (-45,45):
    block("strap",(5,76,53),(x,0,30),"orange",.3)

asset("foundry_workbench")
block("cabinet",(108,58,38),(0,0,19),"paint",1.2)
block("top",(112,64,5),(0,0,40.5),"timber",.8)
for x in (-34,0,34):
    block("drawer",(30,1.2,23),(x,-29.5,23),"steel",.3)
    block("handle",(13,2,2),(x,-31,28),"iron",.3)
block("vice_base",(22,17,4),(31,8,45),"steel",.4)
block("vice",(25,14,9),(31,8,51.5),"iron",.7)

# Relay landmark: low solid equipment base supports a slender mast. No walkable elevation.
asset("relay_mast")
block("pad",(112,112,7),(0,0,3.5),"cream",1)
block("equipment",(96,96,38),(0,0,26),"paint",1.5)
block("cap",(104,104,5),(0,0,47.5),"steel",.7)
cylinder("mast",7,120,(0,0,108),"iron",vertices=8)
for x,y in ((-36,-36),(-36,36),(36,-36),(36,36)):
    beam("mast_support",(x,y,49),(0,0,100),4,"steel")
block("cross_arm",(86,7,7),(0,0,151),"steel",.5)
for x in (-36,36):
    block("antenna",(12,9,45),(x,0,160),"cream",1)
block("service_panel",(33,1.3,24),(0,-48.5,25),"panel",.3)
for z in (18,26,34):
    block("vent",(25,1.8,1),(0,-49.4,z),"iron",.1)

asset("relay_generator")
block("pad",(176,80,6),(0,0,3),"cream",1)
block("case",(164,70,52),(0,0,32),"paint",2)
block("lid",(168,74,4),(0,0,60),"steel",1)
block("service",(51,1.3,34),(45,-35.5,31),"panel",.3)
for x in (-58,-48,-38,-28,-18):
    block("vent",(5,1.4,24),(x,-36.1,32),"iron",.25)
block("handle",(16,2.8,2.8),(45,-38,35),"cream",.4)
for x in (-60,60):
    block("foot",(20,66,6),(x,0,9),"iron",.6)

asset("relay_barrier")
block("base",(144,64,8),(0,0,4),"cream",1)
block("lower",(140,56,21),(0,0,18.5),"cream",1.2)
block("upper",(136,42,29),(0,0,41.5),"cream",1.5)
block("cap",(140,46,4),(0,0,58),"steel",.7)
for x in (-46,46):
    block("inset",(16,1.2,16),(x,-21.5,43),"orange",.4)

# Batch inside each asset by material, preserving independent templates and local coordinates.
models = []
for parent in ROOTS:
    groups = {}
    for obj in list(parent.children):
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for material, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects)>1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = parent.name + "_" + material
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        obj.parent = parent
    points = [obj.matrix_world @ Vector(c) for obj in parent.children for c in obj.bound_box]
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    size = {"x":round(hi[0]-lo[0],3),"y":round(hi[2]-lo[2],3),"z":round(hi[1]-lo[1],3)}
    models.append({"name":parent.name,"node":parent.name,"file":"map-ecosystem.glb","dimensions":size,"castShadow":True,"presentationOnly":True})
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/"map-ecosystem.glb"),export_format="GLB",use_selection=True,export_yup=True,export_apply=True,export_materials="EXPORT",export_cameras=False,export_lights=False,export_extras=True)
manifest_path = OUTPUT / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["models"] = [m for m in manifest["models"] if m.get("file")!="map-ecosystem.glb"]+models
manifest["mapGenerator"] = f"Blender {bpy.app.version_string}; tools/blender_map_ecosystem.py"
manifest["mapRevision"] = "map-ecosystem-1"
manifest_path.write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
for i,parent in enumerate(ROOTS):
    parent.location = ((i%3)*280,(i//3)*260,0)
bpy.context.scene.unit_settings.system = "NONE"
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/"map-ecosystem.blend"))
report = {"status":"PASS","blender":bpy.app.version_string,"assets":len(ROOTS),"meshes":len([o for o in bpy.data.objects if o.type=="MESH"]),"triangles":sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH"),"glbBytes":(OUTPUT/"map-ecosystem.glb").stat().st_size,"maps":["foundry-crossing","relay-fields"],"source":"editable local Blender authoring; current GLB and instancing pipeline"}
(OUTPUT/"map-ecosystem-build-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print("MAP_ECOSYSTEM_ASSET_BUILD "+json.dumps(report))
