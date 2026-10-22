// Variant-specific original tables run through the same independent world-effect oracles.
import {runFixtureSuite} from './fixture-browser.mjs';
import {createWorldCases} from './world-contracts.mjs';
await runFixtureSuite({name:'world-variants',createCases:()=>createWorldCases({variants:['rapid_brogue','bullet_brogue']}),filter:process.env.BROGUE_WORLD_VARIANTS});
