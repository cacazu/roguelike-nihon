// Native C glyph contracts -> Original mask or a nonzero glyph in bundled TTFs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gameRoot,readNativeGlyphSources,validateNativeGlyphText,nativeGlyphCoverage,nativeExpectedPixels,assertNativeGlyphPixels} from './original-glyph-mask.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fontLookup(bytes){
 const tables=new Map();for(let i=0;i<bytes.readUInt16BE(4);i++){const at=12+i*16;tables.set(bytes.toString('ascii',at,at+4),{offset:bytes.readUInt32BE(at+8),length:bytes.readUInt32BE(at+12)});}
 const cmap=tables.get('cmap'),maxp=tables.get('maxp');assert.ok(cmap&&maxp);const count=bytes.readUInt16BE(maxp.offset+4),subtables=[];
 for(let i=0;i<bytes.readUInt16BE(cmap.offset+2);i++){const at=cmap.offset+4+i*8,platform=bytes.readUInt16BE(at),encoding=bytes.readUInt16BE(at+2),base=cmap.offset+bytes.readUInt32BE(at+4),format=bytes.readUInt16BE(base);
  if((platform===0||platform===3&&[1,10].includes(encoding))&&[4,12].includes(format))subtables.push({base,format});
 }
 assert.ok(subtables.length>0,'Unicode cmap format4/12 required');
 return code=>{for(const {base,format}of subtables){let glyph=0;
  if(format===12){const groups=bytes.readUInt32BE(base+12);let lo=0,hi=groups-1;while(lo<=hi){const mid=(lo+hi)>>1,at=base+16+mid*12,start=bytes.readUInt32BE(at),end=bytes.readUInt32BE(at+4);if(code<start)hi=mid-1;else if(code>end)lo=mid+1;else{glyph=bytes.readUInt32BE(at+8)+code-start;break;}}}
  else if(code<=0xffff){const n=bytes.readUInt16BE(base+6)/2,end=base+14,start=end+2*n+2,delta=start+2*n,ranges=delta+2*n;for(let i=0;i<n;i++){if(code>bytes.readUInt16BE(end+i*2))continue;if(code<bytes.readUInt16BE(start+i*2))break;
    const d=bytes.readInt16BE(delta+i*2),r=bytes.readUInt16BE(ranges+i*2);if(r===0)glyph=(code+d)&0xffff;else{const at=ranges+i*2+r+2*(code-bytes.readUInt16BE(start+i*2));assert.ok(at+2<=base+bytes.readUInt16BE(base+2));glyph=bytes.readUInt16BE(at);if(glyph)glyph=(glyph+d)&0xffff;}break;
   }}
  assert.ok(glyph<count,'cmap glyph ID exceeds maxp');if(glyph!==0)return glyph;
 }return 0;};
}
const sources=readNativeGlyphSources(),rust=readFileSync(path.join(gameRoot,'rust/src/presentation.rs'),'utf8'),
 block=/const ORIGINAL_FONT_GLYPHS:\s*&\[\(i32,\s*u32\)\]\s*=\s*&\[([\s\S]*?)\];/.exec(rust);
const metadata=JSON.parse(readFileSync(path.join(gameRoot,'web/assets/fonts/metadata.json'),'utf8'));
const fonts=metadata.fonts.map(font=>{const bytes=readFileSync(path.join(gameRoot,'web/assets/fonts',font.file));assert.equal(sha(bytes),font.sha256);assert.equal(bytes.length,font.bytes);return {name:font.name,glyph:fontLookup(bytes)};});

test('all131 native public glyphs resolve through SDL Original masks or nonzero bundled cmap glyphs',()=>{
 assert.ok(block,'Explicit production Original mask table required');const literal=block[1].replace(/\/\/[^\n]*/g,''),rows=[...literal.matchAll(/\(\s*(0x[\da-f]+|\d+)\s*,\s*(0x[\da-f]+|\d+)\s*\)/gi)],masks=new Map(rows.map(m=>[Number(m[1]),Number(m[2])]));
 assert.equal(rows.length,masks.size,'Duplicate production Original Unicode mask');assert.equal(literal.replace(/\(\s*(?:0x[\da-f]+|\d+)\s*,\s*(?:0x[\da-f]+|\d+)\s*\)/gi,'').replace(/[\s,]/g,''),'','Unsupported production mask expression');
 assert.deepEqual([...masks.keys()].sort((a,b)=>a-b),['G_CHARM','G_FIRE','G_FOLIAGE','G_RING','G_TOTEM','G_BAD_MAGIC','G_GOOD_MAGIC'].map(s=>sources.unicode.get(s)).sort((a,b)=>a-b));
 assert.equal(masks.size,7);for(const [unicode,index]of masks)assert.equal(index,sources.fontIndex.get(unicode),'Original mask must use native SDL fontIndex');
 const first=Number(/pub const FIRST_TILE:\s*i32\s*=\s*(\d+)/.exec(rust)[1]),last=Number(/pub const LAST_TILE:\s*i32\s*=\s*(\d+)/.exec(rust)[1]);
 assert.match(rust,/if glyph == 258\s*\{\s*0x25c0\s*\}\s*else\s*\{\s*unicode\s*\}/i,'Existing native menu-arrow replacement must remain explicit');
 let total=0,masked=0,fontCovered=0;const unresolved=[];
 for(const [symbol,glyph]of sources.glyphs){total++;const unicode=sources.unicode.get(symbol),actual=glyph===258?0x25c0:unicode;if(glyph>=first&&glyph<last&&masks.has(unicode)){masked++;continue;}const covered=fonts.some(f=>f.glyph(actual)!==0);if(covered)fontCovered++;else unresolved.push({symbol,glyph,unicode:actual});}
 assert.equal(total,131);assert.deepEqual(unresolved,[],'A nonblank .notdef glyph must never count as coverage');assert.equal(masked+fontCovered,131);
 // Each known missing character is demonstrably absent from both current fonts.
 for(const symbol of ['G_CHARM','G_FIRE','G_TOTEM','G_BAD_MAGIC','G_GOOD_MAGIC']){const unicode=sources.unicode.get(symbol);assert.ok(fonts.every(f=>f.glyph(unicode)===0));assert.ok(masks.has(unicode));}
 assert.ok(fonts.some(f=>f.glyph(0x25c0)!==0));
});

