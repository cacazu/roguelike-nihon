// Public native C glyph/palette -> independent atlas shape -> production Rust pixels.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
import {readNativeGlyphSources,assertNativeGlyphPixels,nativeOracleProvenance,colorChannel} from './original-glyph-mask.mjs';
const hash=a=>createHash('sha256').update(Buffer.from(a)).digest('hex'),native=readNativeGlyphSources();
const colors=[[25,100,25],[30,5,40],[2,5,2]],symbols=['G_FOLIAGE','G_BLOODWORT_STALK','G_FOLIAGE','G_FIRE','G_CHARM','G_TOTEM','G_BAD_MAGIC','G_GOOD_MAGIC','G_RING'],colorIndex=[0,1,2,0,1,2,1,2,0];
const samples=symbols.map((symbol,i)=>({symbol,x:55+2*(i%3),y:14+2*Math.floor(i/3),glyph:native.glyphs.get(symbol),unicode:native.unicode.get(symbol),color:colors[colorIndex[i]]}));
const background=[10,20,30].map(colorChannel).concat(255);
function checkPixels(capture,palette){
 const stats=[];for(let i=0;i<samples.length;i++)stats.push({symbol:samples[i].symbol,color:samples[i].color,...assertNativeGlyphPixels({pixels:capture.samples[i],width:capture.cw,height:capture.ch,cell:palette[i]})});
 for(const cell of capture.guards)for(let p=0;p<cell.length;p+=4)assert.deepEqual(cell.slice(p,p+4),background,'Glyph escaped its cell or opaque black replaced C backing');return stats;
}
export function createOriginalSymbolColorCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 return variants.flatMap(variant=>['pc-keyboard','touch'].map(input_path=>({id:variant+'-'+input_path+'-original-symbol-colors',variant,input_path,fixture_id:S.ORIGINAL_SYMBOL_COLORS,feature_ids:['cmd.graphics','cmd.rest'],targets:[],source_refs:['platform/sdl2-platform.c:fontIndex native Original slots','tests/original-glyph-mask.mjs:pinned native atlas independent shape oracle'],assertions:[
  'UI-only C palette publishes nine native glyph probes: Aries green/purple/dim, Fire/Charm/Totem/BadMagic/GoodMagic/Ring with the same three literal colors and non-black background. This proves no natural terrain, lighting, healing or new definition.',
  'All actual Rust Original canvas pixels must match independently decoded native SDL font atlas coverage and public C foreground/background within2 RGB units, alpha255 exact. Every sample and complete four-sided blank guard rectangle is within the actual viewport; the native player remains outside at61,17.',
  'PC and Chromium touch emulation use fit/14/24 zoom and Original/Dot/Illustration/Original DOM selection with unchanged full C state/RNG/wait serial/consumed inputs. Only one final real period advances C. Real Safari/phone remain unverified.'
 ],execute:async d=>{
  const before=await d.state(),wait=await d.wait(),events=(await d.trace()).native_trace.length;d.entry.pixel_checks=[];d.entry.oracle_ref=nativeOracleProvenance();
  assert.ok(before.x+21>60||before.x+21<54||before.y+3<13||before.y+3>19,'Real player must remain outside the complete uniform guard rectangle');
  for(const sample of samples){const cell=await d.publicCell(sample.x,sample.y);assert.deepEqual(cell.slice(0,8),[sample.glyph,sample.unicode,...sample.color,10,20,30]);}
  const palette=await Promise.all(samples.map(s=>d.publicCell(s.x,s.y)));d.entry.public_palette=palette;d.entry.sample_positions=samples;
  const player=await d.publicCell(before.x+21,before.y+3);assert.equal(player[0],native.glyphs.get('G_PLAYER'),'Palette must preserve the actual public player for center-player');
  const unchanged=async()=>{assert.deepEqual(await d.state(),before,'Display operation changed C state/RNG');assert.equal((await d.wait()).serial,wait.serial);assert.equal((await d.trace()).native_trace.length,events);};
  for(const zoom of ['fit','14','24']){
   await d.page.locator('#zoom').selectOption(zoom);await unchanged();
   if(input_path==='touch')await d.page.locator('#center-player').tap();else await d.page.locator('#center-player').click();await unchanged();let original;
   const modeHashes=[];
   for(const [step,mode]of ['original','dot','illustration','original'].entries()){
    await d.page.locator('#display-mode').selectOption(mode);await d.page.waitForFunction(value=>document.querySelector('#game').dataset.displayMode===value,mode);await unchanged();
    const capture=await d.page.evaluate(samples=>{const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),cw=canvas.width/100,ch=canvas.height/34,canvasRect=canvas.getBoundingClientRect(),viewport=document.querySelector('#viewport'),v=viewport.getBoundingClientRect(),vv=visualViewport;
     const cell=(x,y)=>Array.from(ctx.getImageData(x*cw,y*ch,cw,ch).data),guards=[],clip={left:Math.max(v.left+viewport.clientLeft,0,vv?.offsetLeft??0),top:Math.max(v.top+viewport.clientTop,0,vv?.offsetTop??0),right:Math.min(v.left+viewport.clientLeft+viewport.clientWidth,innerWidth,(vv?.offsetLeft??0)+(vv?.width??innerWidth)),bottom:Math.min(v.top+viewport.clientTop+viewport.clientHeight,innerHeight,(vv?.offsetTop??0)+(vv?.height??innerHeight))},rect={left:canvasRect.left+54*canvasRect.width/100,right:canvasRect.left+61*canvasRect.width/100,top:canvasRect.top+13*canvasRect.height/34,bottom:canvasRect.top+20*canvasRect.height/34};
     for(let y=13;y<=19;y++)for(let x=54;x<=60;x++)if(!samples.some(s=>s.x===x&&s.y===y))guards.push(cell(x,y));
     return {cw,ch,viewport_width:viewport.clientWidth,viewport_height:viewport.clientHeight,clip,rect,samples:samples.map(s=>cell(s.x,s.y)),guards};
    },samples);
    assert.ok(capture.rect.left>=capture.clip.left&&capture.rect.right<=capture.clip.right&&capture.rect.top>=capture.clip.top&&capture.rect.bottom<=capture.clip.bottom,'All nine samples and every four-sided blank guard must lie completely within the actual viewport');
    const expectedWidth=zoom==='fit'?Math.max(3,Math.floor(Math.max(100,capture.viewport_width)/100)):Number(zoom);
    assert.equal(capture.cw,expectedWidth,'Zoom must change actual canvas cell width');assert.equal(capture.ch,Math.max(Math.floor(expectedWidth*11/7),expectedWidth+1),'Zoom must change actual canvas cell height');assert.equal(capture.guards.length,40);
    const signature=hash(capture.samples.flat());modeHashes.push(signature);const entry={zoom,mode,step,cell_width:capture.cw,cell_height:capture.ch,viewport_width:capture.viewport_width,viewport_height:capture.viewport_height,clip:capture.clip,guard_rect:capture.rect,guard_cells:capture.guards.length,sha256:signature};
    if(mode==='original'){entry.stats=checkPixels(capture,palette);if(original)assert.equal(signature,original,'Returning to Original changed fixed C palette pixels');else original=signature;}
    d.entry.pixel_checks.push(entry);await d.screenshot('palette-'+zoom+'-'+step+'-'+mode);await unchanged();
   }
   assert.equal(new Set(modeHashes.slice(0,3)).size,3,'Three actual display modes must remain distinct');
  }
  d.effect(()=>assert.equal(d.entry.pixel_checks.length,12));await d.input('.');await d.settle();assert.equal((await d.state()).turn,before.turn+1);
 }})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'original-symbol-colors',createCases:createOriginalSymbolColorCases,filter:process.env.BROGUE_ORIGINAL_SYMBOL_COLORS});
