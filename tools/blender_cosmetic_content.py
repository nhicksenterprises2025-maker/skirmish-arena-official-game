"""Original cosmetic collection, using the existing head/torso GLB contract.

Editable geometry and UI artwork are authored here in local Blender. Runtime
limbs, hand anchors, collision, weapons and animation timing are not exported.
Rebuilding appends only this collection to the existing wardrobe manifest.
"""
import bpy, hashlib, json, math
from pathlib import Path
from mathutils import Vector

PROJECT = Path(__file__).resolve().parent.parent
OUT = PROJECT / 'assets' / '25d' / 'cosmetics'
OUT.mkdir(parents=True, exist_ok=True)
for folder in ('icons', 'banners'):
    (OUT / folder).mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
MATERIALS, ROOTS, ITEMS, COMPONENTS = {}, [], {}, {}
root = parent = None

# Each row owns a helmet, fitted armor construction and equipment layout.
# Common body attachment dimensions keep the existing arm/weapon rig aligned.
OPERATORS = [
 ('field-ranger','Field Ranger',500,'basic', '72806a','3d4c3b','c6b489','53614c','b98768'),
 ('metro-unit','Metro Unit',500,'basic', '65727b','33444b','c4d0cb','3a4b54','825944'),
 ('frontier','Frontier',1000,'detailed', 'a68b64','514b3e','dfc791','685d49','c79270'),
 ('sentinel','Sentinel',1000,'detailed', '6d8580','2c4b47','afc3b1','405b56','9f7356'),
 ('nightfall','Nightfall',1500,'cool-detailed', '313d45','1c2d35','7fb0af','26333a','c09072'),
 ('hazard','Hazard',1500,'cool-detailed', 'b7a563','404844','e6d49a','68725d','76513f'),
 ('vector','Vector',1500,'cool-detailed', 'b9c5bb','526761','709d89','4c635b','ab7859'),
 ('obsidian','Obsidian',2500,'premium', '2b3034','171e21','ac9475','222c2e','93664d'),
 ('aegis-prime','Aegis Prime',2500,'premium', 'bfc7b9','707d6a','d6bd77','586755','bc8663'),
 ('specter','Specter',2500,'premium', '4c5952','273a34','a8c5ab','32483e','825e49'),
]

def xyz(v):
    return (v[0], -v[2], v[1])

def material(color, metal=0, rough=.8):
    key = (color, metal, rough)
    if key not in MATERIALS:
        m = bpy.data.materials.new('cosmetic_' + color + '_' + str(metal))
        m.use_nodes = True
        srgb = [int(color[i:i+2], 16)/255 for i in (0,2,4)]
        linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in srgb]
        m.diffuse_color = (*linear, 1)
        shader = m.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*linear, 1)
        shader.inputs['Metallic'].default_value = metal
        shader.inputs['Roughness'].default_value = rough
        MATERIALS[key] = m
    return MATERIALS[key]

def finish(obj, name, color, metal=0):
    obj.name = root.name + '_' + name
    obj.parent = parent
    obj.data.materials.append(material(color, metal))
    return obj

def block(name, size, at, color, bevel=.5, metal=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(at))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Fitted bevel', 'BEVEL')
        mod.width = min(bevel, min(size)*.22)
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, color, metal)

def ellipsoid(name, size, at, color):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=1, location=xyz(at))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, color)

def beam(name, a, b, width, depth, color, metal=0):
    direction = Vector(xyz(b)) - Vector(xyz(a))
    obj = block(name, (width, direction.length, depth), (Vector(a)+Vector(b))/2, color, .2, metal)
    obj.rotation_euler = direction.to_track_quat('Z','Y').to_euler()
    return obj

