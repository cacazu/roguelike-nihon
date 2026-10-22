// Native environmental fire corona, actual burn, immunity and SURFACE obsidian.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {runFixtureSuite,sceneGroups as S,root} from './fixture-browser.mjs';
import {generateDataInventory,validateDataSnapshot} from './inventory-features.mjs';
import {readOriginalHordeCatalogs} from './horde-mutations.mjs';
import {publicText} from './knowledge-feats.mjs';
import {readNativeGlyphSources,assertNativeGlyphPixels,nativeOracleProvenance} from './original-glyph-mask.mjs';

const physical=({ready,...s})=>s;
const key=c=>c.x+','+c.y;
const distance=(c,x,y)=>Math.abs(c.x-x)+Math.abs(c.y-y);
const witnesses=[[41,13],[42,14],[41,15],[40,14]];
const projection=(s,messageRows)=>({
 turn:s.turn,absoluteTurnNumber:s.absoluteTurnNumber,rng:s.rng,x:s.x,y:s.y,hp:s.hp,depth:s.depth,
 statuses:s.statuses,maxStatuses:s.maxStatuses,playerCell:s.playerCell,spawnCell:s.spawnCell,mapMetrics:s.mapMetrics,
 nativeAI:s.nativeAI,cells:s.cells,...(s.portal?{portal:s.portal}:{}),stealthRange:s.stealthRange,
 gases:s.cells.filter(c=>c.gas&&c.volume>0),surfaces:s.cells.filter(c=>c.surface),monsters:s.monsters,messageRows
});

// Read only the actual C public cell and pixels already drawn by production Rust.
async function cellPixels(d,x,y,glyph,unicode){
 const cx=x+21,cy=y+3,cell=await d.publicCell(cx,cy);
 assert.deepEqual(cell.slice(0,2),[glyph,unicode]);
 const v=await d.page.evaluate(({x,y})=>{
  const c=document.querySelector('#game'),r=c.getBoundingClientRect(),e=document.querySelector('#viewport'),
   q=e.getBoundingClientRect(),vv=visualViewport,cw=r.width/100,ch=r.height/34;
  return {cw,ch,pixel_width:c.width/100,pixel_height:c.height/34,rect:{left:r.left+x*cw,right:r.left+(x+1)*cw,top:r.top+y*ch,bottom:r.top+(y+1)*ch},
   clip:{left:Math.max(q.left+e.clientLeft,0,vv?.offsetLeft??0),top:Math.max(q.top+e.clientTop,0,vv?.offsetTop??0),
    right:Math.min(q.left+e.clientLeft+e.clientWidth,innerWidth,(vv?.offsetLeft??0)+(vv?.width??innerWidth)),
    bottom:Math.min(q.top+e.clientTop+e.clientHeight,innerHeight,(vv?.offsetTop??0)+(vv?.height??innerHeight))},
   pixels:Array.from(c.getContext('2d').getImageData(x*c.width/100,y*c.height/34,c.width/100,c.height/34).data)};
 },{x:cx,y:cy});
 assert.ok(v.cw>=10&&v.ch>=14);
 assert.ok(v.rect.left>=v.clip.left&&v.rect.right<=v.clip.right&&v.rect.top>=v.clip.top&&v.rect.bottom<=v.clip.bottom,
  'Witness cell must be completely inside the actual viewport');
 const channel=n=>Math.floor((Math.max(0,Math.min(100,n))*255+50)/100),
  fg=cell.slice(2,5).map(channel),bg=cell.slice(5,8).map(channel);
 let ink=0,backing=0;
 for(let i=0;i<v.pixels.length;i+=4){
  assert.equal(v.pixels[i+3],255);
  const p=v.pixels.slice(i,i+3);if(p.every((n,j)=>n===bg[j]))backing++;else ink++;
  for(let j=0;j<3;j++)assert.ok(p[j]>=Math.min(fg[j],bg[j])-1&&p[j]<=Math.max(fg[j],bg[j])+1,
   'Glyph must use the current C foreground/background palette');
 }
 assert.ok(ink>0&&backing>0,'Blank or solid backing is not a glyph witness');
 const shape=unicode===readNativeGlyphSources().unicode.get('G_FIRE')?assertNativeGlyphPixels({pixels:v.pixels,width:v.pixel_width,height:v.pixel_height,cell}):null;
 const pixels_sha256=createHash('sha256').update(Buffer.from(v.pixels)).digest('hex');delete v.pixels;
 return {native:{x,y},public:{x:cx,y:cy},cell,geometry:v,foreground_rgb:fg,background_rgb:bg,
  ink_pixels:ink,backing_pixels:backing,pixels_sha256,palette_bounds_pass:true,...(shape?{native_original_shape:shape}:{} )};
}

