"""Render the editable local asset board without changing the source .blend."""
import bpy
from mathutils import Vector
from pathlib import Path

root = Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(root / "assets/25d/brightfield-props.blend"))
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1280
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(root / "assets/25d/preview.png")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.22,.27,.22,1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .6

bpy.ops.mesh.primitive_plane_add(size=5000, location=(550,240,-3))
floor = bpy.context.object
material = bpy.data.materials.new("Asset board paper")
material.diffuse_color = (.65,.68,.57,1)
floor.data.materials.append(material)
bpy.ops.object.light_add(type="AREA", location=(350,-180,900))
light = bpy.context.object
light.data.energy = 12000000
light.data.shape = "DISK"
light.data.size = 800
light.rotation_euler = (Vector((550,240,0))-light.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.camera_add(location=(1550,-1150,1550))
camera = bpy.context.object
camera.rotation_euler = (Vector((550,250,25))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1580
camera.data.clip_end = 10000
scene.camera = camera
scene.view_settings.view_transform = "AgX"
bpy.ops.render.render(write_still=True)
