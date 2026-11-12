"""Compare JS GPU arrays against the independent NumPy export decoder (all IDs, random access)."""
import json, hashlib, subprocess, tempfile
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]; folder=ROOT/'Frontend/drone-show/blender-v2'
m=json.loads((folder/'export_manifest.json').read_text()); tl=json.loads((folder/'show_timeline.json').read_text()); N=m['drone_count']
B={}
for e in m['files']:
 raw=(folder/e['path']).read_bytes(); assert len(raw)==e['bytes']; assert hashlib.sha256(raw).hexdigest()==e['sha256']; B[e['path']]=np.frombuffer(raw,dtype=e['dtype']).reshape(e['shape'])
def interp(a,phase):
 phase=np.clip(phase,0,len(a)-1); i=int(np.floor(phase)); j=min(i+1,len(a)-1); w=phase-i
 return a[i].astype(float)*(1-w)+a[j].astype(float)*w
def decode(t):
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
times=sorted(set([0,1,3,5.99,6,9,12,150,14.5,30.5,48.5,68.5,88.5,108.5,126.5,46,51,55]+[v for c in tl['transitions'] for v in [c['start'],c['start']+1e-5,(c['start']+c['end'])/2,c['end']-1e-5,c['end']]]+[c['start']+.137 for c in tl['formations']]))
# Reverse + disordered accesses verify evaluator needs no preceding frames.
times=times[::-1]+[19.123,126.543,0,99.9,42.017,104.5]
script="""const fs=require('fs'),D=require('./Frontend/drone-blender.js');const dir='Frontend/drone-show/blender-v2/'; const m=JSON.parse(fs.readFileSync(dir+'export_manifest.json')),tl=JSON.parse(fs.readFileSync(dir+'show_timeline.json')),B={};for(const e of m.files){const b=fs.readFileSync(dir+e.path); const raw=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength); B[e.path]=new D.types[e.dtype](raw);}const data=D.validate(m,tl,B),p=new Float32Array(data.N*3),c=new Float32Array(data.N*4);const times=JSON.parse(process.argv[1]);for(let i=0;i<times.length;i++){D.evaluate(data,times[i],p,c);fs.writeFileSync(process.argv[2]+'/'+i+'.bin',Buffer.concat([Buffer.from(p.buffer),Buffer.from(c.buffer)]));}"""
maxp=maxc=0.; counts={}
with tempfile.TemporaryDirectory() as tmp:
 subprocess.run(['node','-e',script,json.dumps(times),tmp],cwd=ROOT,check=True)
 for i,t in enumerate(times):
  values=np.fromfile(Path(tmp)/f'{i}.bin',dtype='<f4'); p,c=decode(t); maxp=max(maxp,float(np.abs(values[:N*3].reshape(N,3)-p).max())); maxc=max(maxc,float(np.abs(values[N*3:].reshape(N,4)-c).max()))
 for c in tl['formations']:
  p,rgba=decode((c['start']+c['end'])/2); counts[c['formation']]=int((np.max(rgba[:,:3]*rgba[:,3,None],axis=1)>=.004).sum()); assert counts[c['formation']]==c['active_count']
 a=decode(106); static=all(all(np.array_equal(x,y) for x,y in zip(a,decode(t))) for t in [106.137,108.5,110.7,115.99]); assert static
assert maxp<2e-5 and maxc<1e-6,(maxp,maxc)
report={'revision':m['revision'],'ids':N,'samples':len(times),'hashes_verified':True,'max_position_component_error_m':maxp,'max_rgba_error':maxc,'hold_led_counts':counts,'tank_static':static,'pass':True}
(ROOT/'docs/drone-show/blender-parity.json').write_text(json.dumps(report,indent=2)); print(json.dumps(report,indent=2))
