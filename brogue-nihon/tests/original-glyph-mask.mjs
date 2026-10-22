// Independent Original-glyph oracle: pinned native SDL font indices and atlas bytes.
// No production mask/renderer output is used to construct expected coverage.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const gameRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const atlasSHA='40bb927cf8f1816f16720e7630e1d004974f7e780c9f137258ad017d554ec7af';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceFile=(base,file)=>readFileSync(path.join(base,file),'utf8');
let sourceCache,atlasCache;
const coverageCache=new Map();

// Keep literal bytes intact while ignoring only actual C comments/whitespace.
function lexC(text){
 const tokens=[],comments=[];let i=0;
 while(i<text.length){const start=i,ch=text[i];if(/\s/.test(ch)){i++;continue;}
  if(text.startsWith('//',i)){i=text.indexOf('\n',i+2);if(i<0)i=text.length;comments.push([start,i]);continue;}
  if(text.startsWith('/*',i)){const end=text.indexOf('*/',i+2);assert.ok(end>=0,'Unclosed native C comment');i=end+2;comments.push([start,i]);continue;}
  if(ch==='"'||ch==="'"){i++;let closed=false;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i]===ch){i++;closed=true;break;}assert.ok(!/[\r\n]/.test(text[i]),'Newline in native C literal');i++;}assert.ok(closed,'Unclosed native C literal');}
  else if(/[A-Za-z_]/.test(ch)){i++;while(i<text.length&&/[A-Za-z0-9_]/.test(text[i]))i++;}
  else if(/[0-9]/.test(ch)){i++;while(i<text.length&&/[A-Za-z0-9_.]/.test(text[i]))i++;}
  else{const operator=['>>=','<<=','==','!=','>=','<=','&&','||','++','--','+=','-=','*=','/=','%=','->','<<','>>','&=','|=','^='].find(op=>text.startsWith(op,i));i+=operator?.length??1;}
  tokens.push(text.slice(start,i));
 }return {tokens,comments};
}
function withoutCComments(text){let out='',at=0;for(const [start,end]of lexC(text).comments){out+=text.slice(at,start)+text.slice(start,end).replace(/[^\r\n]/g,' ');at=end;}return out+text.slice(at);}
function nativeFunctionTokens(text,signature){
 const tokens=lexC(text).tokens,starts=[];for(let at=0;at<tokens.length;at++)if(signature.every((token,i)=>tokens[at+i]===token)&&tokens[at+signature.length]==='{')starts.push(at+signature.length);
 assert.equal(starts.length,1,'Native function definition must be unique: '+signature.join(' '));const begin=starts[0];let depth=1;
 for(let end=begin+1;end<tokens.length;end++){if(tokens[end]==='{')depth++;else if(tokens[end]==='}'&&--depth===0)return tokens.slice(begin+1,end);}
 assert.fail('Unclosed native function body');
}
function nativeUnicodeDefines(text){
 const defines=new Map();for(const line of withoutCComments(text).split(/\r?\n/))if(/^\s*#\s*define\s+U_/.test(line)){
  const m=/^\s*#\s*define\s+(U_\w+)\s+(0x[\da-fA-F]+|\d+)\s*$/.exec(line);assert.ok(m,'Unsupported numeric native Unicode define: '+line.trim());
  assert.ok(!defines.has(m[1]),'Duplicate native Unicode define');defines.set(m[1],Number(m[2]));
 }return defines;
}
export function validateNativeGlyphText(current,original){
 assert.equal(current.length,4);assert.equal(original.length,4);
 const glyphSignature=['unsigned','int','glyphToUnicode','(','enum','displayGlyph','glyph',')'],fontSignature=['static','int','fontIndex','(','enum','displayGlyph','glyph',')'],prefix=lexC('if ((int)glyph >= LOCALIZED_GLYPH_BASE) return (int)glyph;').tokens;
 const glyphCurrent=nativeFunctionTokens(current[2],glyphSignature),glyphPinned=nativeFunctionTokens(original[2],glyphSignature),fontCurrent=nativeFunctionTokens(current[3],fontSignature),fontPinned=nativeFunctionTokens(original[3],fontSignature);
 assert.deepEqual(glyphCurrent,glyphPinned,'glyphToUnicode native function tokens differ');
 assert.deepEqual(fontCurrent.slice(0,prefix.length),prefix,'Only the exact existing first localized glyph prefix is permitted');
 const fontNative=fontCurrent.slice(prefix.length);assert.deepEqual(fontNative,fontPinned,'fontIndex native function tokens differ outside explicit localized prefix');
 const a=parseNativeGlyphText(current),b=parseNativeGlyphText(original),table=parsed=>[...parsed.glyphs].map(([symbol,glyph])=>({symbol,glyph,unicode:parsed.unicode.get(symbol),font_index:parsed.perGlyphIndex.get(symbol)}));
 assert.deepEqual(table(a),table(b),'All131 current/pinned enum, Unicode and SDL font indices must match');
 return {parsed:b,table:table(b),function_tokens_sha256:{glyphToUnicode:sha(Buffer.from(JSON.stringify(glyphPinned))),fontIndex_without_exact_localized_prefix:sha(Buffer.from(JSON.stringify(fontPinned)))}};
}

