// Production-only end-of-run files must survive a fresh page, including each
// variant's native high scores and run history. No state fixtures or exports.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from '../../tools/server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'.local/feature-verification/persistence');
await mkdir(output,{recursive:true});
let temporary,browser,page,server;
const oldTemp={TEMP:process.env.TEMP,TMP:process.env.TMP};
const evidence={checks:[],errors:[],variants:[],screenshots:[],cases:[]};
try{
temporary=await mkdtemp(path.join(output,'runtime-'));
process.env.TEMP=temporary;process.env.TMP=temporary;
const {chromium}=createRequire(import.meta.url)(process.env.BROGUE_PLAYWRIGHT||'playwright');
const host=await readFile(path.join(root,'web/host.js'),'utf8');
const marker='  game.callMain(Array.from(arguments_));';assert.ok(host.includes(marker));
server=createPreviewServer({root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
evidence.run_id=new Date().toISOString();
evidence.provenance={artifacts:{}};
for(const name of ['game.js','game.wasm','browser-ui.js','browser-ui.wasm'])evidence.provenance.artifacts[name]=hash(await readFile(path.join(root,'build',name)));
evidence.provenance.source_manifest_sha256=hash(await readFile(path.join(root,'build/build-manifest.json')));
async function wait(kind){await page.waitForFunction(kind=>document.querySelector('#game')?.dataset.waitKind===kind,kind,{timeout:60000});}
async function next(key){
  const before=await page.evaluate(()=>({serial:__files.serial,consumed:__files.consumed}));await page.keyboard.press(key);
  await page.waitForFunction(before=>__files.consumed>before.consumed&&__files.serial>before.serial,before,{timeout:20000});
}
async function files(){return page.evaluate(()=>{
  const fs=__files.game.FS;
  return fs.readdir('/brogue').filter(name=>name!=='.'&&name!=='..').map(name=>({name,bytes:Array.from(fs.readFile('/brogue/'+name))}));
});}
  browser=await chromium.launch({headless:true,...(process.env.BROGUE_BROWSER?{executablePath:process.env.BROGUE_BROWSER}:{})});
  for(const [name,variant]of [['Brogue',null],['RapidBrogue','rapid_brogue'],['BulletBrogue','bullet_brogue']]){
    const context=await browser.newContext({viewport:{width:1240,height:900}});
    let args=['--language','en',...(variant?['--variant',variant]:[]),'--seed','42'];
    await context.route('**/web/host.js',route=>route.fulfill({contentType:'text/javascript',body:host.replace(marker,`
      const observer=globalThis.__files={game,serial:0,consumed:0,eventWaiting:false,text:''};
      const frame=globalThis.brogueHost.frame;
      globalThis.brogueHost.frame=(cells,...metadata)=>{observer.text=Array.from({length:34},(_,row)=>Array.from({length:100},(_,col)=>String.fromCodePoint(cells[(row*100+col)*10+1]||32)).join('')).join('\\n');return frame(cells,...metadata);};
      for(const name of ['event','pause']){const owner=globalThis.brogueHost[name];globalThis.brogueHost[name]=(...args)=>{observer.serial++;if(name==='event')observer.eventWaiting=true;return owner(...args).then(value=>{if(name==='event'){observer.consumed++;observer.eventWaiting=false;}return value;});};}
      game.callMain(${JSON.stringify(args)});
    `)}));
    page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));
    await page.goto(base+'?lang=en&seed=42');await wait('command');
    await next('.');await next('Q');await wait('confirm');await next('y');
    for(let step=0;step<12;step++){
      await page.waitForFunction(()=>document.querySelector('#game').dataset.waitKind==='title'||__files.eventWaiting,null,{timeout:20000});
      const kind=await page.locator('#game').getAttribute('data-wait-kind');
      if(kind==='title')break;
      await next(kind==='text'?'Escape':' ');
    }
    await wait('title');
    const original=await files();
    const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('brogue-nihon:files:v1:1.15.1')));
    const record={name,original:original.map(file=>({name:file.name,bytes:file.bytes.length,sha256:hash(Buffer.from(file.bytes))})),persisted:persisted.files.map(file=>file.name)};
    evidence.variants.push(record);
    for(const suffix of ['HighScores.txt','RunHistory.txt']){
      const file=original.find(file=>file.name===name+suffix);assert.ok(file,name+suffix+' was not written by original C');
      const saved=persisted.files.find(saved=>saved.name===file.name);
      assert.ok(saved,name+suffix+' was omitted from browser persistence');assert.deepEqual(saved.bytes,file.bytes);
    }
    args=['--language','en',...(variant?['--variant',variant]:[])];
    await page.reload();await wait('title');const restored=await files();
    for(const file of original.filter(file=>/HighScores\.txt$|RunHistory\.txt$|\.broguerec$/.test(file.name)))assert.deepEqual(restored.find(restored=>restored.name===file.name)?.bytes,file.bytes,file.name+' changed across reload');
    await next('v');
    await page.locator('#choices button[data-key="103"]').waitFor({state:'visible'});
    await next('g');
    await page.waitForFunction(()=>__files.text.includes('-- GAME STATS --'),null,{timeout:15000});
    record.restoredStats=await page.evaluate(()=>__files.text);
    assert.match(record.restoredStats,/Games Played\s+1\s+1/,'Original stats must count the restored run');
    const screenshot=name+'-restored-stats.png';await page.screenshot({path:path.join(output,screenshot),fullPage:true});evidence.screenshots.push(screenshot);
    await next(' ');await wait('title');
    evidence.checks.push(name+' original scores/history/recording preserved across a fresh page; native stats menu responds');
    evidence.cases.push({id:name.toLowerCase()+'-files-and-stats',feature_ids:['cmd.quit','history.scores','history.stats','ending.quit','save.finish_recording'],status:'pass',variant:variant||'brogue',method:'automated_browser',input_path:'pc-keyboard',fixture:false,coverage:'partial',assertions:['Native score and run-history files are included byte-for-byte in browser storage.','Scores, history and the completed recording survive a fresh page byte-for-byte.','The native statistics screen shows Games Played=1 in both columns and Space returns to title.'],evidence:[screenshot],scope:'Normal-mode quit and recording cancellation; playback and other endings are separate cases.'});
    console.log('PASS '+evidence.checks.at(-1));
    if(name==='BulletBrogue'){
      // Capacity setup only: copies of the real completed recording are added
      // to the filesystem. The production save policy must reject the write
      // without replacing the last readable browser container.
      const previous=await page.evaluate(()=>localStorage.getItem('brogue-nihon:files:v1:1.15.1'));
      const recording=original.find(file=>file.name.endsWith('.broguerec'));assert.ok(recording);
      await page.evaluate(bytes=>{for(let index=0;index<65;index++)__files.game.FS.writeFile('/brogue/capacity-'+index+'.broguerec',Uint8Array.from(bytes));},recording.bytes);
      await next('n');await wait('command');
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Too many Brogue saved files'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('brogue-nihon:files:v1:1.15.1')),previous);
      await page.screenshot({path:path.join(output,'capacity-retains-readable-container.png'),fullPage:true});
      evidence.screenshots.push('capacity-retains-readable-container.png');
      await page.reload();await wait('title');
      assert.ok(!(await files()).some(file=>file.name.startsWith('capacity-')));
      evidence.checks.push('CHECK filesystem preparation: excessive file count preserves the previous readable browser container');
      console.log('PASS '+evidence.checks.at(-1));
    }
    await context.close();
  }
  assert.deepEqual(evidence.errors,[]);evidence.result='pass';
}catch(error){evidence.result='fail';evidence.failure=error.stack;process.exitCode=1;console.error(error);if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});}
finally{
  await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  await writeFile(path.join(output,'results.json'),JSON.stringify(evidence,null,2)+'\n');
  for(const [name,value]of Object.entries(oldTemp))if(value===undefined)delete process.env[name];else process.env[name]=value;
  if(temporary){const resolved=await realpath(temporary),parent=await realpath(output);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('runtime-'));await rm(resolved,{recursive:true,force:true});}
}
