// Real naming and feat transitions through the public UI; preparation uses existing CHECK scenes.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite} from './fixture-browser.mjs';
const observed=({ready,...state})=>state;
const item=(s,letter)=>{const it=s.pack.find(it=>it.letter===letter.charCodeAt(0));assert.ok(it,'Missing '+letter);return it;};
// Native overlays retain dim underlying glyphs in blank cells (INTERFACE_OPACITY=90).
// Public text excludes those dim pixels; raw status cells are retained as evidence.
export const publicText=d=>d.page.evaluate(()=>Array.from({length:34},(_,y)=>Array.from({length:100},(_,x)=>__brogueFixture.cells[(y*100+x)*10]===0x110000?'':Math.max(...__brogueFixture.cells.slice((y*100+x)*10+2,(y*100+x)*10+5))<20?' ':String.fromCodePoint(__brogueFixture.cells[(y*100+x)*10+1]||32)).join('')).join('\n'));
const isTouch=d=>d.entry.input_path==='touch';
async function next(d,before,action){await action();await d.page.waitForFunction(serial=>__brogueFixture.waiting&&__brogueFixture.serial>serial,before.serial,{timeout:60000});await d.record('public '+(isTouch(d)?'tap ':'click ')+'text submit');}
async function text(d,value){const before=await d.wait();assert.equal(before.kind,'text');await d.page.locator('#text-value').fill(value);await next(d,before,()=>isTouch(d)?d.page.locator('#text-entry button[type=submit]').tap():d.page.locator('#text-entry button[type=submit]').click());await d.settle();}
async function naming(d,letter){
  if(isTouch(d)){await d.input('i');await d.input(letter);assert.ok((await d.wait()).descriptor.slice(4).includes(99),'Item details must offer native Call action');await d.input('c');}
  else {await d.input('c');assert.equal((await d.wait()).kind,'item');await d.input(letter);}
  assert.equal((await d.wait()).kind,'text');
}
async function inventoryContains(d,label){await d.input('i');const rows=(await publicText(d)).split('\n'),line=rows.find(row=>row.includes(label));assert.ok(line,'Public inventory must contain '+label);await d.screenshot('inventory-'+label);await d.input('Escape');await d.settle();return line.trim();}
async function potionLine(d){await d.input('i');const line=(await publicText(d)).split('\n').find(row=>/d\)/.test(row)&&/potion/i.test(row));assert.ok(line,'Unknown potion inventory row must be public');assert.doesNotMatch(line,/strength/i,'Unknown potion must not reveal its true kind');await d.input('Escape');await d.settle();return line.trim();}
export async function menu(d){
  const cell=await d.page.evaluate(()=>{for(let y=0;y<34;y++){const line=Array.from({length:100},(_,x)=>__brogueFixture.cells[(y*100+x)*10]===0x110000?'':Math.max(...__brogueFixture.cells.slice((y*100+x)*10+2,(y*100+x)*10+5))<20?' ':String.fromCodePoint(__brogueFixture.cells[(y*100+x)*10+1]||32)).join('');const x=line.indexOf('Menu');if(x>=0)return {x:x+2,y:y+.5};}});assert.ok(cell,'Native Menu label missing');
  for(let attempt=0;attempt<12;attempt++){
    const p=await d.page.evaluate(c=>{const a=document.querySelector('#game').getBoundingClientRect(),v=document.querySelector('#viewport').getBoundingClientRect();return {x:a.x+c.x*a.width/100,y:a.y+c.y*a.height/34,v:{x:v.x,y:v.y,w:v.width,h:v.height}};},cell),v=p.v;
    const dx=p.x<v.x+4?100:p.x>v.x+v.w-4?-100:0,dy=p.y<v.y+4?80:p.y>v.y+v.h-4?-80:0;
    if(!dx&&!dy){await next(d,await d.wait(),()=>d.page.touchscreen.tap(p.x,p.y));assert.equal((await d.wait()).kind,'menu');return;}
    const before=(await d.trace()).native_trace.length,cdp=await d.page.context().newCDPSession(d.page),x=v.x+v.w/2,y=v.y+v.h/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/8,y:y+dy*n/8,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    await d.page.evaluate(async()=>{const v=document.querySelector('#viewport');let x=v.scrollLeft,y=v.scrollTop,stable=0;for(let n=0;n<240&&stable<8;n++){await new Promise(r=>requestAnimationFrame(r));stable=v.scrollLeft===x&&v.scrollTop===y?stable+1:0;x=v.scrollLeft;y=v.scrollTop;}});assert.equal((await d.trace()).native_trace.length,before,'Pan must not submit game input');
  }
  throw Error('Native menu remains outside viewport');
}
// Move the actual touch viewport until the tested native names/status cells fit.
async function revealFeatStatus(d,expected){
  const indices=Object.keys(expected).map(Number),top=1+Math.min(...indices),bottom=3+Math.max(...indices);
  for(let attempt=0;attempt<14;attempt++){
    const g=await d.page.evaluate(({top,bottom})=>{const c=document.querySelector('#game').getBoundingClientRect(),v=document.querySelector('#viewport').getBoundingClientRect();return {left:c.x+21*c.width/100,right:c.x+40*c.width/100,top:c.y+top*c.height/34,bottom:c.y+bottom*c.height/34,v:{x:v.x,y:v.y,w:v.width,h:v.height}};},{top,bottom}),v=g.v;
    const dx=g.left<v.x+2?100:g.right>v.x+v.w-2?-100:0,dy=g.top<v.y+2?80:g.bottom>v.y+v.h-2?-80:0;
    if(!dx&&!dy){d.entry.feat_viewports??=[];d.entry.feat_viewports.push(g);return;}
    const count=(await d.trace()).native_trace.length,cdp=await d.page.context().newCDPSession(d.page),x=v.x+v.w/2,y=v.y+v.h/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/8,y:y+dy*n/8,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    await d.page.evaluate(async()=>{const v=document.querySelector('#viewport');let x=v.scrollLeft,y=v.scrollTop,stable=0;for(let n=0;n<240&&stable<8;n++){await new Promise(r=>requestAnimationFrame(r));stable=v.scrollLeft===x&&v.scrollTop===y?stable+1:0;x=v.scrollLeft;y=v.scrollTop;}});assert.equal((await d.trace()).native_trace.length,count,'Feat viewport pan must not dismiss or submit a game input');
  }
  throw Error('Feat names/status cells did not fit the touch viewport');
}
export async function feats(d,expected){
  const before=await d.state();if(isTouch(d)){await menu(d);await d.input('F');}else await d.input('F');
  assert.equal((await d.wait()).kind,'anykey');if(isTouch(d))await revealFeatStatus(d,expected);assert.ok((await publicText(d)).includes('-- FEATS --'),JSON.stringify(await publicText(d)));
  const rows=[];for(let i=0;i<8;i++)rows.push(await d.publicCell(37,2+i));
  for(const [i,char]of Object.entries(expected)){if(char===' ')assert.ok(rows[i][1]===32||Math.max(...rows[i].slice(2,5))<20,'Initial feat status must be visually blank: '+JSON.stringify(rows[i]));else assert.equal(rows[i][1],char.charCodeAt(0),'Feat '+i+' public status');if(char==='-')assert.ok(rows[i][2]>rows[i][3]&&rows[i][2]>rows[i][4],'Failed feat must be red');if(char==='+')assert.ok(rows[i][3]>rows[i][2]&&rows[i][3]>rows[i][4],'Achieved feat must be green');}
  d.entry.feat_frames??=[];d.entry.feat_frames.push({expected,rows,text:await publicText(d)});await d.screenshot('feats-'+d.entry.feat_frames.length);await d.input('Space');await d.settle();assert.deepEqual(observed(await d.state()),observed(before),'Inspecting feats must preserve all original observed game state');
}
function namingUnchanged(before,after,letter){const expected=structuredClone(observed(before)),actual=observed(after),old=item(expected,letter),current=item(actual,letter);for(const field of letter==='d'?['called','callTitle']:['inscription'])old[field]=current[field];assert.deepEqual(actual,expected,'Only the permitted naming fields may change, including within the named item');}
function createCases(){const cases=[];
for(const input_path of ['pc-keyboard','touch']){
  cases.push({id:input_path+'-unknown-kind-call-clear-cancel',variant:'brogue',input_path,fixture_id:1,feature_ids:['cmd.call','items.knowledge','text.edit'],targets:[],assertions:['Unknown potion kind naming stores and publicly displays a label without identifying the kind.','Text Escape preserves the label; empty Enter clears it; other item knowledge, turn and substantive RNG remain unchanged.'],execute:async d=>{
    const before=await d.state();assert.equal(item(before,'d').kindKnown,0);const unknownRow=await potionLine(d);await naming(d,'d');await text(d,'trial-red');let after=await d.state();assert.equal(item(after,'d').called,1);assert.equal(item(after,'d').callTitle,'trial-red');assert.equal(item(after,'d').kindKnown,0);namingUnchanged(before,after,'d');assert.doesNotMatch(await inventoryContains(d,'trial-red'),/strength/i,'Kind calling must not reveal the actual unknown kind');
    const named=await d.state();await naming(d,'d');await d.page.locator('#text-value').fill('discarded');await d.input('Escape');await d.settle();assert.deepEqual(observed(await d.state()),observed(named));await naming(d,'d');await text(d,'');after=await d.state();d.effect(()=>{assert.equal(item(after,'d').called,0);assert.equal(item(after,'d').callTitle,'');assert.equal(item(after,'d').kindKnown,0);namingUnchanged(before,after,'d');});assert.equal(await potionLine(d),unknownRow,'Clearing the call restores the original unknown appearance');await d.input('.');assert.equal((await d.state()).turn,before.turn+1);
  }});
  cases.push({id:input_path+'-individual-inscription-replace-clear-cancel',variant:'brogue',input_path,fixture_id:1,feature_ids:['cmd.call','items.knowledge','text.edit'],targets:[],assertions:['Known sword inscription appears in public inventory and replaces only that instance.','Escape keeps the previous inscription and empty Enter clears it without turn/RNG or unrelated item changes.'],execute:async d=>{
    const before=await d.state();await naming(d,'b');await text(d,'blade-note');await inventoryContains(d,'blade-note');await naming(d,'b');await text(d,'second-note');const named=await d.state();assert.equal(item(named,'b').inscription,'second-note');namingUnchanged(before,named,'b');await naming(d,'b');await d.page.locator('#text-value').fill('discarded');await d.input('Escape');await d.settle();assert.deepEqual(observed(await d.state()),observed(named));await naming(d,'b');await text(d,'');const after=await d.state();d.effect(()=>{assert.equal(item(after,'b').inscription,'');namingUnchanged(before,after,'b');});await d.input('.');assert.equal((await d.state()).turn,before.turn+1);
  }});
  cases.push({id:input_path+'-pure-warrior-target-cancel-then-cast',variant:'brogue',input_path,fixture_id:1,feature_ids:['feats','cmd.feats','cmd.apply','target.select'],targets:[{domain:'featTypes',symbol:'FEAT_PURE_WARRIOR'}],assertions:['F initially shows blank status, which is the initial predicate rather than an achieved feat.','Cancelling staff targeting preserves all observed state and blank Pure Warrior status.','Committed staff cast spends a charge/turn and displays a red minus; inspecting feats consumes no turn or RNG.'],execute:async d=>{
    await feats(d,{0:' ',1:' '});const before=await d.state();await d.input('a');await d.input('f');assert.equal((await d.wait()).kind,'target');await d.input('Escape');await d.settle();assert.deepEqual(observed(await d.state()),observed(before));await feats(d,{1:' '});await d.input('a');await d.input('f');await d.input('l');await d.input('Enter');await d.settle();const after=await d.state();d.effect(()=>{assert.equal(item(after,'f').charges,item(before,'f').charges-1);assert.equal(after.turn,before.turn+1);});await feats(d,{0:' ',1:'-'});await d.input('.');assert.equal((await d.state()).turn,after.turn+1);
  }});
  cases.push({id:input_path+'-pure-mage-equipped-then-visible-melee',variant:'brogue',input_path,fixture_id:6,feature_ids:['feats','cmd.feats','cmd.equip','cmd.move','combat'],targets:[{domain:'featTypes',symbol:'FEAT_PURE_MAGE'}],assertions:['Equipping a sword alone leaves Pure Mage blank.','Real movement into an adjacent visible enemy while wielding it changes the public status to red minus, independently of hit/kill.','The feat screen and its dismissal preserve original state; following rest remains live.'],execute:async d=>{
    await feats(d,{0:' ',1:' '});await d.input('e');await d.input('b');await d.settle();assert.equal((await d.state()).weapon,98);await feats(d,{0:' '});let attacked=false;
    for(let n=0;n<6;n++){const s=await d.state(),m=s.monsters[0];assert.ok(m,'Live goblin must remain before intended melee');const dx=Math.sign(m.x-s.x),dy=Math.sign(m.y-s.y),key=({'-1,-1':'y','0,-1':'k','1,-1':'u','-1,0':'h','1,0':'l','-1,1':'b','0,1':'j','1,1':'n'})[[dx,dy].join(',')];assert.ok(key);await d.input(key);await d.settle();if(Math.max(Math.abs(m.x-s.x),Math.abs(m.y-s.y))===1){attacked=true;break;}}
    assert.ok(attacked,'Must reach a real adjacent attack rather than infer it from equipment');const after=await d.state();await feats(d,{0:'-',1:' '});d.effect(()=>assert.ok(after.turn>1));await d.input('.');assert.equal((await d.state()).turn,after.turn+1);
  }});
}
assert.equal(cases.length,8);return cases;}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'knowledge-feats',createCases,filter:process.env.BROGUE_KNOWLEDGE_FEATS});
