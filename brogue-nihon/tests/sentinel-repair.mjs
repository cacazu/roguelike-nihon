// Native inanimate Sentinel team repair, cap and transparent ray controls.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...s})=>s,words=s=>s.replace(/\s+/g,' ').trim().toLowerCase();
export function createSentinelRepairCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(d,n)=>{const e=inv.definitions[d].entries.find(e=>e.symbol===n);assert.ok(e,d+':'+n);return e.value;},T=n=>V('tileType',n),nut=V('statusEffects','STATUS_NUTRITION'),leader=V('monsterBookkeepingFlags','MB_LEADER'),follower=V('monsterBookkeepingFlags','MB_FOLLOWER'),pc=new Map(),cases=[];
 const rows=[['uncapped',10,35],['capped',40,50],['full-health-control',50,50],['repair-ray-blocked',10,10]];
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(let code=0;code<rows.length;code++){
  const [name,hp,expectedHP]=rows[code],positive=code<2,key=variant+'-'+name;
  cases.push({id:variant+'-'+input_path+'-'+name,variant,input_path,fixture_id:S.SENTINEL_REPAIR+code,feature_ids:['cmd.rest','ai.monsters','ai.flags_bolts'],targets:positive?[['monsterTypes','MK_SENTINEL'],['boltType','BOLT_HEALING'],['boltEffects','BE_HEALING'],['monsterBehaviorFlags','MONST_CAST_SPELLS_SLOWLY']].map(([domain,symbol])=>({domain,symbol})):[],source_refs:['Monsters.c:monstersAreTeammates/generallyValidBoltTarget/specificallyValidBoltTarget/monstUseBolt/monstersTurn','Items.c:heal/updateBolt BE_HEALING','all3variant:BOLT_HEALING magnitude5','Time.c:playerTurnEnded','Globals.c:native Sentinel and transparent PORTCULLIS_CLOSED'],assertions:[
   'Artificial player40,14HP100def0/no regen/empty pack. Native Sentinel caster44,14WALL/clock1/LEADER and recipient44,16WALL/clock10000/FOLLOWER/leader=caster/initialHP10or40or50. Native info/flags/abilities/speeds/bolts/status/regen0 retained. No damage/heal/cast/AI/effect/RNG helper prepares effects.',
   'Always transparentPORT42,14 blocks player-ray SPARK, secondPORT44,15 only repair-ray negative. Caster actualFOV/publicVisible/TRACKING/stealthRange>=4 and both glyphs/positions are guarded. Recipient initialTRACKING remains artificial delayed data; no actual awareness or recipient ownAI proof.',
   'Real period key/touch centerpad rests. Positive first exact heal within40realrests: 10->35 or40->50 with casts healing/looks healthier publictext. Native magnitude5 heals50% of maxHP50=25, cap applies. Negative8rest fullHP or transparentblockedray preserve recipientHP and have no heal/cast. No reach is diagnosticFAIL, never success.',
   'Caster actualheal rest beforeclock<=100 gives after-before+100=350; noncast due175, before>100 subtract100. Recipient settledclock10000-100*rest>0 and native regen0/turnsUntilRegen0 separate from naturalregen. Transient casterclock33 is allowed; only actual fresh exportfields are guarded, complete-state-only fields checked settled.',
   'Two samekind actors are identified by coordinates, and recipient leaderIndex equals actual current casterarrayindex; generation prepends so index0 is not assumed. Full PC/touch initial/final state/RNG agree. InitialFOLLOWER/LEADER relations give no groupjoining/naturalhorde or recruitment credit, gates give no opening/generation credit. No wholeSentinelAI/mask/naturalspawn or realSafari proof.'
  ],execute:async d=>{
   const b=await d.state(),find=(s,y)=>{const i=s.monsters.findIndex(m=>m.x===44&&m.y===y);assert.ok(i>=0);return {m:s.monsters[i],i};},caster=find(b,14).m,recipient=find(b,16).m,cell=(s,x,y)=>s.cells.find(c=>c.x===x&&c.y===y);
   assert.deepEqual([b.x,b.y,b.hp,b.maxHP,b.monsters.length,b.movementSpeed,b.playerCombat.defense,b.regenPerTurn,b.pack.length,b.weaknessAmount],[40,14,100,100,2,100,0,0,0,0]);assert.deepEqual([b.weapon,b.armor,b.ringLeft,b.ringRight],[0,0,0,0]);assert.deepEqual([caster.hp,recipient.hp,caster.ticksUntilTurn,recipient.ticksUntilTurn],[50,hp,1,10000]);
   const flags=(V('monsterBehaviorFlags','MONST_TURRET')|V('monsterBehaviorFlags','MONST_CAST_SPELLS_SLOWLY')|V('monsterBehaviorFlags','MONST_DIES_IF_NEGATED'))>>>0;
   for(const m of [caster,recipient]){
    assert.deepEqual([m.kind,m.maxHP,m.flags,m.abilityFlags,m.movementSpeed,m.attackSpeed,m.mode,m.mutationIndex,m.regenPerTurn,m.turnsUntilRegen],[V('monsterTypes','MK_SENTINEL'),50,flags,0,100,175,V('creatureModes','MODE_NORMAL'),-1,0,0]);assert.deepEqual(m.combat,{damageMin:0,damageMax:0,accuracy:0,defense:0});assert.deepEqual(m.nativeBolts,[V('boltType','BOLT_HEALING'),V('boltType','BOLT_SPARK'),...Array(18).fill(0)]);assert.equal(m.nativeBloodType,V('dungeonFeatureTypes','DF_RUBBLE_BLOOD'));for(let j=0;j<m.statuses.length;j++)assert.equal(m.statuses[j],j===nut?1000:0);
   }
   for(let j=0;j<b.statuses.length;j++)if(j!==nut)assert.equal(b.statuses[j],0);
   const commonGuard=s=>{
    assert.deepEqual([s.x,s.y,s.hp,s.depth,s.monsters.length],[40,14,100,b.depth,2]);assert.ok(s.stealthRange>=4);const c=find(s,14),r=find(s,16);assert.equal(c.m.hp,50);assert.ok(positive?[hp,expectedHP].includes(r.m.hp):r.m.hp===hp);assert.equal(c.m.bookkeepingFlags&leader,leader);assert.equal(r.m.bookkeepingFlags&follower,follower);assert.equal(c.m.leaderIndex,-1);assert.equal(r.m.leaderIndex,c.i);assert.equal(c.m.leaderIsPlayer,0);assert.equal(r.m.leaderIsPlayer,0);assert.ok(r.m.ticksUntilTurn>0&&r.m.ticksUntilTurn<=10000);
    for(const [n,initial]of [[c.m,caster],[r.m,recipient]]){for(const f of ['kind','x','y','maxHP','flags','abilityFlags','movementSpeed','attackSpeed','mode','mutationIndex','regenPerTurn','turnsUntilRegen','nativeBloodType'])assert.equal(n[f],initial[f]);assert.deepEqual(n.combat,initial.combat);assert.deepEqual(n.nativeBolts,initial.nativeBolts);assert.equal(n.state,V('creatureStates','MONSTER_TRACKING_SCENT'));assert.equal(n.fieldOfView,1);assert.equal(n.publicVisible,1);for(let j=0;j<n.statuses.length;j++)if(j!==nut)assert.equal(n.statuses[j],initial.statuses[j]);}
    for(let j=0;j<s.statuses.length;j++)if(j!==nut)assert.equal(s.statuses[j],b.statuses[j]);
   };
   const settledGuard=(s,rests)=>{
    commonGuard(s);assert.deepEqual([s.maxHP,s.ended,s.inProgress,s.movementSpeed,s.playerCombat.defense,s.pack.length,s.weaknessAmount],[100,0,1,100,0,0,0]);assert.equal(find(s,16).m.ticksUntilTurn,10000-100*rests);for(const y of [14,16])assert.equal(cell(s,44,y).dungeon,T('WALL'));assert.equal(cell(s,42,14).dungeon,T('PORTCULLIS_CLOSED'));assert.equal(cell(s,44,15).dungeon,T(code===3?'PORTCULLIS_CLOSED':'FLOOR'));
   };
   const freshGuard=s=>{commonGuard(s);assert.deepEqual([s.playerCell.x,s.playerCell.y,s.playerCell.dungeon],[40,14,b.playerCell.dungeon]);assert.equal(s.gases.length,0);};
   const shown=async label=>{for(const y of [14,16]){const c=await d.publicCell(65,y+3);assert.deepEqual(c.slice(0,2),[217,223]);assert.ok(Math.max(...c.slice(2,5).map((v,j)=>Math.abs(v-c[j+5])))>0);d.entry.public_actor_cells??=[];d.entry.public_actor_cells.push({label,y,cell:c});}};
   settledGuard(b,0);await shown('initial-sentinels');assert.ok(!words(await publicText(d)).includes('sentinel casts healing'));if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   const start=await d.trace(),ev0=start.native_trace.length;let a=b,healRest=0;d.entry.rest_observations=[];d.entry.actual_heal=null;
   for(let j=0;j<(positive?40:8)&&!healRest;j++){
    const before=a,prior=await d.trace(),os=prior.observations.length,es=prior.native_trace.length;await d.input('.');await d.settle();a=await d.state();const tr=await d.trace(),fresh=tr.observations.slice(os),events=tr.native_trace.slice(es),old=find(before,14).m,now=find(a,14).m,r=find(a,16).m,healed=r.hp>find(before,16).m.hp,text=words(await publicText(d));
    assert.deepEqual(events.filter(e=>e.event[1]!==32).map(e=>e.event.slice(0,2)),[[0,46]]);for(const e of events.filter(e=>e.event[1]===32)){assert.equal(e.event[0],0);assert.equal(e.descriptor[0],6);}assert.deepEqual([a.turn,a.absoluteTurnNumber,a.statuses[nut]],[before.turn+1,before.absoluteTurnNumber+1,before.statuses[nut]-1]);for(const s of fresh)freshGuard(s);settledGuard(a,j+1);
    if(old.ticksUntilTurn>100){assert.equal(now.ticksUntilTurn,old.ticksUntilTurn-100);assert.equal(healed,false);}else assert.equal(now.ticksUntilTurn-old.ticksUntilTurn+100,healed?350:175);
    const row={rest:j+1,caster_clock_before:old.ticksUntilTurn,caster_clock_after:now.ticksUntilTurn,recipient_clock:r.ticksUntilTurn,hp_before:find(before,16).m.hp,hp_after:r.hp,text,fresh_start:os,fresh_end:tr.observations.length,event_start:es,event_end:tr.native_trace.length};d.entry.rest_observations.push(row);
    if(healed){assert.equal(positive,true);assert.equal(r.hp,expectedHP);assert.ok(text.includes('the sentinel casts healing'));assert.ok(text.includes('the sentinel looks healthier'));healRest=j+1;d.entry.actual_heal=row;}else{assert.equal(r.hp,hp);assert.ok(!text.includes('sentinel casts healing'));}
   }
   if(positive)assert.ok(healRest,'Native repair unreached within40realrests; diagnostic only, not pass');else assert.equal(d.entry.rest_observations.length,8);
   await shown('after-actual-repair-or-control');await d.screenshot(positive?'actual-sentinel-repair':code===2?'full-health-no-repair':'transparent-repair-ray-blocked');
   const tr=await d.trace(),events=tr.native_trace.slice(ev0);d.entry.actual_events=events.map(e=>e.event);d.entry.original_acknowledgements=events.filter(e=>e.event[1]===32).length;d.entry.actual_rest_count=d.entry.rest_observations.length;d.entry.heal_rest=healRest;d.effect(()=>assert.equal(find(a,16).m.hp,expectedHP));
   const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,8*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'sentinel-repair',createCases:createSentinelRepairCases,filter:process.env.BROGUE_SENTINEL_REPAIR});
