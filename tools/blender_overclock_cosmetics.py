"""Reproducible OVERCLOCK collection, authored/exported by local Blender.

All helpers use the existing X-forward, Y-up game-unit attachment contract.
The library replaces only the static torso/head finish. Existing rig limbs,
hands, weapon mounts, animation and gameplay collision remain authoritative.
"""
import bpy, json, math, hashlib, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / '25d' / 'cosmetics'
OUT.mkdir(parents=True, exist_ok=True)
# A visual repair can rebuild the editable board while exporting only the
# affected products. Existing verified catalog records/GLBs stay intact.
arguments = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
EXPORT_VARIANTS = set(arguments[arguments.index('--variants')+1].split(',')) if '--variants' in arguments else set()
PREVIOUS = json.loads((OUT/'manifest.json').read_text(encoding='utf8')) if (OUT/'manifest.json').exists() else None
if EXPORT_VARIANTS and not PREVIOUS:
    raise RuntimeError('A selective export requires the existing complete manifest')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
BASE = [
 ('urban-assault','4a5962','28353c','93a4ad','2f3a40','c38f6a',1.02),
 ('woodland-scout','627d4d','3e5437','a3c47c','405044','805b47',.98),
 ('desert-runner','c5a36d','8c744e','f0d3a1','786b52','d3a079',.95),
 ('blue-strike','26384a','182631','25a8ff','1e2c35','a96f55',1),
 ('crimson-guard','342f35','201f24','e64f5c','29282d','70483b',1.05),
 ('steel-recon','8c989e','59666d','d8e1e4','4b575c','e2b28e',.97),
 ('ranger-elite','6c7147','464a31','b3945b','4d4b35','9c684e',1.04),
 ('night-ops','222f3e','151e29','5f7fa2','17222d','bb8262',1),
]
PALETTES = {r[0]:dict(zip(('body','vest','accent','pants','skin','build'),r[1:])) for r in BASE}
DESIGNS = {
 'urban-utility':('urban-assault',1000,['414b53','293840','e49a50','626d77']),
 'alpine-scout':('steel-recon',1000,['d8dddc','3f5059','a7b8c3','a6b2b9']),
 'workshop':('ranger-elite',1000,['7d806b','424d49','bd9b60','7d806b']),
 'signal-runner':('woodland-scout',1000,['6b8796','334b58','a6c8d8','4c6473']),
 'cold-front':('steel-recon',1500,['b7c8ce','dde3e1','779bad','879ca7']),
 'containment':('urban-assault',1500,['424c51','2f3c43','d5be62','465258']),
 'recon-pilot':('ranger-elite',1500,['6b796c','394c45','b7b092','536659']),
 'midnight-circuit':('night-ops',1500,['33475d','26384d','689dca','2b3d51']),
 'black-ice':('blue-strike',2500,['40515f','354652','90d5e9','304253']),
 'aegis':('steel-recon',2500,['637781','9badb6','dce7ed','3d5360']),
 'monarch':('crimson-guard',2500,['3b424a','303943','bb9a60','38434d']),
}
ALTERNATES = {'black-ice':('white-ice',['dfe6e7','e9ece6','89bece','485760']), 'aegis':('aegis-arctic',['d1dbdf','e5e9e5','98c4d4','3b536b']), 'monarch':('monarch-platinum',['3b4653','34414e','b9c5cd','455160'])}
MATERIALS, ROOTS, ITEMS = {}, [], {}
root = parent = None

def xyz(p): return (p[0],-p[2],p[1])
def material(color,metal=.03):
    key=color+str(metal)
    if key not in MATERIALS:
        m=bpy.data.materials.new('finish_'+color+'_'+str(metal));m.use_nodes=True
        srgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
        linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
        m.diffuse_color=(*linear,1);bs=m.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=(*linear,1);bs.inputs['Roughness'].default_value=.72 if metal else .86;bs.inputs['Metallic'].default_value=metal
        MATERIALS[key]=m
    return MATERIALS[key]
def finish(o,name,color,metal=.03):
    o.name=root.name+'_'+name;o.parent=parent;o.data.materials.append(material(color,metal));return o
