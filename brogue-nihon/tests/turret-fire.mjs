// Native wall-embedded turret fire and transparent ray obstruction.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...s})=>s,words=s=>s.replace(/\s+/g,' ').trim().toLowerCase();
export function createTurretFireCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(d,n)=>{const e=inv.definitions[d].entries.find(e=>e.symbol===n);assert.ok(e,d+':'+n);return e.value;},T=n=>V('tileType',n),Z=n=>V('statusEffects','STATUS_'+n),nut=Z('NUTRITION'),burn=Z('BURNING'),weak=Z('WEAKENED'),poison=Z('POISONED'),pc=new Map(),cases=[];
 const rows=[
  ['ARROW_TURRET',30,250,90,2,6,['BOLT_DISTANCE_ATTACK'],'shoots an arrow','shoots you',2,6],
  ['SPARK_TURRET',80,150,100,0,0,['BOLT_SPARK'],'shoots a spark','spark hits you',2,6],
  ['DART_TURRET',20,250,140,1,2,['BOLT_POISON_DART'],'fires a dart','pricks you',1,2],
  ['FLAME_TURRET',40,250,150,1,2,['BOLT_FIRE'],'casts a gout of flame','flame hits you',4,14],
  ['SENTINEL',50,175,0,0,0,['BOLT_HEALING','BOLT_SPARK'],'shoots a spark','spark hits you',2,6]
 ];
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(let index=0;index<rows.length;index++)for(const blocked of [false,true]){
  const [symbol,hp,speed,accuracy,low,high,bolts,cast,hit,minDamage,maxDamage]=rows[index],name=symbol.toLowerCase(),key=variant+'-'+name+'-'+blocked,scene=S.TURRET_FIRE_ARROW+2*index+Number(blocked),weakDuration=({brogue:300,rapid_brogue:100,bullet_brogue:50})[variant],targetBolt=bolts.at(-1);
  const targets=blocked?[]:[['monsterTypes','MK_'+symbol],['boltType',targetBolt],['boltEffects',index===0||index===2?'BE_ATTACK':'BE_DAMAGE'],...(index===2?[['monsterAbilityFlags','MA_CAUSES_WEAKNESS'],['statusEffects','STATUS_WEAKENED']]:index===3?[['statusEffects','STATUS_BURNING']]:index===4?[['monsterBehaviorFlags','MONST_CAST_SPELLS_SLOWLY']]:[])];
  cases.push({id:variant+'-'+input_path+'-'+name+'-'+(blocked?'transparent-gate-blocked':'wall-origin-hit'),variant,input_path,fixture_id:scene,feature_ids:['cmd.rest','ai.monsters','ai.flags_bolts',...(blocked?[]:['combat',...(index===2||index===3?['statuses']:[])])],targets:targets.map(([domain,symbol])=>({domain,symbol})),source_refs:['Monsters.c:awareOfTarget/updateMonsterState/generallyValidBoltTarget/monstUseBolt/monsterCastSpell/monstMoves','Combat.c:hitProbability/attack','Items.c:weaken/zap/updateBolt','Time.c:playerTurnEnded/decrementPlayerStatus','Globals.c:PORTCULLIS_CLOSED and native monster rows','variants/GlobalsBrogue/Rapid/Bullet:onHitWeakenDuration and boltCatalog'],assertions:[
   'Artificial player40,14HP100def0/no regen/empty pack, native TRACKING actor44,14 in WALL/clock1. Native info/HP/flags/abilities/status/combat/20bolts/blood/speeds retained. Transparent closedportcullis42,14 only in negative. No AI/cast/attack/damage/status/effect/RNG helpers prepare effects.',
   'Real period key or touch center-pad rests. Initial/every fresh/every settled actor visible/FOV1/TRACKING, stealthRange>=4, both positions stable. Transparent gate preserves vision while original openPathBetween rejects ray. Gate data gives no natural generation/open-close primitive credit.',
   'Positive bounded40rest ends at first actual hit with new native caster/bolt/hit public text and damage. Arrow native misses are legal, saved without hit credit; miss-only/no-cast bound fails as unreached diagnostic. Spark/Sentinel2..6, Arrow2..6, Dart1..2/weakness0->1/maxduration300CE100Rapid50Bullet/currentD or D-1/poison0, Flame4..14/BURN7.',
   'For every settled real rest beforeclock>100 means after=before-100, otherwise after-before+100 is nativeattackSpeed; Sentinel actualcast uses350 versus idle175. Animation freshclock33 is legitimate and not a final cooldown. Flame firsthit hasclock151..250; exactly one extra realrest then no NPC action/clock-100, burn-only1..3HP and7->6.',
   'Negative8realrests require HP/status/weakness unchanged exceptnutrition and native clock/range evolution; no public cast. Fresh count may be0 on idle, settled snapshots always checked. Full PC/touch initial/final semantic state and RNG agree. No wholeIMMOBILE/TURRETmask, naturalmachines, Sentinel allyhealing, terrainfire/smoke or realSafari proof.'
  ],execute:async d=>{
   const b=await d.state(),m=b.monsters[0],cell=(s,x)=>s.cells.find(c=>c.x===x&&c.y===14),expectedFlags=(V('monsterBehaviorFlags','MONST_TURRET')|(index===4?V('monsterBehaviorFlags','MONST_CAST_SPELLS_SLOWLY')|V('monsterBehaviorFlags','MONST_DIES_IF_NEGATED'):0))>>>0;
   assert.deepEqual([b.x,b.y,b.hp,b.maxHP,b.monsters.length,b.movementSpeed,b.pack.length,b.weaknessAmount],[40,14,100,100,1,100,0,0]);assert.equal(b.playerCombat.defense,0);assert.equal(b.regenPerTurn,0);assert.deepEqual([b.weapon,b.armor,b.ringLeft,b.ringRight],[0,0,0,0]);
   assert.deepEqual([m.kind,m.x,m.y,m.hp,m.maxHP,m.movementSpeed,m.attackSpeed,m.ticksUntilTurn],[V('monsterTypes','MK_'+symbol),44,14,hp,hp,100,speed,1]);assert.equal(m.flags,expectedFlags);assert.equal(m.abilityFlags,index===2?V('monsterAbilityFlags','MA_CAUSES_WEAKNESS'):0);assert.equal(m.mode,V('creatureModes','MODE_NORMAL'));assert.equal(m.mutationIndex,-1);assert.deepEqual(m.combat,{damageMin:low,damageMax:high,accuracy,defense:0});assert.deepEqual(m.nativeBolts,[...bolts.map(n=>V('boltType',n)),...Array(20-bolts.length).fill(0)]);assert.equal(m.nativeBloodType,index===4?V('dungeonFeatureTypes','DF_RUBBLE_BLOOD'):0);
   for(let j=0;j<b.statuses.length;j++)if(j!==nut)assert.equal(b.statuses[j],0);for(let j=0;j<m.statuses.length;j++)assert.equal(m.statuses[j],j===nut?1000:0);
   assert.equal(cell(b,44).dungeon,T('WALL'));assert.equal(cell(b,42).dungeon,T(blocked?'PORTCULLIS_CLOSED':'FLOOR'));for(const c of b.cells){assert.equal(c.surface,T('NOTHING'));assert.equal(c.gas,T('NOTHING'));}
   const commonGuard=s=>{
    assert.deepEqual([s.x,s.y,s.depth,s.monsters.length],[40,14,b.depth,1]);assert.ok(s.hp>=83&&s.hp<=100);assert.ok(s.stealthRange>=4);assert.equal(s.statuses[poison],0);
    const n=s.monsters[0];for(const f of ['kind','x','y','hp','maxHP','flags','abilityFlags','movementSpeed','attackSpeed','mode','mutationIndex','regenPerTurn','nativeBloodType'])assert.equal(n[f],m[f]);assert.deepEqual(n.combat,m.combat);assert.deepEqual(n.nativeBolts,m.nativeBolts);assert.equal(n.state,V('creatureStates','MONSTER_TRACKING_SCENT'));assert.equal(n.fieldOfView,1);assert.equal(n.publicVisible,1);assert.equal(n.leaderIndex,-1);assert.equal(n.leaderIsPlayer,0);
    for(let j=0;j<n.statuses.length;j++)if(j!==nut)assert.equal(n.statuses[j],m.statuses[j]);for(let j=0;j<s.statuses.length;j++)if(j!==nut&&!(!blocked&&index===2&&j===weak)&&!(!blocked&&index===3&&j===burn))assert.equal(s.statuses[j],b.statuses[j]);
    if(!blocked&&index===2){assert.ok([0,weakDuration,weakDuration-1].includes(s.statuses[weak]));assert.ok([b.maxStatuses[weak],weakDuration].includes(s.maxStatuses[weak]));}
    if(!blocked&&index===3){assert.ok([0,6,7].includes(s.statuses[burn]));assert.ok([b.maxStatuses[burn],7].includes(s.maxStatuses[burn]));}
   };
   const settledGuard=s=>{
    commonGuard(s);assert.deepEqual([s.maxHP,s.ended,s.inProgress,s.movementSpeed,s.playerCombat.defense,s.pack.length],[100,0,1,100,0,0]);assert.ok(!blocked&&index===2?[0,1].includes(s.weaknessAmount):s.weaknessAmount===0);assert.equal(cell(s,44).dungeon,T('WALL'));assert.equal(cell(s,42).dungeon,T(blocked?'PORTCULLIS_CLOSED':'FLOOR'));
   };
   const freshGuard=s=>{
    commonGuard(s);assert.deepEqual([s.playerCell.x,s.playerCell.y,s.playerCell.dungeon],[40,14,b.playerCell.dungeon]);assert.equal(s.gases.length,0);
   };
   const glyph=index===4?[217,223]:[205,9679],shown=async label=>{const c=await d.publicCell(65,17);assert.deepEqual(c.slice(0,2),glyph);assert.ok(Math.max(...c.slice(2,5).map((v,j)=>Math.abs(v-c[j+5])))>0);d.entry.public_actor_cells??=[];d.entry.public_actor_cells.push({label,cell:c});};settledGuard(b);await shown('initial-wall-caster');
   if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   const start=await d.trace(),ev0=start.native_trace.length;let a=b,hitRest=0,firstMiss=false;d.entry.rest_observations=[];d.entry.arrow_first_miss=null;d.entry.actual_hit=null;
   const rest=async phase=>{
    const before=a,prior=await d.trace(),os=prior.observations.length,es=prior.native_trace.length;await d.input('.');await d.settle();a=await d.state();const after=await d.trace(),fresh=after.observations.slice(os),events=after.native_trace.slice(es),text=words(await publicText(d)),loss=before.hp-a.hp;
    assert.deepEqual(events.filter(e=>e.event[1]!==32).map(e=>e.event.slice(0,2)),[[0,46]]);for(const e of events.filter(e=>e.event[1]===32)){assert.equal(e.event[0],0);assert.equal(e.descriptor[0],6);}
    assert.deepEqual([a.turn,a.absoluteTurnNumber,a.statuses[nut]],[before.turn+1,before.absoluteTurnNumber+1,before.statuses[nut]-1]);for(const s of fresh)freshGuard(s);settledGuard(a);
    const oldClock=before.monsters[0].ticksUntilTurn,newClock=a.monsters[0].ticksUntilTurn,castThisRest=phase==='seek-hit'&&loss>0;
    if(oldClock>100)assert.equal(newClock,oldClock-100);else assert.equal(newClock-oldClock+100,index===4&&castThisRest?350:speed);
    if(blocked){assert.equal(a.hp,100);assert.equal(a.weaknessAmount,0);for(let j=0;j<a.statuses.length;j++)if(j!==nut)assert.equal(a.statuses[j],b.statuses[j]);assert.ok(!text.includes(name.replaceAll('_',' ')+' '+cast));}
    const row={rest:d.entry.rest_observations.length+1,phase,clock_before:oldClock,clock_after:newClock,hp_before:before.hp,hp_after:a.hp,loss,statuses:a.statuses,maxStatuses:a.maxStatuses,weaknessAmount:a.weaknessAmount,text,fresh_start:os,fresh_end:after.observations.length,event_start:es,event_end:after.native_trace.length};d.entry.rest_observations.push(row);
    if(!blocked&&index===0&&!firstMiss&&a.hp===100&&text.includes('arrow turret shoots an arrow')&&text.includes('missed you')){firstMiss=true;d.entry.arrow_first_miss=row;await d.screenshot('first-actual-arrow-miss');}
    return row;
   };
   if(blocked){for(let j=0;j<8;j++)await rest('blocked-ray');await shown('after-eight-blocked-rests');await d.screenshot('transparent-gate-no-cast');}
   else{
    for(let j=0;j<40&&!hitRest;j++){const row=await rest('seek-hit');if(row.loss>0){assert.ok(row.loss>=minDamage&&row.loss<=maxDamage);assert.ok(row.text.includes(name.replaceAll('_',' ')+' '+cast));assert.ok(row.text.includes(hit));hitRest=row.rest;d.entry.actual_hit=row;}}
    assert.ok(hitRest,'Native hit unreached within40realrests; diagnostic only, not a pass');assert.equal(a.hp,100-d.entry.actual_hit.loss);
    if(index===2){assert.equal(a.weaknessAmount,1);assert.equal(a.maxStatuses[weak],weakDuration);assert.ok([weakDuration,weakDuration-1].includes(a.statuses[weak]));assert.ok(d.entry.actual_hit.text.includes('your muscles weaken'));d.entry.weakness_current_branch=a.statuses[weak]===weakDuration?'duration':'duration-minus-one';}
    if(index===3){assert.equal(a.statuses[burn],7);assert.equal(a.maxStatuses[burn],7);assert.ok(d.entry.actual_hit.text.includes('you catch fire'));assert.ok(a.monsters[0].ticksUntilTurn>=151&&a.monsters[0].ticksUntilTurn<=250);await d.screenshot('actual-flame-hit-burning-seven');const row=await rest('burn-only-next-rest');assert.ok(row.loss>=1&&row.loss<=3);assert.equal(a.statuses[burn],6);assert.equal(a.maxStatuses[burn],7);d.entry.burn_only_rest=row;}
    await shown('after-original-wall-origin-hit');await d.screenshot('actual-native-wall-origin-hit');
   }
   const tr=await d.trace(),events=tr.native_trace.slice(ev0);d.entry.actual_events=events.map(e=>e.event);d.entry.original_acknowledgements=events.filter(e=>e.event[1]===32).length;d.entry.actual_rest_count=d.entry.rest_observations.length;d.entry.hit_rest=hitRest;
   d.effect(()=>blocked?assert.equal(a.hp,100):assert.ok(d.entry.actual_hit.loss>=minDamage));const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,20*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'turret-fire',createCases:createTurretFireCases,filter:process.env.BROGUE_TURRET_FIRE});
