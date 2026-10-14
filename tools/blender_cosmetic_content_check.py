"""Reopen the real editable source and render its exported attachment designs.

This proof board contains head/torso attachments. Playable limbs and animation
are verified separately against the existing runtime rig.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector

PROJECT=Path(__file__).resolve().parent.parent
OUT=PROJECT/'assets'/'25d'/'cosmetics'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'cosmetic-content.blend'))
manifest=json.loads((OUT/'manifest.json').read_text())
ids=['field-ranger','metro-unit','frontier','sentinel','nightfall','hazard','vector','obsidian','aegis-prime','specter']
for obj in bpy.data.objects:
    if obj.type=='MESH':obj.hide_render=True
roots=[]
label_material=bpy.data.materials.new('Proof labels');label_material.use_nodes=True
label_shader=label_material.node_tree.nodes.get('Principled BSDF')
label_shader.inputs['Emission Color'].default_value=(.6,.65,.55,1)
label_shader.inputs['Emission Strength'].default_value=.8
for index,ident in enumerate(ids):
    item=manifest['cosmetics'][ident+'.signature'];node=item['styles']['main']['node']
    root=bpy.data.objects.get(node)
    assert root and root.get('operator_id')==ident and root.get('presentation_only')
    assert len(root.children)==2
    for attachment in root.children:
        assert attachment.location.length<1e-6
        assert attachment.rotation_euler.to_matrix().is_identity
        assert all(abs(v-1)<1e-6 for v in attachment.scale)
        assert attachment.children
    root.location=((index%5-2)*78,0,(1-index//5)*81)
    root.rotation_euler.z=-math.pi/2
    for child in root.children_recursive:child.hide_render=False
    roots.append(root)
    curve=bpy.data.curves.new(ident+' proof label','FONT');curve.body=item['name'];curve.size=4.7;curve.align_x='CENTER'
    curve.materials.append(label_material)
    label=bpy.data.objects.new(curve.name,curve);bpy.context.collection.objects.link(label)
    label.location=(root.location.x,-25,root.location.z+22)
    label.rotation_euler.x=math.pi/2
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.film_transparent=False
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.042,.061,.047,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.view_settings.view_transform='Standard'
scene.view_settings.look='Medium High Contrast'
camera=scene.camera
camera.location=(0,-700,117)
camera.rotation_euler=(Vector((0,0,83))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=415
for obj in bpy.data.objects:
    if obj.type=='LIGHT':obj.data.energy=1600000;obj.data.size=220;obj.location=(-120,-140,260);obj.rotation_euler=(Vector((0,0,70))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA',location=(160,-100,130))
fill=bpy.context.object;fill.data.energy=850000;fill.data.size=200;fill.rotation_euler=(Vector((0,0,70))-fill.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1660;scene.render.resolution_y=780;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'content-operators-proof.png')
bpy.ops.render.render(write_still=True)
report={'ok':True,'blender':bpy.app.version_string,'reopened':'assets/25d/cosmetics/cosmetic-content.blend','operators':len(roots),'identityAttachmentTransforms':True,'proof':'assets/25d/cosmetics/content-operators-proof.png','scope':'editable exported head/torso construction; playable rig checked by dev/cosmetic-content-assets-check.mjs'}
(OUT/'content-source-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('COSMETIC_SOURCE_VALIDATION '+json.dumps(report))
