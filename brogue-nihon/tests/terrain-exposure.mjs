// Native environmental exposure and promotion, through original real input.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {publicText} from './knowledge-feats.mjs';
const physical=({ready,...s})=>s;
async function displayViews(d,label){
 const before=await d.state(),wait=await d.wait(),count=(await d.trace()).native_trace.length;
 for(const mode of ['dot','illustration','original']){
  await d.page.locator('#display-mode').selectOption(mode);
  await d.page.waitForFunction(mode=>document.querySelector('#game').dataset.displayMode===mode,mode);
  assert.deepEqual(await d.state(),before);assert.equal((await d.wait()).serial,wait.serial);assert.equal((await d.trace()).native_trace.length,count);
  await d.record('public display '+mode);await d.screenshot(label+'-'+mode);
 }
}

export function createTerrainExposureCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);const V=(d,n)=>{const r=inv.definitions[d].entries.find(x=>x.symbol===n);assert.ok(r,d+':'+n);return r.value;};
 const T=n=>V('tileType',n),Z=n=>V('statusEffects','STATUS_'+n),F=n=>V('terrainFlagCatalog','T_'+n),I=n=>V('itemFlags','ITEM_'+n),item=s=>s.pack.find(i=>i.letter===97),cell=(s,x,y=14)=>s.cells.find(c=>c.x===x&&c.y===y);
 const rows=[['caustic-gas','POISON_GAS','CAUSES_DAMAGE'],['confusion-gas','CONFUSION_GAS','CAUSES_CONFUSION','CONFUSED'],['paralysis-gas','PARALYSIS_GAS','CAUSES_PARALYSIS','PARALYZED'],['steam','STEAM','CAUSES_DAMAGE'],['lichen','LICHEN','CAUSES_POISON','POISONED'],['healing-cloud','HEALING_CLOUD','CAUSES_HEALING'],['healing-cap','HEALING_CLOUD','CAUSES_HEALING'],['steam-fire-immunity','STEAM','CAUSES_DAMAGE'],['lichen-respiration','LICHEN','CAUSES_POISON','POISONED'],['bloodwort-pod','BLOODFLOWER_POD']];
 const rest=async d=>{await d.input('.');await d.settle();return d.state();},cases=[],pc=new Map();
 for(const variant of variants)for(const input_path of ['pc-keyboard','touch'])for(let kind=0;kind<rows.length;kind++)for(const negative of [false,true]){
  const [name,tile,flag,status]=rows[kind],mode=negative?'control':'positive',key=variant+'-'+mode+'-'+name;
  const targets=negative?[]:[{domain:'tileType',symbol:tile},...(flag?[{domain:'terrainFlagCatalog',symbol:'T_'+flag}]:[]),...(status?[{domain:'statusEffects',symbol:'STATUS_'+status}]:[]),...(kind===9?[{domain:'tileType',symbol:'HEALING_CLOUD'},{domain:'dungeonFeatureTypes',symbol:'DF_BLOODFLOWER_POD_BURST'}]:[])];
  cases.push({id:variant+'-'+input_path+'-'+mode+'-'+name,variant,input_path,fixture_id:S.TERRAIN_EXPOSURE+kind*2+Number(negative),feature_ids:['turn.environment','terrain.tiles',...(kind===9?['terrain.features']:[]),...(kind===9&&!negative?['cmd.move']:[]),...(!negative&&[5,9].includes(kind)?['cmd.graphics']:[]),'cmd.rest',...((negative&&(kind<=3||kind===7))||kind===8?['items.runics']:[])],targets,source_refs:['CE1.15.1 Time.c:applyInstantTileEffectsToCreature/applyGradualTileEffectsToCreature','Globals.c:tileCatalog/dungeonFeatureCatalog','Movement.c:playerMoves'],assertions:[
   'Enemy-free HP100 or injured/capped HP, delayed natural regeneration, zero armor and statuses, prepared gas/lichen/pod are artificial initial conditions; no effect/turn/RNG helper applies them.',
   'Real rest or pod bump must reach actual damage/status/healing/promotion. Respiration blocks toxic gases and identifies on actual exposure; floating blocks lichen while Respiration does not; fire immunity does not stop steam.',
   'Paralysis must appear in intermediate native frames and count down automatically before command resumes. A pod bump promotes without moving, then real healing is observed. Three public display modes for healing/pod keep full observed state/RNG/input unchanged and save actual browser PNGs. Not natural generation/all interactions/real-device coverage.'
  ],execute:async d=>{
   const b=await d.state();assert.equal(b.variant,({brogue:'brogue',rapid_brogue:'rapidBrogue',bullet_brogue:'bulletBrogue'})[variant]);assert.equal(b.maxHP,100);assert.equal(b.hp,kind===5||kind===9?50:kind===6?99:100);assert.equal(b.regenPerTurn,0);assert.ok(b.turnsUntilRegen>10000);assert.equal(b.monsters.length,0);assert.deepEqual([b.x,b.y],[40,14]);assert.equal(b.pack.length,1);assert.equal(item(b).armorRaw,0);assert.equal(item(b).equipped,1);assert.equal(item(b).netEnchant,0);assert.equal(!!(item(b).flags&I('RUNIC_IDENTIFIED')),false);
   const protectedGas=negative&&(kind<=3||kind===7),respiration=protectedGas||kind===8;assert.equal(!!(item(b).flags&I('RUNIC')),respiration);assert.equal(b.statuses[Z('LEVITATING')],negative&&(kind===4||kind===8)?100:0);assert.equal(b.statuses[Z('IMMUNE_TO_FIRE')],kind===7?100:0);for(const n of ['CONFUSED','PARALYZED','POISONED'])assert.equal(b.statuses[Z(n)],0);
   if(kind===4||kind===8){assert.equal(cell(b,40).surface,T('LICHEN'));assert.ok(cell(b,40).terrainFlags&F('CAUSES_POISON'));}
   else if(kind===9){assert.equal(cell(b,41).surface,T('BLOODFLOWER_POD'));assert.equal(cell(b,40).gas,0);}
   else if(!(negative&&(kind===5||kind===6))){const gas=b.cells.filter(c=>c.gas===T(tile));assert.equal(gas.length,9);assert.ok(gas.every(c=>c.volume===(kind===2?8:1000)));assert.ok(cell(b,40).terrainFlags&F(flag));}
   else assert.equal(cell(b,40).gas,0);
   if(input_path==='pc-keyboard')pc.set(key,{initial:physical(b)});else if(pc.has(key))assert.deepEqual(physical(b),pc.get(key).initial,'Initial PC/touch state and RNG');
   if(kind===9&&!negative)await displayViews(d,'pod-before-bump');
   if(kind===9&&!negative){await d.input('l');await d.settle();}else await rest(d);
   let a=await d.state();const trace=await d.trace(),seen=trace.observations,poison=Z('POISONED');d.effect(()=>{
    if(kind===0||kind===3||kind===7){assert.equal(a.hp,protectedGas?100:94);assert.equal(a.statuses[poison],0);assert.equal(a.poisonAmount,0);}
    if(kind===1){assert.equal(a.maxStatuses[Z('CONFUSED')],negative?0:25);assert.equal(a.statuses[Z('CONFUSED')],negative?0:25);assert.equal(a.hp,b.hp);}
    if(kind===2){assert.equal(a.statuses[Z('PARALYZED')],0);assert.equal(a.maxStatuses[Z('PARALYZED')],negative?0:20);assert.equal(seen.some(o=>o.statuses[Z('PARALYZED')]>0),!negative);if(!negative){assert.ok(a.absoluteTurnNumber>b.absoluteTurnNumber+1);assert.ok(new Set(seen.map(o=>o.statuses[Z('PARALYZED')])).size>3);}else assert.equal(a.absoluteTurnNumber,b.absoluteTurnNumber+1);}
    if(kind===4||kind===8){assert.equal(a.statuses[poison],negative?0:5);assert.equal(a.poisonAmount,negative?0:1);}
    if(kind===5||kind===6)assert.equal(a.hp,negative?b.hp:Math.min(b.hp+6,100));
    if(kind===9){assert.deepEqual([a.x,a.y],[40,14]);assert.equal(a.turn,b.turn+1);assert.equal(cell(a,41).surface,negative?T('BLOODFLOWER_POD'):0);assert.equal(seen.some(o=>o.gases.some(c=>c.gas===T('HEALING_CLOUD')&&c.volume>0)),!negative);assert.equal(a.hp,b.hp);}
    if(protectedGas)assert.ok(item(a).flags&I('RUNIC_IDENTIFIED'),'Actual harmful-gas immunity must identify the unknown runic');
   });
   if(!negative&&kind===1)assert.match(await publicText(d),/confused/i);if(!negative&&kind===9)assert.match(await publicText(d),/seed pod bursts/i);if(protectedGas)assert.match(await publicText(d),/clean air|respiration/i);
   if(kind===4||kind===8){const hp=a.hp;a=await rest(d);assert.equal(a.hp,negative?hp:hp-1);assert.equal(a.statuses[poison],negative?0:5);if(kind===8)assert.equal(!!(item(a).flags&I('RUNIC_IDENTIFIED')),false,'Respiration is not a lichen immunity');}
   if(kind===9){a=await rest(d);assert.equal(a.hp,negative?50:56);if(!negative)assert.match(await publicText(d),/feel much better/i);}
   assert.equal(a.ended,0);assert.equal(a.depth,b.depth);if(kind===5&&!negative)await displayViews(d,'healing-cloud');await d.screenshot('native-terrain-effect');const final=physical(await d.state());if(input_path==='pc-keyboard'){pc.get(key).final=final;d.entry.pc_touch_comparison='PC reference recorded';}else if(pc.has(key)){assert.deepEqual(final,pc.get(key).final);d.entry.pc_touch_comparison='matched PC initial/final state and RNG';}else d.entry.pc_touch_comparison='PC counterpart not selected; equivalence not checked';
  }});
 }
 assert.equal(cases.length,40*variants.length);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'terrain-exposure',createCases:createTerrainExposureCases,filter:process.env.BROGUE_TERRAIN_EXPOSURE});
