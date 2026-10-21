// Original species reflection through actual manual targeting and staff casts.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...state})=>state;
export function createMonsterReflectionCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inventory=generateDataInventory({gitMetadata:false});validateDataSnapshot(inventory);
 const V=(domain,symbol)=>{const entry=inventory.definitions[domain].entries.find(e=>e.symbol===symbol);assert.ok(entry,domain+':'+symbol);return entry.value;};
 const reflect100=V('monsterAbilityFlags','MA_REFLECT_100'),reflect50=V('monsterBehaviorFlags','MONST_REFLECT_50'),pc=new Map(),cases=[];
 const rows=[['guardian','GUARDIAN',S.REFLECT_GUARDIAN,1000],['winged-guardian','WINGED_GUARDIAN',S.REFLECT_WINGED_GUARDIAN,1000],['mirrored-totem','MIRRORED_TOTEM',S.REFLECT_MIRRORED_TOTEM,80],['ogre-control','OGRE',S.REFLECT_OGRE_CONTROL,55],['golem-mixed','GOLEM',S.REFLECT_GOLEM,400]];
 const item=s=>{const a=s.pack.find(x=>x.letter===97);assert.ok(a);return a;};
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const [kind,[name,actor,scene,hp]]of rows.entries()){
  const key=variant+'-'+name;
  cases.push({id:variant+'-'+input_path+'-'+name,variant,input_path,fixture_id:scene,feature_ids:['ai.monsters','ai.flags_bolts','combat','cmd.apply','items.staff_wand_charm','target.select'],targets:[{domain:'monsterTypes',symbol:'MK_'+actor},{domain:'staffKind',symbol:'STAFF_LIGHTNING'},...(kind<3?[{domain:'monsterAbilityFlags',symbol:'MA_REFLECT_100'}]:kind===4?[{domain:'monsterBehaviorFlags',symbol:'MONST_REFLECT_50'}]:[])],source_refs:['Globals.c:1122-1153','Items.c:4209-4245/4395-4462/4927-4960/5244-5246','Combat.c:321-324','PowerTables.c:49-51/109-123','Time.c:1840-1845'],assertions:[
   'Original species info/HP/reflection flags are retained. Only initial position, long clocks/no regen, safe player HP100 and a known +1 lightning staff with artificial over-capacity12 charges/timer1000 isolate passive reflection. No paralysis, AI/reflection/RNG/effect/turn helper is invoked in preparation.',
   'Original autotarget deliberately excludes MA_REFLECT_100. Every cast manually moves the actual public cursor with PC keys or touch direction buttons to43,14, checks no turn/RNG/HP/charge was spent, then uses real Enter. Consumed Enter before-state must carry that exact cursor.',
   'Three 100% species must deflect one actual bolt, keep native HP and deal2..6 to the caster. Ogre control must take2..6, keep caster HP and show no deflection. Golem must reach a returned hit and an unreflected hit within12 casts; random deflection without caster damage is legal. HP differences and each fresh observation interval classify a shot, not stale message text alone.',
   'Every cast consumes1 charge/turn; both sides stay fixed and alive, subject clock stays positive and no interfering status occurs. PC/touch initial/final state and RNG match. No reflection-frequency estimate, normal staff capacity, natural placement/summoning or AI/real Safari certification.'
  ],execute:async d=>{
   const b=await d.state(),m=b.monsters[0],staff=item(b);assert.equal(b.monsters.length,1);assert.equal(b.hp,100);assert.equal(b.maxHP,100);assert.equal(b.regenPerTurn,0);assert.equal(m.kind,V('monsterTypes','MK_'+actor));assert.equal(m.hp,hp);assert.equal(m.maxHP,hp);assert.equal(m.leaderIndex,-1);assert.equal(m.mutationIndex,-1);assert.equal(m.carriedItem,null);assert.equal(m.ticksUntilTurn,10000);assert.equal(m.turnsUntilRegen,100000);assert.equal(m.regenPerTurn,0);assert.equal(m.statuses[V('statusEffects','STATUS_PARALYZED')],0);assert.equal(!!(m.abilityFlags&reflect100),kind<3);assert.equal(!!(m.flags&reflect50),kind===4);assert.equal(staff.category,V('itemCategory','STAFF'));assert.equal(staff.kind,V('staffKind','STAFF_LIGHTNING'));assert.equal(staff.enchant,1);assert.equal(staff.charges,12);assert.equal(staff.rechargeTimer,1000);assert.equal(staff.identified,1);assert.equal(staff.kindKnown,1);assert.deepEqual([m.x,m.y],[43,14]);assert.deepEqual([b.x,b.y],[40,14]);
   if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   let a=b,returned=false,unreflected=false;d.entry.shots=[];const limit=kind===4?12:1;
   for(let shot=1;shot<=limit;shot++){
    const before=a,start=(await d.trace()).observations.length,traceStart=(await d.trace()).native_trace.length;
    await d.apply();assert.equal((await d.wait()).kind,'target');await d.input('h');
    for(let moves=0;moves<16;moves++){const cursor=(await d.state()).cursor;if(cursor.x===43&&cursor.y===14)break;await d.input(cursor.x<43?'l':cursor.x>43?'h':cursor.y<14?'j':'k');}
    const selected=await d.state();assert.deepEqual(selected.cursor,{x:43,y:14});assert.equal(selected.turn,before.turn);assert.equal(selected.rng,before.rng);assert.equal(selected.hp,before.hp);assert.equal(item(selected).charges,item(before).charges);assert.equal(selected.monsters[0].hp,before.monsters[0].hp);assert.deepEqual([selected.x,selected.y],[before.x,before.y]);
    await d.screenshot('manual-target-'+shot);await d.input('Enter');await d.settle();a=await d.state();const n=a.monsters[0],trace=await d.trace(),events=trace.native_trace.slice(traceStart),enter=events.findLast(e=>e.event[0]===0&&e.event[1]===10);assert.ok(enter);assert.deepEqual(enter.before.cursor,{x:43,y:14});assert.equal(a.turn,before.turn+1);assert.equal(a.absoluteTurnNumber,before.absoluteTurnNumber+1);assert.equal(item(a).charges,12-shot);assert.deepEqual([a.x,a.y],[b.x,b.y]);assert.equal(a.monsters.length,1);assert.deepEqual([n.x,n.y],[m.x,m.y]);assert.ok(a.hp>0&&n.hp>0);assert.ok(n.ticksUntilTurn>0);assert.equal(n.kind,m.kind);assert.equal(n.flags,m.flags);assert.equal(n.abilityFlags,m.abilityFlags);assert.deepEqual(n.combat,m.combat);assert.equal(n.movementSpeed,m.movementSpeed);assert.equal(n.attackSpeed,m.attackSpeed);assert.equal(n.regenPerTurn,0);assert.ok(n.turnsUntilRegen>0);
    const observations=trace.observations.slice(start);assert.ok(observations.length>0);for(const o of observations){assert.equal(o.monsters.length,1);assert.deepEqual([o.monsters[0].x,o.monsters[0].y],[m.x,m.y]);assert.ok(o.monsters[0].ticksUntilTurn>0);for(const status of ['PARALYZED','HASTED','SLOWED','POISONED','BURNING','MAGICAL_FEAR','SHIELDED']){const index=V('statusEffects','STATUS_'+status);assert.equal(o.statuses[index],b.statuses[index]);assert.equal(o.monsters[0].statuses[index],m.statuses[index]);}}
    const casterDamage=before.hp-a.hp,targetDamage=before.monsters[0].hp-n.hp,text=await publicText(d),deflect=new RegExp((kind===0?'stone guardian':kind===1?'winged guardian':kind===2?'mirrored totem':kind===4?'golem':'ogre')+' deflects the (?:lightning|bolt)','i').test(text);let outcome;
    if(kind<3){assert.equal(targetDamage,0);assert.ok(casterDamage>=2&&casterDamage<=6);assert.equal(deflect,true);returned=true;outcome='exact return from100percent reflection';}
    else if(kind===3){assert.equal(casterDamage,0);assert.ok(targetDamage>=2&&targetDamage<=6);assert.equal(deflect,false);unreflected=true;outcome='unreflected target hit';}
    else if(targetDamage>0){assert.ok(targetDamage>=2&&targetDamage<=6);assert.equal(casterDamage,0);unreflected=true;outcome='unreflected target hit; older deflect text is not a new reflection';}
    else{assert.equal(targetDamage,0);if(casterDamage>0){assert.ok(casterDamage>=2&&casterDamage<=6);assert.equal(deflect,true);returned=true;outcome='reflected return hit';}else{assert.equal(casterDamage,0);outcome='zero damage; reflection path unconfirmed; no reflection credit';}}
    d.entry.shots.push({shot,observation_start:start,observation_end:trace.observations.length,casterDamage,targetDamage,outcome,reflection_credit:casterDamage>0&&targetDamage===0,public_text:text,subject_clock:n.ticksUntilTurn,charges:item(a).charges});await d.screenshot('bolt-effect-'+shot);
    if(kind!==4||returned&&unreflected)break;
   }
   d.effect(()=>{if(kind<3)assert.ok(returned);else if(kind===3)assert.ok(unreflected);else assert.ok(returned&&unreflected,'Golem returned and nonreflected hit witnesses not both reached within12 casts');});const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,10*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-reflection',createCases:createMonsterReflectionCases,filter:process.env.BROGUE_MONSTER_REFLECTION});
