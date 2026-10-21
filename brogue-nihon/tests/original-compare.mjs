// Physical browser keys are recorded after Rust translation, then replayed by a
// test-only console linked against an independently supplied upstream source tree.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from '../../tools/server.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=process.env.BROGUE_ORIGINAL_SOURCE;
const actionLog=process.env.BROGUE_ACTION_LOG;
const output=path.join(root,'.local/feature-verification/original-compare');
await mkdir(output,{recursive:true});
let temporary,browser,server;
const oldTemp={TEMP:process.env.TEMP,TMP:process.env.TMP};
const evidence={source:source||null,version:'Brogue CE 1.15.1',sourceHashes:{},checks:[],errors:[],runs:[],cases:[]};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
assert.ok(source,'Set BROGUE_ORIGINAL_SOURCE to the verified upstream v1.15.1 source tree.');
const pin=JSON.parse(await readFile(path.join(root,'tests/upstream-1.15.1.json'),'utf8'));
for(const [filename,expected]of Object.entries(pin.source_sha256)){
  const data=await readFile(path.join(source,filename));
  assert.equal(createHash('sha256').update(data).digest('hex'),expected,'Upstream source pin: '+filename);
}
evidence.source=path.resolve(source);
evidence.upstream={repository:pin.repository,tag:pin.tag,commit:pin.commit,archiveSha256:pin.archive_sha256};
temporary=await mkdtemp(path.join(output,'runtime-'));
process.env.TEMP=temporary;process.env.TMP=temporary;
const native=path.join(output,process.platform==='win32'?'upstream-input.exe':'upstream-input');
const sources=[];
for(const folder of ['brogue','variants']){
  for(const file of (await readdir(path.join(source,'src',folder))).filter(file=>file.endsWith('.c')).sort())sources.push(path.join(source,'src',folder,file));
}
for(const file of ['main','platformdependent'])sources.push(path.join(source,'src/platform',file+'.c'));
for(const folder of ['brogue','platform','variants']){
  for(const file of (await readdir(path.join(source,'src',folder))).filter(file=>/\.[ch]$/.test(file)).sort()){
    const filename=path.join(source,'src',folder,file);
    evidence.sourceHashes[path.relative(source,filename).replaceAll('\\','/')]=digest(await readFile(filename));
  }
}
assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),Object.keys(pin.source_sha256).sort(),'Unpinned upstream C/header inputs');
const command=['-std=c11','-O1','-fwrapv','-fno-strict-aliasing','-DBROGUE_EXTRA_VERSION=""','-DDATADIR=.',
  ...['brogue','platform','variants'].map(folder=>'-I'+path.join(source,'src',folder)),
  ...(process.platform==='win32'?['-Wl,--stack,8388608']:[]),...sources,path.join(root,'tests/original-platform.c'),'-lm','-o',native];
