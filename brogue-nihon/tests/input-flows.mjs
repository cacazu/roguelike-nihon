// Exercise physical browser events against Brogue's original C input owners.
// The observation adapter is routed only in these pages, never in production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile,mkdtemp,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from '../../tools/server.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const output=path.join(root,'.local/feature-verification/input');
const previousTemp={TEMP:process.env.TEMP,TMP:process.env.TMP};
const marker='  game.callMain(Array.from(arguments_));';
const adapter=`
  const observation=globalThis.__inputTest={module:game,serial:0,waiting:false,descriptor:[],inputs:[],cells:[],dom:[],pauses:[]};
  const event=globalThis.brogueHost.event;
  globalThis.brogueHost.event=(...args)=>{
    observation.serial++;observation.waiting=true;observation.descriptor=Array.from(args[2]);
    return event(...args).then(value=>{observation.inputs.push(Array.from(value));observation.waiting=false;return value;});
  };
  const frame=globalThis.brogueHost.frame;
  globalThis.brogueHost.frame=cells=>{observation.cells=Array.from(cells);return frame(cells);};
  const pause=globalThis.brogueHost.pause;
  globalThis.brogueHost.pause=(...args)=>{
    const record={milliseconds:args[0],mouse:args[1],descriptor:Array.from(args[2]),resolved:false};observation.pauses.push(record);
    return pause(...args).then(value=>{record.resolved=true;record.interrupted=value;return value;});
  };
  const capture=globalThis.brogueHost.screenshot;
  globalThis.brogueHost.screenshot=()=>{observation.screenshot=document.querySelector('#game').toDataURL('image/png');return capture();};
  for(const name of ['pointerdown','pointerup','pointercancel','click','keydown'])document.addEventListener(name,e=>{
    observation.dom.push({type:name,target:e.target.id,key:e.key,code:e.code,button:e.button,repeat:e.repeat});
  },true);
`;
const result={run_id:new Date().toISOString(),checks:[],failures:[],errors:[],screenshots:[],evidence:[],cases:[],scope:'Input/UI audit; no victory or complete rules coverage claim'};
const filter=process.argv.slice(2).join(' ');
let browser,activePage,temporary,server,base,host,checkModule;
const featureIds={
  'movement-arrow-digit-vi-and-modifiers':['cmd.move','cmd.run'],
  'numpad-modified-numlock-off':['cmd.move'],
  'right-click-retains-original-inventory':['cmd.inventory'],
  'target-digit-shift-movement-and-shift-tab':['target.select','cmd.throw'],
  'help-strict-ack-and-any-key-screens':['cmd.help','cmd.discoveries','cmd.feats','dialog.ack_confirm'],
  'focused-text-escape-and-charset':['text.edit','cmd.save'],
  'item-inscription-replaces-default-and-cancels':['cmd.call','text.edit'],
  'relabel-letter-selection-is-a-modal':['cmd.relabel'],
  'graphics-key-cycles-without-game-input':['cmd.graphics'],
  'zoom-focus-and-fullscreen-keep-game-state':['cmd.graphics','fullscreen'],
  'additional-zoom-at-fit-boundaries-keeps-direction':['cmd.graphics'],
  'additional-mouse-hover-reaches-c-without-a-turn':['cursor.inspect'],
  'screenshot-download-is-current-canvas-png':['cmd.screenshot','screenshot'],
  'repeat-keydown-and-keyup-do-not-duplicate-input':['cmd.rest'],
  'queued-key-survives-animation-to-ack-transition':['dialog.ack_confirm','ending.quit'],
  'message-archive-context-scroll-and-cancel':['cmd.messages'],
  'cursor-touch-confirmation-is-offered':['cmd.cursor','cmd.explore','cursor.travel'],
  'reload-discards-unfinished-pointer-and-modal-input':['cmd.inventory','cmd.rest'],
  'mobile-pan-pointercancel-and-following-tap':['cmd.inventory'],
  'touch-modifiers-and-screenshot-reach-original-input':['cmd.move','cmd.run','cmd.screenshot','screenshot'],
  'hover-does-not-interrupt-default-auto-rest-pauses':['cmd.auto_rest','cursor.inspect'],
};
async function state(page){return page.evaluate(()=>{const game=__inputTest.module;return JSON.parse(game.UTF8ToString(game._brogue_check_snapshot()));});}
async function features(page){return page.evaluate(()=>{const game=__inputTest.module;return JSON.parse(game.UTF8ToString(game._brogue_check_features()));});}
async function observation(page){return page.evaluate(()=>({serial:__inputTest.serial,waiting:__inputTest.waiting,descriptor:__inputTest.descriptor,inputs:__inputTest.inputs,dom:__inputTest.dom,pauses:__inputTest.pauses,kind:document.querySelector('#game').dataset.waitKind}));}
async function wait(page,kind='command'){await page.waitForFunction(kind=>globalThis.__inputTest?.waiting&&document.querySelector('#game').dataset.waitKind===kind,kind,{timeout:20000});}
async function input(page,action,{timeout=3000}={}){
  const previous=(await observation(page)).inputs.length;
  await action();
  await page.waitForFunction(previous=>__inputTest.inputs.length>previous,previous,{timeout});
  await page.waitForFunction(()=>__inputTest.waiting,null,{timeout:15000});
  return (await observation(page)).inputs.slice(previous);
}
async function key(page,value,options){return input(page,()=>page.keyboard.press(value),options);}
async function shot(page,name){const filename=name+'.png';await page.screenshot({path:path.join(output,filename),fullPage:true});result.screenshots.push(filename);}
async function open({mobile=false,query='?seed=42&lang=ja'}={}){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1240,height:900},isMobile:mobile,hasTouch:true,acceptDownloads:true});
  await context.route('**/build/game.js',route=>route.fulfill({body:checkModule,contentType:'text/javascript'}));
  await context.route('**/web/host.js',route=>route.fulfill({body:host.replace(marker,adapter+marker),contentType:'text/javascript'}));
  const page=activePage=await context.newPage();
  page.on('pageerror',error=>result.errors.push(error.message));
  await page.goto(base+query);await wait(page);return {page,context};
}
async function check(name,fn,{mobile=false}={}){
  if(filter&&!name.includes(filter))return;
  const record={id:name,feature_ids:featureIds[name]||[],status:'fail',method:'automated_browser',fixture:false,variant:'brogue',input_path:mobile?'touch':'pc-keyboard',coverage:'partial',assertions:[name],evidence:['brogue-nihon/.local/feature-verification/input/results.json']};
  result.cases.push(record);
  assert.ok(record.feature_ids.length,'Every case must map to explicit feature IDs');
  const {page,context}=await open({mobile});
  try{await fn(page,context);record.status='pass';result.checks.push(name);console.log('PASS '+name);}
  catch(error){result.failures.push({name,error:error.message,observation:await observation(page).catch(()=>null),state:await state(page).catch(()=>null)});await shot(page,name+'-failure').catch(()=>{});console.log('FAIL '+name+': '+error.message.split('\n')[0]);}
  finally{await context.close();}
}
async function enterTarget(page){
  await key(page,'t');await wait(page,'item');
  await key(page,'b');
  if((await observation(page)).kind==='confirm')await key(page,'y');
  await wait(page,'target');
}
async function pan(context,page){
  const box=await page.locator('#viewport').boundingBox();const x=box.x+box.width*.25,y=box.y+Math.min(100,box.height*.4);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+step*20,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await page.evaluate(async()=>{const viewport=document.querySelector('#viewport');let previous=viewport.scrollLeft,stable=0;for(let frame=0;frame<240&&stable<8;frame++){await new Promise(resolve=>requestAnimationFrame(resolve));const current=viewport.scrollLeft;stable=current===previous?stable+1:0;previous=current;}});
}
try{
  await mkdir(output,{recursive:true});
  temporary=await mkdtemp(path.join(output,'runtime-'));
  process.env.TEMP=temporary;process.env.TMP=temporary;
  const {chromium}=require(process.env.BROGUE_PLAYWRIGHT||'playwright');
  server=createPreviewServer({root});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  base=`http://127.0.0.1:${server.address().port}/`;
  host=await readFile(path.join(root,'web/host.js'),'utf8');
  checkModule=await readFile(path.join(root,'build/game-check.js'),'utf8');
  assert.ok(host.includes(marker),'Bootstrap signature changed; update test observation adapter.');
  browser=await chromium.launch({headless:true,...(process.env.BROGUE_BROWSER?{executablePath:process.env.BROGUE_BROWSER}:{})});
  await check('movement-arrow-digit-vi-and-modifiers',async page=>{
    const start=await state(page);
    assert.deepEqual((await key(page,'ArrowRight')).at(-1),[0,63235,0,0,0]);
    const moved=await state(page);assert.equal(moved.x,start.x+1);assert.ok(moved.turn>start.turn);
    assert.deepEqual((await key(page,'4')).at(-1),[0,52,0,0,0]);assert.equal((await state(page)).x,start.x);
    assert.deepEqual((await key(page,'Control+l')).at(-1),[0,108,0,1,0]);
    assert.deepEqual((await key(page,'Shift+H')).at(-1),[0,72,0,0,1]);
    result.evidence.push({name:'movement',start,end:await state(page)});
  });
  await check('numpad-modified-numlock-off',async(page,context)=>{
    const cdp=await context.newCDPSession(page);
    const events=await input(page,async()=>{
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'Numpad1',windowsVirtualKeyCode:35,nativeVirtualKeyCode:97,location:3,modifiers:2});
      await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'Numpad1',windowsVirtualKeyCode:35,nativeVirtualKeyCode:97,location:3,modifiers:0});
    });await cdp.detach();assert.deepEqual(events.at(-1),[0,49,0,1,0]);
  });
  await check('right-click-retains-original-inventory',async page=>{
    const before=await state(page),box=await page.locator('#game').boundingBox();
    await input(page,()=>page.mouse.click(box.x+box.width*.55,box.y+box.height*.5,{button:'right'}));
    await wait(page,'item');assert.deepEqual(await state(page),before);await key(page,'Escape');await wait(page,'cursor');
    assert.deepEqual((await observation(page)).inputs.map(event=>event[0]),[5,3,4,0]);
    assert.deepEqual(await state(page),before);
    await key(page,'Escape');await wait(page);await key(page,'.');assert.equal((await state(page)).turn,before.turn+1);
    result.evidence.push({name:'right-click-events',events:(await observation(page)).inputs});await shot(page,'right-click-inventory-closed');
  });
  await check('target-digit-shift-movement-and-shift-tab',async page=>{
    await enterTarget(page);const before=await state(page);
    assert.equal((await key(page,'6')).at(-1)[1],54);
    assert.deepEqual((await key(page,'Shift+L')).at(-1),[0,76,0,0,1]);
    assert.deepEqual((await key(page,'Shift+Tab')).at(-1),[0,25,0,0,1]);
    await key(page,'Escape');await wait(page);assert.deepEqual(await state(page),before);
  });
  await check('help-strict-ack-and-any-key-screens',async page=>{
    const before=await state(page);await key(page,'?');await shot(page,'help');
    const count=(await observation(page)).inputs.length;await page.keyboard.press('Enter');
    assert.equal((await observation(page)).inputs.length,count);assert.equal((await observation(page)).kind,'acknowledge');
    await key(page,'Space');await wait(page);assert.deepEqual(await state(page),before);
    for(const command of ['D','F']){await key(page,command);assert.equal((await observation(page)).kind,'anykey');await key(page,'Enter');await wait(page);assert.deepEqual(await state(page),before);}
  });
  await check('focused-text-escape-and-charset',async page=>{
    const before=await state(page);await key(page,'S');await wait(page,'confirm');await key(page,'y');await wait(page,'text');
    await page.locator('#text-value').fill('input-audit');await page.locator('#text-value').focus();
    await key(page,'Escape');await wait(page);assert.deepEqual(await state(page),before);
  });
  await check('item-inscription-replaces-default-and-cancels',async page=>{
    const before=await state(page);await key(page,'c');await wait(page,'item');await key(page,'b');await wait(page,'text');
    await page.locator('#text-value').fill('Blade One');await input(page,()=>page.locator('#text-entry button[type=submit]').click());await wait(page);
    assert.equal((await features(page)).pack.find(item=>item.letter===98).inscription,'Blade One');
    await key(page,'c');await key(page,'b');await wait(page,'text');
    await page.locator('#text-value').fill('Blade Two');await input(page,()=>page.locator('#text-entry button[type=submit]').click());await wait(page);
    assert.equal((await features(page)).pack.find(item=>item.letter===98).inscription,'Blade Two');
    await key(page,'c');await key(page,'b');await wait(page,'text');
    const count=(await observation(page)).inputs.length;await page.locator('#text-value').fill('日本語');await page.locator('#text-entry button[type=submit]').click();
    assert.equal((await observation(page)).inputs.length,count);assert.equal((await observation(page)).kind,'text');
    assert.ok(await page.locator('#status').textContent());await page.locator('#text-value').focus();await key(page,'Escape');await wait(page);
    assert.equal((await features(page)).pack.find(item=>item.letter===98).inscription,'Blade Two');assert.deepEqual(await state(page),before);
    await shot(page,'inscription-after-cancel');
  });
  await check('relabel-letter-selection-is-a-modal',async page=>{
    const before=await state(page);await key(page,'R');await wait(page,'item');await key(page,'b');
    assert.equal((await observation(page)).kind,'anykey');assert.equal(await page.locator('#commands').isVisible(),false);
    assert.ok(await page.locator('#choices button[data-key="122"]').isVisible());
    await key(page,'z');await wait(page);assert.ok((await features(page)).pack.some(item=>item.letter===122));
    assert.deepEqual(await state(page),before);await shot(page,'relabel-complete');
  });
  await check('graphics-key-cycles-without-game-input',async page=>{
    const before=await state(page),inputs=(await observation(page)).inputs.length;
    for(const mode of ['dot','illustration','original']){await page.keyboard.press('G');await page.waitForFunction(mode=>document.querySelector('#game').dataset.displayMode===mode,mode,{timeout:3000});assert.deepEqual(await state(page),before);}
    assert.equal((await observation(page)).inputs.length,inputs);await shot(page,'graphics-key-original');
  });
  await check('zoom-focus-and-fullscreen-keep-game-state',async page=>{
    const before=await state(page),inputs=(await observation(page)).inputs.length;
    const width=await page.locator('#game').evaluate(canvas=>canvas.width);
    await page.keyboard.press('PageUp');assert.ok(await page.locator('#game').evaluate(canvas=>canvas.width)>width);
    await page.keyboard.press('PageDown');
    await page.locator('#display-mode').selectOption('dot');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'game');
    await page.keyboard.press('Alt+Enter');await page.waitForFunction(()=>document.fullscreenElement!==null);
    assert.deepEqual(await state(page),before);assert.equal((await observation(page)).inputs.length,inputs);
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement===null);
    assert.deepEqual(await state(page),before);await key(page,'i');await wait(page,'item');await key(page,'Escape');
  });
  await check('additional-zoom-at-fit-boundaries-keeps-direction',async page=>{
    const before=await state(page);
    await page.setViewportSize({width:390,height:844});await page.locator('#zoom').selectOption('fit');
    const small=await page.locator('#game').evaluate(canvas=>canvas.width);await page.keyboard.press('PageDown');
    assert.ok(await page.locator('#game').evaluate(canvas=>canvas.width)<=small,'Zoom out enlarged a fitted narrow viewport');
    await page.setViewportSize({width:3800,height:2200});await page.locator('#zoom').selectOption('fit');
    const large=await page.locator('#game').evaluate(canvas=>canvas.width);await page.keyboard.press('PageUp');
    assert.ok(await page.locator('#game').evaluate(canvas=>canvas.width)>=large,'Zoom in shrank a fitted large viewport');
    assert.deepEqual(await state(page),before);
  });
  await check('additional-mouse-hover-reaches-c-without-a-turn',async page=>{
    const before=await state(page),box=await page.locator('#game').boundingBox();
    const events=await input(page,()=>page.mouse.move(box.x+box.width*.55,box.y+box.height*.4));
    assert.equal(events.at(-1)[0],5);assert.deepEqual(await state(page),before);
    await shot(page,'mouse-hover');
  });
  await check('screenshot-download-is-current-canvas-png',async page=>{
    const before=await state(page);
    const downloadPromise=page.waitForEvent('download',{timeout:5000});await page.keyboard.press(',');
    const download=await downloadPromise;assert.match(download.suggestedFilename(),/^Brogue-.*\.png$/);
    const saved=path.join(output,'screenshot-download.png');await download.saveAs(saved);
    const png=await page.evaluate(()=>__inputTest.screenshot);assert.deepEqual(await readFile(saved),Buffer.from(png.split(',')[1],'base64'));
    await wait(page);assert.deepEqual(await state(page),before);
  });
  await check('repeat-keydown-and-keyup-do-not-duplicate-input',async page=>{
    const before=await state(page),count=(await observation(page)).inputs.length;
    await input(page,()=>page.keyboard.down('5'));await input(page,()=>page.keyboard.down('5'));await page.keyboard.up('5');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal((await observation(page)).inputs.length,count+2);assert.equal((await state(page)).turn,before.turn+2);
    assert.ok((await observation(page)).dom.some(event=>event.type==='keydown'&&event.repeat));
  });
  await check('queued-key-survives-animation-to-ack-transition',async page=>{
    await key(page,'.');await key(page,'Q');await wait(page,'confirm');
    const count=(await observation(page)).inputs.length;
    await page.keyboard.press('y');
    await page.waitForFunction(()=>__inputTest.pauses.some(pause=>!pause.resolved),null,{timeout:5000,polling:1});
    await page.keyboard.press('Space');
    await page.waitForFunction(count=>__inputTest.inputs.length>=count+2,count,{timeout:5000});
    const events=(await observation(page)).inputs.slice(count);assert.equal(events[1][1],32);
    result.evidence.push({name:'animation-to-ack',events,pauses:await page.evaluate(()=>__inputTest.pauses)});
    await shot(page,'queued-animation-key');
  });
  await check('message-archive-context-scroll-and-cancel',async page=>{
    const before=await state(page);for(const command of ['\\',']','\\',']','~'])await key(page,command);
    await key(page,'M');await wait(page,'menu');assert.equal(await page.locator('#commands').isVisible(),false);
    await key(page,'Control+ArrowUp');await key(page,'Shift+ArrowDown');await shot(page,'message-archive');
    await key(page,'Escape');await wait(page);assert.deepEqual(await state(page),before);
  });
  await check('cursor-touch-confirmation-is-offered',async page=>{
    const before=await state(page);await key(page,'Enter');await wait(page,'cursor');
    assert.ok(await page.locator('#submit').isVisible());await key(page,'ArrowRight');assert.deepEqual(await state(page),before);
    await key(page,'Escape');await wait(page);assert.deepEqual(await state(page),before);
    await key(page,'x');await wait(page,'cursor');assert.ok(await page.locator('#submit').isVisible());await key(page,'Escape');await wait(page);assert.deepEqual(await state(page),before);
  });
  await check('reload-discards-unfinished-pointer-and-modal-input',async(page,context)=>{
    const before=await state(page);await key(page,'i');await wait(page,'item');
    const box=await page.locator('#game').boundingBox();const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:Math.max(30,box.x+200),y:box.y+80,id:1}]});
    await page.reload();await wait(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    assert.equal((await observation(page)).inputs.length,0);assert.deepEqual(await state(page),before);
    await key(page,'.');assert.equal((await state(page)).turn,before.turn+1);
  });
  await check('mobile-pan-pointercancel-and-following-tap',async(page,context)=>{
    await input(page,()=>page.locator('#commands button[data-key="105"]').tap());await wait(page,'item');
    const before=await state(page),length=(await observation(page)).inputs.length;
    await pan(context,page);assert.deepEqual(await state(page),before);assert.equal((await observation(page)).inputs.length,length);
    await input(page,()=>page.locator('#cancel').tap());await wait(page);assert.deepEqual(await state(page),before);
    await shot(page,'mobile-pan-cancel');
  },{mobile:true});
  await check('touch-modifiers-and-screenshot-reach-original-input',async page=>{
    await page.locator('#control-key').tap();assert.equal(await page.locator('#control-key').getAttribute('aria-pressed'),'true');
    assert.deepEqual((await input(page,()=>page.locator('#directions button[data-key="108"]').tap())).at(-1),[0,108,0,1,0]);
    await page.locator('#control-key').tap();await page.locator('#shift-key').tap();
    assert.deepEqual((await input(page,()=>page.locator('#directions button[data-key="104"]').tap())).at(-1),[0,72,0,0,1]);
    await page.locator('#shift-key').tap();const before=await state(page);
    const downloadPromise=page.waitForEvent('download',{timeout:5000});
    await page.locator('#commands button[data-key="44"]').tap();const download=await downloadPromise;
    assert.match(download.suggestedFilename(),/^Brogue-.*\.png$/);await wait(page);assert.deepEqual(await state(page),before);
    await input(page,()=>page.locator('#commands button[data-key="105"]').tap());await wait(page,'item');
    assert.equal(await page.locator('#modifiers').isVisible(),false);await input(page,()=>page.locator('#cancel').tap());
    assert.equal(await page.locator('#control-key').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#shift-key').getAttribute('aria-pressed'),'false');await shot(page,'mobile-modifiers-screenshot');
  },{mobile:true});
  await check('hover-does-not-interrupt-default-auto-rest-pauses',async page=>{
    await key(page,'Z');const baseline=await state(page);
    await page.reload();await wait(page);
    await page.keyboard.press('Z');
    await page.waitForFunction(()=>__inputTest.pauses.some(pause=>!pause.mouse&&!pause.resolved),null,{timeout:5000,polling:1});
    const box=await page.locator('#game').boundingBox();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.4);
    await page.waitForFunction(()=>__inputTest.inputs.some(event=>event[0]===5)&&__inputTest.waiting,null,{timeout:15000});
    assert.deepEqual(await state(page),baseline);
    const pauses=await page.evaluate(()=>__inputTest.pauses);assert.ok(pauses.some(pause=>!pause.mouse&&pause.resolved));
    assert.equal(pauses.some(pause=>!pause.mouse&&pause.interrupted),false,'Hover interrupted a pause that explicitly ignores mouse movement');
    result.evidence.push({name:'hover-during-auto-rest',baseline,withHover:await state(page),pauses});
  });
}catch(error){
  result.failures.push({name:'fatal',error:error.message,stack:error.stack});
  if(activePage&&!activePage.isClosed())await shot(activePage,'fatal-failure').catch(()=>{});
  console.error(error);
}finally{
  if(result.checks.length+result.failures.length===0)result.failures.push({name:'selection',error:'No input audit cases matched the filter'});
  if(result.errors.length)result.failures.push({name:'runtime',error:result.errors.join('\n')});
  result.status=result.failures.length?'fail':'pass';
  result.artifacts={};for(const filename of ['game-check.js','game-check.wasm','browser-ui.js','browser-ui.wasm'])try{result.artifacts[filename]=createHash('sha256').update(await readFile(path.join(root,'build',filename))).digest('hex');}catch(error){result.status='fail';result.failures.push({name:'artifact',error:error.message});}
  await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
  await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  for(const [name,value] of Object.entries(previousTemp)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  if(temporary){const resolved=await realpath(temporary),parent=await realpath(output);
  assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('runtime-'));await rm(resolved,{recursive:true,force:true});}
}
if(result.failures.length)process.exitCode=1;
