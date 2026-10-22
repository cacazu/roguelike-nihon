// Actual Tab/first-touch inspection and physical viewport reading; no game-state writes.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHordeMutationCases,readOriginalHordeCatalogs} from './horde-mutations.mjs';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
const physical=({ready,...s})=>s,normalize=s=>s.replace(/\s+/g,' ').trim();
const upper=s=>s[0].toUpperCase()+s.slice(1);
function description(template,monster,male,female){
 const gender=monster.flags&male?1:monster.flags&female?2:3;
 const pronouns={'$HESHE':['you','he','she','it'],'$HIMHER':['you','him','her','it'],'$HISHER':['your','his','her','its'],'$HIMSELFHERSELF':['yourself','himself','herself','itself']};
 // These visible, nonhallucinated subjects use native selected gender. Match longer token first.
 let capital=false,out='';for(let i=0;i<template.length;){const token=Object.keys(pronouns).find(t=>template.startsWith(t,i));if(token){const value=pronouns[token][gender];out+=capital?upper(value):value;capital=false;i+=token.length;}else{const c=template[i++];if(c==='.')capital=true;else if(!/\s/.test(c))capital=false;out+=c;}}return upper(out);
}
async function frame(d){return d.page.evaluate(()=>Array.from({length:34},(_,y)=>Array.from({length:100},(_,x)=>{const i=(y*100+x)*10,c=__brogueFixture.cells;return c[i]===0x110000||Math.max(...c.slice(i+2,i+5))<20?' ':String.fromCodePoint(c[i+1]||32);}).join('')));}
// Search rectangular text columns dynamically. Preserve exact case/punctuation and cell coordinates;
// joining all 100 columns would inject unrelated sidebar/map text between wrapped lines.
function sentenceCells(rows,expected){
 const first=expected.split(' ').slice(0,3).join(' '),starts=[];
 for(let y=0;y<rows.length;y++)for(let x=rows[y].indexOf(first);x>=0;x=rows[y].indexOf(first,x+1))starts.push({x,y});
 for(const start of starts)for(let left=0;left<=start.x;left++)for(let right=start.x+first.length;right<=100;right++){
  const chars=[],points=[];let space=false;
  for(let y=start.y;y<rows.length;y++)for(let x=left;x<=right;x++){
   const c=x===right?' ':rows[y][x];if(/\s/.test(c)){space=chars.length>0;continue;}if(space){chars.push(' ');points.push(null);space=false;}chars.push(c);points.push({x,y,char:c});
  }
  const text=chars.join(''),at=text.indexOf(expected);if(at<0||at>0&&/\w/.test(text[at-1])||at+expected.length<text.length&&/\w/.test(text[at+expected.length]))continue;
  const cells=points.slice(at,at+expected.length).filter(Boolean);assert.equal(cells.map(p=>p.char).join(''),expected.replace(/\s/g,''));return {expected,crop:{left,right,top:start.y},cells};
 }return null;
}
function core(state,pathBit){
 const s=structuredClone(state);delete s.ready;delete s.cursor;delete s.cursorMode;
 const visit=v=>{if(!v||typeof v!=='object')return;if('dungeon'in v&&'flags'in v)v.flags=(v.flags&~pathBit)>>>0;if('cellFlags'in v)v.cellFlags=(v.cellFlags&~pathBit)>>>0;for(const x of Object.values(v))visit(x);};visit(s);return s;
}
async function geometry(d,cells){return d.page.evaluate(cells=>{
 const canvas=document.querySelector('#game'),c=canvas.getBoundingClientRect(),v=document.querySelector('#viewport'),r=v.getBoundingClientRect(),vv=visualViewport;
 const clip={left:Math.max(r.left+v.clientLeft,0,vv?.offsetLeft??0),top:Math.max(r.top+v.clientTop,0,vv?.offsetTop??0),right:Math.min(r.left+v.clientLeft+v.clientWidth,innerWidth,(vv?.offsetLeft??0)+(vv?.width??innerWidth)),bottom:Math.min(r.top+v.clientTop+v.clientHeight,innerHeight,(vv?.offsetTop??0)+(vv?.height??innerHeight))};
 const cw=c.width/100,ch=c.height/34;
 return {cell_width:cw,cell_height:ch,canvas:{left:c.left,top:c.top,width:c.width,height:c.height},clip,window:{width:innerWidth,height:innerHeight,visual:vv?{left:vv.offsetLeft,top:vv.offsetTop,width:vv.width,height:vv.height,scale:vv.scale}:null},scroll:{left:v.scrollLeft,top:v.scrollTop,maxLeft:v.scrollWidth-v.clientWidth,maxTop:v.scrollHeight-v.clientHeight},cells:cells.map(p=>{const rect={left:c.left+p.x*cw,top:c.top+p.y*ch,right:c.left+(p.x+1)*cw,bottom:c.top+(p.y+1)*ch};return {...p,screen:rect,visible:rect.left>=clip.left&&rect.right<=clip.right&&rect.top>=clip.top&&rect.bottom<=clip.bottom};})};
 },cells);}
