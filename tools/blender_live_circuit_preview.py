"""Render a verification preview from the editable LIVE CIRCUIT Blender asset."""
import bpy
from pathlib import Path
from mathutils import Vector

OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "25d"
bpy.ops.wm.open_mainfile(filepath=str(OUTPUT / "live-circuit-details.blend"))
phone = bpy.data.objects["phone-device"]
phone.location = (0, 0, 0)
for obj in bpy.data.objects:
    ancestor = obj
    while ancestor.parent:
        ancestor = ancestor.parent
    obj.hide_render = ancestor != phone

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 480
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUTPUT / "phone-preview.png")
scene.world.color = (.12, .12, .12)
scene.view_settings.view_transform = "Standard"

def aim(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z", "Y").to_euler()

camera_data = bpy.data.cameras.new("Phone asset preview")
camera = bpy.data.objects.new("Phone asset preview", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (140, -620, 75)
camera_data.type = "ORTHO"
camera_data.ortho_scale = 398
aim(camera)
scene.camera = camera
for name, position, energy, size in [
    ("Soft key", (-230, -320, 350), 1900000, 350),
    ("Screen fill", (260, -290, 50), 1200000, 300),
    ("Rear rim", (20, 170, 240), 1800000, 220),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = position
    aim(light)
bpy.ops.render.render(write_still=True)
print("PHONE_ASSET_PREVIEW " + scene.render.filepath)
