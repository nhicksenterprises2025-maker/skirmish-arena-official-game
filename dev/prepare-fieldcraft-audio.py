"""FIELDCRAFT: master retained CC0 recordings into distinct, repeatable identities.

No oscillators, generated reports, pitch substitutions or external downloads.
Every active clip records its original source, cut and mastering parameters.
Use --weapon FAL to add its identity without re-rendering existing recordings.
"""
from pathlib import Path
import argparse, copy, hashlib, json, re, subprocess, wave, zipfile
import numpy as np
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1] / 'assets/audio'
MANIFEST = json.loads((ROOT / 'LICENSES.json').read_text(encoding='utf8'))
SOURCES = {s['id']: s for s in MANIFEST['sources']}
SR = 24000
FF = imageio_ffmpeg.get_ffmpeg_exe()
CACHE = {}
GENERATED = []


def decode(raw):
    command = [FF, '-v', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', str(SR), '-f', 'f32le', 'pipe:1']
    return np.frombuffer(subprocess.run(command, input=raw, stdout=subprocess.PIPE, check=True).stdout, dtype=np.float32).copy()


def original(source, member=None):
    key = (source, member)
    if key not in CACHE:
        filename = ROOT / SOURCES[source]['filename']
        with zipfile.ZipFile(filename) if member else open(filename, 'rb') as f:
            raw = f.read(member) if member else f.read()
        CACHE[key] = decode(raw)
    return CACHE[key]


def segment(source, member=None, start=0, duration=.14, gain=1, at=0, trim=False):
    audio = original(source, member)
    if trim:
        active = np.flatnonzero(abs(audio) > .003)
        if len(active):
            start += max(0, active[0]-24)/SR
    begin = round(start*SR)
    part = audio[begin:begin+round(duration*SR)].copy()
    assert len(part) >= 96, (source, member, start)
    part *= gain/max(float(max(abs(part))), .00001)
    fade = min(24, len(part)//10)
    part[:fade] *= np.linspace(0, 1, fade)
    part[-fade:] *= np.linspace(1, 0, fade)
    return {'source':source, 'member':member, 'startSeconds':begin/SR, 'durationSeconds':len(part)/SR, 'gain':gain, 'offsetSeconds':at}, part


def export(key, folder, parts, filters, peak=.72, recipe=None):
    length = max(round(meta['offsetSeconds']*SR)+len(a) for meta,a in parts)
    audio = np.zeros(length, dtype=np.float32)
    for meta, part in parts:
        offset = round(meta['offsetSeconds']*SR)
        audio[offset:offset+len(part)] += part
    command = [FF, '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0', '-af', filters, '-f', 'f32le', 'pipe:1']
    audio = np.frombuffer(subprocess.run(command, input=audio.tobytes(), stdout=subprocess.PIPE, check=True).stdout, dtype=np.float32).copy()
    audio *= peak/max(float(max(abs(audio))), .00001)
    # Remove cut-edge clicks after filtering without softening the attack.
    n = min(24, len(audio)//10)
    audio[:n] *= np.linspace(0, 1, n)
    n = min(round(.018*SR), len(audio)//5)
    audio[-n:] *= np.linspace(1, 0, n)
    dest = ROOT / folder / (key+'.wav')
    dest.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.rint(np.clip(audio, -1, 1)*32767).astype('<i2')
    with wave.open(str(dest), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
    first = parts[0][0]
    rendered = pcm.astype(float)/32768
    asset = {'file':str(dest.relative_to(ROOT)).replace('\\','/'), 'source':first['source'], 'originalMember':first['member'],
             'components':[m for m,_ in parts], 'processing':'Unpitched retained CC0 recordings; '+filters+'; peak-limited with edge fades; mono 24 kHz PCM16.',
             'mastering':{'filters':filters,'targetPeak':peak}, 'duration':round(len(rendered)/SR,4), 'peak':round(float(max(abs(rendered))),5),
             'bytes':dest.stat().st_size, 'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(), 'critical':True}
    if recipe is not None:
        asset['recipeComponents'] = recipe
    MANIFEST['assets'][key] = asset
    GENERATED.append(key)
    return key


# Tail, rumble cut, high-frequency ceiling, body frequency / dB, presence
# frequency / dB, playback gain. Per-class identity is authored into the PCM;
# the engine still decides exactly when a real round or shell fires.
PROFILES = {
 'AR-15':(.25,100,9700,240,1.5,2700,1,.65,'dry rifle crack, clean receiver snap'),
 'AK47':(.33,65,8200,180,3,1700,1,.70,'low steel rifle report with a broad body'),
 'SMG-9':(.15,155,9000,320,0,3400,1,.57,'short compact SMG chatter'),
 'Pump Shotgun':(.51,55,7500,135,4,1600,-1,.76,'wide low shotgun blast and natural outdoor decay'),
 'Auto 12':(.30,180,9400,380,2,3100,2,.69,'tight sharp autoloading shotgun report'),
 'LR-762':(.39,95,9800,240,2,3700,1.5,.72,'focused marksman crack with a firm low tail'),
 'LW Tundra':(.62,50,10000,130,4,2400,2,.78,'large sniper concussion and longer natural report'),
 'War Head LMG':(.37,110,5800,420,4,1400,1,.73,'weighty dark machine-gun report'),
 'P90':(.16,220,11000,650,-2,4700,2,.56,'dry bright PDW snap with a compact tail'),
 '9mm':(.25,110,8000,230,3,2400,.5,.66,'solid heavy sidearm punch'),
 'X16':(.16,170,10300,350,-1,4400,1,.56,'light crisp service-pistol pop'),
 'X-16 Auto':(.15,195,9000,500,.5,3400,1,.54,'short machine-pistol snap'),
 'SR-Aug':(.20,120,9100,400,2,1900,1.8,.60,'hollow compact burst-rifle knock; individual round attacks'),
 'SPAS-12':(.40,70,10300,155,2,3400,2,.74,'hard tactical shotgun crack and metallic body'),
 'FAL':(.28,80,8800,210,2.5,3100,1.4,.70,'firm full-power semi-auto rifle crack, short steel receiver tail'),
}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--weapon', action='append', choices=PROFILES,
                    help='Render only this weapon; repeat to select several. Shared cues are preserved.')
args = parser.parse_args()
selected = set(args.weapon or PROFILES)

if 'FAL' in selected:
    # The retained library has no FAL recording. Use the unused full-power
    # Mosin rifle's discharge only; no bolt cycle is appended to a real shot.
    MANIFEST['weapons']['FAL'] = {
        'fire': [], 'handling': 'magazine', 'pump': False,
        'handlingEvents': {'mag-out':['fal_mag_out'], 'mag-in':['fal_mag_in'],
                           'reload-ready':['fal_reload_ready']},
    }
    # Distinct short latch, steel magazine seating and charging-handle cues.
    # These recipes describe real retained cuts; authoritative events still
    # own the 3.40-second reload and its existing phase times.
    recipes = {
        'fal_mag_out': [segment('rifle-reload', start=.31, duration=.155),
                        segment('impact', 'Audio/impactMetal_medium_003.ogg',
                                duration=.105, gain=.32, at=.065, trim=True)],
        'fal_mag_in': [segment('impact', 'Audio/impactMetal_heavy_004.ogg',
                              duration=.165, trim=True),
                       segment('rifle-reload', start=.90, duration=.13, gain=.43, at=.08)],
        'fal_reload_ready': [segment('rifle-reload', start=1.31, duration=.21),
                             segment('impact', 'Audio/impactPlate_medium_003.ogg',
                                     duration=.11, gain=.28, at=.135, trim=True)],
    }
    for key, parts in recipes.items():
        MANIFEST['assets'][key] = {'components':[meta for meta,_ in parts]}


def discharges(member):
    audio = original('firearms', member)
    block = 120
    energy = np.sqrt(np.mean(audio[:len(audio)//block*block].reshape(-1,block)**2,axis=1))
    hits = np.flatnonzero(energy > max(energy)*.30)
    groups = []
    for hit in hits:
        if not groups or hit-groups[-1][-1] > 60:
            groups.append([hit])
        else:
            groups[-1].append(hit)
    peaks = [max(g,key=lambda k:energy[k])*block for g in groups if max(energy[g]) > max(energy)*.40]
    for peak in peaks:
        window_start = max(0, peak-round(.02*SR))
        window_end = min(len(audio), peak+round(.012*SR))
        window = abs(audio[window_start:window_end])
        # Align the real discharge, ignoring low handling noise just before it.
        active = np.flatnonzero(window > max(window)*.20)
        start = max(0, window_start+int(active[0])-24) if len(active) else peak
        yield start/SR


with zipfile.ZipFile(ROOT / SOURCES['firearms']['filename']) as library:
    members = [m for m in library.namelist() if m.startswith('Prepared SFX Library/') and m.endswith('.wav')]
for name, profile in PROFILES.items():
    if name not in selected:
        continue
    tail,hp,lp,body,body_db,presence,presence_db,gain,identity = profile
    weapon = MANIFEST['weapons'][name]
    first = 'Prepared SFX Library/Mosin Nagant/M_21P.wav' if name == 'FAL' else MANIFEST['assets'][weapon['fire'][0]]['originalMember']
    gun = first.split('/')[1]
    recordings = [first]+[m for m in members if m.split('/')[1]==gun and m!=first]
    takes = [(member,start) for member in recordings for start in discharges(member)]
    assert len(takes)>=4, (name,'four independent retained recording cuts required')
    stem = 'fal' if name == 'FAL' else weapon['fire'][0].rsplit('_fire_',1)[0]
    filters = f'highpass=f={hp},lowpass=f={lp},equalizer=f={body}:t=q:w=.75:g={body_db},equalizer=f={presence}:t=q:w=.85:g={presence_db}'
    weapon['fire'] = [export(f'{stem}_fire_{i+1:02}', 'weapons', [segment('firearms',member,start=start,duration=tail)], filters, .72+(i%2)*.015) for i,(member,start) in enumerate(takes[:4])]
    weapon['fireGain'] = gain
    weapon['rateVariation'] = .008
    weapon['identity'] = identity
    weapon['masteringProfile'] = {'tailSeconds':tail,'highpassHz':hp,'lowpassHz':lp,'bodyHz':body,'bodyDb':body_db,'presenceHz':presence,'presenceDb':presence_db}
    weapon['handlingGain'] = .9 if name in ['SMG-9','P90','X16','X-16 Auto'] else 1.08 if name in ['AK47','War Head LMG','LW Tundra'] else 1
    for event, ids in weapon['handlingEvents'].items():
        key = ids[0]
        original_asset = MANIFEST['assets'][key]
        recipe = copy.deepcopy(original_asset.get('recipeComponents',original_asset['components']))
        variants = []
        for variant in range(3):
            parts=[]
            for i, c in enumerate(recipe):
                m=c['member'];start=c['startSeconds'];trim=False
                # Separate retained mechanical impacts, not randomized pitch.
                if m and variant:
                    match=re.search(r'_(\d{3})\.ogg$',m)
                    if match:
                        old=int(match.group(1));low=0 if c['source']=='impact' else 1
                        count=5 if c['source']=='impact' or '/click_' in m else 7
                        m=m[:match.start(1)]+f'{(old-low+variant)%count+low:03}'+m[match.end(1):]
                        start=0;trim=True
                elif variant:
                    start+=.005*variant
                at=c['offsetSeconds']+(variant-1)*.006 if i else 0
                parts.append(segment(c['source'],m,start=start,duration=c['durationSeconds'],gain=c['gain']*(1-.045*variant if i else 1),at=max(0,at),trim=trim))
            lowpass=4700 if name=='War Head LMG' else 6500 if name in ['AK47','LW Tundra','9mm','Pump Shotgun','FAL'] else 8700
            filters=f'highpass=f=120,lowpass=f={lowpass},equalizer=f={body*2}:t=q:w=.9:g={body_db/2}'
            variants.append(export(key if variant==0 else key+f'_{variant+1:02}', 'handling', parts, filters, .57+.015*variant, recipe if variant==0 else None))
        weapon['handlingEvents'][event]=variants

# Brief, tactile confirmations: distinct body/head materials and a short kill
# close rather than a long arcade chime. New samples remain license-traceable.
if args.weapon is not None:
    # A targeted weapon addition must never remaster shared/older audio.
    MANIFEST['audioIdentityVersion']='fieldcraft-1'
    (ROOT/'LICENSES.json').write_text(json.dumps(MANIFEST,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'result':'PASS','rendered':len(GENERATED),'weapons':sorted(selected),
                      'fireVariants':sum(len(w['fire']) for w in MANIFEST['weapons'].values()),
                      'handlingVariants':sum(len(v) for w in MANIFEST['weapons'].values() for v in w['handlingEvents'].values()),
                      'runtimeBytes':sum(a['bytes'] for a in MANIFEST['assets'].values())}))
    raise SystemExit(0)
for event,key,folder,source,member,duration,gain,peak,lp in [
 ('body-hit','hit_body','combat','impact','Audio/impactPunch_medium_000.ogg',.105,.42,.49,5800),
 ('head-hit','hit_head','combat','impact','Audio/impactPlate_light_001.ogg',.105,.5,.56,9500),
 ('ui-hover','ui_hover','ui','interface','Audio/tick_001.ogg',.055,.10,.28,6000),
 ('ui-click','ui_click','ui','interface','Audio/click_003.ogg',.070,.25,.42,7600),
 ('ui-back','ui_back','ui','interface','Audio/back_001.ogg',.085,.22,.41,6800),
]:
    ids=[]
    for i in range(3 if event.endswith('hit') else 2):
        n=int(member[-7:-4]);count=5 if source=='impact' or 'click_' in member else 4;low=0 if source=='impact' else 1
        variant=member[:-7]+f'{(n-low+i)%count+low:03}.ogg'
        ids.append(export(key if i==0 else key+f'_{i+1:02}',folder,[segment(source,variant,duration=duration,trim=True)],f'highpass=f=220,lowpass=f={lp}',peak))
    MANIFEST['events'][event].update(assets=ids,gain=gain)

export('kill_confirm','combat',[segment('interface','Audio/confirmation_001.ogg',duration=.14,gain=.78,trim=True),segment('impact','Audio/impactPlate_light_003.ogg',duration=.075,gain=.23,at=.012,trim=True)],'highpass=f=480,lowpass=f=8300',.58)
MANIFEST['events']['kill']['gain']=.48
# Preserve the user's saved slider values; only rebalance internal scene mix.
for event,gain in [('ambience-wind',.105),('ambience-suburb',.12),('ambience-traffic',.055)]:
    MANIFEST['events'][event]['gain']=gain
MANIFEST['audioIdentityVersion']='fieldcraft-1'
MANIFEST['processingTool']='ffmpeg 7.1 and numpy; deterministic mastering of retained CC0 recordings only. Original archives unchanged; no new downloads.'
(ROOT/'LICENSES.json').write_text(json.dumps(MANIFEST,indent=2)+'\n',encoding='utf8')
print(json.dumps({'result':'PASS','rendered':len(GENERATED),'fireVariants':sum(len(w['fire']) for w in MANIFEST['weapons'].values()),'handlingVariants':sum(len(v) for w in MANIFEST['weapons'].values() for v in w['handlingEvents'].values()),'runtimeBytes':sum(a['bytes'] for a in MANIFEST['assets'].values())}))
