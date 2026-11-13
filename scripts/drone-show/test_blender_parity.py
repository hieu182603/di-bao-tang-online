"""Compare JS GPU arrays against the independent NumPy export decoder (all IDs, random access)."""
import json, hashlib, subprocess, tempfile
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]; folder=ROOT/'Frontend/drone-show/blender-v5'
m=json.loads((folder/'export_manifest.json').read_text()); tl=json.loads((folder/'show_timeline.json').read_text()); N=m['drone_count']
APPROVED_COUNTS={'dong_son':9967,'ly_thai_to':11433,'ly_dragon':8519,'hoang_thanh':20154,
 'chua_mot_cot':19146,'cau_long_bien':17391,'ho_chi_minh_lotus':7589,'dien_bien':6626,
 'reunification':11932,'lang_bac':18834,'vietnam_flag':5067}
assert N==21000 and tl['duration']==228,(N,tl['duration'])
assert tl['scene_order']==list(APPROVED_COUNTS)==[c['formation'] for c in tl['formations']]
show_end=next(c['time'] for c in tl['fireworks'] if c['name']=='FIREWORKS_END')
assert show_end==210 and tl['formations'][-1]['end']==show_end
assert [(c['start'],c['end']) for c in tl['transitions'] if c['kind'] in ('split','descent')]==[(show_end,216),(216,tl['duration'])]
B={}
for e in m['files']:
 raw=(folder/e['path']).read_bytes(); assert len(raw)==e['bytes']; assert hashlib.sha256(raw).hexdigest()==e['sha256']; B[e['path']]=np.frombuffer(raw,dtype=e['dtype']).reshape(e['shape'])
def interp(a,phase):
 phase=np.clip(phase,0,len(a)-1); i=int(np.floor(phase)); j=min(i+1,len(a)-1); w=phase-i
 return a[i].astype(float)*(1-w)+a[j].astype(float)*w
def gain(t):
 g=tl.get('emission_gain')
 if not g:return 1.
 s=lambda x,a,b:(lambda u:u*u*(3-2*u))(min(max((x-a)/(b-a),0.),1.))
 return 1+(g['value']-1)*s(t,*g['ramp_up'])*(1-s(t,*g['ramp_down']))
def decode(t):
 p,c=decode_raw(t);c=c.copy();c[:,3]*=gain(min(max(t,0),tl['duration']));return p,c
def decode_raw(t):
 t=min(max(t,0),tl['duration'])
 for c in tl['formations']:
  if c['start']<=t and (t<c['end'] or t==tl['duration']==c['end']):
   key=c['formation']; phase=(t-c['start'])*c['sample_hz']; p=B[key+'.position.f32']+interp(B[key+'.motion.i16'],phase)*c['position_quantum_m']; rgb=B[key+'.rgb.u8'].astype(float)/255; bri=interp(B[key+'.brightness.u8'],phase)/255
   if 'color_animation' in c:
    ca=c['color_animation']; rgb[B[ca['ids']]]=interp(B[ca['rgb']],(t-c['start'])*ca['sample_hz'])/255
   return p,np.column_stack((rgb,bri))
 for c in tl['transitions']:
  if c['start']<=t and (t<c['end'] or t==tl['duration']==c['end']):
   g=B[c['geometry']].astype(float); rgba=B[c['colors']].astype(float)/255; u=np.clip((t-c['start']-g[:,9])/(c['end']-c['start']-g[:,9]),0,1); q=6*u**5-15*u**4+10*u**3
   return g[:,:3]+(g[:,3:6]-g[:,:3])*q[:,None]+g[:,6:9]*(16*q*q*(1-q)**2)[:,None],rgba[:,:4]*(1-q[:,None])+rgba[:,4:]*q[:,None]
 raise ValueError(t)
times={0,show_end,tl['duration']}|{c['time'] for c in tl['fireworks']}
for c in tl['transitions']+tl['formations']:
 a,b=c['start'],c['end']
 times.update((a,a+.137,(a+b)/2,b-.137,b))
 for boundary in (a,b):times.update((boundary-1e-5,boundary+1e-5))
times=sorted(t for t in times if 0<=t<=tl['duration'])
# Reverse + disordered accesses verify evaluator needs no preceding frames.
times=times[::-1]+[c['start']+(c['end']-c['start'])*.371 for c in tl['formations'][::2]]+[-1,tl['duration']+1,0]
script="""const fs=require('fs'),D=require('./Frontend/drone-blender.js');const dir='Frontend/drone-show/blender-v5/'; const m=JSON.parse(fs.readFileSync(dir+'export_manifest.json')),tl=JSON.parse(fs.readFileSync(dir+'show_timeline.json')),B={};for(const e of m.files){const b=fs.readFileSync(dir+e.path); const raw=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength); B[e.path]=new D.types[e.dtype](raw);}const data=D.validate(m,tl,B),p=new Float32Array(data.N*3),c=new Float32Array(data.N*4);const times=JSON.parse(process.argv[1]);for(let i=0;i<times.length;i++){D.evaluate(data,times[i],p,c);fs.writeFileSync(process.argv[2]+'/'+i+'.bin',Buffer.concat([Buffer.from(p.buffer),Buffer.from(c.buffer)]));}"""
maxp=maxc=0.; counts={}
with tempfile.TemporaryDirectory() as tmp:
 subprocess.run(['node','-e',script,json.dumps(times),tmp],cwd=ROOT,check=True)
 for i,t in enumerate(times):
  values=np.fromfile(Path(tmp)/f'{i}.bin',dtype='<f4'); p,c=decode(t); maxp=max(maxp,float(np.abs(values[:N*3].reshape(N,3)-p).max())); maxc=max(maxc,float(np.abs(values[N*3:].reshape(N,4)-c).max()))
 for c in tl['formations']:
  key=c['formation'];mask=B[key+'.active.u8'].astype(bool)
  assert int(mask.sum())==c['active_count']==APPROVED_COUNTS[key],(key,c['active_count'])
  p,rgba=decode((c['start']+c['end'])/2);lit=np.max(rgba[:,:3]*rgba[:,3,None],axis=1)>=.004
  counts[key]=int(lit.sum());assert np.array_equal(lit,mask),(key,counts[key],c['active_count'])
 # The approved tank tableau is STATIC, including colour/brightness. End is sampled just
 # inside the hold because the exact boundary belongs to the outgoing transition decoder.
 tank=next(c for c in tl['formations'] if c['formation']=='reunification');a=decode(tank['start'])
 static=all(all(np.array_equal(x,y) for x,y in zip(a,decode(tank['start']+(tank['end']-tank['start'])*f))) for f in [.01,.25,.5,.75,1-1e-6]);assert static
assert maxp<2e-5 and maxc<1e-6,(maxp,maxc)
report={'revision':m['revision'],'ids':N,'scene_count':len(tl['formations']),'show_end':show_end,'landing_end':tl['duration'],'samples':len(times),'hashes_verified':True,'max_position_component_error_m':maxp,'max_rgba_error':maxc,'hold_led_counts':counts,'active_masks_match_visible_ids':True,'tank_static':static,'pass':True}
out=ROOT/'docs/drone-show/blender-parity.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(report,indent=2)); print(json.dumps(report,indent=2))
