// Original flight/corner/fear decisions reached by actual PC and touch rests.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...state})=>state;
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function createMonsterFlightCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inventory=generateDataInventory({gitMetadata:false});validateDataSnapshot(inventory);
 const V=(domain,symbol)=>{const entry=inventory.definitions[domain].entries.find(e=>e.symbol===symbol);assert.ok(entry,domain+':'+symbol);return entry.value;};
 const nutrition=V('statusEffects','STATUS_NUTRITION'),fear=V('statusEffects','STATUS_MAGICAL_FEAR'),flee=V('creatureStates','MONSTER_FLEEING'),track=V('creatureStates','MONSTER_TRACKING_SCENT'),normal=V('creatureModes','MODE_NORMAL'),permanent=V('creatureModes','MODE_PERM_FLEEING'),pc=new Map(),pairs=new Map(),cases=[];
 const conditions=[['open-retreat',S.FLIGHT_OPEN],['corner-counterattack',S.FLIGHT_CORNER],['fear-corner-normal-expiry',S.FLIGHT_FEAR_NORMAL],['fear-corner-permanent-expiry',S.FLIGHT_FEAR_PERMANENT]];
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const [kind,[name,scene]]of conditions.entries()){
  const isFear=kind>=2,key=variant+'-'+name,pair=variant+'-'+input_path;
  cases.push({id:variant+'-'+input_path+'-'+name,variant,input_path,fixture_id:scene,feature_ids:['ai.monsters','cmd.rest',...(kind>0?['combat']:[]),...(isFear?['statuses']:[])],targets:[{domain:'monsterTypes',symbol:'MK_MONKEY'},{domain:'creatureStates',symbol:'MONSTER_FLEEING'},...(isFear?[{domain:'statusEffects',symbol:'STATUS_MAGICAL_FEAR'},{domain:'creatureModes',symbol:kind===2?'MODE_NORMAL':'MODE_PERM_FLEEING'}]:[])],source_refs:['Globals.c:1035-1036/1183-1185','Monsters.c:1736-1739/1783-1800/1942-1949/3481-3510'],assertions:[
   'Artificial initial fleeing/mode/fear4/carried3darts/clock1 and optional seven walls isolate original Monkey behavior. Original monster info, HP, regen and speeds are preserved; safety/AI/fear/attack/turn helpers are never invoked in preparation.',
   'An actual first open rest must move away without damage. Cornered permanent flight must produce a public native attack, HP loss, fixed positions and fear0 within8 rests. Merely preparing FLEEING does not pass.',
   'While fear>0 every observed frame must retain player HP100. After real fear expiry a native attack must occur within8 rests: NORMAL is TRACKING, PERMANENT returns to FLEEING after its real NPC action. The immediate fear0 intermediate TRACKING frame is allowed for both modes; no fixed fear decrement/rest cadence is assumed.',
   'When both controls are selected, fear NORMAL/PERM initial state and RNG match after only fixture/mode normalization; unselected counterpart is explicitly recorded as not compared. PC/touch initial/final state and RNG match. Synthetic fear is not natural fear application, horde generation or ordinary-play proof.'
  ],execute:async d=>{
   const b=await d.state(),m=b.monsters[0];assert.equal(b.monsters.length,1);assert.equal(b.hp,100);assert.equal(b.maxHP,100);assert.equal(b.regenPerTurn,0);assert.equal(b.pack.length,0);assert.equal(m.kind,V('monsterTypes','MK_MONKEY'));assert.equal(m.hp,12);assert.equal(m.maxHP,12);assert.equal(m.flags,0);assert.equal(m.abilityFlags,V('monsterAbilityFlags','MA_HIT_STEAL_FLEE'));assert.equal(m.movementSpeed,100);assert.equal(m.attackSpeed,100);assert.deepEqual(m.combat,{damageMin:1,damageMax:3,accuracy:100,defense:17});assert.equal(m.leaderIndex,-1);assert.equal(m.mutationIndex,-1);assert.equal(m.ticksUntilTurn,1);assert.equal(m.state,flee);assert.equal(m.mode,kind===2?normal:permanent);assert.equal(distance(m,b),1);
   assert.equal(m.carriedItem.category,V('itemCategory','WEAPON'));assert.equal(m.carriedItem.kind,V('weaponKind','DART'));assert.equal(m.carriedItem.quantity,3);for(let i=0;i<m.statuses.length;i++)assert.equal(m.statuses[i],i===nutrition?1000:i===fear&&isFear?4:0,'Unexpected initial monster status');
   for(const [x,y]of [[40,13],[41,13],[42,13],[42,14],[42,15],[41,15],[40,15]]){const cell=b.cells.find(c=>c.x===x&&c.y===y);assert.ok(cell);assert.equal(cell.dungeon,V('tileType',kind===0?'FLOOR':'WALL'));assert.deepEqual([cell.liquid,cell.surface,cell.gas],[0,0,0]);}
   if(kind===2)pairs.set(pair,b);else if(kind===3){const normalize=s=>{const value=structuredClone(physical(s));value.fixture=0;value.monsters[0].mode=normal;return value;};if(pairs.has(pair)){assert.deepEqual(normalize(b),normalize(pairs.get(pair)),'Fear mode controls differ beyond fixture and mode');d.entry.initial_mode_pair='all state/RNG matched after only fixture/mode normalization';}else d.entry.initial_mode_pair='NORMAL counterpart not selected; no mode-pair comparison';}
   if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   let a=b,reached=false,rests=0,sawFear=false,protectedRest=false;d.entry.rest_observations=[];
   for(;rests<8;){await d.input('.');await d.settle();rests++;a=await d.state();const n=a.monsters[0];assert.equal(a.ended,0);assert.equal(a.depth,b.depth);assert.equal(a.turn,b.turn+rests);assert.equal(a.monsters.length,1);assert.deepEqual([a.x,a.y],[b.x,b.y]);assert.equal(n.hp,m.hp);assert.equal(n.carriedItem.quantity,3);assert.equal(n.carriedItem.kind,m.carriedItem.kind);assert.equal(n.mode,m.mode);assert.equal(n.flags,m.flags);assert.equal(n.abilityFlags,m.abilityFlags);assert.equal(n.movementSpeed,m.movementSpeed);assert.equal(n.attackSpeed,m.attackSpeed);assert.deepEqual(n.combat,m.combat);
    for(const o of (await d.trace()).observations){assert.equal(o.monsters.length,1);const observed=o.monsters[0];assert.equal(observed.hp,m.hp);assert.equal(observed.carriedItem.quantity,3);for(let i=0;i<observed.statuses.length;i++)if(i!==fear&&i!==nutrition)assert.equal(observed.statuses[i],0,'Interfering monster status');for(let i=0;i<o.statuses.length;i++)if(i!==nutrition)assert.equal(o.statuses[i],b.statuses[i],'Interfering player status');if(observed.statuses[fear]>0){sawFear=true;assert.equal(o.hp,b.hp,'Magically fearful monster attacked before expiry');}}
    if(isFear&&n.statuses[fear]>0){assert.equal(a.hp,b.hp);protectedRest=true;}
    d.entry.rest_observations.push({rest:rests,hp:a.hp,state:n.state,mode:n.mode,fear:n.statuses[fear],x:n.x,y:n.y,ticksUntilTurn:n.ticksUntilTurn});
    if(kind===0){assert.ok(distance(n,a)>distance(m,b),'First actual safety-map retreat must increase separation');assert.equal(a.hp,b.hp);assert.equal(n.state,flee);assert.equal(n.statuses[fear],0);reached=true;break;}
    assert.deepEqual([n.x,n.y],[m.x,m.y],'Cornered subject escaped blocked cells');
    if(a.hp<b.hp){assert.equal(n.statuses[fear],0);assert.ok(b.hp-a.hp>=1&&b.hp-a.hp<=3);assert.equal(n.state,kind===2?track:flee,'Compare modes only after the actual post-expiry NPC attack');const text=await publicText(d);assert.match(text,/monkey (?:tweaks|bites|punches) you/i);if(isFear){assert.ok(sawFear,'Must observe real fear before its expiry');assert.ok(protectedRest,'At least one completed real rest must retain fear and protect player HP before expiry');}d.entry.native_counterattack={rest:rests,damage:b.hp-a.hp,text,fear:n.statuses[fear],state:n.state,mode:n.mode};reached=true;break;}
    if(!isFear)assert.equal(n.state,flee);
    if(isFear&&n.statuses[fear]>0&&rests===1)await d.screenshot('fear-prevents-corner-attack');
   }
   d.effect(()=>assert.equal(reached,true,'Original flight/counterattack/expiry not reached within8 real rests'));d.entry.rests=rests;await d.screenshot('flight-effect');const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,8*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-flight',createCases:createMonsterFlightCases,filter:process.env.BROGUE_MONSTER_FLIGHT});
