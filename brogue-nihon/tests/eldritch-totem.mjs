// Native machine activation, one summoned cohort and bound leader death.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S,root} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot,maskC} from './inventory-features.mjs';
import {readOriginalHordeCatalogs} from './horde-mutations.mjs';
import {publicText} from './knowledge-feats.mjs';
import {readNativeGlyphSources,assertNativeGlyphPixels,nativeOracleProvenance,colorChannel} from './original-glyph-mask.mjs';

const physical=({ready,...state})=>state,key=c=>c.x+','+c.y;
const words=s=>s.replace(/\s+/g,' ').trim().toLowerCase();
const digest=v=>createHash('sha256').update(v).digest('hex');
const projection=s=>({turn:s.turn,absoluteTurnNumber:s.absoluteTurnNumber,rng:s.rng,x:s.x,y:s.y,hp:s.hp,depth:s.depth,
 statuses:s.statuses,maxStatuses:s.maxStatuses,playerCell:s.playerCell,spawnCell:s.spawnCell,mapMetrics:s.mapMetrics,
 nativeAI:s.nativeAI,...(s.portal?{portal:s.portal}:{}),stealthRange:s.stealthRange,
 gases:s.cells.filter(c=>c.gas&&c.volume>0),surfaces:s.cells.filter(c=>c.surface),monsters:s.monsters});
function readLightEnum(base){
 const body=/enum lightType\s*\{([\s\S]*?)\};/.exec(maskC(readFileSync(path.join(base,'src/brogue/Rogue.h'),'utf8')));assert.ok(body);
 const result={};let value=-1;for(const f of body[1].split(',')){if(!f.trim())continue;const m=/^\s*(\w+)(?:\s*=\s*(\d+))?\s*$/.exec(f);assert.ok(m,'Unsupported light enum '+f);value=m[2]===undefined?value+1:Number(m[2]);result[m[1]]=value;}return result;
}
// Read only native data. No C rule/helper, preprocessor or eval is executed.
export function readTotemTerrainCatalog(inv,{pinned=process.env.BROGUE_ORIGINAL_SOURCE||path.join(root,'.local/upstream-sources/tmewett-BrogueCE-1ba4240')}={}){
 const types=inv.definitions.tileType.entries.filter(e=>e.classification==='primitive'),expected=inv.tables.find(t=>t.base_table==='tileCatalog').initialized_rows;
 assert.equal(expected,215);assert.equal(types.length,expected);assert.ok(types.every((e,i)=>e.value===i));
 const constants=domain=>new Map(inv.definitions[domain].entries.map(e=>[e.symbol,e.value])),terrain=constants('terrainFlagCatalog'),mechanical=constants('terrainMechanicalFlagCatalog');
 function numeric(field,known){const clean=field.replace(/\s/g,''),tokens=clean.match(/0[xX][0-9a-fA-F]+|\d+|[A-Za-z_]\w*|[()|]/g)??[];assert.equal(tokens.join(''),clean,'Unsupported tile flag expression '+field);let at=0;
  function atom(){const t=tokens[at++];if(t==='('){const v=or();assert.equal(tokens[at++],')','Unclosed tile flag expression');return v;}if(/^(?:0[xX][0-9a-fA-F]+|\d+)$/.test(t??''))return Number(t);assert.ok(known.has(t),'Unknown tile flag constant '+t);return known.get(t);}
  function or(){let v=atom();while(tokens[at]==='|'){at++;v|=atom();}return v>>>0;}const v=or();assert.equal(at,tokens.length,'Unused tile flag expression tokens');assert.ok(Number.isSafeInteger(v));return v;
 }
 const parse=base=>{const raw=readFileSync(path.join(base,'src/brogue/Globals.c')),text=maskC(raw.toString('utf8'),true),matches=[...text.matchAll(/\btileCatalog\s*\[[^\]]*\]\s*=\s*\{/g)];assert.equal(matches.length,1);const start=matches[0].index+matches[0][0].length;let depth=1,end=start,rowStart=null,between=start;const rows=[];
  for(;depth&&end<text.length;end++){const c=text[end];if(c==='{'){if(depth===1){assert.ok(/^[\s,]*$/.test(text.slice(between,end)),'Unsupported tile initializer text');rowStart=end+1;}depth++;}else if(c==='}'){depth--;if(depth===1){const fields=[];let parens=0,from=rowStart;for(let i=rowStart;i<end;i++){if(text[i]==='(')parens++;else if(text[i]===')'){parens--;assert.ok(parens>=0);}else if(text[i]===','&&!parens){fields.push(text.slice(from,i));from=i+1;}else assert.ok(text[i]!=='{'&&text[i]!=='}','Nested tile field initializer');}fields.push(text.slice(from,end));assert.equal(parens,0);assert.equal(fields.length,14,'Unsupported tile initializer field count');const index=rows.length;assert.ok(index<expected);rows.push({index,symbol:types[index].symbol,terrainFlags:numeric(fields[10],terrain),mechFlags:numeric(fields[11],mechanical)});between=end+1;}else if(depth===0)assert.ok(/^[\s,]*$/.test(text.slice(between,end)),'Unsupported trailing tile initializer');}}
  assert.equal(depth,0);assert.equal(rows.length,expected);return {rows,source_sha256:digest(raw)};
 };
 const original=parse(pinned),current=parse(root);assert.deepEqual(current.rows,original.rows,'Current tile metadata differs from pinned native catalog');return {tiles:original.rows,terrainFlags:Object.fromEntries(terrain),mechFlags:Object.fromEntries(mechanical),table_sha256:digest(JSON.stringify(original.rows)),source_sha256:{pinned_Globals:original.source_sha256,current_Globals:current.source_sha256}};
}
export function assertTotemCellTerrainMetadata(cell,catalog){
 const layers=['dungeon','liquid','surface','gas'].map(layer=>{const id=cell[layer];assert.ok(Number.isSafeInteger(id)&&id>=0&&id<catalog.tiles.length,'Unsupported observed '+layer+' tile ID');const tile=catalog.tiles[id];assert.equal(tile.index,id);return tile;});
 const terrainFlags=layers.reduce((v,t)=>v|t.terrainFlags,0)>>>0,mechFlags=layers.reduce((v,t)=>v|t.mechFlags,0)>>>0;
 assert.equal(cell.terrainFlags,terrainFlags,'Observed four-layer terrainFlags contradiction '+JSON.stringify({cell:[cell.x,cell.y],layers:layers.map(t=>t.symbol),expected:terrainFlags,actual:cell.terrainFlags}));assert.equal(cell.mechFlags,mechFlags,'Observed four-layer mechFlags contradiction '+JSON.stringify({cell:[cell.x,cell.y],layers:layers.map(t=>t.symbol),expected:mechFlags,actual:cell.mechFlags}));
 return {terrainFlags,mechFlags,terrainPassable:!(terrainFlags&catalog.terrainFlags.T_OBSTRUCTS_PASSABILITY),diagonalPassable:!(terrainFlags&catalog.terrainFlags.T_OBSTRUCTS_DIAGONAL_MOVEMENT)};
}
export function assertTotemObservedTerrain({state,catalog}){
 const rows=[...(state.cells??[]),state.playerCell,state.spawnCell,...(state.surfaces??[]),...(state.gases??[]),state.nativeAI?.eldritchTotem?.plateCell,state.nativeAI?.eldritchTotem?.retreatCell].filter(Boolean),seen=new Map();assert.ok(rows.length>0,'Missing observed terrain rows');
 for(const c of rows){assertTotemCellTerrainMetadata(c,catalog);const value=[c.dungeon,c.liquid,c.surface,c.gas,c.terrainFlags,c.mechFlags];if(seen.has(key(c)))assert.deepEqual(value,seen.get(key(c)),'Same-coordinate observed terrain aliases disagree');seen.set(key(c),value);}return rows;
}

async function publicPixels(d,x,y,raw,unicode,{empty=false,totem=false}={}){
 const cell=await d.publicCell(x+21,y+3);assert.deepEqual(cell.slice(0,2),[raw,unicode]);
 const view=await d.page.evaluate(({x,y})=>{
  const c=document.querySelector('#game'),r=c.getBoundingClientRect(),v=document.querySelector('#viewport'),q=v.getBoundingClientRect(),vv=visualViewport;
  const cw=r.width/100,ch=r.height/34;return {cw,ch,pixel_width:c.width/100,pixel_height:c.height/34,
   rect:{left:r.left+x*cw,right:r.left+(x+1)*cw,top:r.top+y*ch,bottom:r.top+(y+1)*ch},
   clip:{left:Math.max(q.left+v.clientLeft,0,vv?.offsetLeft??0),top:Math.max(q.top+v.clientTop,0,vv?.offsetTop??0),
    right:Math.min(q.left+v.clientLeft+v.clientWidth,innerWidth,(vv?.offsetLeft??0)+(vv?.width??innerWidth)),
    bottom:Math.min(q.top+v.clientTop+v.clientHeight,innerHeight,(vv?.offsetTop??0)+(vv?.height??innerHeight))},
   pixels:Array.from(c.getContext('2d').getImageData(x*c.width/100,y*c.height/34,c.width/100,c.height/34).data)};
 },{x:x+21,y:y+3});
 assert.ok(view.cw>=10&&view.ch>=14,'Public witness requires readable cells');
 assert.ok(view.rect.left>=view.clip.left&&view.rect.right<=view.clip.right&&view.rect.top>=view.clip.top&&view.rect.bottom<=view.clip.bottom,'Whole public cell must fit actual viewport/window');
 const fg=cell.slice(2,5).map(colorChannel),bg=cell.slice(5,8).map(colorChannel);let ink=0,backing=0;
 for(let i=0;i<view.pixels.length;i+=4){assert.equal(view.pixels[i+3],255);const pixel=view.pixels.slice(i,i+3);
  if(pixel.every((v,j)=>v===bg[j]))backing++;else ink++;
  for(let j=0;j<3;j++)assert.ok(pixel[j]>=Math.min(fg[j],bg[j])-1&&pixel[j]<=Math.max(fg[j],bg[j])+1,'Foreign ink outside public C palette');
 }
 assert.ok(backing>0);if(!empty)assert.ok(ink>0,'Public glyph must produce its own ink');
 const shape=totem?assertNativeGlyphPixels({pixels:view.pixels,width:view.pixel_width,height:view.pixel_height,cell}):null;
 const pixels_sha256=digest(Buffer.from(view.pixels));delete view.pixels;
 return {native:{x,y},public:{x:x+21,y:y+3},cell,geometry:view,foreground_rgb:fg,background_rgb:bg,ink_pixels:ink,backing_pixels:backing,pixels_sha256,palette_bounds_pass:true,...(shape?{native_original_shape:shape}:{})};
}

