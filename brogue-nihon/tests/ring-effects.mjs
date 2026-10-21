// Known unworn ring fixtures; benefits require actual equip/remove/turn/attack.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
const physical=({ready,...s})=>s;
export function createRingCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const row=inv.definitions[domain].entries.find(x=>x.symbol===symbol);assert.ok(row,symbol);return row.value;};
 const F=n=>V('tileFlags',n),K=n=>V('monsterTypes','MK_'+n),T=n=>V('tileType',n),item=(s,l)=>{const x=s.pack.find(x=>x.letter===l.charCodeAt(0));assert.ok(x,l);return x;};
 const cell=(s,x,y)=>{const c=s.cells.find(c=>c.x===x&&c.y===y);assert.ok(c);return c;};
 const fields={CLAIRVOYANCE:'clairvoyance',STEALTH:'stealth',REGENERATION:'regeneration',TRANSFERENCE:'transference',LIGHT:'lightMultiplier',AWARENESS:'awareness',WISDOM:'wisdom',REAPING:'reaping'};
 const cases=[],pc=new Map();
 async function act(d,key){const before=await d.state();await d.input(key);await d.settle();const a=await d.state();assert.equal(a.turn,before.turn+1);return a;}
 const rest=d=>act(d,'.');
 async function gear(d,key,letter){const b=await d.state();await d.input(key);assert.equal((await d.wait()).kind,'item');assert.ok((await d.wait()).descriptor.slice(4).includes(letter.charCodeAt(0)));await d.input(letter);await d.settle();const a=await d.state();assert.equal(a.turn,b.turn+1);assert.equal(item(a,letter).equipped,key==='e'?1:0);return a;}
 const configs=Object.keys(fields).flatMap(symbol=>['positive','plain'].map(mode=>({symbol,mode,condition:0})));
 for(const symbol of ['AWARENESS','WISDOM'])for(const [mode,condition]of[['stack',1],['negative',2]])configs.push({symbol,mode,condition});
 for(const symbol of ['TRANSFERENCE','REAPING'])configs.push({symbol,mode:'inanimate',condition:3});
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(const {symbol,mode,condition}of configs){
  const kind=V('ringKind','RING_'+symbol),plain=mode==='plain',negative=mode==='negative',stack=mode==='stack',inanimate=mode==='inanimate',key=variant+'-'+mode+'-'+symbol;
  const targets=plain?[]:[{domain:'ringKind',symbol:'RING_'+symbol}];
  if(stack&&symbol==='AWARENESS')targets.push({domain:'tileFlags',symbol:'SEARCHED_FROM_HERE'},{domain:'tileFlags',symbol:'KNOWN_TO_BE_TRAP_FREE'},{domain:'tileType',symbol:'GAS_TRAP_POISON_HIDDEN'},{domain:'tileType',symbol:'GAS_TRAP_POISON'});
  if(inanimate)targets.push({domain:'monsterBehaviorFlags',symbol:'MONST_INANIMATE'});
  cases.push({id:variant+'-'+input_path+'-'+mode+'-'+symbol.toLowerCase(),variant,input_path,fixture_id:S.RING_READY+condition*100+kind,feature_ids:['items.rings_keys_treasure','turn.environment',...(!plain?['cmd.equip','cmd.unequip']:[]),...(plain||['REGENERATION','STEALTH','WISDOM'].includes(symbol)?['cmd.rest']:[]),...(['TRANSFERENCE','REAPING'].includes(symbol)?['combat','cmd.move']:[]),...(['CLAIRVOYANCE','LIGHT'].includes(symbol)?['terrain.levels_visibility']:[]),...(symbol==='AWARENESS'?['cmd.move']:[]),...(symbol==='REAPING'&&!plain&&!inanimate?['cmd.apply']:[])],targets,assertions:[
   'Known individual rings begin unworn; native identities/AI/charge clocks and explicit artificial HP, web, lighting or searched-start conditions are preparation only.',
   'Real public equip/remove, movement, attack and rest must reach actual vision, awareness, regeneration, healing or item recharge. Direct bonus observations alone do not prove all effects.',
   'Each actual variant and PC/touch path is checked; independent controls compare initial states/RNG but do not assume endpoint RNG equality. Negative rings are already uncursed, not a cursed-lock test.'
  ],execute:async(d,{control})=>{
   const start=await d.state(),ring=item(start,'a'),field=fields[symbol];assert.equal(start.variant,({brogue:'brogue',rapid_brogue:'rapidBrogue',bullet_brogue:'bulletBrogue'})[variant]);assert.equal(start.kindCounts.ring,8);assert.equal(ring.kind,kind);assert.equal(ring.identified,1);assert.equal(ring.enchant,negative?-2:2);assert.equal(ring.cursed,0);assert.equal(ring.equipped,0);assert.equal(start.ringLeft,0);assert.equal(start.ringRight,0);assert.equal(start.ringBonuses[field],symbol==='LIGHT'?1:0);
   const value=plain?symbol==='LIGHT'?1:0:symbol==='LIGHT'?3:symbol==='AWARENESS'?(negative?-40:stack?80:40):negative?-2:stack?4:2;
   const equip=async letter=>plain?rest(d):gear(d,'e',letter),remove=async letter=>plain?rest(d):gear(d,'r',letter);
   let after=await equip('a');if(stack)after=await equip('b');assert.equal(after.ringBonuses[field],value);if(!plain)assert.equal(after.ringLeft,97);
   switch(symbol){
    case 'CLAIRVOYANCE':{
     assert.equal(cell(start,42,14).flags&F('DISCOVERED'),0);const p=await d.publicCell(63,17);
     if(plain){assert.equal(cell(after,42,14).flags&F('CLAIRVOYANT_VISIBLE'),0);assert.equal(cell(after,42,14).flags&F('DISCOVERED'),0);}else{assert.ok(cell(after,42,14).flags&F('CLAIRVOYANT_VISIBLE'));assert.ok(cell(after,42,14).flags&F('DISCOVERED'));assert.notEqual(p[1],32);await d.screenshot('clairvoyant-witness');}
     const a=await remove('a');assert.equal(a.ringBonuses.clairvoyance,0);assert.equal(cell(a,42,14).flags&F('CLAIRVOYANT_VISIBLE'),0);assert.equal(!!(cell(a,42,14).flags&F('DISCOVERED')),!plain);break;
    }
    case 'LIGHT':{
     assert.deepEqual(start.lightRadius,{lower:100,upper:100});assert.equal(start.monsters[0].kind,K('KOBOLD'));assert.equal(cell(start,42,14).flags&F('VISIBLE'),0);const visible=cell(after,42,14).flags&F('VISIBLE');assert.equal(!!visible,!plain);assert.deepEqual(after.lightRadius,{lower:plain?100:300,upper:plain?100:300});assert.equal((await d.publicCell(63,17))[1]===107,!plain);await d.screenshot('light-radius');const a=await remove('a');assert.deepEqual(a.lightRadius,{lower:100,upper:100});assert.equal(cell(a,42,14).flags&F('VISIBLE'),0);assert.notEqual((await d.publicCell(63,17))[1],107);break;
    }
    case 'REGENERATION':{
     assert.equal(start.hp,50);assert.equal(start.maxHP,100);assert.equal(start.turnsUntilRegen,1000);assert.equal(start.regenInterval,3020);assert.equal(after.hp,51);assert.equal(after.regenInterval,plain?3020:1707);
     after=await rest(d);assert.equal(after.hp,51);after=await rest(d);assert.equal(after.hp,plain?51:52);d.entry.regeneration_three_turns={hp:after.hp,timer:after.turnsUntilRegen,interval:after.regenInterval};
     if(!plain)await control(async c=>{assert.deepEqual(physical(await c.state()),physical(start));let s;for(let n=0;n<3;n++)s=await rest(c);assert.equal(s.hp,51);assert.equal(s.regenInterval,3020);});
     const a=await remove('a');assert.equal(a.regenInterval,3020);let end=a;for(let n=0;n<4;n++)end=await rest(d);assert.ok(end.hp>a.hp,'Natural regeneration still progresses after removal');break;
    }
    case 'TRANSFERENCE':{
     assert.equal(start.hp,50);assert.ok(start.turnsUntilRegen>10000);assert.equal(start.playerCombat.damageMin,14);assert.equal(start.playerCombat.damageMax,22);assert.equal(start.monsters[0].kind,K(inanimate?'ARROW_TURRET':'OGRE'));assert.equal(!!(start.monsters[0].flags&V('monsterBehaviorFlags','MONST_INANIMATE')),inanimate);
     const b=after,a=await act(d,'l'),damage=b.monsters[0].hp-a.monsters[0].hp;assert.ok(damage>=14&&damage<=22);const heal=plain||inanimate?0:Math.max(1,Math.trunc(damage*2/(variant==='brogue'?20:10)));assert.equal(a.hp-b.hp,heal);d.entry.transference={damage,heal,variant};await d.screenshot('actual-hit-healing');const removed=await remove('a'),hit=await act(d,'l');assert.equal(hit.hp,removed.hp);break;
    }
    case 'STEALTH':{
     assert.equal(start.monsters[0].kind,K('ARROW_TURRET'));assert.equal(start.monsters[0].state,V('creatureStates','MONSTER_TRACKING_SCENT'));assert.equal(start.monsters[0].ticksUntilTurn,101);assert.equal(start.monsters[0].attackSpeed,250);
     for(let n=0;n<3;n++)after=await rest(d);assert.equal(after.stealthRange,plain?4:2);assert.equal(after.monsters[0].state,V('creatureStates',plain?'MONSTER_TRACKING_SCENT':'MONSTER_SLEEPING'));await d.screenshot('actual-awareness');await remove('a');const a=await rest(d);assert.equal(a.monsters[0].state,V('creatureStates','MONSTER_TRACKING_SCENT'));break;
    }
    case 'AWARENESS':{
     assert.ok(start.playerCell.flags&F('SEARCHED_FROM_HERE'));assert.equal(cell(start,42,15).flags&F('KNOWN_TO_BE_TRAP_FREE'),0);assert.equal(cell(start,42,14).dungeon,T('GAS_TRAP_POISON_HIDDEN'));
     after=await act(d,'l');assert.deepEqual([after.x,after.y],[41,14]);assert.equal(!!(after.playerCell.flags&F('SEARCHED_FROM_HERE')),!negative);
     if(stack){assert.equal(cell(after,42,14).dungeon,T('GAS_TRAP_POISON'));assert.ok(cell(after,42,15).flags&F('KNOWN_TO_BE_TRAP_FREE'));}
     else if(negative){assert.equal(cell(after,42,14).dungeon,T('GAS_TRAP_POISON_HIDDEN'));assert.equal(cell(after,42,15).flags&F('KNOWN_TO_BE_TRAP_FREE'),0);}
     else if(!plain){for(const direction of ['j','l','l','k','k','h','h']){if(cell(after,42,14).dungeon===T('GAS_TRAP_POISON'))break;after=await act(d,direction);}assert.equal(cell(after,42,14).dungeon,T('GAS_TRAP_POISON'),'Required auto-search discovery not reached');}
     else assert.equal(cell(after,42,15).flags&F('KNOWN_TO_BE_TRAP_FREE'),0);
     await d.screenshot('automatic-search');if(stack)await remove('b');const a=await remove('a');assert.equal(a.ringBonuses.awareness,0);break;
    }
    case 'WISDOM':{
     assert.equal(item(start,'c').charges,0);assert.equal(item(start,'d').charges,100);const increment=plain?10:negative?5:stack?28:16;
     if(!stack&&mode!=='negative'){assert.equal(item(after,'c').rechargeTimer,31-increment);after=await rest(d);assert.equal(item(after,'c').charges,plain?0:1);assert.equal(item(after,'d').charges,98);}else{
      assert.equal(item(after,'c').rechargeTimer,stack?1000-16-28:1000-5);const b=after;after=await rest(d);assert.equal(item(b,'c').rechargeTimer-item(after,'c').rechargeTimer,increment);assert.equal(item(b,'d').charges-item(after,'d').charges,1);
     }
     await d.screenshot('actual-staff-charging');if(plain)break;if(stack)await remove('b');const a=await remove('a'),b=await rest(d);assert.equal(a.ringBonuses.wisdom,0);assert.equal(item(a,'c').rechargeTimer-item(b,'c').rechargeTimer,10);assert.equal(item(a,'d').charges-item(b,'d').charges,1);break;
    }
    case 'REAPING':{
     assert.equal(item(start,'c').charges,0);assert.equal(item(start,'c').rechargeTimer,1000);assert.equal(item(start,'d').charges,100);assert.equal(item(after,'c').rechargeTimer,990);assert.equal(item(after,'d').charges,99);assert.equal(!!(start.monsters[0].flags&V('monsterBehaviorFlags','MONST_INANIMATE')),inanimate);
     let hits=0;for(;hits<20;hits++){
      const b=after;after=await act(d,'l');const damage=b.monsters[0].hp-after.monsters[0].hp;assert.ok(damage>=14&&damage<=22);if(plain||inanimate){assert.equal(item(b,'c').rechargeTimer-item(after,'c').rechargeTimer,10);assert.equal(item(b,'d').charges-item(after,'d').charges,1);}else if(item(after,'d').charges>0){const n=item(b,'d').charges-item(after,'d').charges-1;assert.ok(n>=0&&n<=damage*2);assert.equal(item(b,'c').rechargeTimer-item(after,'c').rechargeTimer,10*(n+1));}
      if(!plain&&!inanimate&&item(after,'c').charges>0&&item(after,'d').charges===0)break;
     }
     d.entry.reaping_hits=hits<20?hits+1:20;
     if(plain||inanimate){assert.equal(item(after,'c').charges,0);assert.ok(item(after,'d').charges>0);}else{
      assert.ok(hits<20,'Required recharge/ready not reached');assert.equal(item(after,'c').charges,1);assert.equal(item(after,'d').charges,0);const count=hits+1;
      await control(async c=>{assert.deepEqual(physical(await c.state()),physical(start));await rest(c);let s;for(let n=0;n<count;n++)s=await act(c,'l');assert.equal(item(s,'c').charges,0);assert.ok(item(s,'d').charges>0);});
      await d.screenshot('native-recharge-ready');const hp=after.hp;await d.input('a');assert.equal((await d.wait()).kind,'item');await d.input('d');await d.settle();const used=await d.state();assert.ok(used.hp>hp);assert.ok(item(used,'d').charges>0,'Actually ready charm can now be used');
     }
     const a=await remove('a'),b=await act(d,'l');assert.equal(a.ringBonuses.reaping,0);assert.equal(item(a,'c').rechargeTimer-item(b,'c').rechargeTimer,10);break;
    }
   }
   const final=physical(await d.state());d.effect(()=>{assert.equal(final.ringLeft,0);assert.equal(final.ringRight,0);assert.equal(item(final,'a').equipped,0);assert.equal(final.ringBonuses[field],symbol==='LIGHT'?1:0);});if(input_path==='pc-keyboard'){pc.set(key,final);d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key));d.entry.pc_touch_comparison='matched PC counterpart';}else d.entry.pc_touch_comparison='PC counterpart not selected; equivalence not checked';
  }});
 }
 assert.equal(cases.length,44*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'ring-effects',createCases:createRingCases,filter:process.env.BROGUE_RING_EFFECTS});
