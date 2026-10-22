import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

test('production manifest matches the shipped modules and current sources',async()=>{
  const manifest=JSON.parse(await readFile(path.join(root,'build/build-manifest.json'),'utf8'));
  assert.equal(manifest.game,'brogue-ce-1.15.1');assert.equal(manifest.test_hooks,false);
  assert.equal(manifest.source_eol,'LF');
  assert.deepEqual(manifest.outputs.map(record=>record.file).sort(),['browser-ui.js','browser-ui.wasm','game.js','game.wasm']);
  for(const record of manifest.outputs){
    const data=await readFile(path.join(root,'build',record.file));
    assert.equal(data.length,record.bytes,record.file+' size');assert.equal(digest(data),record.sha256,record.file+' hash');
  }
  assert.ok(manifest.source_inputs.length>50,'Source provenance is missing');
  for(const required of ['web/index.html','web/host.js','web/style.css','web/assets/illustrations.json','web/assets/fonts/metadata.json'])assert.ok(manifest.source_inputs.some(record=>record.file===required),'Missing Web source: '+required);
  const repository=path.dirname(root.slice(0,-1));
  for(const record of manifest.source_inputs){
    const filename=path.resolve(root,record.file),relative=path.relative(repository,filename);
    assert.ok(relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Source record leaves the repository');
    const source=await readFile(filename,'utf8');
    assert.equal(digest(Buffer.from(source.replaceAll('\r\n','\n'),'utf8')),record.sha256,record.file+' source hash');
  }
  assert.deepEqual(manifest.asset_inputs.map(record=>record.file).sort(),['web/assets/dot-tiles.png','web/assets/illustrations.png','web/assets/fonts/NotoSansJP.ttf','web/assets/fonts/NotoColorEmoji.ttf'].sort());
  for(const record of manifest.asset_inputs){const data=await readFile(path.join(root,record.file));assert.equal(data.length,record.bytes,record.file+' size');assert.equal(digest(data),record.sha256,record.file+' asset hash');}
});

test('playable Wasm excludes verification state access',async()=>{
  const bytes=await readFile(path.join(root,'build/game.wasm'));
  const game=await WebAssembly.compile(bytes);
  const names=WebAssembly.Module.exports(game).map(record=>record.name);
  assert.ok(!names.some(name=>name.includes('brogue_check')));
  const manifest=JSON.parse(await readFile(path.join(root,'build/build-manifest.json'),'utf8'));
  assert.ok(!manifest.source_inputs.some(record=>record.file==='tests/fixtures.c'));
  assert.ok(!manifest.c_arguments.includes('-DBROGUE_BROWSER_CHECK'));
  const bridge=await readFile(path.join(root,'build/game.js'),'utf8');
  assert.ok(!bridge.includes('_brogue_check_'));
  assert.ok(!bytes.includes(Buffer.from('fixture snapshot overflow')));
  assert.ok(!(await readFile(path.join(root,'web/host.js'),'utf8')).includes('__brogueFeature'));
});

test('browser notices contain only the selected runtime graph and valid original bodies',async()=>{
  const directory=path.join(root,'web/licenses');
  const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
  const payload=await readFile(path.join(directory,'THIRD-PARTY.txt'));
  assert.equal(manifest.scope.cargo_lock_sha256,digest(await readFile(path.join(root,'rust/Cargo.lock'))));
  const names=manifest.components.map(record=>record.component);
  assert.ok(!names.some(name=>/^bevy|^rogue-|^lucide/.test(name)),'Another game or unused asset leaked into the notices');
  for(const body of manifest.notices)assert.equal(digest(payload.subarray(body.byte_offset,body.byte_offset+body.bytes)),body.id,body.id);
  const bodies=new Set(manifest.notices.map(body=>body.id));
  for(const component of manifest.components){assert.ok(component.notices.length,component.component);for(const notice of component.notices)assert.ok(bodies.has(notice.id),component.component);}
});
