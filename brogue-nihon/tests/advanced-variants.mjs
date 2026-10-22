// Variant-specific executions; each case verifies the actual native variant.
import {runFixtureSuite} from './fixture-browser.mjs';
import {createAdvancedCases} from './advanced-contracts.mjs';
await runFixtureSuite({name:'advanced-variants',createCases:()=>createAdvancedCases({variants:['rapid_brogue','bullet_brogue']}),filter:process.env.BROGUE_ADVANCED_VARIANTS});
