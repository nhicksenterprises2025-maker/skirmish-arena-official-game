"""Reproducible LIVE CIRCUIT identity pass using retained CC0 sources only."""
from pathlib import Path
import hashlib, json, subprocess, zipfile
import numpy as np
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1] / 'assets/audio'
MANIFEST = json.loads((ROOT / 'LICENSES.json').read_text(encoding='utf8'))
SOURCES = {s['id']: s for s in MANIFEST['sources']}
SR = 24000
FF = imageio_ffmpeg.get_ffmpeg_exe()
cache = {}

def decode(raw):
    return np.frombuffer(subprocess.run([FF, '-v', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', str(SR), '-f', 'f32le', 'pipe:1'], input=raw, stdout=subprocess.PIPE, check=True).stdout, dtype=np.float32).copy()

def original(source, member=None):
    key = (source, member)
    if key not in cache:
        filename = ROOT / SOURCES[source]['filename']
        raw = zipfile.ZipFile(filename).read(member) if member else filename.read_bytes()
        cache[key] = decode(raw)
    return cache[key]

def component(source, member=None, start=0, duration=.14, gain=1, at=0):
    audio = original(source, member)
    lead = 0
    if member and source != 'firearms':
        active = np.flatnonzero(abs(audio) > .003)
        if len(active):
            lead = max(0, active[0]-48)
            audio = audio[lead:]
    segment = audio[int(start*SR):int((start+duration)*SR)].copy()
    assert len(segment) > 100, (source, member, start)
    segment *= .6/max(float(max(abs(segment))), .00001)
    fade = min(48, len(segment)//10)
    segment[:fade] *= np.linspace(0, 1, fade)
    segment[-fade:] *= np.linspace(1, 0, fade)
    return {'source':source, 'member':member, 'startSeconds':round(start+lead/SR,6), 'durationSeconds':len(segment)/SR, 'gain':gain, 'offsetSeconds':at}, segment*gain

def metal(kind, index, **kw):
    return component('impact', f'Audio/impactMetal_{kind}_{index:03}.ogg', **kw)

def plate(kind, index, **kw):
    return component('impact', f'Audio/impactPlate_{kind}_{index:03}.ogg', **kw)

def wood(index, **kw):
    return component('impact', f'Audio/impactWood_light_{index:03}.ogg', **kw)

def click(index, **kw):
    return component('interface', f'Audio/click_{index:03}.ogg', **kw)

def switch(index, **kw):
    return component('interface', f'Audio/switch_{index:03}.ogg', **kw)

def real(source, start, duration=.16, **kw):
    return component(source, start=start, duration=duration, **kw)

def export(key, parts, lowpass=8500, fire=False):
    duration = max(meta['offsetSeconds']+len(a)/SR for meta,a in parts)
    a = np.zeros(int(np.ceil(duration*SR)), dtype=np.float32)
    for meta, part in parts:
        offset = int(meta['offsetSeconds']*SR)
        a[offset:offset+len(part)] += part
    a *= .69/max(float(max(abs(a))), .00001)
    folder = 'weapons' if fire else 'handling'
    file = f'{folder}/{key}.wav'
    dest = ROOT / file
    subprocess.run([FF,'-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i','pipe:0','-af',f'highpass=f=75,lowpass=f={lowpass}', '-c:a','pcm_s16le',str(dest)],input=a.tobytes(),check=True)
    rendered = decode(dest.read_bytes())
    assert max(abs(rendered)) < .98
    first = parts[0][0]
    MANIFEST['assets'][key] = {'file':file, 'source':first['source'], 'originalMember':first['member'], 'components':[m for m,_ in parts], 'processing':f'Unpitched retained CC0 recording segments composed at listed offsets; 75 Hz high-pass, {lowpass} Hz low-pass, short edge fades; conservative peak normalization; mono 24 kHz PCM16.', 'duration':round(len(rendered)/SR,4), 'peak':round(float(max(abs(rendered))),5), 'bytes':dest.stat().st_size, 'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(), 'critical':True}
    return key

# Retain the 11 good firearm sets. SR-Aug formerly used the AR-15 library
# again. Auto 12/Pump and War Head/Tundra had highly correlated clipped
# transients. Alternate takes already retained supply independent identities.
for stem, member, tail, lowpass in [
    ('sraug','Prepared SFX Library/Savage 10 .300 Blackout/T_27P.wav',.22,10500),
    ('auto12','Prepared SFX Library/Mossberg/N_26P.wav',.24,10800),
    ('warhead','Prepared SFX Library/1917/B_16P.wav',.40,6900),
]:
    audio = original('firearms', member)
    block = 120
    energy = np.sqrt(np.mean(audio[:len(audio)//block*block].reshape(-1,block)**2,axis=1))
    hits = np.flatnonzero(energy > max(energy)*.38)
    groups=[]
    for hit in hits:
        if not groups or hit-groups[-1][-1] > SR*.15/block: groups.append([hit])
        else: groups[-1].append(hit)
    peaks=[max(g,key=lambda i:energy[i])*block for g in groups if max(energy[g]) > max(energy)*.48]
    assert len(peaks)>=2
    for i, peak in enumerate(peaks[:2]):
        onset = peak
        while onset>0 and abs(audio[onset])>.003 and peak-onset<SR*.025: onset-=1
        start=max(0,onset-int(.012*SR))/SR
        duration=min(tail, (len(audio)-int(start*SR))/SR)
        part=component('firearms',member,start=start,duration=duration)
        export(f'{stem}_fire_{i+1:02}',[part],lowpass,True)

# Mechanical components remain short; complete phase combinations are unique.
# No playback-rate substitution, stretched reload, or synthesized gunshot.
profiles={
 'AR-15':('ar15', [real('rifle-reload',.15,.19),metal('light',0,at=.08,gain=.28)], [real('rifle-reload',1.0,.13),plate('light',0,at=.075,gain=.35)], [real('rifle-reload',1.2,.20),switch(1,at=.1,gain=.25)]),
 'AK47':('ak47', [metal('medium',0),wood(1,at=.065,gain=.45)], [metal('medium',1),metal('heavy',0,at=.075,gain=.4)], [real('pump',.09,.21),switch(2,at=.17,gain=.28)]),
 'SMG-9':('smg9', [plate('light',2),click(1,at=.055,gain=.35)], [metal('light',2),switch(2,at=.065,gain=.45)], [real('reload',1.2,.17),click(3,at=.115,gain=.28)]),
 'Auto 12':('auto12', [metal('heavy',1),metal('medium',0,at=.06,gain=.4)], [plate('heavy',1),metal('light',3,at=.09,gain=.3)], [real('rifle-reload',1.22,.18),switch(3,at=.115,gain=.32)]),
 'LR-762':('lr762', [plate('medium',2),click(4,at=.06,gain=.3)], [metal('medium',2),switch(4,at=.08,gain=.35)], [real('rifle-reload',1.18,.23),metal('light',4,at=.16,gain=.25)]),
 'LW Tundra':('tundra', [metal('medium',3),click(2,at=.07,gain=.35)], [plate('heavy',2),metal('medium',4,at=.065,gain=.3)], [real('pump',.015,.13),real('pump',.20,.12,at=.16,gain=.65)]),
 'War Head LMG':('warhead', [metal('heavy',2,duration=.19),plate('medium',0,at=.11,gain=.45)], [metal('heavy',3,duration=.19),plate('heavy',0,at=.10,gain=.45)], [real('pump',.025,.28),metal('heavy',4,at=.21,gain=.4)]),
 'P90':('p90', [plate('light',4,duration=.10),switch(5,at=.05,duration=.11,gain=.35)], [plate('medium',3,duration=.12),switch(6,at=.045,duration=.12,gain=.45)], [real('rifle-reload',1.01,.12),switch(7,at=.09,duration=.12,gain=.4)]),
 '9mm':('9mm', [real('reload',.08,.19),click(3,at=.065,gain=.25)], [real('reload',.78,.19),plate('light',1,at=.075,gain=.4)], [real('reload',1.23,.18),switch(4,at=.12,gain=.3)]),
 'X16':('x16', [click(5),metal('light',4,at=.035,duration=.08,gain=.35)], [metal('light',0,duration=.10),switch(1,at=.065,duration=.1,gain=.4)], [metal('medium',4,duration=.11),click(2,at=.09,duration=.09,gain=.45)]),
 'X-16 Auto':('x16auto', [plate('light',1,duration=.1),switch(3,at=.045,duration=.1,gain=.35)], [metal('light',1,duration=.11),switch(5,at=.065,duration=.1,gain=.4)], [real('reload',1.25,.16),plate('medium',4,at=.115,duration=.10,gain=.35)]),
 'SR-Aug':('sraug', [plate('medium',4),click(4,at=.065,gain=.32)], [metal('medium',4),plate('light',2,at=.07,gain=.42)], [real('pump',.02,.14),switch(6,at=.105,gain=.4)]),
}
characters={'AR-15':'clean modern rifle crack','AK47':'heavier low rifle report','SMG-9':'compact rapid SMG report','Pump Shotgun':'deep tube-fed shotgun blast','Auto 12':'shorter sharp shotgun report','LR-762':'strong battle-rifle crack','LW Tundra':'longer large sniper report','War Head LMG':'heavy sustained-fire report','P90':'compact high-frequency PDW report','9mm':'heavy pistol report','X16':'short light pistol crack','X-16 Auto':'compact machine-pistol report','SR-Aug':'separate .300 Blackout source, compact burst-rifle report','SPAS-12':'tactical shotgun report with distinct tail'}
for name,(stem,out,insert,ready) in profiles.items():
    lowpass=4500 if name=='War Head LMG' else 6500 if name in ['AK47','LW Tundra','9mm'] else 8500
    events={event:[export(f'{stem}_{phase}',parts,lowpass)] for event,phase,parts in [('mag-out','mag_out',out),('mag-in','mag_in',insert),('reload-ready','reload_ready',ready)]}
    MANIFEST['weapons'][name]['handlingEvents']=events
    MANIFEST['weapons'][name]['identity']=characters[name]
for name,stem,insert,ready in [
 ('Pump Shotgun','pump',[wood(0,duration=.09),metal('light',0,at=.04,duration=.10,gain=.32)],[real('pump',.025,.27),plate('light',3,at=.2,duration=.1,gain=.22)]),
 ('SPAS-12','spas12',[plate('light',4,duration=.09),metal('light',1,at=.06,duration=.10,gain=.48)],[real('rifle-reload',1.19,.19),plate('medium',1,at=.12,duration=.1,gain=.4)])
]:
    MANIFEST['weapons'][name]['handlingEvents']={'shell-insert':[export(f'{stem}_shell_insert',insert,7000)],'reload-ready':[export(f'{stem}_reload_ready',ready,7000)]}
    MANIFEST['weapons'][name]['identity']=characters[name]
MANIFEST['audioIdentityVersion']='live-circuit-1'
MANIFEST['processingTool']='ffmpeg 7.1, numpy; no new external recordings. All retained CC0 originals remain unchanged and excluded from game bundles.'
(ROOT/'LICENSES.json').write_text(json.dumps(MANIFEST,indent=2)+'\n',encoding='utf8')
print(f"Prepared {len(profiles)*3+4} weapon-specific handling clips; replaced only three weak firing sets with retained independent takes. No external downloads.")