def block(name,size,at,color,bevel=.5):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('Clean bevel','BEVEL');b.width=min(bevel,min(size)*.23);b.segments=1;bpy.ops.object.modifier_apply(modifier=b.name)
    return finish(o,name,color)
def ellipsoid(name,size,at,color):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=xyz(at));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,color)
def camo_finish(obj,color,offset):
    # Color regions on existing faces, not layers of pasted-on decoration.
    obj.data.materials.append(material(color));obj.data.update()
    for face in obj.data.polygons:
        c=face.center
        if ((c.x>2 and c.z>1 and c.y*offset>-4) or (c.x<-3 and c.z<3 and c.y*offset>2)):
            face.material_index=1
def line(name,a,b,width,depth,color):
    direction=Vector(xyz(b))-Vector(xyz(a));mid=(Vector(a)+Vector(b))/2
    o=block(name,(width,direction.length,depth),mid,color,.2);o.rotation_euler=direction.to_track_quat('Z','Y').to_euler();return o
def attachment(name):
    global parent
    parent=bpy.data.objects.new(root.name+'__'+name,None);parent.parent=root;bpy.context.collection.objects.link(parent);return parent

def face_mesh(name, vertices, faces, color):
    data=bpy.data.meshes.new(root.name+'_'+name)
    data.from_pydata([xyz(v) for v in vertices],[],faces);data.update()
    obj=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    return finish(obj,name,color,0)

def shade(color, strength):
    return ''.join(f'{round(int(color[i:i+2],16)*strength):02x}' for i in (0,2,4))

def exposed_face(operator,p,hair):
    # Broad connected planes form a chin, jaw and cheekbone rather than a box
    # pasted onto a sphere. All dimensions remain inside the existing headgear.
    identity=list(PALETTES).index(operator)
    jaw=[1,.94,.92,.98,1.02,.95,1.01,.96][identity]
    rings=[(48.6,8.2,-5.4,5.7*jaw),(50.3,10.1,-7.7,7.6*jaw),
           (53.5,10.6,-10.3,9.9),(57,10.5,-10.8,10.7),
           (59.8,10.0,-10.3,10.4),(62.2,8.4,-9.2,9.4),(64.6,4.5,-6.3,6.1)]
    vertices=[]
    for y,front,back,width in rings:
        center=(front+back)/2;radius=(front-back)/2
        for i in range(12):
            angle=i*math.tau/12
            # The front cheek/eye plane spans the eyes, then turns into temples.
            x=front-(.45 if i in (1,11) else 0) if i in (0,1,11) else center+radius*math.cos(angle)
            vertices.append((x,y,width*math.sin(angle)))
    faces=[tuple(range(11,-1,-1)),tuple(range((len(rings)-1)*12,len(rings)*12))]
    for row in range(len(rings)-1):
        for i in range(12):faces.append((row*12+i,row*12+(i+1)%12,(row+1)*12+(i+1)%12,(row+1)*12+i))
    face_mesh('sculpted_head',vertices,faces,p['skin'])
    # Nose bridge, tip and alae share one closed wedge with the face; its root is
    # buried in the cheek planes, so neither profile nor rotation reveals a gap.
    face_mesh('nose_bridge',[(10.05,58.9,-.65),(10.05,58.9,.65),(11.25,57.1,-.8),(11.25,57.1,.8),
              (12.9,55.0,-1.05),(12.9,55.0,1.05),(11.6,54.15,-1.65),(11.6,54.15,1.65),
              (10.05,54.0,-1.65),(10.05,54.0,1.65)],
              [(0,1,3,2),(2,3,5,4),(4,5,7,6),(6,7,9,8),(8,9,1,0),(0,2,4,6,8),(1,9,7,5,3)],p['skin'])
    def facial_plate(name,points,color,offset=.075):
        # Surface follows the shallow front cheek slope rather than floating
        # at a shared world depth. Pairs are mirrored only across the face.
        verts=[]
        for y,z in points:
            upper=next(i for i,ring in enumerate(rings) if ring[0]>=y)
            lower=max(0,upper-1);a,b=rings[lower],rings[upper]
            t=(y-a[0])/(b[0]-a[0]) if upper!=lower else 0
            front=a[1]+(b[1]-a[1])*t;width=a[3]+(b[3]-a[3])*t
            verts.append((front-abs(z)/width*.9+offset,y,z))
        count=len(verts);verts += [(x-.30,y,z) for x,y,z in verts]
        faces=[tuple(range(count)),tuple(range(count*2-1,count-1,-1))]
        faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
        return face_mesh(name,verts,faces,color)
    lip=shade(p['skin'],.60)
    for side in (-1,1):
        eye=[(57.65,side*2.25),(58.1,side*3.1),(58.05,side*4.7),(57.65,side*5.5),(57.25,side*4.6),(57.25,side*3.15)]
        facial_plate('eye_white',eye,'c9c7b5',.15)
        facial_plate('iris',[(57.98,side*3.55),(57.98,side*4.35),(57.27,side*4.35),(57.27,side*3.55)],'343a34',.20)
        facial_plate('upper_lid',[(58.15,side*2.4),(58.4,side*3.2),(58.35,side*4.85),(57.9,side*5.6),(57.65,side*5.5),(58.05,side*4.7),(58.1,side*3.1)],lip,.21)
        facial_plate('brow',[(59.0,side*2.1),(59.45,side*2.25),(59.3,side*4.5),(58.8,side*5.65),(58.5,side*5.5),(58.9,side*4.3)],hair,.19)
    facial_plate('neutral_mouth',[(52.3,-2.9),(52.52,-1),(52.42,0),(52.52,1),(52.3,2.9),(52.02,1),(52.05,-1)],lip,.10)