def wedge(name, vertices, faces, color, metal=0):
    data = bpy.data.meshes.new(root.name + '_' + name)
    data.from_pydata([xyz(v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, color, metal)

def attachment(name):
    global parent
    parent = bpy.data.objects.new(root.name + '__' + name, None)
    parent.parent = root
    bpy.context.collection.objects.link(parent)

def face(p, covered=False):
    ellipsoid('neck', (5.7,5.4,7.1), (2,48.8,0), p['skin'])
    ellipsoid('face', (10.5,7.8,10.6), (.5,55,0), p['skin'])
    # Fitted planar cheeks and eyes rest against the face, rather than hovering.
    if not covered:
        for side in (-1,1):
            block('eye_brow', (1.1,1.1,4.7), (10.55,57,side*3.9), p['vest'], .2)
            block('eye', (.5,.7,2.5), (11.0,55.8,side*3.8), '23312c', .1)
        block('nose', (2.7,3.4,2.9), (10.65,53.8,0), p['skin'], .5)
        block('mouth', (.8,.65,4.1), (10.2,51.8,0), '684b3e', .15)

def armor(ident,p):
    body, vest, accent = p['body'], p['vest'], p['accent']
    block('fitted_jacket', (19,23,27), (-1,38,0), body, 2.5)
    if ident == 'field-ranger':
        block('light_carrier', (4.1,14,22), (10.2,37,0), vest, 1.3)
        beam('diagonal_sling',(8.8,48,-10),(12.2,28,9),1.6,2,accent)
        block('field_pouch', (4.5,7,7), (-11,31,-10), vest, .8)
        block('soft_back_yoke',(4,12,21),(-12,41,0),body,1.1)
    elif ident == 'metro-unit':
        block('short_rigid_carrier',(4.5,18,24),(10.4,38,0),vest,1.2)
        for side in (-1,1):
            block('horizontal_pocket',(3.2,5.3,8),(13,32,side*5),body,.7)
            block('collar_tab',(10,3.4,6),(0,48,side*8),vest,.6)
        block('central_id',(1.0,4.0,6.0),(13,44,0),accent,.2)
    elif ident == 'frontier':
        block('canvas_vest',(5,20,24),(10.1,37,0),vest,1.1)
        block('shoulder_mantle',(19,5.7,31),(-1,46,0),body,1.3)
        block('rear_travel_pack',(6,15,19),(-12.5,39,0),vest,1.2)
        beam('pack_harness',(10,46,-10),(13,29,-6),2.1,2.1,accent)
        block('long_tool_pouch',(4,10,6),(-6,32,14),vest,.7)
    elif ident == 'sentinel':
        wedge('shield_chest',[(8,28,-12),(8,28,12),(8,47,-12),(8,47,12),(14,32,-9),(14,32,9),(14,44,-10),(14,44,10)],[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],vest,.12)
        block('raised_collar',(15,6.5,25),(0,47,0),body,1.4)
        for side in (-1,1): block('flank_panel',(13,13,3.2),(-2,36,side*14),vest,.8)
        block('shield_center',(1,11,3),(14,39,0),accent,.3)
    elif ident == 'nightfall':
        block('close_fitted_vest',(4,17,22),(10,37,0),vest,.9)
        beam('left_cross_harness',(10.8,46,-10),(12.8,29,5),1.4,1.4,accent)
        beam('right_cross_harness',(10.8,46,10),(12.8,29,-5),1.4,1.4,accent)
        block('compact_comms',(4,8,7),(-13,43,-7),vest,.7)
        block('rear_band',(3,4,22),(-12,37,0),body,.7)
    elif ident == 'hazard':
        block('sealed_chest',(4.8,19,25),(10.2,38,0),vest,1.2)
        block('protective_collar',(15,6.8,25),(0,48,0),body,1.2)
        block('fitted_air_pack',(6,15,16),(-13,39,0),vest,1.2)
        for side in (-1,1): beam('sealing_strip',(11.8,46,side*10),(13.3,29,side*9),1.7,1.5,accent)
        block('air_pack_trim',(1,9,6),(-16,40,0),accent,.4)
    elif ident == 'vector':
        wedge('angled_carrier',[(8,28,-12),(8,28,12),(8,47,-12),(8,47,12),(14,30,-10),(14,33,10),(13,47,-10),(12,44,10)],[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],vest,.12)
        block('left_plate',(12,5,7),(0,47,-10),accent,.8)
        block('right_shoulder_yoke',(17,4,8),(-1,45,10),body,.7)
        beam('split_carrier_inlay',(14,44,-8),(14,35,7),1.4,1.6,accent)
        block('thin_back_shell',(4,18,23),(-12,39,0),vest,1.1)
    elif ident == 'obsidian':
        wedge('faceted_plate',[(8,28,-12),(8,28,12),(8,47,-12),(8,47,12),(13,29,-9),(13,29,9),(13,46,-9),(13,46,9),(16,38,0)],[(0,1,3,2),(4,8,6),(6,8,7),(7,8,5),(5,8,4),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],vest,.22)
        block('high_angular_collar',(14,6,25),(0,47,0),body,1)
        for side in (-1,1):
            block('folded_flank',(14,15,3),(-2,36,side*14),vest,.7)
            beam('collar_inlay',(3,49,side*10),(11,43,side*9),1.1,1.1,accent,.4)
        block('rear_spine_shell',(5,19,19),(-12,39,0),body,1)
    elif ident == 'aegis-prime':
        block('ivory_carrier',(5.7,19,24),(10.4,38,0),vest,1.4,.15)
        wedge('breastplate_crown',[(12,31,-10),(12,31,10),(12,46,-10),(12,46,10),(15,35,-8),(15,35,8),(15,43,-8),(15,43,8)],[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],body,.28)
        for side in (-1,1): block('shoulder_guard',(17,6,9),(0,46,side*10),body,1.1,.15)
        beam('gold_center_inlay',(15.1,43,0),(15.1,33,0),1.3,1.3,accent,.6)
        block('rear_guard',(5,18,23),(-12,39,0),vest,1.3,.15)
    elif ident == 'specter':
        block('scout_core',(4.4,16,21),(10,37,0),vest,1)
        # A short split cloak is body-attached and stays above moving pelvis.
        wedge('split_cape',[(-8,28,-14),(-8,28,14),(-10,47,-12),(-10,47,12),(-14,28,-14),(-14,28,14),(-15,44,-12),(-15,44,12)],[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],body)
        block('soft_shoulder_wrap',(17,5,30),(-1,46,0),body,1.2)
        beam('single_recon_sling',(11,45,-8),(12.5,29,5),1.9,1.6,accent)
        block('lower_rig_pocket',(3,6,8),(12.2,30,-6),vest,.7)

def helmet(ident,p):
    body,vest,accent=p['body'],p['vest'],p['accent']
    covered=ident not in ('field-ranger','metro-unit','frontier')
    face(p,covered)
    if ident=='field-ranger':
        ellipsoid('ranger_cap',(11.5,4.3,12.5),(-1,61.1,0),body)
        block('cap_peak',(14,1.6,23),(8.2,59,0),body,.6)
        block('cap_band',(18,1.8,25),(-1,59,0),vest,.4)
    elif ident=='metro-unit':
        ellipsoid('compact_patrol_helmet',(11.8,6.3,12.8),(-1,59.2,0),body)
        block('patrol_brow',(2.2,2.4,21),(10.6,59.1,0),vest,.5)
        for side in(-1,1):block('small_ear_guard',(6,6,2.8),(-1,54,side*11.2),vest,.7)
    elif ident=='frontier':
        ellipsoid('trail_shell',(11.4,5.7,12),(-1,59.8,0),body)
        block('wide_brim',(24,1.7,29),(1,57.9,0),vest,.5)
        for side in(-1,1):block('trail_goggle_frame',(2.2,3.3,7.8),(10.3,56.9,side*4.7),vest,.4)
    elif ident=='nightfall':
        ellipsoid('low_scout_shell',(11.4,7,12.4),(-1,58.6,0),body)
        block('single_optic_frame',(3.1,5.5,17),(10.8,56.3,0),vest,.7)
        block('narrow_scout_visor',(.7,2.2,14.5),(12.6,57.1,0),accent,.3)
        block('cloth_face_cover',(4.1,6.5,16),(9,51.5,0),vest,.8)
        for side in(-1,1):block('low_ear_pad',(5,6,3),(-2,54,side*11.5),vest,.7)
    elif ident=='hazard':
        ellipsoid('sealed_shell',(12,7.3,12.8),(-1,58.2,0),body)
        block('wide_sealed_window',(3.1,6.8,20),(10.2,56,0),vest,1)
        block('sealed_lens',(.7,4.5,17),(11.9,56.4,0),'bcc7b4',.7)
        block('respirator',(4.2,5.5,15),(9.4,50.9,0),vest,.8)
        for side in(-1,1):block('compact_filter',(4.4,4,4.6),(11.1,50.7,side*5.3),body,.7)
        block('filter_center',(1.1,2.6,3),(11.9,50.8,0),accent,.2)
    elif ident in ('sentinel','vector','obsidian','aegis-prime'):
        shell_size={'sentinel':(24,14.5,26),'vector':(24.5,13.5,25),'obsidian':(24,15,25),'aegis-prime':(24,15,26)}[ident]
        block('angular_' + ident + '_shell',shell_size,(-1,58,0),body,2.3,.12 if ident in('obsidian','aegis-prime') else 0)
        block('enclosed_mask',(4.7,11,17),(9.8,53.7,0),vest,1,.16)
        if ident=='sentinel':
            block('center_visor',(.8,3.7,15),(12.4,56.1,0),accent,.4)
            block('forehead_guard',(5,4,16),(9.5,61,0),vest,.7)
        elif ident=='vector':
            for side in(-1,1):
                panel=block('slanted_visor',(.7,3.4,6.4),(12.4,56.1,side*4.2),accent,.4);panel.rotation_euler.x=side*.18
            block('angular_center_ridge',(6,2,2),(7,65,0),vest,.4)
        elif ident=='obsidian':
            wedge('diamond_mask',[(12,49,-7),(12,49,7),(12,59,-7),(12,59,7),(15,54,0)],[(0,1,3,2),(0,4,1),(1,4,3),(3,4,2),(2,4,0)],vest,.28)
            for side in(-1,1):block('fine_visor',(.7,1.8,6),(13.2,57,side*3.2),accent,.2,.4)
        else:
            block('prime_visor',(.8,2.7,16),(12.5,56.5,0),accent,.4,.3)
            block('prime_brow',(4,2.2,18),(11,60.1,0),body,.5,.2)
            block('prime_center',(1.1,4.4,2),(12.8,51.3,0),accent,.3,.55)
        for side in(-1,1):block('fitted_temple',(6,7,2.8),(-1,54,side*12),vest,.7)
    else:
        ellipsoid('fitted_hood',(12.3,7.4,13.3),(-1.4,58.1,0),body)
        block('hood_opening',(4.4,11.2,18),(8.9,54,0),vest,1.1)
        block('specter_faceplate',(1.3,8.5,14),(11.6,54.3,0),body,.6)
        for side in(-1,1):block('specter_eye',(.6,2,4.8),(12.45,56.6,side*3.5),accent,.35)
        block('hood_brow',(4,2,20),(9,60,0),body,.5)

def bounds(obj):
    world=[obj.matrix_world@Vector(v) for v in obj.bound_box]
    return [[min(v[i] for v in world),max(v[i] for v in world)]for i in range(3)]

def overlaps(a,b,tolerance=.3):
    return all(a[i][0]<=b[i][1]+tolerance and b[i][0]<=a[i][1]+tolerance for i in range(3))

def verify_contact(ident):
    bpy.context.view_layer.update()
    objects=[o for o in root.children_recursive if o.type=='MESH']
    connected={0}
    while True:
        additional={i for i,o in enumerate(objects)if i not in connected and any(overlaps(bounds(o),bounds(objects[j]))for j in connected)}
        if not additional:break
        connected.update(additional)
    if len(connected)!=len(objects):
        raise RuntimeError(ident+' disconnected construction: '+str([objects[i].name for i in range(len(objects))if i not in connected]))
    COMPONENTS[ident]={'parts':len(objects),'connectedParts':len(connected),'toleranceWorld':.3}

def join_finishes():
    for group in list(root.children):
        by_material={}
        for obj in list(group.children):
            by_material.setdefault(tuple(m.name for m in obj.data.materials),[]).append(obj)
        for objects in by_material.values():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            obj=bpy.context.object
            obj.name=group.name+'_'+obj.data.materials[0].name
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            obj.parent=group

for ident,name,price,tier,body,vest,accent,pants,skin in OPERATORS:
    root=bpy.data.objects.new(ident.replace('-','_')+'_signature__main',None)
    bpy.context.collection.objects.link(root)
    ROOTS.append(root)
    root['presentation_only']=True
    root['operator_id']=ident
    root['cosmetic_id']=ident+'.signature'
    root['style_id']='main'
    p=dict(body=body,vest=vest,accent=accent,pants=pants,skin=skin,build=1)
    attachment('torso');armor(ident,p)
    attachment('head');helmet(ident,p)
    verify_contact(ident)
    join_finishes()
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in root.children_recursive:obj.select_set(True)
    target=OUT/(ident+'.signature.glb')
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True)
    binary=target.read_bytes()
    ITEMS[ident+'.signature']={
        'operatorId':ident,'name':name,'verified':False,'priceAC':price,'tier':tier,
        'styles':{'main':{'file':'assets/25d/cosmetics/'+target.name,'node':root.name,
            'palette':{k:'#'+v if isinstance(v,str)else v for k,v in p.items()},
            'attachments':{g.name.rsplit('__',1)[-1]:g.name for g in root.children},
            'meshes':len(meshes),'triangles':sum(len(f.vertices)-2 for o in meshes for f in o.data.polygons),
            'sha256':hashlib.sha256(binary).hexdigest(),'bytes':len(binary)}},
        'lobbyPose':None,'editableSource':'assets/25d/cosmetics/cosmetic-content.blend',
        'construction':COMPONENTS[ident]
    }

# Original medallions and landscape panels, rendered from editable meshes.
# UI receives small PNGs, rather than a WebGL context per tiny profile picture.
ICONS=[('ridge-watch','Ridge Watch','star','77836c','c8b893'),('metro-mark','Metro Mark','chevron','4d626b','c4d1c7'),('frontier-star','Frontier Star','compass','77684e','dec799'),('sentinel-eye','Sentinel Eye','shield','45655c','bfd0b8'),('nightfall-moon','Nightfall Moon','moon','293a42','9fc4bd'),('hazard-chevron','Hazard Chevron','triangle','555e49','dcc882'),('vector-cross','Vector Cross','arrow','748d80','d4dfcf'),('obsidian-shard','Obsidian Shard','crystal','303738','b79f7d'),('aegis-shield','Aegis Shield','prime','6a7b61','ded0a6'),('specter-mask','Specter Mask','mask','405c4b','c4d7bc'),('arena-laurel','Arena Laurel','laurel','5d7154','d3c296'),('precision-ring','Precision Ring','ring','455a51','c4d4be')]
BANNERS=[('field-line','Field Line','72846a','344634','b5bb94'),('metro-grid','Metro Grid','52676b','283d40','b7c4b9'),('frontier-dusk','Frontier Dusk','9e805c','554e41','d7bc91'),('sentinel-wall','Sentinel Wall','728b7d','324e44','b4c5ac'),('nightfall-horizon','Nightfall Horizon','384d53','1f333a','7baaaa'),('hazard-stripe','Hazard Stripe','949462','3b4d42','d1c387'),('vector-flow','Vector Flow','799489','3e6356','cbd9bd'),('obsidian-facet','Obsidian Facet','3a4648','222d2f','a99a7b')]
ART=[]

def art_root(ident):
    global root,parent
    root=bpy.data.objects.new(ident.replace('-','_'),None)
    bpy.context.collection.objects.link(root)
    parent=root;ART.append(root)
    root['presentation_only']=True
    root['original_artwork']=True

def plaque(name,points,z,depth,color,metal=0):
    # Artwork plane is Blender XY, with real bevelled extrusion in Z.
    n=len(points)
    vertices=[(x,y,h)for h in(z,z+depth)for x,y in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
    data=bpy.data.meshes.new(root.name+'_'+name);data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(obj);obj.parent=root;data.materials.append(material(color,metal))
    if depth>.3:
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        mod=obj.modifiers.new('Medallion edges','BEVEL');mod.width=.35;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
    return obj

def disk(name,radius,z,depth,color,vertices=32,at=(0,0)):
    return plaque(name,[(at[0]+math.cos(i*2*math.pi/vertices)*radius,at[1]+math.sin(i*2*math.pi/vertices)*radius)for i in range(vertices)],z,depth,color)

def artbar(name,a,b,width,z,color):
    dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);nx,ny=-dy/length*width/2,dx/length*width/2
    return plaque(name,[(a[0]+nx,a[1]+ny),(a[0]-nx,a[1]-ny),(b[0]-nx,b[1]-ny),(b[0]+nx,b[1]+ny)],z,1,color)

def icon_symbol(style,base,accent):
    if style in('star','compass'):
        count=5 if style=='star' else 4
        points=[(math.cos(math.pi/2+i*math.pi/count)*(16 if i%2==0 else 7),math.sin(math.pi/2+i*math.pi/count)*(16 if i%2==0 else 7))for i in range(count*2)]
        plaque('directional_star',points,2.5,2,accent,.3)
        if style=='compass':disk('compass_pivot',3.2,4.5,1,base,12)
    elif style=='chevron':
        for y in(-4,7):plaque('patrol_chevron',[(-16,y+7),(0,y-3),(16,y+7),(16,y+1),(0,y-9),(-16,y+1)],2.5,2,accent,.2)
    elif style in('shield','prime'):
        plaque('shield',[(-15,14),(15,14),(13,-5),(0,-18),(-13,-5)],2.5,2,accent,.3)
        plaque('shield_inset',[(-10,9),(10,9),(8,-3),(0,-12),(-8,-3)],4.5,.7,base)
        if style=='prime':artbar('prime_axis',(0,-9),(0,12),3,5.2,accent)
        else:plaque('sentinel_eye',[(-8,0),(0,5),(8,0),(0,-5)],5.2,1,accent)
    elif style=='moon':
        plaque('crescent',[(16*math.cos(math.pi/2+i*math.pi/16),16*math.sin(math.pi/2+i*math.pi/16))for i in range(33)]+[(8*math.cos(math.pi/2-i*math.pi/16)+6,8*math.sin(math.pi/2-i*math.pi/16))for i in range(33)],2.5,2,accent,.2)
        disk('distant_star',2.2,2.5,2,accent,4,(12,13))
    elif style=='triangle':
        plaque('warning',[(-17,-14),(17,-14),(0,17)],2.5,2,accent,.15)
        plaque('warning_inset',[(-10,-9),(10,-9),(0,9)],4.5,.7,base)
        artbar('hazard_mark',(0,-3),(0,6),2.5,5.2,accent);disk('hazard_dot',1.5,5.2,1,accent,8,(0,-6))
    elif style=='arrow':
        plaque('split_vector',[(-17,-13),(-3,0),(-17,13),(-5,13),(9,0),(-5,-13)],2.5,2,accent,.3)
        plaque('leading_vector',[(0,-13),(14,0),(0,13),(7,13),(21,0),(7,-13)],2.5,2,accent,.3)
    elif style=='crystal':
        plaque('crystal',[(-13,-7),(0,-18),(14,-7),(8,15),(-8,15)],2.5,2,accent,.45)
        artbar('facet_left',(-8,15),(0,-18),1.3,4.5,base);artbar('facet_right',(8,15),(0,-18),1.3,4.5,base)
    elif style=='mask':
        plaque('mask',[(-16,10),(0,17),(16,10),(12,-10),(0,-18),(-12,-10)],2.5,2,accent,.2)
        for side in(-1,1):plaque('mask_eye',[(side*3,4),(side*13,7),(side*10,0),(side*3,-1)],4.5,.7,base)
        artbar('mask_center',(0,-12),(0,-4),2,4.5,base)
    elif style=='laurel':
        for side in(-1,1):
            artbar('laurel_stem',(side*5,-17),(side*15,9),1.5,2.5,accent)
            for i in range(5):
                y=-11+i*5;x=side*(8+i*1.8)
                plaque('laurel_leaf',[(x,y),(x+side*6,y+4),(x+side*5,y+7),(x,y+3)],2.5,1.5,accent,.2)
        disk('arena_center',8,2.5,2,accent,6)
        disk('arena_inset',4,4.5,.7,base,6)
    else:
        for i in range(16):
            angle=2*math.pi*i/16
            artbar('precision_ring',(math.cos(angle)*13,math.sin(angle)*13),(math.cos(angle)*17,math.sin(angle)*17),2,2.5,accent)
        for a,b in[((-9,0),(9,0)),((0,-9),(0,9))]:artbar('precision_cross',a,b,2,2.5,accent)
        disk('precision_pivot',3,3.5,1,base,12)

for ident,name,style,base,accent in ICONS:
    art_root(ident)
    disk('profile_medallion',23,0,2,'24372d',40)
    disk('finish_border',21.5,2,.6,base,40)
    disk('inset_field',19.5,2.6,.5,'283b31',40)
    icon_symbol(style,base,accent)

for index,(ident,name,base,dark,accent)in enumerate(BANNERS):
    art_root(ident)
    plaque('banner_foundation',[(-100,-25),(100,-25),(100,25),(-100,25)],0,1.5,dark)
    if ident=='field-line':
        plaque('rolling_fields',[(-100,-20),(-100,2),(-60,11),(-10,1),(40,12),(100,4),(100,-20)],1.5,1,base)
        for y in(-16,-8):artbar('field_tracks',(-100,y),(100,y+6),1.6,2.5,accent)
    elif ident=='metro-grid':
        for x,h in[(-87,19),(-59,31),(-29,23),(7,39),(44,27),(77,33)]:
            plaque('urban_facade',[(x,-25),(x+20,-25),(x+20,-25+h),(x,-25+h)],1.5,1,base)
            artbar('facade_trim',(x+4,-20),(x+4,-28+h),1,2.5,accent)
        artbar('street_line',(-100,-15),(100,-15),2,2.5,accent)
    elif ident=='frontier-dusk':
        disk('setting_sun',14,1.5,1,accent,32,(-58,8))
        plaque('far_ridge',[(-100,-25),(-100,-9),(-69,0),(-37,-7),(5,11),(46,-6),(71,6),(100,-2),(100,-25)],2.5,1,base)
        plaque('near_ridge',[(-100,-25),(-100,-16),(-50,-6),(-12,-15),(30,-7),(75,-16),(100,-12),(100,-25)],3.5,1,dark)
    elif ident=='sentinel-wall':
        for x in range(-100,100,25):
            plaque('fortified_panel',[(x,-22),(x+22,-22),(x+22,22),(x,22)],1.5,1,base)
            artbar('wall_join',(x+4,-18),(x+4,18),1.3,2.5,accent)
        artbar('wall_header',(-100,10),(100,10),2,2.5,dark)
    elif ident=='nightfall-horizon':
        for x,y,r in[(-70,13,1.3),(-15,17,1),(40,11,1.5),(75,18,1)]:disk('distant_light',r,1.5,.7,accent,8,(x,y))
        plaque('night_horizon',[(-100,-25),(-100,-6),(-63,0),(-28,-4),(8,4),(47,-5),(80,1),(100,-3),(100,-25)],1.5,1,base)
        artbar('horizon_line',(-100,-15),(100,-15),1.8,2.5,accent)
    elif ident=='hazard-stripe':
        for x in range(-110,101,32):plaque('warning_band',[(max(-100,x),-25),(min(100,x+14),-25),(min(100,x+42),25),(max(-100,x+28),25)],1.5,1,base)
        artbar('contained_border',(-100,-19),(100,-19),1.6,2.5,accent);artbar('contained_border',(-100,19),(100,19),1.6,2.5,accent)
    elif ident=='vector-flow':
        for y in(-16,-5,6,17):plaque('directional_line',[(-100,y),(-25,y),(5,y+5),(100,y+5),(100,y+7),(4,y+7),(-26,y+2),(-100,y+2)],1.5,1,base if y%2 else accent)
        plaque('leading_notch',[(39,-12),(56,0),(39,12),(45,12),(62,0),(45,-12)],2.5,1,accent)
    else:
        for points,color in[([(-100,-25),(-100,25),(-25,25),(-10,-25)],base),([(-25,25),(45,25),(15,-25),(-10,-25)],dark),([(45,25),(100,25),(100,-25),(15,-25)],base)]:plaque('faceted_field',points,1.5,1,color)
        for a,b in[((-25,25),(-10,-25)),((45,25),(15,-25))]:artbar('facet_seam',a,b,1.8,2.5,accent)

scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='Standard'
scene.view_settings.look='Medium High Contrast'
scene.world.color=(.38,.38,.38)
bpy.ops.object.camera_add(location=(0,-8,140))
camera=bpy.context.object;camera.name='Artwork export camera';camera.data.type='ORTHO';camera.data.ortho_scale=53
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(-30,-25,90))
lamp=bpy.context.object;lamp.name='Artwork soft light';lamp.data.energy=110000;lamp.data.shape='DISK';lamp.data.size=80
lamp.rotation_euler=(Vector((0,0,0))-lamp.location).to_track_quat('-Z','Y').to_euler()
CONTENT={}
for obj in ROOTS+ART:
    for child in obj.children_recursive:child.hide_render=True
