// CE 1.15.1 staff/wand effects through real keyboard/mouse or touch input.
// CHECK scenes prepare state only; these expectations come from the separately
// reviewed Items.c / Monsters.c / PowerTables.c paths, not fixture return values.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups} from './fixture-browser.mjs';

const staffNames=['LIGHTNING','FIRE','POISON','TUNNELING','BLINKING','ENTRANCEMENT','OBSTRUCTION','DISCORD','CONJURATION','HEALING','HASTE','PROTECTION'];
const wandNames=['TELEPORT','SLOW','POLYMORPH','NEGATION','DOMINATION','BECKONING','PLENTY','INVISIBILITY','EMPOWERMENT'];
const S={SLOWED:6,HASTED:7,CONFUSED:8,BURNING:9,POISONED:11,STUCK:12,DISCORDANT:14,FIRE_IMMUNE:15,ENTRANCED:21,SHIELDED:24,INVISIBLE:25};
const T={FLOOR:2,WALL:6,DOWN_STAIRS:12,UP_STAIRS:13,FORCEFIELD:147},F={INANIMATE:2,IMMOBILE:4,INVULNERABLE:262144,REFLECT_100:262144,FOLLOWER:128,FIELD_OF_VIEW:64,HAS_STAIRS:256,IMPREGNABLE:134217728};
const categories=[['staff',staffNames,'STAFF_READY',12],['wand',wandNames,'WAND_READY',9]];
const primary=s=>{const value=s.pack.find(item=>item.letter===97);assert.ok(value,'Prepared item a disappeared');return value;};
const status=(s,key)=>s.statuses[S[key]];
const cell=(s,x,y)=>s.cells.find(c=>c.x===x&&c.y===y);
const at=(s,x=43,y=14)=>{const target=s.monsters.find(m=>m.x===x&&m.y===y);assert.ok(target,`Expected target at ${x},${y}`);return target;};
const xy=s=>[s.x,s.y];
const duration=(s,key,nominal)=>{assert.ok(status(s,key)>0&&status(s,key)<=nominal,key+' duration');assert.equal(s.maxStatuses[S[key]],nominal,key+' nominal maxStatus');};
const effectMonster=m=>({kind:m.kind,x:m.x,y:m.y,hp:m.hp,maxHP:m.maxHP,state:m.state,flags:m.flags,abilityFlags:m.abilityFlags,bookkeepingFlags:m.bookkeepingFlags,leaderIsPlayer:m.leaderIsPlayer,statuses:m.statuses,maxStatuses:m.maxStatuses,poisonAmount:m.poisonAmount,movementSpeed:m.movementSpeed,attackSpeed:m.attackSpeed,newPowerCount:m.newPowerCount,totalPowerCount:m.totalPowerCount,negated:m.negated});
// rng is the substantive randomNumbersGenerated count and must not change.
// Cosmetic RNG state, focus/cursor, wait serial and presentation are excluded.
const noAction=s=>({turn:s.turn,absoluteTurnNumber:s.absoluteTurnNumber,rng:s.rng,x:s.x,y:s.y,hp:s.hp,maxHP:s.maxHP,depth:s.depth,gold:s.gold,statuses:s.statuses,maxStatuses:s.maxStatuses,poisonAmount:s.poisonAmount,pack:s.pack,floor:s.floor,monsters:s.monsters.map(effectMonster),cells:s.cells,playerCell:s.playerCell});
// Pack/knowledge/charge bookkeeping is checked separately for empty fizzle;
// this comparator is the observed effect-bearing world after one normal turn.
const effectWorld=s=>({turn:s.turn,absoluteTurnNumber:s.absoluteTurnNumber,rng:s.rng,x:s.x,y:s.y,hp:s.hp,maxHP:s.maxHP,depth:s.depth,gold:s.gold,statuses:s.statuses,maxStatuses:s.maxStatuses,poisonAmount:s.poisonAmount,floor:s.floor,monsters:s.monsters.map(effectMonster),cells:s.cells,playerCell:s.playerCell});
const sourceRefs=['Rogue.h:staffKind/wandKind','GlobalsBrogue.c:staffTable_Brogue/wandTable_Brogue/boltCatalog_Brogue','Items.c:apply/useStaffOrWand/chooseTarget/zap/updateBolt/detonateBolt','Monsters.c:empowerMonster/cloneMonster','PowerTables.c:staff* and wandDominate'];