function parseNativeGlyphText(texts){
 const [header,platform,mapping,sdl]=texts,body=/enum displayGlyph\s*\{([\s\S]*?)\};/.exec(header);assert.ok(body);
 const glyphs=new Map();let value=-1;
 for(const field of body[1].replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').split(',')){
  if(!field.trim())continue;const m=/^\s*(G_\w+)(?:\s*=\s*(\d+))?\s*$/.exec(field);assert.ok(m,'Unparsed displayGlyph: '+field);
  value=m[2]===undefined?value+1:Number(m[2]);assert.ok(!glyphs.has(m[1]),'Duplicate native displayGlyph name');assert.ok(![...glyphs.values()].includes(value),'Duplicate native displayGlyph value');glyphs.set(m[1],value);
 }
 assert.equal(glyphs.size,131);
 const defines=nativeUnicodeDefines(platform);
 const unicode=new Map(),fn=/unsigned int glyphToUnicode\(enum displayGlyph glyph\)\s*\{([\s\S]*?)\n\}/.exec(mapping);assert.ok(fn);
 const escapes={"\\'":"'",'\\\\':'\\','\\"':'"','\\n':'\n','\\r':'\r','\\t':'\t'};
 for(const m of fn[1].matchAll(/((?:case\s+G_\w+\s*:\s*)+)return\s+('(?:\\.|[^'\\])*'|U_\w+|0x[\da-fA-F]+|\d+)\s*;/g)){
  const token=m[2];let code;
  if(token.startsWith("'")){const char=token.slice(1,-1),decoded=escapes[char]??char;assert.equal([...decoded].length,1,'Unsupported native C character '+token);code=decoded.codePointAt(0);}
  else code=defines.has(token)?defines.get(token):Number(token);
  assert.ok(Number.isInteger(code),'Unresolved native Unicode '+token);
  for(const group of m[1].matchAll(/case\s+(G_\w+)\s*:/g)){assert.ok(glyphs.has(group[1]));assert.ok(!unicode.has(group[1]),'Duplicate native Unicode mapping '+group[1]);unicode.set(group[1],code);}
 }
 assert.equal(unicode.size,131,'Every native displayGlyph needs an explicit Unicode mapping');
 const fontIndex=new Map();
 const fontFunction=/static int fontIndex\(enum displayGlyph glyph\)\s*\{([\s\S]*?)\n\}/.exec(sdl);assert.ok(fontFunction);
 for(const m of fontFunction[1].matchAll(/case\s+(U_\w+)\s*:\s*return\s+(0x[\da-fA-F]+|\d+)\s*;/g)){
  assert.ok(defines.has(m[1]));assert.ok(!fontIndex.has(defines.get(m[1])),'Duplicate native SDL font slot');fontIndex.set(defines.get(m[1]),Number(m[2]));
 }
 assert.equal([...fontFunction[1].matchAll(/case\s+U_\w+\s*:/g)].length,fontIndex.size,'Unsupported native SDL fontIndex case');
 assert.match(fontFunction[1],/default:\s*brogueAssert\(code < 256\);\s*return code;/,'Unsupported native Original ASCII fallback');
 for(const [symbol,index]of [['U_UP_ARROW',0x90],['U_DOWN_ARROW',0x91]]){
  assert.ok(sdl.includes('if (glyph == G_'+symbol.slice(2)+') return 0x'+index.toString(16)+';'));assert.equal(fontIndex.get(defines.get(symbol)),index);
 }
 const perGlyphIndex=new Map();for(const [symbol]of glyphs){const code=unicode.get(symbol),index=fontIndex.get(code)??code;assert.ok(index>=0&&index<256,'Unsupported native font index '+symbol);perGlyphIndex.set(symbol,index);}
 return {glyphs,unicode,fontIndex,perGlyphIndex};
}
export function readNativeGlyphSources(){
 if(sourceCache)return sourceCache;
 const pin=process.env.BROGUE_ORIGINAL_SOURCE||path.join(gameRoot,'.local/upstream-sources/tmewett-BrogueCE-1ba4240'),files=['src/brogue/Rogue.h','src/platform/platform.h','src/platform/platformdependent.c','src/platform/sdl2-platform.c'],manifestBytes=readFileSync(path.join(gameRoot,'tests/upstream-1.15.1.json')),manifest=JSON.parse(manifestBytes);
 assert.equal(manifest.commit,'1ba4240b7a928ddf0ffb772717bf1d433cd63804');assert.equal(Object.keys(manifest.source_sha256).length,42);
 for(const [file,expected]of Object.entries(manifest.source_sha256))assert.equal(sha(readFileSync(path.join(pin,file))),expected,'Pinned CE1.15.1 source hash '+file);
 const current=files.map(f=>sourceFile(gameRoot,f)),original=files.map(f=>sourceFile(pin,f)),validated=validateNativeGlyphText(current,original);
 sourceCache={...validated.parsed,pin,upstream_pin_sha256:sha(manifestBytes),upstream_commit:manifest.commit,verified_pinned_sources:42,table_sha256:sha(Buffer.from(JSON.stringify(validated.table))),function_tokens_sha256:validated.function_tokens_sha256,source_sha256:files.map((file,i)=>({file,current_sha256:sha(Buffer.from(current[i])),pinned_sha256:sha(Buffer.from(original[i]))}))};return sourceCache;
}

