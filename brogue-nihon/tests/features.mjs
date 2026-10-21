// CHECK initial scenes followed by real keyboard/touch input, never playthrough claims.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp,realpath,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from '../../tools/server.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const output=path.join(root,'.local/feature-verification/scenarios');
const runId=new Date().toISOString();
const runFolder='run-'+runId.replaceAll(/[:.]/g,'-');
const runDirectory=path.join(output,runFolder);
const results={run_id:runId,mode:'CHECK initial scenes; not a normal playthrough',artifacts:[],cases:[],notSelected:[],result:'fail'};
const selected=process.env.BROGUE_SCENARIOS?.split(',').filter(Boolean);
let browser,context,current,server,temporary,oldTemp,base,chromium,manifest,checkModule,host;
const marker='  game.callMain(Array.from(arguments_));';
const adapter=`
  const test = globalThis.__brogueFeature = {module:game,serial:0,waiting:false,descriptor:[],cells:[],events:[],notifications:[]};
  const event = globalThis.brogueHost.event;
  globalThis.brogueHost.event = (...args) => {test.serial++;test.waiting=true;test.descriptor=Array.from(args[2]);return event(...args).then(value=>{test.events.push(Array.from(value));test.waiting=false;return value;});};
  const frame = globalThis.brogueHost.frame;
  globalThis.brogueHost.frame = cells => {test.cells=Array.from(cells);return frame(cells);};
  const notify = globalThis.brogueHost.notify;
  globalThis.brogueHost.notify = (...args) => {test.notifications.push(args);return notify(...args);};
`;
async function setup(){
  await mkdir(runDirectory,{recursive:true});
  try{const previous=await readFile(path.join(output,'results.json'));const prior=JSON.parse(previous);await mkdir(path.join(output,'history'),{recursive:true});await writeFile(path.join(output,'history',(prior.run_id||'legacy').replaceAll(/[:.]/g,'-')+'-'+hash(previous).slice(0,8)+'.json'),previous);}catch(error){if(error.code!=='ENOENT')throw error;}
  ({chromium}=require(process.env.BROGUE_PLAYWRIGHT||'playwright'));
  manifest=JSON.parse(await readFile(path.join(root,'build/build-manifest-check.json'),'utf8'));
  assert.equal(manifest.test_hooks,true);
  assert.ok(manifest.source_inputs.some(record=>record.file==='tests/fixtures.c'),'Build -Check with tests/fixtures.c first');
  for(const record of manifest.source_inputs){
    const canonical=(await readFile(path.resolve(root,record.file),'utf8')).replaceAll('\r\n','\n');
    assert.equal(hash(Buffer.from(canonical)),record.sha256,record.file+' changed since CHECK build');
  }
  for(const record of manifest.outputs){
    assert.equal(hash(await readFile(path.join(root,'build',record.file))),record.sha256,record.file+' artifact hash');
    results.artifacts.push({file:'build/'+record.file,sha256:record.sha256});
  }
  const production=JSON.parse(await readFile(path.join(root,'build/build-manifest.json'),'utf8'));
  for(const record of production.outputs.filter(record=>/^browser-ui\.(js|wasm)$/.test(record.file))){assert.equal(hash(await readFile(path.join(root,'build',record.file))),record.sha256,record.file+' UI artifact hash');results.artifacts.push({file:'build/'+record.file,sha256:record.sha256});}
  assert.equal(results.artifacts.length,4,'Expected CHECK C JS/Wasm plus Rust UI JS/Wasm');
  results.provenance={manifest_sha256:hash(await readFile(path.join(root,'build/build-manifest-check.json'))),source_inputs:manifest.source_inputs};
  checkModule=await readFile(path.join(root,'build/game-check.js'),'utf8');
  host=await readFile(path.join(root,'web/host.js'),'utf8');
  assert.ok(host.includes(marker),'Update observation adapter for production bootstrap');
  server=createPreviewServer({root});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}/`;
  temporary=await mkdtemp(path.join(output,'runtime-'));
  oldTemp={TEMP:process.env.TEMP,TMP:process.env.TMP};
  process.env.TEMP=temporary;process.env.TMP=temporary;
}

async function state(page){return page.evaluate(()=>{const game=__brogueFeature.module,value=JSON.parse(game.UTF8ToString(game._brogue_check_features()));if(value.error)throw Error(value.error);return value;});}
async function observe(page){return page.evaluate(()=>({serial:__brogueFeature.serial,waiting:__brogueFeature.waiting,kind:document.querySelector('#game').dataset.waitKind,descriptor:__brogueFeature.descriptor}));}
async function wait(page,kind){await page.waitForFunction(kind=>globalThis.__brogueFeature&&((__brogueFeature.waiting&&(!kind||document.querySelector('#game').dataset.waitKind===kind))||(kind==='title'&&document.querySelector('#game').dataset.waitKind==='title')),kind,{timeout:60000});}
async function record(page,action){current.steps.push({action,wait:await observe(page),state:await state(page),text:await page.evaluate(()=>{
  const cells=__brogueFeature.cells,rows=[];for(let y=0;y<34;y++){let row='';for(let x=0;x<100;x++){const code=cells[(y*100+x)*10+1];row+=code>0&&code<=0x10ffff?String.fromCodePoint(code):' ';}rows.push(row);}return rows.join('\n');
})});}
async function input(page,key,touch=current?.touch||false){
  const before=await observe(page);assert.equal(before.waiting,true,'C is not waiting for input');
  if(touch){
    const code=key==='Space'?32:key==='ArrowRight'?108:key==='ArrowLeft'?104:key==='ArrowUp'?107:key==='ArrowDown'?106:key.codePointAt(0);
    const selector=key==='Escape'?'#cancel':key==='Enter'?'#submit':`#commands button[data-key="${code}"],#choices button[data-key="${code}"],#directions button[data-key="${code}"]`;
    await page.locator(selector).filter({visible:true}).first().tap();
  }else await page.keyboard.press(key);
  await page.waitForFunction(serial=>(__brogueFeature.waiting&&__brogueFeature.serial>serial)||document.querySelector('#game').dataset.waitKind==='title',before.serial,{timeout:60000});
  await record(page,(touch?'tap ':'key ')+key);
}
async function text(page,value){
  const before=await observe(page);assert.equal(before.kind,'text');await page.locator('#text-value').fill(value);if(current.touch)await page.locator('#text-entry button[type=submit]').tap();else await page.locator('#text-entry button[type=submit]').click();
  await page.waitForFunction(serial=>(__brogueFeature.waiting&&__brogueFeature.serial>serial)||document.querySelector('#game').dataset.waitKind==='title',before.serial,{timeout:60000});await record(page,'text '+value);
}
async function ack(page){for(let i=0;i<8&&(await observe(page)).kind==='acknowledge';i++)await input(page,'Space');}
async function itemAction(page,command,letter,touch=current?.touch||false){await input(page,command,touch);assert.equal((await observe(page)).kind,'item');assert.ok((await observe(page)).descriptor.slice(4).includes(letter.codePointAt(0)),letter+' is not a public candidate');await input(page,letter,touch);}
async function shot(page,name){const filename=name+'.png';await page.screenshot({path:path.join(current.directory,filename),fullPage:true});current.screenshots.push(filename);}
async function finish(page){await ack(page);assert.equal((await observe(page)).kind,'command');await sceneFrame(page);current.effectReached=true;await shot(page,'result');}
async function sceneFrame(page){
  if(!current.origin)return;
  const s=await state(page);if(!s.inProgress)return;
  const cells=await page.evaluate(()=>__brogueFeature.cells);
  assert.equal(cells[((s.y+3)*100+s.x+21)*10+1],64,'New player glyph must match C location');
  if(s.depth===current.origin.depth)assert.equal(cells[((current.origin.y+3)*100+current.origin.x+21)*10+1],32,'Original pre-fixture player/map was restored');
}
const pack=(s,letter)=>s.pack.find(item=>item.letter===letter.codePointAt(0));
async function open(scene,label='initial'){
  const page=await context.newPage();if(current.touch)await page.setViewportSize({width:390,height:844});page.on('pageerror',error=>current.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')current.errors.push(message.text());});
  await page.goto(base+'?seed=42&lang=en');await wait(page,'command');const initial=await state(page),observed=await observe(page);
  assert.equal(initial.seed,'42');assert.equal(initial.turn,0);assert.equal(initial.fixture,0);assert.equal(initial.ready,1);assert.equal(observed.serial,1);
  assert.equal(await page.evaluate(()=>__brogueFeature.module._brogue_check_fixture(99999)),-1);assert.deepEqual(await state(page),initial,'Unknown fixture mutated state');
  if(scene){
    current.origin={x:initial.x,y:initial.y,depth:initial.depth};
    assert.equal(await page.evaluate(scene=>__brogueFeature.module._brogue_check_fixture(scene),scene),scene);
    const prepared=await state(page);assert.equal(prepared.fixture,scene);assert.equal(prepared.turn,initial.turn);
    assert.equal(await page.evaluate(scene=>__brogueFeature.module._brogue_check_fixture(scene),scene),-1);assert.deepEqual(await state(page),prepared,'Repeated fixture mutated state');
  }
  if(scene)await sceneFrame(page);
  await record(page,'CHECK initial scene '+scene);await shot(page,label);return page;
}

const cases=[
  ['reject-after-first-input',0,'CHECK safe-boundary',async p=>{await input(p,'i');const before=await state(p);assert.equal(await p.evaluate(()=>__brogueFeature.module._brogue_check_fixture(1)),-1);assert.deepEqual(await state(p),before);await input(p,'Escape');await finish(p);}],
  ['food-consumption',1,'Items.c:eat/apply',async p=>{const b=await state(p);await itemAction(p,'a','a');assert.equal((await observe(p)).kind,'confirm');await input(p,'y');await finish(p);const s=await state(p);assert.equal(pack(s,'a'),undefined);assert.ok(s.status.nutrition>b.status.nutrition);assert.ok(s.turn>b.turn);}],
  ['potion-strength',1,'Items.c:drinkPotion/POTION_STRENGTH',async p=>{const b=await state(p);await itemAction(p,'a','d');await finish(p);const s=await state(p);assert.equal(pack(s,'d'),undefined);assert.equal(s.strength,b.strength+1);assert.ok(s.turn>b.turn);}],
  ['potion-life',1,'Items.c:drinkPotion/POTION_LIFE',async p=>{const b=await state(p);await itemAction(p,'a','l');await finish(p);const s=await state(p);assert.equal(pack(s,'l'),undefined);assert.ok(s.maxHP>b.maxHP);assert.ok(s.hp>b.hp);}],
  ['equip-and-remove',1,'Items.c:equip/unequip',async p=>{for(const[letter,field]of[['b','weapon'],['c','armor'],['h','ringLeft']]){const b=await state(p);await itemAction(p,'e',letter);await finish(p);const s=await state(p);assert.equal(s[field],letter.codePointAt(0));assert.equal(pack(s,letter).equipped,1);assert.ok(s.turn>b.turn);await itemAction(p,'r',letter);await finish(p);assert.equal(pack(await state(p),letter).equipped,0);}}],
  ['charm-health-cooldown',1,'Items.c:useCharm/CHARM_HEALTH',async p=>{const b=await state(p);await itemAction(p,'a','i');await finish(p);const s=await state(p);assert.ok(s.hp>b.hp);assert.ok(pack(s,'i').charges>0);assert.ok(s.turn>b.turn);await itemAction(p,'a','i');await finish(p);assert.equal((await state(p)).turn,s.turn);}],
  ['scroll-identify',1,'Items.c:readScroll/SCROLL_IDENTIFY',async p=>{assert.equal(pack(await state(p),'g').identified,0);await itemAction(p,'a','e');await ack(p);assert.equal((await observe(p)).kind,'item');await shot(p,'identify-choice');await input(p,'g');await finish(p);const s=await state(p);assert.equal(pack(s,'e'),undefined);assert.equal(pack(s,'g').identified,1);assert.equal(pack(s,'g').kindKnown,1);}],
  ['wand-slow',2,'Items.c:useStaffOrWand; zap/BE_SLOW',async p=>{const b=await state(p);await itemAction(p,'a','g');assert.equal((await observe(p)).kind,'target');await shot(p,'target');await input(p,'Enter');await finish(p);const s=await state(p);assert.equal(pack(s,'g').charges,pack(b,'g').charges-1);assert.ok(s.monsters.some(m=>m.slowed>0));assert.ok(s.turn>b.turn);}],
  ['staff-fire',2,'Items.c:useStaffOrWand; zap/BE_DAMAGE',async p=>{const b=await state(p);await itemAction(p,'a','f');assert.equal((await observe(p)).kind,'target');await input(p,'Enter');await finish(p);const s=await state(p);assert.equal(pack(s,'f').charges,pack(b,'f').charges-1);assert.ok(s.monsters.length<b.monsters.length||s.monsters[0].hp<b.monsters[0].hp);assert.ok(s.turn>b.turn);}],
  ['throw-and-cancel',2,'Items.c:throwCommand/throwItem',async p=>{const b=await state(p);await itemAction(p,'t','j');assert.equal((await observe(p)).kind,'target');await input(p,'Escape');assert.equal((await state(p)).turn,b.turn);assert.equal(pack(await state(p),'j').quantity,5);await itemAction(p,'t','j');await input(p,'Enter');await finish(p);assert.equal(pack(await state(p),'j').quantity,4);assert.ok((await state(p)).turn>b.turn);}],
  ['drop-and-pickup',1,'Items.c:drop/dropItem/pickUpItemAt',async p=>{await itemAction(p,'d','a');await finish(p);const s=await state(p);assert.equal(pack(s,'a'),undefined);assert.ok(s.floor.some(i=>i.category===1&&i.x===s.x&&i.y===s.y));await input(p,'ArrowUp');await input(p,'ArrowDown');await finish(p);assert.ok((await state(p)).pack.some(i=>i.category===1));assert.ok(!(await state(p)).floor.some(i=>i.category===1));}],
  ['inscribe-known-item',1,'Items.c:call/inscribeItem',async p=>{const b=await state(p);await itemAction(p,'c','b');await text(p,'fixture-sword');await finish(p);assert.equal(pack(await state(p),'b').inscription,'fixture-sword');assert.equal((await state(p)).turn,b.turn);}],
  ['call-unknown-kind',1,'Items.c:call',async p=>{const b=await state(p);await itemAction(p,'c','g');assert.equal((await observe(p)).kind,'confirm');await input(p,'n');await text(p,'fixture-slow');await finish(p);const s=await state(p);assert.equal(pack(s,'g').called,1);assert.equal(pack(s,'g').callTitle,'fixture-slow');assert.equal(s.turn,b.turn);}],
  ['wall-and-door',3,'Movement.c:playerMoves; tile promotion',async p=>{const b=await state(p);await input(p,'ArrowUp');let s=await state(p);assert.equal(s.x,b.x);assert.equal(s.y,b.y);assert.equal(s.turn,b.turn);await input(p,'ArrowRight');await finish(p);s=await state(p);assert.equal(s.x,b.x+1);assert.ok(s.turn>b.turn);assert.notEqual(s.cells.find(c=>c.x===41&&c.y===14).dungeon,b.cells.find(c=>c.x===41&&c.y===14).dungeon);}],
  ['poison-trap-gas',4,'Time.c:applyInstantTileEffectsToCreature',async p=>{const b=await state(p);await input(p,'ArrowRight');await finish(p);const s=await state(p);assert.ok(s.turn>b.turn);assert.ok(s.cells.some(c=>c.gas!==0&&c.volume>0),'Trap did not create gas');assert.notEqual(s.cells.find(c=>c.x===41&&c.y===14).dungeon,b.cells.find(c=>c.x===41&&c.y===14).dungeon);}],
  ['burn-damage-expiry',5,'Time.c:playerTurnEnded/STATUS_BURNING',async p=>{const b=await state(p);const control=await open(1,'unburned-control');const controlBefore=await state(control);assert.equal(controlBefore.hp,b.hp);assert.equal(controlBefore.rng,b.rng);await input(control,'.');const unburned=await state(control);await shot(control,'unburned-after-rest');await control.close();await input(p,'.');const once=await state(p);current.effectReached=true;assert.equal(once.status.burning,1);assert.equal(once.turn,unburned.turn);assert.ok(unburned.hp-once.hp>=1&&unburned.hp-once.hp<=3,'Burn damage must be original 1..3 after identical regeneration');await input(p,'.');await finish(p);const s=await state(p);assert.equal(s.status.burning,0);assert.ok(s.hp<once.hp);}],
  ['monster-ai',6,'Monsters.c:monsterTurn; pathing',async p=>{const b=await state(p),distance=s=>Math.abs(s.monsters[0].x-s.x)+Math.abs(s.monsters[0].y-s.y);await input(p,'.');await finish(p);const s=await state(p);assert.ok(distance(s)<distance(b));assert.ok(s.turn>b.turn);}],
  ['stairs-roundtrip',7,'Movement.c:useStairs; RogueMain.c:startLevel',async p=>{const b=await state(p);await input(p,'ArrowLeft');await input(p,'ArrowRight');await finish(p);assert.equal((await state(p)).depth,2);for(let i=0;i<5&&(await state(p)).depth===2;i++)await input(p,'<');await finish(p);const s=await state(p);assert.equal(s.depth,1);for(const field of['upX','upY','downX','downY'])assert.equal(s[field],b[field],field);}],
  ...[['death-poison',9,'Died from poison'],['escape-amulet',10,'Escaped'],['mastery-amulet',11,'Mastered']].map(([name,scene,result])=>[name,scene,'RogueMain.c:gameOver/victory',async p=>{
    if(scene===9)await input(p,'.');else if(scene===10){await input(p,'ArrowRight');await input(p,'ArrowLeft');}else{await input(p,'ArrowLeft');await input(p,'ArrowRight');}
    for(let i=0;i<20&&(await observe(p)).kind!=='title';i++){await shot(p,'ending-'+String(i).padStart(2,'0'));const kind=(await observe(p)).kind;if(kind==='text')await text(p,name+'-fixture');else await input(p,kind==='confirm'?'y':'Space');}
    await wait(p,'title');current.notifications=await p.evaluate(()=>__brogueFeature.notifications);
    const notification=current.notifications.find(n=>String(n[3]).includes(result));assert.ok(notification,JSON.stringify(current.notifications));
    // Items.c:itemValue(AMULET)=35000; victory doubles only mastery; gold=123.
    current.effectReached=true;assert.equal(notification[1],scene===9?123:scene===10?35123:70123,'Original terminal score');
    // MainMenu.c resets gameHasEnded when entering the next title loop.
    const ended=await state(p);assert.equal(ended.ended,0);assert.equal(ended.inProgress,0);assert.equal(ended.highScoreSaved,scene===9?1:0); // victory saves directly, without gameOver's duplicate-death guard
    const files=await p.evaluate(()=>{const fs=__brogueFeature.module.FS;return fs.readdir('/brogue').filter(n=>!['.','..'].includes(n)).map(name=>({name,bytes:Array.from(fs.readFile('/brogue/'+name))}));});
    current.files=files.map(file=>({name:file.name,bytes:file.bytes.length,sha256:hash(Buffer.from(file.bytes))}));
    assert.ok(files.some(f=>f.name.endsWith('.broguerec')&&f.bytes.length>0),'Recording absent');
    const scores=files.filter(f=>/HighScores\.txt$/.test(f.name)).flatMap(file=>Buffer.from(file.bytes).toString().trim().split('\n').map(line=>line.split('\t')));assert.ok(scores.some(fields=>Number(fields[0])===notification[1]&&fields.slice(2).join('\t').includes(result)),'High-score entry score/description absent');
    const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('brogue-nihon:files:v1:1.15.1')));
    assert.equal(stored?.version,1);assert.equal(stored.game,'BrogueCE1.15.1');
    for(const file of files.filter(f=>/HighScores\.txt$|RunHistory\.txt$|\.broguerec$/.test(f.name))){const persisted=stored.files.find(saved=>saved.name===file.name);assert.ok(persisted,file.name+' is not persisted');assert.deepEqual(persisted.bytes,file.bytes,file.name+' persisted bytes');}
    await shot(p,'returned-title');
  }]),
];

