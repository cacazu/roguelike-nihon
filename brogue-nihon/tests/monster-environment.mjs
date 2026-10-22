// Native monster defense, AI, movement and terrain through real PC/touch inputs.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...s})=>s;
async function aim(d,x,y=14){
 const b=await d.wait(),start=await d.state(),traceStart=(await d.trace()).native_trace.length;assert.equal(b.kind,'target');
 const box=await d.page.locator('#game').boundingBox();assert.ok(box);const point={x:box.x+(x+21+.5)*box.width/100,y:box.y+(y+3+.5)*box.height/34};
 assert.equal(await d.page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id==='game',point),true);await d.screenshot('aiming');
 if(d.entry.input_path==='touch')await d.page.touchscreen.tap(point.x,point.y);else await d.page.mouse.click(point.x,point.y);
 await d.page.waitForFunction(({serial,traceStart,x,y})=>__brogueFixture.waiting&&__brogueFixture.serial>serial&&__brogueFixture.native_trace.slice(traceStart).some(r=>r.event[0]===1&&r.event[1]===x+21&&r.event[2]===y+3),{serial:b.serial,traceStart,x,y},{timeout:60000});
 await d.record('public map aim '+x+','+y);
 if((await d.wait()).kind==='target'){
  assert.equal(d.entry.input_path,'touch');const a=await d.state();assert.deepEqual(a.cursor,{x,y});
  const norm=s=>{const a=structuredClone(physical(s));a.cursor={x:0,y:0};return a;};assert.deepEqual(norm(a),norm(start),'Finger selection must not spend charge, turn or RNG');
  await d.input('Enter');
 }
 assert.notEqual((await d.wait()).kind,'target');await d.settle();return d.state();
}
export function createMonsterEnvironmentCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const r=inv.definitions[domain].entries.find(x=>x.symbol===symbol);assert.ok(r,domain+':'+symbol);return r.value;};
 const K=n=>V('monsterTypes','MK_'+n),Z=n=>V('statusEffects','STATUS_'+n),B=n=>V('monsterBookkeepingFlags','MB_'+n),T=n=>V('tileType',n),F=n=>V('monsterBehaviorFlags','MONST_'+n),TF=n=>V('terrainFlagCatalog',n),C=n=>V('creatureStates','MONSTER_'+n);
 const cell=(s,x,y=14)=>s.cells.find(c=>c.x===x&&c.y===y),actor=s=>{assert.equal(s.monsters.length,1);return s.monsters[0];},primary=s=>s.pack.find(i=>i.letter===97),distance=(m,s)=>Math.max(Math.abs(m.x-s.x),Math.abs(m.y-s.y));
 const rest=async d=>{await d.input('.');await d.settle();return d.state();},use=async(d,x)=>{await d.apply();return aim(d,x);};
 const rows=[['revenant-weapons','REVENANT','IMMUNE_TO_WEAPONS'],['warden-invulnerable','WARDEN_OF_YENDOR','INVULNERABLE'],['troll-regen','TROLL'],['wraith-flee','WRAITH','FLEES_NEAR_DEATH'],['spider-web','SPIDER','IMMUNE_TO_WEBS'],['fury-flight','FURY','FLIES'],['eel-liquid','EEL','RESTRICTED_TO_LIQUID'],['naga-submerge','NAGA','SUBMERGES'],['wood-burn'],['water-extinguish']];
 const cases=[],pc=new Map();
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(let kind=0;kind<rows.length;kind++)for(const negative of [false,true]){
  const [name,native,trait]=rows[kind],mode=negative?'control':'positive',key=variant+'-'+mode+'-'+name;
  const targets=negative?[]:[...(native?[{domain:'monsterTypes',symbol:'MK_'+native}]:[]),...(trait?[{domain:'monsterBehaviorFlags',symbol:'MONST_'+trait}]:[]),...(kind===7?[{domain:'monsterBookkeepingFlags',symbol:'MB_SUBMERGED'}]:[]),...(kind===8?[{domain:'tileType',symbol:'WOODEN_BARRICADE'}]:[]),...(kind===9?[{domain:'tileType',symbol:'SHALLOW_WATER'},{domain:'terrainMechanicalFlagCatalog',symbol:'TM_EXTINGUISHES_FIRE'}]:[])];
  cases.push({id:variant+'-'+input_path+'-'+mode+'-'+name,variant,input_path,fixture_id:S.MONSTER_ENVIRONMENT+kind*2+Number(negative),feature_ids:[...(native?['ai.monsters','ai.flags_bolts']:[]),'turn.environment',...([0,1,8].includes(kind)?['cmd.apply','target.select','items.staff_wand_charm']:[]),...([0,3,6].includes(kind)?['combat']:[]),...([0,3,8,9].includes(kind)?['cmd.move']:['cmd.rest']),...(kind===3?['cmd.rest']:[]),...([8,9].includes(kind)?['terrain.tiles']:[])],targets,source_refs:['CE1.15.1 Combat.c:attack/inflictDamage','Monsters.c:decrementMonsterStatus/monsterCanSubmergeNow/updateMonsterState/monstersTurn','Time.c:applyInstantTileEffectsToCreature','Items.c:updateBolt'],assertions:[
   'Native monster info, HP caps, traits, movement/attack speed and AI remain intact; player HP100, positions, clocks, known gear, status preconditions and walls are artificial preparation.',
   'Actual hits, lightning/fire, rests and movement must reach defensive immunity, regeneration/poison gate, fleeing, web immunity, flight, liquid restriction, submersion, burn/pass or water extinguishing. Flag presence/charge use alone is insufficient.',
   'Named positive/control initial differences are checked, not claimed fully state-equivalent for different native species. PC/touch final full observed state/RNG is compared per variant. Natural generation, all interactions and real devices remain unverified.'
  ],execute:async d=>{
   const b=await d.state();assert.equal(b.variant,({brogue:'brogue',rapid_brogue:'rapidBrogue',bullet_brogue:'bulletBrogue'})[variant]);assert.equal(b.hp,100);assert.equal(b.maxHP,100);assert.equal(b.regenPerTurn,0);assert.deepEqual([b.x,b.y],[40,14]);
   let m;if(kind<8){m=actor(b);const species=negative&&kind<=1?'OGRE':negative&&[4,5].includes(kind)?'KOBOLD':native;assert.equal(m.kind,K(species));if(!negative&&trait)assert.ok(m.flags&F(trait));assert.ok(m.hp>0);}
   let a;
   if(kind===0){
    assert.equal(b.weapon,98);assert.equal(b.pack.find(i=>i.letter===98).enchant,0);assert.ok(m.statuses[Z('STUCK')]>0);await d.input('l');await d.settle();const hit=await d.state(),target=actor(hit),damage=m.hp-target.hp;assert.equal(hit.turn,b.turn+1);
    d.entry.weapon_damage=damage;assert.ok(negative?damage>=6&&damage<=9:damage===0);if(!negative)assert.match(await publicText(d),/do no damage/i);
    a=await use(d,41);assert.equal(primary(a).charges,primary(b).charges-1);assert.equal(a.turn,hit.turn+1);const z=target.hp-actor(a).hp;d.effect(()=>assert.ok(z>=3&&z<=9,'Native weapon immunity must still allow actual lightning damage'));d.entry.lightning_damage=z;
   }else if(kind===1){
    a=await use(d,41);assert.equal(primary(a).charges,1);assert.equal(a.turn,b.turn+1);const damage=m.hp-actor(a).hp;d.effect(()=>assert.ok(negative?damage>=3&&damage<=9:damage===0));if(!negative)assert.match(await publicText(d),/ignores|unharmed|unaffected/i);d.entry.lightning_damage=damage;
   }else if(kind===2){
    assert.equal(m.maxHP,65);assert.equal(m.hp,55);assert.equal(m.turnsUntilRegen,1000);assert.equal(m.regenPerTurn,0);assert.equal(m.poisonAmount,negative?1:0);assert.equal(m.statuses[Z('POISONED')],negative?3:0);
    a=await rest(d);d.effect(()=>{assert.equal(actor(a).hp,negative?54:56);assert.equal(actor(a).maxHP,65);assert.equal(actor(a).statuses[Z('POISONED')],negative?2:0);});
   }else if(kind===3){
    assert.equal(m.maxHP,50);assert.equal(m.hp,negative?50:30);assert.equal(m.state,C('SLEEPING'));await d.input('l');await d.settle();a=await d.state();const now=actor(a),damage=m.hp-now.hp;assert.ok(damage>=18&&damage<=27);d.entry.sneak_damage=damage;
    d.effect(()=>{assert.equal(now.maxHP,50);if(!negative){assert.ok(now.hp>0&&now.hp<=12);}else assert.ok(now.hp>12);});
    if(!negative){const oldDistance=distance(now,a);a=await rest(d);assert.equal(actor(a).state,C('FLEEING'));assert.ok(distance(actor(a),a)>oldDistance,'A real followup AI turn must increase fleeing distance');d.entry.flee_distance=[oldDistance,distance(actor(a),a)];}else{a=await rest(d);assert.notEqual(actor(a).state,C('FLEEING'));}
   }else if(kind===4){
    assert.equal(m.statuses[Z('STUCK')],0);assert.equal(cell(b,43).surface,T('SPIDERWEB'));a=await rest(d);const stuck=actor(a).statuses[Z('STUCK')];d.effect(()=>assert.ok(negative?stuck>=3&&stuck<=7:stuck===0));d.entry.stuck=stuck;
   }else if(kind===5){
    assert.equal(cell(b,42).liquid,T('CHASM'));assert.equal(m.x,43);assert.equal(m.ticksUntilTurn,1);a=await rest(d);const now=actor(a);d.effect(()=>{assert.equal(now.hp,m.hp);assert.equal(a.depth,b.depth);if(negative)assert.ok(now.x>=43);else{assert.ok(now.x<=42);assert.ok(now.statuses[Z('LEVITATING')]>0);assert.ok(distance(now,a)<distance(m,b));}});d.entry.after_position=[now.x,now.y];
   }else if(kind===6){
    assert.equal(cell(b,41).liquid,T('SHALLOW_WATER'));assert.equal(cell(b,40).liquid,negative?0:T('SHALLOW_WATER'));assert.ok(m.statuses[Z('STUCK')]>0);let waits=0;do{a=await rest(d);waits++;assert.deepEqual([actor(a).x,actor(a).y],[41,14]);if(!negative&&a.hp<b.hp)break;}while(waits<20);const damage=b.hp-a.hp;d.effect(()=>assert.ok(negative?damage===0:damage>=3&&damage<=7,'Native flitting and hit rolls may defer contact; actual water damage is required by 20 turns'));d.entry.damage=damage;d.entry.attack_waits=waits;
   }else if(kind===7){
    assert.equal(m.bookkeepingFlags&B('SUBMERGED'),0);assert.equal(cell(b,43).liquid,negative?0:T('SHALLOW_WATER'));const glyph=(await d.publicCell(64,17))[1];let turns=0;
    do{a=await rest(d);turns++;if(!negative&&(actor(a).bookkeepingFlags&B('SUBMERGED')))break;}while(turns<30);
    d.effect(()=>{const now=actor(a);assert.equal(!!(now.bookkeepingFlags&B('SUBMERGED')),!negative);assert.deepEqual([now.x,now.y],[43,14]);assert.ok(now.hp>0);});const afterGlyph=(await d.publicCell(64,17))[1];assert.ok(negative?afterGlyph===glyph:afterGlyph!==glyph);d.entry.submerge_turns=turns;d.entry.public_glyphs=[glyph,afterGlyph];
   }else if(kind===8){
    assert.equal(cell(b,41).dungeon,T(negative?'WALL':'WOODEN_BARRICADE'));assert.equal(!!(cell(b,41).terrainFlags&TF('T_IS_FLAMMABLE')),!negative);a=await use(d,41);assert.equal(primary(a).charges,1);assert.equal(a.turn,b.turn+1);let extra=0;
    while(!negative&&(cell(a,41).terrainFlags&TF('T_OBSTRUCTS_PASSABILITY'))&&extra++<10)a=await rest(d);
    d.effect(()=>{assert.equal(!!(cell(a,41).terrainFlags&TF('T_OBSTRUCTS_PASSABILITY')),negative);if(!negative)assert.notEqual(cell(a,41).dungeon,cell(b,41).dungeon);else assert.equal(cell(a,41).dungeon,T('WALL'));});await d.input('l');await d.settle();a=await d.state();assert.deepEqual([a.x,a.y],[negative?40:41,14]);d.entry.burn_waits=extra;
   }else{
    assert.equal(b.statuses[Z('BURNING')],7);assert.equal(b.statuses[Z('LEVITATING')],negative?100:0);assert.equal(cell(b,41).liquid,T('SHALLOW_WATER'));assert.ok(cell(b,41).mechFlags&V('terrainMechanicalFlagCatalog','TM_EXTINGUISHES_FIRE'));await d.input('l');await d.settle();a=await d.state();d.effect(()=>{assert.deepEqual([a.x,a.y],[41,14]);assert.ok(negative?a.statuses[Z('BURNING')]>0:a.statuses[Z('BURNING')]===0);});if(!negative)assert.match(await publicText(d),/no longer on fire/i);
   }
   assert.equal(a.ended,0);assert.equal(a.depth,b.depth);await d.screenshot('native-environment-effect');const final=physical(await d.state());if(input_path==='pc-keyboard'){pc.set(key,final);d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key));d.entry.pc_touch_comparison='matched PC counterpart';}else d.entry.pc_touch_comparison='PC counterpart not selected; equivalence not checked';
  }});
 }
 assert.equal(cases.length,40*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'monster-environment',createCases:createMonsterEnvironmentCases,filter:process.env.BROGUE_MONSTER_ENVIRONMENT});
