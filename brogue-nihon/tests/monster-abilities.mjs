// Native monster abilities reached by real attacks/rests, with explicit controls.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...s})=>s;
export function createMonsterAbilityCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const row=inv.definitions[domain].entries.find(x=>x.symbol===symbol);assert.ok(row,symbol);return row.value;};
 const K=n=>V('monsterTypes','MK_'+n),Z=n=>V('statusEffects','STATUS_'+n),I=n=>V('itemFlags','ITEM_'+n),F=n=>V('tileFlags',n),T=n=>V('tileType',n),item=s=>s.pack.find(x=>x.letter===97);
 const rows=[['acid-weapon','ACID_MOUND','monsterBehaviorFlags','MONST_DEFEND_DEGRADE_WEAPON',1,3,100,100],['toad-hallucinate','TOAD','monsterAbilityFlags','MA_HIT_HALLUCINATE',1,4,100,100],['centipede-weaken','CENTIPEDE','monsterAbilityFlags','MA_CAUSES_WEAKNESS',4,12,100,100],['bat-transference','VAMPIRE_BAT','monsterAbilityFlags','MA_TRANSFERENCE',2,6,50,100],['ogre-stagger','OGRE','monsterAbilityFlags','MA_ATTACKS_STAGGER',9,13,100,200],['goblin-penetrate','GOBLIN','monsterAbilityFlags','MA_ATTACKS_PENETRATE',2,5,100,100],['naga-all-adjacent','NAGA','monsterAbilityFlags','MA_ATTACKS_ALL_ADJACENT',7,11,100,100]];
 const normalizeInitial=(state,kind,negative)=>{
  const s=structuredClone(physical(state));s.fixture=0;
  const terrain=(c,t,m)=>{assert.equal(c.terrainFlags,t);assert.equal(c.mechFlags,m);c.terrainFlags=c.mechFlags=0;};
  if(kind===0){s.pack[0].flags&=~I('PROTECTED');s.pack[0].protected=0;}
  else if(kind<=3){const a=s.pack[0];a.flags&=~(I('RUNIC')|I('CAN_BE_IDENTIFIED')|I('RUNIC_HINTED'));a.runicKind=-1;a.rechargeTimer=0;a.vorpalEnemy=0;}
  else if(kind===4){
   const wall=s.cells.find(c=>c.x===39&&c.y===14);assert.equal(wall.dungeon,T(negative?'WALL':'FLOOR'));assert.deepEqual([wall.liquid,wall.surface,wall.gas],[0,0,0]);terrain(wall,negative?V('terrainFlagCatalog','T_OBSTRUCTS_EVERYTHING'):0,negative?V('terrainMechanicalFlagCatalog','TM_STAND_IN_TILE'):0);wall.dungeon=T('FLOOR');
   // Only the wall's derived discovery/visibility bits and three counters differ.
   const vision=F('DISCOVERED')|F('VISIBLE')|F('IN_FIELD_OF_VIEW');for(const c of s.cells)c.flags&=~vision;
   for(const key of ['discovered','visible','fieldOfView'])s.mapMetrics[key]=0;
  }else{
   const ally=s.monsters.find(m=>m.state===V('creatureStates','MONSTER_ALLY'));assert.ok(ally);const x=kind===5?39:41,y=kind===5?14:15,actual=y+Number(negative),other=y+Number(!negative);
   assert.deepEqual([ally.x,ally.y],[x,actual]);ally.y=y;
   for(const cy of [actual,other]){const c=s.cells.find(c=>c.x===x&&c.y===cy);assert.ok(c);assert.equal(c.surface,cy===actual?T('SPIDERWEB'):0);assert.deepEqual([c.dungeon,c.liquid,c.gas],[T('FLOOR'),0,0]);terrain(c,cy===actual?V('terrainFlagCatalog','T_ENTANGLES')|V('terrainFlagCatalog','T_IS_FLAMMABLE'):0,cy===actual?V('terrainMechanicalFlagCatalog','TM_STAND_IN_TILE')|V('terrainMechanicalFlagCatalog','TM_VANISHES_UPON_PROMOTION')|V('terrainMechanicalFlagCatalog','TM_VISUALLY_DISTINCT'):0);assert.equal(!!(c.flags&F('HAS_MONSTER')),cy===actual);c.flags&=~F('HAS_MONSTER');c.surface=0;}
  }
  return s;
 };
 const cases=[],pc=new Map(),initial=new Map();
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(let kind=0;kind<rows.length;kind++)for(const negative of [false,true]){
  const [name,actor,domain,flag,min,max,movement,attack]=rows[kind],mode=negative?'negative':'positive',key=variant+'-'+mode+'-'+name,baseline=variant+'-'+input_path+'-'+name;
  cases.push({id:variant+'-'+input_path+'-'+mode+'-'+name,variant,input_path,fixture_id:S.MONSTER_ABILITIES+kind*2+Number(negative),feature_ids:['ai.monsters','ai.flags_bolts','combat','turn.environment',kind===0?'cmd.move':'cmd.rest',...(kind===0&&!negative?['dialog.ack_confirm']:[]),...([0,2].includes(kind)?['items.food_weapon_armor']:[]),...(negative&&kind>=1&&kind<=3?['items.runics']:[])],targets:negative?[]:[{domain:'monsterTypes',symbol:'MK_'+actor},{domain,symbol:flag},...(kind===1?[{domain:'statusEffects',symbol:'STATUS_HALLUCINATING'}]:kind===2?[{domain:'statusEffects',symbol:'STATUS_WEAKENED'}]:[])],assertions:[
   'Original actor info, damage, abilities, attack/movement speeds and AI are retained; artificial web, HP, clock, gear and positions are initial preparation only.',
   'Actual keyboard/touch attacks or rests must reach weapon corrosion, hallucination, weakness, enemy life drain, stagger, penetration or adjacent sweep; controls require the specific effect to be absent.',
   'CE/Rapid/Bullet duration constants differ; direct flag presence alone is not execution, and continuing status expiration or all interactions remain untested.'
  ],execute:async d=>{
   const start=await d.state(),m=start.monsters.find(m=>m.x===41&&m.y===14);assert.ok(m);assert.equal(start.variant,({brogue:'brogue',rapid_brogue:'rapidBrogue',bullet_brogue:'bulletBrogue'})[variant]);assert.equal(start.hp,100);assert.equal(start.maxHP,100);assert.equal(start.regenPerTurn,0);assert.ok(start.turnsUntilRegen>10000);assert.equal(start.monsters.length,kind>=5?2:1);assert.equal(m.kind,K(actor));assert.equal(m.movementSpeed,movement);assert.equal(m.attackSpeed,attack);assert.equal(m.combat.damageMin,min);assert.equal(m.combat.damageMax,max);assert.ok((domain==='monsterBehaviorFlags'?m.flags:m.abilityFlags)&V(domain,flag));assert.equal(m.ticksUntilTurn,kind===0?10000:1);assert.equal(m.turnsUntilRegen,100000);assert.equal(m.regenPerTurn,0);assert.equal(start.weaknessAmount,0);
   if(!negative)initial.set(baseline,start);else if(initial.has(baseline)){assert.deepEqual(normalizeInitial(start,kind,true),normalizeInitial(initial.get(baseline),kind,false),'Full observed initial state and RNG differ beyond declared gear, placement and derived vision');d.entry.initial_pair_comparison='Full state/RNG matched after declared-field normalization';}else d.entry.initial_pair_comparison='Positive not selected; no pair comparison';
   if(kind===0){assert.equal(item(start).enchant,0);assert.equal(item(start).netEnchant,0);assert.equal(item(start).protected,Number(negative));assert.equal(item(start).equipped,1);assert.equal(start.playerCombat.damageMin,3);assert.equal(start.playerCombat.damageMax,4);assert.ok(m.statuses[Z('STUCK')]>0);}else{assert.ok(start.statuses[Z('STUCK')]>0);if(kind<=3){assert.equal(item(start).runicKind,negative?V('armorEnchants','A_IMMUNITY'):-1);assert.equal(item(start).armorRaw,kind===2?30:0);assert.equal(item(start).netEnchant,0);if(negative)assert.equal(item(start).vorpalEnemy,2);}}
   await d.input(kind===0?'l':'.');
   if(kind===0&&!negative){assert.equal((await d.wait()).kind,'confirm');assert.deepEqual(physical(await d.state()),physical(start));d.entry.corrosion_warning=await publicText(d);assert.match(d.entry.corrosion_warning,/acid mound|weapon/i);await d.input('n');await d.settle();assert.deepEqual(physical(await d.state()),physical(start),'Declining acid attack must preserve state/RNG');await d.input('l');assert.equal((await d.wait()).kind,'confirm');await d.input('y');}
   await d.settle();const after=await d.state(),now=after.monsters.find(x=>x.kind===m.kind&&x.state!==V('creatureStates','MONSTER_ALLY'));assert.ok(now);assert.equal(after.turn,start.turn+1);assert.equal(after.absoluteTurnNumber,start.absoluteTurnNumber+1);const damage=start.hp-after.hp;d.entry.damage=damage;
   d.effect(()=>{
    if(kind===0){const dealt=m.hp-now.hp;assert.ok(dealt>=3&&dealt<=4);assert.equal(item(after).enchant,negative?0:-1);assert.equal(item(after).netEnchant,(negative?0:-1)*65536);assert.equal(after.hp,start.hp);assert.deepEqual([after.x,after.y],[40,14]);}
    else if(kind<=3&&negative){assert.equal(damage,0);assert.equal(!!(item(start).flags&I('RUNIC_IDENTIFIED')),false);assert.ok(item(after).flags&I('RUNIC_IDENTIFIED'),'Actual immune hit must auto-identify armor');}else assert.ok(damage>=min&&damage<=max,actor+' actual damage range');
    if(kind===1){const duration=variant==='bullet_brogue'?10:20;assert.equal(after.maxStatuses[Z('HALLUCINATING')],negative?0:duration);assert.equal(after.statuses[Z('HALLUCINATING')],negative?0:duration-1);}
    if(kind===2){const duration=({brogue:300,rapid_brogue:100,bullet_brogue:50})[variant];assert.equal(after.weaknessAmount,negative?0:1);assert.equal(after.maxStatuses[Z('WEAKENED')],negative?0:duration);assert.equal(after.statuses[Z('WEAKENED')],negative?0:duration-1);assert.equal(item(after).netEnchant,(negative?0:-2.5)*65536);assert.equal(start.playerCombat.defense,30);assert.equal(after.playerCombat.defense,negative?30:5);}
    if(kind===3){assert.equal(m.hp,1);assert.equal(m.maxHP,18);assert.equal(now.maxHP,18);assert.equal(now.hp-m.hp,Math.trunc(damage*9/10));assert.ok(m.flags&V('monsterBehaviorFlags','MONST_FLITS'));assert.ok(m.flags&V('monsterBehaviorFlags','MONST_FLIES'));}
    if(kind===4)assert.deepEqual([after.x,after.y],[negative?40:39,14]);
    if(kind>=5){const a=start.monsters.find(x=>x.state===V('creatureStates','MONSTER_ALLY')),b=after.monsters.find(x=>x.state===V('creatureStates','MONSTER_ALLY'));assert.ok(a&&b);assert.equal(a.kind,K('OGRE'));assert.equal(a.hp,55);assert.equal(a.maxHP,55);assert.equal(b.maxHP,55);assert.deepEqual([now.x,now.y],[41,14]);const second=a.hp-b.hp;assert.ok(negative?second===0:second>=min&&second<=max,'Secondary target must take a separate native attack only in range');d.entry.secondary_damage=second;assert.deepEqual([a.x,a.y],kind===5?[39,negative?15:14]:[41,negative?16:15]);}
   });
   if(kind===0&&!negative)assert.match(await publicText(d),/weakens/i);if(kind===1&&!negative)assert.match(await publicText(d),/hallucinat/i);if(kind===2&&!negative)assert.match(await publicText(d),/weaken/i);
   if(kind===4){assert.equal((await d.publicCell(after.x+21,after.y+3))[1],64);if(!negative)assert.notEqual((await d.publicCell(61,17))[1],64);}
   await d.screenshot('native-ability-effect');const final=physical(await d.state());if(input_path==='pc-keyboard'){pc.set(key,final);d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key));d.entry.pc_touch_comparison='matched PC counterpart';}else d.entry.pc_touch_comparison='PC counterpart not selected; equivalence not checked';
  }});
 }
 assert.equal(cases.length,28*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-abilities',createCases:createMonsterAbilityCases,filter:process.env.BROGUE_MONSTER_ABILITIES});
