// Native zero-damage Wisp melee ignition, fire immunity and real expiry.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...state})=>state;
const hit=/wisp (?:scorches|burns) you/i;
export function createMonsterBurnCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const e=inv.definitions[domain].entries.find(e=>e.symbol===symbol);assert.ok(e,domain+':'+symbol);return e.value;};
 const Z=s=>V('statusEffects','STATUS_'+s),T=s=>V('tileType',s),pc=new Map(),cases=[];
 const rows=[['unprotected',S.BURN_UNPROTECTED,0],['fire-immunity',S.BURN_IMMUNE,20],['fire-immunity-expiry',S.BURN_EXPIRY,4]],walls=[[40,13],[41,13],[42,13],[42,14],[42,15],[41,15],[40,15]],innate=new Set(['BURNING','LEVITATING','IMMUNE_TO_FIRE','NUTRITION'].map(Z)),isFire=V('terrainFlagCatalog','T_IS_FIRE');
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const [kind,[name,scene,immune]]of rows.entries()){
  const key=variant+'-'+name;
  cases.push({id:variant+'-'+input_path+'-'+name,variant,input_path,fixture_id:scene,feature_ids:['ai.monsters','ai.flags_bolts','combat','cmd.rest','statuses'],targets:[{domain:'monsterTypes',symbol:'MK_WILL_O_THE_WISP'},{domain:'monsterAbilityFlags',symbol:'MA_HIT_BURN'},...(kind!==1?[{domain:'statusEffects',symbol:'STATUS_BURNING'}]:[]),...(kind>0?[{domain:'statusEffects',symbol:'STATUS_IMMUNE_TO_FIRE'}]:[])],source_refs:['Globals.c:1071-1072/1243','Monsters.c:3895-3914','Combat.c:420-423','Time.c:28-50/1165/2040-2041/2318-2325/2340-2368','IO.c:2544-2550'],assertions:[
   'Native Wisp HP10, info/flags/FLITS/zero melee damage and initial nutrition1000/permanent burning-levitation-fireimmunity1000 statuses are retained. Only initial position/clock1/seven walls, safe playerHP100/no regen/empty pack, explicit initial player defense0 and optional synthetic fire immunity20 or4 are prepared. No attack/fire/exposure/RNG/turn helper runs in preparation.',
   'Every fresh frame excludes fire terrain/gas/surface around the only actor and player; nonflammable FLOOR and any native blood are allowed. This distinguishes direct MA_HIT_BURN from environmental ignition. FIERY terrain ignition and natural placement are not credited.',
   'Unprotected real melee must visibly ignite atHP100 with native public scorches/burns text; a separate real rest while already burning must deal1..3. Protected control requires an actual first public hit and a completed still-immune rest atHP100/burning0.',
   'Expiry4 additionally requires a completed protected hit/rest, observed immunity0, then actual burning atHP100 and a later real rest dealing1..3. Ignition need not occur at the first immunity0 frame; repeated native hits may refresh burning, so countdown decrease is not required. Old public text alone never proves post-expiry ignition.',
   'Within12 actual rests the appropriate effect must be reached. Initial player speed100/defense0 and no interfering statuses, fixed positions/native actor info, only rest events, one-turn cost and PC/touch full initial/final state/RNG are checked. This is synthetic initial immunity, not natural potion use, all fire immunity branches, allAI or real Safari.'
  ],execute:async d=>{
   const b=await d.state(),m=b.monsters[0];assert.equal(b.hp,100);assert.equal(b.maxHP,100);assert.equal(b.regenPerTurn,0);assert.equal(b.movementSpeed,100);assert.equal(b.playerCombat.defense,0);assert.equal(b.pack.length,0);assert.equal(b.monsters.length,1);assert.deepEqual([b.x,b.y,m.x,m.y],[40,14,41,14]);assert.equal(m.kind,V('monsterTypes','MK_WILL_O_THE_WISP'));assert.equal(m.hp,10);assert.equal(m.maxHP,10);assert.equal(m.ticksUntilTurn,1);assert.equal(m.state,V('creatureStates','MONSTER_TRACKING_SCENT'));assert.equal(m.mode,V('creatureModes','MODE_NORMAL'));assert.equal(m.movementSpeed,100);assert.equal(m.attackSpeed,100);assert.equal(m.leaderIndex,-1);assert.equal(m.mutationIndex,-1);assert.equal(m.carriedItem,null);assert.deepEqual(m.combat,{damageMin:0,damageMax:0,accuracy:100,defense:90});
   assert.equal(m.flags,['MONST_IMMUNE_TO_FIRE','MONST_FLIES','MONST_FLITS','MONST_NEVER_SLEEPS','MONST_FIERY','MONST_DIES_IF_NEGATED'].reduce((v,s)=>v|V('monsterBehaviorFlags',s),0));assert.equal(m.abilityFlags,V('monsterAbilityFlags','MA_HIT_BURN'));
   for(let i=0;i<m.statuses.length;i++){assert.equal(m.statuses[i],innate.has(i)?1000:0);assert.equal(m.maxStatuses[i],m.statuses[i]);}
   for(let i=0;i<b.statuses.length;i++)if(i!==Z('NUTRITION'))assert.equal(b.statuses[i],i===Z('IMMUNE_TO_FIRE')?immune:0);assert.equal(b.maxStatuses[Z('IMMUNE_TO_FIRE')],immune);
   for(const [x,y]of walls){const c=b.cells.find(c=>c.x===x&&c.y===y);assert.ok(c);assert.equal(c.dungeon,T('WALL'));}assert.ok(b.cells.every(c=>!c.surface&&!c.gas&&!c.volume&&!(c.terrainFlags&isFire)));assert.equal(b.playerCell.dungeon,T('FLOOR'));assert.doesNotMatch(await publicText(d),hit);
   if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   let a=b,rests=0,seenPublicHit=false,protectedHit=false,protectedRest=false,expired=immune===0,ignited=false,reached=false;d.entry.witnesses={};d.entry.rest_observations=[];
   for(;rests<12;){
    const before=a,traceBefore=await d.trace(),start=traceBefore.observations.length,eventStart=traceBefore.native_trace.length,burningBefore=before.statuses[Z('BURNING')]>0&&before.statuses[Z('IMMUNE_TO_FIRE')]===0;
    await d.input('.');await d.settle();rests++;a=await d.state();const trace=await d.trace(),fresh=trace.observations.slice(start);assert.ok(fresh.length);assert.ok(trace.native_trace.length>eventStart);for(const e of trace.native_trace.slice(eventStart)){assert.equal(e.event[0],0);assert.equal(e.event[1],46,'Only actual rest events');}
    assert.equal(a.ended,0);assert.equal(a.depth,b.depth);assert.equal(a.turn,b.turn+rests);assert.equal(a.absoluteTurnNumber,b.absoluteTurnNumber+rests);assert.equal(a.movementSpeed,100);assert.deepEqual([a.x,a.y],[b.x,b.y]);assert.equal(a.monsters.length,1);assert.ok(a.hp>0);
    for(const [offset,o]of fresh.entries()){
     assert.deepEqual([o.x,o.y,o.depth],[b.x,b.y,b.depth]);assert.equal(o.monsters.length,1);const n=o.monsters[0];for(const f of ['kind','hp','maxHP','flags','abilityFlags','movementSpeed','attackSpeed'])assert.equal(n[f],m[f]);assert.deepEqual(n.combat,m.combat);assert.deepEqual([n.x,n.y],[m.x,m.y]);for(let i=0;i<n.statuses.length;i++)if(i!==Z('NUTRITION'))assert.equal(n.statuses[i],m.statuses[i]);
     for(let i=0;i<o.statuses.length;i++)if(![Z('NUTRITION'),Z('BURNING'),Z('IMMUNE_TO_FIRE')].includes(i))assert.equal(o.statuses[i],b.statuses[i],'Interfering player status');
     assert.equal(o.playerCell.dungeon,T('FLOOR'));assert.equal(o.playerCell.terrainFlags&isFire,0,'Environmental fire cannot explain ignition');assert.ok(o.gases.every(c=>!(c.terrainFlags&isFire)));assert.ok(o.surfaces.every(c=>!(c.terrainFlags&isFire)));
     const text=o.messageRows.join('\n'),fireImmune=o.statuses[Z('IMMUNE_TO_FIRE')],burning=o.statuses[Z('BURNING')];
     if(fireImmune===0){expired=true;if(kind===2)d.entry.witnesses.expiry??={rest:rests,observation:start+offset};}
     if(hit.test(text)&&!seenPublicHit){seenPublicHit=true;if(fireImmune>0){assert.equal(o.hp,100);assert.equal(burning,0);protectedHit=true;d.entry.witnesses.protected_hit={rest:rests,observation:start+offset,immunity:fireImmune,text};}}
     if(fireImmune>0){assert.equal(o.hp,100);assert.equal(burning,0);}
     if(!ignited&&burning>0){assert.equal(fireImmune,0);assert.equal(o.hp,100,'Zero-damage melee ignites before later burning damage');assert.ok(expired);assert.match(text,hit);if(kind===2)assert.ok(protectedRest,'Must complete an actual protected hit/rest before expiry');assert.ok(burning>=7);ignited=true;d.entry.witnesses.ignition={rest:rests,observation:start+offset,hp:o.hp,burning,text};}
    }
    const text=await publicText(d);if(protectedHit&&a.statuses[Z('IMMUNE_TO_FIRE')]>0&&a.hp===100&&a.statuses[Z('BURNING')]===0){protectedRest=true;d.entry.witnesses.protected_rest??={rest:rests,immunity:a.statuses[Z('IMMUNE_TO_FIRE')],hp:a.hp,text};if(kind===1)reached=true;}
    d.entry.rest_observations.push({rest:rests,hp:a.hp,burning:a.statuses[Z('BURNING')],immunity:a.statuses[Z('IMMUNE_TO_FIRE')],observation_start:start,observation_end:trace.observations.length,text});
    if(kind!==1&&ignited&&burningBefore&&a.hp<before.hp){assert.ok(before.hp-a.hp>=1&&before.hp-a.hp<=3);d.entry.witnesses.burning_damage={rest:rests,beforeHP:before.hp,hp:a.hp,damage:before.hp-a.hp};reached=true;}
    if(ignited&&!d.entry.ignition_screenshot){await d.screenshot('direct-hit-ignition');d.entry.ignition_screenshot=true;}
    if(reached)break;
   }
   d.effect(()=>assert.equal(reached,true,'Native direct burning/protected hit/expiry and subsequent damage not reached within12 real rests'));d.entry.rests=rests;await d.screenshot('burn-immunity-effect');const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,6*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-burn',createCases:createMonsterBurnCases,filter:process.env.BROGUE_MONSTER_BURN});
