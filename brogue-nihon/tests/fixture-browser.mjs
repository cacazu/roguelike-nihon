// Browser driver for CHECK initial scenes. No rule, result, or input is mocked.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp,realpath,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from '../../tools/server.mjs';

export const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const marker='  game.callMain(Array.from(arguments_));';
// Keep preparation-contract read errors inside the suite's fresh failure record.
// The override exists for exercising missing/unreadable-contract failures safely.
let sceneGroupError,sceneHeader='';
try{sceneHeader=await readFile(process.env.BROGUE_FIXTURE_HEADER||new URL('./fixture-scenes.h',import.meta.url),'utf8');}catch(error){sceneGroupError=error;}
export const sceneGroups=Object.fromEntries(Array.from(sceneHeader.matchAll(/^#define CHECK_(\w+) (\d+)$/gm),match=>[match[1],Number(match[2])]));

// Both adapters call the actual production Rust host. The event trace is taken
// after real input resolves and immediately before the C event owner consumes it.
const adapter=`
  const test=globalThis.__brogueFixture={module:game,serial:0,waiting:false,descriptor:[],cells:[],native_trace:[],observations:[],captures:[],active:false};
  const snapshot=()=>{const s=JSON.parse(game.UTF8ToString(game._brogue_check_features()));if(s.error)throw Error(s.error);return s;};
  test.prestartFeaturesError=JSON.parse(game.UTF8ToString(game._brogue_check_features())).error;if(test.prestartFeaturesError!=='CHECK game has not started')throw Error('Pre-main observation must fail safely');
  test.prestartReject=game._brogue_check_fixture(1000);if(test.prestartReject!==-1)throw Error('Pre-main fixture accepted');
  const event=globalThis.brogueHost.event;
  globalThis.brogueHost.event=(...args)=>{test.serial++;test.waiting=true;test.descriptor=Array.from(args[2]);return event(...args).then(value=>{
    if(test.active)test.native_trace.push({event:Array.from(value),before:snapshot(),descriptor:Array.from(args[2])});
    test.waiting=false;return value;
  });};
  const frame=globalThis.brogueHost.frame;
  globalThis.brogueHost.frame=(cells,...metadata)=>{
    test.cells=Array.from(cells);const result=frame(cells,...metadata);
    if(test.active){
      const s=snapshot(),observation={turn:s.turn,absoluteTurnNumber:s.absoluteTurnNumber,rng:s.rng,x:s.x,y:s.y,hp:s.hp,depth:s.depth,statuses:s.statuses,maxStatuses:s.maxStatuses,playerCell:s.playerCell,spawnCell:s.spawnCell,mapMetrics:s.mapMetrics,
        nativeAI:s.nativeAI,...(s.portal?{portal:s.portal}:{}),stealthRange:s.stealthRange,gases:s.cells.filter(c=>c.gas&&c.volume>0),surfaces:s.cells.filter(c=>c.surface),monsters:s.monsters,
        messageRows:Array.from({length:3},(_,y)=>Array.from({length:79},(_,i)=>{const at=(y*100+i+21)*10;return Math.max(...test.cells.slice(at+2,at+5))<20?' ':String.fromCodePoint(test.cells[at+1]||32);}).join(''))};
      const signature=JSON.stringify(observation);
      if(signature!==test.lastObservation){
        if(test.observations.length>=2000)throw Error('CHECK observation overflow');
        test.observations.push(observation);test.lastObservation=signature;
        if(test.captures.length<3&&(s.statuses[10]>0||s.playerCell?.surface===112||s.playerCell?.surface===113)){
          test.captures.push({observation_index:test.observations.length-1,png:document.querySelector('#game').toDataURL('image/png')});
        }
      }
    }
    return result;
  };
`;

export class FixturePage {
  constructor(page,entry,prefix='') {this.page=page;this.entry=entry;this.prefix=prefix;}
  async state(){return this.page.evaluate(()=>{const m=__brogueFixture.module,s=JSON.parse(m.UTF8ToString(m._brogue_check_features()));if(s.error)throw Error(s.error);return s;});}
  async publicCell(x,y){return this.page.evaluate(({x,y})=>__brogueFixture.cells.slice((y*100+x)*10,(y*100+x+1)*10),{x,y});}
  async assertSceneFrame(){const s=await this.state();if(s.inProgress){const player=await this.publicCell(s.x+21,s.y+3);assert.equal(player[1],64,'Public player glyph is missing at the actual C location');if(s.depth===this.origin.depth){const old=await this.publicCell(this.origin.x+21,this.origin.y+3);if(s.fixture===sceneGroups.NATIVE_LEVELS||[sceneGroups.NATIVE_AI,sceneGroups.NATIVE_SCENT].includes(Math.floor(s.fixture/1000)*1000)){if(s.x!==this.origin.x||s.y!==this.origin.y)assert.notEqual(old[1],64,'Native topology must not retain a duplicate player glyph');}else assert.equal(old[1],32,'Old pre-fixture player/map was restored');}return {player,old:await this.publicCell(this.origin.x+21,this.origin.y+3)};}}
  async wait(){return this.page.evaluate(()=>({serial:__brogueFixture.serial,waiting:__brogueFixture.waiting,kind:document.querySelector('#game').dataset.waitKind,descriptor:__brogueFixture.descriptor}));}
  async record(action){this.entry.steps.push({action,wait:await this.wait(),state:await this.state()});}
  async screenshot(name){
    if(this.entry.input_path==='touch'&&(await this.wait()).kind==='command'){
      const before=await this.state(),wait=await this.wait(),count=(await this.trace()).native_trace.length;
      await this.page.locator('#center-player').tap();
      assert.deepEqual(await this.state(),before,'Centering the public viewport must not change game state');
      assert.equal((await this.wait()).serial,wait.serial);assert.equal((await this.trace()).native_trace.length,count);
      const geometry=await this.page.evaluate(({x,y})=>{const c=document.querySelector('#game').getBoundingClientRect(),v=document.querySelector('#viewport').getBoundingClientRect();return {x:c.x+(x+21+.5)*c.width/100,y:c.y+(y+3+.5)*c.height/34,viewport:{x:v.x,y:v.y,w:v.width,h:v.height}};},before),v=geometry.viewport;
      assert.ok(geometry.x>v.x&&geometry.x<v.x+v.w&&geometry.y>v.y&&geometry.y<v.y+v.h,'Prepared player must be inside the actual touch viewport');
      this.entry.map_viewports??=[];this.entry.map_viewports.push({name,geometry});
    }
    const filename=this.prefix+name+'.png';await this.page.screenshot({path:path.join(this.entry.directory,filename),fullPage:true});this.entry.screenshots.push(filename);
  }
  async input(key){
    const before=await this.wait();assert.equal(before.waiting,true,'Original C is not awaiting an event');
    if(this.entry.input_path==='touch'){
      const code=({Space:32,Tab:9,ArrowRight:108,ArrowLeft:104,ArrowUp:107,ArrowDown:106})[key]??key.codePointAt(0);
      const selector=key==='Escape'?'#cancel':key==='Enter'?'#submit':key==='Tab'?'#tab-action':`#commands button[data-key="${code}"],#choices button[data-key="${code}"],#directions button[data-key="${code}"]`;
      await this.page.locator(selector).filter({visible:true}).first().tap();
    }else await this.page.keyboard.press(key);
    await this.page.waitForFunction(serial=>(__brogueFixture.waiting&&__brogueFixture.serial>serial)||document.querySelector('#game').dataset.waitKind==='title',before.serial,{timeout:60000});
    await this.record((this.entry.input_path==='touch'?'tap ':'key ')+key);
  }
  async apply(){await this.input('a');assert.equal((await this.wait()).kind,'item');assert.ok((await this.wait()).descriptor.slice(4).includes(97),'Public candidate a missing');await this.input('a');}
  async settle(){
    for(let i=0;i<80;i++){
      const kind=(await this.wait()).kind;
      if(kind==='command')return;
      assert.ok(kind==='acknowledge'||kind==='anykey','Unexpected original input owner '+kind);
      await this.input('Space');
    }
    throw Error('Acknowledgment limit exceeded');
  }
  effect(check){this.entry.effect_asserted_attempted=true;check();this.entry.effect_reached=true;}
  async trace(){return this.page.evaluate(()=>({native_trace:__brogueFixture.native_trace,observations:__brogueFixture.observations,captures:__brogueFixture.captures}));}
}

export async function runFixtureSuite({name,createCases,filter=process.env.BROGUE_CONSUMABLES}){
  const output=path.join(root,'.local/feature-verification',name);
  const run_id=new Date().toISOString(),runFolder='run-'+run_id.replaceAll(/[:.]/g,'-');
  const result={run_id,result:'fail',mode:'CHECK initial scenes; not a normal playthrough',cases:[],notSelected:[],artifacts:[],native_comparison_excluded_fields:['ready'],native_control_comparison:'control_runs are browser evidence; native comparator covers primary runs only'};
  const selected=filter?.split(',').filter(Boolean);
  const progress={run_id,state:'running',selected_cases:null,completed:0,passed:0,failed:0,active_case:null};
  const saveProgress=async()=>{progress.updated_at=new Date().toISOString();await writeFile(path.join(output,'progress.json'),JSON.stringify(progress,null,2)+'\n');};
  let browser,server,temporary,oldTemp,base,checkModule,host;
  try{
    await mkdir(path.join(output,runFolder),{recursive:true});
    try{const old=await readFile(path.join(output,'results.json'));const prior=JSON.parse(old);await mkdir(path.join(output,'history'),{recursive:true});await writeFile(path.join(output,'history',(prior.run_id||'legacy').replaceAll(/[:.]/g,'-')+'-'+hash(old).slice(0,8)+'.json'),old);}catch(error){if(error.code!=='ENOENT')throw error;}
    await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');await saveProgress();
    if(sceneGroupError)throw sceneGroupError;
    assert.equal(typeof createCases,'function','A case factory is required');
    const cases=await createCases();
    assert.ok(Array.isArray(cases)&&cases.length>0,'Case factory must return a nonempty array');
    assert.equal(new Set(cases.map(test=>test.id)).size,cases.length,'Case IDs must be unique');
    for(const test of cases)assert.ok(Number.isSafeInteger(test.fixture_id)&&test.fixture_id>0,'Invalid or unavailable fixture ID for '+test.id);
    if(selected)assert.ok(cases.some(test=>selected.includes(test.id)),'No known fixture cases selected');
    progress.selected_cases=cases.filter(test=>!selected||selected.includes(test.id)).length;await saveProgress();
    const {chromium}=require(process.env.BROGUE_PLAYWRIGHT||'playwright');
    const manifestBytes=await readFile(path.join(root,'build/build-manifest-check.json'));
    const manifest=JSON.parse(manifestBytes),production=JSON.parse(await readFile(path.join(root,'build/build-manifest.json'),'utf8'));
    assert.equal(manifest.test_hooks,true);
    for(const file of ['tests/fixtures.c','tests/fixture-scenes.h'])assert.ok(manifest.source_inputs.some(record=>record.file===file),'CHECK manifest lacks '+file);
    for(const [label,build]of[['CHECK',manifest],['production',production]]){
      for(const source of build.source_inputs)assert.equal(hash(Buffer.from((await readFile(path.resolve(root,source.file),'utf8')).replaceAll('\r\n','\n'))),source.sha256,label+' source '+source.file+' changed');
      for(const asset of build.asset_inputs)assert.equal(hash(await readFile(path.resolve(root,asset.file))),asset.sha256,label+' asset '+asset.file+' changed');
      for(const artifact of build.outputs)assert.equal(hash(await readFile(path.join(root,'build',artifact.file))),artifact.sha256,label+' output '+artifact.file+' changed');
    }
    assert.deepEqual(manifest.asset_inputs,production.asset_inputs,'CHECK and production assets differ');
    const artifacts=[...manifest.outputs,...production.outputs.filter(record=>/^browser-ui\.(js|wasm)$/.test(record.file))];
    assert.equal(artifacts.length,4);
    for(const artifact of artifacts){assert.equal(hash(await readFile(path.join(root,'build',artifact.file))),artifact.sha256,artifact.file+' changed');result.artifacts.push({file:'build/'+artifact.file,sha256:artifact.sha256});}
    result.provenance={source_manifest_sha256:hash(manifestBytes),artifacts:Object.fromEntries(artifacts.map(record=>[record.file,record.sha256]))};
    checkModule=await readFile(path.join(root,'build/game-check.js'),'utf8');host=await readFile(path.join(root,'web/host.js'),'utf8');assert.ok(host.includes(marker));
    server=createPreviewServer({root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/`;
    temporary=await mkdtemp(path.join(output,'runtime-'));oldTemp={TEMP:process.env.TEMP,TMP:process.env.TMP};process.env.TEMP=temporary;process.env.TMP=temporary;
    browser=await chromium.launch({headless:true,...(process.env.BROGUE_BROWSER?{executablePath:process.env.BROGUE_BROWSER}:{})});
    for(const test of cases){
      if(selected&&!selected.includes(test.id)){result.notSelected.push(test.id);continue;}
      progress.active_case=test.id;await saveProgress();
      const entry={...test,execute:undefined,method:'fixture_browser',fixture:true,coverage:'partial',mode:'normal',seed:String(test.seed??42),scene:test.fixture_id,directory:path.join(output,runFolder,test.id),steps:[],screenshots:[],errors:[],effect_reached:false};
      await mkdir(entry.directory,{recursive:true});let context,driver;
      try{
        context=await browser.newContext({viewport:test.input_path==='touch'?{width:390,height:844}:{width:1240,height:900},hasTouch:true});
        await context.route('**/build/game.js',route=>route.fulfill({body:checkModule,contentType:'text/javascript'}));
        // Variant is a native launch option; the production URL supports lang/seed/load.
        // Keep this CHECK-only launch configuration explicit rather than assuming an ignored URL query.
        const launch="  game.callMain([...Array.from(arguments_), ..."+JSON.stringify(test.variant==='brogue'?[]:['--variant',test.variant])+"]);";
        await context.route('**/web/host.js',route=>route.fulfill({body:host.replace(marker,adapter+launch),contentType:'text/javascript'}));
        const makePage=async(scene,prefix='')=>{
          const page=await context.newPage();page.on('pageerror',error=>entry.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')entry.errors.push(message.text());});
          await page.goto(base+'?seed='+encodeURIComponent(entry.seed)+'&lang=en');
          await page.waitForFunction(()=>globalThis.__brogueFixture?.waiting&&document.querySelector('#game').dataset.waitKind==='command',null,{timeout:60000});
          const d=new FixturePage(page,entry,prefix),startup=await d.state(),wait=await d.wait();
          assert.equal(await page.evaluate(()=>__brogueFixture.prestartFeaturesError),'CHECK game has not started');assert.equal(await page.evaluate(()=>__brogueFixture.prestartReject),-1);assert.equal(startup.fixture,0);assert.equal(startup.variant,({brogue:'brogue',rapid_brogue:'rapidBrogue',bullet_brogue:'bulletBrogue'})[test.variant],'Native launch variant mismatch');assert.equal(startup.seed,entry.seed);assert.equal(startup.turn,0);assert.equal(startup.ready,1);assert.equal(wait.serial,1);
          if(!prefix&&[sceneGroups.NATIVE_AI,sceneGroups.NATIVE_SCENT].includes(Math.floor(scene/1000)*1000))entry.startup_state=startup;
          for(const rejected of[...(entry.seed!=='42'?[6,sceneGroups.POTION_UNKNOWN,sceneGroups.NATIVE_AI]:[]),-1,99999,Math.max(...Object.values(sceneGroups).filter(id=>id<1000))+1,
            sceneGroups.POTION_UNKNOWN+startup.kindCounts.potion,sceneGroups.CHARM_READY+startup.kindCounts.charm,
            sceneGroups.SCROLL_UNKNOWN+startup.kindCounts.scroll,sceneGroups.SCROLL_KNOWN+startup.kindCounts.scroll,
            sceneGroups.STAFF_READY+startup.kindCounts.staff,sceneGroups.WAND_READY+startup.kindCounts.wand,
            sceneGroups.STAFF_READY+500,sceneGroups.STAFF_READY+900,
            sceneGroups.WAND_READY+500,sceneGroups.WAND_READY+505,sceneGroups.WAND_READY+900,
            sceneGroups.WEAPON_RUNIC+10,sceneGroups.WEAPON_PLAIN+1,sceneGroups.WEAPON_INANIMATE+7,sceneGroups.WEAPON_INANIMATE+10,
            sceneGroups.ARMOR_RUNIC+11,sceneGroups.ARMOR_PLAIN+11,sceneGroups.ARMOR_CONDITION,
            sceneGroups.ARMOR_CONDITION+102,sceneGroups.ARMOR_CONDITION+204,sceneGroups.ARMOR_CONDITION+305,
            sceneGroups.RING_READY+8,sceneGroups.RING_READY+104,sceneGroups.RING_READY+200,
            sceneGroups.RING_READY+301,sceneGroups.RING_READY+407,sceneGroups.MONSTER_ABILITIES+14,sceneGroups.MONSTER_ABILITIES+100,sceneGroups.MONSTER_ABILITIES+999,sceneGroups.MONSTER_ENVIRONMENT+20,sceneGroups.MONSTER_ENVIRONMENT+100,sceneGroups.MONSTER_ENVIRONMENT+999,sceneGroups.TERRAIN_EXPOSURE+20,sceneGroups.TERRAIN_EXPOSURE+100,sceneGroups.TERRAIN_EXPOSURE+999,sceneGroups.TERRAIN_HAZARDS+10,sceneGroups.TERRAIN_HAZARDS+100,sceneGroups.TERRAIN_HAZARDS+999,sceneGroups.MONSTER_SPELLS+10,sceneGroups.MONSTER_SPELLS+100,sceneGroups.MONSTER_SPELLS+999,sceneGroups.NATIVE_AI+3,sceneGroups.NATIVE_AI+100,sceneGroups.NATIVE_AI+999,sceneGroups.NATIVE_SCENT+2,sceneGroups.NATIVE_SCENT+100,sceneGroups.NATIVE_SCENT+999]){
            assert.equal(await page.evaluate(id=>__brogueFixture.module._brogue_check_fixture(id),rejected),-1,'Unknown/unsupported kind must reject');
            assert.deepEqual(await d.state(),startup,'Rejected kind changed preparation/RNG');
          }
           // Opt in only after native startup/rejection checks: record genuine preparation publishes.
           // No synthetic observation or forced C flush; the normal frame wrapper keeps signature dedup.
           if(test.observe_preparation_frames===true){await page.evaluate(()=>{__brogueFixture.active=true;});if(!prefix)entry.observe_preparation_frames=true;}
          assert.equal(await page.evaluate(id=>__brogueFixture.module._brogue_check_fixture(id),scene),scene,'Fixture not accepted');
          d.startup=startup;d.origin={x:startup.x,y:startup.y,depth:startup.depth};
          const prepared=await d.state();assert.equal(prepared.turn,0);assert.equal(prepared.fixture,scene);
          assert.equal(await page.evaluate(id=>__brogueFixture.module._brogue_check_fixture(id),scene),-1);assert.deepEqual(await d.state(),prepared,'Repeated preparation changed state');
          const publicFrame=await d.assertSceneFrame();if(!prefix)entry.public_initial_frame=publicFrame;
          await page.evaluate(()=>{__brogueFixture.active=true;});
          await d.record('CHECK prepare '+scene);await d.screenshot('initial');return d;
        };
        driver=await makePage(test.fixture_id);entry.initial_state=await driver.state();
        await test.execute(driver,{control:async (callback,fixture_id=test.fixture_id)=>{
          assert.ok(Number.isSafeInteger(fixture_id)&&fixture_id>0);
          const control=await makePage(fixture_id,'control-');const initial_state=await control.state();
          try{const value=await callback(control);entry.control_runs??=[];entry.control_runs.push({fixture_id,initial_state,...await control.trace(),final_state:await control.state()});return value;}finally{await control.page.close();}
        }});
        await driver.settle();assert.equal((await driver.wait()).kind,'command');entry.final_state=await driver.state();entry.public_final_frame=await driver.assertSceneFrame();
        Object.assign(entry,await driver.trace());assert.ok(entry.native_trace.length>0);assert.deepEqual(entry.native_trace[0].before,entry.initial_state,'First consumed event must start at the injected initial state');
        await driver.screenshot('result');assert.deepEqual(entry.errors,[]);entry.status='pass';console.log('PASS '+test.id);
      }catch(error){entry.status='fail';entry.failure={message:error.message,stack:error.stack};console.log('FAIL '+test.id+': '+error.message);if(driver){Object.assign(entry,await driver.trace().catch(()=>({})));entry.final_state=await driver.state().catch(()=>null);await driver.screenshot('failure').catch(()=>{});}}
      finally{
        if(context)await context.close();
        for(const[i,capture]of(entry.captures||[]).entries()){
          assert.ok(capture.png.startsWith('data:image/png;base64,'));const filename='intermediate-'+String(i).padStart(2,'0')+'.png';await writeFile(path.join(entry.directory,filename),Buffer.from(capture.png.split(',')[1],'base64'));entry.screenshots.push(filename);capture.file=filename;delete capture.png;
        }
        entry.targets=(entry.targets||[]).map(target=>({...target,effect_asserted:!!entry.effect_asserted_attempted}));
        entry.evidence=entry.screenshots.map(file=>runFolder+'/'+test.id+'/'+file).concat(runFolder+'/'+test.id+'/steps.json');
        const saved={...entry,directory:undefined};await writeFile(path.join(entry.directory,'steps.json'),JSON.stringify(saved,null,2)+'\n');result.cases.push({...saved,steps:undefined,observations:undefined,captures:undefined});
        progress.completed++;progress[entry.status==='pass'?'passed':'failed']++;progress.last_completed_case=entry.id;progress.active_case=null;await saveProgress();
      }
    }
    assert.ok(result.cases.length>0);result.result=result.cases.every(entry=>entry.status==='pass')?'pass':'fail';
  }catch(error){result.fatal={message:error.message,stack:error.stack};result.result='fail';console.error(error.stack);}
  finally{
    const cleanupErrors=[];
    try{await browser?.close();}catch(error){cleanupErrors.push(error.message);}
    try{if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){cleanupErrors.push(error.message);}
    for(const[key,value]of Object.entries(oldTemp||{}))if(value===undefined)delete process.env[key];else process.env[key]=value;
    try{if(temporary){assert.equal(path.dirname(await realpath(temporary)),await realpath(output));assert.ok(path.basename(temporary).startsWith('runtime-'));await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:100});}}catch(error){cleanupErrors.push(error.message);}
    if(cleanupErrors.length){result.result='fail';result.cleanup_errors=cleanupErrors;}
    progress.state=result.result==='pass'?'completed':'failed';progress.active_case=null;
    try{await saveProgress();}catch(error){result.result='fail';result.progress_error={message:error.message,stack:error.stack};}
    await mkdir(output,{recursive:true});await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
  }
  if(result.result!=='pass')throw Error(name+' verification failed: '+path.join(output,'results.json'));
  console.log(`${name}: ${result.cases.length} cases; ${output}`);return result;
}
