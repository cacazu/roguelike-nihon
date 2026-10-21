// A failed source/contract setup must never leave a previous success as the
// current machine-readable result. These failures occur before any browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,realpath,rm} from 'node:fs/promises';
import path from 'node:path';
import {root,runFixtureSuite} from './fixture-browser.mjs';

const failures=[
  ['a source inventory or contract factory throws',()=>{throw Error('Intentional source contract failure');},/Intentional source contract failure/],
  ['the requested case set is empty',()=>[],/non.?empty|No .*cases|At least one.*case/i],
  ['case IDs are duplicated',()=>[{id:'duplicate',fixture_id:1},{id:'duplicate',fixture_id:1}],/unique|duplicate/i],
];
for(const [reason,createCases,diagnostic]of failures)test('fresh failure replaces old success when '+reason,async t=>{
  const name='fixture-harness-selfcheck-'+randomUUID();
  const parent=path.join(root,'.local/feature-verification'),directory=path.join(parent,name);
  await mkdir(parent,{recursive:true});await mkdir(directory,{recursive:false});
  t.after(async()=>{
    const actual=await realpath(directory),expectedParent=await realpath(parent);
    assert.equal(path.dirname(actual),expectedParent);
    assert.equal(path.basename(actual),name);
    await rm(actual,{recursive:true,force:true});
  });
  await writeFile(path.join(directory,'results.json'),JSON.stringify({run_id:'previous-success',result:'pass',cases:[]})+'\n');
  t.mock.method(console,'error',()=>{});
  let factoryCalled=false;
  await assert.rejects(runFixtureSuite({name,createCases:()=>{factoryCalled=true;return createCases();}}));
  assert.equal(factoryCalled,true);
  const current=JSON.parse(await readFile(path.join(directory,'results.json'),'utf8'));
  assert.notEqual(current.run_id,'previous-success');
  assert.equal(current.result,'fail');
  assert.deepEqual(current.cases,[]);
  assert.ok(current.fatal?.message,'The failed setup must leave its diagnostic, not only a failed exit code.');
  assert.match(current.fatal.message,diagnostic);
});
