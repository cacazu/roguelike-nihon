// Primary effects of each CE potion/charm, through production keyboard and touch.
// Numeric enum labels below are the pinned Rogue.h values; effect expectations
// were independently audited against Items/Time/Combat, not computed by fixtures.
import assert from 'node:assert/strict';
import {runFixtureSuite,sceneGroups} from './fixture-browser.mjs';

const potionNames=['LIFE','STRENGTH','TELEPATHY','LEVITATION','DETECT_MAGIC','HASTE_SELF','FIRE_IMMUNITY','INVISIBILITY','POISON','PARALYSIS','HALLUCINATION','CONFUSION','INCINERATION','DARKNESS','DESCENT','LICHEN'];
const charmNames=['HEALTH','PROTECTION','HASTE','FIRE_IMMUNITY','INVISIBILITY','TELEPATHY','LEVITATION','SHATTERING','GUARDIAN','TELEPORTATION','RECHARGING','NEGATION'];
const S={WEAKENED:2,TELEPATHIC:3,HALLUCINATING:4,LEVITATING:5,SLOWED:6,HASTED:7,CONFUSED:8,BURNING:9,PARALYZED:10,POISONED:11,STUCK:12,NAUSEOUS:13,FIRE_IMMUNE:15,DARKNESS:22,LIFESPAN:23,SHIELDED:24,INVISIBLE:25};
const T={WALL:6,HOLE:112,HOLE_GLOW:113,HOLE_EDGE:114,LICHEN:121,FORCEFIELD:147,PLAIN_FIRE:160,POISON_GAS:168,CONFUSION_GAS:169,PARALYSIS_GAS:172};
const flag={HAS_PLAYER:4,FIELD_OF_VIEW:64,ITEM_DETECTED:4096,TELEPATHIC_VISIBLE:536870912,SEIZED:512};
const primary=s=>s.pack.find(item=>item.letter===97);
const item=(s,letter)=>s.pack.find(item=>item.letter===letter.codePointAt(0));
const cell=(s,x,y)=>s.cells.find(c=>c.x===x&&c.y===y);
const status=(s,key)=>s.statuses[S[key]];
const physical=s=>{const result=structuredClone(s);delete result.ready;return result;};

async function observations(d){return (await d.trace()).observations;}
async function rest(d){await d.input('.');await d.settle();return d.state();}
async function assertTelepathy(d,b,s){
  const living=s.monsters.find(m=>!(m.flags&2)),inanimate=s.monsters.find(m=>m.flags&2);
  assert.ok(status(s,'TELEPATHIC')>0);assert.equal(b.monsters.length,2);
  assert.ok(b.monsters.every(m=>!(m.cellFlags&flag.TELEPATHIC_VISIBLE)));
  assert.ok(living.cellFlags&flag.TELEPATHIC_VISIBLE);assert.equal(inanimate.cellFlags&flag.TELEPATHIC_VISIBLE,0);
  await d.screenshot('living-mind-through-wall');
}
async function assertLevitation(d,b,s){
  assert.ok(b.bookkeepingFlags&flag.SEIZED);assert.ok(status(s,'LEVITATING')>0);assert.equal(s.bookkeepingFlags&flag.SEIZED,0);
  const hp=s.hp;await d.input('ArrowRight');await d.settle();const moved=await d.state();
  assert.equal(moved.x,b.x+1);assert.equal(moved.depth,b.depth);assert.equal(moved.hp,hp);assert.ok(status(moved,'LEVITATING')>0);
}
async function fireControl(d,control){
  const initial=await d.state();return control(async c=>{const before=await c.state();assert.equal(before.rng,initial.rng);assert.equal(before.hp,initial.hp);const after=await rest(c);await c.screenshot('unprotected-rest');return after;});
}

