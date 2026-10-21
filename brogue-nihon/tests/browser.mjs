// Real browser input against the original C game. Check-only state is injected by
// routing separate artifacts; the production host and UI contain no test hooks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile, mkdtemp, realpath, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from '../../tools/server.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BROGUE_PLAYWRIGHT || 'playwright');
const output=path.join(root,'.local','browser-verification');
await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(output,'runtime-'));
const oldTemp={TEMP:process.env.TEMP,TMP:process.env.TMP};
process.env.TEMP=temporary;process.env.TMP=temporary;
const server=createPreviewServer({root});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`;
const checkModule=await readFile(path.join(root,'build/game-check.js'),'utf8');
const productionHost=await readFile(path.join(root,'web/host.js'),'utf8');
const marker='  game.callMain(Array.from(arguments_));';
assert.ok(productionHost.includes(marker),'Production bootstrap signature changed; update the observation adapter.');
const observation=`
  const observation = globalThis.__brogueTest = {module:game,waitSerial:0,waiting:false,frameSerial:0,descriptor:[],cells:[]};
  const event = globalThis.brogueHost.event;
  globalThis.brogueHost.event = (...args) => {
    observation.waitSerial++;observation.waiting=true;observation.descriptor=Array.from(args[2]);
    return event(...args).then(value=>{observation.waiting=false;return value;});
  };
  const frame = globalThis.brogueHost.frame;
  globalThis.brogueHost.frame = cells => {observation.frameSerial++;observation.cells=Array.from(cells);return frame(cells);};
