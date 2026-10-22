// Focused hardening: actual clone/image identity and occupancy, plus lone touch filter.
import assert from 'node:assert/strict';
import {runFixtureSuite} from './fixture-browser.mjs';
import {createWeaponRunicCases} from './weapon-runics.mjs';
await runFixtureSuite({name:'weapon-runic-edges',createCases:()=>{
 const cases=createWeaponRunicCases().filter(c=>c.id.includes('-positive-plenty')||c.id.includes('-positive-multiplicity')||c.id==='brogue-touch-inanimate-speed');
 assert.equal(cases.length,13);return cases;
}});
