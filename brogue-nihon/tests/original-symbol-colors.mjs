// Public C palette -> production Rust pixels; no terrain effect is fabricated.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S} from './fixture-browser.mjs';
const hash=a=>createHash('sha256').update(Buffer.from(a)).digest('hex');
const samples=[{x:59,glyph:200,color:[25,100,25]},{x:61,glyph:225,color:[30,5,40]},{x:63,glyph:200,color:[2,5,2]}];
const background=[26,51,77,255],channel=v=>Math.floor((v*255+50)/100);
function checkPixels(capture){
 const stats=[];
 for(let i=0;i<samples.length;i++){
  const foreground=samples[i].color.map(channel),pixels=capture.samples[i];let ink=0,clear=0,maximumCoverage=0;
  const reference=[0,1,2].sort((a,b)=>Math.abs(foreground[b]-background[b])-Math.abs(foreground[a]-background[a]))[0];
  for(let p=0;p<pixels.length;p+=4){const pixel=pixels.slice(p,p+4);assert.equal(pixel[3],255);if(pixel.every((v,c)=>v===background[c])){clear++;continue;}ink++;
   const alpha=(pixel[reference]-background[reference])/(foreground[reference]-background[reference]);maximumCoverage=Math.max(maximumCoverage,alpha);assert.ok(alpha>=-.01&&alpha<=1.01);
   for(let c=0;c<3;c++){assert.ok(Math.abs(pixel[c]-(background[c]+alpha*(foreground[c]-background[c])))<=2,`RGB must share alpha for ${samples[i].color}: ${pixel}`);assert.ok(pixel[c]>=Math.min(background[c],foreground[c])-1&&pixel[c]<=Math.max(background[c],foreground[c])+1);}
  }
  assert.ok(ink>0&&clear>0);assert.ok(maximumCoverage>.1,'C foreground must cause a visible response, not a fixed near-background color');stats.push({color:samples[i].color,ink,clear,maximumCoverage,sha256:hash(pixels)});
 }
 for(const cell of capture.guards)for(let p=0;p<cell.length;p+=4)assert.deepEqual(cell.slice(p,p+4),background,'Symbol escaped its cell or opaque black replaced C background');
 return stats;
}
export function createOriginalSymbolColorCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 return variants.flatMap(variant=>['pc-keyboard','touch'].map(input_path=>({id:variant+'-'+input_path+'-original-symbol-colors',variant,input_path,fixture_id:S.ORIGINAL_SYMBOL_COLORS,feature_ids:['cmd.graphics','cmd.rest'],targets:[],source_refs:['platform/sdl2-platform.c:fontIndex(U_ARIES)=0x84','rust/src/presentation.rs:Original Aries mask'],assertions:[
  'Explicit UI-only C palette publishes foliage/bloodwort Aries with green/purple/dim foreground and non-black background. This does not prove natural terrain placement, healing, lighting or all symbols.',
  'Actual production Rust canvas in Original has common-alpha C foreground composition, nonzero response, transparent backing and four-sided cell bounds. PC and Chromium touch emulation each use fit/14/24 zoom and Original/Dot/Illustration/Original DOM selections with identical C state, RNG, wait serial and consumed event count.',
  'One actual rest after display checks drives original C; native comparison covers state/input parity, not canvas pixels. Real phone/Safari remain unverified.'
 ],execute:async d=>{
  const before=await d.state(),wait=await d.wait(),events=(await d.trace()).native_trace.length;d.entry.pixel_checks=[];
  for(const sample of samples){const cell=await d.publicCell(sample.x,14);assert.deepEqual(cell.slice(0,8),[sample.glyph,0x2648,...sample.color,10,20,30]);}
  d.entry.public_palette=await Promise.all(samples.map(s=>d.publicCell(s.x,14)));
  const unchanged=async()=>{assert.deepEqual(await d.state(),before,'Display operation changed C state/RNG');assert.equal((await d.wait()).serial,wait.serial);assert.equal((await d.trace()).native_trace.length,events);};
  for(const zoom of ['fit','14','24']){
   await d.page.locator('#zoom').selectOption(zoom);await unchanged();
   if(input_path==='touch')await d.page.locator('#center-player').tap();else await d.page.locator('#center-player').click();await unchanged();
   const visible=await d.page.evaluate(xs=>{const c=document.querySelector('#game').getBoundingClientRect(),v=document.querySelector('#viewport').getBoundingClientRect();return xs.every(x=>c.x+x*c.width/100>=v.x&&c.x+(x+1)*c.width/100<=v.right&&c.y+14*c.height/34>=v.y&&c.y+15*c.height/34<=v.bottom);},samples.map(s=>s.x));assert.equal(visible,true,'All palette cells must be inside the actual viewport before screenshots');let original;
   const modeHashes=[];
   for(const [step,mode]of ['original','dot','illustration','original'].entries()){
    await d.page.locator('#display-mode').selectOption(mode);await d.page.waitForFunction(value=>document.querySelector('#game').dataset.displayMode===value,mode);await unchanged();
    const capture=await d.page.evaluate(xs=>{const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),cw=canvas.width/100,ch=canvas.height/34;const cell=(x,y)=>Array.from(ctx.getImageData(x*cw,y*ch,cw,ch).data),guards=[];for(let y=13;y<=15;y++)for(let x=58;x<=64;x++)if(y!==14||!xs.includes(x))guards.push(cell(x,y));return {cw,ch,viewport_width:document.querySelector('#viewport').clientWidth,samples:xs.map(x=>cell(x,14)),guards};},samples.map(s=>s.x));
    const expectedWidth=zoom==='fit'?Math.max(3,Math.floor(Math.max(100,capture.viewport_width)/100)):Number(zoom);
    assert.equal(capture.cw,expectedWidth,'Selected zoom must change actual canvas cell width');assert.equal(capture.ch,Math.max(Math.floor(expectedWidth*11/7),expectedWidth+1),'Selected zoom must change actual canvas cell height');const signature=hash(capture.samples.flat());modeHashes.push(signature);
    const entry={zoom,mode,step,cell_width:capture.cw,cell_height:capture.ch,sha256:signature};
    if(mode==='original'){entry.stats=checkPixels(capture);if(original)assert.equal(signature,original,'Returning to Original changed fixed public palette pixels');else original=signature;}
    d.entry.pixel_checks.push(entry);await d.screenshot('palette-'+zoom+'-'+step+'-'+mode);await unchanged();
   }
   assert.equal(new Set(modeHashes.slice(0,3)).size,3,'Three actual display modes must produce distinct plant images');
  }
  d.effect(()=>assert.equal(d.entry.pixel_checks.length,12));await d.input('.');await d.settle();assert.equal((await d.state()).turn,before.turn+1);
 }})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'original-symbol-colors',createCases:createOriginalSymbolColorCases,filter:process.env.BROGUE_ORIGINAL_SYMBOL_COLORS});