def geometry(operator,variant,p):
    # Fitted body with large readable planes, matching the untouched base dimensions.
    attachment('torso');build=p['build'];body,vest,accent=p['body'],p['vest'],p['accent']
    block('jacket',(19,23,27*build),(-1,38,0),body,2.5)
    block('back_panel',(6,20,23),(-12.7,38,0),vest,1.2)
    simple=variant in ('urban-utility','workshop','signal-runner','alpine-scout')
    block('chest_rig',(4.3,13 if simple else 19,22),(10.4,38,0),vest,1)
    for side in (-1,1):
        line('shoulder_strap',(0,48,side*9),(12.6,35,side*9),1.5,2,vest)
        block('identity_patch',(.65,3.7,4.6),(12.9,43,side*6.2),accent,.15)
        if variant not in ('workshop','midnight-circuit','black-ice','aegis','monarch'):
            block('chest_pocket',(3.1,6.5,7),(13,32,side*5.5),body,.65)
    if variant in ('polar-camo','carbon-camo','alpine-scout'):
        # Broad fitted cloth panels; intentionally no random texture/geometry.
        camo='a0afb7' if variant!='carbon-camo' else '60717e'
        for side in (-1,1):
            for i,(x,y,w,h) in enumerate([(-3,43,8,5),(2,34,9,4),(-5,29,5,3)]):
                patch=block('camo_panel',(w,h,.42),(x+(BASE.index(next(r for r in BASE if r[0]==operator))%3-1),y,side*(13.5*build+.05)),camo,.15)
                patch.rotation_euler.y=(-.18 if i%2 else .2)*side
    if variant in ('helmet-off','polar-camo','carbon-camo'):
        family=list(PALETTES).index(operator)%4
        if family==0:
            block('compact_radio',(3,7,5),(-12,44,-11.5),vest,.6)
            line('radio_aerial',(-12,47,-11.5),(-12.5,54,-11.5),.5,.5,vest)
        elif family==1:
            for z in (-7,0,7):block('belt_tool_loop',(2.2,4,3.8),(-15,29,z),vest,.4)
        elif family==2:
            for side in (-1,1):line('rear_harness',(-16,44,side*8),(-16,30,side*5),1.1,1.4,accent)
        else:block('soft_collar',(11,3.8,21),(0,48,0),body,.8)
    if variant=='urban-utility':
        block('utility_tab',(.8,5,2),(13,30,-8),accent,.15);block('jacket_zip',(.45,17,.8),(9,37,0),accent,.12)
    if variant=='workshop':
        block('neat_tool_pouch',(3.8,7,6),(-2,29,-15),vest,.7)
        for z in (-16,-14):block('tool_handle',(1.1,4,1.1),(-1,33,z),accent,.2)
    if variant=='signal-runner':
        block('communications_pack',(4.2,9,8),(-17,40,-5),vest,.6)
        line('single_short_antenna',(-17,44,-5),(-18,54,-5),.7,.7,vest)
    if variant in ('cold-front','aegis'):
        block('fitted_collar',(12,6,23),(1,48,0),vest,1.3)
    if variant in ('recon-pilot','aegis'):
        for side in (-1,1):line('fitted_harness',(11.8,46,side*9),(13,29,side*6),1.7,2,accent)
    if variant in ('black-ice','aegis','monarch'):
        # Segmentation stays inside the standard silhouette, not stacked pouches.
        for side in (-1,1):block('segmented_plate',(1.6,7.5,8),(13,39,side*5),vest,.7)
        block('center_trim',(.6,12,1.2),(14,39,0),accent,.1)
    attachment('head')
    ellipsoid('neck',(5.8,5.2,7.2),(2,49,0),p['skin'])
    if variant=='helmet-off':
        hair=['473e36','302d2b','5f4a36','312d2c','282729','6a584b','403a31','393333'][list(PALETTES).index(operator)]
        exposed_face(operator,p,hair)
        ellipsoid('finished_hair',(11.1,4.9,11.6),(-1.4,61.1,0),hair)
        for side in (-1,1):
            block('headset',(5.4,7,3),(-1,55,side*11.8),vest,1)
        line('headset_band',(-1,63,-10),(-1,63,10),1,1.2,vest)
        line('microphone',(0,53,-13),(10,51,-9),.65,.65,vest)
    else:
        ellipsoid('head',(10.9,7.3,11.4),(-.2,55.5,0),p['skin'])
        shell=block('angular_helmet',(23.5,15.6,25),(-1,58,0),body,2.3) if variant=='monarch' else ellipsoid('helmet_shell',(12,8,13),(-1,58,0),body)
        if variant in ('polar-camo','carbon-camo','alpine-scout'):
            camo_finish(shell,'a2b3bf' if variant!='carbon-camo' else '728492',-1 if list(PALETTES).index(operator)%2 else 1)
        block('helmet_brow',(2.5,2.8,21),(10.8,60.1,0),vest,.6)
        visor='91b6c0' if variant not in ('midnight-circuit','black-ice','aegis','monarch','containment') else ('a1d6e6' if variant=='black-ice' else accent)
        block('goggle_frame',(3.2,7.6,20.5),(10.9,55.5,0),vest,1)
        for side in (-1,1):
            if variant!='aegis':block('visor',(0.8,4.7,8),(12.7,55.8,side*4.8),visor,.55)
            block('ear_protector',(6,7,3.2),(-2,53,side*12.7),vest,1)
        if variant=='alpine-scout':
            # Clear-looking low-opacity-neutral lens with visible skin backing.
            for side in (-1,1):block('lens_inner',(.4,2.6,5.2),(13.2,55.7,side*4.8),'cbd9d8',.25)
        if variant in ('containment','cold-front','recon-pilot','aegis','monarch'):
            block('lower_faceplate',(4.5,5.5,15),(9.7,50.1,0),vest,.9)
        if variant=='containment':
            block('respirator_center',(3.8,4.8,6),(13,50.2,0),accent,.8)
            for side in (-1,1):block('respirator_filter',(3.2,3.8,3.8),(12,50.1,side*6.7),body,.6)
        if variant=='recon-pilot':
            block('flight_helmet_center',(20,1.2,3),(-1,65.2,0),accent,.4)
        if variant=='midnight-circuit':
            for z in (-6,0,6):block('visor_segment',(1,6.5,1),(13.3,55.7,z),vest,.2)
        if variant=='monarch':
            for side in (-1,1):
                block('angular_temple',(8,3,2),(0,61.8,side*11),accent,.4)
        if variant=='aegis':
            block('enclosed_faceplate',(1.1,10,17),(12.8,54,0),vest,.7)
            block('continuous_visor',(.6,2.5,16),(13.4,56.7,0),accent,.4)

