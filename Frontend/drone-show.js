/* F9: approved Blender playback, 14,000 stable IDs, one existing render loop. */
(() => {
'use strict';
const Config = {
  duration: 150, fadeOut: 4.5, tail: 8,
  revision: DroneBlender.REVISION, assetTag: 'b3-6d4770113720',
  landing: false,   // true = play the Blender split + descent (150–168 s) after the flag
  base: 'drone-show/blender-v3/', music: 'audio/thinh-vuong-viet-nam-sang-ngoi.mp3',
  // pLocal = pExport - (0,85,0). One common transform for all formations and QA camera.
  stage: { x: 0, height: 120, z: -100, scale: 1.15, pivot: 85 },
  tiers: { LOW: { glow: false }, BALANCED: { glow: true }, HIGH: { glow: true } },
  scenes: []
};
const VS = `
attribute vec4 aCol;
uniform float uProj, uDiameter, uGlow, uEmission;
varying vec3 vEmission;
void main() {
  vec3 emitted = aCol.rgb * aCol.a;
  vEmission = emitted * uEmission;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  if (max(max(emitted.r, emitted.g), emitted.b) < 0.004) {
    gl_Position = vec4(2.0); gl_PointSize = 0.0; return;
  }
  gl_PointSize = clamp(uDiameter * uProj / max(0.01, -mv.z) * (uGlow > 0.5 ? 4.0 : 1.0), 1.0, uGlow > 0.5 ? 22.0 : 9.0);
}`;
const FS = `
uniform float uGlow;
varying vec3 vEmission;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float mask = uGlow > 0.5 ? exp(-r*r*6.0)*0.045 : 1.0-smoothstep(0.62,1.0,r);
  gl_FragColor = vec4(vEmission * mask, 1.0);
  // Source is linear, Standard display conversion once; no scene ACES exposure on these LEDs.
  #include <encodings_fragment>
}`;
const Show = {
  isRunning: false, pending: false, paused: false, t: 0, tier: 'BALANCED', seed: 0,
  generation: 0, data: null, loading: null, music: null, endAt: 0,
  stats: { frames: 0, ms: 0 }, frameAvg: 0,
  init(scene, camera, renderer, hooks = {}) {
    this.scene = scene; this.camera = camera; this.renderer = renderer; this.hooks = hooks;
    this.group = new THREE.Group(); this.group.name = 'DroneShowStage'; this.group.visible = false;
    this.applyStage(); scene.add(this.group);
    if (/[?&]droneDebug=1/.test(location.search)) this.buildDebug();
  },
  applyStage() {
    const s = Config.stage; this.group.position.set(s.x,s.height,s.z); this.group.scale.setScalar(s.scale);
    this.group.updateMatrixWorld(true);
    if (this.geo) this.worldSphere = this.geo.boundingSphere.clone().applyMatrix4(this.group.matrixWorld);
  },
  pickTier() {
    const q = new URLSearchParams(location.search).get('drones');
    return q && Config.tiers[q.toUpperCase()] ? q.toUpperCase() : this.forcedTier || (matchMedia('(pointer: coarse)').matches ? 'LOW' : 'BALANCED');
  },
  async load() {
    if (this.data) return this.data;
    if (!this.loading) {
      const begun = performance.now();
      this.loading = DroneBlender.load(Config.base).then(D => {
        const fwEnd = D.timeline.fireworks.find(c => c.name === 'FIREWORKS_END'); Config.fireworksEnd = fwEnd ? fwEnd.time : D.timeline.duration;
        // landing:false ends the show on the flag at FIREWORKS_END (it fades out like v2) instead of the 150–168 s split/descent.
        if (!Config.landing && Config.fireworksEnd < D.timeline.duration) {
          D.timeline.transitions = D.timeline.transitions.filter(c => c.start < Config.fireworksEnd);
          D.timeline.duration = Config.fireworksEnd;
        }
        this.data = D; Config.duration = D.timeline.duration;
        Config.scenes = D.timeline.formations.map(c => [c.start,c.end,c.formation]);
        this.buildGpu(D.N);
        this.warmShaders();
        this.stats.loadMs = performance.now() - begun; return D;
      }).finally(() => { this.loading = null; });
    }
    return this.loading;
  },
  // Compile drone + fireworks programs while the user is already waiting for the download. Otherwise the first
  // finale shell (~137–140 s) compiled them mid-show: a 0.7–4 s freeze measured on a real GPU.
  warmShaders() {
    const FS=window.FireworksShow, meshes=FS && FS.points ? [FS.points.mesh,FS.trails.mesh] : [], vis=meshes.map(m=>m.visible), gv=this.group.visible;
    meshes.forEach(m=>{ m.visible=true; }); this.group.visible=true;
    try { this.renderer.compile(this.scene,this.camera); }
    finally { meshes.forEach((m,i)=>{ m.visible=vis[i]; }); this.group.visible=gv; }
  },
  buildGpu(N) {
    this.disposeGpu();
    this.posArr = new Float32Array(N*3); this.colArr = new Float32Array(N*4);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(this.posArr,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol',new THREE.BufferAttribute(this.colArr,4).setUsage(THREE.DynamicDrawUsage));
    // Tight local bound measured over the whole v3 timeline incl. landing (x±107, y-81..67, z-52..26) + margin for glow sprites.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,-7,-13),145);
    this.applyStage();
    this.frustum = new THREE.Frustum(); this.viewProj = new THREE.Matrix4(); this.lastT = NaN;
    this.uniforms = { uProj:{value:600}, uDiameter:{value:this.data.manifest.render_contract.led_radius_m*2}, uEmission:{value:this.data.manifest.render_contract.emission_strength} };
    const material = glow => new THREE.ShaderMaterial({ uniforms:{ ...this.uniforms, uGlow:{value:glow?1:0} }, vertexShader:VS, fragmentShader:FS,
      transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true, fog:false, toneMapped:false });
    this.points = new THREE.Points(g,material(false)); this.points.frustumCulled=true; this.points.renderOrder=22;
    this.glow = new THREE.Points(g,material(true)); this.glow.frustumCulled=true; this.glow.renderOrder=21;
    this.group.add(this.points,this.glow); this.setTier(this.tier);
  },
  setTier(tier) { if (!Config.tiers[tier]) return; this.tier=tier; if(this.glow) this.glow.visible=Config.tiers[tier].glow; },
  setGlow(on) { if(this.glow) this.glow.visible=!!on; },
  disposeGpu() {
    for(const key of ['points','glow']) if(this[key]) { this.group.remove(this[key]); this[key].material.dispose(); this[key]=null; }
    if(this.geo) { this.geo.dispose(); this.geo=null; }
  },
  ensureMusic() {
    if(!this.music) { this.music=new Audio(Config.music); this.music.preload='auto'; this.music.volume=0.55; this.music.muted=!!this.hooks.soundEnabled&&!this.hooks.soundEnabled(); }
    return this.music;
  },
  unlockMusic() {
    const a=this.ensureMusic();
    if(this.isRunning && !this.paused) { this.syncMusic(true); return; }
    // Called synchronously by F9 before the first await, granting playback after asset loading.
    a.volume=0;
    const p=a.play(); if(p) p.then(()=>{ if(!this.isRunning) a.pause(); }).catch(()=>{});
  },
  syncMusic(force=false) {
    const a=this.ensureMusic(), t=this.paused ? this.t : (performance.now()-this.startPerf)/1000, end=this.musicEnd();
    if(!this.isRunning || this.paused || t>=end) { a.pause(); return; }
    const musicTime=Math.max(0,t);
    if(a.readyState>=1 && (force || Math.abs(a.currentTime-musicTime)>0.45)) a.currentTime=musicTime;
    a.volume=0.55*Math.min(1,Math.max(0,(end-t)/(this.combo?5:2)));
    if(a.paused) { const p=a.play(); if(p) p.then(()=>{this.audioBlocked=false;}).catch(e=>{ if(e.name==='AbortError') return; if(!this.audioBlocked) console.warn('[DroneShow] Nhạc cần tương tác người dùng:',e.name); this.audioBlocked=true; }); }
  },
  // F10 combo: at the drone finale's FIREWORKS_END marker (150 s) the 60 s F8 show takes over while the fleet
  // splits and lands (150–168 s); the 235 s track keeps playing until F8's last bursts.
  fwConfig() { return window.FireworksConfig || { duration: 60, tail: 7.5 }; },
  fwStart() { return Config.fireworksEnd || Config.duration; },
  musicEnd() { return this.combo ? Math.max(Config.duration,this.fwStart()+this.fwConfig().duration+4) : Config.duration; },
  showEnd() {
    const drones=Config.duration+Config.fadeOut+Config.tail;
    return this.combo ? Math.max(drones,this.fwStart()+this.fwConfig().duration+this.fwConfig().tail) : drones;
  },
  syncCombo() {
    const FS=window.FireworksShow; if(!this.combo || !FS) return;
    const fwT=this.t-this.fwStart();
    if(fwT<0) { if(this.fwStarted) { FS.stop(false); this.fwStarted=false; } return; }
    if(this.fwStarted || fwT>=this.fwConfig().duration) return;
    this.fwStarted=true;
    const inFlight=FS.extra.slice();   // drone finale shells still climbing must still burst
    // Same seed on every client = identical F8 choreography; at = catch-up for late joiners/seek.
    FS.start({ seed:this.seed, at:fwT, showId:this.showId+'-fw', keepSky:true });
    FS.extra.push(...inFlight); FS.prevNight=null;   // the drone show owns sky + music and restores them at the end
  },
  async start(opts={}) {
    if(this.isRunning || this.pending || (window.FireworksShow && window.FireworksShow.isRunning)) return false;
    if(opts.revision && opts.revision!==Config.assetTag) { console.warn('[DroneShow] Asset revision mismatch',opts.revision); return false; }
    this.unlockMusic();
    const token=++this.generation; this.pending=true;
    this.seed=opts.seed>>>0 || ((Math.random()*2**31)>>>0);
    this.startTime=opts.startTime || 0;
    try { await this.load(); } catch(e) { if(token===this.generation) { this.pending=false; this.ensureMusic().pause(); } console.warn('[DroneShow]',e); return false; }
    if(token!==this.generation) return false;
    this.pending=false;
    // Local F9 starts the clock only after loading. Remote clients retain the master's clock.
    if(!this.startTime) this.startTime=opts.at!==undefined ? Date.now()-opts.at*1000 : Date.now();
    const at=Math.max(opts.at===undefined?0:opts.at,(Date.now()-this.startTime)/1000);
    this.stats.initialAt=at;
    this.combo=!!opts.combo; this.fwStarted=false;
    if(at>(this.combo?this.musicEnd():Config.duration+Config.fadeOut)) { this.ensureMusic().pause(); return false; }
    this.setTier(opts.tier || this.pickTier());
    this.showId=opts.showId || Config.assetTag+(this.combo?'-combo-':'-')+this.seed;
    this.startPerf=performance.now()-at*1000; this.t=at; this.paused=false; this.isRunning=true; this.endAt=0;
    this.cues=buildFireworkCues(this.data.timeline); this.cueIdx=0;
    while(this.cueIdx<this.cues.length && this.cues[this.cueIdx].t<at) this.cueIdx++;
    this.prevNight=!!(window.getFireworksState && window.getFireworksState().isNight);
    if(window.toggleDayNight) window.toggleDayNight(true,false);
    this.group.visible=at<Config.duration+Config.fadeOut; this.computeFrame(at); this.syncCombo(); this.syncMusic(true); return true;
  },
  stop(natural=false) {
    ++this.generation; this.pending=false;
    const wasRunning=this.isRunning; this.isRunning=false; this.paused=false; this.endAt=0;
    if(this.group) this.group.visible=false;
    if(this.music) { this.music.pause(); this.music.currentTime=0; }
    if(this.fwStarted && !natural && window.FireworksShow) window.FireworksShow.stop(false);
    this.fwStarted=false;
    // Finale exclusively owns the external FX queue while F9 holds the F8 lock.
    if(wasRunning && !natural && window.FireworksShow && !window.FireworksShow.isRunning) window.FireworksShow.extra=[];
    if(wasRunning && this.prevNight===false && window.toggleDayNight) window.toggleDayNight(false,false);
    this.prevNight=null;
  },
  pause() { if(this.isRunning && !this.paused) { this.t=(performance.now()-this.startPerf)/1000; this.paused=true; this.music.pause(); } },
  resume() { if(this.isRunning && this.paused) { this.paused=false; this.startPerf=performance.now()-this.t*1000; this.syncMusic(true); } },
  seek(t) {
    if(!this.isRunning) return;
    this.t=Math.max(0,Math.min(this.combo?this.showEnd():Config.duration+Config.fadeOut,t)); this.startPerf=performance.now()-this.t*1000; this.endAt=0;
    if(this.fwStarted && window.FireworksShow) { window.FireworksShow.stop(false); this.fwStarted=false; }
    this.cueIdx=0; while(this.cueIdx<this.cues.length && this.cues[this.cueIdx].t<this.t) this.cueIdx++;
    if(window.FireworksShow && !window.FireworksShow.isRunning) window.FireworksShow.extra=[];
    this.group.visible=this.t<Config.duration+Config.fadeOut; this.computeFrame(this.t); this.syncCombo(); this.syncMusic(true);
  },
  sceneIndex(t) { const holds=this.data ? this.data.timeline.formations : []; let k=0; for(let i=0;i<holds.length;i++) if(t>=holds[i].start) k=i; return k; },
  getState() {
    return { running:this.isRunning,pending:this.pending,paused:this.paused,t:+(this.isRunning&&!this.paused?(performance.now()-this.startPerf)/1000:this.t).toFixed(3),frameT:this.t,
      combo:!!this.combo,fireworks:!!this.fwStarted,musicEnd:this.musicEnd(),tier:this.tier,drones:this.data?this.data.N:0,revision:Config.assetTag,showId:this.showId,seed:this.seed,scene:this.sceneIndex(this.t)+1,
      avgMs:this.stats.frames?this.stats.ms/this.stats.frames:0,loadMs:this.stats.loadMs,initialAt:this.stats.initialAt,musicPlaying:!!this.music&&!this.music.paused,audioBlocked:!!this.audioBlocked };
  },
  computeFrame(t) {
    DroneBlender.evaluate(this.data,t,this.posArr,this.colArr,Config.stage.pivot);
    if(t>Config.duration) { const f=Math.max(0,1-(t-Config.duration)/Config.fadeOut); for(let i=3;i<this.colArr.length;i+=4) this.colArr[i]*=f; }
    this.geo.attributes.position.needsUpdate=true; this.geo.attributes.aCol.needsUpdate=true;
    this.lastT=t;
  },
  // Stage is outside this client's view (indoors / looking away): skip CPU evaluate and the ~390 KB GPU upload.
  inView() {
    if(!this.worldSphere) return true;
    const c=this.camera; c.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.viewProj.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse));
    return this.frustum.intersectsSphere(this.worldSphere);
  },
  update(dt,now) {
    if(!this.isRunning) return;
    const begun=performance.now();
    // Smoothed frame time; busy rooms (many avatars) or LOW tier refresh LEDs at ≤30 Hz (holds are sampled at 4–10 Hz).
    this.frameAvg=this.frameAvg ? this.frameAvg*0.95+dt*50 : dt*1000;
    if(!this.paused) this.t=(now-this.startPerf)/1000;
    if((!this.endAt || this.combo) && window.getFireworksState && !window.getFireworksState().isNight && window.toggleDayNight) window.toggleDayNight(true,false);
    if(!this.paused) while(this.cueIdx<this.cues.length && this.cues[this.cueIdx].t<=this.t) { const c=this.cues[this.cueIdx++]; if(this.t-c.t<0.6) c.fn(); }
    const minStep=this.tier==='LOW' || this.frameAvg>22 ? 1/30 : 0;
    if(this.group.visible && this.t!==this.lastT && !(Math.abs(this.t-this.lastT)<minStep) && this.inView()) this.computeFrame(this.t);
    this.uniforms.uProj.value=this.renderer.getContext().drawingBufferHeight/(2*Math.tan(this.camera.fov*Math.PI/360))*Config.stage.scale;
    if(now-(this.lastMusicSync||0)>750) { this.lastMusicSync=now; this.syncMusic(); }
    if(!this.paused) this.syncCombo();
    if(this.t>=Config.duration+Config.fadeOut && !this.endAt) { this.group.visible=false; this.endAt=now+(this.showEnd()-this.t)*1000; }
    if(this.endAt && now>=this.endAt) this.stop(true);
    this.stats.frames++; this.stats.ms+=performance.now()-begun;
    if(this.debug) this.debug.querySelector('output').textContent=JSON.stringify(this.getState(),null,2);
  },
  referenceCamera(camera=this.camera) {
    const c=this.data.manifest.render_contract,s=Config.stage;
    const world=p=>new THREE.Vector3(p[0]*s.scale+s.x,(p[1]-s.pivot)*s.scale+s.height,p[2]*s.scale+s.z);
    camera.position.copy(world(c.camera_position)); camera.up.fromArray(c.camera_up);
    camera.fov=2*Math.atan(Math.tan(c.horizontal_fov_degrees*Math.PI/360)/c.aspect_ratio)*180/Math.PI;
    camera.aspect=c.aspect_ratio; camera.lookAt(world(c.camera_target)); camera.updateProjectionMatrix();
  },
  buildDebug() {
    const el=document.createElement('div'); el.id='ds-debug'; el.style.cssText='position:fixed;bottom:12px;left:12px;z-index:60;background:#111d;color:white;padding:12px;max-width:340px;font:12px monospace';
    el.innerHTML='<button data-a="play">F9</button> <button data-a="pause">Pause/Resume</button><input type="range" min="0" max="180" step="0.1"><pre><output></output></pre>';
    el.querySelector('[data-a="play"]').onclick=()=>this.isRunning||this.pending?this.stop():this.start();
    el.querySelector('[data-a="pause"]').onclick=()=>this.paused?this.resume():this.pause();
    el.querySelector('input').oninput=e=>this.seek(+e.target.value);
    el.addEventListener('keydown',e=>e.stopPropagation()); document.body.appendChild(el); this.debug=el;
  },
  dispose() { this.stop(); this.disposeGpu(); if(this.music) { this.music.removeAttribute('src'); this.music.load(); this.music=null; } if(this.group) this.scene.remove(this.group); if(this.debug) this.debug.remove(); }
};

// Cue times are burst times. Launch ahead by the real ascent duration; never flush past cues on seek.
function buildFireworkCues(timeline) {
  const markers=Object.fromEntries(timeline.fireworks.map(c=>[c.name,c.time])), C=[];
  const fw=(t,fx,x,z,h,o={})=>{
    const flight=window.FireworksDirector.ascent(0,h);
    C.push({t:Math.max(0,t-flight),fn:()=>window.spawnEffect(fx,{x,z},{...o,h})});
  };
  const start=markers.FIREWORKS_START, build=markers.FIREWORKS_BUILDUP, finale=markers.FIREWORKS_FINALE,end=markers.FIREWORKS_END;
  for(const side of [-1,1]) {
    fw(start,'chrys',side*124,-130,165,{size:'G',c:'gold'});
    fw(start+1.4,'willow',side*126,-145,195,{size:'G'});
    fw(build,'palm',side*110,-125,140,{c:'gold'});
    fw(build+1.2,'ring',side*130,-130,155,{c:'red',inner:'gold'});
  }
  for(let t=finale,k=0;t<end-0.4;t+=0.38,k++) {
    const side=k%2?1:-1;
    fw(t,['chrys','peony','palm','ring'][k%4],side*(118+k%3*9),-130-k%3*10,130+k%4*24,{size:k%3?'M':'G',c:['gold','red','white'][k%3]});
  }
  fw(build+2,'chrys',0,-122,268,{size:'G',c:'gold'});
  fw(finale+1.2,'willow',0,-122,268,{size:'G'});
  fw(end-0.7,'willow',-96,-180,260,{size:'G'}); fw(end-0.7,'willow',96,-180,260,{size:'G'});
  C.sort((a,b)=>a.t-b.t); return C;
}
window.DroneShow=Show; window.DroneShowConfig=Config;
})();
