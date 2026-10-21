// Replay actual browser-consumed inputs with the same initial fixture against
// hash-pinned, unmodified upstream C. Independent effect assertions live in the
// consumables suite; agreement alone is not an oracle for correct game rules.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,mkdtemp,realpath,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'.local/feature-verification/fixture-compare');
const source=process.env.BROGUE_ORIGINAL_SOURCE;
const input=process.env.BROGUE_FIXTURE_RESULTS||path.join(root,'.local/feature-verification/consumables/results.json');
const requestedDomains=(process.env.BROGUE_COMPARE_DOMAINS||'potionKind,charmKind').split(',');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
const result={run_id:new Date().toISOString(),result:'fail',checks:[],cases:[],errors:[],excluded_fields:['ready'],
  limits:['The shared fixture establishes initial conditions; independent browser assertions establish the expected effects.',
    'The native console does not interrupt pauses. Only real C input-wait boundaries are compared, not intermediate animation frames or timing.',
    'The platform-only ready flag is excluded; every other observed field must agree. Internal RNGState and unobserved world cells are outside this comparison.',
    'Primary case traces are compared; separate control-page traces remain browser-only evidence.',
    'The original native UI has no browser saved-buffer binding. This comparison verifies semantic state, not fixture screenshots.']};
let temporary;
await mkdir(output,{recursive:true});
try{
  assert.ok(source,'Set BROGUE_ORIGINAL_SOURCE to the verified official v1.15.1 source tree.');
  const pin=JSON.parse(await readFile(path.join(root,'tests/upstream-1.15.1.json'),'utf8'));
  const actualSources={};
  const sources=[];
  for(const folder of ['brogue','platform','variants']){
    for(const filename of (await readdir(path.join(source,'src',folder))).filter(name=>/\.[ch]$/.test(name)).sort()){
      const relative=`src/${folder}/${filename}`;
      actualSources[relative]=sha(await readFile(path.join(source,relative)));
      if(filename.endsWith('.c')&&(folder!=='platform'||['main.c','platformdependent.c'].includes(filename)))sources.push(path.join(source,relative));
    }
  }
  assert.deepEqual(Object.keys(actualSources).sort(),Object.keys(pin.source_sha256).sort(),'Unpinned upstream C/header inputs');
  for(const [filename,expected]of Object.entries(pin.source_sha256))assert.equal(actualSources[filename],expected,'Upstream pin: '+filename);
  const manifestBytes=await readFile(path.join(root,'build/build-manifest-check.json'));
  const manifest=JSON.parse(manifestBytes);
  assert.equal(manifest.test_hooks,true);
  for(const entry of manifest.source_inputs)assert.equal(sha(canonical(await readFile(path.resolve(root,entry.file)))),entry.sha256,'CHECK source changed: '+entry.file);
  for(const entry of manifest.asset_inputs){const bytes=await readFile(path.resolve(root,entry.file));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256,'CHECK asset changed: '+entry.file);}
  const artifacts={};
  for(const name of ['game-check.js','game-check.wasm','browser-ui.js','browser-ui.wasm'])artifacts[name]=sha(await readFile(path.join(root,'build',name)));
  for(const entry of manifest.outputs)assert.equal(artifacts[entry.file],entry.sha256,'CHECK output changed: '+entry.file);
  const inputBytes=await readFile(input);
  const suite=JSON.parse(inputBytes);
  assert.equal(suite.result,'pass','The browser effect suite must pass independently before native comparison.');
  const recorded=suite.provenance?.artifacts;
  assert.ok(recorded&&typeof recorded==='object','Browser suite must identify the four runtime artifacts.');
  assert.deepEqual(recorded,artifacts,'Browser proof does not identify the current runtime.');
  assert.equal(suite.provenance.source_manifest_sha256,sha(manifestBytes),'Browser proof source manifest mismatch');
  result.provenance={artifacts,source_manifest_sha256:sha(manifestBytes)};
  result.upstream={repository:pin.repository,tag:pin.tag,commit:pin.commit,archive_sha256:pin.archive_sha256,source_sha256:actualSources};
  result.input={file:path.resolve(input),sha256:sha(inputBytes),run_id:suite.run_id};
  result.fixture_sha256=sha(canonical(await readFile(path.join(root,'tests/fixtures.c'))));
  result.platform_sha256=sha(canonical(await readFile(path.join(root,'tests/original-platform.c'))));
  result.extra_source_sha256={};
  for(const filename of ['tests/fixtures.c','tests/fixture-scenes.h','tests/original-platform.c','src/platform/BrowserIO.h'])result.extra_source_sha256[filename]=sha(canonical(await readFile(path.join(root,filename))));
  const inventory=generateDataInventory({gitMetadata:false});
  validateDataSnapshot(inventory);
  assert.ok(requestedDomains.length&&new Set(requestedDomains).size===requestedDomains.length);
  for(const domain of requestedDomains)assert.ok(['potionKind','charmKind','scrollKind','staffKind','wandKind'].includes(domain),'Unsupported comparison domain: '+domain);
  const required=requestedDomains.flatMap(domain=>inventory.definitions[domain].entries.filter(entry=>entry.classification==='primitive').map(entry=>domain+'.'+entry.symbol));
  const effectTargets=new Set((suite.cases||[]).filter(row=>row.status==='pass'&&row.variant==='brogue').flatMap(row=>(row.targets||[]).filter(target=>target.effect_asserted===true).map(target=>target.domain+'.'+target.symbol)));
  for(const target of required)assert.ok(effectTargets.has(target),'The full requested Brogue effect suite is required: missing '+target);
  result.requested_domains=requestedDomains;
  result.required_primitive_targets=required;
  temporary=await mkdtemp(path.join(output,'runtime-'));
  const executable=path.join(output,process.platform==='win32'?'upstream-fixtures.exe':'upstream-fixtures');
  const command=['-std=c11','-O1','-fwrapv','-fno-strict-aliasing','-DBROGUE_EXTRA_VERSION=""','-DDATADIR=.',
    '-DBROGUE_BROWSER_CHECK','-DBROGUE_COMPARE_FIXTURES',
    ...['brogue','platform','variants'].map(folder=>'-I'+path.join(source,'src',folder)),
    '-I'+path.join(root,'src/platform'),...(process.platform==='win32'?['-Wl,--stack,8388608']:[]),
    ...sources,path.join(root,'tests/fixtures.c'),path.join(root,'tests/original-platform.c'),'-lm','-o',executable];
  const compiled=spawnSync(process.env.BROGUE_CC||'gcc',command,{encoding:'utf8',timeout:180000});
  await writeFile(path.join(output,'compiler-warnings.txt'),compiled.stderr||'');
  assert.equal(compiled.status,0,compiled.error?.message||compiled.stderr);
  result.compile_arguments=command;
  result.compiler=spawnSync(process.env.BROGUE_CC||'gcc',['--version'],{encoding:'utf8'}).stdout.split('\n')[0];
  const normalize=state=>{assert.ok(state&&typeof state==='object'&&!state.error);const {ready,...semantic}=state;return semantic;};
  const cases=suite.cases;
  assert.ok(Array.isArray(cases)&&cases.length,'No fixture cases were recorded.');
  assert.equal(new Set(cases.map(row=>row.id)).size,cases.length,'Duplicate fixture case IDs');
  for(const row of cases){
    assert.ok(typeof row.id==='string'&&row.id.length<=180&&/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(row.id),'Unsafe comparison case ID');
    const item={id:row.id+'-upstream',feature_ids:row.feature_ids,status:'fail',variant:row.variant,
      method:'native_comparison',input_path:row.input_path,fixture:true,coverage:'partial',
      assertions:['The exact same initial fixture and every observed input-wait semantic field agree with the pinned original after the same consumed events.'],
      evidence:[row.id+'-trace.json'],fixture_id:row.fixture_id};
    if(row.targets)item.targets=row.targets;
    result.cases.push(item);
    try{
      assert.equal(row.status,'pass');assert.equal(row.fixture,true);
      assert.ok(Array.isArray(row.native_trace)&&row.native_trace.length,'Missing consumed-input fixture trace');
      assert.equal(row.seed,'42');
      assert.ok(Number.isInteger(row.fixture_id)&&row.fixture_id>0,'Missing fixture ID');
      assert.ok(['brogue','rapid_brogue','bullet_brogue'].includes(row.variant),'Unknown variant');
      assert.equal(row.initial_state.seed,'42');
      assert.deepEqual(normalize(row.native_trace[0].before),normalize(row.initial_state),'First trace is not the post-prepare baseline');
      const events=row.native_trace.map(entry=>{assert.ok(Array.isArray(entry.event)&&entry.event.length===5);for(const value of entry.event)assert.ok(Number.isInteger(value)&&value>=-2147483648&&value<=2147483647);return entry.event;});
      const expected=[...row.native_trace.map(entry=>normalize(entry.before)),normalize(row.final_state)];
      const args=[...(row.variant==='brogue'?[]:['--variant',row.variant]),'--seed','42'];
      const replay=spawnSync(executable,args,{cwd:temporary,env:{...process.env,BROGUE_COMPARE_SCENE:String(row.fixture_id)},
        input:events.map(event=>event.join(' ')).join('\n')+'\n',encoding:'utf8',timeout:60000,maxBuffer:64*1024*1024});
      assert.equal(replay.status,0,replay.error?.message||replay.stderr||'Native replay did not exit cleanly');
      const actual=replay.stdout.split(/\r?\n/).filter(line=>line.startsWith('FIXTURE_COMPARE ')).map(line=>normalize(JSON.parse(line.slice('FIXTURE_COMPARE '.length))));
      await writeFile(path.join(output,row.id+'-trace.json'),JSON.stringify({events,expected,actual,stderr:replay.stderr},null,2)+'\n');
      assert.equal(actual.length,expected.length,'Input-wait trace length differs (missing, extra or incomplete consumption)');
      assert.deepEqual(actual[0],expected[0],'Initial fixture differs');
      assert.deepEqual(actual,expected,'Original and browser semantic states differ');
      item.waits=actual.length;item.status='pass';
      result.checks.push(row.id);console.log('PASS '+row.id+' matches upstream at '+actual.length+' waits');
    }catch(error){item.error=error.stack||String(error);result.errors.push({id:row.id,error:item.error});console.error('FAIL '+row.id+': '+error.message.split('\n')[0]);}
  }
  assert.equal(result.errors.length,0,'One or more fixture comparisons failed');
  result.result='pass';
}catch(error){result.errors.push({error:error.stack||String(error)});process.exitCode=1;}
finally{
  if(temporary){try{const checked=await realpath(temporary),parent=await realpath(output);assert.ok(checked.startsWith(parent+path.sep));await rm(checked,{recursive:true,force:true});}catch(error){result.result='fail';result.errors.push({cleanup:error.stack||String(error)});process.exitCode=1;}}
  await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
}
if(result.result!=='pass')process.exitCode=1;