// Pure guards shared by the real saved observations and static counterexamples.
const positiveRect=(r,label)=>{assert.ok(r&&[r.left,r.right,r.top,r.bottom].every(Number.isFinite)&&r.right>r.left&&r.bottom>r.top,label+' must have positive laid-out area');};
function cssColor(value){const m=/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(value??'');assert.ok(m,'Unsupported computed CSS color '+value);const a=m[4]===undefined?1:m[4].endsWith('%')?Number(m[4].slice(0,-1))/100:Number(m[4]);const rgb=m.slice(1,4).map(Number);assert.ok(rgb.every(v=>v>=0&&v<=255)&&a>=0&&a<=1);return {rgb,alpha:a};}
// Mobile advance geometry: exact source/range bindings, no tolerance or clipping mask.
export function assertTotemMobileCaptionGeometry(p){
 const edges=['left','right','top','bottom'],eq=(a,b)=>edges.every(k=>a[k]===b[k]),inside=(r,c)=>r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom,
  positive=r=>r.right>r.left&&r.bottom>r.top,rectangle=(r,label)=>{assert.ok(r&&edges.every(k=>Number.isFinite(r[k]))&&r.right>=r.left&&r.bottom>=r.top,label+' invalid rectangle');},
  bbox=rs=>({left:Math.min(...rs.map(r=>r.left)),right:Math.max(...rs.map(r=>r.right)),top:Math.min(...rs.map(r=>r.top)),bottom:Math.max(...rs.map(r=>r.bottom))});
 assert.equal(p.kind,'actual production mobile message mirror');const M=p.measurement,L=M?.after_scroll,D=L?.character_ranges,A=L?.ancestors;
 assert.ok(M&&L&&D&&Array.isArray(A)&&A.length>0,'Missing actual after-scroll caption data');assert.ok(!D.measurement_error);assert.equal(A[0].id,'mobile-messages');assert.ok(eq(p.panel,L.panel)&&eq(L.panel,A[0].rect));
 const vv=L.visualViewport,w=L.window,owner=A[0],clip={left:Math.max(L.panel.left+owner.clientLeft,0,vv?.offsetLeft??0),right:Math.min(L.panel.left+owner.clientLeft+owner.clientWidth,w.innerWidth,(vv?.offsetLeft??0)+(vv?.width??w.innerWidth)),top:Math.max(L.panel.top+owner.clientTop,0,vv?.offsetTop??0),bottom:Math.min(L.panel.top+owner.clientTop+owner.clientHeight,w.innerHeight,(vv?.offsetTop??0)+(vv?.height??w.innerHeight))};
 assert.equal(M.clip_steps?.length,A.length+1);assert.ok(eq(M.clip_steps[0].after,clip));assert.equal(p.ancestors.length,A.length);
 const aliases={display:'display',visibility:'visibility',opacity:'opacity',content_visibility:'contentVisibility',filter:'filter',clip_path:'clipPath',mask_image:'maskImage',background_color:'backgroundColor'};
 for(let i=0;i<A.length;i++){const a=A[i],css=a.computed,legacy=p.ancestors[i],step=M.clip_steps[i+1];assert.equal(legacy.tag,a.tag);assert.equal(legacy.id,a.id);for(const[k,v]of Object.entries(aliases))assert.equal(legacy[k],css[v]);assert.ok(eq(step.before,clip));assert.deepEqual(step.owner,{tag:a.tag,id:a.id});
  if(['hidden','clip','scroll','auto'].includes(css.overflowX)){clip.left=Math.max(clip.left,a.rect.left+a.clientLeft);clip.right=Math.min(clip.right,a.rect.left+a.clientLeft+a.clientWidth);}if(['hidden','clip','scroll','auto'].includes(css.overflowY)){clip.top=Math.max(clip.top,a.rect.top+a.clientTop);clip.bottom=Math.min(clip.bottom,a.rect.top+a.clientTop+a.clientHeight);}assert.ok(eq(step.after,clip));
 }
 assert.ok(eq(clip,p.clip),'Caption clip is not its actual ancestor/viewport intersection');positiveRect(clip,'derived caption clip');assert.equal(p.color,owner.computed.color);assert.equal(p.text_fill_color,owner.computed.webkitTextFillColor);assert.equal(p.font,owner.computed.font);assert.equal(p.scrollTop,L.scrollTop);
 const whole=L.client_rects;assert.ok(Array.isArray(whole));for(const r of whole)rectangle(r,'whole fragment');const positiveWhole=whole.filter(positive);assert.ok(positiveWhole.length>0);assert.equal(p.client_rects.length,positiveWhole.length);p.client_rects.forEach((r,i)=>assert.ok(eq(r,positiveWhole[i])));assert.ok(eq(p.rect,L.range)&&eq(p.rect,bbox(positiveWhole)),'Whole caption bbox/fragment aliases disagree');
 const text=D.node_text,start=D.match?.utf16_start,end=D.match?.utf16_end,match=D.match?.text;assert.equal(D.node?.type,3);assert.equal(D.node.is_connected,true);assert.equal(D.node.parent?.id,'mobile-messages');assert.equal(typeof text,'string');assert.equal(text,D.mirror_text);assert.equal(text,M.mirror_text);assert.equal(D.node.utf16_length,text.length);assert.ok(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start&&end<=text.length);assert.equal(text.slice(start,end),match);assert.equal(match,p.text);assert.equal(D.match.utf16_length,match.length);assert.deepEqual(M.range_offsets,{start,end});assert.equal(M.match.index,start);assert.equal(M.match.text,match);assert.equal(D.node_slice_matches,true);
 const C=[],W=[];for(let at=0;at<match.length;){const point=match.codePointAt(at),length=point>0xffff?2:1,ch=match.slice(at,at+length);assert.ok(point<0xd800||point>0xdfff,'Invalid scalar in required caption');C.push({at,end:at+length,point,ch,space:/\s/u.test(ch)});at+=length;}
 assert.equal(D.characters.length,C.length);assert.equal(D.reconstructed_match,match);assert.equal(D.utf16_coverage_matches,true);
 const checkedRange=(item,label)=>{assert.ok(!item.measurement_error,label+' measurement error');rectangle(item.bounding_rect,label+' bbox');assert.ok(Array.isArray(item.client_rects)&&Array.isArray(item.hit_tests));assert.equal(item.hit_tests.length,item.client_rects.length);const positives=[];
  for(let j=0;j<item.client_rects.length;j++){const r=item.client_rects[j],hit=item.hit_tests[j];rectangle(r,label+' client');assert.equal(hit.rect_index,j);if(positive(r)){assert.equal(hit.x,(r.left+r.right)/2);assert.equal(hit.y,(r.top+r.bottom)/2);assert.equal(hit.contained,true,label+' actual point is occluded');assert.ok(hit.hit&&typeof hit.hit.tag==='string');positives.push(r);}else assert.equal(hit.not_sampled,'zero-area rectangle');}return positives;
 };
 for(let i=0;i<C.length;i++){const c=C[i],r=D.characters[i],kind=c.point===32?'ASCII_SPACE':c.point===9?'TAB':c.point===10?'LF':c.point===13?'CR':c.point===160?'NBSP':c.space?'OTHER_ECMASCRIPT_WHITESPACE':'NON_WHITESPACE';
  assert.deepEqual([r.relative_utf16_start,r.relative_utf16_end,r.utf16_start,r.utf16_end,r.requested_utf16_start,r.requested_utf16_end,r.actual_utf16_start,r.actual_utf16_end],[c.at,c.end,start+c.at,start+c.end,start+c.at,start+c.end,start+c.at,start+c.end]);assert.deepEqual(r.utf16_units,Array.from({length:c.end-c.at},(_,j)=>c.ch.charCodeAt(j)));assert.equal(r.code_point,c.point);assert.equal(r.unicode,'U+'+c.point.toString(16).toUpperCase().padStart(4,'0'));assert.equal(r.character,c.ch);assert.equal(r.escaped_character,JSON.stringify(c.ch));assert.equal(r.range_text,c.ch);assert.equal(r.invalid_scalar,false);
  assert.deepEqual(r.whitespace,{ecmascript:c.space,kind,unicode_separator:/\p{Z}/u.test(c.ch),unicode_mark:/\p{M}/u.test(c.ch),unicode_format:/\p{Cf}/u.test(c.ch),unicode_control:/\p{Cc}/u.test(c.ch)});c.record=r;c.positive=checkedRange(r,'character '+i);if(!c.space){assert.ok(c.positive.length>0);assert.ok(inside(r.bounding_rect,clip)&&c.positive.every(q=>inside(q,clip)),'Non-whitespace caption character clipped');}
 }
 const wordMatches=[...match.matchAll(/\S+/gu)];assert.equal(D.word_runs.length,wordMatches.length);for(let i=0;i<wordMatches.length;i++){const word=wordMatches[i],at=word.index,to=at+word[0].length,r=D.word_runs[i],prior=at===0?[...text.slice(0,start)].at(-1)??null:null,next=to===match.length?[...text.slice(end)][0]??null:null;
  assert.equal(r.text,word[0]);assert.deepEqual([r.relative_utf16_start,r.relative_utf16_end,r.utf16_start,r.utf16_end,r.requested_utf16_start,r.requested_utf16_end,r.actual_utf16_start,r.actual_utf16_end],[at,to,start+at,start+to,start+at,start+to,start+at,start+to]);assert.equal(r.range_text,word[0]);assert.deepEqual(r.codepoint_row_indices,C.flatMap((c,j)=>c.at>=at&&c.end<=to?[j]:[]));assert.deepEqual([r.starts_at_match_boundary,r.ends_at_match_boundary,r.preceding_outside_character,r.following_outside_character,r.start_cut_by_match,r.end_cut_by_match],[at===0,to===match.length,prior,next,prior!==null&&!/\s/u.test(prior),next!==null&&!/\s/u.test(next)]);const positive=checkedRange(r,'word '+i);assert.ok(positive.length>0&&inside(r.bounding_rect,clip)&&positive.every(q=>inside(q,clip)),'Caption word run clipped');W.push({at,end:to,record:r,positive});
 }
 const outside=C.filter(c=>!inside(c.record.bounding_rect,clip)||c.positive.some(q=>!inside(q,clip))),outsideWhole=positiveWhole.filter(q=>!inside(q,clip));
 if(outside.length===0&&outsideWhole.length===0){assert.ok(inside(p.rect,clip));return {rule:'ordinary strict mobile geometry',old_whole_strict:true,qualified_space:null};}
 assert.equal(outside.length,1,'Exactly one outside source U0020 is supported');assert.equal(outsideWhole.length,1,'Exactly one outside whole fragment is supported');const S=outside[0],j=C.indexOf(S),r=S.record;assert.equal(S.point,32);assert.equal(S.end-S.at,1);assert.ok(j>0&&j<C.length-1&&!C[j-1].space&&!C[j+1].space,'Hanging space must have immediate internal non-whitespace neighbors');assert.equal(S.positive.length,1);const sr=S.positive[0];assert.ok(eq(sr,r.bounding_rect)&&eq(sr,outsideWhole[0]),'Outside whole fragment is not the exact source space advance box');assert.ok(sr.left>=clip.left&&sr.left<clip.right&&sr.right>clip.right&&sr.top>=clip.top&&sr.bottom<=clip.bottom,'Only right hanging advance is supported');
 const prev=C[j-1],next=C[j+1],pw=W.find(w=>w.end===S.at),nw=W.find(w=>w.at===S.end);assert.ok(pw&&nw&&pw.at>0&&nw.end<match.length,'Space support word runs must be internal and uncut');assert.ok(!pw.record.start_cut_by_match&&!pw.record.end_cut_by_match&&!nw.record.start_cut_by_match&&!nw.record.end_cut_by_match);assert.equal(text.slice(start+pw.end,start+nw.at),' ');
 const pc=prev.positive.at(-1),pr=pw.positive.at(-1),nc=next.positive[0],nr=nw.positive[0];assert.ok(pc&&pr&&nc&&nr);assert.ok([pc,pr].every(q=>q.top===sr.top&&q.bottom===sr.bottom&&q.right===sr.left),'Previous word/terminal glyph is not adjacent on the space line');assert.ok(nc.top===nr.top&&nc.bottom===nr.bottom&&nc.top>=sr.bottom&&nc.top>sr.top,'Next word is not a lower soft-wrap line');
 assert.equal(owner.computed.whiteSpace,'pre-wrap');for(const a of A){const css=a.computed;assert.equal(css.writingMode,'horizontal-tb');assert.equal(css.direction,'ltr');assert.equal(css.transform,'none');assert.equal(css.textDecorationLine,'none');assert.equal(css.textShadow,'none');assert.equal(css.webkitTextStrokeWidth,'0px');assert.equal(css.textEmphasisStyle,'none');assert.equal(css.textTransform,'none');}
 for(const c of C)if(c!==S)assert.ok(inside(c.record.bounding_rect,clip)&&c.positive.every(q=>inside(q,clip)),'Another character advance is outside clip');assert.ok(p.rect.left>=clip.left&&p.rect.top>=clip.top&&p.rect.bottom<=clip.bottom&&p.rect.right===sr.right);return {rule:'single source U0020 soft-wrap advance',old_whole_strict:false,qualified_space:{utf16_start:r.utf16_start,utf16_end:r.utf16_end,rect:sr,previous_word:pw.record.text,next_word:nw.record.text}};
}
export function assertTotemMessageVisibility(p){
 assert.ok(p,'Native caption is not visible in its actual production UI');positiveRect(p.rect,'caption range');positiveRect(p.clip,'caption clip');
 const mobile=p.kind==='actual production mobile message mirror'?assertTotemMobileCaptionGeometry(p):null;
 if(mobile)p.geometry_classification=mobile;else assert.ok(p.rect.left>=p.clip.left&&p.rect.right<=p.clip.right&&p.rect.top>=p.clip.top&&p.rect.bottom<=p.clip.bottom,'Required caption is clipped by actual viewport/window');
 if(p.kind==='actual production mobile message mirror'){
  positiveRect(p.panel,'message panel');assert.ok(p.content_width>0&&p.content_height>0);assert.ok(Array.isArray(p.client_rects)&&p.client_rects.length>0);
  for(const r of p.client_rects){positiveRect(r,'rendered caption fragment');assert.ok(r.left>=p.clip.left&&r.right<=p.clip.right&&r.top>=p.clip.top&&r.bottom<=p.clip.bottom||mobile.qualified_space&&['left','right','top','bottom'].every(k=>r[k]===mobile.qualified_space.rect[k]),'A caption fragment is clipped');}
  assert.ok(Array.isArray(p.ancestors)&&p.ancestors.length>0);let opacity=1;
  for(const a of p.ancestors){assert.notEqual(a.display,'none','Caption ancestor display:none');assert.equal(a.visibility,'visible','Caption ancestor hidden/collapse');assert.notEqual(a.content_visibility,'hidden');assert.ok(Number.isFinite(Number(a.opacity))&&Number(a.opacity)>0);opacity*=Number(a.opacity);assert.equal(a.filter,'none','Unsupported filtered caption ancestor');assert.equal(a.clip_path,'none');assert.equal(a.mask_image,'none');}
  assert.ok(opacity>0&&p.hit_test===true,'Caption is transparent or occluded');const color=cssColor(p.color),fill=cssColor(p.text_fill_color);assert.ok(color.alpha>0&&fill.alpha>0,'Caption text has transparent CSS color');
  const backdrop=p.ancestors.map(a=>cssColor(a.background_color)).find(c=>c.alpha===1);assert.ok(backdrop,'An opaque caption backing must exist');assert.ok(fill.rgb.some((v,i)=>Math.round(v*fill.alpha*opacity+backdrop.rgb[i]*(1-fill.alpha*opacity))!==Math.round(backdrop.rgb[i])),'Caption text composites to its backing');
 }
 return true;
}
const flagRows=s=>[...(s.cells??[]),s.playerCell,s.spawnCell,...(s.surfaces??[]),s.nativeAI?.eldritchTotem?.plateCell,s.nativeAI?.eldritchTotem?.retreatCell,...s.monsters.map(n=>({x:n.x,y:n.y,flags:n.cellFlags}))].filter(Boolean);
export function assertTotemCellFlagInvariant({cell,initial,flags:F,actors,player,interval,turn,selectedKind,kinds}){
 assert.ok(initial&&cell.x===initial.x&&cell.y===initial.y);assert.ok(Number.isSafeInteger(cell.flags)&&cell.flags>=0&&cell.flags<=0x7fffffff,'Undefined native tile flag bit');
 const dynamic=F.HAS_PLAYER|F.PRESSURE_PLATE_DEPRESSED|F.HAS_MONSTER|F.WAS_VISIBLE|F.SEARCHED_FROM_HERE|F.IS_IN_SHADOW|F.KNOWN_TO_BE_TRAP_FREE|F.IN_LOOP|F.IS_POWERED|F.TERRAIN_COLORS_DANCING;
 assert.equal(cell.flags&~dynamic,initial.flags&~dynamic,'Source-fixed tile flag mutation '+JSON.stringify({cell:[cell.x,cell.y],initial:initial.flags,actual:cell.flags,delta:cell.flags^initial.flags}));
 assert.equal(!!(cell.flags&F.HAS_MONSTER),actors.some(n=>n.x===cell.x&&n.y===cell.y),'Actual observed cell/live-list occupancy mismatch');
 assert.equal(!!(cell.flags&F.HAS_PLAYER),cell.x===player.x&&cell.y===player.y,'Observed HAS_PLAYER must follow the actual player');
 if(!['40,14','39,14'].includes(key(cell)))assert.equal(cell.flags&F.SEARCHED_FROM_HERE,initial.flags&F.SEARCHED_FROM_HERE,'Only the two prescribed actual player cells auto-search');
 if(key(cell)!=='40,14')assert.equal(cell.flags&F.PRESSURE_PLATE_DEPRESSED,initial.flags&F.PRESSURE_PLATE_DEPRESSED,'Only the original pressure tile may depress/rearm');
 if(!['40,14','39,14','40,13'].includes(key(cell)))assert.equal(cell.flags&F.KNOWN_TO_BE_TRAP_FREE,initial.flags&F.KNOWN_TO_BE_TRAP_FREE,'Flying children cannot add trap knowledge');
 if(cell.flags&F.IS_POWERED)assert.ok(interval>0&&turn>0&&cell.x===40&&cell.y===14,'Power has only the actual pressure promotion owner');
 if(cell.flags&F.TERRAIN_COLORS_DANCING)assert.ok(actors.some(n=>n.x===cell.x&&n.y===cell.y&&n.publicVisible===1&&(n.kind===kinds.totem||n.kind===kinds.blade)),'Only the actually visible Totem/Blade has dancing colors');
 if(interval===0||selectedKind!==kinds.blade)assert.equal(cell.flags&F.IS_IN_SHADOW,initial.flags&F.IS_IN_SHADOW,'Only born Blade intrinsic light can change shadow');
 if(initial.flags&F.SEARCHED_FROM_HERE)assert.ok(cell.flags&F.SEARCHED_FROM_HERE);if(initial.flags&F.KNOWN_TO_BE_TRAP_FREE)assert.ok(cell.flags&F.KNOWN_TO_BE_TRAP_FREE);
}
export function assertTotemObservedFixedFlags({state,initialCells,flags,kinds,interval,selectedKind}){
 const rows=flagRows(state),seen=new Map();for(const cell of rows){assertTotemCellFlagInvariant({cell,initial:initialCells.get(key(cell)),flags,actors:state.monsters,player:state,interval,turn:state.turn,selectedKind,kinds});if(seen.has(key(cell)))assert.equal(cell.flags,seen.get(key(cell)),'Same-coordinate C cell/actor flag exports disagree');seen.set(key(cell),cell.flags);}return rows;
}
function flagStageCandidates(s,{before,after,reference,rank,last,initialCells,flags:F,kinds,interval,selectedKind}){
 const rows=assertTotemObservedFixedFlags({state:s,initialCells,flags:F,kinds,interval,selectedKind}),old=new Map(before.cells.map(c=>[key(c),c])),final=new Map(after.cells.map(c=>[key(c),c])),point=new Map(reference.cells.map(c=>[key(c),c])),column=F.WAS_VISIBLE|F.IS_IN_SHADOW;
 for(const c of rows){const a=old.get(key(c)),p=point.get(key(c));assert.ok(a&&p);const owned=F.HAS_PLAYER|F.PRESSURE_PLATE_DEPRESSED|F.SEARCHED_FROM_HERE|F.KNOWN_TO_BE_TRAP_FREE|F.IN_LOOP|F.IS_POWERED|F.TERRAIN_COLORS_DANCING;
  assert.equal(c.flags&owned,p.flags&owned,'Native owned tile flag does not match coupled source boundary '+JSON.stringify({cell:[c.x,c.y],rank,actual:c.flags,reference:p.flags}));
  // IN_LOOP follows the exact coupled wait; leader death may change stale topology.
  if(rank<last)assert.equal(c.flags&column,p.flags&column,'ACK/before lighting column must match its exact real wait');
 }
 // Visibility demotion and shadow reset/paint loops have no intervening publish.
 // All actually observed coordinates share one column phase; native allwait is
 // the absolute Blade-shadow/initial-loop oracle, not a new lighting/AI credit.
 const phases=[];for(const phase of [0,1])if((rank!==0||phase===0)&&rows.every(c=>(c.flags&column)===((phase?final:old).get(key(c)).flags&column)))phases.push(phase);
 assert.ok(phases.length,'Observed WAS/SHADOW columns are not one atomic source phase');
 const priorChildren=before.monsters.filter(n=>!n.preparedSubject),nowChildren=s.monsters.filter(n=>!n.preparedSubject);
 const newlyVisible=s.monsters.some(n=>{const old=n.preparedSubject?before.monsters.find(o=>o.preparedSubject):nowChildren.length<priorChildren.length?priorChildren.find(o=>o.x===n.x&&o.y===n.y):priorChildren[nowChildren.indexOf(n)];return !!(n.bookkeepingFlags&kinds.was)&&!((old?.bookkeepingFlags??0)&kinds.was);});
 return phases.filter(phase=>!newlyVisible||phase===1);
}

