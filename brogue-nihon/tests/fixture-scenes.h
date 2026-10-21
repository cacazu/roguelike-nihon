/* CHECK scene-number contract. Node tests read these same decimal defines.
 * Values below 1000 are individual scenes. Each kind group owns [base, base+999]; the active game's itemKindCount also bounds
 * kinds before any scene mutation. No group is available in production.
 */
#ifndef BROGUE_CHECK_FIXTURE_SCENES_H
#define BROGUE_CHECK_FIXTURE_SCENES_H
#define CHECK_TARGET_CYCLE 12
#define CHECK_SLAYING_MATCH 13
#define CHECK_SLAYING_OTHER 14
#define CHECK_VULNERABILITY 15
#define CHECK_PLAIN_ARMOR_CONTROL 16
#define CHECK_SPIDER_OPEN 17
#define CHECK_SPIDER_BLOCKED 18
#define CHECK_CAPTIVE 19
#define CHECK_LEVER 20
#define CHECK_LEVER_BREAKER 21
#define CHECK_KEY_DISPOSABLE 22
#define CHECK_KEY_REUSABLE 23
#define CHECK_KEY_WRONG_DEPTH 24
#define CHECK_KEY_WRONG_LOCK 25
#define CHECK_WATER 26
#define CHECK_WATER_LEVITATING 27
#define CHECK_VISIBILITY_MEMORY 28
#define CHECK_POTION_UNKNOWN 1000
#define CHECK_POTION_KNOWN 2000
#define CHECK_CHARM_READY 3000
#define CHECK_CHARM_COOLDOWN 4000
#define CHECK_SCROLL_UNKNOWN 5000
#define CHECK_STAFF_READY 6000
#define CHECK_WAND_READY 7000
#define CHECK_SCROLL_KNOWN 8000
#endif