`;
const evidence={checks:[],screenshots:[],errors:[],states:[]};
let browser,activePage;
async function check(label,fn){await fn();evidence.checks.push(label);console.log('PASS '+label);}
async function observe(page){return page.evaluate(()=>({serial:__brogueTest.waitSerial,waiting:__brogueTest.waiting,descriptor:__brogueTest.descriptor,kind:document.querySelector('#game')?.dataset.waitKind}));}
async function state(page){return page.evaluate(()=>{const game=__brogueTest.module;return JSON.parse(game.UTF8ToString(game._brogue_check_snapshot()));});}
async function wait(page,kind){await page.waitForFunction(kind=>globalThis.__brogueTest?.waiting&&(!kind||document.querySelector('#game')?.dataset.waitKind===kind),kind,{timeout:60000});}
async function key(page,value){const before=(await observe(page)).serial;await page.keyboard.press(value);await page.waitForFunction(before=>__brogueTest.waiting&&__brogueTest.waitSerial>before,before,{timeout:30000});}
async function tap(page,selector){const before=(await observe(page)).serial;await page.locator(selector).tap();await page.waitForFunction(before=>__brogueTest.waiting&&__brogueTest.waitSerial>before,before,{timeout:30000});}
async function close(page){for(let i=0;i<5;i++){await wait(page);if((await observe(page)).kind==='command')return;await key(page,'Escape');}throw Error('Failed to return to command wait');}
async function shot(page,name){const filename=name+'.png';await page.screenshot({path:path.join(output,filename),fullPage:true});evidence.screenshots.push(filename);}
async function panRight(context,page){
  const box=await page.locator('#viewport').boundingBox();assert.ok(box);
  const x=box.x+box.width*.3,y=box.y+Math.min(box.height/2,120);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+step*20,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await page.evaluate(async()=>{
    const viewport=document.querySelector('#viewport');let previous=viewport.scrollLeft,stable=0;
    // Native touch scrolling can continue after touchEnd. A tap during a fling
    // stops that browser gesture; wait for it to settle before testing a button.
    for(let frame=0;frame<240&&stable<8;frame++){
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const current=viewport.scrollLeft;stable=current===previous?stable+1:0;previous=current;
    }
  });
}
async function open(context,query='?seed=42&lang=ja',ready='command'){
  await context.route('**/build/game.js',route=>route.fulfill({body:checkModule,contentType:'text/javascript'}));
  await context.route('**/web/host.js',route=>route.fulfill({body:productionHost.replace(marker,observation+marker),contentType:'text/javascript'}));
  const page=activePage=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')evidence.errors.push(message.text());});
  await page.goto(base+query);if(ready)await wait(page,ready);return page;
}
try {
  browser=await chromium.launch({headless:true,...(process.env.BROGUE_BROWSER?{executablePath:process.env.BROGUE_BROWSER}:{})});
  for(const [label,viewport] of [['desktop',{width:1240,height:900}],['phone',{width:390,height:844}]]){
    const context=await browser.newContext({viewport,isMobile:label==='phone',hasTouch:true});
    const title=await open(context,'?lang=ja',null);
    await check(label+' default title starts a new game by touch',async()=>{
      await title.locator('#choices button[data-key="110"]').waitFor({state:'visible',timeout:60000});
      await shot(title,label+'-title');await tap(title,'#choices button[data-key="110"]');
      await wait(title,'command');assert.equal((await state(title)).depth,1);
    });
    await context.close();
  }
  const desktop=await browser.newContext({viewport:{width:1240,height:900},hasTouch:true});
  const page=await open(desktop);
  await check('fixed seed42 starts original C game',async()=>{const value=await state(page);assert.equal(value.seed,'42');assert.equal(value.depth,1);assert.ok(value.hp>0);evidence.states.push({start:value});});
  await check('keyboard movement and wait advance real turns',async()=>{
    const before=await state(page);await key(page,'ArrowRight');const moved=await state(page);
    assert.ok(moved.turn>before.turn);assert.equal(moved.x,before.x+1);assert.equal(moved.y,before.y);
    await key(page,'.');const after=await state(page);assert.ok(after.turn>moved.turn);assert.ok(after.rng>before.rng);
  });
  await check('inventory opens and cancels back to commands',async()=>{const before=await state(page);await key(page,'i');assert.equal((await observe(page)).kind,'item');await shot(page,'desktop-inventory');await close(page);assert.equal((await state(page)).turn,before.turn);});
  await check('item selection and targeting cancel safely',async()=>{
    const before=await state(page);await key(page,'t');assert.equal((await observe(page)).kind,'item');
    const candidate=(await observe(page)).descriptor.slice(4).find(code=>code>=97&&code<=122);
    assert.ok(candidate,'No public item candidate');await key(page,String.fromCharCode(candidate));
    if((await observe(page)).kind==='confirm')await key(page,'y');
    assert.equal((await observe(page)).kind,'target');await close(page);assert.equal((await state(page)).turn,before.turn);
  });
  await check('three display modes and zoom/resize preserve C state',async()=>{
    const before=await state(page),images=[];
    for(const mode of ['original','dot','illustration']){
      await page.locator('#display-mode').selectOption(mode);
      await page.waitForFunction(mode=>document.querySelector('#game').dataset.displayMode===mode,mode);
      const bytes=await page.locator('#game').screenshot();images.push(createHash('sha256').update(bytes).digest('hex'));
      await shot(page,'desktop-'+mode);assert.deepEqual(await state(page),before);
    }
    assert.equal(new Set(images).size,3,'Three modes rendered the same pixels');
    await page.locator('#zoom').selectOption('18');await page.setViewportSize({width:1100,height:780});
    assert.deepEqual(await state(page),before);
  });
  await check('save confirmation, text input, fresh instance restore and next turn',async()=>{
    const before=await state(page);await key(page,'S');
    let context=await observe(page);
    if(context.kind==='confirm'){const yes=context.descriptor.slice(4).includes(121)?'y':'Enter';await key(page,yes);context=await observe(page);}
    let name;
    if(context.kind==='text'){
      await page.locator('#text-value').fill('browser-check');
      const serial=context.serial;await page.locator('#text-entry button[type=submit]').click();
      await page.waitForFunction(serial=>__brogueTest.waiting&&__brogueTest.waitSerial>serial,serial);
      name='browser-check.broguesave';
    }
    if((await observe(page)).kind==='acknowledge'){
      await page.keyboard.press('Space');
      await page.waitForFunction(()=>document.querySelector('#game').dataset.waitKind==='title');
    }
    // Saving returns to the original menu. Persisted files are the original C
    // serializer output; the fresh page initializes a new Wasm instance.
    await page.waitForFunction(()=>document.querySelectorAll('#save-files option').length>0,{timeout:30000});
    if(name)await page.waitForFunction(name=>Array.from(document.querySelectorAll('#save-files option')).some(option=>option.value===name),name);
    else name=await page.locator('#save-files option').first().getAttribute('value');
    assert.ok(name?.endsWith('.broguesave'));await shot(page,'desktop-saved');
    await page.goto(base+'?load='+encodeURIComponent(name)+'&lang=ja');await wait(page,'command');
    const after=await state(page);for(const field of ['seed','turn','rng','x','y','hp','depth'])assert.equal(after[field],before[field],field);
    await key(page,'.');assert.ok((await state(page)).turn>after.turn);evidence.states.push({restored:after});
  });
  await desktop.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const phone=await open(mobile);
  await check('phone touch inventory, direction pad and three modes',async()=>{
    await tap(phone,'#commands button[data-key="105"]');assert.equal((await observe(phone)).kind,'item');
    await shot(phone,'mobile-inventory');
    const beforePan=await state(phone),left=await phone.locator('#viewport').evaluate(element=>element.scrollLeft);
    assert.ok(left>0,'Inventory was not brought into view');await panRight(mobile,phone);
    assert.ok(await phone.locator('#viewport').evaluate(element=>element.scrollLeft)<left,'Touch pan did not reveal the rest of the original window');
    assert.deepEqual(await state(phone),beforePan,'Panning a modal sent game input');
    await shot(phone,'mobile-inventory-panned');await tap(phone,'#cancel');await wait(phone,'command');
    const before=await state(phone);await tap(phone,'#directions button[data-key="108"]');
    const moved=await state(phone);assert.ok(moved.turn>before.turn);assert.equal(moved.x,before.x+1);assert.equal(moved.y,before.y);
    for(const mode of ['original','dot','illustration']){const before=await state(phone);await phone.locator('#display-mode').selectOption(mode);await shot(phone,'mobile-'+mode);assert.deepEqual(await state(phone),before);}
    const layout=await phone.evaluate(()=>({body:document.documentElement.scrollWidth,width:innerWidth,canvas:document.querySelector('#game').width,viewport:document.querySelector('#viewport').clientWidth}));
    assert.ok(layout.body<=layout.width,'Page overflows horizontally');assert.ok(layout.canvas>layout.viewport,'Readable mobile grid must be scrollable');
  });
  await check('landscape viewport retains touch operation',async()=>{
    await phone.setViewportSize({width:844,height:390});await shot(phone,'mobile-landscape');
    const before=await state(phone);await tap(phone,'#directions button[data-key="46"]');assert.ok((await state(phone)).turn>before.turn);
  });
  await mobile.close();
  assert.deepEqual(evidence.errors,[],'Browser runtime errors');evidence.result='pass';
} catch(error) {
  evidence.result='fail';evidence.failure={message:error.message,stack:error.stack};
  if(activePage&&!activePage.isClosed())await shot(activePage,'failure').catch(()=>{});
  throw error;
} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  for(const [key,value] of Object.entries(oldTemp))if(value===undefined)delete process.env[key];else process.env[key]=value;
  await writeFile(path.join(output,'results.json'),JSON.stringify(evidence,null,2)+'\n');
  const resolvedTemp=await realpath(temporary),resolvedOutput=await realpath(output);
  assert.equal(path.dirname(resolvedTemp),resolvedOutput,'Runtime cleanup leaves the test output directory');
  assert.ok(path.basename(resolvedTemp).startsWith('runtime-'),'Unexpected runtime cleanup target');
  await rm(resolvedTemp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
console.log(`Brogue browser verification: ${evidence.checks.length} checks; ${output}`);