// One latent source path for the whole live cohort, not independent clock sets.
// Monsters1515..1575/2134..2254/3326..3455/3627..3887; Time2376..2467.
export function assertTotemJointAISchedule({before,after,cells,player,parent,flags:F,tracking,levitating,maxDamage,damage,finiteTracking}){
 assert.equal(before.length,after.length);assert.ok(before.length>0);assert.ok(Number.isInteger(damage)&&damage>=0);
 const terrain=new Map(cells.map(c=>[key(c),c])),distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)),same=(a,b)=>a.x===b.x&&a.y===b.y;
 const passable=p=>{const c=terrain.get(key(p));return !!c&&!(c.flags&F.HAS_STAIRS)&&c.terrainPassable;},
  diagonal=(a,b)=>a.x!==b.x&&a.y!==b.y&&(!terrain.get(a.x+','+b.y)?.diagonalPassable||!terrain.get(b.x+','+a.y)?.diagonalPassable),
  directions=[[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[-1,1],[1,-1],[1,1]],
  occupied=(world,p)=>same(p,player)||same(p,parent)||world.some(n=>same(n,p)),
  empty=(world,p)=>passable(p)&&!occupied(world,p),eligible=i=>before[i].state===tracking&&before[i].statuses[levitating]>0;
 for(let i=0;i<before.length;i++){assert.ok(eligible(i),'Unsupported native AI eligibility');assert.ok(before[i].ticksUntilTurn>0&&before[i].ticksUntilTurn<=100);assert.ok(after[i].ticksUntilTurn>0&&after[i].ticksUntilTurn<=100);assert.equal(before[i].kind,after[i].kind);assert.equal(before[i].hp,after[i].hp);}
 const swarm=(world,i)=>{const n=world[i];let targets=directions.map(([dx,dy])=>({x:n.x+dx,y:n.y+dy})).filter(p=>empty(world,p)&&distance(p,player)===1&&!diagonal(n,p)&&!diagonal(player,p));
  if(!targets.length)return [];const helpful=world.some((ally,j)=>j!==i&&eligible(j)&&distance(n,ally)===1&&!diagonal(n,ally)&&(distance(player,ally)>1||diagonal(player,ally))&&!directions.some(([dx,dy])=>{const p={x:ally.x+dx,y:ally.y+dy};return empty(world,p)&&distance(p,player)===1&&!diagonal(player,p)&&!diagonal(ally,p);}));
  if(!helpful)return [];const cardinal=targets.filter(p=>Math.abs(p.x-n.x)+Math.abs(p.y-n.y)===1);return cardinal.length?cardinal:targets;
 };
 assert.ok(finiteTracking&&finiteTracking.cachedStealthRange>=3&&finiteTracking.scentTurn>=1000&&finiteTracking.scentTurn<=1051,'Missing finite new-fixture tracking preconditions');
 for(const c of cells)if(Math.abs(c.x-player.x)<=2&&Math.abs(c.y-player.y)<=2){assert.ok(c.flags&F.IN_FIELD_OF_VIEW,'Finite geometric FOV must be actual');assert.ok(c.terrainPassable&&c.diagonalPassable,'Finite proof requires unobstructed fixed room terrain');}
 const finite=new Set([[-1,-2],[0,-2],[1,-2],[-1,-1],[1,-1],[-1,0],[1,0],[-2,-1],[2,-1],[-2,0],[-1,1],[0,-1],[0,1],[0,2],[1,1],[2,0]].map(([x,y])=>(player.x+x)+','+(player.y+y)));
 const unsupported=[];
 const actions=(world,i)=>{const n=world[i],c=terrain.get(key(n));if(!finite.has(key(n))||!c||!(c.flags&F.IN_FIELD_OF_VIEW)){if(unsupported.length<4)unsupported.push({live_index:i,at:n.due,cell:[n.x,n.y],owner:'non-FOV/scent branch has no failed16 proof in this model'});return [];}
  // Native scent writes max(T-d,old), T starts1000>mapdistance184, never resets here.
  // All possible source nodes stay within this finite geometric FOV union.
  const scentBound=2*Math.max(Math.abs(player.x-n.x),Math.abs(player.y-n.y))+Math.min(Math.abs(player.x-n.x),Math.abs(player.y-n.y));assert.ok(scentBound<=5,'Finite native FOV scent upper bound exceeded');
  const ax=Math.abs(player.x-n.x),ay=Math.abs(player.y-n.y),dx=Math.sign(player.x-n.x),dy=Math.sign(player.y-n.y),dirs=[[dx,dy]];
  if(!(distance(n,player)<=1&&(!dx||!dy)))dirs.push(...(ax<ay?[[0,dy],[dx,0],[-1,dy],[1,dy]]:[[dx,0],[0,dy],[dx,-1],[dx,1]]));
  for(const [x,y]of dirs){const p={x:n.x+x,y:n.y+y};if((!x&&!y)||!passable(p)||diagonal(n,p)||same(p,parent)||world.some((a,j)=>j!==i&&same(a,p)))continue;
   if(same(p,player)){const to=swarm(world,i);return to.length?to.map(p=>({token:'M',cost:50,to:p,owner:'native swarm'})):[{token:'A',cost:100,to:n,owner:'native melee'}];}
   return [{token:'M',cost:50,to:p,owner:'first successful passive candidate'}];
  }
  return [{token:'F',cost:16,to:n,owner:'all source passive candidates blocked at this joint occupancy'}];
 };
 const target=after.map(n=>n.ticksUntilTurn+100),coin=[true];for(let k=1;k<=200;k++)coin[k]=[16,50,100].some(v=>k>=v&&coin[k-v]);
 const initial=before.map(n=>({x:n.x,y:n.y,due:n.ticksUntilTurn,stationary:n.turnsSpentStationary,attacks:0})),memo=new Set();let explored=0;
 function visit(world,path){explored++;let i=0;for(let j=1;j<world.length;j++)if(world[j].due<world[i].due)i=j;const n=world[i];
  if(n.due>100){if(world.some((a,j)=>!finite.has(key(a))||a.due!==target[j]||!same(a,after[j])||a.stationary!==after[j].turnsSpentStationary||a.attacks>1))return null;const attacks=world.reduce((v,a)=>v+a.attacks,0);return damage<=maxDamage*attacks?{tokens:path,attacks,damage,maximum_damage:maxDamage*attacks}:null;}
  const signature=JSON.stringify(world);if(memo.has(signature))return null;memo.add(signature);
  for(const a of actions(world,i)){const next=world.map(n=>({...n})),fresh=next[i];fresh.due+=a.cost;fresh.stationary++;if(a.token==='M'){fresh.x=a.to.x;fresh.y=a.to.y;fresh.stationary=0;}if(a.token==='A')fresh.attacks++;
   if(fresh.due>target[i]||!coin[target[i]-fresh.due]||fresh.attacks>1)continue;if(fresh.due>100&&(!same(fresh,after[i])||fresh.stationary!==after[i].turnsSpentStationary))continue;
   const result=visit(next,[...path,{at:n.due,live_index:i,token:a.token,cost:a.cost,from:[n.x,n.y],to:[fresh.x,fresh.y],stationary:fresh.stationary,owner:a.owner}]);if(result)return result;
  }return null;
 }
 const witness=visit(initial,[]);assert.ok(witness,'No single native cohort path couples time/list order, occupancy, diagonal terrain, stationary, M50/A100/F16 and actual damage '+JSON.stringify({unsupported_source_owners:unsupported}));return {...witness,explored_states:explored,unsupported_alternative_branches:unsupported};
}

