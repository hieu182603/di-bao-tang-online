// App integration QA: node scripts/drone-show/test_blender_web.js (dev server :5191)
const puppeteer=require('puppeteer-core'),fs=require('fs'),path=require('path'),assert=require('assert');
const OUT=path.resolve('docs/drone-show/blender-qa-v2');fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
 const report={checks:[],screenshots:[],errors:[],networkFailures:[]}; const check=(name,ok,detail)=>{report.checks.push({name,ok:!!ok,detail});console.log(ok?'PASS':'FAIL',name,JSON.stringify(detail||''));};
 try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_BLOCKED|negotiation|connection|net::|Failed to load resource/i.test(m.text()))report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)report.networkFailures.push({url:r.url(),status:r.status()});});
 await page.setRequestInterception(true); page.on('request',r=>/azurewebsites|firebaseio|localhost:5089/.test(r.url())?r.abort():r.continue());
 await page.goto(process.env.APP_URL||'http://localhost:5191/?autostart=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.started===true',{timeout:180000}); console.log('Museum ready');
 await page.evaluate(()=>{document.activeElement.blur(); Object.assign(player,{x:0,z:37,yaw:0,pitch:0.68});});
 // Loading cancellation: stop immediately; cached data may finish but cannot revive the show.
 await page.evaluate(()=>{window.startDroneShow({},false);window.stopDroneShow(false);});
 await page.waitForFunction('DroneShow.data && !DroneShow.loading',{timeout:120000});
 check('stop during loading does not revive',await page.evaluate(()=>!DroneShow.isRunning&&!DroneShow.pending));
 await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning',{timeout:15000}); await sleep(1200);
 check('local F9 starts from zero after loading',await page.evaluate(()=>DroneShow.stats.initialAt<0.05),await page.evaluate(()=>({initialAt:DroneShow.stats.initialAt,observedAt:DroneShow.getState().t})));
 check('F9 starts 14000 IDs and music',await page.evaluate(()=>DroneShow.data.N===14000&&!DroneShow.music.paused),await page.evaluate(()=>DroneShow.getState()));
 const seed=await page.evaluate(()=>DroneShow.seed);
 await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{code:'F9',key:'F9',repeat:true})));
 await page.evaluate(()=>document.getElementById('sfx-btn').click()); check('sound button mutes music',await page.evaluate(()=>DroneShow.music.muted)); await page.evaluate(()=>document.getElementById('sfx-btn').click());
 check('key repeat ignored',await page.evaluate(s=>DroneShow.isRunning&&DroneShow.seed===s,seed));
 await page.keyboard.press('F8');check('F8 independent show blocked',await page.evaluate(()=>!FireworksShow.isRunning));
 await page.evaluate(()=>DroneShow.pause()); check('pause stops music',await page.evaluate(()=>DroneShow.music.paused));
 await page.evaluate(()=>{DroneShow.seek(68.5);DroneShow.resume();});await sleep(1000);
 check('music catches seek time',await page.evaluate(()=>Math.abs(DroneShow.music.currentTime-DroneShow.getState().t)<.6),await page.evaluate(()=>({audio:DroneShow.music.currentTime,show:DroneShow.getState().t})));
 await page.evaluate(()=>{DroneShow.pause();window.__qaRender=DroneShow.renderer.render.bind(DroneShow.renderer);DroneShow.renderer.render=function(s,c){DroneShow.referenceCamera(c);DroneShow.uniforms.uProj.value=this.getContext().drawingBufferHeight/(2*Math.tan(c.fov*Math.PI/360))*DroneShowConfig.stage.scale;window.__qaRender(s,c);};});
 for(const t of [0,1.5,3,5.9,6,9,12,14.5,30.5,48.5,68.5,88.5,108.5,126.5,46,51,55,24,42,62,82,102,120]){
  await page.evaluate(t=>DroneShow.seek(t),t); await sleep(180);
  const file=`reference_${t}.jpg`;await page.screenshot({path:path.join(OUT,file),type:'jpeg',quality:87});report.screenshots.push(file);
 }
 const levels=await page.evaluate(()=>{const D=DroneShow,rows=[];for(const tier of ['LOW','BALANCED','HIGH']){D.setTier(tier);D.seek(108.5);let n=0;for(let i=0;i<D.data.N;i++)if(Math.max(D.colArr[i*4],D.colArr[i*4+1],D.colArr[i*4+2])*D.colArr[i*4+3]>=.004)n++;rows.push({tier,ids:D.geo.attributes.position.count,lit:n});}return rows;});
 check('all quality tiers preserve IDs and lit tank LEDs',levels.every(r=>r.ids===14000&&r.lit===11932),levels);
 await page.evaluate(()=>{DroneShow.seek(51);DroneShow.renderer.render=function(s,c){DroneShow.referenceCamera(c);c.position.x+=18;c.lookAt(0,120,-100);DroneShow.uniforms.uProj.value=this.getContext().drawingBufferHeight/(2*Math.tan(c.fov*Math.PI/360))*DroneShowConfig.stage.scale;window.__qaRender(s,c);};});await sleep(200);await page.screenshot({path:path.join(OUT,'dragon_mild_angle.jpg'),type:'jpeg',quality:87});
 // Restore museum camera and verify the ordinary player view.
 await page.evaluate(()=>{DroneShow.renderer.render=window.__qaRender;camera.fov=70;camera.up.set(0,1,0);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();Object.assign(player,{x:0,z:37,yaw:0,pitch:.68});DroneShow.seek(48.5);}); await sleep(250);
 await page.screenshot({path:path.join(OUT,'player_dragon.jpg'),type:'jpeg',quality:87});
 const measure=()=>page.evaluate(()=>new Promise(res=>{const ts=[],begin=performance.now(),cpu=DroneShow.stats.ms,frames=DroneShow.stats.frames;function f(t){ts.push(t);if(t-begin<3000)return requestAnimationFrame(f);const dt=ts.slice(1).map((v,i)=>v-ts[i]).sort((a,b)=>a-b),avg=dt.reduce((a,b)=>a+b,0)/dt.length;res({fps:1000/avg,p95ms:dt[Math.floor(dt.length*.95)],cpuMs:(DroneShow.stats.ms-cpu)/Math.max(1,DroneShow.stats.frames-frames),calls:DroneShow.renderer.info.render.calls,geometries:DroneShow.renderer.info.memory.geometries,heap:performance.memory&&performance.memory.usedJSHeapSize});}requestAnimationFrame(f);}));
 await page.evaluate(()=>DroneShow.resume());report.performance=await measure();console.log('PERFORMANCE',report.performance);
 await page.evaluate(()=>{DroneShow.seek(134);DroneShow.resume();});
 for(const t of [137,141,145,149]){await page.waitForFunction(t=>DroneShow.getState().t>=t,{timeout:25000},t);await page.screenshot({path:path.join(OUT,`finale_${t}.jpg`),type:'jpeg',quality:87});}
 check('finale does not start independent F8 timeline',await page.evaluate(()=>!FireworksShow.isRunning));
 await page.evaluate(()=>DroneShow.seek(150.5));await sleep(800);check('music stops at 150',await page.evaluate(()=>DroneShow.music.paused));
 await page.evaluate(()=>DroneShow.seek(162.6));await sleep(800);await page.waitForFunction('!DroneShow.isRunning',{timeout:12000});
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
