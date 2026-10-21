import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {buildReport,parseFeatureContract,renderMarkdown} from './report-features.mjs';

const contract='| cmd.apply | apply item | Items.c:apply | Every eligible item effect, rejection and cancellation |\n| cmd.move | move | Movement.c:playerMoves | All movement and collision branches |';
const inventory={definitions:{potionKind:{source:{file:'src/brogue/Rogue.h',symbol:'potionKind'},entries:[
  {symbol:'POTION_LIFE',classification:'primitive'},{symbol:'POTION_STRENGTH',classification:'primitive'},{symbol:'NUMBER_POTION_KINDS',classification:'count-boundary'}
]}}};
const artifacts=Object.fromEntries(['game-check.js','game-check.wasm','browser-ui.js','browser-ui.wasm'].map((file,index)=>[file,String(index).repeat(64)]));
const build={artifacts,manifests:{production:{valid:true,sha256:'a'.repeat(64)},check:{valid:true,sha256:'b'.repeat(64)}}};
const makeCase=(changes={})=>({id:'life-effect',feature_ids:['cmd.apply'],method:'fixture_browser',fixture:true,status:'pass',variant:'brogue',input_path:'pc-keyboard',coverage:'partial',
  assertions:['Potion consumption increased maximum HP and reduced its quantity after real input'],evidence:['life/steps.json'],targets:[{domain:'potionKind',symbol:'POTION_LIFE',effect_asserted:true}],...changes});
const document=(cases,changes={})=>({file:'results.json',sha256:'f'.repeat(64),data:{run_id:'run-1',result:'pass',artifacts,cases,...changes}});
const report=evidence=>buildReport({inventory,contract,evidence,build});

test('absence and vague success labels leave every source row not_run',()=>{
  const result=report([document([],{checks:['All potions work']})]);
  assert.equal(result.features.length,2);assert.equal(result.definitions.length,3);
  assert.ok(result.features.every(row=>row.overall.status==='not_run'));
  assert.ok(result.definitions.every(row=>row.overall.status==='not_run'));
  assert.equal(result.unmapped.length,1);
});

test('one asserted fixture effect is partial and cannot certify other kinds or normal play',()=>{
  const result=report([document([makeCase()])]);
  assert.equal(result.features[0].automated.status,'partial');
  assert.equal(result.features[0].normal_play.status,'not_run');
  assert.equal(result.definitions[0].overall.status,'partial');
  assert.equal(result.definitions[1].overall.status,'not_run');
  assert.equal(result.definitions[2].overall.status,'not_run');
  assert.equal(result.domains[0].status,'partial');
  assert.equal(result.domains[0].counts.not_run,2);
});

test('fixture initialization is not effect execution',()=>{
  const result=report([document([makeCase({feature_ids:[],targets:[{domain:'potionKind',symbol:'POTION_LIFE',effect_asserted:false}]})])]);
  assert.ok(result.definitions.every(row=>row.overall.status==='not_run'));
});

test('only complete current assertions in all variant/input scopes produce pass',()=>{
  const cases=[];
  for(const variant of ['brogue','rapid_brogue','bullet_brogue'])for(const input_path of ['pc-keyboard','touch'])cases.push(makeCase({id:`${variant}-${input_path}`,variant,input_path,coverage:'complete'}));
  const full=report([document(cases)]);
  assert.equal(full.features[0].overall.status,'pass');
  assert.equal(full.definitions[0].overall.status,'pass');
  assert.equal(full.domains[0].status,'partial');
  assert.equal(report([document(cases.slice(1))]).features[0].overall.status,'partial');
});

test('PC and touch columns certify their own scopes without requiring the other path',()=>{
  const cases=['brogue','rapid_brogue','bullet_brogue'].map(variant=>makeCase({id:variant,variant,coverage:'complete'}));
  const row=report([document(cases)]).features[0];
  assert.equal(row.pc.status,'pass');
  assert.equal(row.touch.status,'not_run');
  assert.equal(row.overall.status,'partial');
  const controls=report([document(cases.map(entry=>({...entry,input_path:'pc-controls'})))]).features[0];
  assert.equal(controls.pc.status,'partial');
  assert.equal(controls.overall.status,'partial');
});

