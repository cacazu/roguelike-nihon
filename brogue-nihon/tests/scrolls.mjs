// Source-specific effects are asserted independently of fixture preparation.
import assert from 'node:assert/strict';
import {runFixtureSuite,sceneGroups} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
function createScrollCases(){
const inventory=generateDataInventory({gitMetadata:false});validateDataSnapshot(inventory);
const value=(domain,symbol)=>{const row=inventory.definitions[domain].entries.find(row=>row.symbol===symbol);assert.ok(row,symbol);return row.value;};
const kindSymbols=['SCROLL_ENCHANTING','SCROLL_IDENTIFY','SCROLL_TELEPORT','SCROLL_REMOVE_CURSE','SCROLL_RECHARGING','SCROLL_PROTECT_ARMOR','SCROLL_PROTECT_WEAPON','SCROLL_SANCTUARY','SCROLL_MAGIC_MAPPING','SCROLL_NEGATION','SCROLL_SHATTERING','SCROLL_DISCORD','SCROLL_AGGRAVATE_MONSTER','SCROLL_SUMMON_MONSTER'];
assert.deepEqual(inventory.definitions.scrollKind.entries.filter(row=>row.classification==='primitive').map(row=>row.symbol),kindSymbols);
const item=(state,letter)=>{const found=state.pack.find(it=>it.letter===letter.codePointAt(0));assert.ok(found,'Missing pack item '+letter);return found;};
const cursed=it=>!!(it.flags&value('itemFlags','ITEM_CURSED'));
const cell=(state,x,y)=>{const found=[...state.cells,...state.remoteCells].find(c=>c.x===x&&c.y===y);assert.ok(found,'Missing observed cell');return found;};
const status=(state,name)=>state.statuses[value('statusEffects',name)];
const uniqueMonster=(state,symbol)=>{const found=state.monsters.filter(m=>m.kind===value('monsterTypes',symbol));assert.equal(found.length,1,'Fixture must expose exactly one '+symbol);return found[0];};
function initialScroll(state,symbol){const scroll=item(state,'a');assert.equal(scroll.category,value('itemCategory','SCROLL'));assert.equal(scroll.kind,value('scrollKind',symbol));assert.equal(scroll.quantity,2);assert.equal(scroll.kindKnown,0);assert.equal(scroll.magicDetected,0);}
function readCost(before,after){assert.equal(item(after,'a').quantity,1);assert.equal(item(after,'a').kindKnown,1);assert.equal(after.turn,before.turn+1);}

async function read(driver,{escapeTarget=false}={}){
  await driver.apply();
  for(let n=0;n<8&&['acknowledge','anykey'].includes((await driver.wait()).kind);n++)await driver.input('Space');
  if((await driver.wait()).kind==='item'){
    if(escapeTarget){
      await driver.input('Escape');
      for(let n=0;n<8&&['acknowledge','anykey'].includes((await driver.wait()).kind);n++)await driver.input('Space');
      assert.equal((await driver.wait()).kind,'item','Committed identify/enchant cannot be cancelled');
    }
    await driver.input('b');
  }
  await driver.settle();
}

const effects={
  SCROLL_ENCHANTING(before,after){assert.equal(item(after,'b').enchant,item(before,'b').enchant+1);assert.equal(item(after,'b').strengthRequired,Math.max(0,item(before,'b').strengthRequired-1));assert.equal(item(after,'b').timesEnchanted,item(before,'b').timesEnchanted+1);assert.equal(cursed(item(after,'b')),false);assert.equal(item(after,'c').enchant,item(before,'c').enchant);},
  SCROLL_IDENTIFY(before,after){assert.equal(item(before,'b').identified,0);assert.equal(item(after,'b').identified,1);assert.equal(item(after,'b').flags&value('itemFlags','ITEM_CAN_BE_IDENTIFIED'),0);assert.equal(item(after,'c').identified,item(before,'c').identified);},
  SCROLL_TELEPORT(before,after){assert.notDeepEqual([after.x,after.y],[before.x,before.y]);const destination=cell(before,after.x,after.y);assert.equal(destination.flags&value('tileFlags','IN_FIELD_OF_VIEW'),0);assert.equal(status(after,'STATUS_STUCK'),0);},
  SCROLL_REMOVE_CURSE(before,after){for(const letter of ['b','c','d']){assert.equal(cursed(item(before,letter)),true);assert.equal(cursed(item(after,letter)),false);assert.equal(item(after,letter).enchant,item(before,letter).enchant);}assert.ok(before.floor.some(cursed));assert.ok(after.floor.some(cursed),'Floor control must remain cursed');},
  SCROLL_RECHARGING(before,after){for(const [letter,category]of [['b','STAFF'],['c','CHARM'],['d','WAND']])assert.equal(item(before,letter).category,value('itemCategory',category));assert.equal(item(before,'b').charges,0);assert.ok(item(before,'b').enchant>0);assert.equal(item(after,'b').charges,item(after,'b').enchant);assert.ok(item(before,'c').charges>1);assert.equal(item(after,'c').charges,0);assert.equal(item(after,'d').charges,item(before,'d').charges);},
  SCROLL_PROTECT_ARMOR(before,after){assert.equal(before.armor,98);assert.equal(item(before,'b').protected,0);assert.equal(cursed(item(before,'b')),true);assert.equal(item(after,'b').protected,1);assert.equal(cursed(item(after,'b')),false);assert.equal(item(after,'c').protected,0);assert.equal(cursed(item(after,'c')),true);},
  SCROLL_PROTECT_WEAPON(before,after){assert.equal(before.weapon,98);assert.equal(item(before,'b').protected,0);assert.equal(cursed(item(before,'b')),true);assert.equal(item(after,'b').protected,1);assert.equal(cursed(item(after,'b')),false);assert.equal(item(after,'c').protected,0);assert.equal(cursed(item(after,'c')),true);},
  SCROLL_SANCTUARY(before,after){const glyph=value('tileType','SACRED_GLYPH');assert.equal(before.cells.filter(c=>c.surface===glyph).length,0);assert.ok(after.cells.some(c=>c.surface===glyph),'Sacred glyphs must actually form');},
  SCROLL_MAGIC_MAPPING(before,after){assert.ok(after.mapMetrics.mapped>before.mapMetrics.mapped);assert.ok(after.remoteCells.some(c=>c.flags&value('tileFlags','MAGIC_MAPPED')));assert.notEqual(cell(after,41,13).dungeon,value('tileType','SECRET_DOOR'));},
  SCROLL_NEGATION(before,after){assert.ok(status(before,'STATUS_HASTED')>0);assert.equal(status(after,'STATUS_HASTED'),0);for(const [kind,affected]of [['MK_OGRE',true],['MK_RAT',false]]){const previous=uniqueMonster(before,kind),current=uniqueMonster(after,kind);assert.ok(previous.invisible>0&&previous.slowed>0);assert.equal(current.invisible===0,affected);assert.equal(current.slowed===0,affected);}assert.equal(item(after,'b').enchant,item(before,'b').enchant,'Pack item is outside negation blast');for(const [x,y,expected]of [[41,13,false],[22,14,true]]){const previous=before.floor.find(it=>it.x===x&&it.y===y),current=after.floor.find(it=>it.x===x&&it.y===y);assert.ok(previous&&current);assert.equal(cursed(previous),true);assert.equal(cursed(current),expected,'Negation respects the original field of view');}},
  SCROLL_SHATTERING(before,after,trace){assert.equal(cell(before,41,13).dungeon,value('tileType','WALL'));assert.ok(trace.observations.some(observation=>observation.surfaces.some(c=>c.x===41&&c.y===13&&c.dungeon===value('tileType','FORCEFIELD')&&c.surface===value('tileType','RUBBLE'))),'Intermediate published frame must show actual crystal formation');assert.ok([value('tileType','FORCEFIELD'),value('tileType','FLOOR')].includes(cell(after,41,13).dungeon),'Final dungeon layer follows the original promotion path');assert.equal(cell(after,39,13).dungeon,cell(before,39,13).dungeon,'Impregnable wall remains');},
  SCROLL_DISCORD(before,after){const discord=value('statusEffects','STATUS_DISCORDANT');for(const kind of ['MK_OGRE','MK_RAT','MK_ARROW_TURRET']){const previous=uniqueMonster(before,kind),current=uniqueMonster(after,kind);assert.equal(previous.statuses[discord],0);if(kind==='MK_OGRE')assert.ok(current.statuses[discord]>0&&current.statuses[discord]<=30);else assert.equal(current.statuses[discord],0);}},
  SCROLL_AGGRAVATE_MONSTER(before,after){const sleeping=value('creatureStates','MONSTER_SLEEPING');assert.equal(uniqueMonster(before,'MK_GOBLIN').state,sleeping);assert.notEqual(uniqueMonster(after,'MK_GOBLIN').state,sleeping);assert.equal(status(before,'STATUS_AGGRAVATING'),0);assert.ok(status(after,'STATUS_AGGRAVATING')>0);},
  SCROLL_SUMMON_MONSTER(before,after){assert.equal(before.monsters.length,0);assert.ok(after.monsters.length>0,'Summoning must create real entities; minions need not fit a leader-count cap');},
};
// The platform-only readiness flag changes after the first consumed input.
const physical=state=>{const {ready,...observed}=state;return observed;};
const cases=[];
for(const input_path of ['pc-keyboard','touch'])for(const symbol of kindSymbols){
  cases.push({id:input_path+'-'+symbol.toLowerCase(),variant:'brogue',input_path,fixture_id:sceneGroups.SCROLL_UNKNOWN+value('scrollKind',symbol),
    feature_ids:['cmd.apply','items.potions_scrolls','items.knowledge'],targets:[{domain:'scrollKind',symbol}],
    assertions:['Read an unknown scroll through original inventory, acknowledgments and any target selection.','The named effect changes the original observed state; stock falls by one and the remaining kind is identified.','The following original rest consumes one turn.'],
    execute:async(d,{control})=>{const before=await d.state();initialScroll(before,symbol);if(symbol==='SCROLL_AGGRAVATE_MONSTER'||symbol==='SCROLL_SUMMON_MONSTER')await control(async c=>{const controlBefore=await c.state();assert.deepEqual(controlBefore,before,'Control uses identical prepared state');await c.input('.');const quiet=await c.state();assert.equal(quiet.turn,controlBefore.turn+1,'Control advances the same single turn');if(symbol==='SCROLL_AGGRAVATE_MONSTER')assert.equal(uniqueMonster(quiet,'MK_GOBLIN').state,value('creatureStates','MONSTER_SLEEPING'),'Same-time control remains asleep');else assert.equal(quiet.monsters.length,0,'Same-time control must not spawn monsters');});await read(d);const after=await d.state(),trace=await d.trace();d.effect(()=>{effects[symbol](before,after,trace);readCost(before,after);});if(symbol==='SCROLL_SHATTERING'&&(cell(after,41,13).dungeon===value('tileType','FORCEFIELD')||cell(after,41,13).surface===value('tileType','FORCEFIELD_MELT'))){await d.input('u');const blocked=await d.state();assert.deepEqual([blocked.x,blocked.y,blocked.turn],[after.x,after.y,after.turn],'Unmelted crystal still blocks movement');}await d.input('.');assert.equal((await d.state()).turn,after.turn+1);},
  });
}
for(const symbol of ['SCROLL_ENCHANTING','SCROLL_IDENTIFY'])cases.push({id:'pc-'+symbol.toLowerCase()+'-committed-target-escape',variant:'brogue',input_path:'pc-keyboard',fixture_id:sceneGroups.SCROLL_UNKNOWN+value('scrollKind',symbol),feature_ids:['cmd.apply','dialog.ack_confirm'],targets:[],assertions:['Escape after reading does not undo the committed scroll; the original prompt repeats until a valid item is chosen.','Successful selection consumes one scroll and one turn; the next rest also advances once.'],execute:async d=>{const before=await d.state();initialScroll(before,symbol);await read(d,{escapeTarget:true});const after=await d.state();effects[symbol](before,after);readCost(before,after);await d.input('.');assert.equal((await d.state()).turn,after.turn+1);}});
for(const input_path of ['pc-keyboard','touch']){
  cases.push({id:input_path+'-scroll-initial-cancel',variant:'brogue',input_path,fixture_id:sceneGroups.SCROLL_UNKNOWN+value('scrollKind','SCROLL_IDENTIFY'),feature_ids:['cmd.apply'],targets:[],assertions:['Escape in the initial item selector preserves all observed state and the following rest works.'],execute:async d=>{const before=await d.state();initialScroll(before,'SCROLL_IDENTIFY');await d.input('a');assert.equal((await d.wait()).kind,'item');await d.input('Escape');await d.settle();assert.deepEqual(physical(await d.state()),physical(before));await d.input('.');assert.equal((await d.state()).turn,before.turn+1);}});
  for(const symbol of ['SCROLL_AGGRAVATE_MONSTER','SCROLL_SUMMON_MONSTER'])cases.push({id:input_path+'-'+symbol.toLowerCase()+'-known-no',variant:'brogue',input_path,fixture_id:sceneGroups.SCROLL_KNOWN+value('scrollKind',symbol),feature_ids:['cmd.apply','dialog.ack_confirm'],targets:[],assertions:['Rejecting the original known harmful scroll confirmation consumes neither the scroll nor a turn and changes no observed effect state.'],execute:async d=>{const before=await d.state(),known=item(before,'a');assert.equal(known.category,value('itemCategory','SCROLL'));assert.equal(known.kind,value('scrollKind',symbol));assert.equal(known.kindKnown,1);assert.equal(known.magicDetected,0);assert.equal(known.quantity,2);await d.apply();assert.equal((await d.wait()).kind,'confirm');await d.input('n');await d.settle();assert.deepEqual(physical(await d.state()),physical(before));await d.input('.');assert.equal((await d.state()).turn,before.turn+1);}});
}
assert.equal(cases.length,36);
return cases;
}
await runFixtureSuite({name:'scrolls',createCases:createScrollCases,filter:process.env.BROGUE_SCROLLS});
