import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,webkit} from 'playwright';

// Provider fixtures exist only in this test runner, never in the distributed web app.
const root=fileURLToPath(new URL('../web/',import.meta.url));
const video=fileURLToPath(new URL('./fixtures/video.mp4',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
let disconnectOrigin=false;
const server=createServer(async(req,res)=>{if(disconnectOrigin){req.socket.destroy();return;}try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!target.startsWith(root))throw Error();const bytes=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const backend='https://der-programmer1.github.io/origincheck-contract-test-only';
const fixture={schemaVersion:1,verdict:'inconclusive',confidenceBand:'niedrig',summary:'Testvertrag: <img src=x onerror="window.injected=true"> Keine Live-Analyse.',signals:[{title:'Testsignal',status:'unklar',explanation:'Ausschließlich ein Browser-Vertragstest.'}],limitations:['Testdaten sind keine echte Herkunftsprüfung.'],analyzedAt:'2026-11-03T00:00:00Z',providerStatus:'ok'};
const outcomes=[];
async function run(name,action){await action();outcomes.push(name);process.stdout.write(`ok ${outcomes.length} - ${name}\n`);}
try{
  for(const engine of ['chromium','webkit']){
    const browser=await ({chromium,webkit}[engine]).launch(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
    try{
      const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
      const page=await context.newPage();if(process.env.ORIGINCHECK_BROWSER_DIAGNOSTICS){page.on('requestfailed',r=>process.stderr.write(JSON.stringify({engine,requestFailed:r.failure()})+'\n'));page.on('console',m=>process.stderr.write(engine+': '+m.text()+'\n'));}
      let mode='missing',uploads=0,health=0;
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await context.route(backend+'/**',async route=>{
        const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-OriginCheck-Consent, X-OriginCheck-Context','Content-Type':'application/json'};
        const request=route.request();
        if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
        if(request.url().endsWith('/health')){health++;return route.fulfill({status:mode==='missing'?503:200,headers,body:JSON.stringify(mode==='missing'?{error:{code:'backend_not_configured'}}:{status:'ready'})});}
        uploads++;assert.equal(request.headers()['x-origincheck-consent'],'yes');
        if(request.url().endsWith('/v1/analyze')){assert.equal(request.headers()['content-type'],'image/jpeg');const bytes=request.postDataBuffer();/* WebKit's interception protocol omits binary Blob bodies; real TLS body checks also run in backend tests. */if(bytes){assert.equal(bytes[0],255);assert.equal(bytes[1],216);}}
        return route.fulfill({status:mode==='failure'?502:200,headers,body:JSON.stringify(mode==='failure'?{error:{message:'Provider nicht verfügbar'}}:mode==='invalid'?{...fixture,verdict:'invented'}:fixture)});
      });
      await page.goto(base);
      const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const g=c.getContext('2d');g.fillStyle='#267a93';g.fillRect(0,0,320,180);g.fillStyle='#fff';g.font='30px sans-serif';g.fillText('Lokale Testdatei',22,95);return c.toDataURL('image/png').split(',')[1];}),'base64');
      const selectImage=async()=>{await page.locator('#file').setInputFiles({name:'lokales-testbild.png',mimeType:'image/png',buffer:png});await page.locator('#local').waitFor({state:'visible'});};
      const start=async()=>{await page.locator('#consent').check();await page.locator('#analyze').click();};
      await run(`${engine}: empty state and no backend produce no verdict`,async()=>{assert.equal(await page.locator('#result').isVisible(),false);assert.equal(await page.locator('#analyze').isDisabled(),true);assert.equal(health+uploads,0);});

      await run(`${engine}: real image selection is local and requires consent`,async()=>{await selectImage();assert.equal(await page.locator('#preview').evaluate(e=>e.naturalWidth),320);assert.equal(await page.locator('#analyze').isDisabled(),true);assert.equal(health+uploads,0);await page.locator('#backend').fill(backend);await page.locator('#save-backend').click();assert.equal(await page.evaluate(()=>localStorage.getItem('origincheck.backend.v1')),backend);});
      await run(`${engine}: missing key shows 503 without media upload or fake result`,async()=>{await start();await page.locator('#error').waitFor({state:'visible'});assert.match(await page.locator('#error').textContent(),/Analyse-Backend nicht konfiguriert/);assert.equal(health,1);assert.equal(uploads,0);assert.equal(await page.locator('#result').isVisible(),false);assert.equal(await page.locator('#local').isVisible(),false);});
      await run(`${engine}: six real video frames form a JPEG contact sheet`,async()=>{await page.locator('#file').setInputFiles(video);await page.locator('#local').waitFor({state:'visible',timeout:45000});const dims=await page.locator('#preview').evaluate(e=>[e.naturalWidth,e.naturalHeight]);assert.deepEqual(dims,[1536,660]);assert.match(await page.locator('#local-signals').textContent(),/sechs verschiedene Zeitpunkte/);assert.match(await page.locator('#sampling-note').textContent(),/keine vollständige temporale Videoprüfung/);assert.equal(uploads,0);const colors=await page.locator('#preview').evaluate(img=>{const c=document.createElement('canvas');c.width=1536;c.height=660;const g=c.getContext('2d');g.drawImage(img,0,0);return Array.from({length:6},(_,i)=>{const pixels=g.getImageData(i%3*512,Math.floor(i/3)*330,512,288).data;let hash=2166136261;for(let j=0;j<pixels.length;j++)hash=Math.imul(hash^pixels[j],16777619)>>>0;return hash;}).filter((v,i,a)=>a.indexOf(v)===i).length;});assert.ok(colors>1,'representative frames must contain changing real pixels');await page.locator('#clear-file').click();assert.equal(await page.locator('#preview').getAttribute('src'),null);});
      await run(`${engine}: provider errors and unknown verdicts never become results`,async()=>{for(const value of ['failure','invalid']){mode=value;await selectImage();await start();await page.locator('#error').waitFor({state:'visible'});assert.equal(await page.locator('#result').isVisible(),false);} });
      await run(`${engine}: inconclusive contract is safely rendered and saved only on request`,async()=>{mode='ok';await selectImage();await start();await page.locator('#result').waitFor({state:'visible'});assert.equal(await page.locator('#verdict').textContent(),'Nicht eindeutig bestimmbar');assert.equal(await page.locator('#summary img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.evaluate(()=>localStorage.getItem('origincheck.history.v1')),null);await page.locator('#save-result').click();assert.equal(await page.locator('#history > li').count(),1);const stored=await page.evaluate(()=>localStorage.getItem('origincheck.history.v1'));assert.ok(!stored.includes('data:image'));await page.locator('#delete-result').click();await page.getByRole('button',{name:'Ergebnis öffnen',exact:true}).click();await page.getByRole('button',{name:'Dieses Ergebnis löschen',exact:true}).click();assert.equal(await page.locator('#history > li').count(),0);await page.locator('#save-result').click();await page.locator('#clear-history').click();assert.equal(await page.evaluate(()=>localStorage.getItem('origincheck.history.v1')),null);});
      await run(`${engine}: unsupported social link has explicit file fallback`,async()=>{const before=uploads+health;await page.locator('#link').fill('https://www.youtube.com/watch?v=test');assert.match(await page.locator('#error').textContent(),/Teile stattdessen das Video/);assert.equal(await page.locator('#analyze').isDisabled(),true);assert.equal(uploads+health,before);});
      await run(`${engine}: installable shell reloads offline on phone and tablet widths`,async()=>{
        const shellContext=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
        try{
          const shell=await shellContext.newPage();const shellErrors=[];shell.on('pageerror',e=>shellErrors.push(e.message));await shell.goto(base);
          await shell.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
          if(process.env.ORIGINCHECK_SCREENSHOT_DIR&&engine==='chromium'){
            await mkdir(process.env.ORIGINCHECK_SCREENSHOT_DIR,{recursive:true});await shell.screenshot({path:path.join(process.env.ORIGINCHECK_SCREENSHOT_DIR,'01-preview.png'),fullPage:true});
            await shell.locator('#file').setInputFiles(video);await shell.locator('#local').waitFor({state:'visible',timeout:45000});await shell.screenshot({path:path.join(process.env.ORIGINCHECK_SCREENSHOT_DIR,'02-lokale-videopruefung.png'),fullPage:true});await shell.locator('#clear-file').click();
          }
          await shell.locator('#backend').fill(backend);await shell.locator('#save-backend').click();if(engine==='webkit')disconnectOrigin=true;else await shellContext.setOffline(true);await shell.reload();await shell.waitForFunction(expected=>document.querySelector('#backend').value===expected,backend);assert.equal(await shell.locator('h1').count(),1);if(engine==='chromium'){/* Headless Shell can retain navigator.onLine across a service-worker reload. Set the browser network indicator as well as disabling actual requests. */const network=await shellContext.newCDPSession(shell);await network.send('Network.enable');await network.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1,connectionType:'none'});await shell.locator('#offline').waitFor({state:'visible'});assert.equal(await shell.locator('#offline').isVisible(),true);}assert.equal(await shell.locator('#result').isVisible(),false);assert.equal(await shell.locator('#backend').inputValue(),backend);
          for(const width of [390,768,1280]){await shell.setViewportSize({width,height:900});assert.equal(await shell.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`no horizontal overflow at ${width}`);}
          await shellContext.setOffline(false);assert.deepEqual(shellErrors,[]);assert.deepEqual(errors,[]);
        }finally{disconnectOrigin=false;await shellContext.close();}
      });
      await context.close();
    }finally{await browser.close();}
  }
  process.stdout.write(`PASS: ${outcomes.length} browser checks; Chromium + Linux WebKit, not physical Safari.\n`);
  if(process.env.ORIGINCHECK_BROWSER_REPORT)await writeFile(process.env.ORIGINCHECK_BROWSER_REPORT,JSON.stringify({passed:outcomes.length,checks:outcomes,engines:['Chromium','Linux WebKit'],physicalSafari:false,liveProvider:false},null,2)+'\n');
}finally{await new Promise(resolve=>server.close(resolve));}