async function potionEffect(d,kind,control,b){
  const unexposed=[6,8,12].includes(kind)?await fireControl(d,control):null;
  await d.apply();await d.settle();let s=await d.state();const seen=await observations(d);
  d.effect(()=>{
    assert.equal(primary(s).quantity,1);assert.equal(primary(s).kindKnown,1);if(kind===14)assert.equal(s.turn,b.turn);else assert.ok(s.turn>b.turn);
    switch(kind){
      case 0:
        assert.equal(s.maxHP,b.maxHP+10);assert.equal(s.hp,s.maxHP);assert.equal(s.weaknessAmount,0);assert.equal(s.poisonAmount,0);
        for(const key of['POISONED','DARKNESS','CONFUSED','HALLUCINATING','NAUSEOUS','SLOWED','WEAKENED'])assert.equal(status(s,key),0,key+' cured');break;
      case 1:assert.equal(s.strength,b.strength+1);assert.equal(s.weaknessAmount,0);assert.equal(status(s,'WEAKENED'),0);break;
      case 2:assert.ok(status(s,'TELEPATHIC')>0);break;
      case 3:assert.ok(status(s,'LEVITATING')>0);break;
      case 4:
        assert.equal(item(b,'b').magicDetected,0);assert.equal(item(s,'b').magicDetected,1);
        assert.ok(s.floor.some(i=>i.magicDetected===1&&i.enchant===2));assert.ok(cell(s,43,13).flags&flag.ITEM_DETECTED);
        assert.equal(item(s,'c').magicDetected,0);break;
      case 5:assert.equal(status(s,'SLOWED'),0);assert.ok(status(s,'HASTED')>0);assert.ok(s.movementSpeed<b.movementSpeed);assert.ok(s.attackSpeed<b.attackSpeed);break;
      case 6:assert.ok(status(s,'FIRE_IMMUNE')>0);assert.equal(status(s,'BURNING'),0);assert.ok(s.hp>unexposed.hp);break;
      case 7:assert.ok(status(s,'INVISIBLE')>0);break;
      case 8:
        assert.ok(seen.some(o=>o.gases.some(c=>c.gas===T.POISON_GAS&&c.volume>0)));assert.ok(s.hp<unexposed.hp);
        assert.equal(status(s,'POISONED'),0);assert.equal(s.poisonAmount,0);break;
      case 9:
        assert.ok(seen.some(o=>o.gases.some(c=>c.gas===T.PARALYSIS_GAS&&c.volume>0)));
        assert.ok(seen.some(o=>o.statuses[S.PARALYZED]>0),'Intermediate native paralysis was not observed');
        assert.ok(s.maxStatuses[S.PARALYZED]>0);assert.equal(status(s,'PARALYZED'),0);assert.ok(s.absoluteTurnNumber>b.absoluteTurnNumber+1);assert.ok(new Set(seen.map(o=>o.statuses[S.PARALYZED])).size>3,'Native automatic status countdown was not observed'); // Time.c suppresses player-turn count while paralyzed
        break;
      case 10:assert.ok(status(s,'HALLUCINATING')>0);break;
      case 11:assert.ok(status(s,'CONFUSED')>0);assert.ok(seen.some(o=>o.gases.some(c=>c.gas===T.CONFUSION_GAS&&c.volume>0)));break;
      case 12:assert.ok(status(s,'BURNING')>0);assert.ok(s.hp<unexposed.hp);assert.ok(seen.some(o=>o.surfaces.some(c=>c.surface===T.PLAIN_FIRE)));break;
      case 13:assert.ok(status(s,'DARKNESS')>0);assert.ok(s.mapMetrics.visible<b.mapMetrics.visible,'Darkness did not reduce natural visibility');break;
      case 14:
        assert.equal(s.absoluteTurnNumber,b.absoluteTurnNumber);assert.equal(s.depth,b.depth+1);assert.ok(s.hp<b.hp);assert.ok(seen.some(o=>o.depth===b.depth&&o.surfaces.some(c=>[T.HOLE,T.HOLE_GLOW,T.HOLE_EDGE].includes(c.surface))));break;
      case 15:assert.ok(seen.some(o=>o.surfaces.some(c=>c.surface===T.LICHEN)));break;
    }
  });
  if(kind===2)await assertTelepathy(d,b,s);
  if(kind===3)await assertLevitation(d,b,s);
  if(kind===6){await d.input('ArrowRight');await d.settle();s=await d.state();assert.equal(s.hp,b.hp);assert.equal(status(s,'BURNING'),0);}
  if(kind===14){const landed=await rest(d);assert.ok(landed.turn>s.turn);assert.ok(landed.absoluteTurnNumber>s.absoluteTurnNumber);assert.equal(landed.depth,s.depth);}
  if(kind===15){for(let i=0;i<5&&!status(s,'POISONED');i++)s=await rest(d);assert.ok(status(s,'POISONED')>0);assert.ok(s.poisonAmount>0);}
}