def build_item(operator,variant,price):
    global root
    ident=operator+'.'+variant;base=dict(PALETTES[operator]);styles={};roots=[]
    for style_id in ['main']+([ALTERNATES[variant][0]] if variant in ALTERNATES else []):
        p=dict(base)
        if variant=='polar-camo':p.update(body='e0e5e5',vest='485863',accent=base['accent'],pants='b5c1c8')
        elif variant=='carbon-camo':p.update(body='3c4d5b',vest='657682',accent=base['accent'],pants='344654')
        elif variant in DESIGNS:p.update(zip(('body','vest','accent','pants'),DESIGNS[variant][2] if style_id=='main' else ALTERNATES[variant][1]))
        root=bpy.data.objects.new(ident.replace('.','_')+'__'+style_id,None);bpy.context.collection.objects.link(root);root['presentation_only']=True;root['operator_id']=operator;root['cosmetic_id']=ident;root['style_id']=style_id
        ROOTS.append(root);roots.append(root);geometry(operator,variant,p)
        # One mesh per finish per articulated attachment; no mesh crosses a joint.
        for group in list(root.children):
            by_mat={}
            for obj in list(group.children):
                # Multi-finish camo shell remains one mesh with material groups.
                by_mat.setdefault('|'.join(m.name for m in obj.data.materials),[]).append(obj)
            for mat_name,objects in by_mat.items():
                bpy.ops.object.select_all(action='DESELECT')
                for obj in objects:obj.select_set(True)
                bpy.context.view_layer.objects.active=objects[0]
                if len(objects)>1:bpy.ops.object.join()
                obj=bpy.context.object;obj.name=group.name+'_'+mat_name;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);obj.parent=group
        meshes=[o for o in root.children_recursive if o.type=='MESH']
        styles[style_id]={'file':'assets/25d/cosmetics/'+ident+'.glb','node':root.name,'palette':{k:('#'+v if isinstance(v,str) else v) for k,v in p.items()},'attachments':{g.name.rsplit('__',1)[-1]:g.name for g in root.children},'meshes':len(meshes),'triangles':sum(sum(len(poly.vertices)-2 for poly in o.data.polygons) for o in meshes)}
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots:
        r.select_set(True)
        for child in r.children_recursive:child.select_set(True)
    target=OUT/(ident+'.glb')
    if EXPORT_VARIANTS and variant not in EXPORT_VARIANTS:
        ITEMS[ident]=PREVIOUS['cosmetics'][ident]
        return
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True)
    binary=target.read_bytes()
    assert binary[:4]==b'glTF' and len(binary)>1000
    for style in styles.values():style.update(sha256=hashlib.sha256(binary).hexdigest(),bytes=len(binary))
    ITEMS[ident]={'operatorId':operator,'verified':False,'priceAC':price,'styles':styles,'lobbyPose':variant if variant in ALTERNATES else None,'editableSource':'assets/25d/cosmetics/overclock-collection.blend'}