test('native atlas shapes retain independent coverage/transparency at fit,14,24 and distinguish fire from other ink',()=>{
 const symbols=['G_FOLIAGE','G_CHARM','G_FIRE','G_TOTEM','G_BAD_MAGIC','G_GOOD_MAGIC','G_RING'];
 for(const symbol of symbols)for(const [width,height]of [[3,4],[12,18],[14,22],[24,37]]){const r=nativeGlyphCoverage(sources.unicode.get(symbol),width,height);assert.ok(r.coverage.some(a=>a>0));assert.ok(r.coverage.some(a=>a<255));if(width>=12)assert.ok(r.coverage.some(a=>a===0));}
 const width=14,height=22,fg=[255,102,0],bg=[26,51,77],unicode=sources.unicode.get('G_FIRE'),cell=[sources.glyphs.get('G_FIRE'),unicode,100,40,0,10,20,30],fire=nativeGlyphCoverage(unicode,width,height),other=nativeGlyphCoverage(sources.unicode.get('G_FOLIAGE'),width,height);
 const valid=nativeExpectedPixels(fire,fg,bg),wrong=nativeExpectedPixels(other,fg,bg);assert.doesNotThrow(()=>assertNativeGlyphPixels({pixels:valid,width,height,cell}));assert.throws(()=>assertNativeGlyphPixels({pixels:wrong,width,height,cell}),/Native atlas shape/);
});

test('all8bit source-over integer rounding combinations fit the stated two-channel-unit bound',()=>{
 let maximum=0;for(let alpha=0;alpha<256;alpha++)for(let fg=0;fg<256;fg++)for(let bg=0;bg<256;bg++){
  const ideal=Math.round((fg*alpha+bg*(255-alpha))/255),premultiplied=Math.round(fg*alpha/255),composed=Math.min(255,premultiplied+Math.round(bg*(255-alpha)/255));maximum=Math.max(maximum,Math.abs(ideal-composed));
 }
 assert.ok(maximum<=1,'Premultiply and opaque source-over may differ by at most one');
 // One additional final8bit compositor quantization unit gives the public ±2.
 assert.ok(maximum+1<=2);
});

function nativeMutationInputs(){const files=sources.source_sha256.map(record=>record.file);return {current:files.map(file=>readFileSync(path.join(gameRoot,file),'utf8')),original:files.map(file=>readFileSync(path.join(sources.pin,file),'utf8'))};}
test('numeric Udefine with a valid literal prefix plus unknown expression is rejected',()=>{
 const {current,original}=nativeMutationInputs(),before=current[1];current[1]=before.replace(/^(\s*#define\s+U_FLIPPED_V\s+0x22CF)\b/m,'$1+1');assert.notEqual(current[1],before);
 assert.throws(()=>validateNativeGlyphText(current,original),/Unsupported numeric native Unicode define/);
});
test('an early conditional return cannot hide behind all131 unchanged native glyph cases',()=>{
 const {current,original}=nativeMutationInputs(),before=current[2];current[2]=before.replace(/(unsigned int glyphToUnicode\(enum displayGlyph glyph\)\s*\{)/,'$1\n    if (glyph == G_FIRE) return \'?\';');assert.notEqual(current[2],before);
 const cases=text=>[.../unsigned int glyphToUnicode\(enum displayGlyph glyph\)\s*\{([\s\S]*?)\n\}/.exec(text)[1].matchAll(/case\s+G_\w+\s*:/g)].length;assert.equal(cases(current[2]),131);assert.equal(cases(before),131);
 assert.throws(()=>validateNativeGlyphText(current,original),/glyphToUnicode native function tokens differ/);
});
