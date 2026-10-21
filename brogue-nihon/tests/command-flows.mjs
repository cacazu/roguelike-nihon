// Native commands entered through physical browser inputs. Check exports only
// observe the live engine; these cases never prepare or inject a fixture.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from '../../tools/server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'.local/feature-verification/commands');
const runId=new Date().toISOString(),runFolder='run-'+runId.replaceAll(/[:.]/g,'-'),runDirectory=path.join(output,runFolder);
const result={run_id:runId,status:'fail',checks:[],cases:[],failures:[],errors:[],screenshots:[],evidence:[],scope:'Seed42 normal-mode browser commands, no fixture injection; representative partial coverage, not a complete playthrough or all command branches.'};
const filter=process.argv.slice(2).join(' '),oldTemp={TEMP:process.env.TEMP,TMP:process.env.TMP};
const hash=value=>createHash('sha256').update(value).digest('hex');
const marker='  game.callMain(Array.from(arguments_));';
let temporary,browser,server,page,context,base,host,module,normalExplore;
const adapter=`
  const observer=globalThis.__command={game,epoch:0,waiting:false,inputs:[],descriptor:[],cells:[],text:'',pauses:[],dom:[]};
  document.addEventListener('keydown',event=>observer.dom.push({key:event.key,code:event.code,repeat:event.repeat,control:event.ctrlKey,shift:event.shiftKey}));
  const event=globalThis.brogueHost.event;globalThis.brogueHost.event=(...args)=>{
    const id=++observer.epoch;observer.waiting=true;observer.descriptor=Array.from(args[2]);
    return event(...args).then(value=>{observer.inputs.push(Array.from(value));if(observer.epoch===id)observer.waiting=false;return value;});
  };
  const pause=globalThis.brogueHost.pause;globalThis.brogueHost.pause=(...args)=>{
    const record={id:++observer.epoch,milliseconds:args[0],mouse:args[1],descriptor:Array.from(args[2]),resolved:false};observer.waiting=false;observer.descriptor=record.descriptor;observer.pauses.push(record);
    return pause(...args).then(value=>{record.resolved=true;record.interrupted=value;return value;});
  };
  const frame=globalThis.brogueHost.frame;globalThis.brogueHost.frame=cells=>{
    observer.cells=Array.from(cells);observer.text=Array.from({length:34},(_,row)=>Array.from({length:100},(_,col)=>{const i=(row*100+col)*10;return cells[i]===0x110000?'':String.fromCodePoint(cells[i+1]||32);}).join('')).join('\\n');return frame(cells);
  };
`;
async function inspect(){return page.evaluate(()=>({waiting:__command.waiting,descriptor:__command.descriptor,inputs:__command.inputs,text:__command.text,kind:document.querySelector('#game').dataset.waitKind,pauses:__command.pauses}));}
async function state(){return page.evaluate(()=>JSON.parse(__command.game.UTF8ToString(__command.game._brogue_check_snapshot())));}
async function features(){return page.evaluate(()=>JSON.parse(__command.game.UTF8ToString(__command.game._brogue_check_features())));}
async function waitKind(kind){await page.waitForFunction(kind=>globalThis.__command?.waiting&&document.querySelector('#game')?.dataset.waitKind===kind,kind,{timeout:20000});}
async function waitGame(){await page.waitForFunction(()=>globalThis.__command?.waiting&&['command','cursor'].includes(document.querySelector('#game')?.dataset.waitKind),null,{timeout:30000});}
async function text(value){await page.waitForFunction(value=>__command.text.toLowerCase().includes(value.toLowerCase()),value,{timeout:10000});}
async function action(fn){const count=(await inspect()).inputs.length;await fn();await page.waitForFunction(count=>__command.inputs.length>count,count,{timeout:8000});}
async function key(value){await action(()=>page.keyboard.press(value));}
async function tap(selector){await action(()=>page.locator(selector).tap());}
async function shot(name){const relative=runFolder+'/'+name+'.png';await page.screenshot({path:path.join(output,relative),fullPage:true});result.screenshots.push(relative);return relative;}
async function open(mobile=false){
  context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1240,height:900},isMobile:mobile,hasTouch:true});
  await context.route('**/build/game.js',route=>route.fulfill({body:module,contentType:'text/javascript'}));
  await context.route('**/web/host.js',route=>route.fulfill({body:host.replace(marker,adapter+marker),contentType:'text/javascript'}));
  page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));await page.goto(base+'?seed=42&lang=en');await waitKind('command');const initial=await features();assert.equal(initial.fixture,0);assert.equal(typeof initial.searching,'number','Rebuild Check with the read-only command observations');
}
async function reset(mobile=false){await context.close();await open(mobile);}
async function check(id,feature_ids,fn,{mobile=false,assertions=[]}={}){
  if(filter&&!id.includes(filter))return;
  const record={id,feature_ids,status:'fail',method:'automated_browser',fixture:false,mode:'normal',seed:'42',variant:'brogue',input_path:mobile?'touch':'pc-keyboard',coverage:'partial',assertions,evidence:['brogue-nihon/.local/feature-verification/commands/'+runFolder+'/results.json']};result.cases.push(record);
  try{await open(mobile);await fn();record.status='pass';result.checks.push(id);console.log('PASS '+id);}
  catch(error){result.failures.push({id,error:error.stack,observation:await inspect().catch(()=>null),state:await state().catch(()=>null),features:await features().catch(()=>null)});await shot(id+'-failure').catch(()=>{});console.log('FAIL '+id+': '+error.message.split('\n')[0]);}
  finally{await context?.close();}
}
async function publicWord(word,rowOnly){
  return page.evaluate(({word,rowOnly})=>{
    for(let row=0;row<34;row++){
      if(rowOnly!==undefined&&row!==rowOnly)continue;
      const line=Array.from({length:100},(_,col)=>String.fromCodePoint(__command.cells[(row*100+col)*10+1]||32)).join('');
      const col=line.indexOf(word);if(col>=0)return {col:col+word.length/2,row:row+.5};
    }
    return null;
  },{word,rowOnly});
}
async function touchPan(dx,dy){
  const box=await page.locator('#viewport').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/8,y:y+dy*step/8,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await page.evaluate(async()=>{const viewport=document.querySelector('#viewport');let x=viewport.scrollLeft,y=viewport.scrollTop,stable=0;for(let frame=0;frame<240&&stable<8;frame++){await new Promise(resolve=>requestAnimationFrame(resolve));stable=viewport.scrollLeft===x&&viewport.scrollTop===y?stable+1:0;x=viewport.scrollLeft;y=viewport.scrollTop;}});
}
async function tapWord(word,{row,mobile=false}={}){
  const cell=await publicWord(word,row);assert.ok(cell,'Public canvas text missing: '+word);
  for(let attempt=0;attempt<8;attempt++){
    const geometry=await page.evaluate(cell=>{
      const canvas=document.querySelector('#game').getBoundingClientRect(),viewport=document.querySelector('#viewport').getBoundingClientRect();
      return {x:canvas.x+cell.col*canvas.width/100,y:canvas.y+cell.row*canvas.height/34,viewport:{x:viewport.x,y:viewport.y,width:viewport.width,height:viewport.height}};
    },cell),v=geometry.viewport;
    const dx=geometry.x<v.x+4?100:geometry.x>v.x+v.width-4?-100:0;
    const dy=geometry.y<v.y+4?80:geometry.y>v.y+v.height-4?-80:0;
    if(!dx&&!dy){await action(()=>mobile?page.touchscreen.tap(geometry.x,geometry.y):page.mouse.click(geometry.x,geometry.y));return;}
    assert.ok(mobile,'Desktop canvas cell is outside the viewport');const count=(await inspect()).inputs.length;await touchPan(dx,dy);assert.equal((await inspect()).inputs.length,count,'Viewport pan submitted game input');
  }
  throw new Error('Public canvas cell remained outside viewport after touch pan');
}
async function details(letter){await key('i');await waitKind('item');await key(letter);await text(letter==='a'?'hungry enough':'damage');}
function flags(value){return Object.fromEntries(['searching','automationActive','autoPlayingLevel','disturbed','trueColorMode','displayStealthRangeMode','cursorMode','cursor'].map(key=>[key,value[key]]));}
async function verifyManifest(filename,testHooks){
  const bytes=await readFile(path.join(root,'build',filename)),manifest=JSON.parse(bytes);
  assert.equal(manifest.test_hooks,testHooks);assert.equal(manifest.source_eol,'LF');assert.equal(manifest.game,'brogue-ce-1.15.1');
  for(const record of manifest.source_inputs){const canonical=(await readFile(path.resolve(root,record.file),'utf8')).replaceAll('\r\n','\n');assert.equal(hash(Buffer.from(canonical)),record.sha256,record.file+' changed since build');}
  assert.ok(manifest.asset_inputs?.length,'Runtime asset provenance is required');
  for(const record of manifest.asset_inputs){const data=await readFile(path.resolve(root,record.file));assert.equal(data.length,record.bytes,record.file+' asset size');assert.equal(hash(data),record.sha256,record.file+' asset hash');}
  for(const record of manifest.outputs){const data=await readFile(path.join(root,'build',record.file));assert.equal(data.length,record.bytes,record.file+' output size');assert.equal(hash(data),record.sha256,record.file+' output hash');}
  return hash(bytes);
}
try{
  await mkdir(runDirectory,{recursive:true});
  temporary=await mkdtemp(path.join(output,'runtime-'));process.env.TEMP=temporary;process.env.TMP=temporary;
  const {chromium}=createRequire(import.meta.url)(process.env.BROGUE_PLAYWRIGHT||'playwright');
  host=await readFile(path.join(root,'web/host.js'),'utf8');assert.ok(host.includes(marker));module=await readFile(path.join(root,'build/game-check.js'),'utf8');
  result.provenance={artifacts:{},source_manifest_sha256:await verifyManifest('build-manifest-check.json',true),production_manifest_sha256:await verifyManifest('build-manifest.json',false)};
  for(const name of ['game-check.js','game-check.wasm','browser-ui.js','browser-ui.wasm'])result.provenance.artifacts[name]=hash(await readFile(path.join(root,'build',name)));
  result.suite_source_sha256=hash(await readFile(fileURLToPath(import.meta.url)));
  server=createPreviewServer({root});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({headless:true,...(process.env.BROGUE_BROWSER?{executablePath:process.env.BROGUE_BROWSER}:{})});
  await check('pc-color-stealth-language-roundtrips',['cmd.colors','cmd.stealth','cmd.language'],async()=>{
    const before=await state(),seen=[];
    for(const [command,message,field,value]of [['\\','Color effects disabled.','trueColorMode',1],['\\','Color effects enabled.','trueColorMode',0],[']','Stealth range displayed.','displayStealthRangeMode',1],[']','Stealth range hidden.','displayStealthRangeMode',0]]){await key(command);await text(message);await waitGame();assert.deepEqual(await state(),before);const observed=await features();assert.equal(observed[field],value);seen.push({command,message,observations:flags(observed)});}
    await key('F2');await text('隠密範囲を隠した');await waitGame();assert.deepEqual(await state(),before);await shot('pc-japanese');await key('F2');await text('Stealth range hidden.');await waitGame();assert.deepEqual(await state(),before);
    result.evidence.push({id:'pc-visual-settings',before,after:await state(),seen});
  },{assertions:['Original color/stealth messages toggle both ways and F2 changes EN→JA→EN; every step preserves seed, turn, substantive RNG, HP, position and depth.']});
  await check('touch-native-actions-menu-display-settings',['menu.actions','cmd.colors','cmd.stealth','cmd.language'],async()=>{
    const before=await state();await tapWord('Menu',{row:33,mobile:true});await page.locator('#choices button[data-key="92"]').waitFor({state:'visible'});assert.equal((await inspect()).kind,'menu');await shot('touch-actions-menu');
    for(const [code,message,field,value]of [[92,'Color effects disabled.','trueColorMode',1],[92,'Color effects enabled.','trueColorMode',0],[93,'Stealth range displayed.','displayStealthRangeMode',1],[93,'Stealth range hidden.','displayStealthRangeMode',0]]){await tap(`#choices button[data-key="${code}"]`);await text(message);assert.deepEqual(await state(),before);assert.equal((await features())[field],value);}
    await tap('#cancel');await waitGame();await tap('#commands button[data-key="2000"]');await text('隠密範囲を隠した');await waitGame();await tap('#commands button[data-key="2000"]');await text('Stealth range hidden.');await waitGame();assert.deepEqual(await state(),before);
  },{mobile:true,assertions:['Actual native canvas Menu is reached by touch pan and tap without game input during pan; its color/stealth actions and toolbar language control work both ways without a turn.']});
  await check('pc-long-search-completes-and-interrupts',['cmd.long_search','cmd.search'],async()=>{
    const before=await state();await key('Control+s');await waitGame();const complete=await state();assert.ok(complete.turn>before.turn+1);assert.ok(complete.turn<=before.turn+5);assert.equal(complete.hp,before.hp);await text('finish your detailed search');assert.equal((await features()).searching,0);assert.equal((await features()).automationActive,0);
    await reset();const first=(await inspect()).inputs.length;await page.keyboard.press('Control+s');await page.waitForFunction(()=>__command.pauses.some(pause=>!pause.resolved&&pause.milliseconds===80),null,{polling:1});await key('Escape');await waitGame();
    const stopped=await state();assert.ok(stopped.turn>=1&&stopped.turn<complete.turn);assert.equal((await inspect()).inputs.length,first+2);await key('.');await waitGame();assert.equal((await state()).turn,stopped.turn+1);
    assert.equal((await features()).automationActive,0);result.evidence.push({id:'long-search',complete,stopped,observations:flags(await features())});
  },{assertions:['Ctrl+s performs multiple search turns up to its native limit; Escape during the native 80ms pause interrupts earlier, is consumed once, and the following rest advances exactly one turn.']});
  await check('touch-control-search-retains-long-search-intent',['cmd.long_search','cmd.search'],async()=>{
    const before=await state();await page.locator('#control-key').tap();await tapWord('Search (s)',{row:33,mobile:true});await waitGame();assert.equal((await state()).turn,before.turn+1,'The native canvas Search button keeps its original single-search behavior');
    await reset(true);await page.locator('#control-key').tap();await tap('#commands button[data-key="115"]');await waitGame();const complete=await state();assert.deepEqual(complete,{seed:'42',turn:5,rng:24131,x:38,y:26,hp:30,depth:1,ended:0});await text('finish your detailed search');assert.equal((await features()).searching,0);assert.equal((await features()).automationActive,0);
    await page.locator('#control-key').tap();await tap('#commands button[data-key="115"]');await waitGame();assert.equal((await state()).turn,complete.turn+1);
    await reset(true);await page.locator('#control-key').tap();const count=(await inspect()).inputs.length,inventory=await page.locator('#commands button[data-key="105"]').boundingBox();await page.locator('#commands button[data-key="115"]').tap();await page.waitForFunction(()=>__command.pauses.some(pause=>!pause.resolved&&pause.milliseconds===80),null,{polling:1});
    await action(()=>page.touchscreen.tap(inventory.x+inventory.width/2,inventory.y+inventory.height/2));await waitKind('item');await tap('#cancel');await waitKind('command');const stopped=await state();assert.deepEqual(stopped,{seed:'42',turn:1,rng:24044,x:38,y:26,hp:30,depth:1,ended:0});
    assert.deepEqual((await inspect()).inputs.slice(count).map(event=>event[1]),[115,105,27]);await tap('#directions button[data-key="46"]');await waitGame();assert.equal((await state()).turn,stopped.turn+1);await shot('touch-long-search-after-interrupt');
    result.evidence.push({id:'touch-long-search',complete,stopped});
  },{mobile:true,assertions:['Original canvas Search remains single-turn. Rust Search with touch Ctrl matches PC five-turn/RNG state, Ctrl off searches once, and Inventory→Esc interrupts with the PC early-stop state before the next one-turn rest.']});
  await check('pc-held-search-repeat-and-keyup-consumption',['cmd.long_search','cmd.search'],async()=>{
    const count=(await inspect()).inputs.length;await page.keyboard.down('Control');await action(()=>page.keyboard.down('s'));await waitGame();assert.equal((await state()).turn,5);
    await action(()=>page.keyboard.down('s'));await waitGame();assert.equal((await state()).turn,10);await page.keyboard.up('s');await page.keyboard.up('Control');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal((await inspect()).inputs.length,count+2);
    assert.ok(await page.evaluate(()=>__command.dom.some(event=>event.key==='s'&&event.repeat&&event.control)));
    await key('.');await waitGame();assert.equal((await state()).turn,11);
  },{assertions:['Two Ctrl+s keydowns, including a browser repeat event, each finish one five-turn detailed search. Keyup adds no command, and the following rest adds one turn.']});
  await check('pc-normal-and-fast-explore-share-native-stop',['cmd.explore','cmd.fast_explore'],async()=>{
    const outcomes=[];
    for(const command of ['x','Control+x']){await key(command);await waitKind('cursor');const proposed=await state();assert.equal(proposed.turn,0);await key(command);await waitGame();const after=await state();assert.ok(after.turn>0);assert.equal((await features()).automationActive,0);outcomes.push(after);if(outcomes.length===1)await reset();}
    assert.deepEqual(outcomes[1],outcomes[0]);normalExplore=outcomes[0];result.evidence.push({id:'normal-fast-explore',outcomes});await shot('fast-explore-native-stop');
  },{assertions:['First explore key only proposes the known route; second starts exploration. Normal and Ctrl-fast exploration naturally stop with identical substantive state on seed42.']});
  await check('touch-fast-explore-reaches-same-stop',['cmd.fast_explore'],async()=>{
    await page.locator('#control-key').tap();await tap('#commands button[data-key="120"]');await waitKind('cursor');assert.equal((await state()).turn,0);await tap('#commands button[data-key="120"]');await waitGame();const after=await state();assert.ok(after.turn>0);if(normalExplore)assert.deepEqual(after,normalExplore);await shot('touch-fast-explore');
  },{mobile:true,assertions:['Touch Ctrl and two Explore taps preserve proposed-route versus committed exploration; resulting stop matches normal exploration when that comparison case runs.']});
  await check('pc-autopilot-confirm-cancel-and-interrupt',['cmd.autopilot','cmd.fast_autopilot'],async()=>{
    for(const command of ['A','Control+A']){
      const before=await state();await key(command);await waitKind('confirm');await key('n');await waitGame();assert.deepEqual(await state(),before);
      await key(command);await waitKind('confirm');await page.keyboard.press('y');await page.waitForFunction(()=>__command.pauses.some(pause=>!pause.resolved),null,{timeout:10000,polling:1});await key('Escape');await waitGame();const after=await state();assert.ok(after.turn>before.turn&&after.turn<before.turn+50);assert.equal(after.ended,0);assert.ok(after.hp>0);const observed=await features();assert.equal(observed.automationActive,0);assert.equal(observed.autoPlayingLevel,0);result.evidence.push({id:'autopilot-interrupt',command,before,after,observations:flags(observed)});await reset();
    }
  },{assertions:['Normal and Ctrl-fast autopilot both offer native confirmation; No preserves state, Yes starts real automation, and Escape interrupts while the game remains live. Timing-dependent turn counts are bounded, not claimed identical.']});
  await check('touch-native-actions-autopilot-keeps-original-modifiers',['cmd.autopilot','menu.actions'],async()=>{
    await page.locator('#control-key').tap();await tapWord('Menu',{row:33,mobile:true});await page.locator('#choices button[data-key="65"]').waitFor({state:'visible'});await tap('#choices button[data-key="65"]');await waitKind('confirm');
    const first=(await inspect()).pauses.length;await tap('#choices button[data-key="121"]');
    await page.waitForFunction(first=>__command.pauses.slice(first).some(pause=>pause.descriptor[0]===0),first,{timeout:10000,polling:1});
    const automation=(await inspect()).pauses.slice(first).find(pause=>pause.descriptor[0]===0);await tap('#commands button[data-key="105"]');await waitKind('item');await tap('#cancel');await waitKind('command');
    result.evidence.push({id:'touch-native-autopilot-delay',automation,state:await state()});await shot('touch-native-autopilot');assert.equal(automation.milliseconds,50,'Native Actions preserve the original unmodified normal-speed command');
  },{mobile:true,assertions:['Native Actions reset prior touch modifiers and preserve the original normal-speed 50ms autopilot command. Its existing inventory/cancel interruption stays live.']});
  await check('touch-rust-autopilot-normal-and-fast',['cmd.autopilot','cmd.fast_autopilot'],async()=>{
    for(const fast of [false,true]){
      const before=await state();if(fast)await page.locator('#control-key').tap();await tap('#commands button[data-key="65"]');await waitKind('confirm');await tap('#choices button[data-key="110"]');await waitGame();assert.deepEqual(await state(),before);
      if(fast)await page.locator('#control-key').tap();const count=(await inspect()).inputs.length;await tap('#commands button[data-key="65"]');await waitKind('confirm');const first=(await inspect()).pauses.length;await tap('#choices button[data-key="121"]');
      await page.waitForFunction(first=>__command.pauses.slice(first).some(pause=>pause.descriptor[0]===0),first,{timeout:10000,polling:1});const automation=(await inspect()).pauses.slice(first).find(pause=>pause.descriptor[0]===0);
      await tap('#commands button[data-key="105"]');await waitKind('item');await tap('#cancel');await waitKind('command');const stopped=await state();assert.equal(automation.milliseconds,fast?1:50);assert.ok(stopped.turn>0&&stopped.turn<50);assert.equal(stopped.ended,0);
      assert.deepEqual((await inspect()).inputs.slice(count).map(event=>event[1]),[65,121,105,27]);assert.equal((await features()).automationActive,0);assert.equal((await features()).autoPlayingLevel,0);
      await tap('#directions button[data-key="46"]');await waitGame();assert.equal((await state()).turn,stopped.turn+1);result.evidence.push({id:'touch-rust-autopilot',fast,automation,stopped});await shot(fast?'touch-fast-autopilot':'touch-normal-autopilot');await reset(true);
    }
  },{mobile:true,assertions:['The Rust A button uses original confirmation, No preserves state, and Yes selects 50ms normal or 1ms Ctrl-fast automation. Inventory→Esc consumes once, resets automation, and the next touch rest advances one turn.']});
  await check('pc-item-description-remove-equip-and-swap',['item.inspect_action','cmd.unequip','cmd.equip','cmd.swap'],async()=>{
    const before=await state();await details('b');await key('r');await waitGame();assert.equal((await features()).weapon,0);assert.equal((await state()).turn,before.turn+1);
    await details('b');await key('e');await waitGame();assert.equal((await features()).weapon,98);
    await details('c');await key('e');await waitGame();assert.equal((await features()).weapon,99);const swapped=await state();await key('w');await waitGame();assert.equal((await features()).weapon,98);assert.equal((await state()).turn,swapped.turn+1);await shot('native-item-details-equipment');
  },{assertions:['Item descriptions are reached from inventory, their own Remove/Equip actions change native equipment, and w restores the previous carried weapon with one turn.']});
  await check('touch-item-description-drop-and-next-turn',['item.inspect_action','cmd.drop'],async()=>{
    const before=await state();await tap('#commands button[data-key="105"]');await waitKind('item');await tap('#choices button[data-key="97"]');await text('hungry enough');await tap('#choices button[data-key="100"]');await waitGame();const after=await features();assert.equal(after.pack.some(item=>item.letter===97),false);assert.equal((await state()).turn,before.turn+1);await shot('touch-food-description-drop');await tap('#directions button[data-key="46"]');await waitGame();assert.equal((await state()).turn,before.turn+2);
  },{mobile:true,assertions:['Touch inventory→food description→Drop removes the carried food through its original item action; the next touch rest adds exactly one turn.']});
  for(const mobile of [false,true])await check((mobile?'touch':'pc')+'-sealed-exit-keeps-game-live',['ending.sealed','cmd.stairs'],async()=>{
    const start=await state();if(mobile)await tap('#directions button[data-key="106"]');else await key('j');await text('magically sealed');await waitGame();assert.deepEqual(await state(),start);
    if(mobile)await tap('#commands button[data-key="60"]');else await key('<');await waitKind('cursor');assert.deepEqual(await state(),start);
    if(mobile)await tap('#commands button[data-key="60"]');else await key('<');await text('magically sealed');await waitGame();assert.deepEqual(await state(),start);await shot((mobile?'touch':'pc')+'-sealed-exit');
    if((await inspect()).kind==='cursor'){if(mobile)await tap('#cancel');else await key('Escape');await waitKind('command');}
    if(mobile)await tap('#directions button[data-key="46"]');else await key('.');await waitGame();assert.equal((await state()).turn,start.turn+1);
  },{mobile,assertions:['Attempting to enter the already visible depth1 exit without Amulet is rejected before moving or consuming a turn; two ascent keys propose then confirm the route and remain sealed. Game stays at depth1 and the following rest works.']});
}catch(error){result.failures.push({id:'fatal',error:error.stack});console.error(error);}
finally{
  async function cleanup(name,fn){try{await fn();}catch(error){result.failures.push({id:'cleanup-'+name,error:error.stack});}}
  await cleanup('context',()=>context?.close());await cleanup('browser',()=>browser?.close());await cleanup('server',async()=>{if(server?.listening)await new Promise(resolve=>server.close(resolve));});
  for(const [name,value]of Object.entries(oldTemp))if(value===undefined)delete process.env[name];else process.env[name]=value;
  await cleanup('temporary',async()=>{if(temporary){const resolved=await realpath(temporary),parent=await realpath(output);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('runtime-'));await rm(resolved,{recursive:true,force:true});}});
  if(!result.cases.length)result.failures.push({id:'selection',error:'No command cases ran'});
  if(result.errors.length)result.failures.push({id:'runtime',error:result.errors.join('\n')});result.status=result.failures.length?'fail':'pass';
  await mkdir(runDirectory,{recursive:true});const bytes=JSON.stringify(result,null,2)+'\n';await writeFile(path.join(runDirectory,'results.json'),bytes);await writeFile(path.join(output,'results.json'),bytes);
}
if(result.failures.length)process.exitCode=1;