// This exported contract is also the fixture owner's scene specification.
// It is SOURCE DESIGN, not execution evidence. --list prints it without playing.
export const boltPlan={
  reference:'Brogue CE 1.15.1; brogue variant only',execution:false,coverage:'partial',
  geometry:{columns:100,rows:34,mapWindowOffset:[21,3],player:[40,14],target:[43,14],up:[37,11],down:[37,17]},
  scene_number:'STAFF_READY/WAND_READY + condition*100 + zero-based active kind; kind<100',
  conditions:{0:'primary (also reused by aiming Escape)',1:'ITEM_IDENTIFIED empty: reject before aiming',2:'kindKnown=true but not ITEM_IDENTIFIED empty: confirm -> fizzle one turn',3:'per-kind unsuitable target or limiting geometry',4:'MA_REFLECT_100 at distance3; spatial halt-before is separate from an actual return hit',5:'wand domination only: full HP has zero success probability'},
  shared:{staff:{enchant:2,charges:2,rechargeTimer:1000},wand:{charges:3,rechargeTimer:0},item:{letter:'a',quantity:1,lastUsed:[0,0,0]},
    player:{hp:100,maxHP:100,armor:0,immunities:0,regen:'delayed'},
    target:{kind:'ordinary non-regenerating living monster',hp:100,maxHP:100,ticksUntilTurn:10000,reflection:0},
    empty:'Keep the kind-specific geometry; charges0 and positive staff rechargeTimer. Condition1 ITEM_IDENTIFIED; condition2 has kindKnown=true but clears ITEM_IDENTIFIED and ITEM_MAX_CHARGES_KNOWN. Kind knowledge alone is not the instance empty check. Fizzle costs one ordinary turn, so compare effect-bearing world state to a same-scene real-rest control (prepared poison/statuses still tick).',
    unsuitable:'Start with fresh zero-effect statuses/speeds, not the primary positive-effect preconditions; then apply only the listed immunity/geometry/fullHP/shield500. In particular do not carry poison into an inanimate empowerment target.',
    reflection:'One reflector43,14 with MA_REFLECT_100 (projectileReflects has two guaranteed true rolls), no player reflection armor or fire immunity. No extra intervening target. Manual visible-cell aim; do not invoke a private target/zap API.'},
  staff:staffNames.map((name,kind)=>({kind,symbol:'STAFF_'+name,
    primary:[
      'Front42,14 and rear43,14 HP100; both lose direct3..9 HP (piercing).',
      'Front42,14 and rear43,14 HP100; intermediate front hit loses3..9 direct HP; normal turn adds separate burn1..3 even with delayed actions. Rear is unchanged.',
      'Target43,14 initially poisonAmount0/status0; pre-turn duration5/dose1, maxStatus=maxHP/dose100. One ordinary tick leaves duration4 and costs1HP.',
      'No monster. WALL41,14 and42,14 and43,14; +2 removes first2, third remains; walk through excavated cells.',
      'No monster. Safe corridor through47,14; STUCK20 but no web; blink right to46,14, STUCK clears.',
      'Target43,14 with empty44,14; nominal ENTRANCED6; player west followup makes target move east.',
      'Target43,14; forcefield SURFACE at halt-before endpoint, no target HP damage. Blocking and eventual decay are separate unverified branches.',
      'Target43,14 discord0; nominal DISCORD8. This does not certify subsequent AI combat.',
      'No target; safe floor through44,14, aim43,14; exactly3 ally spectral blades with player leader/follower.',
      'Target43,14 HP20/max100, CONFUSED20; HP becomes40, max100, confusion remains (no panacea).',
      'Target43,14 SLOWED20 and speeds twice baseline; haste nominal10 clears slow and halves baseline speeds.',
      'Target43,14 shield0; nominal shield130 units, no HP/maxHP change.'
    ][kind],
    unsuitable:[
      'INVULNERABLE target HP unchanged.',
      'Target FIRE_IMMUNE20; no direct damage or new burning.',
      'INANIMATE target poison/status/dose unchanged.',
      'No monster. IMPREGNABLE wall41,14 remains; no promise of deterministic reflected direction.',
      'No monster. First adjacent cell41,14 WALL: player remains40,14 although shot is charged.',
      'INANIMATE target ENTRANCED unchanged.',
      'No monster. WALL43,14 remains; forcefield appears before wall, not direct wall/HP damage.',
      'INANIMATE target DISCORDANT unchanged.',
      'No target. WALL43,14 remains;3 blades appear before obstruction (not a no-generation guarantee).',
      'Target fullHP100 remains capped; INANIMATE is not a heal immunity.',
      'INANIMATE target haste/slow/speeds unchanged.',
      'Target existing shield500 is not reduced to130; compare one normal turn control.'
    ][kind],
    reflection:[
      'Reflector HP unchanged; returning bolt decreases player HP.',
      'Reflector HP/burning unchanged; player HP decreases and gains burning.',
      'Reflector poison unchanged; player poison dose+1/status positive.',
      'Reflector HP unchanged; return is tunneling, not damage. Do not certify a caster effect from charge use.',
      'Halt-before: player reaches42,14, reflector remains43,14; no normal reflected blink claim.',
      'Reflector ENTRANCED unchanged; player CONFUSED positive and ENTRANCED0.',
      'Halt-before: forcefield surfaces before43,14, reflector unchanged; no return-hit claim.',
      'Reflector discord unchanged; player DISCORDANT positive, without AI-input claims.',
      'Halt-before:3 ally blades before43,14, reflector remains; no return-hit claim.',
      'Player HP20/max100 gains20 HP; reflector HP unchanged.',
      'Player SLOWED20 clears, HASTED positive and speeds improve; reflector unchanged.',
      'Player shield nominal130; reflector unchanged.'
    ][kind]})),
  wand:wandNames.map((name,kind)=>({kind,symbol:'WAND_'+name,
    primary:[
      'Mobile target43,14, STUCK20; hidden eligible remote floor20..24/12..17. Target relocates, stuck clears, player stays.',
      'Target initially HASTED20 and half-base speeds; slow nominal50 clears haste, speeds twice baseline (not prose30).',
      'Ordinary target43,14; actual kind changes, remains a living valid creature. MONST_NO_POLYMORPH is not target immunity.',
      'Target HASTED20/INVISIBLE20 with removable traits; statuses clear and wasNegated records true.',
      'Hostile target HP1/max100, discord20: guaranteed ally/player leader/follower and discord clears.',
      'Mobile target43,14 STUCK20; arrives adjacent41,14, stuck clears, player stays.',
      'Ally target HP9/max100; original+one clone each HP5, maxHP100 unchanged.',
      'Ordinary visible ally with no innate invisibility; timed INVISIBLE nominal150.',
      'Living ally HP20/max100 poison20/dose1; maxHP+12 to112, full heal/poison cure, power counters+1 (no instant learned ability).'
    ][kind],
    unsuitable:[
      'IMMOBILE target position unchanged.',
      'INANIMATE target speed/status unchanged; autoID is not effect proof.',
      'INANIMATE target kind unchanged.',
      'Ordinary target with no negatable effects: no effect-bearing transition (do not demand wasNegated0).',
      'INANIMATE target remains unbound; fullHP living resistance is separate condition5.',
      'IMMOBILE target position unchanged.',
      'INANIMATE target no clone or HP split.',
      'INANIMATE target no newly timed invisibility.',
      'INANIMATE target no maxHP/HP/power increase.'
    ][kind],
    reflection:[
      'Hidden eligible remote floor exists; player relocates/stuck clears, reflector stays43,14.',
      'Player HASTED20 clears, slow nominal50 and speeds worsen; reflector unchanged.',
      'Player excluded from polymorph: player form/maxHP unchanged, reflector kind unchanged.',
      'Player HASTED20/INVISIBLE20 clears; reflector keeps reflection ability.',
      'Player excluded from domination, reflector remains hostile and unbound.',
      'Self caster distance0: no movement; reflector stays.',
      'Player HP9 ->5; exactly one ally clone HP5/maxHP100, reflector is not cloned.',
      'Player gains timed invisibility nominal150; reflector remains visible.',
      'Player excluded from empowerment: no HP/maxHP/power gains; reflector unchanged.'
    ][kind]})),
  source_refs:sourceRefs,
  limits:['No Rapid/Bullet success inferred from CE. Active12/9 limits come from itemKindCount; enum boundary aliases are not kinds.',
    'All cases remain partial; no whole item family/all-branch certification.',
    'Fixture placement is not ordinary play or replay-compatible save evidence.',
    'No claim about unobserved combat utility, carried items/child creatures, talent learning or per-turn AI damage.',
    'The unidentified-empty condition has a globally known kind to test the instance/global distinction; a globally unknown kind is a separate unexecuted branch.']
};

