// Derive coverage from explicit, versioned assertions; labels are never coverage.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const gameRoot=fileURLToPath(new URL('../',import.meta.url));
const repository=path.dirname(gameRoot.slice(0,-1));
const methods=new Set(['normal_play','automated_browser','fixture_browser','native_comparison','unit','real_device']);
const statuses=new Set(['pass','fail','unreached','not_run','not_applicable']);
const variants=['brogue','rapid_brogue','bullet_brogue'];
const inputPaths=['pc-keyboard','touch'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const relative=filename=>path.relative(repository,filename).replaceAll('\\','/');
const featurePattern=/^\| ([a-z][\w.-]+) \|/;
const operationPattern=/^(?:cmd|cursor|target|item|menu|text|dialog|replay|save|history|ending|mode|variant)\./;
// These are source-contract prerequisites, never inferred executed coverage.
const domainRequirements={
  'items.food_weapon_armor':['foodKind','weaponKind','armorKind'],
  'items.potions_scrolls':['potionKind','scrollKind'],
  'items.staff_wand_charm':['staffKind','wandKind','charmKind'],
  'items.rings_keys_treasure':['ringKind','keyKind','itemCategory'],
  'items.runics':['weaponEnchants','armorEnchants'],
  'items.knowledge':['itemCategory','itemFlags'],
  'terrain.tiles':['tileType','terrainFlagCatalog','terrainMechanicalFlagCatalog'],
  'terrain.features':['dungeonFeatureTypes','DFFlags'],
  'terrain.machines':['machineTypes','blueprintFlags','machineFeatureFlags'],
  'terrain.levels_visibility':['dungeonProfileTypes','dungeonLayers','tileFlags'],
  statuses:['statusEffects'],
  'ai.monsters':['monsterTypes','creatureStates','creatureModes'],
  'ai.flags_bolts':['monsterBehaviorFlags','monsterAbilityFlags','boltType','boltEffects','boltFlags'],
  'ai.groups_mutations':['hordeFlags','monsterBookkeepingFlags'],
  combat:['weaponKind','armorKind','weaponEnchants','armorEnchants'],
  'turn.environment':['tileType','dungeonFeatureTypes','statusEffects'],
  feats:['featTypes']
};
// Partial effect evidence has a narrower meaning than whole-contract prerequisites.
const derivedDomains={
  'items.food_weapon_armor':['foodKind','weaponKind','armorKind','itemCategory'],
  'items.potions_scrolls':['potionKind','scrollKind'],
  'items.staff_wand_charm':['staffKind','wandKind','charmKind'],
  'items.rings_keys_treasure':['ringKind','keyKind','itemCategory'],
  'items.runics':['weaponEnchants','armorEnchants'],
  'terrain.tiles':['tileType','terrainFlagCatalog','terrainMechanicalFlagCatalog'],
  'terrain.features':['dungeonFeatureTypes','DFFlags'],
  'terrain.machines':['machineTypes','blueprintFlags','machineFeatureFlags'],
  statuses:['statusEffects'],
  'ai.monsters':['monsterTypes','creatureStates','creatureModes'],
  'ai.flags_bolts':['monsterBehaviorFlags','monsterAbilityFlags','boltType','boltEffects','boltFlags'],
  'ai.groups_mutations':['hordeFlags','monsterBookkeepingFlags'],
  feats:['featTypes']
};
const derivedCategories={
  'items.food_weapon_armor':['FOOD','WEAPON','ARMOR'],
  'items.rings_keys_treasure':['RING','KEY','AMULET','GEM','GOLD']
};
function canDerive(featureId,target){
  return (derivedDomains[featureId]||[]).includes(target.domain)&&(target.domain!=='itemCategory'||derivedCategories[featureId]?.includes(target.symbol));
}
function relevantDefinition(featureId,definition){
  if(!(domainRequirements[featureId]||[]).includes(definition.domain))return false;
  return featureId!=='items.rings_keys_treasure'||definition.domain!=='itemCategory'||['RING','KEY','AMULET','GEM','GOLD'].includes(definition.symbol);
}

export function parseFeatureContract(markdown){
  const rows=[];
  for(const [index,line] of markdown.split(/\r?\n/).entries()){
    if(!featurePattern.test(line))continue;
    const columns=line.split(/(?<!\\)\|/).slice(1,-1).map(value=>value.trim());
    rows.push({id:columns[0],category:operationPattern.test(columns[0])?'operation':'additional_contract',operation:columns[1],source_and_followup:columns.length===4?columns[2]:null,expected:columns.at(-1),line:index+1});
  }
  if(!rows.length||new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('Feature contract is empty or contains duplicate IDs');
  return rows;
}

function summarize(records,requiredVariants=variants,requiredInputs=inputPaths){
  const current=records.filter(record=>record.provenance_status==='current');
  const executed=current.filter(record=>record.status==='pass'||record.status==='fail');
  let status='not_run';
  if(current.some(record=>record.status==='fail'))status='fail';
  else if(current.some(record=>record.status==='pass')){
    const complete=requiredVariants.every(variant=>requiredInputs.every(input=>current.some(record=>
      record.status==='pass'&&record.suite_status==='pass'&&record.coverage==='complete'&&record.variant===variant&&record.input_path===input&&
      record.method!=='unit'&&record.method!=='native_comparison')));
    status=complete?'pass':'partial';
  }else if(current.some(record=>record.status==='unreached'))status='unreached';
  else if(current.length&&current.every(record=>record.status==='not_applicable'))status='not_applicable';
  return {status,executed_cases:executed.length,current_cases:current.length,historical_cases:records.filter(record=>record.provenance_status==='historical').length,
    unversioned_cases:records.filter(record=>record.provenance_status==='unversioned').length,case_refs:records.map(record=>record.ref)};
}

function channels(records,requiredVariants){
  return {
    overall:summarize(records,requiredVariants),
    normal_play:summarize(records.filter(record=>record.method==='normal_play'),requiredVariants),
    automated:summarize(records.filter(record=>['automated_browser','fixture_browser','native_comparison','unit'].includes(record.method)),requiredVariants),
    real_device:summarize(records.filter(record=>record.method==='real_device'),requiredVariants),
    pc:summarize(records.filter(record=>record.input_path.startsWith('pc-')),requiredVariants,['pc-keyboard']),
    touch:summarize(records.filter(record=>record.input_path==='touch'),requiredVariants,['touch']),
    by_variant:Object.fromEntries(variants.map(variant=>[variant,summarize(records.filter(record=>record.variant===variant),[variant])]))
  };
}

function provenanceOf(run,build){
  const raw=run.provenance?.artifacts||run.artifacts||{};
  const artifacts=Array.isArray(raw)?Object.fromEntries(raw.map(record=>[record.file.replaceAll('\\','/').split('/').at(-1),record.sha256])):raw;
  const game=Object.hasOwn(artifacts,'game-check.wasm')?'game-check':'game';
  const required=[`${game}.js`,`${game}.wasm`,'browser-ui.js','browser-ui.wasm'];
  if(required.some(file=>typeof artifacts[file]!=='string'||!/^[0-9a-f]{64}$/.test(artifacts[file])))return {status:'unversioned',artifacts,reason:'All four runtime artifact SHA256 values are required'};
  if(required.some(file=>artifacts[file]!==build.artifacts[file]))return {status:'historical',artifacts,reason:'Runtime artifacts differ from the current build'};
  const manifests=game==='game-check'?['check','production']:['production'];
  if(manifests.some(name=>build.manifests[name]?.valid!==true))return {status:'historical',artifacts,reason:'Current build manifest is absent or does not match its source/output files'};
  const manifestHash=run.provenance?.source_manifest_sha256||run.provenance?.manifest_sha256;
  if(manifestHash&&manifestHash!==build.manifests[game==='game-check'?'check':'production'].sha256)return {status:'historical',artifacts,reason:'Recorded source manifest differs from the current build'};
  return {status:'current',artifacts};
}

export function buildReport({inventory,contract,evidence,build}){
  const features=parseFeatureContract(contract);
  if(inventory.feature_acceptance){
    const recorded=inventory.feature_acceptance.map(row=>row.id).sort();
    if(JSON.stringify(recorded)!==JSON.stringify(features.filter(row=>row.category==='operation').map(row=>row.id).sort()))throw new Error('Inventory operation IDs differ from the current FEATURES contract');
  }
  const featureIds=new Set(features.map(row=>row.id));
  const definitions=Object.entries(inventory.definitions||{}).flatMap(([domain,value])=>value.entries.map(entry=>({domain,...entry,source:value.source})));
  if(!definitions.length)throw new Error('Definition inventory is empty');
  const definitionIds=new Set(definitions.map(row=>`${row.domain}:${row.symbol}`));
  const definitionById=new Map(definitions.map(row=>[`${row.domain}:${row.symbol}`,row]));
  if(definitionIds.size!==definitions.length)throw new Error('Definition inventory has duplicate domain/symbol pairs');
  const issues=[],unmapped=[],runs=[],cases=[],seenRuns=new Set();
  for(const document of evidence){
    if(!document.data){runs.push({file:document.file,status:'missing'});continue;}
    const source=document.data;
    const explicitRuns=Array.isArray(source.runs)&&source.runs.some(run=>Array.isArray(run.cases))?source.runs:[source];
    for(const [runIndex,run] of explicitRuns.entries()){
      const runId=run.run_id||`${document.sha256.slice(0,12)}:${runIndex}`;
      const runRef=`${document.file}#${runId}`;
      if(seenRuns.has(runRef)){issues.push(`${runRef}: duplicate run ID`);continue;}
      seenRuns.add(runRef);
      const result=run.result||run.status||source.result||source.status||'unknown';
      const proof=provenanceOf(run,build);
      const descriptors=run.cases||[];
      const accepted=[];
      const idCounts=new Map();
      for(const entry of descriptors)if(typeof entry.id==='string')idCounts.set(entry.id,(idCounts.get(entry.id)||0)+1);
      for(const [caseIndex,entry] of descriptors.entries()){
        const ref=`${runRef}/${entry.id||entry.name||caseIndex}`;
        if(!Object.hasOwn(entry,'feature_ids')&&!Object.hasOwn(entry,'targets')){
          unmapped.push({ref,reason:'No explicit feature_ids or targets; check labels are not mapped'});continue;
        }
        const errors=[];
        const id=entry.id;
        const feature_ids=entry.feature_ids||[];
        const targets=entry.targets||[];
        const method=entry.method||run.method;
        const fixture=entry.fixture??run.fixture;
        const mode=entry.mode??run.game_mode??(['normal','easy','wizard'].includes(run.mode)?run.mode:null);
        const status=entry.status||entry.result;
        const variant=entry.variant||run.variant;
        const input_path=entry.input_path||run.input_path;
        const assertions=entry.assertions||[];
        const coverage=entry.coverage||'partial';
        if(typeof id!=='string'||!id.length)errors.push('A stable nonempty case id is required');
        if(idCounts.get(id)>1)errors.push('Duplicate case id within run');
        if(!Array.isArray(feature_ids)||feature_ids.some(value=>!featureIds.has(value)))errors.push('Unknown feature ID');
        if(!Array.isArray(targets)||targets.some(target=>!target||!definitionIds.has(`${target.domain}:${target.symbol}`)||typeof target.effect_asserted!=='boolean'))errors.push('Unknown target or missing effect_asserted boolean');
        if(!feature_ids.length&&!targets.length)errors.push('No explicit coverage target');
        if(!methods.has(method))errors.push('Unknown evidence method');
        if(typeof fixture!=='boolean'||(method==='fixture_browser'&&!fixture)||(method==='normal_play'&&fixture))errors.push('Invalid or missing fixture classification');
        if(method==='normal_play'&&mode!=='normal')errors.push('Normal play requires explicit normal game mode');
        if(!statuses.has(status))errors.push('Unknown case status');
        if(!variants.includes(variant))errors.push('Unknown variant');
        if(typeof input_path!=='string'||!input_path.length)errors.push('Missing input_path');
        if(!['partial','complete'].includes(coverage))errors.push('Unknown coverage extent');
        if(!Array.isArray(assertions)||(status==='pass'&&!assertions.some(value=>typeof value==='string'&&value.trim())))errors.push('A passing case requires explicit assertions');
        if(!['pass','fail','partial','unreached','not_run'].includes(result))errors.push('Suite result/exit equivalent is missing');
        if(errors.length){issues.push(...errors.map(error=>`${ref}: ${error}`));continue;}
        accepted.push(id);
        cases.push({ref,id,run:runRef,feature_ids,targets,method,fixture,status,variant,mode,seed:entry.seed??run.seed??null,input_path,coverage,assertions,
          evidence:entry.evidence||[],source:entry.source||null,scope:entry.scope??run.scope??source.scope??null,suite_status:result,provenance_status:proof.status});
      }
      const labels=run.checks||source.checks||[];
      if(!descriptors.length||!accepted.length)unmapped.push({ref:runRef,reason:'No valid explicitly mapped cases',labels});
      runs.push({ref:runRef,file:document.file,sha256:document.sha256,run_id:runId,result,provenance:proof,accepted_cases:accepted.length,declared_cases:descriptors.length,unmapped_labels:labels});
    }
  }
  const featureRows=features.map(row=>{
    const required=row.id==='variant.brogue'?['brogue']:row.id==='variant.rapid'?['rapid_brogue']:row.id==='variant.bullet'?['bullet_brogue']:variants;
    const direct=cases.filter(record=>record.feature_ids.includes(row.id));
    const directRefs=new Set(direct.map(record=>record.ref));
    const derived=cases.filter(record=>!directRefs.has(record.ref)&&record.targets.some(target=>target.effect_asserted&&canDerive(row.id,target)&&definitionById.get(`${target.domain}:${target.symbol}`)?.classification==='primitive'));
    // A tested kind contributes only partial group evidence, even if its own
    // variant/input contract was completely asserted. Keep its original ref.
    return {...row,definition_case_refs:derived.map(record=>record.ref),...channels([...direct,...derived.map(record=>({...record,coverage:'partial'}))],required)};
  });
  const definitionRows=definitions.map(row=>({...row,...channels(cases.filter(record=>record.targets.some(target=>target.domain===row.domain&&target.symbol===row.symbol&&target.effect_asserted)))}));
  for(const row of featureRows){
    const prerequisites=domainRequirements[row.id]||[];
    if(!prerequisites.length)continue;
    row.required_definition_domains=prerequisites;
    row.unconfirmed_definitions=definitionRows.filter(definition=>relevantDefinition(row.id,definition)&&definition.classification==='primitive'&&definition.overall.status!=='pass').map(definition=>`${definition.domain}:${definition.symbol}`);
    if(row.unconfirmed_definitions.length){
      for(const field of ['overall','normal_play','automated','real_device','pc','touch'])if(row[field].status==='pass')row[field].status='partial';
      for(const value of Object.values(row.by_variant))if(value.status==='pass')value.status='partial';
    }
  }
  const domainRows=Object.keys(inventory.definitions).map(domain=>{
    const rows=definitionRows.filter(row=>row.domain===domain);
    const counts=countStatuses(rows);
    return {domain,total:rows.length,classification_counts:Object.fromEntries(['primitive','mask','count-boundary'].map(type=>[type,rows.filter(row=>row.classification===type).length])),counts,
      status:counts.fail?'fail':counts.pass===rows.length?'pass':counts.pass||counts.partial?'partial':counts.unreached?'unreached':'not_run',
      not_run:rows.filter(row=>row.overall.status==='not_run').map(row=>row.symbol)};
  });
  return {schema_version:1,scope:'Source inventory plus explicitly executed coverage; not a claim that every game combination was tested',
    rules:{required_variants:variants,required_input_paths:inputPaths,complete:'All required variant and input scopes need current complete assertions. Representative or partial cases cannot certify a whole feature or domain.',
      definition_effects:'Only explicit domain/symbol targets with effect_asserted=true count. Initial fixture placement and label text never count.',
      source_inventory_is_execution:false,fixture_is_normal_play:false,old_artifacts_are_current:false},
    build,inventory_reference:inventory.reference||null,inventory_source_snapshot:inventory.command_source_snapshot||[],
    summary:{features:countStatuses(featureRows),definitions:countStatuses(definitionRows),feature_count:featureRows.length,operation_count:featureRows.filter(row=>row.category==='operation').length,additional_contract_count:featureRows.filter(row=>row.category==='additional_contract').length,definition_count:definitionRows.length,
      current_cases:cases.filter(row=>row.provenance_status==='current').length,historical_cases:cases.filter(row=>row.provenance_status==='historical').length,
      current_case_results:Object.fromEntries([...statuses].map(status=>[status,cases.filter(row=>row.provenance_status==='current'&&row.status===status).length])),
      unversioned_cases:cases.filter(row=>row.provenance_status==='unversioned').length,validation_errors:issues.length},
    features:featureRows,domains:domainRows,definitions:definitionRows,runs,cases,unmapped,validation_errors:issues};
}

function countStatuses(rows){
  return Object.fromEntries(['pass','partial','fail','unreached','not_run','not_applicable'].map(status=>[status,rows.filter(row=>row.overall.status===status).length]));
}
const clean=value=>String(value??'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replaceAll('|','\\|').replaceAll('\n',' ');
const cell=value=>`${value.status}${value.executed_cases?` (${value.executed_cases})`:''}${value.historical_cases?` / 旧${value.historical_cases}`:''}${value.unversioned_cases?` / 版不明${value.unversioned_cases}`:''}`;

export function renderMarkdown(report){
  const lines=['# Brogue 原作機能の検証表','',
    '機能契約と全定義の棚卸しに、明示された実行証拠だけを結び付けた派生結果。`not_run` は実行証拠なし、`partial` は一部の条件・variant・入力経路のみ確認。全機能・全組合せの合格を表さない。',
    '','通常プレイ、専用 fixture を含む自動検証、実機を別列にする。自動欄の内訳と入力・assertion・画像は JSON の case_refs から参照できる。旧成果物と版不明の結果は現在の合格へ加算しない。',
    '',`機能 ${report.summary.feature_count}件、定義 ${report.summary.definition_count}件。現在の明示ケース ${report.summary.current_cases}件、旧版 ${report.summary.historical_cases}件、版不明 ${report.summary.unversioned_cases}件。`,
    '',`現在のケース結果: ${JSON.stringify(report.summary.current_case_results)}`,`機能件数: ${JSON.stringify(report.summary.features)}`,`定義件数: ${JSON.stringify(report.summary.definitions)}`,
    '', '## 機能ごとの結果','', '| ID | 操作・所有者 | 実プレイ | 自動 | 実機 | 全条件 | 未確認の契約 |','|---|---|---|---|---|---|---|'];
  for(const row of report.features)lines.push(`| ${row.id} | ${clean(row.operation)} | ${cell(row.normal_play)} | ${cell(row.automated)} | ${cell(row.real_device)} | ${cell(row.overall)} | ${row.overall.status==='pass'?'':clean(row.expected)} |`);
  lines.push('','## 定義領域の集計','','primitive・mask・境界定数を混ぜて「種類数」と呼ばない。全定義は次表で省略せず列挙する。','', '| 領域 | 全定義 | primitive / mask / 境界 | 状態 | pass / partial / fail / 未実行 |','|---|---:|---|---|---|');
  for(const row of report.domains)lines.push(`| ${row.domain} | ${row.total} | ${Object.values(row.classification_counts).join(' / ')} | ${row.status} | ${row.counts.pass} / ${row.counts.partial} / ${row.counts.fail} / ${row.counts.not_run} |`);
  lines.push('','## 全定義の実効果検証','','| 領域 | symbol | 分類 | 実プレイ | 自動 | 実機 | 全条件 |','|---|---|---|---|---|---|---|');
  for(const row of report.definitions)lines.push(`| ${row.domain} | ${row.symbol} | ${row.classification} | ${cell(row.normal_play)} | ${cell(row.automated)} | ${cell(row.real_device)} | ${cell(row.overall)} |`);
  lines.push('','## 実行と版の根拠','','| 結果ファイル / run | suite結果 | 版判定 | 対応済ケース |','|---|---|---|---:|');
  for(const row of report.runs)lines.push(`| ${clean(row.ref||row.file)} | ${row.result||row.status} | ${row.provenance?.status||'missing'} | ${row.accepted_cases||0} |`);
  lines.push('','## 未対応の証拠・入力エラー','',...report.unmapped.map(row=>`- ${clean(row.ref)}: ${row.reason}`),...report.validation_errors.map(error=>`- ERROR: ${clean(error)}`),'');
  return lines.join('\n');
}

async function readJSON(filename){try{const bytes=await readFile(filename);return {data:JSON.parse(bytes.toString('utf8')),sha256:hash(bytes)};}catch(error){if(error.code==='ENOENT')return null;throw error;}}

async function inspectBuild(){
  const artifacts={};
  for(const file of ['game.js','game.wasm','game-check.js','game-check.wasm','browser-ui.js','browser-ui.wasm']){
    try{artifacts[file]=hash(await readFile(path.join(gameRoot,'build',file)));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const manifests={};
  for(const [name,file] of [['production','build-manifest.json'],['check','build-manifest-check.json']]){
    const loaded=await readJSON(path.join(gameRoot,'build',file));
    if(!loaded){manifests[name]={valid:false,missing:true};continue;}
    const mismatches=[];
    if(loaded.data.source_eol!=='LF')mismatches.push('source_eol must be LF');
    for(const record of loaded.data.outputs||[])if(artifacts[record.file]!==record.sha256)mismatches.push(record.file);
    for(const record of loaded.data.source_inputs||[]){
      const filename=path.resolve(gameRoot,record.file),inRepository=path.relative(repository,filename);
      if(inRepository.startsWith('..')||path.isAbsolute(inRepository)){mismatches.push(`unsafe source: ${record.file}`);continue;}
      try{if(hash((await readFile(filename,'utf8')).replaceAll('\r\n','\n'))!==record.sha256)mismatches.push(record.file);}
      catch(error){if(error.code==='ENOENT')mismatches.push(record.file);else throw error;}
    }
    if(!loaded.data.asset_inputs?.length)mismatches.push('asset_inputs are missing');
    for(const record of loaded.data.asset_inputs||[]){
      const filename=path.resolve(gameRoot,record.file),inRepository=path.relative(repository,filename);
      if(inRepository.startsWith('..')||path.isAbsolute(inRepository)){mismatches.push(`unsafe asset: ${record.file}`);continue;}
      try{
        const bytes=await readFile(filename);
        if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)mismatches.push(record.file);
      }catch(error){if(error.code==='ENOENT')mismatches.push(record.file);else throw error;}
    }
    manifests[name]={file:`brogue-nihon/build/${file}`,sha256:loaded.sha256,valid:mismatches.length===0&&Boolean(loaded.data.source_inputs?.length),mismatches};
  }
  return {artifacts,manifests};
}

export async function main(args=process.argv.slice(2)){
  let inventoryPath=path.join(repository,'.local/feature-verification/data-inventory.json');
  let output=path.join(repository,'.local/feature-verification');
  const extra=[];
  for(let index=0;index<args.length;index++){
    if(!['--inventory','--output','--evidence'].includes(args[index])||!args[index+1])throw new Error('Usage: node tests/report-features.mjs [--inventory file] [--output directory] [--evidence result.json]');
    const flag=args[index++],value=path.resolve(args[index]);
    if(flag==='--inventory')inventoryPath=value;else if(flag==='--output')output=value;else extra.push(value);
  }
  const inventory=await readJSON(inventoryPath);
  if(!inventory)throw new Error(`Missing inventory: ${inventoryPath}. Generate the source inventory first.`);
  const defaultEvidence=['input','menus','commands','scenarios','consumables','scrolls','bolts','projectiles','knowledge-feats','world-contracts','world-variants','advanced-contracts','advanced-variants','overlay-messages','weapon-runics','weapon-runic-edges','armor-runics','ring-effects','persistence','original-compare','fixture-compare','fixture-compare-scrolls','fixture-compare-bolts','fixture-compare-knowledge-feats','fixture-compare-world-contracts','fixture-compare-world-variants','fixture-compare-advanced-contracts','fixture-compare-advanced-variants','fixture-compare-overlay-messages','fixture-compare-weapon-runics','fixture-compare-weapon-runic-edges','fixture-compare-armor-runics','fixture-compare-ring-effects'].map(name=>path.join(gameRoot,'.local/feature-verification',name,'results.json'));
  for(const file of ['baseline-results.json','intermediate-results.json','pending-loss-baseline-results.json'])defaultEvidence.push(path.join(gameRoot,'.local/feature-verification/input',file));
  defaultEvidence.push(path.join(gameRoot,'.local/feature-verification/menus/unpaused-file-baseline-results.json'));
  defaultEvidence.push(path.join(repository,'.local/feature-verification/normal-play/results.json'),path.join(gameRoot,'.local/browser-verification/results.json'));
  defaultEvidence.push(path.join(gameRoot,'.local/browser-verification/pre-png-notice-results.json'));
  const evidence=[];
  for(const filename of [...new Set([...defaultEvidence,...extra])])evidence.push({file:relative(filename),...await readJSON(filename)});
  const contract=await readFile(path.join(gameRoot,'docs/FEATURES-ja.md'),'utf8');
  const report=buildReport({inventory:inventory.data,contract,evidence,build:await inspectBuild()});
  report.inputs={inventory:{file:relative(inventoryPath),sha256:inventory.sha256},contract:{file:'brogue-nihon/docs/FEATURES-ja.md',sha256:hash(contract)}};
  await mkdir(output,{recursive:true});
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(path.join(output,'report.md'),renderMarkdown(report));
  console.log(JSON.stringify({output:relative(output),...report.summary}));
  if(report.validation_errors.length)process.exitCode=1;
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