function readGlyphs(base){
 const h=readFileSync(path.join(base,'src/brogue/Rogue.h'),'utf8'),
  body=/enum displayGlyph\s*\{([\s\S]*?)\};/.exec(h);assert.ok(body);
 let value=-1;const out={};
 for(const field of body[1].replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').split(',')){
  if(!field.trim())continue;
  const m=/^\s*(G_\w+)(?:\s*=\s*(\d+))?\s*$/.exec(field);assert.ok(m,'Unsupported glyph enum '+field);
  value=m[2]===undefined?value+1:Number(m[2]);out[m[1]]=value;
 }
 return out;
}

export function createFlamedancerCoronaCases({variants=['brogue','rapid_brogue','bullet_brogue']}={}){
 const inv=generateDataInventory({gitMetadata:false});validateDataSnapshot(inv);
 const V=(domain,symbol)=>{const e=inv.definitions[domain].entries.find(e=>e.symbol===symbol);assert.ok(e,domain+':'+symbol);return e.value;},
  T=n=>V('tileType',n),ST=n=>V('statusEffects','STATUS_'+n),TF=n=>V('tileFlags',n),
  MB=n=>V('monsterBookkeepingFlags','MB_'+n),N=ST('NUTRITION'),BURN=ST('BURNING'),IMM=ST('IMMUNE_TO_FIRE'),DON=ST('DONNING'),
  FIRE=T('FLAMEDANCER_FIRE'),OBS=T('OBSIDIAN'),BLOOD=T('RED_BLOOD'),wasVisible=MB('WAS_VISIBLE'),
  dancing=TF('TERRAIN_COLORS_DANCING'),caught=TF('CAUGHT_FIRE_THIS_TURN'),known=TF('KNOWN_TO_BE_TRAP_FREE'),
  searched=TF('SEARCHED_FROM_HERE'),tileWasVisible=TF('WAS_VISIBLE'),visible=TF('VISIBLE'),shadow=TF('IS_IN_SHADOW'),topology=TF('IN_LOOP')|TF('IS_CHOKEPOINT'),
   pc=new Map(),controls=new Map(),cases=[];
 const pin=process.env.BROGUE_ORIGINAL_SOURCE||path.join(root,'.local/upstream-sources/tmewett-BrogueCE-1ba4240'),
  glyph=readGlyphs(pin);assert.deepEqual(readGlyphs(root),glyph);
 for(const base of [root,pin]){
  const p=readFileSync(path.join(base,'src/platform/platformdependent.c'),'utf8');
  assert.match(p,/case G_FLAMEDANCER:\s*return 'F'/);
  assert.match(p,/case G_FIRE:\s*return /);assert.match(p,/case G_FLOOR:\s*return /);
  const h=readFileSync(path.join(base,'src/platform/platform.h'),'utf8');
  assert.match(h,/0x22CF/i);assert.match(h,/0xB7|0x00B7/i);
 }
 const kind=V('monsterTypes','MK_FLAMEDANCER'),fireFlags=V('terrainFlagCatalog','T_IS_FIRE'),
  stand=V('terrainMechanicalFlagCatalog','TM_STAND_IN_TILE'),
  fireMech=stand|V('terrainMechanicalFlagCatalog','TM_VANISHES_UPON_PROMOTION')|V('terrainMechanicalFlagCatalog','TM_VISUALLY_DISTINCT');
 for(const variant of variants){
  const catalog=readOriginalHordeCatalogs(inv,variant),base=catalog.monsters[kind];
  assert.deepEqual([base.maxHP,base.defense,base.accuracy,base.damage,base.nativeMovementSpeed,base.nativeAttackSpeed,
   base.nativeDFChance,base.nativeDFType],[65,80,120,[3,8,2],100,100,100,V('dungeonFeatureTypes','DF_FLAMEDANCER_CORONA')]);
  for(const input_path of ['pc-keyboard','touch'])for(const immune of [false,true]){
   const pair=variant+'-'+immune,control=variant+'-'+input_path;
   cases.push({
    id:variant+'-'+input_path+'-flamedancer-'+(immune?'initial_fire_immunity1000':'exposed'),
    variant,input_path,seed:42,fixture_id:immune?S.FLAMEDANCER_CORONA_IMMUNE:S.FLAMEDANCER_CORONA,
    observe_preparation_frames:true,observe_full_cells:true,
    feature_ids:['cmd.rest','combat','statuses','ai.monsters','terrain.features','terrain.tiles','turn.environment'],
    targets:[['monsterTypes','MK_FLAMEDANCER'],['dungeonFeatureTypes','DF_FLAMEDANCER_CORONA'],
     ['tileType','FLAMEDANCER_FIRE'],['dungeonFeatureTypes','DF_OBSIDIAN'],['tileType','OBSIDIAN']]
     .map(([domain,symbol])=>({domain,symbol})),
    source_refs:['Globals.c1133/656/494/749/427 native shared Flamedancer/corona/fire/obsidian',
     'Time.c2250/2318/2397..2421/2565 existing burn precedes clock/NPCnutrition/corona/playernutrition',
     'Architect.c3223..3256 placement skip/newfire/write/refresh/expose;3454 tail exposure even on unchanged fire',
     'Time.c1441..1486 CAUGHT prevents same-update promotion;1101..1121 transientNOTHING then SURFACE obsidian',
     'Combat.c1547..1554/1598 native D1..3 RED_BLOOD before HP;Monsters.c1868/1955 intrinsic fire RNG retained',
     'IO.c931..956/1141..1251 actual terrain/actor/player colors and DANCING; genuine host.frame only'],
    assertions:[
     'Declared initial9x9safeFLOOR/player39,14HP100/no regeneration/empty gearpack, native Flamedancer41,14HP65 with generated sleeping/tracking state and all native information retained; only initial clock10000 isolates8environmental updates.',
     'Exactly8realperiod rests plus only genuinely requested descriptor6 ACKs. First fire gives exposedBURN7/HP100 or actually exposed immunityBURN0/HP100. Every later exposed rest loses1..3 then corona restoresBURN7 even if finalsurface is obsidian.',
     'Couple each full/fresh/event-before HP/BURN/NUT/clock and every observed tile to source stages, including blood beforeHP, newfire beforeexposure, oldfire->NOTHING->OBSIDIAN. Validate streams independently without inserting or rearranging observations.',
     'Fixed four unoccupied adjacent cells must show actualfire on rest1 and at least one samecell naturalfire->SURFACE obsidian byrest8 with unclipped glyph/Cpalette/viewport PNG. Unreached isFAIL; never reroll, extend, force effects or reset state.',
     'Initial immunity normalization onlyfixture/ready/current+maxIMM_FIRE/status.fireImmune alias. Samecondition PCtouch initial/final full observed states/RNG exact. Crosscondition laterRNG, AI/cast/melee/movement/fullpropagation/naturalhorde/realSafari/full credit excluded.'
    ],
    execute:async d=>{
     d.entry.oracle_ref=nativeOracleProvenance();
     const b=await d.state(),m=b.monsters[0],initialCells=new Map(b.cells.map(c=>[key(c),c])),
      trace0=await d.trace(),os=trace0.observations.length,es=trace0.native_trace.length;
     const surfaces=s=>new Map((s.cells??s.surfaces).filter(c=>c.surface).map(c=>[key(c),c.surface])),
      surface=(s,x,y)=>surfaces(s).get(x+','+y)??0,
      allCells=s=>s.cells??s.surfaces;
     const native=s=>{
      assert.deepEqual([s.x,s.y,s.depth,s.monsters.length],[39,14,1,1]);const n=s.monsters[0];
      assert.deepEqual([n.kind,n.x,n.y,n.hp,n.maxHP,n.flags,n.abilityFlags,n.state,n.mode,n.fieldOfView,n.publicVisible],
       [kind,41,14,65,65,base.flags,base.abilityFlags,m.state,m.mode,1,1]);
      assert.deepEqual(n.combat,{damageMin:3,damageMax:8,accuracy:120,defense:80});
      assert.deepEqual(n.nativeBolts,base.nativeBolts);
      assert.deepEqual([n.nativeBloodType,n.nativeDFType,n.nativeDFChance,n.movementSpeed,n.attackSpeed,
       n.nativeMovementSpeed,n.nativeAttackSpeed,n.turnsUntilRegen,n.regenPerTurn,n.mutationIndex,
       n.newPowerCount,n.totalPowerCount,n.leaderIndex,n.leaderIsPlayer,n.carriedItem,
       n.nativeDamageClump,n.nativeTurnsBetweenRegen,n.nativeIntrinsicLightType,n.nativeIsLarge],
       [base.nativeBloodType,base.nativeDFType,100,100,100,100,100,0,0,-1,0,0,-1,0,null,2,0,8,1]);
      assert.equal(n.bookkeepingFlags&~wasVisible,m.bookkeepingFlags&~wasVisible);assert.equal(n.turnsSpentStationary,0);
      for(let i=0;i<n.statuses.length;i++){
       if(i!==N)assert.equal(n.statuses[i],m.statuses[i]);
       assert.equal(n.maxStatuses[i],m.maxStatuses[i]);
      }
      if('maxHP'in s){
       assert.deepEqual([s.maxHP,s.ended,s.inProgress,s.inWater,s.movementSpeed,s.attackSpeed,s.regenPerTurn,
        s.weapon,s.armor,s.ringLeft,s.ringRight,s.pack.length,s.floor.length],[100,0,1,0,100,100,0,0,0,0,0,0,0]);
       assert.deepEqual(s.playerCombat,b.playerCombat);assert.deepEqual([s.strength,s.weaknessAmount],[b.strength,b.weaknessAmount]);
       assert.equal(s.bookkeepingFlags,b.bookkeepingFlags);assert.equal(s.mode,b.mode);
       for(const [alias,name]of Object.entries({nutrition:'NUTRITION',burning:'BURNING',poisoned:'POISONED',
        slowed:'SLOWED',hasted:'HASTED',invisible:'INVISIBLE',levitating:'LEVITATING',telepathic:'TELEPATHIC',fireImmune:'IMMUNE_TO_FIRE'}))
        assert.equal(s.status[alias],s.statuses[ST(name)],'Full status alias must retain the same actual scalar');
      }
      if(s.gases)assert.equal(s.gases.length,0);
     };
     assert.deepEqual([b.turn,b.absoluteTurnNumber,b.hp,b.maxHP,b.inWater,m.ticksUntilTurn],[0,0,100,100,0,10000]);
     assert.ok([V('creatureStates','MONSTER_SLEEPING'),V('creatureStates','MONSTER_TRACKING_SCENT')].includes(m.state));
     assert.equal(m.mode,V('creatureModes','MODE_NORMAL'));
     for(let i=0;i<b.statuses.length;i++){
      assert.equal(b.statuses[i],i===N?1075:i===IMM&&immune?1000:0);
      assert.equal(m.statuses[i],i===N||i===BURN||i===IMM?1000:0);
      assert.equal(b.maxStatuses[i],i===N?2150:i===DON?3:i===IMM&&immune?1000:0,
       'Native starting armor keeps DONNING max3 after currentDONNING0/gear removal');
      assert.equal(m.maxStatuses[i],i===N||i===BURN||i===IMM?1000:0);
     }
     assert.equal(b.turnsUntilRegen,100000);native(b);
     for(const c of b.cells){
      assert.deepEqual([c.liquid,c.surface,c.gas,c.volume,c.machine,c.rememberedTerrain],[0,0,0,0,0,0]);
      assert.equal(c.dungeon,(c.x===37&&(c.y===11||c.y===17))?T(c.y===11?'UP_STAIRS':'DOWN_STAIRS'):T('FLOOR'));
      assert.ok(c.flags&TF('VISIBLE'));assert.ok(c.flags&TF('IN_FIELD_OF_VIEW'));
     }
     const initialProjection=projection(b,trace0.observations.at(-1)?.messageRows);
     assert.ok(os>0,'Missing genuine preparation publish');assert.deepEqual(trace0.observations.at(-1),initialProjection);
     for(const s of trace0.observations){native(s);assert.equal(s.turn,0);assert.equal(s.hp,100);assert.deepEqual(s.statuses,b.statuses);assert.deepEqual(s.maxStatuses,b.maxStatuses);}
     d.entry.initial_published_witness={observation:os-1,preparation_count:os,
      sha256:createHash('sha256').update(JSON.stringify(initialProjection)).digest('hex'),source:'Genuine host.frame only; no forced flush'};
     const normalize=s=>{
      const v=structuredClone(physical(s));delete v.fixture;
      assert.deepEqual([v.statuses[IMM],v.maxStatuses[IMM],v.status.fireImmune],immune?[1000,1000,1000]:[0,0,0]);
      v.statuses[IMM]=v.maxStatuses[IMM]=v.status.fireImmune=0;return v;
     };
     if(!immune){controls.set(control,normalize(b));d.entry.initial_control_comparison='Exposed full observed reference';}
     else if(controls.has(control)){assert.deepEqual(normalize(b),controls.get(control));d.entry.initial_control_comparison='Only exact initial IMMUNE_FIRE current/max/status.fireImmune aliases and fixture/ready differ';}
     else d.entry.initial_control_comparison='Exposed counterpart not selected; not compared';
     if(input_path==='pc-keyboard')pc.set(pair,{initial:physical(b)});
     else if(pc.has(pair))assert.deepEqual(physical(b),pc.get(pair).initial);
     d.entry.public_samples=[{label:'initial-native-F',proof:await cellPixels(d,41,14,base.nativeGlyph,70)}];
     d.entry.action_observations=[];let a=b,obsidian=null,totalDamage=0;
     const shown=async(label,checks)=>{
      await d.screenshot(label);
      const samples=[];for(const [x,y,g,u]of checks)samples.push(await cellPixels(d,x,y,g,u));
      d.entry.public_samples.push({label,samples});assert.deepEqual(await d.state(),a,'UI capture changed C state/RNG');
     };
     // All81cell histories change together: demoteVisibility has no publish/wait.
     // First exposed rest has one torch-color pulse, then lighting restores normal.
     const renderStages=(s,rank,t,before,after)=>{
      assert.ok(Array.isArray(s.cells),'Full real frame cell observation is required');
      assert.deepEqual(s.cells.map(key),b.cells.map(key),'Keep the same observed81cell coordinates');
      const prior=new Map(before.cells.map(c=>[key(c),c])),
       final=new Map(after.cells.map(c=>[key(c),c])),column=tileWasVisible|shadow;
      assert.ok(before.cells.every(c=>c.flags&visible),'Stationary interval must start fully visible');
      assert.deepEqual(s.playerCell,s.cells.find(c=>key(c)===key(s.playerCell)));
      assert.deepEqual(s.spawnCell,s.cells.find(c=>key(c)===key(s.spawnCell)));
      // Lighting has no publish/wait inside its reset/paint loop. WAS and SHADOW
      // are one whole-map before/after column pair, never independent cell choices.
      const beforeMatch=s.cells.every(c=>(c.flags&column)===(prior.get(key(c)).flags&column)),
       afterMatch=s.cells.every(c=>(c.flags&column)===(tileWasVisible|(final.get(key(c)).flags&shadow))),
       newlySeen=!(before.monsters[0].bookkeepingFlags&wasVisible)
        &&!!(s.monsters[0].bookkeepingFlags&wasVisible),
       dance=!!(s.playerCell.flags&dancing),out=[];
      if(t===1&&(rank>=6||(rank===5&&dance))&&s.playerCell.surface!==FIRE)return out;
      if(newlySeen&&!afterMatch)return out;
      for(const vision of [0,1]){
       if(vision===0?(!beforeMatch||newlySeen):(!afterMatch||rank<8))continue;
       let color;
       if(immune||t>=2){if(dance)continue;color=0;}
       else if(rank<=4){if(dance)continue;color=0;}
       else if(rank===5)color=dance?1:0; // placement draw -> torch refresh, BURN0
       else if(rank<=7){if(!dance)continue;color=1;}
       else if(newlySeen){if(dance)continue;color=2;}
       else if(dance)color=1;
       else {if(vision!==1)continue;color=2;}
       out.push({rank,vision,color});
      }
      return out;
     };
     // One validator for actual full/prep/fresh/event-before states. Stage candidates
     // are coupled tuples; per-stream reachability preserves chronology when frames coalesce.
     const validate=(s,ctx)=>{
      native(s);const {t,before,after,D}=ctx,n=s.monsters[0],oldN=before.monsters[0],
       positive=!immune&&t>=2,oldBurn=before.statuses[BURN],decBurn=positive?oldBurn-1:oldBurn,
       finalBurn=immune?0:7,oldHP=before.hp,newHP=after.hp;
      assert.equal(s.absoluteTurnNumber,s.turn);
      for(let i=0;i<s.statuses.length;i++){
       if(![N,BURN,IMM].includes(i))assert.equal(s.statuses[i],b.statuses[i]);
       if(i!==BURN)assert.equal(s.maxStatuses[i],b.maxStatuses[i]);
      }
      const beforeCells=new Map(before.cells.map(c=>[key(c),c])),afterCells=new Map(after.cells.map(c=>[key(c),c])),
       candidates=[],rejected=[];
      const reject=(rank,guard,detail={})=>{if(rejected.length<4)rejected.push({rank,guard,...detail});};
      const tuples=[
       [0,t-1,oldHP,oldBurn,oldN.ticksUntilTurn,oldN.statuses[N],before.statuses[N],before.statuses[IMM]],
       [1,t,oldHP,oldBurn,oldN.ticksUntilTurn,oldN.statuses[N],before.statuses[N],before.statuses[IMM]],
       ...[...new Set([oldHP,newHP])].map(h=>[2,t,h,oldBurn,oldN.ticksUntilTurn,oldN.statuses[N],before.statuses[N],before.statuses[IMM]]),
       [3,t,newHP,decBurn,oldN.ticksUntilTurn,oldN.statuses[N],before.statuses[N],before.statuses[IMM]],
       [4,t,newHP,decBurn,10000-100*t,oldN.statuses[N],before.statuses[N],before.statuses[IMM]],
       [5,t,newHP,decBurn,10000-100*t,1000-t,before.statuses[N],before.statuses[IMM]],
       [6,t,newHP,finalBurn,10000-100*t,1000-t,before.statuses[N],before.statuses[IMM]],
       [7,t,newHP,finalBurn,10000-100*t,1000-t,before.statuses[N],before.statuses[IMM]],
       [8,t,newHP,finalBurn,10000-100*t,1000-t,1075-t,immune?1000-t:0]
      ];
      const actual=[s.turn,s.hp,s.statuses[BURN],n.ticksUntilTurn,n.statuses[N],s.statuses[N],s.statuses[IMM]];
      for(const [rank,...tuple]of tuples){
       if(!tuple.every((v,i)=>v===actual[i]))continue;
       const expectedMax=immune?0:t===1&&rank<=5?0:7;
       if(s.maxStatuses[BURN]!==expectedMax){reject(rank,'maxBURN',{expected:expectedMax,actual:s.maxStatuses[BURN]});continue;}
       const oldVisible=!!(oldN.bookkeepingFlags&wasVisible),actorVisible=!!(n.bookkeepingFlags&wasVisible);
       // publicVisible is continuously1: Time2507 can set history;2538 cannot clear it.
       if(oldVisible&&!actorVisible){reject(rank,'monsterWAS_cleared');continue;}
       if(actorVisible!==oldVisible&&rank!==8){reject(rank,'monsterWAS_before_rank8');continue;}
       const render=renderStages(s,rank,t,before,after);
       if(!render.length){reject(rank,'renderStages',{player:s.playerCell,old_monster_flags:oldN.bookkeepingFlags,actual_monster_flags:n.bookkeepingFlags});continue;}
       // Time2299 analyzes the previous terrain before existing-burn damage.
       // No publish/wait occurs inside analyzeMap(false): compare the whole column.
       const topologyCells=rank<=1?beforeCells:afterCells,
        badTopology=s.cells.find(c=>(c.flags&topology)!==(topologyCells.get(key(c)).flags&topology));
       if(badTopology){reject(rank,'topology_column',{cell:[badTopology.x,badTopology.y],
        expected:topologyCells.get(key(badTopology)).flags&topology,actual:badTopology.flags&topology});continue;}
       let legal=true,lastCell=null;
       for(const c of [...allCells(s),s.playerCell,s.spawnCell]){
        lastCell=[c.x,c.y];
        const old=initialCells.get(key(c));if(!old){reject(rank,'unknown_cell',{cell:lastCell});legal=false;break;}
        const p=surface(before,c.x,c.y),f=surface(after,c.x,c.y),v=c.surface,near=distance(c,41,14),
         bloodOK=positive&&D>0&&distance(c,39,14)<=1&&(p===0||p===BLOOD);
        let allowed;
        if(rank<=1)allowed=[p];
        else if(rank<=4)allowed=[p,...(bloodOK?[BLOOD]:[])];
        else if(rank<=6)allowed=p===FIRE?[FIRE]:[p,...(bloodOK?[BLOOD]:[]),...(near<=3?[FIRE]:[])];
        else if(rank===7)allowed=p===FIRE&&f===OBS?[FIRE,0,OBS]:[f];
        else allowed=[f];
        if(!allowed.includes(v)||(![0,FIRE,OBS,BLOOD].includes(v))){reject(rank,'allowedSurface',{cell:lastCell,expected:allowed,actual:v});legal=false;break;}
        if((v===FIRE||v===OBS)&&near>3||v===BLOOD&&distance(c,39,14)>1){legal=false;break;}
        if(v===BLOOD&&immune){legal=false;break;}
        if(rank>=7&&near<=2&&p!==FIRE&&v!==FIRE){legal=false;break;}
        if(c.dungeon!==old.dungeon||c.liquid!==0||c.gas!==0||c.volume!==0||c.machine!==0||c.rememberedTerrain!==old.rememberedTerrain){reject(rank,'terrain_layers',{cell:lastCell,expected:old,actual:c});legal=false;break;}
        if(c.terrainFlags!==(old.terrainFlags|(v===FIRE?fireFlags:0))||c.mechFlags!==(old.mechFlags|(v===FIRE?fireMech:v===BLOOD?stand:0))){reject(rank,'terrain_flags',{cell:lastCell,expected:[old.terrainFlags|(v===FIRE?fireFlags:0),old.mechFlags|(v===FIRE?fireMech:v===BLOOD?stand:0)],actual:[c.terrainFlags,c.mechFlags]});legal=false;break;}
        const mutable=caught|dancing|known|searched|tileWasVisible|shadow|topology;
        if((c.flags&~mutable)!==(old.flags&~mutable)){reject(rank,'forbidden_cell_flags',{cell:lastCell,expected:old.flags&~mutable,actual:c.flags&~mutable,old_flags:old.flags,actual_flags:c.flags});legal=false;break;}
        const player=c.x===39&&c.y===14,actor=c.x===41&&c.y===14,stepFlags=beforeCells.get(key(c)).flags;
        if((c.flags&known)&&!(stepFlags&known)&&!((actor&&rank>=4)||(player&&rank>=5))){reject(rank,'new_KNOWN_before_source_stage',{cell:lastCell,step_before_flags:stepFlags,actual_flags:c.flags});legal=false;break;}
        if((c.flags&searched)!==(stepFlags&searched)&&!(player&&rank>=1)){reject(rank,'SEARCHED_before_source_stage',{cell:lastCell,step_before_flags:stepFlags,actual_flags:c.flags});legal=false;break;}
        if(c.flags&caught){
         if(!(rank>=5&&rank<=7&&p!==FIRE&&v===FIRE&&near<=3)){legal=false;break;}
        }
        if(!player&&!!(c.flags&dancing)!==(!actor&&v===FIRE)){legal=false;break;}
       }
       if(legal)candidates.push(...render);
       else if(!rejected.some(v=>v.rank===rank))reject(rank,'cell_source_rule',{cell:lastCell});
      }
      assert.ok(candidates.length,'No source-coupled HP/BURN/clock/NUT/surface stage: '+JSON.stringify({t,actual,player:s.playerCell,stages:tuples,rejected}));
      return candidates;
     };
     for(let t=1;t<=8;t++){
      const before=a,tr0=await d.trace(),oi=tr0.observations.length,ei=tr0.native_trace.length;
      await d.input('.');
      for(let ack=0;(await d.wait()).kind!=='command';ack++){
       const w=await d.wait();assert.ok(ack<80&&w.kind==='acknowledge'&&w.descriptor[0]===6,'Only genuine native ACK6 may follow rest');
       await d.input('Space');
      }
      a=await d.state();const tr=await d.trace(),fresh=tr.observations.slice(oi),events=tr.native_trace.slice(ei),
       D=before.hp-a.hp,ctx={t,before,after:a,D};
      assert.deepEqual(events.filter(e=>e.event[1]!==32).map(e=>e.event),[[0,46,0,0,0]]);
      for(const e of events.filter(e=>e.event[1]===32)){assert.deepEqual(e.event,[0,32,0,0,0]);assert.equal(e.descriptor[0],6);}
      assert.deepEqual([a.turn,a.absoluteTurnNumber,a.statuses[N],a.monsters[0].statuses[N],
       a.monsters[0].ticksUntilTurn,a.statuses[BURN],a.maxStatuses[BURN]],[t,t,1075-t,1000-t,10000-100*t,immune?0:7,immune?0:7]);
      assert.equal(a.statuses[IMM],immune?1000-t:0);
      if(t===1||immune)assert.equal(D,0);else assert.ok(Number.isInteger(D)&&D>=1&&D<=3);
      totalDamage+=D;assert.equal(a.hp,100-totalDamage);
      assert.equal(a.turnsUntilRegen,immune?100000:100000-1000*Math.max(0,t-2));
      if(t===1)assert.equal(a.playerCell.surface,FIRE);
      else assert.ok(before.playerCell.surface===FIRE?[FIRE,OBS].includes(a.playerCell.surface):a.playerCell.surface===FIRE);
      assert.equal(!!(a.monsters[0].bookkeepingFlags&wasVisible),true);
      for(const c of a.cells){
       assert.equal(c.flags&caught,0,'Settled newly-caught flags must be cleared');
       assert.equal(c.flags&tileWasVisible,tileWasVisible,'Settled visible cells retain native visibility history');
       if(t===1)assert.equal(c.flags&shadow,0,'First guaranteed player fire light clears every observed shadow');
      }
      assert.equal(a.playerCell.flags&dancing,0,'Endturn lighting restores the normal player foreground');
      const ranks=[],sourceRenderPaths=[];
      for(const stream of [[before,...fresh,a],[before,...events.map(e=>e.before),a]]){
       let reachable=[{rank:0,vision:0,color:0}];const history=[],renderHistory=[],cellProgress=new Map(),flagHistory=new Map();
       let previousActorVisible=!!(before.monsters[0].bookkeepingFlags&wasVisible);
       let previousHP=before.hp;
       for(const s of stream){
        const possible=validate(s,ctx).filter(v=>reachable.some(p=>v.rank>=p.rank&&v.vision>=p.vision&&v.color>=p.color));
        assert.ok(possible.length,'Source stage/whole-map vision/player color pulse reversed in an independently recorded stream');
        reachable=possible;history.push(possible.map(v=>v.rank));renderHistory.push(possible);
        // Regeneration is stopped and no healing source exists in these eight rests.
        // The coupled tuples permit only oldHP/newHP, so this also forbids a second drop.
        assert.ok(s.hp<=previousHP,'Player HP cannot rise within an independently recorded burn interval');
        previousHP=s.hp;
        const actorVisible=!!(s.monsters[0].bookkeepingFlags&wasVisible);
        assert.ok(Number(actorVisible)>=Number(previousActorVisible),
         'Continuously visible actor history cannot change1->0 in an independently recorded stream');
        previousActorVisible=actorVisible;
        // Cell histories cannot run backward while a coalesced stage remains equal.
        for(const c of b.cells){
         const k=key(c),p=surface(before,c.x,c.y),f=surface(a,c.x,c.y),v=surface(s,c.x,c.y);
         let path;
         if(p===FIRE)path=f===OBS?[FIRE,0,OBS]:[FIRE];
         else if(f===FIRE)path=p===0?[0,...(!immune&&t>=2&&distance(c,39,14)<=1?[BLOOD]:[]),FIRE]:[p,FIRE];
         else if(p===0&&f===BLOOD)path=[0,BLOOD];
         else path=[p];
         const index=path.indexOf(v);assert.ok(index>=0&&index>=(cellProgress.get(k)??0),'Cell source transition reversed');
         cellProgress.set(k,index);
        }
        for(const c of [...allCells(s),s.playerCell,s.spawnCell]){
         const old=flagHistory.get(key(c)),monotonic=known|searched|tileWasVisible;
         if(old!==undefined)assert.equal((c.flags&monotonic)|(old&monotonic),c.flags&monotonic,
          'Native trap knowledge/search/visible-history flags cannot clear in a published stationary stream');
         flagHistory.set(key(c),c.flags);
        }
       }
       assert.ok(reachable.some(v=>v.rank===8&&v.vision===1),
        'Command-ready after must reach rank8 and completed whole-map lighting');
       ranks.push(history);sourceRenderPaths.push(renderHistory);
      }
      if(!immune&&t>=2){
       const idx=tr.observations.findIndex((s,i)=>i>=oi&&i>0&&tr.observations[i-1].hp===before.hp&&s.hp===a.hp);
       assert.ok(idx>=0,'Missing genuine current-interval adjacent published HP-loss witness');
       d.entry.burn_witnesses??=[];d.entry.burn_witnesses.push({turn:t,damage:D,from_observation:idx-1,to_observation:idx,
        before_HP:before.hp,after_HP:a.hp,burning_at_publish:tr.observations[idx].statuses[BURN],messageRows:tr.observations[idx].messageRows});
      }
      const text=[await publicText(d),...fresh.map(s=>s.messageRows.join(' '))].join(' ').replace(/\s+/g,' ');
      d.entry.action_observations.push({turn:t,actual_key:'.',damage:D,hp_before:before.hp,hp_after:a.hp,
       burning_before:before.statuses[BURN],burning_after:a.statuses[BURN],player_surface_before:before.playerCell.surface,
       player_surface_after:a.playerCell.surface,clock:a.monsters[0].ticksUntilTurn,nutrition:[a.statuses[N],a.monsters[0].statuses[N]],
       fresh_start:oi,fresh_end:tr.observations.length,event_start:ei,event_end:tr.native_trace.length,
       source_stage_render_paths:sourceRenderPaths,
       stage_candidates_by_stream:ranks,rng:a.rng,text});
      if(t===1){
       const firePublish=fresh.findIndex(s=>s.playerCell.surface===FIRE&&s.statuses[BURN]===(immune?0:7)&&s.hp===100);
       assert.ok(firePublish>=0,'Missing genuine first-rest published player fire/status witness');
       d.entry.first_fire_witness={observation:oi+firePublish,hp:100,burning:immune?0:7,player_surface:FIRE};
       if(!immune)assert.match(text,/you catch fire/i);
       else assert.doesNotMatch(text,/you catch fire/i);
       for(const [x,y]of witnesses)assert.equal(surface(a,x,y),FIRE);
       await shown('first-actual-fire',witnesses.map(([x,y])=>[x,y,glyph.G_FIRE,0x22cf]));
      }
      if(t===2)await shown(immune?'actual-fire-immune-no-burn':'first-actual-burn',[[41,14,base.nativeGlyph,70]]);
      if(!obsidian){
       const cell=witnesses.find(([x,y])=>surface(before,x,y)===FIRE&&surface(a,x,y)===OBS);
       if(cell){
        obsidian={turn:t,cell,prior_turn:t-1,prior_surface:FIRE,actual_surface:OBS,fresh_start:oi,fresh_end:tr.observations.length};
        d.entry.first_natural_obsidian=obsidian;
        await shown('first-natural-obsidian',[[...cell,glyph.G_FLOOR,0xb7]]);
       }
      }
     }
     d.entry.actual_rest_count=8;const finalTrace=await d.trace(),actual=finalTrace.native_trace.slice(es);
     d.entry.actual_ack_count=actual.filter(e=>e.event[1]===32).length;d.entry.actual_events=actual.map(e=>e.event);
     d.entry.actual_fresh_count=finalTrace.observations.length-os;d.entry.catalog_source_sha256=catalog.source_sha256;
     d.entry.cross_condition_final_RNG_comparison=false;d.entry.new_definition_scope='Five representative partial candidates only';
     if(!obsidian){d.entry.unreached=true;d.entry.unreached_reason='Natural same-cell obsidian/physical witness not reached by fixed eighth rest';}
     assert.ok(obsidian,'Natural obsidian unreached after8realrests; no forcing/reseed/cap extension');
     d.effect(()=>{assert.equal(a.hp,100-totalDamage);assert.equal(a.statuses[BURN],immune?0:7);assert.ok(obsidian);});
     if(input_path==='pc-keyboard'){pc.get(pair).final=physical(a);d.entry.pc_touch_comparison='PC full observed initial/final reference';}
     else if(pc.has(pair)){assert.deepEqual(physical(a),pc.get(pair).final);d.entry.pc_touch_comparison='Full initial/final observed state and substantive RNG equal';}
     else d.entry.pc_touch_comparison='PC counterpart not selected; not compared';
    }
   });
  }
 }
 assert.equal(cases.length,variants.length*4);return cases;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
 await runFixtureSuite({name:'flamedancer-corona',createCases:createFlamedancerCoronaCases,filter:process.env.BROGUE_FLAMEDANCER_CORONA});
