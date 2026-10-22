// Prepared native gear/terrain/AI only; all effects and chance rolls follow real input.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...s})=>s;
export function createArmorRunicCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const row=inv.definitions[domain].entries.find(x=>x.symbol===symbol);assert.ok(row,symbol);return row.value;};
 const I=n=>V('itemFlags','ITEM_'+n),Z=n=>V('statusEffects','STATUS_'+n),K=n=>V('monsterTypes','MK_'+n),B=n=>V('monsterBookkeepingFlags','MB_'+n),T=n=>V('tileType',n);
 const known=s=>!!(s.pack[0].flags&I('RUNIC_IDENTIFIED'));
 const symbols=['MULTIPLICITY','MUTUALITY','ABSORPTION','REPRISAL','IMMUNITY','REFLECTION','RESPIRATION','DAMPENING','BURDEN','VULNERABILITY','IMMOLATION'];
 const special=['MULTIPLICITY','MUTUALITY','REPRISAL','IMMUNITY','REFLECTION','IMMOLATION'];
 const cases=[],pc=new Map();
 async function act(d,key,{hazard=false}={}){const b=await d.state();await d.input(key);if(hazard&&(await d.wait()).kind==='confirm'){assert.deepEqual(physical(await d.state()),physical(b),'Hazard prompt before committed move');await d.input('y');}await d.settle();return d.state();}
 async function rest(d){const b=await d.state(),a=await act(d,'.');assert.equal(a.turn,b.turn+1);return a;}
 const flame=trace=>trace.observations.some(o=>o.surfaces.some(c=>c.surface===T('PLAIN_FIRE')));
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const mode of ['positive','plain','condition1','condition2'])for(const symbol of symbols){
  if(mode==='condition1'&&!special.includes(symbol)||mode==='condition2'&&symbol!=='REFLECTION')continue;
  const kind=V('armorEnchants','A_'+symbol),condition=mode==='condition1'?1:mode==='condition2'?2:0,plain=mode==='plain',positive=mode==='positive',inanimate=condition===1&&['MULTIPLICITY','REPRISAL'].includes(symbol);
  const fixture_id=(plain?S.ARMOR_PLAIN:condition?S.ARMOR_CONDITION+condition*100:S.ARMOR_RUNIC)+kind,key=variant+'-'+mode+'-'+symbol;
  const targets=positive?[{domain:'armorEnchants',symbol:'A_'+symbol}]:[];
  if(inanimate)targets.push({domain:'monsterBehaviorFlags',symbol:'MONST_INANIMATE'});
  if(symbol==='DAMPENING')targets.push({domain:'monsterTypes',symbol:'MK_EXPLOSIVE_BLOAT'},{domain:'monsterAbilityFlags',symbol:'MA_DF_ON_DEATH'});
  if(symbol==='REFLECTION'&&condition===2)targets.push({domain:'boltFlags',symbol:'BF_NEVER_REFLECTS'});
  cases.push({id:variant+'-'+input_path+'-'+mode+'-'+symbol.toLowerCase(),variant,input_path,fixture_id,feature_ids:['items.runics','combat','items.knowledge','turn.environment',...(symbol==='DAMPENING'?['cmd.move','ai.monsters','ai.flags_bolts']:['cmd.rest']),...(['REFLECTION','MULTIPLICITY','IMMOLATION'].includes(symbol)?['ai.flags_bolts']:[])],targets,assertions:[
   'Known leather/raw30, unknown native runic, DONNING0, HP100/regen0; melee uses original attacker/ticks1 and web/STUCK, environmental/caster scenes have no unrelated attacker.',
   'Actual hit, native bolt, gas rest or actual unarmed bloat kill and native death DF must reach each effect. Random procs/casts require arrival within20 real turns; failure is not a pass.',
   'Plain first-hit controls share preparation and initial RNG. End-of-effect pair RNG is not assumed equal. Each variant uses its own real launch and PC/touch comparison.'
  ],execute:async(d,{control})=>{
   const start=await d.state(),armor=start.pack[0],attacker=start.monsters.find(m=>m.x===41&&m.y===14),enchant=symbol==='MULTIPLICITY'?3:symbol==='REPRISAL'?20:symbol==='ABSORPTION'?1:symbol==='REFLECTION'&&condition!==1?50:0;
   assert.equal(start.variant,({brogue:'brogue',rapid_brogue:'rapidBrogue',bullet_brogue:'bulletBrogue'})[variant]);assert.equal(start.hp,100);assert.equal(start.maxHP,100);assert.equal(start.regenPerTurn,0);assert.equal(start.weaknessAmount,0);assert.equal(start.statuses[Z('DONNING')],0);assert.equal(armor.armorRaw,30);assert.equal(armor.enchant,enchant);assert.equal(armor.netEnchant,enchant*65536);assert.equal(armor.strengthRequired,start.strength);assert.equal(armor.equipped,1);assert.equal(armor.identified,1);assert.equal(known(start),false);assert.equal(!!(armor.flags&I('RUNIC')),!plain);
   if(!['RESPIRATION','DAMPENING','REFLECTION'].includes(symbol)){assert.ok(start.statuses[Z('STUCK')]>0);assert.equal(start.playerCell.surface,T('SPIDERWEB'));assert.equal(attacker.kind,K(symbol==='IMMUNITY'?'GOBLIN':inanimate?'SPECTRAL_BLADE':'KOBOLD'));assert.equal(attacker.ticksUntilTurn,1);assert.equal(!!(attacker.flags&V('monsterBehaviorFlags','MONST_INANIMATE')),inanimate);}
   let raw,plainState;
   if(positive&&['ABSORPTION','MUTUALITY','REPRISAL','VULNERABILITY'].includes(symbol))await control(async c=>{
    const b=await c.state(),x=structuredClone(physical(start)),y=structuredClone(physical(b));for(const s of [x,y]){s.fixture=0;s.pack[0].flags&=~(I('RUNIC')|I('CAN_BE_IDENTIFIED')|I('RUNIC_HINTED'));s.pack[0].runicKind=-1;}assert.deepEqual(x,y,'Only declared runic knowledge fields differ');plainState=await rest(c);raw=b.hp-plainState.hp;assert.ok(raw>=1&&raw<=4);d.entry.plain_first_hit={raw,initial_rng:b.rng,endpoint_rng:plainState.rng};
   },S.ARMOR_PLAIN+kind);
   let after,before=start,steps=0;
   if(symbol==='DAMPENING'){
    assert.equal(start.monsters.length,1);assert.equal(start.monsters[0].kind,K('EXPLOSIVE_BLOAT'));assert.equal(start.monsters[0].hp,1);assert.ok(start.monsters[0].abilityFlags&V('monsterAbilityFlags','MA_DF_ON_DEATH'));assert.equal(start.monsters[0].ticksUntilTurn,10000);assert.equal(start.weapon,0);assert.ok(start.playerCombat.damageMin>=1);assert.equal(start.playerCombat.accuracy,100);assert.equal(start.monsters[0].combat.defense,0);assert.equal(start.statuses[Z('STUCK')],0);assert.equal(start.statuses[Z('EXPLOSION_IMMUNITY')],0);assert.ok(start.status.fireImmune>20);
    after=await act(d,'l');d.effect(()=>{assert.deepEqual([after.x,after.y],[start.x,start.y]);assert.equal(after.monsters.length,0,'Actual unarmed kill triggers original bloat death DF');assert.equal(after.turn,start.turn+1);assert.equal(after.absoluteTurnNumber,start.absoluteTurnNumber+1);assert.equal(after.hp,plain?50:100);assert.ok(after.statuses[Z('EXPLOSION_IMMUNITY')]>0);assert.equal(known(after),!plain);});d.entry.explosion_text=await publicText(d);assert.match(d.entry.explosion_text,/force of the explosion|absorbs the damage/i);
   }else if(symbol==='RESPIRATION'){
    assert.equal(start.monsters.length,0);assert.equal(start.playerCell.gas,T('POISON_GAS'));assert.equal(start.playerCell.volume,1000);after=await rest(d);d.effect(()=>{assert.equal(after.hp,plain?94:100);assert.equal(after.playerCell.gas,T('POISON_GAS'));assert.ok(after.playerCell.volume>0);assert.equal(after.status.poisoned,0);assert.equal(known(after),!plain);});
   }else if(symbol==='REFLECTION'){
    const spider=condition===2;assert.equal(start.monsters.length,1);assert.equal(start.monsters[0].kind,K(spider?'SPIDER':'SPARK_TURRET'));assert.equal(start.statuses[Z('STUCK')],0);assert.equal(start.playerCell.surface,0);
    for(;steps<20;steps++){after=await rest(d);if(spider?after.statuses[Z('STUCK')]>0:after.hp<100||after.monsters[0]?.hp<start.monsters[0].hp)break;}assert.ok(steps<20,'Required native cast not reached');d.entry.cast_turns=steps+1;
    d.effect(()=>{if(spider){assert.equal(after.hp,100);assert.ok(after.statuses[Z('STUCK')]>0);assert.equal(after.playerCell.surface,T('SPIDERWEB'));assert.equal(known(after),false);}else if(positive){assert.equal(after.hp,100);assert.ok(start.monsters[0].hp-after.monsters[0].hp>=2&&start.monsters[0].hp-after.monsters[0].hp<=6);assert.equal(known(after),true);}else{assert.ok(100-after.hp>=2&&100-after.hp<=6);assert.equal(after.monsters[0].hp,start.monsters[0].hp);assert.equal(known(after),false);}});
    if(positive)assert.match(await publicText(d),/deflect.*spark/i);
   }else{
    const needsProc=!plain&&(positive&&['MULTIPLICITY','ABSORPTION','BURDEN','IMMOLATION'].includes(symbol)||condition===1&&symbol==='IMMOLATION');const limit=needsProc?20:1;
    for(;steps<limit;steps++){
     after=await rest(d);d.entry.hit_turns=steps+1;
     if(steps===0&&positive&&symbol==='ABSORPTION'){assert.equal(100-after.hp,Math.max(0,raw-1));assert.equal(known(after),raw===1);}
     if(needsProc&&known(after))break;
     if(needsProc){assert.equal(known(after),false);if(symbol==='BURDEN')assert.equal(after.pack[0].strengthRequired,armor.strengthRequired);if(symbol==='ABSORPTION')assert.ok(before.hp-after.hp>=0&&before.hp-after.hp<=3);before=after;}
    }
    if(needsProc)assert.ok(known(after),'Native armor proc not reached within20 hits');
    d.effect(()=>{
     if(plain){assert.equal(known(after),false);assert.ok(100-after.hp>=1&&100-after.hp<=(symbol==='IMMUNITY'?5:4));assert.equal(after.monsters.length,start.monsters.length);return;}
     const enemy=after.monsters.find(m=>m.x===41&&m.y===14);
     if(inanimate){assert.equal(100-after.hp,1);assert.equal(enemy.hp,attacker.hp);assert.equal(after.monsters.length,1);assert.equal(known(after),false);return;}
     if(condition===1&&symbol==='IMMUNITY'){assert.ok(100-after.hp>=2&&100-after.hp<=5);assert.equal(known(after),false);return;}
     if(condition===1&&symbol==='MUTUALITY'){assert.ok(100-after.hp>=1&&100-after.hp<=4);assert.equal(after.monsters.find(m=>m.x===43).hp,100);assert.equal(known(after),false);return;}
     assert.equal(known(after),true);
     switch(symbol){
      case 'ABSORPTION':assert.equal(after.hp,before.hp,'Identification requires the last blow to be fully absorbed');break;
      case 'MUTUALITY':{const damage=Math.ceil(raw/2);assert.equal(100-after.hp,damage);assert.equal(100-after.monsters.find(m=>m.x===39).hp,damage);assert.equal(enemy.hp,attacker.hp);break;}
      case 'REPRISAL':assert.equal(100-after.hp,raw);assert.equal(attacker.hp-enemy.hp,raw);break;
      case 'IMMUNITY':assert.equal(after.hp,100);assert.equal(enemy.hp,attacker.hp);break;
      case 'VULNERABILITY':assert.equal(100-after.hp,raw*2);break;
      case 'BURDEN':assert.equal(after.pack[0].strengthRequired,armor.strengthRequired+1);assert.equal(after.pack[0].equipped,1);assert.equal(after.pack[0].netEnchant,-2.5*65536);assert.equal(after.playerCombat.defense,5);assert.equal(after.statuses[Z('DONNING')],0);break;
      case 'IMMOLATION':assert.equal(after.status.burning>0,condition!==1);if(condition===1)assert.ok(after.status.fireImmune>0);break;
      case 'MULTIPLICITY':{
       const image=after.monsters.find(m=>m.kind===K('SPECTRAL_IMAGE'));assert.ok(image);assert.equal(after.monsters.length,2);assert.equal(image.hp,1);assert.equal(image.maxHP,1);assert.equal(image.combat.defense,0);assert.equal(image.leaderIndex,-2);assert.equal(image.state,V('creatureStates','MONSTER_ALLY'));for(const f of ['FOLLOWER','BOUND_TO_LEADER','DOES_NOT_TRACK_LEADER','TELEPATHICALLY_REVEALED'])assert.ok(image.bookkeepingFlags&B(f));assert.equal(image.statuses[Z('LIFESPAN_REMAINING')],2);assert.equal(image.maxStatuses[Z('LIFESPAN_REMAINING')],3);assert.equal(image.ticksUntilTurn,1);assert.notDeepEqual([image.x,image.y],[start.x,start.y]);assert.notDeepEqual([image.x,image.y],[41,14]);
       const c=start.cells.find(c=>c.x===image.x&&c.y===image.y);assert.ok(c);assert.equal(c.dungeon,T('FLOOR'));assert.equal(c.flags&(V('tileFlags','HAS_PLAYER')|V('tileFlags','HAS_MONSTER')|V('tileFlags','HAS_STAIRS')),0);
       for(const field of ['damageMin','damageMax','accuracy'])assert.equal(image.combat[field],attacker.combat[field]);assert.equal(image.movementSpeed,attacker.movementSpeed);assert.equal(image.attackSpeed,attacker.attackSpeed);
       const gender=V('monsterBehaviorFlags','MONST_MALE')|V('monsterBehaviorFlags','MONST_FEMALE');assert.equal((image.flags&~gender)>>>0,((attacker.flags|V('monsterBehaviorFlags','MONST_DIES_IF_NEGATED'))&~gender)>>>0);assert.equal(image.abilityFlags,(attacker.abilityFlags&~(V('monsterAbilityFlags','MA_CAST_SUMMON')|V('monsterAbilityFlags','MA_DF_ON_DEATH')))>>>0);d.entry.clone_gender='Native initializeGender rerolls sex; other inherited flags compared';break;
      }
     }
    });
    if(!plain&&symbol==='IMMOLATION')assert.ok(flame(await d.trace()),'Actual native PLAIN_FIRE must be observed after ACK');
   }
   await d.screenshot('armor-effect');
   if(positive&&symbol==='MULTIPLICITY'){
    const oldEnemy=after.monsters.find(m=>m.x===41&&m.y===14);await d.input('r');assert.equal((await d.wait()).kind,'item');await d.input('a');await d.settle();let state=await d.state();assert.equal(state.armor,0);assert.equal(state.pack[0].equipped,0);const alive=state.monsters.filter(m=>m.kind===K('SPECTRAL_IMAGE'));assert.equal(alive.length,1);assert.equal(alive[0].hp,1);assert.equal(alive[0].statuses[Z('LIFESPAN_REMAINING')],1);state=await rest(d);assert.equal(state.monsters.filter(m=>m.kind===K('SPECTRAL_IMAGE')).length,0);assert.match(await publicText(d),/dissipates into thin air/i);const enemy=state.monsters.find(m=>m.kind===attacker.kind);assert.equal(state.monsters.filter(m=>m.kind===K('SPECTRAL_IMAGE')).length,0);assert.ok(!enemy||enemy.hp<oldEnemy.hp,'Image must cause actual AI damage before expiring');d.entry.image_ai_damage=enemy?oldEnemy.hp-enemy.hp:'native enemy killed';
   }
   const final=physical(await d.state());if(input_path==='pc-keyboard'){pc.set(key,final);d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key));d.entry.pc_touch_comparison='matched PC counterpart';}else d.entry.pc_touch_comparison='PC counterpart not selected; equivalence not checked';
  }});
 }
 assert.equal(cases.length,58*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'armor-runics',createCases:createArmorRunicCases,filter:process.env.BROGUE_ARMOR_RUNICS});