async function aim(d,x=43,y=14){
  const before=await d.wait(),beforeState=await d.state(),traceStart=(await d.trace()).native_trace.length;assert.equal(before.kind,'target');assert.equal(before.waiting,true);
  const canvas=d.page.locator('#game'),box=await canvas.boundingBox();assert.ok(box);
  const point={x:box.x+(x+21+.5)*box.width/100,y:box.y+(y+3+.5)*box.height/34};
  assert.equal(await d.page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id==='game',point),true,'Public map target must be visible and unobstructed');
  await d.screenshot('aiming');
  if(d.entry.input_path==='touch')await d.page.touchscreen.tap(point.x,point.y);else await d.page.mouse.click(point.x,point.y);
  // Mouse hover already moved the cursor. A finger's first tap may only
  // select a different cell; native moveCursor then needs Enter or a second tap.
  await d.page.waitForFunction(({serial,traceStart,x,y})=>__brogueFixture.waiting&&__brogueFixture.serial>serial
    &&__brogueFixture.native_trace.slice(traceStart).some(row=>row.event[0]===1&&row.event[1]===x+21&&row.event[2]===y+3),
    {serial:before.serial,traceStart,x,y},{timeout:60000});
  await d.record(`${d.entry.input_path==='touch'?'tap':'click'} public map ${x},${y}`);
  if((await d.wait()).kind==='target'){
    assert.equal(d.entry.input_path,'touch','Mouse click with hover must already confirm the public target');
    const selected=await d.state();assert.deepEqual(selected.cursor,{x,y});assert.deepEqual(noAction(selected),noAction(beforeState),'Selecting a target must not apply its effect or spend a turn/charge');
    assert.ok((await d.wait()).descriptor.slice(4).includes(10),'Original target owner must publish Enter');
    assert.equal(await d.page.locator('#submit').isVisible(),true);await d.screenshot('target-selected');await d.input('Enter');
  }
  assert.notEqual((await d.wait()).kind,'target','Committed aim must leave target selection');await d.settle();
}
async function use(d,x=43,y=14){await d.apply();await aim(d,x,y);return d.state();}
async function rest(d){await d.input('.');await d.settle();return d.state();}
function checkPrepared(b,category,kind,condition){
  assert.deepEqual([b.upX,b.upY],[37,11]);assert.deepEqual([b.downX,b.downY],[37,17]);
  assert.equal(cell(b,37,11).dungeon,T.UP_STAIRS);assert.equal(cell(b,37,17).dungeon,T.DOWN_STAIRS);
  assert.ok(cell(b,37,11).flags&F.HAS_STAIRS);assert.ok(cell(b,37,17).flags&F.HAS_STAIRS);
  assert.equal(cell(b,38,14).dungeon,T.FLOOR);assert.equal(cell(b,38,14).flags&F.HAS_STAIRS,0);
  assert.equal(cell(b,42,14).dungeon,category==='staff'&&kind===3&&condition<=2?T.WALL:T.FLOOR);assert.equal(cell(b,42,14).flags&F.HAS_STAIRS,0);
  const it=primary(b);assert.equal(b.kindCounts[category],category==='staff'?12:9,'Active CE kind count');assert.equal(it.kind,kind);assert.equal(it.quantity,1);
  assert.equal(it.charges,[1,2].includes(condition)?0:category==='staff'?2:3);
  assert.ok(Array.isArray(it.lastUsed)&&it.lastUsed.length===3,'CHECK item lastUsed observer required');
  assert.equal(it.identified,condition===2?0:1);
  if(condition===2)assert.equal(it.kindKnown,1,'Global kind knowledge must not reject an unidentified empty instance before aiming');
  if(category==='staff'){assert.equal(it.enchant,2);assert.equal(it.rechargeTimer,1000,'Positive staff timer must remain below the overcharge-drain ceiling');}
  if(condition===4){assert.equal(b.armor,0);assert.equal(status(b,'FIRE_IMMUNE'),0);assert.ok(at(b).abilityFlags&F.REFLECT_100);assert.equal(at(b).hp,100);}
  if(condition===0){
    if(category==='staff'){
      if([0,1].includes(kind)){assert.equal(b.monsters.length,2);assert.equal(at(b,42).hp,100);assert.equal(at(b,43).hp,100);}
      if(kind===2){assert.equal(status(at(b),'POISONED'),0);assert.equal(at(b).poisonAmount,0);}
      if(kind===3){for(const x of[41,42,43])assert.equal(cell(b,x,14).dungeon,T.WALL);assert.equal(b.monsters.length,0);}
      if(kind===4){assert.equal(b.monsters.length,0);assert.ok(status(b,'STUCK')>0);}
      if(kind===5)assert.equal(status(at(b),'ENTRANCED'),0);
      if(kind===7)assert.equal(status(at(b),'DISCORDANT'),0);
      if(kind===8)assert.equal(b.monsters.length,0);
      if(kind===9){assert.equal(at(b).hp,20);assert.equal(at(b).maxHP,100);assert.ok(status(at(b),'CONFUSED')>0);}
      if(kind===10){assert.ok(status(at(b),'SLOWED')>0);assert.equal(status(at(b),'HASTED'),0);}
      if(kind===11)assert.equal(status(at(b),'SHIELDED'),0);
    }else{
      assert.equal(b.monsters.length,1);assert.equal(at(b).flags&(F.INANIMATE|F.INVULNERABLE),0);
      if([0,5].includes(kind)){assert.ok(status(at(b),'STUCK')>0);assert.equal(at(b).flags&F.IMMOBILE,0);}
      if(kind===1){assert.ok(status(at(b),'HASTED')>0);assert.equal(status(at(b),'SLOWED'),0);}
      if(kind===3){assert.ok(status(at(b),'HASTED')>0);assert.ok(status(at(b),'INVISIBLE')>0);}
      if(kind===4){assert.equal(at(b).hp,1);assert.equal(at(b).maxHP,100);assert.notEqual(at(b).state,4);}
      if(kind===6){assert.equal(at(b).hp,9);assert.equal(at(b).maxHP,100);assert.equal(at(b).state,4);}
      if(kind===7){assert.equal(status(at(b),'INVISIBLE'),0);assert.equal(at(b).state,4);}
      if(kind===8){assert.equal(at(b).hp,20);assert.equal(at(b).maxHP,100);assert.ok(status(at(b),'POISONED')>0);assert.equal(at(b).poisonAmount,1);assert.equal(at(b).state,4);assert.ok(Number.isInteger(at(b).newPowerCount)&&Number.isInteger(at(b).totalPowerCount));}
    }
  }
  if(condition===3){
    if(category==='staff'){
      if(kind===0)assert.ok(at(b).flags&F.INVULNERABLE);
      if(kind===1)assert.ok(status(at(b),'FIRE_IMMUNE')>0);
      if([2,5,7,10].includes(kind))assert.ok(at(b).flags&F.INANIMATE);
      if([3,4].includes(kind)){assert.equal(cell(b,41,14).dungeon,T.WALL);assert.equal(b.monsters.length,0);if(kind===3)assert.ok(cell(b,41,14).flags&F.IMPREGNABLE);}
      if([6,8].includes(kind)){assert.equal(cell(b,43,14).dungeon,T.WALL);assert.equal(b.monsters.length,0);}
      if(kind===9){assert.equal(at(b).hp,100);assert.equal(at(b).maxHP,100);}
      if(kind===11)assert.equal(status(at(b),'SHIELDED'),500);
    }else{
      if([0,5].includes(kind))assert.ok(at(b).flags&F.IMMOBILE);
      if([1,2,4,6,7,8].includes(kind))assert.ok(at(b).flags&F.INANIMATE);
      if(kind===3){assert.equal(at(b).flags,0);assert.equal(at(b).abilityFlags,0);for(const key of['SLOWED','HASTED','INVISIBLE','SHIELDED','POISONED'])assert.equal(status(at(b),key),0);}
    }
  }
}
function spent(before,after,category){
  assert.equal(primary(after).charges,primary(before).charges-1);assert.equal(primary(after).quantity,primary(before).quantity);assert.equal(after.turn,before.turn+1);
  if(category==='wand')assert.equal(primary(after).rechargeTimer,primary(before).rechargeTimer+1);
  else assert.deepEqual(primary(after).lastUsed,[before.absoluteTurnNumber,...primary(before).lastUsed.slice(0,2)]);
}
function noTargetChange(before,after){
  assert.equal(after.monsters.length,before.monsters.length);
  for(const original of before.monsters){const m=at(after,original.x,original.y);assert.equal(m.kind,original.kind);assert.equal(m.hp,original.hp);assert.equal(m.maxHP,original.maxHP);}
}
async function staffPrimary(d,kind,b,s){
  const target=[3,4,8].includes(kind)?null:at(s),original=target?at(b):null;
  switch(kind){
    case 0:for(const x of[42,43])assert.ok(at(b,x).hp-at(s,x).hp>=3&&at(b,x).hp-at(s,x).hp<=9);break;
    case 1:{
      const direct=(await d.trace()).observations.filter(o=>o.turn===b.turn&&o.absoluteTurnNumber===b.absoluteTurnNumber)
        .map(o=>o.monsters.find(m=>m.x===42&&m.y===14)).find(m=>m&&m.hp<at(b,42).hp);
      assert.ok(direct,'A pre-turn/tick frame must separate direct fire damage from later burning');
      const hit=at(b,42).hp-direct.hp;assert.ok(hit>=3&&hit<=9);assert.equal(s.absoluteTurnNumber,b.absoluteTurnNumber+1);
      assert.ok(at(s,42).hp<direct.hp&&at(s,42).hp>=direct.hp-3,'One native burning tick adds separately observed1..3 damage');
      assert.ok(status(at(s,42),'BURNING')>0);assert.equal(at(s,43).hp,at(b,43).hp);break;
    }
    case 2:{
      const assigned=(await d.trace()).observations.filter(o=>o.turn===b.turn&&o.absoluteTurnNumber===b.absoluteTurnNumber)
        .map(o=>o.monsters.find(m=>m.x===43&&m.y===14)).find(m=>m&&status(m,'POISONED')===5&&m.poisonAmount===1);
      assert.ok(assigned,'Pre-tick poison duration5 and dose1 must be observed');
      assert.equal(target.poisonAmount,original.poisonAmount+1);assert.equal(status(target,'POISONED'),4);assert.equal(s.absoluteTurnNumber,b.absoluteTurnNumber+1);
      assert.equal(target.maxStatuses[S.POISONED],Math.floor(target.maxHP/target.poisonAmount),'Combat.addPoison maxStatus is lethal-duration scale, not the duration increment');
      assert.equal(target.hp,original.hp-target.poisonAmount,'One objective tick applies real poison damage');break;
    }
    case 3:assert.equal(cell(s,41,14).dungeon,T.FLOOR);assert.equal(cell(s,42,14).dungeon,T.FLOOR);assert.equal(cell(s,43,14).dungeon,T.WALL);break;
    case 4:assert.deepEqual(xy(s),[46,14]);assert.equal(status(s,'STUCK'),0);break;
    case 5:duration(target,'ENTRANCED',6);break;
    case 6:assert.ok((await d.trace()).observations.some(o=>o.surfaces.some(c=>c.surface===T.FORCEFIELD)));assert.equal(target.hp,original.hp);break;
    case 7:duration(target,'DISCORDANT',8);break;
    case 8:{const blades=s.monsters.filter(m=>m.kind===55);assert.equal(blades.length,3);for(const m of blades){assert.equal(m.state,4);assert.equal(m.leaderIsPlayer,1);assert.ok(m.bookkeepingFlags&F.FOLLOWER);}break;}
    case 9:assert.equal(target.hp,original.hp+20);assert.equal(target.maxHP,100);assert.ok(status(target,'CONFUSED')>0);break;
    case 10:duration(target,'HASTED',10);assert.equal(status(target,'SLOWED'),0);assert.equal(target.movementSpeed,original.movementSpeed/4);assert.equal(target.attackSpeed,original.attackSpeed/4);break;
    case 11:duration(target,'SHIELDED',130);assert.equal(target.hp,original.hp);assert.equal(target.maxHP,original.maxHP);break;
  }
}
function wandPrimary(kind,b,s){
  const old=at(b),target=[0,5].includes(kind)?s.monsters.find(m=>m.kind===old.kind):kind===2?s.monsters[0]:at(s);
  assert.ok(target);
  switch(kind){
    case 0:assert.notDeepEqual(xy(target),xy(old));assert.deepEqual(xy(s),xy(b));assert.equal(status(target,'STUCK'),0);assert.ok(b.remoteCells.some(c=>c.x===target.x&&c.y===target.y&&!(c.flags&F.FIELD_OF_VIEW)));break;
    case 1:duration(target,'SLOWED',50);assert.equal(status(target,'HASTED'),0);assert.equal(target.movementSpeed,old.movementSpeed*4);assert.equal(target.attackSpeed,old.attackSpeed*4);break;
    case 2:assert.notEqual(target.kind,old.kind);assert.ok(target.hp>0&&target.hp<=target.maxHP);assert.equal(s.monsters.length,1);break;
    case 3:assert.equal(status(target,'HASTED'),0);assert.equal(status(target,'INVISIBLE'),0);assert.equal(target.negated,1);break;
    case 4:assert.equal(target.state,4);assert.equal(target.leaderIsPlayer,1);assert.ok(target.bookkeepingFlags&F.FOLLOWER);assert.equal(status(target,'DISCORDANT'),0);break;
    case 5:assert.deepEqual(xy(target),[41,14]);assert.deepEqual(xy(s),xy(b));assert.equal(status(target,'STUCK'),0);break;
    case 6:assert.equal(s.monsters.length,b.monsters.length+1);for(const m of s.monsters){assert.equal(m.kind,old.kind);assert.equal(m.hp,5);assert.equal(m.maxHP,old.maxHP);assert.equal(m.state,4);}break;
    case 7:duration(target,'INVISIBLE',150);assert.equal(target.hp,old.hp);break;
    case 8:assert.equal(target.maxHP,old.maxHP+12);assert.equal(target.hp,target.maxHP);assert.equal(status(target,'POISONED'),0);assert.equal(target.newPowerCount,old.newPowerCount+1);assert.equal(target.totalPowerCount,old.totalPowerCount+1);break;
  }
}
async function primaryEffect(d,category,kind,b){
  const aimX=category==='staff'&&[3,4].includes(kind)?41:43;
  const s=await use(d,aimX);spent(b,s,category);
  d.entry.effect_asserted_attempted=true;
  if(category==='staff')await staffPrimary(d,kind,b,s);else wandPrimary(kind,b,s);
  if(category==='staff'&&kind===3){await d.input('l');await d.input('l');assert.deepEqual(xy(await d.state()),[42,14]);}
  if(category==='staff'&&kind===5){await d.input('h');const moved=await d.state();assert.deepEqual(xy(moved),[39,14]);assert.deepEqual(xy(at(moved,44,14)),[44,14]);}
  d.entry.effect_reached=true;
}
async function unsuitable(d,category,kind,b,control){
  const reference=(category==='staff'&&kind===11)?await control(c=>rest(c)):null;
  const s=await use(d,category==='staff'&&[3,4].includes(kind)?41:43);spent(b,s,category);
  if(category==='staff'){
    if(kind===3)assert.equal(cell(s,41,14).dungeon,cell(b,41,14).dungeon);
    else if(kind===4)assert.deepEqual(xy(s),xy(b));
    else if(kind===6){assert.equal(cell(s,43,14).dungeon,T.WALL);assert.ok((await d.trace()).observations.some(o=>o.surfaces.some(c=>c.x<43&&c.surface===T.FORCEFIELD)));}
    else if(kind===8){assert.equal(cell(s,43,14).dungeon,T.WALL);assert.equal(s.monsters.filter(m=>m.kind===55).length,3);}
    else if(kind===11)assert.equal(status(at(s),'SHIELDED'),status(at(reference),'SHIELDED'));
    else{const old=at(b),m=at(s);assert.equal(m.hp,old.hp);assert.equal(m.kind,old.kind);for(const key of kind===1?['BURNING']:kind===2?['POISONED']:kind===5?['ENTRANCED']:kind===7?['DISCORDANT']:kind===10?['HASTED','SLOWED']:[])assert.equal(status(m,key),status(old,key));if(kind===2)assert.equal(m.poisonAmount,old.poisonAmount);if(kind===10){assert.equal(m.movementSpeed,old.movementSpeed);assert.equal(m.attackSpeed,old.attackSpeed);}}
  }else{
    noTargetChange(b,s);const old=at(b),m=at(s);
    if([0,5].includes(kind))assert.ok(old.flags&F.IMMOBILE);
    if(kind===1){assert.equal(status(m,'SLOWED'),status(old,'SLOWED'));assert.equal(m.movementSpeed,old.movementSpeed);assert.equal(m.attackSpeed,old.attackSpeed);}
    if(kind===3){assert.equal(status(m,'HASTED'),0);assert.equal(status(m,'INVISIBLE'),0);}
    if(kind===4){assert.notEqual(m.state,4);assert.equal(m.leaderIsPlayer,0);}
    if(kind===7)assert.equal(status(m,'INVISIBLE'),status(old,'INVISIBLE'));
    if(kind===8){assert.equal(m.newPowerCount,old.newPowerCount);assert.equal(m.totalPowerCount,old.totalPowerCount);}
  }
}
async function reflection(d,category,kind,b){
  const s=await use(d);spent(b,s,category);const old=at(b),reflector=at(s);
  const hasEffect=!(category==='staff'&&kind===3)&&!(category==='wand'&&[2,4,5,8].includes(kind));
  if(hasEffect)d.entry.effect_asserted_attempted=true;
  assert.equal(reflector.kind,old.kind);assert.equal(reflector.hp,old.hp);assert.equal(reflector.maxHP,old.maxHP);assert.ok(reflector.abilityFlags&F.REFLECT_100);
  for(const key of['POISONED','BURNING','ENTRANCED','DISCORDANT','INVISIBLE','HASTED','SLOWED','SHIELDED'])assert.equal(status(reflector,key),status(old,key),'Reflector '+key);
  if(category==='staff'){
    switch(kind){
      case 0:assert.ok(s.hp<b.hp);break;
      case 1:assert.ok(s.hp<b.hp);assert.ok(status(s,'BURNING')>0);break;
      case 2:assert.equal(s.poisonAmount,b.poisonAmount+1);assert.ok(status(s,'POISONED')>0);break;
      case 3:assert.equal(s.hp,b.hp);break;
      case 4:assert.deepEqual(xy(s),[42,14]);assert.equal(status(s,'STUCK'),0);break;
      case 5:assert.ok(status(s,'CONFUSED')>0);assert.equal(status(s,'ENTRANCED'),0);break;
      case 6:assert.ok((await d.trace()).observations.some(o=>o.surfaces.some(c=>c.x<43&&c.surface===T.FORCEFIELD)));break;
      case 7:assert.ok(status(s,'DISCORDANT')>0);break;
      case 8:assert.equal(s.monsters.filter(m=>m.kind===55).length,3);break;
      case 9:assert.equal(s.hp,b.hp+20);assert.equal(s.maxHP,b.maxHP);break;
      case 10:assert.ok(status(s,'HASTED')>0);assert.equal(status(s,'SLOWED'),0);assert.ok(s.movementSpeed<b.movementSpeed&&s.attackSpeed<b.attackSpeed);break;
      case 11:duration(s,'SHIELDED',130);break;
    }
  }else{
    switch(kind){
      case 0:assert.notDeepEqual(xy(s),xy(b));assert.equal(status(s,'STUCK'),0);assert.ok(b.remoteCells.some(c=>c.x===s.x&&c.y===s.y&&!(c.flags&F.FIELD_OF_VIEW)));break;
      case 1:assert.ok(status(s,'SLOWED')>0);assert.equal(status(s,'HASTED'),0);assert.ok(s.movementSpeed>b.movementSpeed&&s.attackSpeed>b.attackSpeed);break;
      case 2:assert.equal(s.maxHP,b.maxHP);assert.deepEqual(xy(s),xy(b));assert.equal(s.monsters.length,b.monsters.length);break;
      case 3:assert.equal(status(s,'HASTED'),0);assert.equal(status(s,'INVISIBLE'),0);break;
      case 4:assert.notEqual(reflector.state,4);assert.equal(reflector.leaderIsPlayer,0);assert.equal(s.maxHP,b.maxHP);break;
      case 5:assert.deepEqual(xy(s),xy(b));break;
      case 6:{assert.equal(s.hp,5);assert.equal(s.maxHP,b.maxHP);const clones=s.monsters.filter(m=>m.x!==old.x||m.y!==old.y);assert.equal(clones.length,1);assert.equal(clones[0].hp,5);assert.equal(clones[0].maxHP,b.maxHP);assert.equal(clones[0].state,4);break;}
      case 7:assert.ok(status(s,'INVISIBLE')>0&&status(s,'INVISIBLE')<=150);break;
      case 8:assert.equal(s.hp,b.hp);assert.equal(s.maxHP,b.maxHP);assert.equal(s.monsters.length,b.monsters.length);break;
    }
  }
  if(hasEffect)d.entry.effect_reached=true;
}