for operator in PALETTES:
    for variant in ('helmet-off','polar-camo','carbon-camo'):build_item(operator,variant,500)
for variant,(operator,price,_) in DESIGNS.items():build_item(operator,variant,price)
for i,r in enumerate(ROOTS):r.location=((i%8)*64,(i//8)*80,0)
bpy.context.scene.unit_settings.system='NONE'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'overclock-collection.blend'))
content_hash=hashlib.sha256(''.join(s['sha256'] for item in ITEMS.values() for s in item['styles'].values()).encode()).hexdigest()[:12]
manifest={'schema':1,'version':'overclock-cosmetics-'+content_hash,'generator':'Blender '+bpy.app.version_string+'; tools/blender_overclock_cosmetics.py','coordinateContract':'+X forward / +Y up / game units / existing torso attachment','cosmetics':ITEMS}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
report={'status':'EXPORTED_AWAITING_RUNTIME_VALIDATION','blender':bpy.app.version_string,'products':len(ITEMS),'appearances':len(ROOTS),'glbBytes':sum(p.stat().st_size for p in OUT.glob('*.glb')),'triangles':sum(s['triangles'] for p in ITEMS.values() for s in p['styles'].values()),'source':'assets/25d/cosmetics/overclock-collection.blend'}
(OUT/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('OVERCLOCK_COSMETICS_EXPORT '+json.dumps(report))