// Eligibility alone is not a visible proof. The same pending native ACK must
// later consume Space at the recorded trace index; no other message owner counts.
export function totemPressureCaptionOwner(c){
 const reasons=[],need=(ok,why)=>{if(!ok)reasons.push(why);},s=c.state,w=c.wait,p=s?.monsters?.find(n=>n.preparedSubject===1),a=s?.nativeAI?.eldritchTotem;
 need(c.action==='press'&&Number.isInteger(c.press)&&c.press>=1&&c.press<=8,'pressure action/press');need(c.turn===2*c.press-1,'expected pressure turn');
 need(w?.waiting===true&&w.kind==='acknowledge'&&w.descriptor?.[0]===6,'pending actual ACK6');need(Number.isSafeInteger(w?.serial)&&w.serial>0,'actual wait serial');
 need(s?.turn===c.turn&&s.absoluteTurnNumber===c.turn,'current samepress turn');need(s?.x===40&&s.y===14&&s.hp===100,'current underfoot player');
 need(s?.statuses?.[c.nutrition]===1075-c.turn,'current player nutrition');need(s?.monsters?.length===1&&p?.kind===c.totem,'only native prepared parent/no children');
 need(p?.x===40&&p?.y===13&&p?.machineHome===7&&p?.ticksUntilTurn===0&&p?.statuses?.[c.nutrition]===1000-c.turn&&p?.turnsSpentStationary===c.press-1&&p?.hp===c.parentHP,'preactivation native parent');
 const plate=a?.plateCell;need(plate?.x===40&&plate?.y===14&&plate.dungeon===c.plate&&plate.machine===7,'native wired plate');need(!!(plate?.flags&c.depressed)&&!!(plate?.flags&c.hasPlayer)&&!(plate?.flags&c.power),'depressed player plate before promotion');
 need(a?.playerTicksUntilTurn===100&&a?.ticksTillUpdateEnvironment===100,'preactivation timing owner');
 const prefix=c.prefix??[],first=prefix[0],reentry=c.command==='l';need(c.command==='.'&&c.press===1||reentry&&c.press>1,'prescribed pressure key');
 need(Number.isSafeInteger(c.eventStart)&&c.eventStart>=0&&c.traceCount===c.eventStart+prefix.length,'actual interval trace index');need(prefix.length===(reentry?2:1),'samepress actual consumed prefix length');
 need(first?.event?.[0]===0&&first.event[1]===c.command?.codePointAt(0)&&first.descriptor?.[0]!==3&&first.descriptor?.[0]!==6,'actual pressure command predecessor');
 if(reentry)need(prefix[1]?.descriptor?.[0]===3&&JSON.stringify(prefix[1].event)===JSON.stringify([0,121,0,0,0]),'actual reentry y predecessor');
 return {eligible:reasons.length===0,reasons};
}
export function assertTotemPressureCaptionClaim({context,measurement,submission,trace}){
 assert.equal(totemPressureCaptionOwner(context).eligible,true,'Ineligible pressure caption owner');assert.ok(measurement&&measurement.status==='captured');assert.equal(measurement.label,'message-'+context.turn+'-pressure-click');assert.equal(measurement.visibility_assertion,'PASS');assert.equal(measurement.proof?.PNG,measurement.label+'.png','Actual same-owner caption PNG missing');
 assert.deepEqual(measurement.native_before,context.state,'Caption measured another native state');assert.deepEqual(measurement.wait_before,context.wait,'Caption measured another wait/serial');assert.equal(measurement.trace_count_before,context.traceCount,'Caption measured another trace index');
 assert.deepEqual(measurement.native_after,context.state,'Caption UI changed native state/RNG');assert.deepEqual(measurement.wait_after,context.wait,'Caption UI changed wait/serial');assert.equal(measurement.trace_count_after,context.traceCount,'Caption UI consumed input');
 assert.deepEqual(submission.state,context.state,'Existing Space submitted from another native state');assert.deepEqual(submission.wait,context.wait,'Existing Space submitted from another wait/serial');assert.equal(submission.trace_count,context.traceCount,'Existing Space submitted at another trace index');
 const actual=trace[context.traceCount];assert.ok(actual,'Bound pressure ACK was not consumed');assert.deepEqual(actual.event,[0,32,0,0,0],'Bound pressure ACK must actually consume Space');assert.deepEqual(actual.descriptor,context.wait.descriptor,'Consumed descriptor differs from measured pending ACK');assert.deepEqual(actual.before,context.state,'Consumed ACK before differs from measured native state');
 return {validated:true,press:context.press,turn:context.turn,event_start:context.eventStart,consumed_ACK_index:context.traceCount,wait_serial:context.wait.serial,descriptor:context.wait.descriptor,event:actual.event,native_state_sha256:digest(JSON.stringify(context.state)),serial_evidence:'Actual pending browser wait before measurement and before Space; consumed events do not export a serial'};
}

