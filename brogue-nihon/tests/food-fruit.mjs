// Native fruit nutrition, strict overfeeding boundary and cancellation.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...s})=>s;
const words=s=>s.replace(/\s+/g,' ').trim();
export function createFoodFruitCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);const V=(domain,symbol)=>{const e=inv.definitions[domain].entries.find(e=>e.symbol===symbol);assert.ok(e,domain+':'+symbol);return e.value;};
 const nut=V('statusEffects','STATUS_NUTRITION'),fruit=V('foodKind','FRUIT'),foodCategory=V('itemCategory','FOOD'),pc=new Map(),cases=[];
 const rows=[['stack-dose',S.FRUIT_STACK,300,2,1849],['exact-cap',S.FRUIT_BOUNDARY,600,1,2149],['overflow-cancel',S.FRUIT_OVERFLOW,601,1,2149]];
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const [name,scene,nutrition,quantity,expected]of rows){
  const overflow=nutrition===601,key=variant+'-'+name;
  cases.push({id:variant+'-'+input_path+'-'+name,variant,input_path,fixture_id:scene,feature_ids:['cmd.apply','items.food_weapon_armor',...(overflow?['dialog.ack_confirm']:[])],targets:[{domain:'foodKind',symbol:'FRUIT'}],source_refs:['Items.c:consumePackItem/eat/apply (6670-6709/6842)','Time.c:1971-1978','Monsters.c:initializeStatus; Globals.c:foodTable'],assertions:[
   'Artificial safe room/player40,14HP100/no regen/normal speed/no Amulet/no paralysis/no monsters. Pack contains only native FRUIT(a); direct prepared quantity and current nutrition300/600/601, native maximum nutrition2150 preserved. Do not use fixtureStatus because it overwrites maxStatus. No eat/effect/RNG/turn/flush helper runs during preparation.',
   'Actual apply a then item a must consume fruit. Native food1550 at nutrition300 changes settled nutrition to1849 after one ordinary tick and stack2→1. Nutrition600 exactly fits stomach2150 and must bypass confirmation, settle2149 and remove last item. This proves dose, quantity decrement and strict boundary without claiming stack creation/merge.',
   'Nutrition601 must present original mango overfeeding confirm. Actual n cancellation and independent Escape cancellation each preserve complete semantic state/RNG; reselect each time, then actual y consumes the last fruit and settles2149/one turn. Public item candidate and confirm owner are checked. No confirmation is fabricated or bypassed.',
   'Success requires original public My, what a yummy mango!, exact settled nutrition/quantity/turn/absolute cost, stable HP/position/otherstatuses, native maximum2150 in all frames, and PC/touch full initial/final state/RNG equality. Generated fresh nutrition values are retained but pre-tick1850/2150 frame is not mandatory because ordinary eating has no forced flush. Natural food generation, starvation/forced eating, all nutrition, integer overflow and enum count boundaries remain unconfirmed.'
  ],execute:async d=>{
   const b=await d.state(),food=s=>s.pack.find(i=>i.category===foodCategory&&i.kind===fruit);
   assert.deepEqual([b.x,b.y,b.hp,b.maxHP],[40,14,100,100]);assert.equal(b.regenPerTurn,0);assert.equal(b.movementSpeed,100);assert.equal(b.attackSpeed,100);assert.equal(b.monsters.length,0);assert.equal(b.floor.length,0);assert.equal(b.pack.length,1);assert.equal(food(b).quantity,quantity);assert.equal(b.statuses[nut],nutrition);assert.equal(b.maxStatuses[nut],2150);assert.equal(b.status.nutrition,nutrition);for(let i=0;i<b.statuses.length;i++)if(i!==nut)assert.equal(b.statuses[i],0);
   if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   d.entry.cancellations=[];
   if(overflow)for(const cancel of ['n','Escape']){
    const t=await d.trace(),ev=t.native_trace.length;await d.apply();assert.equal((await d.wait()).kind,'confirm');assert.match(words(await publicText(d)),/not hungry enough to fully enjoy the mango.*Eat it anyway\?/is);await d.screenshot('overflow-before-'+cancel);assert.deepEqual(physical(await d.state()),physical(b));await d.input(cancel);await d.settle();assert.deepEqual(physical(await d.state()),physical(b));const events=(await d.trace()).native_trace.slice(ev);assert.deepEqual(events.map(e=>e.event.slice(0,2)),[[0,97],[0,97],[0,cancel==='n'?110:27]]);d.entry.cancellations.push({key:cancel,state_rng_unchanged:true,actual_events:events.length});await d.screenshot('overflow-cancelled-'+cancel);
   }
   const t=await d.trace(),start=t.observations.length,ev=t.native_trace.length;await d.apply();
   if(overflow){assert.equal((await d.wait()).kind,'confirm');assert.match(words(await publicText(d)),/not hungry enough to fully enjoy the mango.*Eat it anyway\?/is);await d.screenshot('overflow-before-yes');await d.input('y');}else assert.equal((await d.wait()).kind,'command','Exact fit and hungry fruit must not ask for overfeeding confirmation');
   await d.settle();const a=await d.state(),tr=await d.trace(),fresh=tr.observations.slice(start);assert.ok(fresh.length);assert.equal(a.ended,0);assert.equal(a.turn,b.turn+1);assert.equal(a.absoluteTurnNumber,b.absoluteTurnNumber+1);assert.deepEqual([a.x,a.y,a.hp,a.maxHP,a.depth],[40,14,100,100,b.depth]);assert.equal(a.statuses[nut],expected);assert.equal(a.status.nutrition,expected);assert.equal(a.maxStatuses[nut],2150);assert.equal(a.monsters.length,0);assert.equal(a.floor.length,0);
   if(quantity===2){assert.equal(a.pack.length,1);assert.equal(food(a).quantity,1);assert.equal(a.statuses[nut]-b.statuses[nut]+1,1550);}else{assert.equal(a.pack.length,0);assert.equal(food(a),undefined);}
   const values=[];for(const o of [...fresh,a]){assert.deepEqual([o.x,o.y,o.hp,o.depth],[40,14,100,b.depth]);assert.equal(o.monsters.length,0);assert.equal(o.maxStatuses[nut],2150);assert.ok([nutrition,Math.min(nutrition+1550,2150),expected].includes(o.statuses[nut]));for(let j=0;j<o.statuses.length;j++)if(j!==nut)assert.equal(o.statuses[j],b.statuses[j]);values.push(o.statuses[nut]);}
   assert.match(words(await publicText(d)),/My,\s*what a yummy mango!/);const events=tr.native_trace.slice(ev);assert.deepEqual(events.map(e=>e.event.slice(0,2)),[[0,97],[0,97],...(overflow?[[0,121]]:[])]);d.entry.nutrition_observations=values;d.entry.consumption={before_nutrition:nutrition,after_nutrition:a.statuses[nut],before_quantity:quantity,after_quantity:food(a)?.quantity||0,observation_start:start,observation_end:tr.observations.length,actual_events:events.length};
   d.effect(()=>assert.equal(a.statuses[nut],expected));await d.screenshot('actual-fruit-consumed');const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,6*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'food-fruit',createCases:createFoodFruitCases,filter:process.env.BROGUE_FOOD_FRUIT});
