// Native monster whip range5, real approach, opaque-LOS AI and non-whip controls.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...state})=>state;
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function createMonsterWhipCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);const V=(domain,symbol)=>{const e=inv.definitions[domain].entries.find(e=>e.symbol===symbol);assert.ok(e,domain+':'+symbol);return e.value;},Z=s=>V('statusEffects','STATUS_'+s),T=s=>V('tileType',s),pc=new Map(),cases=[];
 const rows=[['range4',S.WHIP_RANGE4,42],['range5-boundary',S.WHIP_RANGE5,43],['range6-approach',S.WHIP_RANGE6,44],['opaque-los-ai-control',S.WHIP_OPAQUE,43],['ogre-melee-control',S.WHIP_OGRE,42]],fire=V('terrainFlagCatalog','T_IS_FIRE');
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const [kind,[name,scene,actorX]]of rows.entries()){
  const wall=kind===3,ogre=kind===4,key=variant+'-'+name,symbol=ogre?'MK_OGRE':'MK_SALAMANDER';
  cases.push({id:variant+'-'+input_path+'-'+name,variant,input_path,fixture_id:scene,feature_ids:['ai.monsters','cmd.rest',...(!wall?['combat','ai.flags_bolts']:[])],targets:wall?[]:[{domain:'monsterTypes',symbol},...(!ogre?[{domain:'monsterAbilityFlags',symbol:'MA_ATTACKS_EXTEND'}]:[])],source_refs:['Globals.c:1061-1062/1082-1083/1228/1261-1263/469/668','Movement.c:638-688','Items.c:3578-3602','Combat.c:1000-1014','Monsters.c:3439-3452/3675-3697'],assertions:[
   'Native Salamander HP60/info/flags/zero FLITS/innate burning-fireimmunity1000/DFChance100 or native Ogre HP55/info/stagger are retained. Only artificial player38,14/HP100/no regen/defense0/empty pack and actor42,43,44/clock1 plus optional WALL40,14 are prepared. HAS_PLAYER is moved directly; no movement/attack/AI/DF/RNG/turn helper runs in preparation.',
   'On the same row an actual range4 or range5 rest must produce public native whips/lashes, direct5..11 damage and no position change. At range6 the first rest must instead approach44→43 without damage, then a later rest must actually whip at range5. Clock movement alone is not whip evidence.',
   'Opaque WALL is only a first-rest LOS/AI negative control with targets[]. Require HP100/no fire, the wall retained and real movement or TRACKING→WANDERING. It gives zero whip-impact credit; later detours/visibility changes are outside this case. The actual whip-wall impact branch remains unconfirmed.',
   'Native Ogre first approaches without distant damage, then must reach an adjacent public9..13 melee hit with the original stagger38→37. This control cannot pass from inactivity or initial flags alone.',
   'Fresh frames guard player no-burning/no-fire terrain, other statuses/actors, native NPC HP/info/flags/speeds and fixed player except actual Ogre stagger. Native non-fire EMBERS/ASH are allowed. Actual rest events/one-turn cost and PC/touch complete initial/final state/RNG are checked. Natural placement/allAI/diagonal rays/all whip obstacles/real Safari remain unconfirmed.'
  ],execute:async d=>{
   const b=await d.state(),m=b.monsters[0],track=V('creatureStates','MONSTER_TRACKING_SCENT');assert.equal(b.hp,100);assert.equal(b.maxHP,100);assert.equal(b.regenPerTurn,0);assert.equal(b.movementSpeed,100);assert.equal(b.playerCombat.defense,0);assert.equal(b.pack.length,0);assert.equal(b.monsters.length,1);assert.deepEqual([b.x,b.y,m.x,m.y],[38,14,actorX,14]);assert.equal(m.kind,V('monsterTypes',symbol));assert.equal(m.hp,ogre?55:60);assert.equal(m.maxHP,m.hp);assert.equal(m.ticksUntilTurn,1);assert.equal(m.state,track);assert.equal(m.mode,V('creatureModes','MODE_NORMAL'));assert.equal(m.movementSpeed,100);assert.equal(m.attackSpeed,ogre?200:100);assert.equal(m.leaderIndex,-1);assert.equal(m.mutationIndex,-1);assert.equal(m.carriedItem,null);assert.deepEqual(m.combat,ogre?{damageMin:9,damageMax:13,accuracy:125,defense:60}:{damageMin:5,damageMax:11,accuracy:150,defense:70});
   const gender=V('monsterBehaviorFlags','MONST_MALE')|V('monsterBehaviorFlags','MONST_FEMALE');if(ogre){assert.equal(m.flags&~gender,0);assert.ok(m.flags&gender);assert.equal(m.abilityFlags,V('monsterAbilityFlags','MA_AVOID_CORRIDORS')|V('monsterAbilityFlags','MA_ATTACKS_STAGGER'));}else{assert.equal(m.flags,['MONST_IMMUNE_TO_FIRE','MONST_SUBMERGES','MONST_NEVER_SLEEPS','MONST_FIERY','MONST_MALE'].reduce((v,s)=>v|V('monsterBehaviorFlags',s),0));assert.equal(m.abilityFlags,V('monsterAbilityFlags','MA_ATTACKS_EXTEND'));}
   for(let i=0;i<m.statuses.length;i++)assert.equal(m.statuses[i],i===Z('NUTRITION')||!ogre&&[Z('BURNING'),Z('IMMUNE_TO_FIRE')].includes(i)?1000:0);
   for(let i=0;i<b.statuses.length;i++)if(i!==Z('NUTRITION'))assert.equal(b.statuses[i],0);assert.equal(b.playerCell.dungeon,T('FLOOR'));assert.ok(b.cells.every(c=>!c.surface&&!c.gas&&!c.volume&&!(c.terrainFlags&fire)));assert.equal(b.cells.find(c=>c.x===40&&c.y===14).dungeon,T(wall?'WALL':'FLOOR'));assert.doesNotMatch(await publicText(d),/salamander (?:whips|lashes) you|ogre (?:cudgels|clubs|batters) you/i);
   if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   let a=b,rests=0,reached=false,approached=false;d.entry.rest_observations=[];
   for(;rests<(wall?1:8);){
    const before=a,tb=await d.trace(),start=tb.observations.length,eventStart=tb.native_trace.length;await d.input('.');await d.settle();rests++;a=await d.state();const tr=await d.trace(),fresh=tr.observations.slice(start),n=a.monsters[0];assert.ok(fresh.length);assert.ok(tr.native_trace.length>eventStart);for(const e of tr.native_trace.slice(eventStart)){assert.equal(e.event[0],0);assert.equal(e.event[1],46,'Only real rest inputs');}
    assert.equal(a.ended,0);assert.equal(a.depth,b.depth);assert.equal(a.turn,b.turn+rests);assert.equal(a.absoluteTurnNumber,b.absoluteTurnNumber+rests);assert.equal(a.movementSpeed,100);assert.equal(a.monsters.length,1);assert.ok(a.hp>0);
    for(const o of fresh){
     assert.equal(o.depth,b.depth);assert.equal(o.y,b.y);assert.ok(o.x===38||ogre&&o.x===37);assert.equal(o.monsters.length,1);const v=o.monsters[0];for(const f of ['kind','hp','maxHP','flags','abilityFlags','movementSpeed','attackSpeed'])assert.equal(v[f],m[f]);assert.deepEqual(v.combat,m.combat);for(let i=0;i<v.statuses.length;i++)if(i!==Z('NUTRITION'))assert.equal(v.statuses[i],m.statuses[i]);
     for(let i=0;i<o.statuses.length;i++)if(i!==Z('NUTRITION'))assert.equal(o.statuses[i],b.statuses[i],'No burning or interfering status');assert.equal(o.playerCell.terrainFlags&fire,0,'Direct attack damage cannot be environmental fire');assert.ok(o.gases.every(c=>!(c.terrainFlags&fire)));assert.ok(o.surfaces.every(c=>!(c.terrainFlags&fire)));
     if(!wall)assert.equal(v.y,14);
    }
    const text=await publicText(d);d.entry.rest_observations.push({rest:rests,hp:a.hp,player:{x:a.x,y:a.y},actor:{x:n.x,y:n.y,state:n.state,ticksUntilTurn:n.ticksUntilTurn},observation_start:start,observation_end:tr.observations.length,text});
    if(wall){assert.equal(a.hp,100);assert.deepEqual([a.x,a.y],[38,14]);assert.equal(a.cells.find(c=>c.x===40&&c.y===14).dungeon,T('WALL'));assert.doesNotMatch(text,/salamander (?:whips|lashes) you/i);assert.ok(distance(n,m)===1||n.state===V('creatureStates','MONSTER_WANDERING'),'Require an actual first-rest AI response behind opaque LOS');d.entry.wall_scope='First-rest opaque LOS/AI only; no whip-impact credit; targets[]';reached=true;break;}
    if(rests===1&&(kind===2||ogre)){assert.equal(a.hp,100);assert.deepEqual([a.x,a.y],[38,14]);assert.deepEqual([n.x,n.y],[actorX-1,14]);assert.doesNotMatch(text,/salamander (?:whips|lashes) you|ogre (?:cudgels|clubs|batters) you/i);approached=true;await d.screenshot('out-of-range-approach');continue;}
    if(a.hp<100){
     if(ogre){assert.ok(approached);assert.ok(100-a.hp>=9&&100-a.hp<=13);assert.deepEqual([before.x,before.y],[38,14]);assert.equal(distance(before.monsters[0],before),1);assert.deepEqual([a.x,a.y,n.x,n.y],[37,14,39,14]);assert.match(text,/ogre (?:cudgels|clubs|batters) you/i);}
     else{if(kind===2)assert.ok(approached);assert.ok(100-a.hp>=5&&100-a.hp<=11);assert.deepEqual([a.x,a.y,n.x,n.y],[38,14,kind===2?43:actorX,14]);assert.deepEqual([n.x,n.y],[before.monsters[0].x,before.monsters[0].y]);assert.equal(distance(n,a),kind===0?4:5);assert.match(text,/salamander (?:whips|lashes) you/i);}
     d.entry.native_attack={rest:rests,damage:100-a.hp,text,player:{x:a.x,y:a.y},actor:{x:n.x,y:n.y}};reached=true;break;
    }
    if(ogre){assert.deepEqual([a.x,a.y],[38,14]);assert.ok(distance(n,a)<distance(before.monsters[0],before),'Native Ogre must actively approach before melee');}else assert.deepEqual([n.x,n.y],[kind===2?43:m.x,m.y],'In-range whip must not silently move');
   }
   d.effect(()=>assert.equal(reached,true,'Native range/approach/melee/opaque AI effect not reached'));d.entry.rests=rests;await d.screenshot('whip-or-control-effect');const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,10*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-whip',createCases:createMonsterWhipCases,filter:process.env.BROGUE_MONSTER_WHIP});