export function createBoltCases(){
  const cases=[];
  for(const [category,names,group]of categories)for(const[kind,name]of names.entries())for(const input of['pc','touch']){
    const symbol=category.toUpperCase()+'_'+name,base=sceneGroups[group];
    for(const scenario of['primary','target-cancel','identified-empty','unknown-empty','unsuitable','reflection']){
      const condition=({primary:0,'target-cancel':0,'identified-empty':1,'unknown-empty':2,unsuitable:3,reflection:4})[scenario];
      const hasEffect=scenario==='primary'||scenario==='reflection'&&!(category==='staff'&&kind===3)&&!(category==='wand'&&[2,4,5,8].includes(kind));
      const input_path=input==='touch'?'touch':['target-cancel','identified-empty'].includes(scenario)?'pc-keyboard':'pc-keyboard-mouse';
      const row=boltPlan[category][kind];
      cases.push({id:`brogue-${symbol.toLowerCase()}-${input}-${scenario}`,fixture_group:group,fixture_offset:condition*100+kind,
        fixture_id:Number.isSafeInteger(base)?base+condition*100+kind:undefined,variant:'brogue',input_path,
        feature_ids:['cmd.apply','items.staff_wand_charm',...(['target-cancel','primary','reflection','unknown-empty','unsuitable'].includes(scenario)?['target.select']:[])],
        targets:hasEffect?[{domain:category+'Kind',symbol}]:[],source_refs:sourceRefs,case_scope:scenario,
        assertions:[scenario==='target-cancel'?'Aiming Escape preserves substantive state, charges and staff lastUsed/wand firing count.':scenario==='primary'?row.primary:scenario==='unsuitable'?row.unsuitable:scenario==='reflection'?row.reflection:boltPlan.conditions[condition],
          'Per-kind independent state assertions; charge use and identification are never sufficient effect evidence. No all-branch or other-variant certification.'],
        execute:async(d,{control})=>{
          const b=await d.state();checkPrepared(b,category,kind,condition);
          assert.equal((await d.publicCell(58,14))[1],60,'Prepared up staircase must appear in the public C frame');
          assert.equal((await d.publicCell(58,20))[1],62,'Prepared down staircase must appear in the public C frame');
          if(scenario==='primary'){
            await primaryEffect(d,category,kind,b);
            const boundary=await d.state(),consumed=(await d.trace()).native_trace.length;const next=await rest(d);
            assert.equal(next.turn,boundary.turn+1,'A real followup rest must advance exactly one player turn');
            assert.equal((await d.trace()).native_trace.length,consumed+1,'No stale pointer/key or duplicate input may remain after a shot');
          }
          else if(scenario==='target-cancel'){await d.apply();assert.equal((await d.wait()).kind,'target');await d.input('Escape');await d.settle();assert.deepEqual(noAction(await d.state()),noAction(b));}
          else if(scenario==='identified-empty'){await d.apply();await d.settle();assert.deepEqual(noAction(await d.state()),noAction(b));}
          else if(scenario==='unknown-empty'){
            assert.equal(primary(b).maxChargesKnown,0);const reference=await control(async c=>{
              const initial=await c.state();assert.deepEqual(noAction(initial),noAction(b),'Control must start with the identical substantive state/RNG');
              const consumed=(await c.trace()).native_trace.length,next=await rest(c);assert.equal(next.turn,b.turn+1);
              assert.equal((await c.trace()).native_trace.length,consumed+1,'Control must consume exactly one real rest event');return next;
            });
            const s=await use(d,category==='staff'&&[3,4].includes(kind)?41:43);
            assert.equal(s.turn,b.turn+1);assert.equal(primary(s).charges,0);assert.equal(primary(s).rechargeTimer,category==='staff'?primary(b).rechargeTimer-10:primary(b).rechargeTimer);assert.equal(primary(s).maxChargesKnown,1);assert.deepEqual(primary(s).lastUsed,primary(b).lastUsed);
            assert.deepEqual(effectWorld(s),effectWorld(reference),'Empty fizzle must have only the same ordinary-world effects as one real rest');
          }else if(scenario==='unsuitable')await unsuitable(d,category,kind,b,control);
          else await reflection(d,category,kind,b);
        }});
    }
  }
  for(const input_path of['pc-keyboard-mouse','touch'])cases.push({id:'brogue-wand_domination-'+input_path+'-full-hp-resistance',fixture_group:'WAND_READY',fixture_offset:504,
    fixture_id:Number.isSafeInteger(sceneGroups.WAND_READY)?sceneGroups.WAND_READY+504:undefined,variant:'brogue',input_path,
    feature_ids:['cmd.apply','target.select'],targets:[],source_refs:sourceRefs,case_scope:'valid-target-resistance',assertions:['Living hostile currentHP=maxHP gives exactly0% domination; remains hostile/unbound although charge and turn are spent.'],
    execute:async d=>{const b=await d.state();checkPrepared(b,'wand',4,5);assert.equal((await d.publicCell(58,14))[1],60);assert.equal((await d.publicCell(58,20))[1],62);assert.equal(at(b).hp,at(b).maxHP);const s=await use(d);spent(b,s,'wand');assert.notEqual(at(s).state,4);assert.equal(at(s).leaderIsPlayer,0);},
  });
  return cases;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.includes('--list')){
    try{console.log(JSON.stringify({plan:boltPlan,unready_fixture_groups:categories.map(([, ,group])=>group).filter(group=>!Number.isSafeInteger(sceneGroups[group])),cases:createBoltCases().map(({execute,...test})=>test)},null,2));}
    catch(error){console.error(error.stack);process.exitCode=1;}
  }else await runFixtureSuite({name:'bolts',createCases:createBoltCases,filter:process.env.BROGUE_BOLTS});
}