test('unmapped suite failure keeps successful cases partial instead of certifying completeness',()=>{
  const cases=[];
  for(const variant of ['brogue','rapid_brogue','bullet_brogue'])for(const input_path of ['pc-keyboard','touch'])cases.push(makeCase({id:`${variant}-${input_path}`,variant,input_path,coverage:'complete'}));
  const row=report([document(cases,{result:'fail',errors:['Fatal error outside an individual case']})]).features[0];
  assert.equal(row.overall.status,'partial');
  assert.equal(row.overall.executed_cases,6);
});

test('current failure is retained while failures on a different build remain historical',()=>{
  const result=report([document([makeCase(),makeCase({id:'current-failure',status:'fail',assertions:['Expected maximum HP increase was absent']})]),
    {...document([makeCase({status:'fail'})],{run_id:'old-run',artifacts:{...artifacts,'game-check.wasm':'e'.repeat(64)}}),file:'old-results.json'}]);
  assert.equal(result.features[0].overall.status,'fail');
  assert.equal(result.features[0].overall.historical_cases,1);
  assert.equal(result.cases.length,3);
});

test('missing hashes and stale source manifests cannot certify the current version',()=>{
  assert.equal(report([document([makeCase()],{artifacts:{}})]).features[0].overall.status,'not_run');
  const stale=buildReport({inventory,contract,evidence:[document([makeCase()])],build:{...build,manifests:{...build.manifests,production:{valid:false}}}});
  assert.equal(stale.features[0].overall.status,'not_run');
  assert.equal(stale.summary.historical_cases,1);
});

test('unknown IDs/methods, duplicate case IDs and empty assertions are rejected',()=>{
  const result=report([document([makeCase({id:'valid'}),makeCase(),makeCase(),makeCase({id:'bad-id',feature_ids:['cmd.imaginary']}),makeCase({id:'bad-method',method:'wishful_thinking'}),makeCase({id:'no-assertion',assertions:[]})])]);
  assert.equal(result.cases.length,1);
  assert.equal(result.validation_errors.length,5);
});

test('additional domain contracts cannot pass while an individual kind remains untested',()=>{
  const domainContract=contract+'\n| items.potions_scrolls | potionKind/scrollKind | all kinds must retain their effects |';
  const cases=[];
  for(const variant of ['brogue','rapid_brogue','bullet_brogue'])for(const input_path of ['pc-keyboard','touch'])cases.push(makeCase({id:`${variant}-${input_path}`,feature_ids:['items.potions_scrolls'],variant,input_path,coverage:'complete'}));
  const result=buildReport({inventory,contract:domainContract,evidence:[document(cases)],build});
  assert.equal(result.features.length,3);
  assert.equal(result.features[2].overall.status,'partial');
  assert.deepEqual(result.features[2].unconfirmed_definitions,['potionKind:POTION_STRENGTH']);
});

test('explicit primitive effects contribute partial group evidence without certifying all kinds',()=>{
  const domainContract=contract+'\n| items.potions_scrolls | potionKind/scrollKind | all kinds must retain their effects |';
  const result=buildReport({inventory,contract:domainContract,evidence:[document([makeCase()])],build});
  assert.equal(result.features[2].overall.status,'partial');
  assert.equal(result.features[2].definition_case_refs.length,1);
  assert.equal(result.definitions[1].overall.status,'not_run');
  const complete=[];
  for(const variant of ['brogue','rapid_brogue','bullet_brogue'])for(const input_path of ['pc-keyboard','touch'])complete.push(makeCase({id:`${variant}-${input_path}`,variant,input_path,coverage:'complete'}));
  const scopes=buildReport({inventory,contract:domainContract,evidence:[document(complete)],build});
  assert.equal(scopes.features[2].overall.status,'partial');
  const direct=buildReport({inventory,contract:domainContract,evidence:[document([makeCase({feature_ids:['cmd.apply','items.potions_scrolls']})])],build});
  assert.equal(direct.features[2].overall.executed_cases,1);
  assert.equal(direct.features[2].definition_case_refs.length,0);
});