async function shot(d,name){const file=name+'.png';await d.page.screenshot({path:path.join(d.entry.directory,file),fullPage:false});d.entry.screenshots.push(file);return file;}
async function pan(d,dx,dy){
 const before=await d.state(),wait=await d.wait(),count=(await d.trace()).native_trace.length,g=await geometry(d,[]),v=g.clip;
 dx=Math.max(-(v.right-v.left)*.6,Math.min((v.right-v.left)*.6,dx));dy=Math.max(-(v.bottom-v.top)*.6,Math.min((v.bottom-v.top)*.6,dy));assert.ok(Math.abs(dx)+Math.abs(dy)>12,'Pan must not become a click');
 const x=v.left+(v.right-v.left)*(dx>0?.25:.75),y=v.top+(v.bottom-v.top)*(dy>0?.25:.75),start=await d.page.evaluate(()=>globalThis.__inspectionDOM.length),cdp=await d.page.context().newCDPSession(d.page);
 try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let n=1;n<=8;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/8,y:y+dy*n/8,id:1}]});await d.page.evaluate(()=>new Promise(requestAnimationFrame));}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}
 await d.page.evaluate(async()=>{const v=document.querySelector('#viewport');let x=v.scrollLeft,y=v.scrollTop,stable=0;for(let n=0;n<240&&stable<8;n++){await new Promise(requestAnimationFrame);stable=v.scrollLeft===x&&v.scrollTop===y?stable+1:0;x=v.scrollLeft;y=v.scrollTop;}});
 const dom=await d.page.evaluate(start=>globalThis.__inspectionDOM.slice(start),start);assert.ok(dom.length&&dom.every(e=>e.trusted)&&dom.some(e=>e.type==='pointerdown'));assert.ok(dom.some(e=>e.type==='pointercancel')||dom.some(e=>e.type==='pointerup'&&Math.abs(e.x-x)+Math.abs(e.y-y)>12));
 assert.deepEqual(await d.state(),before,'Real viewport pan changed game state');assert.equal((await d.wait()).serial,wait.serial);assert.equal((await d.trace()).native_trace.length,count,'Pan submitted a C event');
 d.entry.real_pans.push({dx,dy,before:g.scroll,after:(await geometry(d,[])).scroll,dom,native_events:0,wait_serial:wait.serial});
}
async function readCells(d,label,match){
 const covered=new Set(),samples=[];d.entry.viewport_readings.push({label,...match,samples});
 for(let n=0;n<32;n++){
  const g=await geometry(d,match.cells);assert.ok(g.cell_width>=10,'Text must retain a readable >=10px cell width');assert.ok(g.cell_height>=14);assert.ok(g.clip.right>g.clip.left&&g.clip.bottom>g.clip.top);
  g.cells.forEach((p,i)=>{if(p.visible)covered.add(i);});const png=await shot(d,label+'-'+n);samples.push({...g,png,covered_total:covered.size});if(covered.size===match.cells.length)return;
  assert.equal(d.entry.input_path,'touch','PC text unexpectedly clipped');const p=g.cells.find((_,i)=>!covered.has(i)),r=p.screen,v=g.clip,dx=(v.left+v.right-r.left-r.right)/2,dy=(v.top+v.bottom-r.top-r.bottom)/2;
  await pan(d,Math.abs(dx)<15?0:dx,Math.abs(dy)<15?0:dy);
 }
 throw Error('Native text not fully readable within bounded real pans: '+label);
}
export function createMonsterInspectionCases(){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);const V=(d,n)=>{const e=inv.definitions[d].entries.find(e=>e.symbol===n);assert.ok(e);return e.value;},pathBit=V('tileFlags','IS_IN_PATH'),pc=new Map();
 return createHordeMutationCases({maxReads:1}).filter(t=>t.fixture_id===S.HORDE_MUTATION).map(parent=>{
  const catalog=readOriginalHordeCatalogs(inv,parent.variant);
  return {...parent,id:parent.variant+'-'+parent.input_path+'-native-mutant-inspection',feature_ids:['cursor.inspect'],targets:[],source_refs:[...parent.source_refs,'IO.c:mainInputLoop/printMonsterDetails/printTextBox','Monsters.c:monsterDetails/resolvePronounEscapes','rust/src/browser.rs:pointerup/cancel and viewport'],assertions:[
   'Separate UI trial: existing artificial scene125, synthetic depth34/8/4, one actual Summoning read only. No NPC/helper/seed search/post-start intervention. No new mutation behavior, natural spawn or full-family coverage credit.',
   'PC actual Tab <=16, touch first actual map tap only. Native cursor and wait owner select the same live visible mutant; no Enter/second tap/travel/attack. Entire pinned mutation description must newly appear with exact case/punctuation and native pronouns, independently of the sidebar literal title.',
   'Read every nonspace description character and same-item sidebar species/title through >=10px cells fully inside actual viewport content clip and window. Real touch pan only; trusted pointercancel or >12px drag, no C input or wait/state change. Save viewport PNG/character geometry for each segment. Sequential panning is not default simultaneous display or a mobile mini-HUD extension.',
   'Baseline selected glyph must match pinned species. If focus glyph is absent its cause stays unverified, with no overlay/simultaneous visibility credit; cursor/live actor/exact new body and invariant simulation establish identity.',
   'No turn/absolute time/HP/location/status/item/roster/stat/terrain/substantive RNG-counter change. Only cursor/mode/ready and IS_IN_PATH permitted during focus; Esc restores full observable state except ready. PC/touch final simulation must agree; native replay is separate from CSS proof. Chromium touch emulation, no physical Safari credit.'
  ],execute:async d=>{
   await parent.execute(d);assert.equal(d.entry.actual_reads,1);d.entry.generation_events=d.entry.actual_events;d.entry.effect_reached=false;d.entry.viewport_readings=[];d.entry.real_pans=[];d.entry.focus_steps=[];
   await d.page.evaluate(()=>{globalThis.__inspectionDOM=[];for(const type of ['pointerdown','pointerup','pointercancel'])document.addEventListener(type,e=>globalThis.__inspectionDOM.push({type,trusted:e.isTrusted,pointerType:e.pointerType,x:e.clientX,y:e.clientY}),true);});
   const baselineViewport=await geometry(d,[]);d.entry.baseline_viewport=baselineViewport;const b=await d.state(),w=d.entry.actual_witness,m=b.monsters.find(m=>m.x===w.x&&m.y===w.y&&m.kind===w.kind),baseRows=await frame(d);assert.ok(m&&m.hp>0&&m.publicVisible);assert.equal(b.statuses[V('statusEffects','STATUS_HALLUCINATING')],0);assert.equal(m.invisible,0);assert.ok(b.cursor.x!==m.x||b.cursor.y!==m.y,'First tap must not confirm an existing selection');
   const expected=normalize(description(catalog.mutations[m.mutationIndex].description,m,V('monsterBehaviorFlags','MONST_MALE'),V('monsterBehaviorFlags','MONST_FEMALE')));assert.ok(!sentenceCells(baseRows,expected),'Description already visible before focus');
   const initialGlyph=await d.publicCell(m.x+21,m.y+3);assert.equal(initialGlyph[0],catalog.monsters[m.kind].nativeGlyph);d.entry.inspection_subject={kind:m.kind,mutation_index:m.mutationIndex,x:m.x,y:m.y,expected_description:expected,initial_cell:initialGlyph};const start=(await d.trace()).native_trace.length;
   if(d.entry.input_path==='touch'){
    const point=(await geometry(d,[{x:m.x+21,y:m.y+3}])).cells[0];assert.ok(point.visible,'Initial map tap target must be fully visible');const wait=await d.wait();await d.page.touchscreen.tap((point.screen.left+point.screen.right)/2,(point.screen.top+point.screen.bottom)/2);await d.page.waitForFunction(serial=>__brogueFixture.waiting&&__brogueFixture.serial>serial&&document.querySelector('#game').dataset.waitKind==='cursor',wait.serial,{timeout:60000});await d.record('first actual map tap: inspect, no confirmation');
   }else for(let i=0;i<16;i++){
    await d.input('Tab');const s=await d.state();assert.deepEqual(core(s,pathBit),core(b,pathBit));d.entry.focus_steps.push({cursor:s.cursor,wait:await d.wait()});if(s.cursor.x===m.x&&s.cursor.y===m.y)break;
   }
   const focused=await d.state();assert.deepEqual(focused.cursor,{x:m.x,y:m.y});assert.equal((await d.wait()).kind,'cursor');assert.deepEqual(core(focused,pathBit),core(b,pathBit));const rows=await frame(d),match=sentenceCells(rows,expected);assert.ok(match,'New native popup must contain full pinned mutation description');
   const glyph=await d.publicCell(m.x+21,m.y+3);d.entry.inspection_subject.focus_cell=glyph;d.entry.inspection_subject.map_glyph_visibility=glyph[0]===catalog.monsters[m.kind].nativeGlyph?'species glyph retained':'focus glyph absent; cause unverified; no overlay/simultaneous credit';
   const events=(await d.trace()).native_trace.slice(start);if(d.entry.input_path==='touch')assert.deepEqual(events.map(e=>e.event.slice(0,3)),[[2,m.x+21,m.y+3],[1,m.x+21,m.y+3]]);else assert.ok(events.length>0&&events.length<=16&&events.every(e=>e.event[0]===0&&e.event[1]===9));for(const e of events)assert.deepEqual(core(e.before,pathBit),core(b,pathBit));d.entry.inspection_events=events.map(e=>e.event);
   await readCells(d,'popup-description',match);assert.deepEqual(core(await d.state(),pathBit),core(b,pathBit));await d.input('Escape');assert.equal((await d.wait()).kind,'command');assert.deepEqual(physical(await d.state()),physical(b),'Esc must restore all observed state including path flags');
   const restoredRows=await frame(d);assert.equal(sentenceCells(restoredRows,expected),null,'Esc must dismiss the native detail body');const sidebar=w.public_evidence.actors[0].sidebar,cells=[];for(let y=sidebar.name_start_row;y<=sidebar.mutation_row;y++)for(let x=0;x<20;x++)if(!/\s/.test(restoredRows[y][x]))cells.push({x,y,char:restoredRows[y][x]});
   const species=catalog.monsters[m.kind].name.toLowerCase(),name=normalize(restoredRows.slice(sidebar.name_start_row,sidebar.name_end_row+1).map(r=>r.slice(0,20)).join(' ')).replace(/^\S{1,3}:\s*/,'').toLowerCase();assert.equal(name,species);assert.equal(normalize(restoredRows[sidebar.mutation_row].slice(0,20)),'('+catalog.mutations[m.mutationIndex].title+')');await readCells(d,'sidebar-species-mutation',{expected:species+' ('+catalog.mutations[m.mutationIndex].title+')',cells});assert.deepEqual(physical(await d.state()),physical(b));
   if(parent.input_path==='touch'){const state=await d.state(),wait=await d.wait(),count=(await d.trace()).native_trace.length;await d.page.locator('#center-player').tap();assert.deepEqual(await d.state(),state);assert.equal((await d.wait()).serial,wait.serial);assert.equal((await d.trace()).native_trace.length,count);const after=await geometry(d,[]);assert.deepEqual(after.scroll,baselineViewport.scroll,'Public center button must restore the initial player viewport');d.entry.restored_viewport=after;}
   d.entry.post_generation_state=b;d.entry.post_escape_state=await d.state();const k=parent.variant;if(parent.input_path==='pc-keyboard')pc.set(k,physical(b));else if(pc.has(k))assert.deepEqual(physical(b),pc.get(k));d.entry.pc_touch_inspection_comparison=parent.input_path==='touch'&&pc.has(k)?'equal postgeneration/postEsc full observable simulation':'PC reference or counterpart not selected';d.entry.actual_events=(await d.trace()).native_trace.map(e=>e.event);d.effect(()=>assert.ok(d.entry.viewport_readings.every(r=>r.samples.at(-1).covered_total===r.cells.length)));
  }};
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-inspection',createCases:createMonsterInspectionCases,filter:process.env.BROGUE_MONSTER_INSPECTION});
