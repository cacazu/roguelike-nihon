// Native Mystic distance maintenance; actual rest-driven movement, no forced AI.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
const physical=({ready,...s})=>s;
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function createMonsterDistanceCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const e=inv.definitions[domain].entries.find(e=>e.symbol===symbol);assert.ok(e,domain+':'+symbol);return e.value;};
 const Z=s=>V('statusEffects','STATUS_'+s),T=s=>V('tileType',s);
 const track=V('creatureStates','MONSTER_TRACKING_SCENT'),flee=V('creatureStates','MONSTER_FLEEING'),normal=V('creatureModes','MODE_NORMAL');
 const maintains=V('monsterBehaviorFlags','MONST_MAINTAINS_DISTANCE'),carry=V('monsterBehaviorFlags','MONST_CARRY_ITEM_25'),avoid=V('monsterAbilityFlags','MA_AVOID_CORRIDORS'),group=V('monsterBookkeepingFlags','MB_LEADER')|V('monsterBookkeepingFlags','MB_FOLLOWER');
 const rows=[['mystic-close',S.DISTANCE_CLOSE,false,2],['mystic-boundary',S.DISTANCE_BOUNDARY,false,3],['kobold-close',S.DISTANCE_KOBOLD,true,2]],pc=new Map(),cases=[];
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const [name,scene,kobold,initialDistance]of rows){
  const key=variant+'-'+name,symbol=kobold?'MK_KOBOLD':'MK_GOBLIN_MYSTIC';
  cases.push({id:variant+'-'+input_path+'-'+name,variant,input_path,fixture_id:scene,feature_ids:['ai.monsters','ai.flags_bolts','cmd.rest'],targets:[{domain:'monsterTypes',symbol},...(!kobold?[{domain:'monsterBehaviorFlags',symbol:'MONST_MAINTAINS_DISTANCE'}]:[])],source_refs:['Monsters.c:1742-1788/2533-2589/2947-2976','Globals.c:1045-1046','Rogue.h:creatureType.bolts[20]'],assertions:[
   'Artificial open safe room, player40,14HP100defense0/no regen/empty pack; one native solo Goblin Mystic distance2 or3, or native Kobold distance2, TRACKING clock1. All native info/HP/flags/abilities/bolts/statuses kept. No AI/pathfinder/getSafetyMap/RNG/effect/turn helper creates the behavior.',
   'Mystic keeps MAINTAINS_DISTANCE|CARRY_ITEM25, MA_AVOID_CORRIDORS and BOLT_SHIELDING. All actor info.bolts[20] are observed by bounded pure reads. No leader/follower/pointer exists, so group corridor avoidance does not apply. Shielding cannot select self or enemy player; no native bolt is removed. No shielding or carried-item lottery credit.',
   'Actual rest must yield Mystic distance2→3/FLEEING→2/TRACKING→3/FLEEING, or distance3→2/TRACKING→3/FLEEING→2/TRACKING. Native safety map may choose a diagonal; require Chebyshev distance and one-cell actual movement rather than a fixed destination. Kobold must actually approach2→1/TRACKING and stops before any attack.',
   'Every actual rest consumes event46 and one turn. Every settled state and generated fresh frame preserve playerHP/position/specialstatuses and actor native info/bolts/HP/specialstatuses/group absence, ordinary mode and no other NPC. Public visible glyph G_GOBLIN_MAGIC/g or G_KOBOLD/k, screenshots and PC/touch complete initial/final state/RNG agree. Natural placement/hordes, protection effects, other casters, surround/retaliation, swarming/allyAI and real Safari remain unconfirmed.'
  ],execute:async d=>{
   const b=await d.state(),m=b.monsters[0];assert.equal(b.monsters.length,1);
   assert.deepEqual([b.x,b.y,m.x,m.y],[40,14,40+initialDistance,14]);assert.equal(b.hp,100);assert.equal(b.maxHP,100);assert.equal(b.regenPerTurn,0);assert.equal(b.playerCombat.defense,0);assert.equal(b.pack.length,0);assert.equal(b.movementSpeed,100);
   assert.equal(m.kind,V('monsterTypes',symbol));assert.equal(m.hp,kobold?7:10);assert.equal(m.maxHP,m.hp);assert.equal(m.ticksUntilTurn,1);assert.equal(m.state,track);assert.equal(m.mode,normal);assert.equal(m.flags,kobold?0:maintains|carry);assert.equal(m.abilityFlags,kobold?0:avoid);assert.equal(m.mutationIndex,-1);assert.equal(m.movementSpeed,100);assert.equal(m.attackSpeed,100);assert.deepEqual(m.combat,kobold?{damageMin:1,damageMax:4,accuracy:80,defense:0}:{damageMin:2,damageMax:4,accuracy:70,defense:10});assert.deepEqual(m.nativeBolts,[kobold?0:V('boltType','BOLT_SHIELDING'),...Array(19).fill(0)]);assert.equal(m.bookkeepingFlags&group,0);assert.equal(m.leaderIndex,-1);assert.equal(m.leaderIsPlayer,0);
   for(let i=0;i<m.statuses.length;i++)assert.equal(m.statuses[i],i===Z('NUTRITION')?1000:0);
   for(const cell of b.cells)assert.equal(cell.terrainFlags&V('terrainFlagCatalog','T_HARMFUL_TERRAIN'),0);
   const publicActor=async(n,label)=>{assert.equal(n.fieldOfView,1);assert.equal(n.publicVisible,1);const cell=await d.publicCell(n.x+21,n.y+3);assert.deepEqual(cell.slice(0,2),kobold?[185,107]:[214,103]);assert.ok(Math.max(...cell.slice(2,5))>=20);d.entry.public_actor_cells??=[];d.entry.public_actor_cells.push({label,x:n.x,y:n.y,cell});};
   await publicActor(m,'initial');if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   const expected=kobold?[[1,track]]:initialDistance===2?[[3,flee],[2,track],[3,flee]]:[[2,track],[3,flee],[2,track]];
   let a=b;d.entry.rest_observations=[];
   for(let i=0;i<expected.length;i++){
    const before=a,old=before.monsters[0],tr=await d.trace(),start=tr.observations.length,ev=tr.native_trace.length;
    await d.input('.');await d.settle();a=await d.state();const after=await d.trace(),fresh=after.observations.slice(start),n=a.monsters[0],events=after.native_trace.slice(ev);
    assert.ok(fresh.length);assert.equal(events.length,1);assert.deepEqual(events[0].event.slice(0,2),[0,46]);assert.equal(a.turn,b.turn+i+1);assert.equal(a.absoluteTurnNumber,b.absoluteTurnNumber+i+1);assert.equal(a.ended,0);assert.equal(a.maxHP,100);assert.equal(distance(old,n),1);assert.equal(distance(a,n),expected[i][0]);assert.equal(n.state,expected[i][1]);assert.ok(n.ticksUntilTurn>0);
    for(const o of [...fresh,a]){assert.deepEqual([o.x,o.y,o.hp,o.depth],[40,14,100,b.depth]);assert.equal(o.monsters.length,1);const v=o.monsters[0];for(const f of ['kind','hp','maxHP','flags','abilityFlags','movementSpeed','attackSpeed','mode','mutationIndex','regenPerTurn'])assert.equal(v[f],m[f]);assert.deepEqual(v.combat,m.combat);assert.deepEqual(v.nativeBolts,m.nativeBolts);assert.equal(v.bookkeepingFlags&group,0);assert.equal(v.leaderIndex,-1);assert.equal(v.leaderIsPlayer,0);for(let j=0;j<v.statuses.length;j++)if(j!==Z('NUTRITION'))assert.equal(v.statuses[j],m.statuses[j]);for(let j=0;j<o.statuses.length;j++)if(j!==Z('NUTRITION'))assert.equal(o.statuses[j],b.statuses[j]);}
    d.entry.rest_observations.push({rest:i+1,before:old,after:n,distance:distance(a,n),observation_start:start,observation_end:after.observations.length});await publicActor(n,'real-rest-'+(i+1));await d.screenshot('actual-distance-step-'+(i+1));
   }
   d.effect(()=>assert.equal(d.entry.rest_observations.length,expected.length));const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,6*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-distance',createCases:createMonsterDistanceCases,filter:process.env.BROGUE_MONSTER_DISTANCE});
