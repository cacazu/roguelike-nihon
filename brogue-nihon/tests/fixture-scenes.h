/* CHECK scene-number contract. Node tests read these same decimal defines.
 * Each group owns [base, base+999]; the active game's itemKindCount also bounds
 * kinds before any scene mutation. No group is available in production.
 */
#ifndef BROGUE_CHECK_FIXTURE_SCENES_H
#define BROGUE_CHECK_FIXTURE_SCENES_H
#define CHECK_POTION_UNKNOWN 1000
#define CHECK_POTION_KNOWN 2000
#define CHECK_CHARM_READY 3000
#define CHECK_CHARM_COOLDOWN 4000
#define CHECK_SCROLL_RESERVED 5000
#define CHECK_STAFF_RESERVED 6000
#define CHECK_WAND_RESERVED 7000
#endif