// Message evidence uses the current native rows and visible production UI,
// never a later reconstruction of an earlier frame. UI zoom/scroll cannot send
// a C event: full state, wait serial and consumed-event count are guarded.
async function visibleMessage(d,pattern,label){
 const before=await d.state(),wait=await d.wait(),count=(await d.trace()).native_trace.length,zoom=await d.page.locator('#zoom').inputValue();
 const errorData=e=>({name:e.name,message:e.message,stack:e.stack,...(e.code?{code:e.code}:{})});
 const attempt={label,pattern,regex_flags:'i',turn:before.turn,trace_count_before:count,native_before:before,wait_before:wait,zoom_before:zoom,status:'measuring'};
 (d.entry.caption_measurements??=[]).push(attempt);let primaryError,nativeMatched=false;
 try{
  const text=await d.page.evaluate(()=>Array.from({length:3},(_,y)=>Array.from({length:79},(_,x)=>{const at=(y*100+x+21)*10,c=__brogueFixture.cells;return c[at]===0x110000?' ':String.fromCodePoint(c[at+1]||32);}).join('')).join('\n'));
  attempt.native_message_rows=text;const nativeMatch=new RegExp(pattern,'i').exec(text);attempt.native_match=nativeMatch?{text:nativeMatch[0],index:nativeMatch.index}:null;
  if(!nativeMatch){attempt.status='no native row match';return null;}nativeMatched=true;
  let proof;
  if(d.entry.input_path==='touch'){
   proof=await d.page.evaluate(pattern=>{
    const el=document.querySelector('#mobile-messages');if(!el)return {measurement_failure:'missing mobile message element'};
    const text=el.textContent,match=new RegExp(pattern,'i').exec(text),measurement={mirror_text:text,match:match?{text:match[0],index:match.index}:null};
    if(!match)return {measurement_failure:'native caption absent from production mirror',measurement};
    const node=el.firstChild;measurement.first_child_type=node?.nodeType??null;if(!node||node.nodeType!==Node.TEXT_NODE)return {measurement_failure:'unsupported production mirror node',measurement};
    const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);measurement.range_offsets={start:match.index,end:match.index+match[0].length};
    const r=o=>({left:o.left,right:o.right,top:o.top,bottom:o.bottom}),rawRect=o=>({...r(o),x:o.x,y:o.y,width:o.width,height:o.height});
    // BEGIN passive character ranges: advance boxes are diagnostic, not ink.
    function characterGeometry(){
     const result={characters:[],word_runs:[]};
     const errorData=e=>({name:e.name,message:e.message});
     try{
      const source=node.nodeValue,start=match.index,end=start+match[0].length;
      result.node={type:node.nodeType,utf16_length:source?.length??null,is_connected:node.isConnected,parent:node.parentElement?{tag:node.parentElement.tagName,id:node.parentElement.id}:null};result.node_text=source;result.mirror_text=el.textContent;result.match={text:match[0],utf16_start:start,utf16_end:end,utf16_length:match[0].length};result.node_slice_matches=typeof source==='string'&&source.slice(start,end)===match[0];
      if(!result.node_slice_matches){result.measurement_error={name:'TextBindingMismatch',message:'Current Text node does not contain the saved exact match at its UTF16 offsets'};return result;}
      const measure=(from,to)=>{const item={requested_utf16_start:from,requested_utf16_end:to};try{const part=node.ownerDocument.createRange();part.setStart(node,from);part.setEnd(node,to);item.actual_utf16_start=part.startOffset;item.actual_utf16_end=part.endOffset;item.range_text=part.toString();item.bounding_rect=rawRect(part.getBoundingClientRect());item.client_rects=[...part.getClientRects()].map(rawRect);item.hit_tests=item.client_rects.map((q,rect_index)=>{if(!(q.right>q.left&&q.bottom>q.top))return {rect_index,not_sampled:'zero-area rectangle'};const x=(q.left+q.right)/2,y=(q.top+q.bottom)/2,hit=node.ownerDocument.elementFromPoint(x,y);return {rect_index,x,y,hit:hit?{tag:hit.tagName,id:hit.id,class_name:hit.className}:null,contained:hit===el||el.contains(hit)};});}catch(error){item.measurement_error=errorData(error);}return item;};
      for(let offset=0;offset<match[0].length;){const point=match[0].codePointAt(offset),length=point>0xffff?2:1,character=match[0].slice(offset,offset+length),space=/\s/u.test(character),kind=point===0x20?'ASCII_SPACE':point===9?'TAB':point===10?'LF':point===13?'CR':point===0xa0?'NBSP':space?'OTHER_ECMASCRIPT_WHITESPACE':'NON_WHITESPACE';
       result.characters.push({relative_utf16_start:offset,relative_utf16_end:offset+length,utf16_start:start+offset,utf16_end:start+offset+length,utf16_units:Array.from({length},(_,j)=>character.charCodeAt(j)),code_point:point,unicode:'U+'+point.toString(16).toUpperCase().padStart(4,'0'),character,escaped_character:JSON.stringify(character),invalid_scalar:point>=0xd800&&point<=0xdfff,whitespace:{ecmascript:space,kind,unicode_separator:/\p{Z}/u.test(character),unicode_mark:/\p{M}/u.test(character),unicode_format:/\p{Cf}/u.test(character),unicode_control:/\p{Cc}/u.test(character)},...measure(start+offset,start+offset+length)});offset+=length;
      }
      for(const word of match[0].matchAll(/\S+/gu)){const from=word.index,to=from+word[0].length,prior=from===0?[...source.slice(0,start)].at(-1)??null:null,next=to===match[0].length?[...source.slice(end)][0]??null:null;
       result.word_runs.push({text:word[0],relative_utf16_start:from,relative_utf16_end:to,utf16_start:start+from,utf16_end:start+to,codepoint_row_indices:result.characters.flatMap((c,i)=>c.relative_utf16_start>=from&&c.relative_utf16_end<=to?[i]:[]),starts_at_match_boundary:from===0,ends_at_match_boundary:to===match[0].length,preceding_outside_character:prior,following_outside_character:next,start_cut_by_match:prior!==null&&!/\s/u.test(prior),end_cut_by_match:next!==null&&!/\s/u.test(next),...measure(start+from,start+to)});
      }
      result.reconstructed_match=result.characters.map(c=>c.character).join('');result.utf16_coverage_matches=result.reconstructed_match===match[0]&&result.characters.every((c,i)=>c.relative_utf16_start===(i?result.characters[i-1].relative_utf16_end:0))&&(result.characters.at(-1)?.relative_utf16_end??0)===match[0].length;
     }catch(error){result.measurement_error=errorData(error);}return result;
    }
    // END passive character ranges.
    const layout=()=>{const vv=visualViewport,ancestors=[];for(let a=el;a;a=a.parentElement){const css=getComputedStyle(a);ancestors.push({tag:a.tagName,id:a.id,class_name:a.className,rect:rawRect(a.getBoundingClientRect()),clientLeft:a.clientLeft,clientTop:a.clientTop,clientWidth:a.clientWidth,clientHeight:a.clientHeight,offsetWidth:a.offsetWidth,offsetHeight:a.offsetHeight,scrollTop:a.scrollTop,scrollLeft:a.scrollLeft,scrollWidth:a.scrollWidth,scrollHeight:a.scrollHeight,computed:Object.fromEntries(['display','visibility','opacity','contentVisibility','filter','clipPath','maskImage','backgroundColor','color','webkitTextFillColor','font','lineHeight','whiteSpace','wordBreak','overflowX','overflowY','boxSizing','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth','transform','letterSpacing','wordSpacing','textDecorationLine','textDecorationStyle','textDecorationColor','textDecorationThickness','textDecorationSkipInk','textUnderlineOffset','textShadow','webkitTextStrokeWidth','webkitTextStrokeColor','writingMode','textOrientation','direction','unicodeBidi','fontKerning','fontVariantLigatures','fontFeatureSettings','fontVariationSettings','fontFamily','fontSize','fontStyle','fontWeight','overflowWrap','lineBreak','hyphens','tabSize','textIndent','textTransform','textRendering','textEmphasisStyle','textEmphasisColor','textEmphasisPosition'].map(k=>[k,css[k]??null]))});}
     return {range:rawRect(range.getBoundingClientRect()),client_rects:[...range.getClientRects()].map(rawRect),panel:rawRect(el.getBoundingClientRect()),scrollTop:el.scrollTop,scrollLeft:el.scrollLeft,scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight,clientWidth:el.clientWidth,clientHeight:el.clientHeight,ancestors,character_ranges:characterGeometry(),document_fonts_status:node.ownerDocument.fonts?.status??null,window:{innerWidth,innerHeight,scrollX,scrollY,devicePixelRatio},visualViewport:vv?{offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop,pageLeft:vv.pageLeft,pageTop:vv.pageTop,width:vv.width,height:vv.height,scale:vv.scale}:null};};
    measurement.before_scroll=layout();
    const panel=el.getBoundingClientRect(),first=range.getBoundingClientRect(),delta=first.top-(panel.top+el.clientTop);measurement.scroll_request={oldTop:el.scrollTop,oldLeft:el.scrollLeft,deltaTop:delta,requestedTop:el.scrollTop+delta};el.scrollTop+=first.top-(panel.top+el.clientTop);
    const rect=range.getBoundingClientRect(),style=getComputedStyle(el),client_rects=[...range.getClientRects()].filter(c=>c.width>0&&c.height>0).map(r),ancestors=[];
    const vv=visualViewport,clip={left:Math.max(panel.left+el.clientLeft,0,vv?.offsetLeft??0),right:Math.min(panel.left+el.clientLeft+el.clientWidth,innerWidth,(vv?.offsetLeft??0)+(vv?.width??innerWidth)),top:Math.max(panel.top+el.clientTop,0,vv?.offsetTop??0),bottom:Math.min(panel.top+el.clientTop+el.clientHeight,innerHeight,(vv?.offsetTop??0)+(vv?.height??innerHeight))};
    measurement.clip_steps=[{owner:'original panel/window/visualViewport intersection',after:{...clip}}];
    for(let a=el;a;a=a.parentElement){const css=getComputedStyle(a),box=a.getBoundingClientRect();ancestors.push({tag:a.tagName,id:a.id,display:css.display,visibility:css.visibility,opacity:css.opacity,content_visibility:css.contentVisibility,filter:css.filter,clip_path:css.clipPath,mask_image:css.maskImage,background_color:css.backgroundColor});const prior={...clip};
     if(['hidden','clip','scroll','auto'].includes(css.overflowX)){clip.left=Math.max(clip.left,box.left+a.clientLeft);clip.right=Math.min(clip.right,box.left+a.clientLeft+a.clientWidth);}if(['hidden','clip','scroll','auto'].includes(css.overflowY)){clip.top=Math.max(clip.top,box.top+a.clientTop);clip.bottom=Math.min(clip.bottom,box.top+a.clientTop+a.clientHeight);}measurement.clip_steps.push({owner:{tag:a.tagName,id:a.id},overflowX:css.overflowX,overflowY:css.overflowY,rect:rawRect(box),clientLeft:a.clientLeft,clientTop:a.clientTop,clientWidth:a.clientWidth,clientHeight:a.clientHeight,before:prior,after:{...clip}});}
    measurement.after_scroll=layout();measurement.hit_tests=client_rects.map(c=>{const x=(c.left+c.right)/2,y=(c.top+c.bottom)/2,hit=document.elementFromPoint(x,y);return {x,y,hit:hit?{tag:hit.tagName,id:hit.id,class_name:hit.className}:null,contained:hit===el||el.contains(hit)};});
    return {kind:'actual production mobile message mirror',text:match[0],rect:r(rect),panel:r(panel),clip,content_width:el.clientWidth,content_height:el.clientHeight,client_rects,ancestors,
     hit_test:client_rects.length>0&&client_rects.every(c=>{const hit=document.elementFromPoint((c.left+c.right)/2,(c.top+c.bottom)/2);return hit===el||el.contains(hit);}),color:style.color,text_fill_color:style.webkitTextFillColor,font:style.font,scrollTop:el.scrollTop,measurement};
   },pattern);
  }else{
   await d.page.locator('#zoom').selectOption('fit');
   proof=await d.page.evaluate(pattern=>{
    const cells=__brogueFixture.cells,text=Array.from({length:3},(_,y)=>Array.from({length:79},(_,x)=>{const at=(y*100+x+21)*10;return cells[at]===0x110000?' ':String.fromCodePoint(cells[at+1]||32);}).join('')).join('\n'),match=new RegExp(pattern,'i').exec(text);if(!match)return null;
    const canvas=document.querySelector('#game'),r=canvas.getBoundingClientRect(),v=document.querySelector('#viewport'),q=v.getBoundingClientRect(),cw=r.width/100,ch=r.height/34,pw=canvas.width/100,ph=canvas.height/34,context=canvas.getContext('2d'),points=[];
    for(let i=match.index;i<match.index+match[0].length;i++)if(!/\s/.test(text[i])){const x=21+i%80,y=Math.floor(i/80),at=(y*100+x)*10,cell=cells.slice(at,at+10),pixels=Array.from(context.getImageData(x*pw,y*ph,pw,ph).data);points.push({x,y,cell,pixels});}
    return {kind:'native C message canvas cells',text:match[0],cw,ch,rect:{left:Math.min(...points.map(p=>r.left+p.x*cw)),right:Math.max(...points.map(p=>r.left+(p.x+1)*cw)),top:Math.min(...points.map(p=>r.top+p.y*ch)),bottom:Math.max(...points.map(p=>r.top+(p.y+1)*ch))},
     clip:{left:Math.max(q.left+v.clientLeft,0),right:Math.min(q.left+v.clientLeft+v.clientWidth,innerWidth),top:Math.max(q.top+v.clientTop,0),bottom:Math.min(q.top+v.clientTop+v.clientHeight,innerHeight)},points};
   },pattern);
   attempt.proof=proof;
   if(proof){assert.ok(proof.cw>=10&&proof.ch>=14);for(const p of proof.points){const bg=p.cell.slice(5,8).map(colorChannel),fg=p.cell.slice(2,5).map(colorChannel);let ink=0;for(let i=0;i<p.pixels.length;i+=4){assert.equal(p.pixels[i+3],255);if(!p.pixels.slice(i,i+3).every((v,j)=>v===bg[j]))ink++;for(let j=0;j<3;j++)assert.ok(p.pixels[i+j]>=Math.min(bg[j],fg[j])-1&&p.pixels[i+j]<=Math.max(bg[j],fg[j])+1);}assert.ok(ink>0,'Visible message letter has no pixel ink');p.pixels_sha256=digest(Buffer.from(p.pixels));delete p.pixels;}}
  }
  attempt.proof=proof;attempt.status='visibility assertion pending';assertTotemMessageVisibility(proof);attempt.visibility_assertion='PASS';
  await d.screenshot(label);proof.PNG=d.entry.screenshots.at(-1);attempt.status='captured';return proof;
 }catch(error){primaryError=error;attempt.status='failed';attempt.error=errorData(error);throw error;
 }finally{
  const errors=[];attempt.finally={restore_zoom_attempted:nativeMatched};
  if(nativeMatched)try{await d.page.locator('#zoom').selectOption(zoom);attempt.finally.zoom_after=await d.page.locator('#zoom').inputValue();attempt.finally.restore_zoom='PASS';}catch(error){errors.push(error);attempt.finally.restore_error=errorData(error);}
  try{attempt.native_after=await d.state();attempt.wait_after=await d.wait();attempt.trace_count_after=(await d.trace()).native_trace.length;
   const checks=[['state_RNG_unchanged',()=>assert.deepEqual(attempt.native_after,before,'Message UI capture changed Cstate/RNG')],['wait_serial_unchanged',()=>assert.equal(attempt.wait_after.serial,wait.serial)],['wait_descriptor_unchanged',()=>assert.deepEqual(attempt.wait_after,wait)],['consumed_trace_unchanged',()=>assert.equal(attempt.trace_count_after,count)]];
   for(const[name,check]of checks)try{check();attempt.finally[name]='PASS';}catch(error){errors.push(error);attempt.finally[name]={result:'FAIL',error:errorData(error)};}
  }catch(error){errors.push(error);attempt.finally.observation_error=errorData(error);}
  attempt.finally.primary_error_preserved=!!primaryError;attempt.finally.errors=errors.map(errorData);if(!primaryError&&errors.length)throw errors[0];
 }
}

