// Exercise original title, mode, diagnostic and recording menus with browser
// inputs. Read-only Check state is kept distinct from the public cell buffer.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from '../../tools/server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'.local/feature-verification/menus');
const oldTemp={TEMP:process.env.TEMP,TMP:process.env.TMP};
const result={run_id:new Date().toISOString(),status:'fail',checks:[],cases:[],failures:[],errors:[],screenshots:[],evidence:[],scope:'Representative original menus and recording controls. Wizard is a native game mode, not normal play. No state injection or complete feature/ending claim.'};
const filter=process.argv.slice(2).join(' ');
let temporary,browser,server,page,base,host,module;
const marker='  game.callMain(Array.from(arguments_));';
const adapter=`
  const observer=globalThis.__menu={game,epoch:0,eventId:0,waiting:false,inputs:[],descriptor:[],cells:[],text:'',history:[]};
  for(const name of ['event','pause']){
    const owner=globalThis.brogueHost[name];globalThis.brogueHost[name]=(...args)=>{
      observer.epoch++;observer.descriptor=Array.from(args[2]);
      const id=observer.epoch;observer.eventId=id;observer.waiting=name==='event';
      observer.history.push({name,descriptor:observer.descriptor});
      return owner(...args).then(value=>{if(name==='event')observer.inputs.push(Array.from(value));if(observer.eventId===id)observer.waiting=false;return value;});
    };
  }
  const frame=globalThis.brogueHost.frame;globalThis.brogueHost.frame=cells=>{
    observer.cells=Array.from(cells);observer.text=Array.from({length:34},(_,row)=>Array.from({length:100},(_,col)=>String.fromCodePoint(cells[(row*100+col)*10+1]||32)).join('')).join('\\n');return frame(cells);
  };
`;
const hash=data=>createHash('sha256').update(data).digest('hex');
async function inspect(){return page.evaluate(()=>({epoch:__menu.epoch,waiting:__menu.waiting,inputs:__menu.inputs,descriptor:__menu.descriptor,text:__menu.text,kind:document.querySelector('#game').dataset.waitKind}));}
async function state(){return page.evaluate(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())));}
async function kind(value){await page.waitForFunction(value=>document.querySelector('#game')?.dataset.waitKind===value,value,{timeout:20000});}
async function text(value){await page.waitForFunction(value=>__menu.text.toLowerCase().includes(value.toLowerCase()),value,{timeout:10000});}
async function choice(code){await page.locator(`#choices button[data-key="${code}"]`).waitFor({state:'visible',timeout:10000});}
async function press(key,{touch=false,code}={}){
  const part=(key||'').split('+').at(-1),special={Space:32,Escape:27,Enter:10,Tab:9,ArrowUp:63232,ArrowDown:63233,ArrowLeft:63234,ArrowRight:63235};
  const expected=code??special[part]??part.codePointAt(0);
  await page.waitForFunction(expected=>{
    const wait=__menu.descriptor;return [0,8,9,10].includes(wait[0])||wait.slice(4).includes(expected)||(expected===27&&wait[2]);
  },expected,{timeout:10000});
  const before=await inspect();
  if(touch)await page.locator(code===27?'#cancel':code===9?'#tab-action':`#choices button[data-key="${code}"]`).tap();else await page.keyboard.press(key);
  await page.waitForFunction(before=>__menu.inputs.length>before.inputs.length,before,{timeout:6000});
}
async function cancel(){await press('Escape');}
async function screenshot(name){const filename=name+'.png';await page.screenshot({path:path.join(output,filename),fullPage:true});result.screenshots.push(filename);}
async function seeded(seed='42'){
  await press('p');await choice(115);await press('s');await kind('text');
  await page.locator('#text-value').fill(seed);const before=(await inspect()).inputs.length;
  await page.locator('#text-entry button[type=submit]').click();await page.waitForFunction(before=>__menu.inputs.length>before,before);
  await kind('command');assert.equal((await state()).seed,seed);
}
async function quitToTitle(){
  await press('Q');await kind('confirm');await press('y');
  for(let step=0;step<14;step++){
    await page.waitForFunction(()=>document.querySelector('#game').dataset.waitKind==='title'||__menu.waiting,null,{timeout:15000});
    if((await inspect()).kind==='title')return;
    await press((await inspect()).kind==='text'?'Escape':'Space');
  }
  throw new Error('Quit did not return to the title through the native dialogs');
}
async function recording(){
  await seeded();
  for(let turn=1;turn<=12;turn++){await press('.');await page.waitForFunction(turn=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===turn,turn);}
  await quitToTitle();await press('v');await choice(114);await press('r');await choice(97);await press('a');await text('recording paused');await kind('playback');
  assert.equal((await state()).turn,0);
}
async function recordedFiles(){return page.evaluate(()=>{
  const fs=__menu.game.FS;return fs.readdir('/brogue').filter(name=>name.endsWith('.broguerec')).map(name=>({name,bytes:Array.from(fs.readFile('/brogue/'+name))}));
});}
async function check(id,feature_ids,fn,{variant='brogue',mode='normal',mobile=false,assertions=[]}={}){
  if(filter&&!id.includes(filter))return;
  const record={id,feature_ids,status:'fail',method:'automated_browser',fixture:false,variant,mode,input_path:mobile?'touch':'pc-keyboard',coverage:'partial',assertions,evidence:['brogue-nihon/.local/feature-verification/menus/results.json']};result.cases.push(record);
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1240,height:900},isMobile:mobile,hasTouch:true});
  await context.route('**/build/game.js',route=>route.fulfill({body:module,contentType:'text/javascript'}));
  await context.route('**/web/host.js',route=>route.fulfill({body:host.replace(marker,adapter+marker),contentType:'text/javascript'}));
  try{
    page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));await page.goto(base+'?lang=en');await kind('title');
    await fn(context);record.status='pass';result.checks.push(id);console.log('PASS '+id);
  }catch(error){result.failures.push({id,error:error.stack,observation:await inspect().catch(()=>null),state:await state().catch(()=>null)});await screenshot(id+'-failure').catch(()=>{});console.log('FAIL '+id+': '+error.message.split('\n')[0]);}
  finally{await context.close();}
}
try{
  await mkdir(output,{recursive:true});temporary=await mkdtemp(path.join(output,'runtime-'));process.env.TEMP=temporary;process.env.TMP=temporary;
  const {chromium}=createRequire(import.meta.url)(process.env.BROGUE_PLAYWRIGHT||'playwright');
  host=await readFile(path.join(root,'web/host.js'),'utf8');assert.ok(host.includes(marker));module=await readFile(path.join(root,'build/game-check.js'),'utf8');
  server=createPreviewServer({root});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base=`http://127.0.0.1:${server.address().port}/`;
  result.provenance={artifacts:{}};for(const name of ['game-check.js','game-check.wasm','browser-ui.js','browser-ui.wasm'])result.provenance.artifacts[name]=hash(await readFile(path.join(root,'build',name)));
  result.provenance.production_manifest_sha256=hash(await readFile(path.join(root,'build/build-manifest.json')));
  result.provenance.manifest_sha256=result.provenance.check_manifest_sha256=hash(await readFile(path.join(root,'build/build-manifest-check.json')));
  browser=await chromium.launch({headless:true,...(process.env.BROGUE_BROWSER?{executablePath:process.env.BROGUE_BROWSER}:{})});
  for(const [variant,key,version]of [['brogue','b','version CE 1.15.1'],['rapid_brogue','r','version RB 1.7.1'],['bullet_brogue','l','version BB 1.2.1']]){
    await check('title-select-'+variant+'-seeded-game',['menu.title','menu.play','menu.variants','variant.'+(variant==='brogue'?'brogue':variant==='rapid_brogue'?'rapid':'bullet'),'cmd.seed'],async()=>{
      await press('p');await choice(97);await press('a');await choice(key.charCodeAt(0));await press(key);await kind('title');
      await seeded();const before=await state();await press('~');await text('Dungeon seed #42');
      assert.match((await inspect()).text,new RegExp(version,'i'));assert.deepEqual(await state(),before);await screenshot(variant+'-seed42');
    },{variant,assertions:['Variant selected through native Play menu; numeric seed42 starts a live game; native seed display identifies the selected version without consuming a turn.']});
  }
  await check('title-mode-switch-and-cancel',['menu.modes','mode.normal','mode.easy','mode.wizard'],async()=>{
    for(const [key,label]of [['e','Easy Mode'],['w','Wizard Mode'],['n',null]]){
      await press('p');await choice(109);await press('m');await choice(key.charCodeAt(0));await press(key);await kind('title');await choice(112);
      if(label)await text(label);else assert.equal((await inspect()).text.includes('Wizard Mode'),false);
    }
    await press('p');await choice(109);await press('m');await choice(119);await cancel();await kind('title');
    await seeded();await press('~');await text('Dungeon seed #42');assert.equal((await inspect()).text.includes('wizard mode;'),false);assert.equal((await inspect()).text.includes('easy mode;'),false);
    await screenshot('normal-after-mode-cancel');
  },{assertions:['Easy/Wizard/Normal title mode buttons respond; Escape cancels selection; subsequent seeded game remains normal.']});
  await check('title-empty-load-recording-and-seed-cancel',['menu.play','menu.view','menu.file_pages','text.edit'],async()=>{
    await press('p');await choice(115);await press('s');await kind('text');await cancel();await kind('title');
    for(const [flyout,entry]of [['p','l'],['v','r']]){
      await press(flyout);await choice(entry.charCodeAt(0));await press(entry);
      await text('No');await screenshot('empty-'+entry);await press('Space');await kind('title');
    }
  },{assertions:['Seed entry cancellation returns to title; empty save and recording lists show original rejection and return after acknowledgment.']});
  await check('title-highscores-and-empty-stats',['menu.view','history.scores','history.stats'],async()=>{
    await press('v');await choice(104);await press('h');await text('High Scores');await press('Space');await kind('title');
    await press('v');await choice(103);await press('g');await text('-- GAME STATS --');assert.match((await inspect()).text,/Games Played\s+0\s+0/);await screenshot('empty-game-stats');
    await press('Enter');await kind('title');
  },{assertions:['Native high scores close with Space; fresh stats show zero games and native arbitrary-key dismissal works.']});
  await check('easy-mode-reject-then-accept',['cmd.easy','mode.easy','dialog.ack_confirm'],async()=>{
    await seeded();const before=await state();
    await press('&');await kind('acknowledge');await press('Space');await kind('confirm');await press('n');await kind('command');
    await press('~');await text('Dungeon seed #42');assert.equal((await inspect()).text.includes('easy mode;'),false);
    await press('&');await kind('acknowledge');await press('Space');await kind('confirm');await press('y');await kind('acknowledge');await press('Space');await kind('command');
    await press('~');await text('easy mode;');assert.deepEqual(await state(),before);await screenshot('easy-mode-enabled');
  },{mode:'normal-to-easy',assertions:['Easy-mode warning and confirm can be rejected without mode change; accepting changes native seed mode indicator while turn/HP/position/RNG remain unchanged.']});
  await check('wizard-create-menu-cancel-and-native-food',['menu.modes','mode.wizard','cmd.wizard_create'],async()=>{
    await press('p');await choice(109);await press('m');await choice(119);await press('w');await kind('title');await seeded();
    await press('C');await text('Create:');await screenshot('wizard-create-type');await cancel();await kind('command');
    await press('C');await text('Create:');await press('a');await text('Create item:');await screenshot('wizard-item-categories');await cancel();await kind('command');
    await press('C');await text('Create:');await press('a');await text('Create item:');await press('a');await text('Create food:');await press('a');await kind('command');await text('you now have');
    await screenshot('wizard-created-food');
  },{mode:'wizard',assertions:['Wizard is selected through native title menu; creation type/category cancel returns; selecting native food category creates an item through original Wizard code, not fixture injection.']});
  await check('wizard-diagnostic-screens-and-monster-menu-cancel',['cmd.wizard_create','cmd.seed','mode.wizard'],async()=>{
    await press('p');await choice(109);await press('m');await choice(119);await press('w');await kind('title');await seeded();const before=await state();
    await press('C');await text('Create:');await press('b');await text('Create monster:');await screenshot('wizard-monster-list');await cancel();await kind('command');
    await press('~');let pages=0;
    for(;pages<20;pages++){
      if((await inspect()).text.includes('Dungeon seed #42'))break;
      await page.waitForFunction(()=>__menu.waiting,null,{timeout:15000});await press('Space');
    }
    await text('wizard mode;');assert.ok(pages>0&&pages<20);const after=await state();assert.equal(after.turn,before.turn);assert.equal(after.hp,before.hp);
    result.evidence.push({id:'wizard-diagnostics',pages,before,after});await screenshot('wizard-seed-after-diagnostics');
  },{mode:'wizard',assertions:['Native Wizard monster list cancels without spawning; diagnostic maps are dismissed through their original input owners and return to seed/mode message without a turn.']});
  await check('stats-reset-decline-and-accept',['history.stats','menu.view','dialog.ack_confirm'],async()=>{
    await seeded();await press('.');await quitToTitle();
    for(const accept of [false,true]){
      await press('v');await choice(103);await press('g');await text('-- GAME STATS --');assert.match((await inspect()).text,/Games Played\s+1\s+1/);
      await press('r');await kind('confirm');await press(accept?'y':'n');await kind('title');
    }
    await press('v');await choice(103);await press('g');await text('-- GAME STATS --');assert.match((await inspect()).text,/Games Played\s+1\s+0/);await screenshot('stats-reset-recent');await press('Enter');await kind('title');
  },{assertions:['Normal one-turn quit creates history; declining native Reset confirmation preserves counts; accepting resets Recent only; empty Recent stats dismiss with Enter.']});
  await check('recording-browser-pc-controls',['menu.view','replay.pause_speed','replay.seek_turn','replay.seek_depth','replay.omniscience','replay.inspect','replay.switch_file','replay.display','replay.integrity'],async()=>{
    await recording();const files=await recordedFiles(),start=await state();await press('ArrowUp');await text('Faster');await press('ArrowDown');await text('Slower');assert.deepEqual(await state(),start);
    await press('l');await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===1);
    await press('Shift+ArrowRight');await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===6);
    await press('ArrowLeft');await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===5);
    await press('Control+ArrowLeft');await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===0);
    await press('?');await text('pause or unpause playback');await kind('acknowledge');await press('Space');await kind('playback');
    await press('Tab');await text('Omniscience enabled.');await press('Tab');await text('Omniscience disabled.');
    await press('i');await kind('item');await cancel();await kind('playback');
    await press('3');await kind('text');await page.locator('#text-value').fill('3');await page.locator('#text-entry button[type=submit]').click();await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===3);
    await press('<');await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===0);await press('>');await text('Already reached deepest depth explored');
    await press('V');await choice(97);await cancel();await kind('playback');
    const beforeNativeKeys=await state();const delivered=[];
    for(const key of ['N','Enter']){const count=(await inspect()).inputs.length;await press(key);await page.waitForFunction(count=>__menu.inputs.length>count&&__menu.waiting,count);delivered.push((await inspect()).inputs.at(-1));assert.deepEqual(await state(),beforeNativeKeys);}
    result.cases.push({id:'native-recording-new-and-keyboard-examine-unreached',feature_ids:['cmd.new','replay.inspect'],status:'unreached',method:'automated_browser',fixture:false,variant:'brogue',input_path:'pc-keyboard',coverage:'partial',assertions:['Physical N and Return are consumed once without a state transition. Original v1.15.1 strips N to n before the playback switch and has no Return case; browser does not fabricate these actions.'],evidence:['brogue-nihon/.local/feature-verification/menus/results.json']});
    result.evidence.push({id:'native-playback-N-Return',delivered,before:beforeNativeKeys,after:await state(),source:['Recordings.c executePlaybackInput','IO.c stripShiftFromMovementKeystroke/mainInputLoop']});
    await press('~');await text('Dungeon seed #42');await screenshot('recording-paused-controls');
    await press('Space');await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn>0);await press('Escape');
    await press('Q');await kind('title');assert.deepEqual(await recordedFiles(),files);
  },{assertions:['A recording is produced by normal seed42 gameplay and native quit; UI opens it paused; speed, forward/back modifiers, numeric seek, depth bounds, help, inventory, omniscience, file cancellation and playback/quit respond through original C. Native N collision is tracked separately, not claimed as a successful new-game transition.']});
  await check('recording-touch-pause-control-is-offered',['menu.view','replay.pause_speed','replay.seek_turn','replay.inspect','replay.omniscience','replay.display','replay.integrity'],async()=>{
    await recording();const files=await recordedFiles();await screenshot('recording-touch-controls');
    assert.equal(await page.locator('#commands').isVisible(),false);assert.equal(await page.locator('#directions').isVisible(),false);
    assert.ok(await page.locator('#controls button[data-key="32"]').isVisible(),'Paused recording has no visible touch Space control');
    await press(null,{touch:true,code:32});await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn>0);
    await press(null,{touch:true,code:32});await text('[PAUSED]');await kind('playback');
    await press(null,{touch:true,code:48});await kind('text');await page.locator('#text-value').fill('0');await page.locator('#text-entry button[type=submit]').tap();await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===0);
    await press(null,{touch:true,code:108});await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn===1);
    await press(null,{touch:true,code:107});await text('Faster');await press(null,{touch:true,code:106});await text('Slower');
    await press(null,{touch:true,code:9});await text('Omniscience enabled.');
    await press(null,{touch:true,code:105});await kind('item');await press(null,{touch:true,code:27});await kind('playback');
    await press(null,{touch:true,code:63});await kind('acknowledge');await press(null,{touch:true,code:32});await kind('playback');
    const before=await state(),count=(await inspect()).inputs.length;
    for(const mode of ['dot','illustration','original']){await page.locator('#choices button[data-key="71"]').tap();await page.waitForFunction(mode=>document.querySelector('#game').dataset.displayMode===mode,mode);assert.deepEqual(await state(),before);}
    assert.equal((await inspect()).inputs.length,count);await screenshot('recording-touch-after-inspection');
    await press(null,{touch:true,code:81});await kind('title');assert.deepEqual(await recordedFiles(),files);
  },{mobile:true,assertions:['Normal gameplay prepares the recording; all replay actions use touch: play/pause, numeric seek, next frame, speed, omniscience, inventory/help cancellation, three display modes and quit. Original recording bytes remain unchanged.']});
  await check('unpaused-recording-file-dialog-offers-touch-candidates',['replay.switch_file','menu.file_pages'],async()=>{
    await recording();const files=await recordedFiles();
    for(let step=0;step<3;step++)await press('ArrowDown');
    await press(null,{touch:true,code:32});await page.waitForFunction(()=>JSON.parse(__menu.game.UTF8ToString(__menu.game._brogue_check_snapshot())).turn>0);
    await press(null,{touch:true,code:86});await text('View recording:');await screenshot('unpaused-recording-file-dialog');
    await choice(97);assert.equal((await inspect()).kind,'menu');
    await press(null,{touch:true,code:97});await text('Recording paused.');await kind('playback');assert.equal((await state()).turn,0);assert.deepEqual(await recordedFiles(),files);
    await press(null,{touch:true,code:81});await kind('title');
  },{mobile:true,assertions:['While the native recording runs, touch View recording opens a real file menu with the public a candidate; touch selection restarts the original recording paused at turn0 without modifying its bytes.']});
}catch(error){result.failures.push({id:'fatal',error:error.stack});console.error(error);}
finally{
  if(!result.cases.length)result.failures.push({id:'selection',error:'No menu cases ran'});
  if(result.errors.length)result.failures.push({id:'runtime',error:result.errors.join('\n')});
  result.status=result.failures.length?'fail':'pass';
  await mkdir(output,{recursive:true});await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
  await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  for(const [name,value]of Object.entries(oldTemp))if(value===undefined)delete process.env[name];else process.env[name]=value;
  if(temporary){const resolved=await realpath(temporary),parent=await realpath(output);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('runtime-'));await rm(resolved,{recursive:true,force:true});}
}
if(result.failures.length)process.exitCode=1;