// PNG 8-bit noninterlaced indexed/RGB/RGBA. Decode source bytes with Node/zlib,
// independently of browser decoding, the Rust image object and its mask cache.
export function decodePNG(bytes){
 assert.deepEqual(bytes.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
 let width,height,type,depth,interlace,palette,alpha;const idat=[];
 for(let at=8;at<bytes.length;){const length=bytes.readUInt32BE(at),kind=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+length);assert.ok(at+12+length<=bytes.length);
  if(kind==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];assert.equal(data[10],0);assert.equal(data[11],0);interlace=data[12];}
  else if(kind==='PLTE')palette=data;else if(kind==='tRNS')alpha=data;else if(kind==='IDAT')idat.push(data);else if(kind==='IEND')break;
  at+=12+length;
 }
 assert.equal(depth,8);assert.equal(interlace,0);assert.ok([2,3,6].includes(type));assert.ok(width>0&&height>0&&width*height<=16*1024*1024);
 const bpp=type===6?4:type===2?3:1,stride=width*bpp,filtered=inflateSync(Buffer.concat(idat));assert.equal(filtered.length,(stride+1)*height);
 const raw=Buffer.alloc(stride*height),paeth=(a,b,c)=>{const q=a+b-c,da=Math.abs(q-a),db=Math.abs(q-b),dc=Math.abs(q-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
 for(let y=0;y<height;y++){const f=filtered[y*(stride+1)];assert.ok(f<=4);for(let x=0;x<stride;x++){
  const at=y*stride+x,a=x>=bpp?raw[at-bpp]:0,b=y?raw[at-stride]:0,c=y&&x>=bpp?raw[at-stride-bpp]:0,
   add=f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c);raw[at]=(filtered[y*(stride+1)+1+x]+add)&255;
 }}
 if(type===3)assert.ok(palette&&palette.length%3===0);
 return {width,height,pixel(x,y){assert.ok(x>=0&&x<width&&y>=0&&y<height);const i=(y*width+x)*bpp;
  if(type===3){const k=raw[i];assert.ok(k*3+2<palette.length);return [palette[k*3],palette[k*3+1],palette[k*3+2],alpha?.[k]??255];}
  return [raw[i],raw[i+1],raw[i+2],type===6?raw[i+3]:255];
 }};
}
function atlas(){
 if(!atlasCache){const native=readNativeGlyphSources(),bytes=readFileSync(path.join(gameRoot,'web/assets/dot-tiles.png')),original=readFileSync(path.join(native.pin,'bin/assets/tiles.png'));
  assert.equal(sha(bytes),atlasSHA);assert.equal(sha(original),atlasSHA);assert.deepEqual(bytes,original);
  atlasCache=decodePNG(original);assert.deepEqual([atlasCache.width,atlasCache.height],[2048,5568]);
 }return atlasCache;
}
export function nativeGlyphCoverage(unicode,width,height){
 assert.ok(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0);
 const native=readNativeGlyphSources(),index=native.fontIndex.get(unicode);assert.ok(Number.isInteger(index),'No native SDL font slot for U+'+unicode.toString(16));
 const key=[index,width,height].join(':');if(coverageCache.has(key))return coverageCache.get(key);
 const image=atlas(),left=index%16*128,top=Math.floor(index/16)*232,coverage=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const x0=Math.floor(x*128/width),x1=Math.min(128,Math.max(x0+1,Math.floor((x+1)*128/width))),
   y0=Math.floor(y*232/height),y1=Math.min(232,Math.max(y0+1,Math.floor((y+1)*232/height)));let sum=0,count=0;
  for(let sy=y0;sy<y1;sy++)for(let sx=x0;sx<x1;sx++){const q=image.pixel(left+sx,top+sy);sum+=Math.floor((Math.max(...q.slice(0,3))*q[3]+127)/255);count++;}
  coverage.push(Math.floor((sum+Math.floor(count/2))/count));
 }
 assert.ok(coverage.some(v=>v>0)&&coverage.some(v=>v<255),'Native font slot must contain shape and transparent background component');
 const result={unicode,font_index:index,width,height,coverage,coverage_sha256:sha(Buffer.from(coverage)),atlas_sha256:atlasSHA};coverageCache.set(key,result);return result;
}
export function nativeOracleProvenance(){
 const source=readNativeGlyphSources();atlas();return {helper_file:'tests/original-glyph-mask.mjs',helper_sha256:sha(readFileSync(fileURLToPath(import.meta.url))),native_sources:source.source_sha256,upstream_pin_sha256:source.upstream_pin_sha256,upstream_commit:source.upstream_commit,verified_pinned_sources:source.verified_pinned_sources,extracted_table_sha256:source.table_sha256,normalized_function_tokens_sha256:source.function_tokens_sha256,atlas_actual_sha256:atlasSHA,atlas_pinned_sha256:atlasSHA,expected_source:'Pinned native atlas coverage and SDL fontIndex only; no actual canvas/production mask output',RGB_tolerance:2,alpha_exact:255};
}
export const colorChannel=n=>Math.floor((Math.max(0,Math.min(100,n))*255+50)/100);
export function nativeExpectedPixels(reference,foreground,background){
 const pixels=[];for(const a of reference.coverage)for(let channel=0;channel<4;channel++)pixels.push(channel===3?255:Math.round((foreground[channel]*a+background[channel]*(255-a))/255));return pixels;
}
export function assertNativeGlyphPixels({pixels,width,height,cell}){
 const native=readNativeGlyphSources(),glyph=[...native.glyphs].find(([,value])=>value===cell[0]);assert.ok(glyph,'Native public glyph required');assert.equal(native.unicode.get(glyph[0]),cell[1]);
 const reference=nativeGlyphCoverage(cell[1],width,height),fg=cell.slice(2,5).map(colorChannel),bg=cell.slice(5,8).map(colorChannel),expected=nativeExpectedPixels(reference,fg,bg);
 assert.equal(pixels.length,expected.length);let maxError=0,backing=0,ink=0;
 for(let i=0;i<pixels.length;i+=4){assert.equal(pixels[i+3],255,'Opaque C background required');const alpha=reference.coverage[i/4];if(alpha===0)backing++;else ink++;
  for(let channel=0;channel<3;channel++){const error=Math.abs(pixels[i+channel]-expected[i+channel]);maxError=Math.max(maxError,error);
   assert.ok(error<=2,'Native atlas shape/C color mismatch '+JSON.stringify({glyph:glyph[0],unicode:cell[1],font_index:reference.font_index,pixel:[i/4%width,Math.floor(i/4/width)],channel,alpha,expected:expected[i+channel],actual:pixels[i+channel],error}));
   if(alpha===0)assert.equal(pixels[i+channel],bg[channel],'Zero native coverage must retain exact C backing');
  }
 }
 return {oracle_ref:nativeOracleProvenance(),glyph:glyph[0],unicode:cell[1],font_index:reference.font_index,atlas_sha256:atlasSHA,coverage_sha256:reference.coverage_sha256,expected_pixels_sha256:sha(Buffer.from(expected)),actual_pixels_sha256:sha(Buffer.from(pixels)),maximum_channel_error:maxError,maximum_allowed_channel_error:2,alpha_exact:255,shape_pixels:ink,backing_pixels:backing,transparent_component_pixels:reference.coverage.filter(a=>a<255).length};
}