const build=spawnSync(process.env.BROGUE_CC||'gcc',command,{encoding:'utf8',timeout:180000});
assert.equal(build.status,0,build.error?.message||build.stderr);
evidence.compileArguments=command;
evidence.mode='normal';
evidence.rngObservation='randomNumbersGenerated: substantive RNG draw count (Math.c rand_range/rand_64bits); internal RNGState is not exported';
evidence.limits=['Synchronous input waits only; animations and interrupted automatic actions are outside this comparison.'];
evidence.run_id=new Date().toISOString();
evidence.provenance={artifacts:{}};
for(const name of ['game-check.js','game-check.wasm','browser-ui.js','browser-ui.wasm'])evidence.provenance.artifacts[name]=digest(await readFile(path.join(root,'build',name)));
evidence.provenance.source_manifest_sha256=digest(await readFile(path.join(root,'build/build-manifest-check.json')));
await writeFile(path.join(output,'compiler-warnings.txt'),build.stderr);
evidence.compiler=spawnSync(process.env.BROGUE_CC||'gcc',['--version'],{encoding:'utf8'}).stdout.split('\n')[0];
evidence.platformSha256=digest(await readFile(path.join(root,'tests/original-platform.c')));
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BROGUE_PLAYWRIGHT||'playwright');
const host=await readFile(path.join(root,'web/host.js'),'utf8');
const check=await readFile(path.join(root,'build/game-check.js'),'utf8');
let recordedActions=[];
if(actionLog){
  const data=await readFile(actionLog);
  const actions=data.toString('utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  assert.ok(actions.length,'The normal-play action log is empty');
  const uiOnly=[];let stoppedBefore=null;
  for(const action of actions){
    // Saving transfers to a title animation loop which this synchronous native
    // console deliberately does not drive. Fresh-page saving is a separate test.
    if(action.input.op==='key'&&['S','Q'].includes(action.input.key)){stoppedBefore={seq:action.seq,key:action.input.key,reason:'End-of-run/title transition is outside the synchronous original console comparison'};break;}
    if(action.input.op==='key')recordedActions.push(action);
    else{assert.equal(action.consumed?.length,0,'A non-key action consumed game input and cannot be omitted');uiOnly.push({seq:action.seq,input:action.input});}
  }
  assert.ok(recordedActions.length,'No physical gameplay keys precede the title transition');
  evidence.actionLog={path:path.resolve(actionLog),sha256:digest(data),total_actions:actions.length,compared_key_actions:recordedActions.length,ui_only_not_replayed:uiOnly,stopped_before:stoppedBefore,attempt:recordedActions[0].attempt};
}
const marker='  game.callMain(Array.from(arguments_));';
assert.ok(host.includes(marker));
server=createPreviewServer({root});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({headless:true,...(process.env.BROGUE_BROWSER?{executablePath:process.env.BROGUE_BROWSER}:{})});
  for(const [variant,argument] of [['CE',null],['Rapid','rapid_brogue'],['Bullet','bullet_brogue'],...(recordedActions.length?[['CE-playthrough',null]]:[])]){
    const context=await browser.newContext({viewport:{width:1240,height:900}});
    const args=['--language','en',...(argument?['--variant',argument]:[]),'--seed','42'];
    const instrument=`
      const comparison=globalThis.__comparison={events:[],states:[],serial:0,waiting:false};
      const owner=globalThis.brogueHost.event;
      globalThis.brogueHost.event=(...args)=>{
        comparison.states.push(JSON.parse(game.UTF8ToString(game._brogue_check_snapshot())));
        comparison.serial++;comparison.waiting=true;
        return owner(...args).then(event=>{comparison.events.push(Array.from(event));comparison.waiting=false;return event;});
      };
    `;
    await context.route('**/build/game.js',route=>route.fulfill({body:check,contentType:'text/javascript'}));
    await context.route('**/web/host.js',route=>route.fulfill({body:host.replace(marker,instrument+'\n  game.callMain('+JSON.stringify(args)+');'),contentType:'text/javascript'}));
    const page=await context.newPage();
    page.on('pageerror',error=>evidence.errors.push(error.message));
    await page.goto(base+'?seed=42&lang=en');
    await page.waitForFunction(()=>globalThis.__comparison?.waiting&&document.querySelector('#game').dataset.waitKind==='command');
    const sent=[];
    async function key(value){
      const serial=await page.evaluate(()=>__comparison.serial);
      await page.keyboard.press(value);
      await page.waitForFunction(serial=>__comparison.waiting&&__comparison.serial>serial,serial,{timeout:15000});
      sent.push(value);
    }
    async function close(){
      for(let step=0;step<8;step++){
        if(await page.locator('#game').getAttribute('data-wait-kind')==='command')return;
        await key('Escape');
      }
      throw Error('Cannot return from original modal');
    }
    // Each sequence starts a new upstream seed. No fixtures or hidden-map lookup.
    const sequence=variant==='CE-playthrough'?recordedActions.map(action=>action.input.key):['ArrowRight','.','s','i','Escape','?','Escape','D','Escape','F','Escape','i'];
    for(const value of sequence)await key(value);
    await close();
    await page.screenshot({path:path.join(output,variant+'-browser.png'),fullPage:true});
    const actual=await page.evaluate(()=>({events:__comparison.events,states:__comparison.states}));
    const replay=spawnSync(native,[...(argument?['--variant',argument]:[]),'--seed','42'],{
      cwd:temporary,input:actual.events.map(event=>event.join(' ')).join('\n')+'\n',encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
    assert.equal(replay.status,0,replay.error?.message||replay.stderr);
    const expected=replay.stdout.split(/\r?\n/).filter(line=>line.startsWith('BROWSER_COMPARE ')).map(line=>JSON.parse(line.slice(16)));
    const record={variant,keys:sent,...actual,upstream:expected,stderr:replay.stderr};
    evidence.runs.push(record);
    await writeFile(path.join(output,variant+'-trace.json'),JSON.stringify(record,null,2)+'\n');
    assert.deepEqual(actual.states,expected,variant+' original state at every consumed input');
    evidence.checks.push(variant+' seed42 physical input matches original C at all '+expected.length+' waits');
    const features=variant==='CE-playthrough'?['cmd.move','cmd.inventory','cmd.throw','cmd.explore','cmd.stairs','combat','variant.brogue']:['cmd.move','cmd.rest','cmd.search','cmd.inventory','cmd.help','cmd.discoveries','cmd.feats','variant.'+(variant==='CE'?'brogue':variant.toLowerCase())];
    evidence.cases.push({id:variant.toLowerCase()+'-consumed-inputs',feature_ids:features,status:'pass',variant:argument||'brogue',method:'native_comparison',input_path:'pc-keyboard',fixture:false,coverage:'partial',assertions:['Every upstream C/header matches the pinned official source bytes.','At every consumed input, seed, turn, substantive RNG draw count, position, HP, depth and ended state match the original console.'],evidence:[variant+'-trace.json',variant+'-browser.png'],scope:variant==='CE-playthrough'?'Replayed physical actions from the separately recorded normal playthrough; character state and substantive RNG draw count at every consumed input.':'Seed42 movement/wait/search and information modals; observed character state and substantive RNG draw count at each consumed input, not all item/AI effects.'});
    await context.close();
    console.log('PASS '+evidence.checks.at(-1));
  }
  assert.deepEqual(evidence.errors,[]);
  evidence.result='pass';
}catch(error){evidence.result='fail';evidence.failure=error.stack;process.exitCode=1;console.error(error);}
finally{
  await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  await writeFile(path.join(output,'results.json'),JSON.stringify(evidence,null,2)+'\n');
  for(const [name,value]of Object.entries(oldTemp))if(value===undefined)delete process.env[name];else process.env[name]=value;
  if(temporary){
    const resolved=await realpath(temporary),parent=await realpath(output);
    assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('runtime-'));
    await rm(resolved,{recursive:true,force:true});
  }
}