for index,obj in enumerate(ART):
    for child in obj.children_recursive:child.hide_render=False
    is_icon=index<len(ICONS)
    ident,name=ICONS[index][:2]if is_icon else BANNERS[index-len(ICONS)][:2]
    scene.render.resolution_x=256 if is_icon else 768
    scene.render.resolution_y=256 if is_icon else 192
    scene.render.resolution_percentage=100
    camera.data.ortho_scale=53 if is_icon else 210
    target=OUT/('icons'if is_icon else'banners')/(ident+'.png')
    scene.render.filepath=str(target)
    bpy.ops.render.render(write_still=True)
    binary=target.read_bytes()
    CONTENT[ident]={'kind':'profile-icon'if is_icon else'profile-banner','name':name,'verified':False,'file':'assets/25d/cosmetics/'+('icons/'if is_icon else'banners/')+target.name,'bytes':len(binary),'sha256':hashlib.sha256(binary).hexdigest(),'editableSource':'assets/25d/cosmetics/cosmetic-content.blend','artNode':obj.name,'dimensions':{'width':scene.render.resolution_x,'height':scene.render.resolution_y}}
    for child in obj.children_recursive:child.hide_render=True

# Save a browsable source board after exports. Runtime GLBs stay origin-centered.
for i,obj in enumerate(ROOTS):obj.location=((i%5)*75,(i//5)*90,0)
for i,obj in enumerate(ART):obj.location=((i%4)*230,230+(i//4)*70,0)
for obj in ROOTS+ART:
    for child in obj.children_recursive:child.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'cosmetic-content.blend'))
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf8'))
manifest['cosmetics'].update(ITEMS)
manifest['version']='cosmetic-content-'+hashlib.sha256(''.join(s['sha256']for item in manifest['cosmetics'].values()for s in item['styles'].values()).encode()).hexdigest()[:12]
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
content_path=OUT/'content-manifest.json'
content=json.loads(content_path.read_text(encoding='utf8')) if content_path.exists() else {'schema':1,'content':{}}
content['content'].update(CONTENT)
content.update(version='cosmetic-content-'+hashlib.sha256(''.join(c['sha256']for c in content['content'].values()).encode()).hexdigest()[:12],generator='Blender '+bpy.app.version_string+'; tools/blender_cosmetic_content.py')
(OUT/'content-manifest.json').write_text(json.dumps(content,indent=2)+'\n',encoding='utf8')
report={'status':'EXPORTED_AWAITING_RUNTIME_VALIDATION','blender':bpy.app.version_string,'operators':len(ITEMS),'icons':len(ICONS),'banners':len(BANNERS),'operatorBytes':sum(i['styles']['main']['bytes']for i in ITEMS.values()),'artworkBytes':sum(c['bytes']for c in CONTENT.values()),'maxTriangles':max(i['styles']['main']['triangles']for i in ITEMS.values()),'construction':COMPONENTS,'source':'assets/25d/cosmetics/cosmetic-content.blend'}
(OUT/'content-build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('COSMETIC_CONTENT_EXPORT '+json.dumps(report))