cases.push(...cases.filter(([name])=>['potion-strength','wand-slow','throw-and-cancel'].includes(name)).map(([name,scene,source,run])=>['touch-'+name,scene,source,run]));

// Targets denote asserted effects only; selecting or initially placing a kind is not coverage.
const metadata={
  'reject-after-first-input':[['dialog.ack_confirm'],[]],
  'food-consumption':[['cmd.apply'],[['foodKind','RATION']]],
  'potion-strength':[['cmd.apply'],[['potionKind','POTION_STRENGTH']]],
  'potion-life':[['cmd.apply'],[['potionKind','POTION_LIFE']]],
  'equip-and-remove':[['cmd.equip','cmd.unequip'],[['itemCategory','WEAPON'],['itemCategory','ARMOR'],['itemCategory','RING']]],
  'charm-health-cooldown':[['cmd.apply'],[['charmKind','CHARM_HEALTH']]],
  'scroll-identify':[['cmd.apply'],[['scrollKind','SCROLL_IDENTIFY']]],
  'wand-slow':[['cmd.apply','target.select'],[['wandKind','WAND_SLOW'],['statusEffects','STATUS_SLOWED']]],
  'staff-fire':[['cmd.apply','target.select'],[['staffKind','STAFF_FIRE']]],
  'throw-and-cancel':[['cmd.throw','target.select'],[['weaponKind','DART']]],
  'drop-and-pickup':[['cmd.drop','cmd.move'],[['itemCategory','FOOD']]],
  'inscribe-known-item':[['cmd.call','text.edit'],[]],
  'call-unknown-kind':[['cmd.call','text.edit'],[]],
  'wall-and-door':[['cmd.move'],[['tileType','WALL'],['tileType','DOOR']]],
  'poison-trap-gas':[['turn.environment'],[['tileType','GAS_TRAP_POISON_HIDDEN']]],
  'burn-damage-expiry':[['turn.environment'],[['statusEffects','STATUS_BURNING']]],
  'monster-ai':[['ai.monsters'],[['monsterTypes','MK_GOBLIN']]],
  'stairs-roundtrip':[['cmd.stairs'],[]],
  'death-poison':[['ending.death'],[['statusEffects','STATUS_POISONED']]],
  'escape-amulet':[['ending.escape'],[]],
  'mastery-amulet':[['ending.mastery'],[]],
};
const expectations={
 'reject-after-first-input':'Unknown/repeated/later fixture requests return -1 without state mutation',
 'food-consumption':'After explicit overfeeding confirmation, ration is removed, nutrition and turn increase',
 'potion-strength':'Potion removed, strength increases by 1, original turn advances',
 'potion-life':'Potion removed, maximum and current HP increase',
 'equip-and-remove':'Sword/leather/ring enter correct equipment slots, then original remove clears equipped flag; turns advance',
 'charm-health-cooldown':'Health rises and charm starts cooldown; immediate reuse has no turn cost',
 'scroll-identify':'Mandatory identify choice consumes scroll and reveals unknown wand kind and individual properties',
 'wand-slow':'Target confirmation consumes one charge and applies slowed to original monster',
 'staff-fire':'Target confirmation consumes one charge and reduces target HP or kills it',
 'throw-and-cancel':'Target cancellation preserves turn and quantity; confirmed throw reduces darts from 5 to 4',
 'drop-and-pickup':'Drop transfers food to current floor cell; walking off and back restores pack food',
 'inscribe-known-item':'Text form reaches original inscribe and stores exact inscription without turn',
 'call-unknown-kind':'Choosing kind naming stores exact called title without turn',
 'wall-and-door':'Wall blocks movement and turn; moving into door advances position/turn and changes door tile',
 'poison-trap-gas':'Stepping onto hidden trap promotes its tile and creates gas with positive volume',
 'burn-damage-expiry':'Matched unburned control proves original 1..3 burn damage after identical regeneration; two rests decrement burning 2 through 1 to 0',
 'monster-ai':'Rest advances turn while tracking goblin approaches player',
 'stairs-roundtrip':'Original stepping/travel descends to depth2 and returns depth1 with saved stair coordinates intact',
 'death-poison':'Original poison turn reaches death, score123, recording and title; persisted file bytes equal MEMFS',
 'escape-amulet':'Original exit with Amulet reaches Escaped, score35123, recording and title; persisted bytes equal MEMFS',
 'mastery-amulet':'Original deepest portal with Amulet reaches Mastered, score70123, recording and title; persisted bytes equal MEMFS',
};
function caseResult(entry){
  const [feature_ids,targets]=metadata[entry.name.replace(/^touch-/, '')]||[[],[]];
  return {...entry,directory:undefined,steps:undefined,id:entry.name,feature_ids,status:entry.result,
    method:'fixture_browser',fixture:true,variant:'brogue',input_path:entry.touch?'touch':'pc-keyboard',coverage:'partial',
    assertions:[entry.source,expectations[entry.name.replace(/^touch-/, '')]],evidence:entry.screenshots.map(file=>runFolder+'/'+entry.name+'/'+file).concat(runFolder+'/'+entry.name+'/steps.json'),
    targets:targets.map(([domain,symbol])=>({domain,symbol,effect_asserted:!!entry.effectReached}))};
}