async function charmEffect(d,kind,control,b){
  let reference=null;
  if(kind===1)reference=await control(async c=>{
    const before=await c.state();assert.equal(before.rng,b.rng);let after=before;
    for(let i=0;i<5&&after.hp===before.hp;i++)after=await rest(c);
    assert.ok(after.hp<before.hp,'Unshielded control never received a melee hit');await c.screenshot('unshielded-melee');return after;
  });
  if(kind===3)reference=await fireControl(d,control);
  await d.apply();await d.settle();let s=await d.state();
  d.effect(()=>{
    assert.equal(primary(s).quantity,1);assert.ok(primary(s).charges>0);assert.ok(s.turn>b.turn);
    switch(kind){
      case 0:assert.ok(s.hp>b.hp);assert.equal(s.maxHP,b.maxHP);assert.ok(status(s,'CONFUSED')>0,'Charm healing must not apply potion panacea');break;
      case 1:assert.ok(status(s,'SHIELDED')>0);assert.equal(s.maxStatuses[S.SHIELDED],202);assert.equal(s.hp,b.hp);break;
      case 2:assert.equal(status(s,'SLOWED'),0);assert.ok(status(s,'HASTED')>0);assert.ok(s.movementSpeed<b.movementSpeed);assert.ok(s.attackSpeed<b.attackSpeed);break;
      case 3:assert.ok(status(s,'FIRE_IMMUNE')>0);assert.equal(status(s,'BURNING'),0);assert.ok(s.hp>reference.hp);break;
      case 4:assert.ok(status(s,'INVISIBLE')>0);break;
      case 5:assert.ok(status(s,'TELEPATHIC')>0);break;
      case 6:assert.ok(status(s,'LEVITATING')>0);assert.equal(s.bookkeepingFlags&flag.SEIZED,0);break;
      case 7:
        assert.equal(cell(s,41,13).dungeon,T.FORCEFIELD);assert.equal(cell(s,39,13).dungeon,T.WALL);assert.equal(cell(s,40,14).dungeon,cell(b,40,14).dungeon);break;
      case 8:
        assert.equal(b.monsters.length,0);assert.equal(s.monsters.length,1);assert.equal(s.monsters[0].state,4);assert.equal(s.monsters[0].leaderIsPlayer,1);assert.equal(s.monsters[0].maxStatuses[S.LIFESPAN],8);break;
      case 9:{
        assert.ok(s.x!==b.x||s.y!==b.y);assert.ok(s.x>=20&&s.x<=24&&s.y>=12&&s.y<=17);
        assert.equal(status(s,'STUCK'),0);assert.equal(s.spawnCell.flags&flag.HAS_PLAYER,0);assert.ok(s.playerCell.flags&flag.HAS_PLAYER);
        const originalDestination=b.remoteCells.find(c=>c.x===s.x&&c.y===s.y);assert.ok(originalDestination);assert.equal(originalDestination.flags&flag.FIELD_OF_VIEW,0);assert.equal(originalDestination.flags&flag.HAS_PLAYER,0);break;
      }
      case 10:
        assert.equal(item(b,'b').charges,0);assert.equal(item(s,'b').charges,item(s,'b').enchant);assert.equal(item(s,'c').charges,3);
        assert.ok(item(s,'d').charges>0);assert.ok(item(s,'d').charges<item(b,'d').charges);break;
      case 11:
        assert.equal(status(s,'HASTED'),0);assert.equal(status(s,'INVISIBLE'),0);assert.equal(s.monsters[0].slowed,0);assert.equal(s.monsters[0].invisible,0);
        assert.ok(s.floor.some(i=>i.x===41&&i.y===13&&i.enchant===0&&i.identified===1));assert.ok(s.floor.some(i=>i.category===64&&i.charges===0));
        assert.equal(s.floor.find(i=>i.x===22&&i.y===14).enchant,2);assert.equal(item(s,'b').enchant,2);break;
    }
  });
  if(kind===1){while(s.turn<reference.turn)s=await rest(d);assert.ok(s.hp>reference.hp,'Shield did not absorb actual matched melee');}
  if(kind===3){await d.input('ArrowRight');await d.settle();s=await d.state();assert.equal(s.hp,b.hp);assert.equal(status(s,'BURNING'),0);}
  if(kind===5)await assertTelepathy(d,b,s);
  if(kind===6)await assertLevitation(d,b,s);
  if(kind===8){for(let i=0;i<12&&s.monsters.length;i++)s=await rest(d);assert.equal(s.monsters.length,0,'Guardian did not expire');}
  // Every ready charm remains a rechargeable item, rather than a consumable.
  const charged=primary(await d.state()).charges;await rest(d);assert.ok(primary(await d.state()).charges<charged);
}

