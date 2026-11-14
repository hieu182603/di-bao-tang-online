// App integration QA: node scripts/drone-show/test_blender_web.js (dev server :5191)
const puppeteer=require('puppeteer-core'),fs=require('fs'),path=require('path'),assert=require('assert');
const OUT=path.resolve('docs/drone-show/blender-qa-v5');fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
 const report={checks:[],screenshots:[],errors:[],networkFailures:[]}; const check=(name,ok,detail)=>{report.checks.push({name,ok:!!ok,detail});console.log(ok?'PASS':'FAIL',name,JSON.stringify(detail||''));};
 try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_BLOCKED|negotiation|connection|net::|Failed to load resource/i.test(m.text()))report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)report.networkFailures.push({url:r.url(),status:r.status()});});
 await page.setRequestInterception(true); page.on('request',r=>/azurewebsites|firebaseio|localhost:5089/.test(r.url())?r.abort():r.continue());
 const url=new URL(process.env.APP_URL||'http://localhost:5191/?autostart=1');
 assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'QA must target a local museum server');
 url.searchParams.set('autostart','1');url.searchParams.set('droneStride','1');
 await page.goto(url.href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.started===true',{timeout:180000}); console.log('Museum ready');
 await page.evaluate(()=>{document.activeElement.blur(); Net.update=()=>{}; Object.assign(player,{x:0,z:37,yaw:0,pitch:0.68});});
 // Loading cancellation: stop immediately; cached data may finish but cannot revive the show.
 await page.evaluate(()=>{window.startDroneShow({},false);window.stopDroneShow(false);});
 await page.waitForFunction('DroneShow.data && !DroneShow.loading',{timeout:120000});
 const timeline=await page.evaluate(()=>JSON.parse(JSON.stringify(DroneShow.data.timeline)));
 const holds=timeline.formations,mid=key=>{const c=holds.find(c=>c.formation===key);assert(c,key);return(c.start+c.end)/2;};
 const showEnd=timeline.fireworks.find(c=>c.name==='FIREWORKS_END').time;
 const expectedCounts={dong_son:11385,ly_thai_to:12547,ly_dragon:10061,hoang_thanh:12738,chua_mot_cot:12839,cau_long_bien:8295,ho_chi_minh_lotus:8994,dien_bien:7125,reunification:12357,vietnam_flag:19134};
 check('ten-scene order',JSON.stringify(holds.map(c=>c.formation))===JSON.stringify(Object.keys(expectedCounts)),holds.map(c=>c.formation));
 check('web show ends at 193 seconds without landing',showEnd===193&&timeline.duration===showEnd&&holds.at(-1).end===showEnd&&await page.evaluate(()=>!DroneShowConfig.landing));
 check('v6 asset path and tag',await page.evaluate(()=>/blender-v6\/$/.test(DroneShowConfig.base)&&/^b6-[0-9a-f]{12}$/.test(DroneShowConfig.assetTag)));
 report.revision=await page.evaluate(()=>DroneShow.data.manifest.revision);report.timeline=timeline;
 check('stop during loading does not revive',await page.evaluate(()=>!DroneShow.isRunning&&!DroneShow.pending));
 await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning',{timeout:15000}); await sleep(1200);
 check('local F9 starts from zero after loading',await page.evaluate(()=>DroneShow.stats.initialAt<0.05),await page.evaluate(()=>({initialAt:DroneShow.stats.initialAt,observedAt:DroneShow.getState().t})));
 check('F9 starts 20000 IDs and music',await page.evaluate(()=>DroneShow.data.N===20000&&!DroneShow.music.paused),await page.evaluate(()=>DroneShow.getState()));
 const seed=await page.evaluate(()=>DroneShow.seed);
 await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{code:'F9',key:'F9',repeat:true})));
 await page.evaluate(()=>document.getElementById('sfx-btn').click()); check('sound button mutes music',await page.evaluate(()=>DroneShow.music.muted)); await page.evaluate(()=>document.getElementById('sfx-btn').click());
 check('key repeat ignored',await page.evaluate(s=>DroneShow.isRunning&&DroneShow.seed===s,seed));
 await page.keyboard.press('F8');check('F8 independent show blocked',await page.evaluate(()=>!FireworksShow.isRunning));
 await page.evaluate(()=>DroneShow.pause()); check('pause stops music',await page.evaluate(()=>DroneShow.music.paused));
 await page.evaluate(t=>{DroneShow.seek(t);DroneShow.resume();},mid('chua_mot_cot')); await sleep(1000);
 check('music catches seek time',await page.evaluate(()=>Math.abs(DroneShow.music.currentTime-DroneShow.getState().t)<.6),await page.evaluate(()=>({audio:DroneShow.music.currentTime,show:DroneShow.getState().t})));
 await page.evaluate(()=>DroneShow.pause());
 // Capture the user's ordinary museum view before touching the reference camera.
 for(const key of ['hoang_thanh','chua_mot_cot','cau_long_bien','vietnam_flag']){
  await page.evaluate(t=>{Object.assign(player,{x:0,z:37,yaw:0,pitch:.68});DroneShow.seek(t);},mid(key));await sleep(300);
  const file=`museum_${key}_mid.jpg`;await page.screenshot({path:path.join(OUT,file),type:'jpeg',quality:95});report.screenshots.push(file);
 }
 await page.evaluate(()=>{DroneShow.pause();window.__qaRender=DroneShow.renderer.render.bind(DroneShow.renderer);DroneShow.renderer.render=function(s,c){DroneShow.referenceCamera(c);DroneShow.uniforms.uProj.value=this.getContext().drawingBufferHeight/(2*Math.tan(c.fov*Math.PI/360))*DroneShowConfig.stage.scale;window.__qaRender(s,c);};});
 const shotTimes=[...new Set([0,...holds.map(c=>(c.start+c.end)/2),...timeline.transitions.flatMap(c=>[c.start,(c.start+c.end)/2,c.end]),...['cau_long_bien','reunification','vietnam_flag'].flatMap(key=>{const c=holds.find(c=>c.formation===key);return[c.start,c.end-1/timeline.fps];})])].sort((a,b)=>a-b);
 for(const t of shotTimes){
  await page.evaluate(t=>DroneShow.seek(t),t); await sleep(180);
  const file=`reference_${t}.jpg`;await page.screenshot({path:path.join(OUT,file),type:'jpeg',quality:87});report.screenshots.push(file);
 }
 // Native browser rendering at 4K, then a camera-frame crop of the inscription.
 await page.setViewport({width:3840,height:2160,deviceScaleFactor:1});
 await page.evaluate(t=>DroneShow.seek(t),mid('hoang_thanh'));await sleep(600);
 await page.screenshot({path:path.join(OUT,'reference_hoang_thanh_4k.png')});report.screenshots.push('reference_hoang_thanh_4k.png');
  await page.setViewport({width:1280,height:720,deviceScaleFactor:1});await sleep(200);
 const levels=await page.evaluate(()=>{const D=DroneShow,rows=[],old=D.tier;for(const tier of ['LOW','BALANCED','HIGH']){D.setTier(tier);for(const c of D.data.timeline.formations){D.seek((c.start+c.end)/2);let n=0;for(let i=0;i<D.data.N;i++)if(Math.max(D.colArr[i*4],D.colArr[i*4+1],D.colArr[i*4+2])*D.colArr[i*4+3]>=.004)n++;rows.push({tier,key:c.formation,ids:D.geo.attributes.position.count,lit:n,active:c.active_count});}}D.setTier(old);return rows;});
 check('all quality tiers preserve 20000 IDs and all approved active LEDs, including dim plaque',levels.length===3*Object.keys(expectedCounts).length&&levels.every(r=>r.ids===20000&&r.lit===r.active&&r.active===expectedCounts[r.key]),levels);
 check('approved tank remains static',await page.evaluate(()=>{const D=DroneShow,h=D.data.timeline.formations.find(c=>c.formation==='reunification');D.seek(h.start);const p=D.posArr.slice(),c=D.colArr.slice();return [.25,.5,.75,.999999].every(f=>{D.seek(h.start+(h.end-h.start)*f);return p.every((v,i)=>v===D.posArr[i])&&c.every((v,i)=>v===D.colArr[i]);});}));
 await page.evaluate(t=>{DroneShow.seek(t);DroneShow.renderer.render=function(s,c){DroneShow.referenceCamera(c);c.position.x+=18;c.lookAt(0,120,-100);DroneShow.uniforms.uProj.value=this.getContext().drawingBufferHeight/(2*Math.tan(c.fov*Math.PI/360))*DroneShowConfig.stage.scale;window.__qaRender(s,c);};},mid('ly_dragon'));await sleep(200);await page.screenshot({path:path.join(OUT,'dragon_mild_angle.jpg'),type:'jpeg',quality:87});
 // Restore museum camera and verify the ordinary player view.
 await page.evaluate(t=>{DroneShow.renderer.render=window.__qaRender;camera.fov=70;camera.up.set(0,1,0);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();Object.assign(player,{x:0,z:37,yaw:0,pitch:.68});DroneShow.seek(t);},mid('ly_dragon')); await sleep(250);
 await page.screenshot({path:path.join(OUT,'player_dragon.jpg'),type:'jpeg',quality:87});
 const measure=()=>page.evaluate(()=>new Promise(res=>{const ts=[],begin=performance.now(),cpu=DroneShow.stats.ms,frames=DroneShow.stats.frames;function f(t){ts.push(t);if(t-begin<3000)return requestAnimationFrame(f);const dt=ts.slice(1).map((v,i)=>v-ts[i]).sort((a,b)=>a-b),avg=dt.reduce((a,b)=>a+b,0)/dt.length;res({fps:1000/avg,p95ms:dt[Math.floor(dt.length*.95)],cpuMs:(DroneShow.stats.ms-cpu)/Math.max(1,DroneShow.stats.frames-frames),calls:DroneShow.renderer.info.render.calls,geometries:DroneShow.renderer.info.memory.geometries,heap:performance.memory&&performance.memory.usedJSHeapSize});}requestAnimationFrame(f);}));
 await page.evaluate(()=>DroneShow.resume());report.performance=await measure();console.log('PERFORMANCE',report.performance);
 await page.evaluate(t=>{DroneShow.seek(t);DroneShow.resume();},timeline.fireworks[0].time-1);
 for(const t of timeline.fireworks.filter(c=>c.time<showEnd).map(c=>c.time).concat(showEnd-1)){await page.waitForFunction(t=>DroneShow.getState().t>=t,{timeout:25000},t);await page.screenshot({path:path.join(OUT,`finale_${t}.jpg`),type:'jpeg',quality:87});}
 check('finale does not start independent F8 timeline',await page.evaluate(()=>!FireworksShow.isRunning));
 await page.evaluate(t=>DroneShow.seek(t+.5),showEnd);await sleep(800);check('music stops at 193',await page.evaluate(()=>DroneShow.music.paused));
 await page.evaluate(t=>DroneShow.seek(t+DroneShowConfig.fadeOut),showEnd);await sleep(800);await page.waitForFunction('!DroneShow.isRunning',{timeout:20000});
 check('natural finish restores sky and music',await page.evaluate(()=>!getFireworksState().isNight&&DroneShow.music.paused));
 const before=await page.evaluate(()=>({children:DroneShow.group.children.length,geo:DroneShow.renderer.info.memory.geometries,arrays:DroneShow.posArr.length}));
 for(let i=0;i<3;i++)await page.evaluate(async()=>{await DroneShow.start();DroneShow.stop();});
 const after=await page.evaluate(()=>({children:DroneShow.group.children.length,geo:DroneShow.renderer.info.memory.geometries,arrays:DroneShow.posArr.length}));
 check('replay reuses GPU buffers',JSON.stringify(before)===JSON.stringify(after),{before,after});
 await page.keyboard.press('F8');await sleep(200);check('F8 works after F9',await page.evaluate(()=>FireworksShow.isRunning));await page.evaluate(()=>window.stopFireworks());
 const ignoredInputs=await page.evaluate(()=>{for(const tag of ['input','textarea','div']){const el=document.createElement(tag);if(tag==='div')el.contentEditable='true';document.body.appendChild(el);el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key:'F9',code:'F9',bubbles:true}));el.remove();if(DroneShow.isRunning||DroneShow.pending)return false;}return true;});
 check('F9 ignored in text inputs/contenteditable',ignoredInputs);
 check('mismatched revision refused',await page.evaluate(async()=>!(await DroneShow.start({revision:'wrong-version'}))&&!DroneShow.isRunning));
 check('load failure does not start fallback or leave music playing',await page.evaluate(async()=>{const saved=DroneShow.load;DroneShow.load=async()=>{throw Error('Intentional QA load failure');};try{return !(await DroneShow.start())&&!DroneShow.pending&&!DroneShow.isRunning&&DroneShow.music.paused;}finally{DroneShow.load=saved;}}));
 check('no drone/audio asset failures',!report.networkFailures.some(r=>/drone-show|drone-blender|audio\//.test(r.url)),report.networkFailures);
 check('no JS/shader errors',!report.errors.length,report.errors);
 }finally{fs.writeFileSync(path.join(OUT,'web-report.json'),JSON.stringify(report,null,2));await browser.close();}
 assert(report.checks.every(c=>c.ok),'Failed checks: '+report.checks.filter(c=>!c.ok).map(c=>c.name));
})().catch(e=>{console.error(e);process.exitCode=1;});