try{
  await setup();
  if(selected)assert.ok(cases.some(([name])=>selected.includes(name)),'No known scenarios selected: '+selected.join(','));
  browser=await chromium.launch({headless:true,...(process.env.BROGUE_BROWSER?{executablePath:process.env.BROGUE_BROWSER}:{})});
  context=await browser.newContext({viewport:{width:1240,height:900},hasTouch:true});
  await context.addInitScript(()=>{if(location.protocol==='http:')localStorage.clear();});
  await context.route('**/build/game.js',route=>route.fulfill({body:checkModule,contentType:'text/javascript'}));
  await context.route('**/web/host.js',route=>route.fulfill({body:host.replace(marker,adapter+marker),contentType:'text/javascript'}));
  for(const[name,scene,source,run]of cases){
    if(selected&&!selected.includes(name)){results.notSelected.push(name);continue;}
    current={name,scene,source,touch:name.startsWith('touch-'),directory:path.join(runDirectory,name),steps:[],screenshots:[],errors:[]};await mkdir(current.directory,{recursive:true});let page;
    try{page=await open(scene);await run(page);assert.deepEqual(current.errors,[]);current.result='pass';console.log('PASS '+name);}
    catch(error){current.result='fail';current.failure={message:error.message,stack:error.stack};console.log('FAIL '+name+': '+error.message);if(page&&!page.isClosed())await shot(page,'failure').catch(()=>{});}
    finally{if(page&&!page.isClosed())await page.close();await writeFile(path.join(current.directory,'steps.json'),JSON.stringify({...current,directory:undefined},null,2)+'\n');results.cases.push(caseResult(current));}
  }
  assert.ok(results.cases.length>0,'No scenarios executed');
  results.result=results.cases.every(c=>c.result==='pass')?'pass':'fail';
}catch(error){results.result='fail';results.fatal={message:error.message,stack:error.stack};console.error(error.stack);}
finally{
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir(output,{recursive:true});await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
  for(const[k,v]of Object.entries(oldTemp||{}))if(v===undefined)delete process.env[k];else process.env[k]=v;
  if(temporary){assert.equal(path.dirname(await realpath(temporary)),await realpath(output));assert.ok(path.basename(temporary).startsWith('runtime-'));
  await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
if(results.result!=='pass')throw Error('Brogue fixture verification failed: '+path.join(output,'results.json'));
console.log(`Brogue CHECK features: ${results.cases.length} scenarios; ${output}`);
