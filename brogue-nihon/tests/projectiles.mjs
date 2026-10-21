// Original throw/rethrow rules after CHECK preparation; every action is a real
// browser key or tap. Fixture scenes never perform the throw or choose a target.
import assert from 'node:assert/strict';
import {runFixtureSuite,sceneGroups} from './fixture-browser.mjs';

function createProjectileCases(){
  const cases=[],pcOutcomes=new Map();
  const darts=state=>state.pack.find(item=>item.letter===106);
  // ready describes the CHECK platform event boundary, not original game state.
  const gameState=({ready,...state})=>state;
  const publicText=driver=>driver.page.evaluate(()=>{
    const cells=__brogueFixture.cells;
    return Array.from({length:34},(_,row)=>Array.from({length:100},(_,col)=>{
      const i=(row*100+col)*10;return cells[i]===0x110000?'':String.fromCodePoint(cells[i+1]||32);
    }).join('')).join('\n');
  });
  const touch=driver=>driver.entry.input_path==='touch';
  async function shift(driver,enabled){
    if(!touch(driver))return;
    const button=driver.page.locator('#shift-key');
    if((await button.getAttribute('aria-pressed'))!==String(enabled))await button.tap();
  }
  async function shifted(driver,letter){
    const start=(await driver.trace()).native_trace.length;
    if(touch(driver)){await shift(driver,true);await driver.input(letter);}
    else await driver.input('Shift+'+letter.toUpperCase());
    const consumed=(await driver.trace()).native_trace.slice(start);
    assert.ok(consumed.length>0,'Shifted command did not reach the original event owner');
    assert.deepEqual(consumed[0].event,[0,letter.toUpperCase().codePointAt(0),0,0,1],'Shift+'+letter+' must send the original uppercase command');
  }
  const rethrow=driver=>shifted(driver,'t');
  async function tab(driver,reverse){
    const count=(await driver.trace()).native_trace.length;
    if(touch(driver)){
      await shift(driver,reverse);const before=await driver.wait();await driver.page.locator('#tab-action').tap();
      await driver.page.waitForFunction(serial=>__brogueFixture.waiting&&__brogueFixture.serial>serial,before.serial,{timeout:10000});await driver.record(reverse?'tap Shift+Tab':'tap Tab');
    }else await driver.input(reverse?'Shift+Tab':'Tab');
    const event=(await driver.trace()).native_trace[count].event;
    // Both aliases are accepted by native moveCursor, whose owner uses the
    // Shift flag to reverse nextTargetAfter. Playback distinguishes the codes.
    assert.ok((reverse?[9,25]:[9]).includes(event[1]));assert.equal(event[4],Number(reverse));
  }
  async function rest(driver){
    await shift(driver,false);const before=await driver.state();await driver.input('.');
    assert.equal((await driver.state()).turn,before.turn+1,'Following rest must advance exactly one turn');
  }
  function compare(path,id,state){
    if(path==='pc-keyboard')pcOutcomes.set(id,gameState(state));
    else if(pcOutcomes.has(id))assert.deepEqual(gameState(state),pcOutcomes.get(id),'PC and touch must reach the same original state');
  }
  for(const input_path of ['pc-keyboard','touch']){
    cases.push({id:input_path+'-rethrow-before-first-throw',variant:'brogue',input_path,fixture_id:1,
      feature_ids:['cmd.rethrow'],targets:[],
      assertions:['T before any committed throw is consumed as an original no-op: no item/target prompt, no quantity, turn or RNG change.','PC T and touch Shift+t send the same uppercase command; the following rest advances once.'],
      execute:async d=>{const before=await d.state();assert.equal(darts(before).quantity,5);await rethrow(d);assert.equal((await d.wait()).kind,'command');const after=await d.state();d.effect(()=>assert.deepEqual(gameState(after),gameState(before)));compare(input_path,'before-first',after);await rest(d);},
    });
    cases.push({id:input_path+'-rethrow-last-target-without-second-prompt',variant:'brogue',input_path,fixture_id:2,
      feature_ids:['cmd.throw','cmd.rethrow','target.select'],targets:[],
      assertions:['Throw five-dart stack at the visible ogre through the original item/target selectors; committing costs one dart and one turn.','T skips both item selection and target selection while the previously targeted monster remains targetable, costs one more dart and turn, and matches PC/touch state.','No extra queued action is consumed; the following rest advances once.'],
      execute:async d=>{
        const before=await d.state();assert.equal(darts(before).quantity,5);assert.equal(before.monsters.length,1);assert.deepEqual([before.monsters[0].x,before.monsters[0].y],[43,14]);
        await d.input('t');assert.equal((await d.wait()).kind,'item');await d.input('j');assert.equal((await d.wait()).kind,'target');assert.match(await publicText(d),/ogre/i);await d.screenshot('first-target');
        await d.input('Enter');await d.settle();const first=await d.state();assert.equal(darts(first).quantity,4);assert.equal(first.turn,before.turn+1);assert.equal(first.monsters.length,1);assert.ok(first.monsters[0].hp>0);
        const serial=(await d.wait()).serial,count=(await d.trace()).native_trace.length;await rethrow(d);await d.settle();const after=await d.state(),trace=(await d.trace()).native_trace.slice(count);
        d.effect(()=>{assert.equal(darts(after).quantity,3);assert.equal(after.turn,first.turn+1);assert.equal((trace.length),1);assert.equal(trace[0].descriptor[0],0);});
        assert.equal((await d.wait()).serial,serial+1,'Automatic rethrow must not open an item or target input owner');compare(input_path,'auto-target',after);await d.screenshot('after-rethrow');await rest(d);
      },
    });
    cases.push({id:input_path+'-rethrow-target-cancel-and-exhaust-stack',variant:'brogue',input_path,fixture_id:1,
      feature_ids:['cmd.throw','cmd.rethrow','target.select'],targets:[],
      assertions:['Without a previous monster target, T skips inventory and opens the original target selector. Escape preserves quantity, turn and RNG.','Each subsequent confirmed T consumes one dart and one turn until the carried stack disappears.','T after stack exhaustion is a no-op; the following rest advances once.'],
      execute:async d=>{
        const before=await d.state();assert.equal(before.monsters.length,0);assert.equal(darts(before).quantity,5);
        await d.input('t');await d.input('j');assert.equal((await d.wait()).kind,'target');await d.input('l');await d.input('Enter');await d.settle();const first=await d.state();assert.equal(darts(first).quantity,4);assert.equal(first.turn,before.turn+1);
        await rethrow(d);assert.equal((await d.wait()).kind,'target');await shift(d,false);await d.screenshot('rethrow-target');await d.input('Escape');await d.settle();assert.deepEqual(gameState(await d.state()),gameState(first),'Cancelling the uncommitted rethrow changes no original state');
        for(let quantity=3;quantity>=0;quantity--){await rethrow(d);assert.equal((await d.wait()).kind,'target');await shift(d,false);await d.input('l');await d.input('Enter');await d.settle();const current=await d.state();assert.equal(darts(current)?.quantity||0,quantity);assert.equal(current.turn,first.turn+4-quantity);}
        const empty=await d.state();await rethrow(d);assert.equal((await d.wait()).kind,'command');const after=await d.state();d.effect(()=>assert.deepEqual(gameState(after),gameState(empty)));compare(input_path,'exhausted',after);await d.screenshot('exhausted');await rest(d);
      },
    });
    for(const letter of ['t','s'])cases.push({id:input_path+'-cursor-shift-'+letter,variant:'brogue',input_path,fixture_id:1,
      feature_ids:letter==='t'?['cmd.rethrow','target.select']:['cmd.save','target.select'],targets:[],
      assertions:['The original ascent command proposes the visible stairs and leaves the normal keyboard cursor owner active.','Shift+'+letter+' retains its uppercase command meaning in Cursor: '+(letter==='t'?'unused rethrow is a no-op.':'save opens confirmation; No cancels without a turn.'),'Escape leaves Cursor and the following rest advances once.'],
      execute:async d=>{
        await d.input('<');assert.equal((await d.wait()).kind,'cursor');const before=await d.state();await shifted(d,letter);
        if(letter==='s'){assert.equal((await d.wait()).kind,'confirm');await d.input('n');}
        assert.equal((await d.wait()).kind,'cursor');const after=await d.state();d.effect(()=>assert.deepEqual(gameState(after),gameState(before)));compare(input_path,'cursor-'+letter,after);await d.screenshot('cursor-shift-'+letter);await d.input('Escape');assert.equal((await d.wait()).kind,'command');await rest(d);
      },
    });
    for(const owner of ['target','cursor'])cases.push({id:input_path+'-'+owner+'-tab-forward-reverse',variant:'brogue',input_path,fixture_id:owner==='target'?sceneGroups.TARGET_CYCLE:2,
      feature_ids:['target.select'],targets:[],
      assertions:['Target uses three independently visible enemies: two Tabs visit distinct candidates, then two Shift+Tabs retrace them. Cursor Tab and Shift+Tab return to the original published target.','Target/cursor traversal and cancellation consume no turn, item charge, quantity or substantive RNG; the following rest advances once.'],
      execute:async d=>{
        const before=await d.state();if(owner==='target')await d.apply();else await d.input('<');assert.equal((await d.wait()).kind,owner);const start=await d.state();
        if(owner==='target'){
          assert.equal(before.monsters.length,3);
          assert.deepEqual(before.monsters.map(m=>[m.x,m.y]).sort(),[[38,12],[42,14],[43,16]]);
          assert.ok(before.monsters.some(m=>m.x===start.cursor.x&&m.y===start.cursor.y));
        }
        await tab(d,false);const forward=await d.state();assert.notDeepEqual(forward.cursor,start.cursor);
        if(owner==='target'){
          assert.ok(before.monsters.some(m=>m.x===forward.cursor.x&&m.y===forward.cursor.y));
          await tab(d,false);const second=await d.state();assert.notDeepEqual(second.cursor,start.cursor);assert.notDeepEqual(second.cursor,forward.cursor);
          assert.ok(before.monsters.some(m=>m.x===second.cursor.x&&m.y===second.cursor.y));
          await tab(d,true);assert.deepEqual((await d.state()).cursor,forward.cursor);
        }
        await tab(d,true);const reverse=await d.state();
        d.effect(()=>{assert.deepEqual(reverse.cursor,start.cursor);assert.equal(reverse.turn,before.turn);assert.equal(reverse.rng,before.rng);assert.deepEqual(reverse.pack,before.pack);});
        await d.screenshot(owner+'-tab-reversed');await shift(d,false);await d.input('Escape');await d.settle();const cancelled=await d.state();assert.deepEqual(gameState(cancelled),gameState(before),'Cancelling target/cursor traversal must preserve the original game state');compare(input_path,owner+'-tab',cancelled);await rest(d);
      },
    });
  }
  assert.equal(cases.length,14);return cases;
}
await runFixtureSuite({name:'projectiles',createCases:createProjectileCases,filter:process.env.BROGUE_PROJECTILES});