const cases=[];
for(const input_path of['pc-keyboard','touch']){
  for(const[category,names,base]of[['potion',potionNames,sceneGroups.POTION_UNKNOWN],['charm',charmNames,sceneGroups.CHARM_READY]]){
    for(const[kind,name]of names.entries()){
      const symbol=category.toUpperCase()+'_'+name;
      cases.push({id:`brogue-${symbol.toLowerCase()}-${input_path}-primary`,fixture_id:base+kind,variant:'brogue',input_path,
        feature_ids:['cmd.apply',category==='potion'?'items.potions_scrolls':'items.staff_wand_charm'],targets:[{domain:category+'Kind',symbol}],
        assertions:['Original item use reaches its per-kind physical effect and returns to command; native time-counter exceptions are asserted explicitly (descent early return and paralysis player-count suppression).','Potion stack2 consumes1 and discovers kind; ready charm remains quantity1 and starts/reduces cooldown.'],
        execute:async(d,{control})=>{const before=await d.state();assert.equal(primary(before).quantity,category==='potion'?2:1);if(category==='potion')assert.equal(primary(before).kindKnown,0);else assert.equal(primary(before).charges,0);await(category==='potion'?potionEffect:charmEffect)(d,kind,control,before);},
      });
    }
  }
  for(let kind=8;kind<potionNames.length;kind++)cases.push({
    id:`brogue-potion_${potionNames[kind].toLowerCase()}-${input_path}-known-no`,fixture_id:sceneGroups.POTION_KNOWN+kind,variant:'brogue',input_path,
    feature_ids:['cmd.apply','dialog.ack_confirm'],targets:[],assertions:['Known harmful-potion confirmation No preserves turn, substantive RNG, quantity, knowledge and effect state.'],
    execute:async d=>{const before=await d.state();await d.apply();assert.equal((await d.wait()).kind,'confirm');await d.input('n');await d.settle();assert.deepEqual(physical(await d.state()),physical(before));},
  });
  for(let kind=0;kind<charmNames.length;kind++)cases.push({
    id:`brogue-charm_${charmNames[kind].toLowerCase()}-${input_path}-cooldown`,fixture_id:sceneGroups.CHARM_COOLDOWN+kind,variant:'brogue',input_path,
    feature_ids:['cmd.apply'],targets:[],assertions:['A charm still recharging rejects use without time, charge, quantity or physical-effect changes.'],
    execute:async d=>{const before=await d.state();await d.apply();await d.settle();assert.deepEqual(physical(await d.state()),physical(before));},
  });
  for(const[category,base]of[['potion',sceneGroups.POTION_UNKNOWN],['charm',sceneGroups.CHARM_READY]])cases.push({
    id:`brogue-${category}-${input_path}-item-cancel`,fixture_id:base,variant:'brogue',input_path,feature_ids:['cmd.apply'],targets:[],assertions:['Cancel at initial item choice preserves full physical state.'],
    execute:async d=>{const before=await d.state();await d.input('a');assert.equal((await d.wait()).kind,'item');await d.input('Escape');await d.settle();assert.deepEqual(physical(await d.state()),physical(before));},
  });
}
await runFixtureSuite({name:'consumables',cases});