test('derived group evidence preserves failure and history and excludes fixture placement and boundaries',()=>{
  const domainContract=contract+'\n| items.potions_scrolls | potionKind/scrollKind | all kinds must retain their effects |';
  const aggregate=entry=>buildReport({inventory,contract:domainContract,evidence:[document([entry])],build});
  assert.equal(aggregate(makeCase({status:'fail'})).features[2].overall.status,'fail');
  assert.equal(aggregate(makeCase({targets:[{domain:'potionKind',symbol:'POTION_LIFE',effect_asserted:false}]})).features[2].overall.status,'not_run');
  assert.equal(aggregate(makeCase({targets:[{domain:'potionKind',symbol:'NUMBER_POTION_KINDS',effect_asserted:true}]})).features[2].overall.status,'not_run');
  const historical=buildReport({inventory,contract:domainContract,evidence:[document([makeCase()],{artifacts:{...artifacts,'game-check.wasm':'e'.repeat(64)}})],build});
  assert.equal(historical.features[2].overall.status,'not_run');
  assert.equal(historical.features[2].overall.historical_cases,1);
});

test('an unrelated category effect cannot certify ring or knowledge operations',()=>{
  const itemInventory={definitions:{itemCategory:{source:{file:'Rogue.h'},entries:[{symbol:'FOOD',classification:'primitive'},{symbol:'RING',classification:'primitive'}]},weaponKind:{entries:[{symbol:'DART',classification:'primitive'}]},tileType:{entries:[{symbol:'WALL',classification:'primitive'}]}}};
  const itemContract=contract+'\n| items.rings_keys_treasure | rings, keys and treasure | preserve the applicable effects |\n| items.knowledge | identification | preserve hidden identity |\n| combat | combat | preserve damage |\n| turn.environment | environment | preserve timed effects |\n| items.food_weapon_armor | food, weapon and armor | preserve the applicable effects |';
  const target=(domain,symbol)=>buildReport({inventory:itemInventory,contract:itemContract,evidence:[document([makeCase({targets:[{domain,symbol,effect_asserted:true}]})])],build});
  const category=symbol=>target('itemCategory',symbol);
  assert.equal(category('FOOD').features[2].overall.status,'not_run');
  assert.equal(category('RING').features[2].overall.status,'partial');
  assert.equal(category('RING').features[3].overall.status,'not_run');
  assert.equal(target('weaponKind','DART').features[4].overall.status,'not_run');
  assert.equal(target('tileType','WALL').features[5].overall.status,'not_run');
  assert.equal(category('FOOD').features[6].overall.status,'partial');
});

test('source contract mismatch is an error and Markdown contains all untouched symbols',()=>{
  assert.throws(()=>buildReport({inventory:{...inventory,feature_acceptance:[{id:'cmd.apply'}]},contract,evidence:[],build}),/differ/);
  assert.throws(()=>parseFeatureContract(contract+'\n'+contract),/duplicate/);
  const markdown=renderMarkdown(report([]));
  for(const symbol of inventory.definitions.potionKind.entries.map(row=>row.symbol))assert.ok(markdown.includes(symbol));
  assert.ok(markdown.includes('not_run'));
});

test('Wizard mode stays explicit and cannot be classified as normal play',()=>{
  const wizard=report([document([makeCase({method:'automated_browser',fixture:false,mode:'wizard',seed:42})])]);
  assert.equal(wizard.cases[0].mode,'wizard');assert.equal(wizard.cases[0].seed,42);
  assert.equal(wizard.features[0].normal_play.status,'not_run');
  const wrong=report([document([makeCase({method:'normal_play',fixture:false,mode:'wizard'})])]);
  assert.equal(wrong.cases.length,0);assert.match(wrong.validation_errors[0],/normal game mode/);
});

test('the current document contributes all 74 operation and 19 additional contract IDs',async()=>{
  const source=await readFile(new URL('../docs/FEATURES-ja.md',import.meta.url),'utf8');
  const rows=parseFeatureContract(source);
  const tableIds=[...source.matchAll(/^\| ([a-z][\w.-]+) \|/gm)].map(match=>match[1]);
  assert.deepEqual(rows.map(row=>row.id),tableIds);
  assert.equal(rows.filter(row=>row.category==='operation').length,74);
  assert.equal(rows.filter(row=>row.category==='additional_contract').length,19);
});