export function createEldritchTotemCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const e=inv.definitions[domain]?.entries.find(e=>e.symbol===symbol);assert.ok(e,domain+':'+symbol);return e.value;},
  ST=n=>V('statusEffects','STATUS_'+n),MB=n=>V('monsterBookkeepingFlags','MB_'+n),TF=n=>V('tileFlags',n),T=n=>V('tileType',n),
  N=ST('NUTRITION'),LEV=ST('LEVITATING'),DON=ST('DONNING'),SEARCH=ST('SEARCHING'),WILL=MB('WILL_FLASH'),WAS=MB('WAS_VISIBLE'),SEEN=MB('ALREADY_SEEN'),
  FOLLOW=MB('FOLLOWER'),BOUND=MB('BOUND_TO_LEADER'),LEADER=MB('LEADER'),JUST=MB('JUST_SUMMONED'),AUTO=MB('WEAPON_AUTO_ID'),
  HAS=TF('HAS_MONSTER'),ROOM=TF('IS_IN_ROOM_MACHINE'),POWER=TF('IS_POWERED'),
  TOTEM=V('monsterTypes','MK_ELDRITCH_TOTEM'),BLADE=V('monsterTypes','MK_SPECTRAL_BLADE'),FURY=V('monsterTypes','MK_FURY'),
  RED=T('RED_BLOOD'),RUBBLE=T('RUBBLE'),PLATE=T('GAS_TRAP_PARALYSIS'),DEPRESSED=TF('PRESSURE_PLATE_DEPRESSED'),
  flagBits=Object.fromEntries(inv.definitions.tileFlags.entries.map(e=>[e.symbol,e.value])),flagKinds={totem:TOTEM,blade:BLADE,fury:FURY,was:WAS},
  tracking=V('creatureStates','MONSTER_TRACKING_SCENT'),normal=V('creatureModes','MODE_NORMAL'),pc=new Map(),controls=new Map(),cases=[];
 const pinned=process.env.BROGUE_ORIGINAL_SOURCE||path.join(root,'.local/upstream-sources/tmewett-BrogueCE-1ba4240'),pin=JSON.parse(readFileSync(path.join(root,'tests/upstream-1.15.1.json'),'utf8'));
 assert.equal(pin.commit,'1ba4240b7a928ddf0ffb772717bf1d433cd63804');assert.equal(Object.keys(pin.source_sha256).length,42);
 for(const [file,hash]of Object.entries(pin.source_sha256))assert.equal(digest(readFileSync(path.join(pinned,file))),hash,'Pinned source '+file);
 const lights=readLightEnum(pinned);assert.deepEqual(readLightEnum(root),lights);const terrainCatalog=readTotemTerrainCatalog(inv,{pinned});
 const nativeGlyph=readNativeGlyphSources(),G=n=>{assert.ok(nativeGlyph.glyphs.has(n));return [nativeGlyph.glyphs.get(n),nativeGlyph.unicode.get(n)];};
 for(const variant of variants){const catalog=readOriginalHordeCatalogs(inv,variant),base=catalog.monsters[TOTEM],rows=catalog.hordes.filter(r=>r.leader===TOTEM&&(r.flags&V('hordeFlags','HORDE_IS_SUMMONED')));
  assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.members),[[BLADE],[FURY]]);assert.deepEqual(rows.map(r=>r.counts),[[[4,7,1]],[[2,3,1]]]);
  for(const r of rows){assert.equal(r.frequency,100);assert.equal(r.flags,V('hordeFlags','HORDE_IS_SUMMONED')|V('hordeFlags','HORDE_DIES_ON_LEADER_DEATH'));assert.deepEqual([r.min,r.max,r.spawnsIn,r.machine],[0,0,0,0]);}
  assert.deepEqual([base.maxHP,base.defense,base.accuracy,base.damage,base.nativeMovementSpeed,base.nativeAttackSpeed,base.nativeDFChance,base.nativeDFType],[80,0,0,[0,0,0],100,100,0,0]);
  for(const input_path of ['pc-keyboard','touch'])for(const lethal of [true,false]){
   const condition=lethal?'leader_initial_hp1_destroyed':'leader_native_hp80_survives',pair=variant+'-'+condition,control=variant+'-'+input_path;
   cases.push({id:variant+'-'+input_path+'-eldritch-totem-'+condition,variant,input_path,seed:42,
    fixture_id:lethal?S.ELDRITCH_TOTEM_LETHAL:S.ELDRITCH_TOTEM_SURVIVES,observe_preparation_frames:true,
    feature_ids:['cmd.move','cmd.rest','cmd.search','ai.monsters','ai.groups_mutations'],
    targets:[{domain:'monsterTypes',symbol:'MK_ELDRITCH_TOTEM'},{domain:'hordeFlags',symbol:'HORDE_DIES_ON_LEADER_DEATH'}],
    source_refs:['CE1.15.1 Globals382/605 DF0 wired nonvanishing pressure; Time215..240/1044..1138 activation and empty rearm1487..1490',
     'Rogue.h92 boolean char; Monsters2809 raw bit29 truncates to0; 2409..2454 natural 50% attempt, no initial guarantee',
     'Movement1095..1105 real confirm3; Time230 pressure ACK6 before one native activation; Monsters1029 child101 after this turn status subtraction',
     'Time2250..2583 real prefix, manualSearch SEARCH1/max5 and cached stealth; Movement2484 scent max; Monsters1632..1770 finite aware path',
     'Monsters1515..1575/3326..3887 one shared list/time/occupancy path M50/A100/F16; Combat/Time2303 bound cleanup before child AI'],
    assertions:[
     'Initial-only underfoot native GAS_TRAP_PARALYSIS40,14/machine7/not depressed; old41,14 is safe floor. Native generated Totem40,13 HP1/native80 otherwise unchanged; no effects/children/clock/state/RNG/flag forcing.',
     'First real period pressure, then only after failure h,l/y reentry, at most8 presses. Genuine descriptor6 Space and actual descriptor3 y only. First natural full cohort stops reactivation immediately; then s,k once. Maximum17 gamecommands/7 confirm; all8 natural failures UNREACHED/FAIL. No seed search, preroll or after-input reset.',
     'Each pressure ACK is preactivation parentclock0/NUT1000-turn/stationary p-1; settled failure or success parentclock100/stationary p, born cohort101/NUT1000. Failed retreat empties/rearms plate. Search preserves the full cohort and positions:101->1/NUT999/AI0, SEARCH1/max5, cachedstealth>=3.',
     'Only final k permits one cohort AI window. Finite16 positions are in geometric FOV with nonnegative scent delta<=5; cachedstealth>=3 keeps native TRACKING. Shared scheduler binds list/time order, terrain/occupancy/diagonal/swarm M50/A100/F16 and damage/stationary. Old failed-run WANDERING remains outside this fixture coverage.',
     'HP1 k destroys leader and bound cohort before AI without playerdamage. HP80 k leaves76/77 and the same fullHP cohort/leader, playerHP>=67(Fury) or93(Blade). No post-k guardrest. Native rubble/blood/flash and exact allwait comparison retained.',
     'Each actual preparation/fresh/event-before stream remains independent and coupled to source-owned real waits/endturn. All fixed tileflags and every observed alias four-layer metadata remain source-bound. Native allwait is exact excluding ready only.',
     'Original native C glyph/color/viewport PNG and new messages must actually be public. Mobile allows only the measured single U0020 softwrap configuration, full UTF16/fragment/word/char/hit/CSS proof, no EPS or blanket whitespace exclusion. PC original guard remains strict. Samecondition PCtouch input/initial/final/RNG comparisons; only fixture/ready/initial current Totem HP normalized crosscondition. Candidate2 partial only.'
    ],execute:async d=>{
     const b=await d.state(),subject=b.monsters[0],initialCells=new Map(b.cells.map(c=>[key(c),c])),tr0=await d.trace(),startEvent=tr0.native_trace.length;let chosenKind=null;
     const playerFlags=s=>s.nativeAI.eldritchTotem.playerBookkeepingFlags,
      timer=s=>s.nativeAI.eldritchTotem.playerTurnsUntilRegen,
      totem=s=>s.monsters.find(n=>n.preparedSubject===1),children=s=>s.monsters.filter(n=>!n.preparedSubject),
      cell=(s,x,y)=>s.cells?.find(c=>c.x===x&&c.y===y)??[s.playerCell,s.spawnCell,s.nativeAI?.eldritchTotem?.plateCell,s.nativeAI?.eldritchTotem?.retreatCell,...(s.surfaces??[])].find(c=>c?.x===x&&c?.y===y),
      role=n=>n.bookkeepingFlags&~(WILL|WAS),baseRole=n=>n.kind===FURY?AUTO:0,
      kernel=s=>({turn:s.turn,absolute:s.absoluteTurnNumber,x:s.x,y:s.y,hp:s.hp,statuses:s.statuses,maxStatuses:s.maxStatuses,timer:timer(s),stealth:s.stealthRange,timing:Object.fromEntries(Object.entries(s.nativeAI.eldritchTotem).filter(([k])=>!['plateCell','retreatCell','playerBookkeepingFlags'].includes(k))),
       actors:s.monsters.map(n=>({kind:n.kind,x:n.x,y:n.y,hp:n.hp,clock:n.ticksUntilTurn,nutrition:n.statuses[N],levitating:n.statuses[LEV],state:n.state,scent:n.scentAtCell,role:role(n),subject:n.preparedSubject,leader:n.leaderIndex,parent:n.leaderIsPreparedSubject,stationary:n.turnsSpentStationary}))});
     const native=n=>{
      const data=catalog.monsters[n.kind];assert.ok([TOTEM,BLADE,FURY].includes(n.kind));assert.equal(n.maxHP,data.maxHP);assert.equal(n.flags,data.flags);assert.equal(n.abilityFlags,data.abilityFlags);
      assert.deepEqual(n.combat,{damageMin:data.damage[0],damageMax:data.damage[1],accuracy:data.accuracy,defense:data.defense});assert.deepEqual(n.nativeBolts,data.nativeBolts);
      assert.deepEqual([n.state,n.mode,n.movementSpeed,n.attackSpeed,n.nativeMovementSpeed,n.nativeAttackSpeed,n.nativeDFChance,n.nativeDFType,n.nativeBloodType,n.nativeDamageClump],
       [tracking,normal,data.nativeMovementSpeed,data.nativeAttackSpeed,data.nativeMovementSpeed,data.nativeAttackSpeed,data.nativeDFChance,data.nativeDFType,data.nativeBloodType,data.damage[2]]);
      assert.deepEqual([n.mutationIndex,n.newPowerCount,n.totalPowerCount,n.carriedItem,n.carriedMonster,n.leaderIsPlayer,n.spawnDepth],[-1,0,0,null,null,0,b.depth]);
      assert.deepEqual([n.nativeTurnsBetweenRegen,n.turnsUntilRegen,n.regenPerTurn,n.nativeIntrinsicLightType,n.nativeIsLarge],
       [n.kind===FURY?20:0,n.kind===FURY?20000:0,0,n.kind===BLADE?lights.SPECTRAL_BLADE_LIGHT:0,0]);
      assert.equal(n.bookkeepingFlags&(SEEN|JUST),0,'No ALREADY_SEEN owner or partially completed summon loop');
      for(let i=0;i<n.maxStatuses.length;i++)assert.equal(n.maxStatuses[i],i===N||i===LEV&&n.kind!==TOTEM?1000:0);
      for(let i=0;i<n.statuses.length;i++)if(i!==N)assert.equal(n.statuses[i],i===LEV&&n.kind!==TOTEM?1000:0);
      assert.ok(n.hp>0&&n.hp<=n.maxHP);assert.ok(n.x>=36&&n.x<=44&&n.y>=10&&n.y<=18);
      assert.notEqual(key(n),'40,14');assert.notEqual(key(n),'37,11');assert.notEqual(key(n),'37,17');
      if(n.kind===TOTEM){assert.equal(n.preparedSubject,1);assert.deepEqual([n.x,n.y,n.machineHome],[40,13,7]);assert.equal(n.leaderIndex,-1);assert.equal(n.leaderIsPreparedSubject,0);assert.equal(n.bookkeepingFlags&~(LEADER|WAS|WILL),0);}
      else {assert.equal(n.preparedSubject,0);assert.equal(n.machineHome,0);assert.equal(n.hp,n.maxHP);assert.equal(n.bookkeepingFlags&~(FOLLOW|BOUND|WAS|WILL|AUTO),0);assert.equal(n.bookkeepingFlags&AUTO,baseRole(n));assert.ok(n.bookkeepingFlags&BOUND);}
     };
     let phase='preparation',pressCount=0,turns=0;const P={x:40,y:14},R={x:39,y:14},slots=new Set(['39,12','40,12','41,12','39,13','41,13','39,14','41,14']);
     const basic=(s,interval)=>{
      assert.equal(s.depth,b.depth);assert.ok(['40,14','39,14'].includes(key(s)));assert.ok(s.hp>0&&s.hp<=100);assert.equal(s.nativeAI.eldritchTotem.playerRegenPerTurn,0);assert.equal(playerFlags(s)&~WILL,playerFlags(b)&~WILL);
      const ai=s.nativeAI.eldritchTotem;for(const field of ['playerTicksUntilTurn','ticksTillUpdateEnvironment','scentTurnNumber','justRested','justSearched','stealthBonus','awarenessBonus'])assert.ok(Number.isSafeInteger(ai[field]),'Missing passive timing scalar '+field);
      assert.deepEqual([ai.stealthBonus,ai.awarenessBonus],[0,0]);assert.ok(ai.scentTurnNumber>=1000&&ai.scentTurnNumber<=1051);assert.ok([0,1].includes(ai.justRested)&&[0,1].includes(ai.justSearched));
      for(let i=0;i<s.statuses.length;i++){if(i!==N&&i!==SEARCH)assert.equal(s.statuses[i],b.statuses[i]);if(i!==SEARCH)assert.equal(s.maxStatuses[i],b.maxStatuses[i]);}assert.ok([0,1].includes(s.statuses[SEARCH]));assert.ok([0,5].includes(s.maxStatuses[SEARCH]));if(s.statuses[SEARCH])assert.equal(s.maxStatuses[SEARCH],5);
      assert.ok(!s.gases||s.gases.length===0);const occupied=new Set();for(const n of s.monsters){native(n);assert.ok(!occupied.has(key(n)),'Duplicate actor occupancy');occupied.add(key(n));assert.ok(Number.isSafeInteger(n.scentAtCell)&&n.scentAtCell>=0&&n.scentAtCell<=ai.scentTurnNumber,'Actual scent must be a nonfuture unsigned value');}
      const cs=assertTotemObservedTerrain({state:s,catalog:terrainCatalog});for(const c of cs){const old=initialCells.get(key(c));assert.ok(old,'Unexpected observed cell');assert.deepEqual([c.liquid,c.gas,c.volume],[0,0,0]);assert.equal(c.dungeon,old.dungeon);assert.equal(c.machine,old.machine);assert.equal(c.flags&ROOM,old.flags&ROOM);assert.ok([0,RED,RUBBLE].includes(c.surface));
       if(c.surface===RED)assert.ok(phase==='attack'&&Math.abs(c.x-40)+Math.abs(c.y-14)<=(chosenKind===BLADE?1:2),'Blood outside the one native incoming-hit window');
       if(c.surface===RUBBLE)assert.ok(phase==='attack'&&Math.abs(c.x-40)+Math.abs(c.y-13)<=1,'Rubble outside native dagger blood radius');
       if(s.cells)assert.equal(!!(c.flags&HAS),occupied.has(key(c)),'Live list/occupancy mismatch');
      }
      assertTotemObservedFixedFlags({state:s,initialCells,flags:flagBits,kinds:flagKinds,interval,selectedKind:chosenKind});
      if('maxHP'in s){assert.deepEqual([s.maxHP,s.ended,s.inProgress,s.regenPerTurn,s.weapon,s.armor,s.ringLeft,s.ringRight,s.pack.length],[100,0,1,0,97,0,0,0,1]);assert.deepEqual(s.ringBonuses,b.ringBonuses);assert.deepEqual(s.playerCombat,b.playerCombat);assert.deepEqual([s.strength,s.movementSpeed,s.attackSpeed,s.weaknessAmount,s.poisonAmount],[12,100,100,0,0]);assert.deepEqual(s.pack,b.pack);}
     };
     assert.deepEqual([b.turn,b.absoluteTurnNumber,b.hp,b.maxHP,b.strength,b.playerCombat.accuracy,b.playerCombat.defense,b.monsters.length],[0,0,100,100,12,100,0,1]);
     assert.deepEqual([b.statuses[N],b.maxStatuses[N],b.statuses[DON],b.maxStatuses[DON],timer(b)],[1075,2150,0,3,100000]);
     assert.deepEqual([b.playerCombat.damageMin,b.playerCombat.damageMax,b.movementSpeed,b.attackSpeed,b.weaknessAmount,b.poisonAmount,b.inWater,b.searching,b.automationActive,b.autoPlayingLevel],[3,4,100,100,0,0,0,0,0,0]);
     assert.deepEqual(b.ringBonuses,{clairvoyance:0,stealth:0,regeneration:0,transference:0,lightMultiplier:1,awareness:0,wisdom:0,reaping:0});
     assert.ok(b.statuses.every((v,i)=>v===(i===N?1075:0)));assert.ok(b.maxStatuses.every((v,i)=>v===(i===N?2150:i===DON?3:0)));
     assert.deepEqual([subject.hp,subject.ticksUntilTurn,subject.statuses[N],subject.bookkeepingFlags,subject.turnsSpentStationary],[lethal?1:80,100,1000,0,0]);native(subject);
     const w=b.pack[0];assert.deepEqual([w.letter,w.category,w.kind,w.enchant,w.netEnchant,w.strengthRequired,w.quantity,w.equipped,w.identified,w.cursed,w.runicKind,w.damageMin,w.damageMax,w.damageClump],[97,V('itemCategory','WEAPON'),V('weaponKind','DAGGER'),0,0,12,1,1,1,0,-1,3,4,1]);assert.equal(w.flags&V('itemFlags','ITEM_SNEAK_ATTACK_BONUS'),V('itemFlags','ITEM_SNEAK_ATTACK_BONUS'));
     assert.equal(b.cells.length,81);for(const c of b.cells){assert.deepEqual([c.liquid,c.surface,c.gas,c.volume],[0,0,0,0]);const wire=key(c)==='40,14'||key(c)==='40,13';assert.equal(c.machine,wire?7:0);assert.equal(!!(c.flags&ROOM),wire);assert.equal(c.flags&(POWER|DEPRESSED),0);assert.equal(c.mechFlags&terrainCatalog.mechFlags.TM_IS_SECRET,0);
      assert.equal(c.dungeon,key(c)==='40,14'?PLATE:key(c)==='37,11'?T('UP_STAIRS'):key(c)==='37,17'?T('DOWN_STAIRS'):T('FLOOR'));}
     assert.deepEqual([b.upX,b.upY,b.downX,b.downY],[37,11,37,17]);assert.equal(b.nativeAI.eldritchTotem.scentTurnNumber,1000);basic(b,0);
     assert.ok(tr0.observations.length>0,'No actual preparation publication');const {messageRows:ignored,...lastPreparation}=tr0.observations.at(-1);assert.deepEqual(lastPreparation,projection(b),'Last genuine preparation must equal initial state');
     const normalize=s=>{const x=structuredClone(physical(s));delete x.fixture;x.monsters.find(n=>n.preparedSubject).hp=0;return x;};if(lethal)controls.set(control,normalize(b));else if(controls.has(control))assert.deepEqual(normalize(b),controls.get(control),'Initial HP control changed undeclared state/RNG');
     if(input_path==='pc-keyboard')pc.set(pair,{initial:physical(b)});else if(pc.has(pair))assert.deepEqual(physical(b),pc.get(pair).initial);
     d.entry.initial_control_comparison='Only fixture/ready/current prepared Totem HP normalized; every other full field/RNG retained';d.entry.oracle_ref=nativeOracleProvenance();d.entry.catalog_source_sha256=catalog.source_sha256;d.entry.terrain_metadata_oracle={...terrainCatalog.source_sha256,table_sha256:terrainCatalog.table_sha256,rows:215,scope:'Source consistency only; no terrain/game definition credit'};
     const ui=await d.state(),wait0=await d.wait(),events0=(await d.trace()).native_trace.length;await d.page.locator('#zoom').selectOption('14');assert.deepEqual(await d.state(),ui);assert.equal((await d.wait()).serial,wait0.serial);assert.equal((await d.trace()).native_trace.length,events0);
     const capture=async(label,state,checks)=>{await d.screenshot(label);const samples=[];for(const c of checks)samples.push(await publicPixels(d,...c.args,c.options));assert.deepEqual(await d.state(),state,'Capture changed state/RNG');d.entry.public_samples.push({label,samples});};
     d.entry.public_samples=[];await capture('prepared-visible-totem-and-underfoot-pressure',b,[{args:[40,13,...G('G_TOTEM')],options:{totem:true}}]);
     d.entry.action_observations=[];d.entry.pressure_attempts=[];let before=b,cohort=null,birth=null;
     const childrenSame=(s,reference,{bound=true,positions=false}={})=>{const list=children(s);assert.equal(list.length,reference.length);for(let i=0;i<list.length;i++){assert.equal(list[i].kind,reference[i].kind);if(positions)assert.deepEqual([list[i].x,list[i].y],[reference[i].x,reference[i].y]);if(bound){assert.equal(role(list[i]),baseRole(list[i])|FOLLOW|BOUND);assert.equal(list[i].leaderIsPreparedSubject,1);assert.equal(list[i].leaderIndex,s.monsters.indexOf(totem(s)));}}};
     async function perform(command,action){
      phase=action;const turn=turns+1,prior=await d.trace(),oi=prior.observations.length,ei=prior.native_trace.length,oldText=words(await publicText(d)),messageProofs=[];let confirms=0,acks=0;
      // Persist the complete attempted prefix even when a public proof asserts.
      const record={command,action,turn,event_start:ei,fresh_start:oi,press:pressCount,completed:false,public_message_proofs:messageProofs};d.entry.action_observations.push(record);
      await d.input(command);
      for(;;){
       const now=await d.state(),wanted=action==='press'?[['pressure-click','pressure\\s+plate\\s+clicks'],...(children(now).length?[['summon','crackles\\s+with\\s+energy\\s+as\\s+you\\s+touch\\s+the\\s+glyph']]:[])]:action==='attack'&&lethal?[['destroyed','destroyed\\s+(?:the\\s+)?eldritch\\s+totem'],['bound-death','dissipates\\s+into\\s+thin\\s+air']]:[];
       for(const [name,pattern]of wanted)if(!messageProofs.some(p=>p.name===name)){
        if(name==='pressure-click'){
         const ownerWait=await d.wait(),ownerTrace=await d.trace(),context={action,press:pressCount,turn,command,eventStart:ei,traceCount:ownerTrace.native_trace.length,prefix:ownerTrace.native_trace.slice(ei),wait:ownerWait,state:now,nutrition:N,totem:TOTEM,plate:PLATE,depressed:DEPRESSED,hasPlayer:TF('HAS_PLAYER'),power:POWER,parentHP:lethal?1:80},eligibility=totemPressureCaptionOwner(context);
         (record.pressure_caption_owners??=[]).push({eligible:eligibility.eligible,reasons:eligibility.reasons,turn:now.turn,wait:ownerWait,trace_count:context.traceCount,parentclock:totem(now)?.ticksUntilTurn,children:children(now).length,plate_flags:now.nativeAI.eldritchTotem.plateCell.flags});
         if(!eligibility.eligible)continue;
         const measurement_index=d.entry.caption_measurements?.length??0,proof=await visibleMessage(d,pattern,'message-'+turn+'-'+name);if(proof){const measurement=d.entry.caption_measurements[measurement_index];assert.deepEqual(measurement.native_before,now);assert.deepEqual(measurement.wait_before,ownerWait);assert.equal(measurement.trace_count_before,context.traceCount);messageProofs.push({name,...proof,pressure_binding:{context,measurement_index}});}
        }else {const proof=await visibleMessage(d,pattern,'message-'+turn+'-'+name);if(proof)messageProofs.push({name,...proof});}
       }
       const wait=await d.wait(),descriptor=wait.descriptor[0];if(wait.kind==='command')break;
       if(descriptor===3){assert.equal(command,'l','Only actual pressure reentry may confirm');assert.equal(action,'press');assert.equal(confirms++,0,'Exactly one pressure confirm per reentry');assert.match(words(await publicText(d)),/step onto the pressure plate/);assert.deepEqual(await d.state(),before,'Preentry confirm cannot advance state/RNG');await d.input('y');}
       else {assert.equal(descriptor,6,'Only real native ACK6 after the prescribed game key');assert.ok(acks++<80,'Per-command native ACK cap exceeded');
        const pressure=messageProofs.find(p=>p.name==='pressure-click')?.pressure_binding;if(pressure&&!pressure.submission){pressure.submission={state:await d.state(),wait,trace_count:(await d.trace()).native_trace.length};assert.deepEqual(pressure.submission.wait,pressure.context.wait);assert.deepEqual(pressure.submission.state,pressure.context.state);assert.equal(pressure.submission.trace_count,pressure.context.traceCount);}
        await d.input('Space');}
      }
      const after=await d.state(),tr=await d.trace(),events=tr.native_trace.slice(ei),fresh=tr.observations.slice(oi);Object.assign(record,{event_end:tr.native_trace.length,fresh_end:tr.observations.length,actual_events:events.map(e=>e.event),confirm_count:confirms,ack_count:acks,after:projection(after)});
      assert.equal(events[0].event[0],0);assert.equal(events[0].event[1],command.codePointAt(0));assert.deepEqual(events[0].before,before);for(const e of events.slice(1)){assert.equal(e.event[0],0);assert.ok(e.descriptor[0]===6&&e.event[1]===32||command==='l'&&e.descriptor[0]===3&&e.event[1]===121,'Unexpected consumed event');}
      if(action==='press'){
       const pressure=messageProofs.filter(p=>p.name==='pressure-click');assert.equal(pressure.length,1,'Currentpress actual ACK caption/PNG unreached');const binding=pressure[0].pressure_binding;assert.ok(binding?.submission,'Actual pressure ACK submission not recorded');const measurement=d.entry.caption_measurements[binding.measurement_index];binding.claim=assertTotemPressureCaptionClaim({context:binding.context,measurement,submission:binding.submission,trace:tr.native_trace});
      }
      assert.equal(confirms,command==='l'?1:0);chosenKind??=children(after)[0]?.kind??null;basic(after,turn);assert.deepEqual([after.turn,after.absoluteTurnNumber,after.statuses[N]],[turn,turn,1075-turn]);assert.equal(timer(after),100000);assert.equal(cell(after,40,14).flags&POWER,0);assert.equal(after.nativeAI.eldritchTotem.justRested,0);assert.equal(after.nativeAI.eldritchTotem.justSearched,0);assert.equal(after.nativeAI.eldritchTotem.scentTurnNumber,1000+3*turn);
      assert.deepEqual([after.x,after.y],action==='retreat'?[39,14]:[40,14]);const parent=totem(after),born=children(after);
      if(action==='press'){
       assert.ok(parent);assert.equal(after.hp,100);assert.equal(parent,after.monsters.at(-1));assert.deepEqual([parent.hp,parent.ticksUntilTurn,parent.statuses[N],parent.turnsSpentStationary],[lethal?1:80,100,1000-turn,pressCount]);assert.ok(cell(after,40,14).flags&DEPRESSED);assert.equal(messageProofs.some(p=>p.name==='pressure-click'),true,'Actual pressure ACK caption/PNG unreached');assert.equal(after.statuses[SEARCH],0);
       // messageRows are exported by public cells, not native state; descriptor6
       // state itself must still witness the preactivation clock and depressed tile.
       const preactivation=events.slice(1).filter(e=>e.descriptor[0]===6).map(e=>e.before).find(s=>totem(s)?.ticksUntilTurn===0&&children(s).length===0);
       assert.ok(preactivation,'Actual pressure preactivation native wait unreached');const p=totem(preactivation);assert.deepEqual([preactivation.turn,preactivation.hp,p.statuses[N],p.turnsSpentStationary],[turn,100,1000-turn,pressCount-1]);assert.equal(preactivation.nativeAI.eldritchTotem.playerTicksUntilTurn,100);assert.equal(preactivation.nativeAI.eldritchTotem.ticksTillUpdateEnvironment,100);assert.ok(cell(preactivation,40,14).flags&DEPRESSED);
       if(born.length){const row=rows.find(r=>r.members[0]===born[0].kind);assert.ok(row);assert.ok(born.length>=row.counts[0][0]&&born.length<=row.counts[0][1]);assert.ok(born.every(n=>n.kind===born[0].kind));assert.equal(role(parent),LEADER);for(const n of born){assert.ok(slots.has(key(n)),'Birth outside all seven native available nearest slots');assert.deepEqual([n.hp,n.ticksUntilTurn,n.statuses[N],n.turnsSpentStationary],[n.maxHP,101,1000,0]);assert.equal(n.bookkeepingFlags&WILL,0);}childrenSame(after,born);cohort=structuredClone(born);birth=structuredClone(after);assert.equal(messageProofs.some(p=>p.name==='summon'),true,'Natural summon caption/PNG unreached');d.entry.selected_native_horde={index:row.index,kind:row.members[0],count:born.length,range:row.counts[0],frequency:row.frequency,flags:row.flags};}
       else {assert.equal(role(parent),0);assert.equal(after.monsters.length,1);assert.equal(messageProofs.some(p=>p.name==='summon'),false);}
       d.entry.pressure_attempts.push({press:pressCount,turn,command,natural_success:born.length>0,children:born.length,preactivation:projection(preactivation),settled:projection(after)});
      }else if(action==='retreat'){
       assert.equal(after.hp,100);assert.equal(after.monsters.length,1);assert.deepEqual([parent.hp,parent.ticksUntilTurn,parent.statuses[N],parent.turnsSpentStationary],[lethal?1:80,100,1000-turn,pressCount-1]);assert.equal(cell(after,40,14).flags&DEPRESSED,0,'Actually empty environment must rearm pressure');assert.equal(cell(after,40,14).flags&(HAS|TF('HAS_PLAYER')|TF('HAS_ITEM')),0);assert.equal(role(parent),0);
      }else if(action==='search'){
       assert.equal(after.hp,100);assert.ok(parent);childrenSame(after,cohort,{positions:true});assert.deepEqual([parent.hp,parent.ticksUntilTurn,parent.statuses[N],parent.turnsSpentStationary],[lethal?1:80,100,1000-turn,pressCount]);assert.equal(role(parent),LEADER);assert.deepEqual([after.statuses[SEARCH],after.maxStatuses[SEARCH]],[1,5]);assert.ok(after.stealthRange>=3,'Manual search caches source finite tracking lower bound');
       for(const n of born)assert.deepEqual([n.hp,n.ticksUntilTurn,n.statuses[N],n.turnsSpentStationary],[n.maxHP,1,999,0]);
      }else if(!lethal){
       assert.ok(parent);childrenSame(after,cohort);assert.equal(role(parent),LEADER);assert.deepEqual([parent.ticksUntilTurn,parent.statuses[N],parent.turnsSpentStationary],[100,1000-turn,pressCount]);assert.ok([76,77].includes(parent.hp));assert.deepEqual([after.statuses[SEARCH],after.maxStatuses[SEARCH]],[0,5]);for(const n of born)assert.equal(n.statuses[N],998);
       const aiCells=before.cells.map(c=>({...c,...assertTotemCellTerrainMetadata(c,terrainCatalog)}));const witness=assertTotemJointAISchedule({before:children(before),after:born,cells:aiCells,player:P,parent:{x:40,y:13},flags:flagBits,tracking,levitating:LEV,maxDamage:cohort[0].kind===FURY?11:1,damage:before.hp-after.hp,finiteTracking:{cachedStealthRange:before.stealthRange,scentTurn:after.nativeAI.eldritchTotem.scentTurnNumber}});d.entry.native_ai_witnesses=[{command,turn,...witness}];assert.ok(after.hp>=100-(cohort[0].kind===FURY?33:7));
      }else {assert.equal(after.monsters.length,0);assert.equal(after.hp,100,'Bound cleanup precedes the one possible child AI window');for(const n of before.monsters)assert.equal(cell(after,n.x,n.y).flags&HAS,0);assert.deepEqual([after.statuses[SEARCH],after.maxStatuses[SEARCH]],[0,5]);}
      if(action==='attack'){assert.equal(cell(after,40,13).surface,RUBBLE);if(lethal)assert.equal(messageProofs.length,2,'Native destruction and bound cleanup captions/PNGs unreached');}
      for(const n of after.monsters)assert.equal(n.bookkeepingFlags&WILL,0);assert.equal(playerFlags(after)&WILL,0);
      const boundaries=[{state:before,owner:'previous command wait'},...events.slice(1).map(e=>({state:e.before,owner:e.descriptor[0]===3?'real preentry confirm3':'real pressure/message ACK6'})),{state:after,owner:'completed source turn/actual endturn render owner'}];for(const {state}of boundaries)basic(state,turn);
      const paths=[];for(const stream of [[before,...fresh,after],[before,...events.map(e=>e.before),after]]){
       let ranks=[{rank:0,vision:0}],hp=before.hp,rng=before.rng,flashPhase=0,remaining=before.monsters.length,parentGone=false,demoted=false;const history=[],visibility=new Map(before.monsters.map((n,i)=>[n.preparedSubject?'parent':i,!!(n.bookkeepingFlags&WAS)]));
       for(const s of stream){basic(s,turn);assert.ok(s.hp<=hp,'HP reversal in separate actual stream');hp=s.hp;assert.ok(s.rng>=rng&&s.rng<=after.rng,'RNG counter outside actual interval');rng=s.rng;
        const rejected=[];const candidates=boundaries.flatMap((point,i)=>{try{assert.deepEqual(kernel(s),kernel(point.state));return flagStageCandidates(s,{before,after,reference:point.state,rank:i,last:boundaries.length-1,initialCells,flags:flagBits,kinds:flagKinds,interval:turn,selectedKind:chosenKind}).map(vision=>({rank:i,vision}));}catch(error){if(rejected.length<4)rejected.push({rank:i,guard:error.message.slice(0,1400)});return [];}}).filter(v=>ranks.some(old=>v.rank>=old.rank&&v.vision>=old.vision));
        if(!candidates.length)throw Error('No source-owned pressure/search/attack kernel '+JSON.stringify({turn,command,action,actual:kernel(s),first_rejected_guards:rejected,expected:boundaries.map(p=>({owner:p.owner,kernel:kernel(p.state)}))}));ranks=candidates;
        const kids=children(s),p=totem(s);if(kids.length){assert.ok(cohort,'Unplanned cohort');assert.ok(kids.every(n=>n.kind===cohort[0].kind));}
        if(action==='press'&&kids.length){assert.equal(kids.length,cohort.length);assert.ok(p);assert.equal(s.monsters.at(-1),p);childrenSame(s,cohort,{positions:true});assert.equal(p.turnsSpentStationary,pressCount);assert.equal(role(p),LEADER);for(const n of kids)assert.deepEqual([n.ticksUntilTurn,n.statuses[N],n.turnsSpentStationary],[101,1000,0]);}
        if(action==='search'){childrenSame(s,cohort,{positions:true});assert.ok(p);assert.equal(role(p),LEADER);for(const n of kids)assert.equal(n.turnsSpentStationary,0);}
        if(action==='attack'&&!lethal){childrenSame(s,cohort);assert.ok(p);assert.equal(role(p),LEADER);}
        if(action==='attack'&&lethal){assert.ok(s.monsters.length<=remaining,'Dead member reappeared');remaining=s.monsters.length;if(p){assert.ok(!parentGone);assert.equal(p.hp,1);assert.equal(role(p),LEADER);assert.equal(kids.length,cohort.length);}else parentGone=true;const original=children(before);let last=-1;for(const n of kids){const i=original.findIndex(o=>o.x===n.x&&o.y===n.y);assert.ok(i>last,'Bound removal is an unchanged ordered subsequence');last=i;const old=original[i];assert.equal(n.kind,old.kind);assert.deepEqual([n.hp,n.ticksUntilTurn,n.statuses[N],n.turnsSpentStationary],[old.hp,old.ticksUntilTurn,old.statuses[N],old.turnsSpentStationary]);}const linked=kids.filter(n=>n.bookkeepingFlags&FOLLOW);assert.ok(!linked.length||linked.length===kids.length);if(linked.length){assert.ok(!demoted);for(const n of kids){assert.equal(n.leaderIsPreparedSubject,1);assert.equal(n.leaderIndex,p?s.monsters.indexOf(p):-1);}}else if(kids.length){assert.ok(!p);demoted=true;for(const n of kids){assert.equal(n.leaderIsPreparedSubject,0);assert.equal(n.leaderIndex,-1);assert.equal(role(n),baseRole(n)|BOUND);}}}
        const pending=s.monsters.filter(n=>n.bookkeepingFlags&WILL);if(action==='press'){assert.ok(!p||!(p.bookkeepingFlags&WILL));assert.ok(kids.every(n=>!!(n.bookkeepingFlags&WILL)===!!pending.length),'Birth clear loop is atomic');const f=kids.length?(pending.length?1:2):0;assert.ok(f>=flashPhase);flashPhase=f;}
        else {assert.ok(kids.every(n=>!(n.bookkeepingFlags&WILL)));if(p&&(p.bookkeepingFlags&WILL))assert.ok(action==='attack'&&!lethal&&[76,77].includes(p.hp));if(playerFlags(s)&WILL)assert.ok(action==='attack'&&!lethal&&s.hp<before.hp);const count=pending.length+Number(!!(playerFlags(s)&WILL));if(count){assert.ok(flashPhase<2);flashPhase=1;}else if(flashPhase===1)flashPhase=2;}
        for(const [i,n]of s.monsters.entries()){const id=n.preparedSubject?'parent':i,v=!!(n.bookkeepingFlags&WAS);if(n.publicVisible===1&&visibility.get(id)===true)assert.ok(v,'Continuously visible WAS cannot clear');visibility.set(id,v);}history.push({ranks,flash_phase:flashPhase,pending_monsters:pending.length,player_pending:Number(!!(playerFlags(s)&WILL))});
       }
       assert.ok(ranks.some(v=>v.rank===boundaries.length-1&&v.vision===1),'Final command/source lighting phase unreachable');paths.push(history);
      }
      Object.assign(record,{hp_before:before.hp,hp_after:after.hp,NUT:after.statuses[N],source_paths:paths,source_boundary_owners:boundaries.map(p=>p.owner),public_text:words(await publicText(d)),live_count:after.monsters.length,completed:true});
      if(action==='press'&&!cohort||action==='retreat')await capture('pressure-'+pressCount+'-'+action,after,[{args:[40,13,...G('G_TOTEM')],options:{totem:true}}]);
      else if(action!=='attack'||!lethal){const child=born.find(n=>n.fieldOfView===1&&n.publicVisible===1);assert.ok(child,'No actual public cohort glyph witness');assert.equal(parent.publicVisible,1);assert.equal(parent.fieldOfView,1);await capture(action==='press'?'first-natural-pressure-cohort':action==='search'?'search-maintained-clock1-cohort':'surviving-leader-cohort',after,[{args:[40,13,...G('G_TOTEM')],options:{totem:true}},{args:[child.x,child.y,catalog.monsters[child.kind].nativeGlyph,nativeGlyph.unicode.get(child.kind===BLADE?'G_WEAPON':'G_FURY')]}]);}
      else {const old=children(before).find(n=>n.fieldOfView===1&&n.publicVisible===1);assert.ok(old);const checks=[[40,13],[old.x,old.y]].map(([x,y])=>{const c=cell(after,x,y),g=c.surface===RUBBLE?'G_RUBBLE':c.surface===RED?'G_FLOOR_ALT':'G_FLOOR';return {args:[x,y,...G(g)],options:{empty:false}};});await capture('destroyed-leader-and-former-child-cell',after,checks);}
      turns=turn;before=after;return after;
     }
     for(pressCount=1;pressCount<=8;pressCount++){
      if(pressCount>1)await perform('h','retreat');await perform(pressCount===1?'.':'l','press');if(cohort)break;
     }
     d.entry.natural_press_cap=8;d.entry.natural_press_count=d.entry.pressure_attempts.length;if(!cohort){d.entry.goal_status='UNREACHED_ALL_8_NATURAL_ATTEMPTS';throw Error('UNREACHED: all eight natural native summon attempts failed; full prefix retained');}
     await perform('s','search');await perform('k','attack');assert.ok(birth&&cohort.length>0);
     const actual=(await d.trace()).native_trace.slice(startEvent),game=actual.filter(e=>e.descriptor[0]!==3&&e.descriptor[0]!==6),expected=['.',...Array.from({length:pressCount-1},()=>['h','l']).flat(),'s','k'];assert.deepEqual(game.map(e=>e.event.slice(0,2)),expected.map(k=>[0,k.codePointAt(0)]));const confirms=actual.filter(e=>e.descriptor[0]===3),acks=actual.filter(e=>e.descriptor[0]===6);assert.equal(confirms.length,pressCount-1);assert.ok(game.length<=17&&acks.length<=80*game.length);for(const e of confirms)assert.equal(e.event[1],121);for(const e of acks)assert.equal(e.event[1],32);
     d.entry.actual_command_count=game.length;d.entry.actual_confirm_count=confirms.length;d.entry.actual_ack_count=acks.length;d.entry.actual_events=actual.map(e=>e.event);d.entry.goal_status='COMPLETE';d.entry.new_definition_scope='Only MK_ELDRITCH_TOTEM and HORDE_DIES_ON_LEADER_DEATH representative partial';d.entry.cross_condition_final_RNG_comparison=false;
     d.effect(()=>{assert.equal(birth.monsters.length,cohort.length+1);assert.equal(before.monsters.length,lethal?0:cohort.length+1);});
     if(input_path==='pc-keyboard'){Object.assign(pc.get(pair),{final:physical(before),events:actual.map(e=>e.event)});d.entry.pc_touch_comparison='PC full observed state and actual input path reference';}else if(pc.has(pair)){assert.deepEqual(physical(before),pc.get(pair).final);assert.deepEqual(actual.map(e=>e.event),pc.get(pair).events);d.entry.pc_touch_comparison='Complete initial/final observed state/RNG and every actual input equal';}else d.entry.pc_touch_comparison='PC not selected: comparison credit0';

    }});
  }
 }
 assert.equal(cases.length,variants.length*4);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runFixtureSuite({name:'eldritch-totem',createCases:createEldritchTotemCases,filter:process.env.BROGUE_ELDRITCH_TOTEM});
