// CHECK preparation only; all attacks, proc rolls, AI and decay use real public input.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...s})=>s;
export function createWeaponRunicCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inventory=generateDataInventory({gitMetadata:false});validateDataSnapshot(inventory);
 const V=(domain,symbol)=>{const row=inventory.definitions[domain].entries.find(r=>r.symbol===symbol);assert.ok(row,symbol);return row.value;};
 const Z=n=>V('statusEffects','STATUS_'+n),B=n=>V('monsterBookkeepingFlags','MB_'+n),K=n=>V('monsterTypes','MK_'+n);
 const known=s=>!!(s.pack[0].flags&V('itemFlags','ITEM_RUNIC_IDENTIFIED'));
 const placement=(before,after,monsters)=>{const positions=new Set();for(const m of monsters){const pos=m.x+','+m.y;assert.ok(!positions.has(pos),'No overlapping new creatures');positions.add(pos);assert.notDeepEqual([m.x,m.y],[before.x,before.y]);const c=before.cells.find(c=>c.x===m.x&&c.y===m.y);assert.ok(c,'New creature inside prepared room');assert.equal(c.flags&(V('tileFlags','HAS_PLAYER')|V('tileFlags','HAS_MONSTER')|V('tileFlags','HAS_STAIRS')),0);assert.equal(c.dungeon,V('tileType','FLOOR'));assert.ok(!after.monsters.some(other=>other!==m&&other.x===m.x&&other.y===m.y),'New creature overlaps no current creature');}};
 const ogre=s=>s.monsters.find(m=>m.kind===K('OGRE'));
 const symbols=['SPEED','QUIETUS','PARALYSIS','MULTIPLICITY','SLOWING','CONFUSION','FORCE','SLAYING','MERCY','PLENTY'];
 const statusFor={PARALYSIS:'PARALYZED',SLOWING:'SLOWED',CONFUSION:'CONFUSED'};
 const cases=[],pc=new Map();
 async function act(d,key){await d.input(key);await d.settle();return d.state();}
 async function rest(d){const b=await d.state(),a=await act(d,'.');assert.equal(a.turn,b.turn+1);return a;}
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const condition of ['positive','inanimate','plain'])for(const symbol of symbols){
  if(condition==='plain'&&symbol!=='SPEED'||condition==='inanimate'&&symbol==='SLAYING')continue;
  const kind=V('weaponEnchants','W_'+symbol),key=variant+'-'+condition+'-'+symbol;
  const targets=condition==='positive'?[{domain:'weaponEnchants',symbol:'W_'+symbol}]:condition==='inanimate'?[{domain:'monsterBehaviorFlags',symbol:'MONST_INANIMATE'}]:[];
  if(condition==='positive'&&statusFor[symbol])targets.push({domain:'statusEffects',symbol:'STATUS_'+statusFor[symbol]});
  if(condition==='positive'&&symbol==='MULTIPLICITY')targets.push({domain:'monsterTypes',symbol:'MK_SPECTRAL_IMAGE'},{domain:'statusEffects',symbol:'STATUS_LIFESPAN_REMAINING'});
  cases.push({id:variant+'-'+input_path+'-'+condition+'-'+symbol.toLowerCase(),variant,input_path,fixture_id:S[condition==='plain'?'WEAPON_PLAIN':condition==='inanimate'?'WEAPON_INANIMATE':'WEAPON_RUNIC']+(condition==='plain'?0:kind),feature_ids:['items.runics','combat','cmd.move','items.knowledge',...(symbol==='MULTIPLICITY'?['ai.monsters','ai.groups_mutations']:[]),...(statusFor[symbol]?['statuses','turn.environment']:[])],targets,assertions:[
   'Prepared known +9 dagger, native tracking Ogre or native inanimate Arrow Turret HP400/max1000, web/STUCK and delayed ticks; no effect or RNG override.',
   'Every real attack must cause ordinary damage or the native runic effect. Positive proc is required within 30 hits and attacking stops at its first identification; bounded non-proc is failure.',
   'Independent PC/touch state equality per variant; recovery/AI effects are separate real rests. Source-only and untested branches are not promoted.'
  ],execute:async d=>{
   const start=await d.state(),weapon=start.pack[0],target=start.monsters[0];assert.equal(start.variant,({brogue:'brogue',rapid_brogue:'rapidBrogue',bullet_brogue:'bulletBrogue'})[variant]);
   assert.equal(weapon.enchant,9);assert.equal(weapon.netEnchant,9*65536);assert.equal(weapon.strengthRequired,start.strength);assert.equal(start.weaknessAmount,0);assert.equal(weapon.equipped,1);assert.equal(weapon.identified,1);assert.equal(known(start),false);
   assert.equal(target.kind,K(condition==='inanimate'?'ARROW_TURRET':'OGRE'));assert.equal(target.hp,400);assert.equal(target.maxHP,1000);assert.equal(target.ticksUntilTurn,10000);assert.equal(target.statuses[Z('STUCK')],50);assert.equal(start.cells.find(c=>c.x===41&&c.y===14).surface,V('tileType','SPIDERWEB'));
   assert.equal(!!(target.flags&V('monsterBehaviorFlags','MONST_INANIMATE')),condition==='inanimate');
   const limit=condition==='positive'?30:condition==='plain'?1:3;let before=start,after,attempt=0,observations=[];
   for(;attempt<limit;attempt++){
    const n=(await d.trace()).observations.length;after=await act(d,'l');observations=(await d.trace()).observations.slice(n);assert.equal(after.turn,before.turn+1);assert.equal(after.absoluteTurnNumber,before.absoluteTurnNumber+1);assert.deepEqual([after.x,after.y],[start.x,start.y]);
    d.entry.proc_attempts=attempt+1;
    if(condition==='positive'&&known(after))break;
    assert.equal(known(after),false);assert.equal(after.monsters.length,1);assert.ok(before.monsters[0].hp-after.monsters[0].hp>=5&&before.monsters[0].hp-after.monsters[0].hp<=7,'Ordinary +9 dagger damage');
    assert.equal(after.monsters[0].ticksUntilTurn,before.monsters[0].ticksUntilTurn-100);before=after;
   }
   if(condition==='positive'){
    assert.ok(known(after),'Required native runic proc was not reached within cap');const m=ogre(after),old=ogre(before),text=await publicText(d);
    d.effect(()=>{
     switch(symbol){
      case 'SPEED':assert.ok(old.hp-m.hp>=5&&old.hp-m.hp<=7);assert.equal(m.ticksUntilTurn,old.ticksUntilTurn);assert.match(text,/time freezes/i);break;
      case 'QUIETUS':case 'SLAYING':assert.equal(m,undefined);assert.match(text,/ogre suddenly dies/i);break;
      case 'PARALYSIS':assert.equal(m.maxStatuses[Z('PARALYZED')],6);assert.equal(m.statuses[Z('PARALYZED')],5);assert.match(text,/frozen in place/i);break;
      case 'SLOWING':assert.equal(m.maxStatuses[Z('SLOWED')],40);assert.equal(m.statuses[Z('SLOWED')],39);assert.equal(m.movementSpeed,old.movementSpeed*2);assert.equal(m.attackSpeed,old.attackSpeed*2);assert.match(text,/slows down/i);break;
      case 'CONFUSION':assert.equal(m.maxStatuses[Z('CONFUSED')],13);assert.equal(m.statuses[Z('CONFUSED')],12);assert.match(text,/very confused/i);break;
      case 'FORCE':{
       assert.deepEqual([m.x,m.y],[43,14]);assert.match(text,/slams against/i);
       const hit=observations.flatMap(o=>o.monsters).filter(x=>x.kind===K('OGRE')&&x.x===41&&x.y===14&&old.hp-x.hp>=5&&old.hp-x.hp<=7&&x.hp>m.hp).at(-1);
       assert.ok(hit,'Native pre-impact frame must separate ordinary damage from force');assert.equal(hit.hp-m.hp,2);d.entry.force_impact={before:old.hp,ordinary_hit:hit.hp,after:m.hp,damage:2};break;
      }
      case 'MERCY':assert.ok(m.hp-old.hp>=493&&m.hp-old.hp<=495,'Heal defender by maxHP50% after ordinary damage');assert.equal(after.hp,before.hp);break;
      case 'PLENTY':{
       assert.equal(after.monsters.length,2);assert.ok(after.monsters.every(x=>x.kind===old.kind),'Both parent and clone retain original monster identity');assert.equal(after.monsters[0].hp,after.monsters[1].hp);assert.ok(old.hp-m.hp>=5&&old.hp-m.hp<=7);const parent=after.monsters.findIndex(x=>x.x===41&&x.y===14),clone=after.monsters.find(x=>x.x!==41||x.y!==14);assert.ok(parent>=0);assert.equal(clone.leaderIndex,parent);assert.ok(clone.bookkeepingFlags&B('FOLLOWER'));assert.equal(clone.bookkeepingFlags&B('BOUND_TO_LEADER'),0);assert.equal(clone.maxHP,1000);assert.equal(clone.ticksUntilTurn,1);placement(before,after,[clone]);break;
      }
      case 'MULTIPLICITY':{
       const images=after.monsters.filter(x=>x.kind===K('SPECTRAL_IMAGE'));assert.equal(images.length,3);assert.equal(after.monsters.length,4);placement(before,after,images);assert.ok(old.hp-m.hp>=5&&old.hp-m.hp<=28,'Ordinary hit plus up to three same-turn image attacks');d.entry.proc_turn_combined_damage=old.hp-m.hp;
       for(const image of images){assert.equal(image.leaderIndex,-2);assert.equal(image.state,V('creatureStates','MONSTER_ALLY'));for(const f of ['FOLLOWER','BOUND_TO_LEADER','DOES_NOT_TRACK_LEADER'])assert.ok(image.bookkeepingFlags&B(f));assert.equal(image.maxStatuses[Z('LIFESPAN_REMAINING')],3);assert.equal(image.statuses[Z('LIFESPAN_REMAINING')],2);assert.equal(image.combat.damageMin,start.playerCombat.damageMin);assert.equal(image.combat.damageMax,start.playerCombat.damageMax);assert.equal(image.combat.accuracy,start.playerCombat.accuracy+45);}assert.match(text,/spectral duplicates appear/i);break;
      }
     }
    });
    await d.screenshot('native-runic-proc');
    if(statusFor[symbol]){const status=Z(statusFor[symbol]),duration=after.monsters[0].statuses[status];let state=after;for(let n=0;n<duration;n++)state=await rest(d);assert.equal(ogre(state).statuses[status],0);assert.equal(ogre(state).hp,m.hp);if(symbol==='SLOWING'){assert.equal(ogre(state).movementSpeed,start.monsters[0].movementSpeed);assert.equal(ogre(state).attackSpeed,start.monsters[0].attackSpeed);}d.entry.recovery_turns=duration;}
    else if(symbol==='MULTIPLICITY'){let state=after;for(let n=0;n<4;n++)state=await rest(d);assert.equal(state.monsters.filter(x=>x.kind===K('SPECTRAL_IMAGE')).length,0);assert.ok(ogre(state).hp<m.hp,'Summoned images must cause autonomous damage before expiring');d.entry.image_ai_damage=m.hp-ogre(state).hp;}
    else await rest(d);
   }else d.effect(()=>{assert.equal(known(after),false);assert.equal(after.monsters.length,1);assert.equal(after.monsters[0].hp<400,true);assert.deepEqual([after.monsters[0].x,after.monsters[0].y],[41,14]);for(const status of ['PARALYZED','SLOWED','CONFUSED'])assert.equal(after.monsters[0].statuses[Z(status)],0);});
   const final=physical(await d.state());if(input_path==='pc-keyboard'){pc.set(key,final);d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key),'PC/touch original states must match');d.entry.pc_touch_comparison='matched PC counterpart';}else d.entry.pc_touch_comparison='PC counterpart not selected; equivalence not checked';
  }});
 }
 assert.equal(cases.length,40*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'weapon-runics',createCases:createWeaponRunicCases,filter:process.env.BROGUE_WEAPON_RUNICS});
