// Original self-destruct attacks and death features reached by real PC/touch rests.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...state})=>state;
export function createMonsterKamikazeCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const e=inv.definitions[domain].entries.find(e=>e.symbol===symbol);assert.ok(e,domain+':'+symbol);return e.value;};
 const Z=s=>V('statusEffects','STATUS_'+s),T=s=>V('tileType',s),A=s=>V('monsterAbilityFlags','MA_'+s),pc=new Map(),cases=[];
 const rows=[['bloat',S.KAMIKAZE_BLOAT,'MK_BLOAT',4],['explosive-bloat',S.KAMIKAZE_EXPLOSIVE,'MK_EXPLOSIVE_BLOAT',10],['rat-control',S.KAMIKAZE_RAT,'MK_RAT',6]];
 const walls=[[40,13],[41,13],[42,13],[42,14],[42,15],[41,15],[40,15]];
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const [kind,[name,scene,symbol,hp]]of rows.entries()){
  const key=variant+'-'+name;
  cases.push({id:variant+'-'+input_path+'-'+name,variant,input_path,fixture_id:scene,feature_ids:['ai.monsters','ai.flags_bolts','combat','cmd.rest',...(kind<2?['terrain.features','terrain.tiles','statuses']:[])],targets:[{domain:'monsterTypes',symbol},...(kind<2?[{domain:'monsterAbilityFlags',symbol:'MA_KAMIKAZE'},{domain:'monsterAbilityFlags',symbol:'MA_DF_ON_DEATH'},{domain:'dungeonFeatureTypes',symbol:kind===0?'DF_BLOAT_DEATH':'DF_BLOAT_EXPLOSION'},{domain:'tileType',symbol:kind===0?'POISON_GAS':'GAS_EXPLOSION'}]:[])],source_refs:['Globals.c:496-502/1030-1040/1084-1085/1186-1189/1264-1267','Movement.c:463-483','Combat.c:1032-1034/1643-1740','Time.c:300-315/497-513'],assertions:[
   'Safe player HP100/no regen, empty pack, initial native actor at41,14/clock1 and seven surrounding walls isolate original self-destruct contact. Original actor info/HP/flags/statuses/regen/speeds are retained; FLITS is not cleared. No attack/death/DF/RNG/turn helper runs in preparation.',
   'Only actual rest inputs are consumed. Within12 rests a full-HP Bloat must self-destruct and produce its public native death-feature text plus gas/explosion. Disappearance alone never passes. Rat must instead remain alive and deal1..3 damage with public scratch/bite text.',
   'Caustic gas birth at the actor, diffusion to the player and a subsequent real rest causing exactly6 damage are separate witnesses; POISONED must stay0. Explosion must show a fresh50HP loss and explosion immunity; accompanying burning is legal and is not attributed as further explosion damage.',
   'Position/depth, native info and absence of interfering actors/statuses are guarded in fresh frame observations. PC/touch full initial/final state and RNG agree when both are selected. Artificial position/walls are not natural placement, general AI, all explosion immunity branches or real Safari proof.'
  ],execute:async d=>{
   const b=await d.state(),m=b.monsters[0];assert.equal(b.hp,100);assert.equal(b.maxHP,100);assert.equal(b.regenPerTurn,0);assert.equal(b.pack.length,0);assert.equal(b.monsters.length,1);assert.deepEqual([b.x,b.y,m.x,m.y],[40,14,41,14]);assert.equal(m.kind,V('monsterTypes',symbol));assert.equal(m.hp,hp);assert.equal(m.maxHP,hp);assert.equal(m.ticksUntilTurn,1);assert.equal(m.state,V('creatureStates','MONSTER_TRACKING_SCENT'));assert.equal(m.mode,V('creatureModes','MODE_NORMAL'));assert.equal(m.movementSpeed,100);assert.equal(m.attackSpeed,100);assert.equal(m.leaderIndex,-1);assert.equal(m.mutationIndex,-1);assert.equal(m.carriedItem,null);
   assert.equal(m.flags,kind<2?(V('monsterBehaviorFlags','MONST_FLIES')|V('monsterBehaviorFlags','MONST_FLITS')):0);assert.equal(m.abilityFlags,kind<2?(A('KAMIKAZE')|A('DF_ON_DEATH')):0);assert.deepEqual(m.combat,{damageMin:kind===2?1:0,damageMax:kind===2?3:0,accuracy:kind===2?80:100,defense:0});
   for(let i=0;i<m.statuses.length;i++)assert.equal(m.statuses[i],i===Z('NUTRITION')||kind<2&&i===Z('LEVITATING')?1000:0);
   for(let i=0;i<b.statuses.length;i++)if(i!==Z('NUTRITION'))assert.equal(b.statuses[i],0);
   for(const [x,y]of walls){const cell=b.cells.find(c=>c.x===x&&c.y===y);assert.ok(cell);assert.equal(cell.dungeon,T('WALL'));}
   assert.ok(b.cells.every(c=>!c.gas&&!c.surface&&!c.volume));if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial);
   let a=b,dead=false,birth=false,exposed=false,explosion=false,reached=false,rests=0,previousHP=100;d.entry.rest_observations=[];d.entry.witnesses={};
   for(;rests<12;){
    const before=a,traceBefore=await d.trace(),start=traceBefore.observations.length,eventStart=traceBefore.native_trace.length,exposedBefore=dead&&before.playerCell.gas===T('POISON_GAS')&&before.playerCell.volume>0;
    await d.input('.');await d.settle();rests++;a=await d.state();const trace=await d.trace(),fresh=trace.observations.slice(start),events=trace.native_trace.slice(eventStart);assert.ok(fresh.length);assert.ok(events.length);for(const e of events){assert.equal(e.event[0],0);assert.equal(e.event[1],46,'Only real rest events may trigger the effect');}
    assert.equal(a.ended,0);assert.equal(a.depth,b.depth);assert.equal(a.turn,b.turn+rests);assert.equal(a.absoluteTurnNumber,b.absoluteTurnNumber+rests);assert.deepEqual([a.x,a.y],[b.x,b.y]);assert.ok(a.hp>0);assert.ok(a.monsters.length<=1);
    for(const [offset,o]of fresh.entries()){
     assert.deepEqual([o.x,o.y,o.depth],[b.x,b.y,b.depth]);assert.ok(o.monsters.length<=1);
     for(let i=0;i<o.statuses.length;i++)if(i!==Z('NUTRITION')&&!(kind===1&&[Z('BURNING'),Z('EXPLOSION_IMMUNITY')].includes(i)))assert.equal(o.statuses[i],b.statuses[i],'Interfering player status');
     for(const n of o.monsters){assert.equal(n.kind,m.kind);assert.deepEqual([n.x,n.y],[m.x,m.y]);assert.equal(n.maxHP,m.maxHP);assert.equal(n.flags,m.flags);assert.equal(n.abilityFlags,m.abilityFlags);assert.deepEqual(n.combat,m.combat);assert.equal(n.movementSpeed,m.movementSpeed);assert.equal(n.attackSpeed,m.attackSpeed);const dying=n.bookkeepingFlags&(V('monsterBookkeepingFlags','MB_IS_DYING')|V('monsterBookkeepingFlags','MB_HAS_DIED'));if(!dying)assert.equal(n.hp,m.hp,'No player attack or preliminary damage may cause death');}
     if(kind===0?o.gases.some(c=>c.x===41&&c.y===14&&c.gas===T('POISON_GAS')&&c.volume>0):kind===1&&o.surfaces.some(c=>c.x===41&&c.y===14&&c.surface===T('GAS_EXPLOSION'))){birth=true;d.entry.witnesses.birth??={rest:rests,observation:start+offset};}
     if(kind===0&&o.playerCell.gas===T('POISON_GAS')&&o.playerCell.volume>0){exposed=true;d.entry.witnesses.diffusion??={rest:rests,observation:start+offset};}
     if(kind===1&&previousHP-o.hp===50&&o.statuses[Z('EXPLOSION_IMMUNITY')]>0){explosion=true;d.entry.witnesses.explosion={rest:rests,observation:start+offset,beforeHP:previousHP,hp:o.hp,immunity:o.statuses[Z('EXPLOSION_IMMUNITY')],burning:o.statuses[Z('BURNING')]};}
     if(kind===2){assert.equal(o.playerCell.gas,0);assert.ok(o.gases.every(c=>c.gas!==T('POISON_GAS')));assert.ok(o.surfaces.every(c=>c.surface!==T('GAS_EXPLOSION')));}
     previousHP=o.hp;
    }
    const text=await publicText(d);dead=a.monsters.length===0;d.entry.rest_observations.push({rest:rests,hp:a.hp,monsters:a.monsters.length,gas:a.playerCell.gas,volume:a.playerCell.volume,burning:a.statuses[Z('BURNING')],immunity:a.statuses[Z('EXPLOSION_IMMUNITY')],observation_start:start,observation_end:trace.observations.length,text});
    if(kind===0&&dead&&birth&&exposed&&exposedBefore&&a.hp<before.hp){assert.equal(before.hp-a.hp,6,'A full100tick caustic exposure at maxHP100 deals exactly6');assert.equal(a.statuses[Z('POISONED')],0);assert.match(text,/bloat bursts, leaving behind an expanding cloud of caustic gas/i);assert.match(text,/purple gas eating at your flesh/i);d.entry.witnesses.damage={rest:rests,beforeHP:before.hp,hp:a.hp,damage:before.hp-a.hp};reached=true;}
    if(kind===1&&dead&&birth&&explosion){assert.match(text,/explosive bloat detonates with terrifying force/i);assert.match(text,/force of the explosion/i);reached=true;}
    if(kind===2&&a.hp<b.hp){assert.equal(a.monsters.length,1);assert.equal(a.monsters[0].hp,m.hp);assert.ok(b.hp-a.hp>=1&&b.hp-a.hp<=3);assert.match(text,/rat (?:scratches|bites) you/i);reached=true;}
    if(dead&&!d.entry.witnesses.death){d.entry.witnesses.death={rest:rests,observation_end:trace.observations.length,text};await d.screenshot('native-self-destruct');}
    if(reached)break;
   }
   d.effect(()=>assert.equal(reached,true,'Native self-destruct/death feature/damage or live control not reached within12 actual rests'));d.entry.rests=rests;await d.screenshot('death-feature-effect');const final=physical(a);if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected';
  }});
 }
 assert.equal(cases.length,6*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-kamikaze',createCases:createMonsterKamikazeCases,filter:process.env.BROGUE_MONSTER_KAMIKAZE});
