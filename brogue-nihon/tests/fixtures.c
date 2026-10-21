/* Explicit initial scenes for real-input Web regression tests.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This translation unit is linked only by build-web.ps1 -Check. It is never
 * linked into the playable game; no test action replaces a game rule.
 */
#ifdef BROGUE_BROWSER_CHECK
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include "Rogue.h"
#include "GlobalsBase.h"
#include "Globals.h"
#include "BrowserIO.h"
#include "fixture-scenes.h"

extern int brogue_check_wait_kind(void);
extern void brogue_check_publish(void);

static int preparedScene;
#if defined(BROGUE_BROWSER)
static SavedDisplayBuffer *initialCommandDisplay;
void brogue_check_bind_command_display(SavedDisplayBuffer *saved) {
    if (!preparedScene && rogue.seed == 42 && rogue.playerTurnNumber == 0
        && !rogue.playbackMode && !rogue.cursorMode && rogue.cursorLoc.x < 0 && rogue.cursorLoc.y < 0)
        initialCommandDisplay = saved;
}
void brogue_check_unbind_command_display(SavedDisplayBuffer *saved) {
    if (initialCommandDisplay == saved) initialCommandDisplay = NULL;
}
#endif
static char featureJSON[65536];
static size_t featureLength;
static boolean featureOverflow;

#if defined(__GNUC__) || defined(__clang__)
static void featureAppend(const char *format, ...) __attribute__((format(printf, 1, 2)));
#endif
static void featureAppend(const char *format, ...) {
    if (featureOverflow) return;
    va_list args;
    va_start(args, format);
    int count = vsnprintf(featureJSON + featureLength, sizeof featureJSON - featureLength, format, args);
    va_end(args);
    if (count < 0 || (size_t) count >= sizeof featureJSON - featureLength) featureOverflow = true;
    else featureLength += count;
}

static void featureString(const char *text) {
    featureAppend("\"");
    for (const unsigned char *c = (const unsigned char *) text; *c; c++) {
        if (*c == '"' || *c == '\\') featureAppend("\\%c", *c);
        else if (*c < 32) featureAppend("\\u%04x", *c);
        else featureAppend("%c", *c);
    }
    featureAppend("\"");
}

static void featureItem(item *it) {
    itemTable *table = tableForItemCategory(it->category);
    featureAppend("{\"letter\":%d,\"category\":%u,\"kind\":%d,\"quantity\":%d,\"charges\":%d,"
           "\"enchant\":%d,\"flags\":%lu,\"identified\":%d,\"equipped\":%d,\"protected\":%d,"
           "\"rechargeTimer\":%d,\"magicDetected\":%d,\"x\":%d,\"y\":%d,\"inscription\":",
           it->inventoryLetter, it->category, it->kind, it->quantity, it->charges,
           it->enchant1, it->flags, !!(it->flags & ITEM_IDENTIFIED), !!(it->flags & ITEM_EQUIPPED),
           !!(it->flags & ITEM_PROTECTED), it->enchant2, !!(it->flags & ITEM_MAGIC_DETECTED), it->loc.x, it->loc.y);
    featureString(it->inscription);
    featureAppend(",\"kindKnown\":%d,\"called\":%d,\"callTitle\":", table ? table[it->kind].identified : 0,
           table ? table[it->kind].called : 0);
    featureString(table ? table[it->kind].callTitle : "");
    featureAppend(",\"cursed\":%d,\"strengthRequired\":%d,\"timesEnchanted\":%d,"
           "\"maxChargesKnown\":%d,\"lastUsed\":[%lu,%lu,%lu]",
           !!(it->flags & ITEM_CURSED), it->strengthRequired, it->timesEnchanted,
           !!(it->flags & ITEM_MAX_CHARGES_KNOWN), it->lastUsed[0], it->lastUsed[1], it->lastUsed[2]);
    featureAppend(",\"runicKind\":%d,\"vorpalEnemy\":%d,\"originDepth\":%d,\"keyLoc\":[",
           it->flags & ITEM_RUNIC ? it->enchant2 : -1, it->vorpalEnemy, it->originDepth);
    if (it->flags & ITEM_IS_KEY) for (int i = 0; i < KEY_ID_MAXIMUM; i++) {
        featureAppend("%s{\"x\":%d,\"y\":%d,\"machine\":%d,\"disposable\":%d}",
               i ? "," : "", it->keyLoc[i].loc.x, it->keyLoc[i].loc.y, it->keyLoc[i].machine,
               it->keyLoc[i].disposableHere);
    }
    featureAppend("]}");
}

static void featureStatuses(const short *statuses) {
    featureAppend("[");
    for (int i = 0; i < NUMBER_OF_STATUS_EFFECTS; i++) featureAppend("%s%d", i ? "," : "", statuses[i]);
    featureAppend("]");
}

static void featureCell(pos loc) {
    featureAppend("{\"x\":%d,\"y\":%d,\"flags\":%lu,\"dungeon\":%d,\"liquid\":%d,"
           "\"surface\":%d,\"gas\":%d,\"volume\":%d,\"terrainFlags\":%lu,\"rememberedTerrain\":%d,\"machine\":%d}",
           loc.x, loc.y, pmapAt(loc)->flags, pmapAt(loc)->layers[DUNGEON], pmapAt(loc)->layers[LIQUID],
           pmapAt(loc)->layers[SURFACE], pmapAt(loc)->layers[GAS], pmapAt(loc)->volume, terrainFlags(loc),
           pmapAt(loc)->rememberedTerrain, pmapAt(loc)->machineNumber);
}

const char *brogue_check_features(void) {
    if (!gameConst) return "{\"error\":\"CHECK game has not started\"}";
    featureLength = 0;
    featureOverflow = false;
    featureAppend("{\"fixture\":%d,\"seed\":\"%llu\",\"turn\":%lu,\"absoluteTurnNumber\":%lu,\"rng\":%lu,\"x\":%d,\"y\":%d,"
           "\"hp\":%d,\"maxHP\":%d,\"depth\":%d,\"deepest\":%d,\"ended\":%d,\"inProgress\":%d,"
           "\"highScoreSaved\":%d,\"gold\":%lu,\"strength\":%d,\"poisonAmount\":%d,\"ready\":%d,"
           "\"weapon\":%d,\"armor\":%d,\"ringLeft\":%d,\"ringRight\":%d,"
           "\"upX\":%d,\"upY\":%d,\"downX\":%d,\"downY\":%d,\"statuses\":[",
           preparedScene, (unsigned long long) rogue.seed, rogue.playerTurnNumber, rogue.absoluteTurnNumber, randomNumbersGenerated,
           player.loc.x, player.loc.y, player.currentHP, player.info.maxHP, rogue.depthLevel,
           gameConst->deepestLevel, rogue.gameHasEnded, rogue.gameInProgress, rogue.highScoreSaved,
           rogue.gold, rogue.strength, player.poisonAmount, brogue_check_wait_kind() == BROWSER_COMMAND,
           rogue.gameInProgress && rogue.weapon ? rogue.weapon->inventoryLetter : 0,
           rogue.gameInProgress && rogue.armor ? rogue.armor->inventoryLetter : 0,
           rogue.gameInProgress && rogue.ringLeft ? rogue.ringLeft->inventoryLetter : 0,
           rogue.gameInProgress && rogue.ringRight ? rogue.ringRight->inventoryLetter : 0,
           rogue.upLoc.x, rogue.upLoc.y, rogue.downLoc.x, rogue.downLoc.y);
    for (int i = 0; i < NUMBER_OF_STATUS_EFFECTS; i++) featureAppend("%s%d", i ? "," : "", player.status[i]);
    featureAppend("],\"maxStatuses\":");
    featureStatuses(player.maxStatus);
    featureAppend(",\"variant\":");
    featureString(gameConst->variantName);
    featureAppend(",\"mode\":%d,\"kindCounts\":{\"potion\":%d,\"charm\":%d,\"scroll\":%d,\"staff\":%d,\"wand\":%d},"
           "\"movementSpeed\":%d,\"attackSpeed\":%d,\"turnsUntilRegen\":%ld,\"regenPerTurn\":%d,"
           "\"weaknessAmount\":%d,\"bookkeepingFlags\":%lu,\"searching\":%d,"
           "\"automationActive\":%d,\"autoPlayingLevel\":%d,\"disturbed\":%d,"
           "\"trueColorMode\":%d,\"displayStealthRangeMode\":%d,\"cursorMode\":%d,"
           "\"cursor\":{\"x\":%d,\"y\":%d},\"lightRadius\":{\"lower\":%d,\"upper\":%d},",
           rogue.mode, itemKindCount(POTION, 0), itemKindCount(CHARM, 0), itemKindCount(SCROLL, 0),
           itemKindCount(STAFF, 0), itemKindCount(WAND, 0), player.movementSpeed, player.attackSpeed,
           player.turnsUntilRegen, player.regenPerTurn, player.weaknessAmount, player.bookkeepingFlags,
           player.status[STATUS_SEARCHING], rogue.automationActive, rogue.autoPlayingLevel, rogue.disturbed,
           rogue.trueColorMode, rogue.displayStealthRangeMode, rogue.cursorMode, rogue.cursorLoc.x, rogue.cursorLoc.y,
           rogue.minersLight.lightRadius.lowerBound, rogue.minersLight.lightRadius.upperBound);
    featureAppend("\"inWater\":%d,\"playerCombat\":{\"defense\":%d,\"damageMin\":%d,\"damageMax\":%d},",
           rogue.inWater, player.info.defense, player.info.damage.lowerBound, player.info.damage.upperBound);
    featureAppend("\"status\":{\"nutrition\":%d,\"burning\":%d,\"poisoned\":%d,\"slowed\":%d,"
           "\"hasted\":%d,\"invisible\":%d,\"levitating\":%d,\"telepathic\":%d,\"fireImmune\":%d},\"pack\":[",
           player.status[STATUS_NUTRITION], player.status[STATUS_BURNING], player.status[STATUS_POISONED],
           player.status[STATUS_SLOWED], player.status[STATUS_HASTED], player.status[STATUS_INVISIBLE],
           player.status[STATUS_LEVITATING], player.status[STATUS_TELEPATHIC], player.status[STATUS_IMMUNE_TO_FIRE]);
    int count = 0;
    if (rogue.gameInProgress && packItems) for (item *it = packItems->nextItem; it; it = it->nextItem) {
        if (count++) featureAppend(",");
        featureItem(it);
    }
    featureAppend("],\"floor\":[");
    count = 0;
    if (rogue.gameInProgress && floorItems) for (item *it = floorItems->nextItem; it; it = it->nextItem) {
        if (count++) featureAppend(",");
        featureItem(it);
    }
    featureAppend("],\"monsters\":[");
    count = 0;
    if (rogue.gameInProgress && monsters) for (creatureIterator iter = iterateCreatures(monsters); hasNextCreature(iter);) {
        creature *monst = nextCreature(&iter);
        if (count++) featureAppend(",");
        featureAppend("{\"kind\":%d,\"x\":%d,\"y\":%d,\"hp\":%d,\"maxHP\":%d,\"state\":%d,"
               "\"slowed\":%d,\"burning\":%d,\"poisoned\":%d,\"invisible\":%d,\"negated\":%d",
               monst->info.monsterID, monst->loc.x, monst->loc.y, monst->currentHP, monst->info.maxHP,
               monst->creatureState, monst->status[STATUS_SLOWED], monst->status[STATUS_BURNING],
               monst->status[STATUS_POISONED], monst->status[STATUS_INVISIBLE], monst->wasNegated);
        featureAppend(",\"flags\":%lu,\"abilityFlags\":%lu,\"bookkeepingFlags\":%lu,"
               "\"cellFlags\":%lu,\"leaderIsPlayer\":%d,\"ticksUntilTurn\":%d,\"statuses\":",
               monst->info.flags, monst->info.abilityFlags, monst->bookkeepingFlags, pmapAt(monst->loc)->flags,
               monst->leader == &player, monst->ticksUntilTurn);
        featureStatuses(monst->status);
        featureAppend(",\"maxStatuses\":");
        featureStatuses(monst->maxStatus);
        featureAppend(",\"poisonAmount\":%d,\"movementSpeed\":%d,\"attackSpeed\":%d,"
               "\"newPowerCount\":%d,\"totalPowerCount\":%d}", monst->poisonAmount,
               monst->movementSpeed, monst->attackSpeed, monst->newPowerCount, monst->totalPowerCount);
    }
    featureAppend("],\"cells\":[");
    count = 0;
    if (rogue.gameInProgress) for (int y = 10; y <= 18; y++) for (int x = 36; x <= 44; x++) {
        if (count++) featureAppend(",");
        featureAppend("{\"x\":%d,\"y\":%d,\"flags\":%lu,\"dungeon\":%d,\"liquid\":%d,\"surface\":%d,\"gas\":%d,\"volume\":%d,\"rememberedTerrain\":%d,\"machine\":%d}",
               x, y, pmap[x][y].flags, pmap[x][y].layers[DUNGEON], pmap[x][y].layers[LIQUID],
               pmap[x][y].layers[SURFACE], pmap[x][y].layers[GAS], pmap[x][y].volume, pmap[x][y].rememberedTerrain, pmap[x][y].machineNumber);
    }
    featureAppend("],\"remoteCells\":[");
    count = 0;
    if (rogue.gameInProgress) for (int y = 12; y <= 17; y++) for (int x = 20; x <= 24; x++) {
        if (count++) featureAppend(",");
        featureCell((pos){x, y});
    }
    featureAppend("],\"playerCell\":");
    if (rogue.gameInProgress && isPosInMap(player.loc)) featureCell(player.loc); else featureAppend("null");
    featureAppend(",\"spawnCell\":");
    if (rogue.gameInProgress) featureCell((pos){40, 14}); else featureAppend("null");
    unsigned discovered = 0, visible = 0, fieldOfView = 0, mapped = 0;
    if (rogue.gameInProgress) for (int x = 0; x < DCOLS; x++) for (int y = 0; y < DROWS; y++) {
        discovered += !!(pmap[x][y].flags & DISCOVERED);
        visible += !!(pmap[x][y].flags & VISIBLE);
        fieldOfView += !!(pmap[x][y].flags & IN_FIELD_OF_VIEW);
        mapped += !!(pmap[x][y].flags & MAGIC_MAPPED);
    }
    featureAppend(",\"mapMetrics\":{\"discovered\":%u,\"visible\":%u,\"fieldOfView\":%u,\"mapped\":%u}}",
           discovered, visible, fieldOfView, mapped);
    return featureOverflow ? "{\"error\":\"fixture snapshot overflow\"}" : featureJSON;
}

static item *give(unsigned short category, short kind, char letter, boolean known) {
    item *it = generateItem(category, kind);
    it->flags &= ~(ITEM_CURSED | ITEM_RUNIC | ITEM_RUNIC_HINTED | ITEM_RUNIC_IDENTIFIED | ITEM_EQUIPPED);
    if (known) it->flags |= ITEM_IDENTIFIED;
    else it->flags &= ~ITEM_IDENTIFIED;
    it->enchant1 = category & (STAFF | RING | CHARM) ? 2 : 0;
    it->enchant2 = 0;
    it->quantity = 1;
    it->inventoryLetter = letter;
    if (category & (STAFF | WAND)) it->charges = 3;
    if (category & CHARM) it->charges = 0;
    if (category & (POTION | SCROLL | STAFF | WAND | RING)) tableForItemCategory(category)[kind].identified = known;
    return addItemToPack(it);
}

static void fixtureInventory(void) {
    give(FOOD, RATION, 'a', true);
    give(WEAPON, SWORD, 'b', true);
    give(ARMOR, LEATHER_ARMOR, 'c', true);
    give(POTION, POTION_STRENGTH, 'd', false);
    give(SCROLL, SCROLL_IDENTIFY, 'e', true);
    give(STAFF, STAFF_FIRE, 'f', true);
    give(WAND, WAND_SLOW, 'g', false);
    give(RING, RING_REGENERATION, 'h', false);
    give(CHARM, CHARM_HEALTH, 'i', true);
    give(WEAPON, DART, 'j', true)->quantity = 5;
    give(SCROLL, SCROLL_MAGIC_MAPPING, 'k', false);
    give(POTION, POTION_LIFE, 'l', true);
}

static void fixtureRoom(void) {
    freeCreatureList(monsters);
    freeCreatureList(dormantMonsters);
    rogue.lastTarget = NULL;
    rogue.yendorWarden = NULL;
    rogue.weapon = rogue.armor = rogue.ringLeft = rogue.ringRight = NULL;
    rogue.swappedIn = rogue.swappedOut = rogue.lastItemThrown = NULL;
    for (item *it = packItems->nextItem, *next; it; it = next) { next = it->nextItem; deleteItem(it); }
    packItems->nextItem = NULL;
    for (item *it = floorItems->nextItem, *next; it; it = next) { next = it->nextItem; deleteItem(it); }
    floorItems->nextItem = NULL;
    for (int x = 0; x < DCOLS; x++) for (int y = 0; y < DROWS; y++) {
        memset(&pmap[x][y], 0, sizeof pmap[x][y]);
        pmap[x][y].layers[DUNGEON] = x >= 36 && x <= 44 && y >= 10 && y <= 18 ? FLOOR : GRANITE;
        scentMap[x][y] = 0;
    }
    player.loc = (pos) {40, 14};
    pmapAt(player.loc)->flags |= HAS_PLAYER;
    rogue.upLoc = (pos) {38, 14};
    rogue.downLoc = (pos) {42, 14};
    pmapAt(rogue.upLoc)->layers[DUNGEON] = UP_STAIRS;
    pmapAt(rogue.downLoc)->layers[DUNGEON] = DOWN_STAIRS;
    levels[rogue.depthLevel - 1].upStairsLoc = rogue.upLoc;
    levels[rogue.depthLevel - 1].downStairsLoc = rogue.downLoc;
    player.status[STATUS_NUTRITION] = STOMACH_SIZE / 2;
    player.currentHP = max(2, player.info.maxHP / 2);
    rogue.updatedSafetyMapThisTurn = rogue.updatedAllySafetyMapThisTurn = false;
    rogue.updatedMapToSafeTerrainThisTurn = rogue.updatedMapToShoreThisTurn = false;
    rogue.staleLoopMap = true;
    updateEncumbrance();
    updateRingBonuses();
}

static creature *fixtureTarget(short kind, int x, int y) {
    creature *monst = generateMonster(kind, false, false);
    monst->loc = (pos) {x, y};
    monst->creatureState = MONSTER_TRACKING_SCENT;
    pmapAt(monst->loc)->flags |= HAS_MONSTER;
    return monst;
}

/* Preparation only: no apply/drinkPotion/useCharm/turn/combat function is called. */
static void fixtureStatus(int status, short duration) {
    player.status[status] = player.maxStatus[status] = duration;
}

static void fixtureHiddenMinds(void) {
    for (int y = 10; y <= 18; y++) pmap[42][y].layers[DUNGEON] = WALL;
    creature *living = fixtureTarget(MK_GOBLIN, 44, 12);
    creature *inanimate = fixtureTarget(MK_ARROW_TURRET, 44, 16);
    living->creatureState = inanimate->creatureState = MONSTER_SLEEPING;
}

static void fixtureRemoteRoom(void) {
    /* It deliberately has no natural LOS from the starting room. */
    for (int x = 20; x <= 24; x++) for (int y = 12; y <= 17; y++) pmap[x][y].layers[DUNGEON] = FLOOR;
}

static item *fixtureFloorItem(unsigned short category, short kind, int x, int y) {
    item *it = generateItem(category, kind);
    it->quantity = 1;
    it->flags &= ~(ITEM_RUNIC | ITEM_EQUIPPED | ITEM_MAGIC_DETECTED | ITEM_IDENTIFIED);
    it->enchant1 = 2;
    it->enchant2 = 0;
    if (category == WAND) it->charges = 3;
    return placeItemAt(it, (pos){x, y});
}

static void fixtureConsumable(unsigned short category, short kind, boolean known, boolean cooldown) {
    player.currentHP = player.info.maxHP;
    player.turnsUntilRegen = 100000; /* no imminent regeneration obscures small damage/healing */
    player.regenPerTurn = 0;
    item *primary = give(category, kind, 'a', known);
    primary->quantity = category == POTION ? 2 : 1;
    if (category == CHARM && cooldown) primary->charges = 5;

    if ((category == POTION && kind == POTION_LIFE) || (category == CHARM && kind == CHARM_HEALTH)) {
        player.currentHP = player.info.maxHP / 2;
        fixtureStatus(STATUS_CONFUSED, 20);
        if (category == POTION) {
            fixtureStatus(STATUS_POISONED, 20); player.poisonAmount = 2;
            fixtureStatus(STATUS_WEAKENED, 20); player.weaknessAmount = 3;
            fixtureStatus(STATUS_DARKNESS, 20);
            fixtureStatus(STATUS_HALLUCINATING, 20);
            fixtureStatus(STATUS_NAUSEOUS, 20);
            fixtureStatus(STATUS_SLOWED, 20);
        }
    }
    if (category == POTION && kind == POTION_STRENGTH) {
        fixtureStatus(STATUS_WEAKENED, 20); player.weaknessAmount = 3;
    }
    if ((category == POTION && kind == POTION_TELEPATHY) || (category == CHARM && kind == CHARM_TELEPATHY)) fixtureHiddenMinds();
    if ((category == POTION && kind == POTION_LEVITATION) || (category == CHARM && kind == CHARM_LEVITATION)) {
        player.bookkeepingFlags |= MB_SEIZED;
        pmap[41][14].layers[LIQUID] = CHASM;
    }
    if ((category == POTION && kind == POTION_HASTE_SELF) || (category == CHARM && kind == CHARM_HASTE)) fixtureStatus(STATUS_SLOWED, 20);
    if ((category == POTION && kind == POTION_FIRE_IMMUNITY) || (category == CHARM && kind == CHARM_FIRE_IMMUNITY)) {
        fixtureStatus(STATUS_BURNING, 20);
        pmap[41][14].layers[SURFACE] = PLAIN_FIRE;
    }
    if (category == POTION && kind == POTION_DETECT_MAGIC) {
        item *carried = give(WEAPON, SWORD, 'b', false); carried->enchant1 = 2;
        item *floor = fixtureFloorItem(WEAPON, SWORD, 43, 13); floor->enchant1 = 2;
        give(FOOD, RATION, 'c', true);
    }
    if (category == CHARM && kind == CHARM_PROTECTION) {
        fixtureTarget(MK_GOBLIN, 41, 14)->ticksUntilTurn = 0;
    }
    if (category == CHARM && kind == CHARM_SHATTERING) {
        pmap[41][13].layers[DUNGEON] = WALL;
        pmap[39][13].layers[DUNGEON] = WALL;
        pmap[39][13].flags |= IMPREGNABLE;
    }
    if (category == CHARM && kind == CHARM_TELEPORTATION) {
        fixtureRemoteRoom();
        fixtureStatus(STATUS_STUCK, 20);
        pmapAt(player.loc)->layers[SURFACE] = SPIDERWEB;
    }
    if (category == CHARM && kind == CHARM_RECHARGING) {
        give(STAFF, STAFF_FIRE, 'b', true)->charges = 0;
        give(WAND, WAND_SLOW, 'c', true)->charges = 3;
        give(CHARM, CHARM_HEALTH, 'd', true)->charges = 100;
    }
    if (category == CHARM && kind == CHARM_NEGATION) {
        fixtureStatus(STATUS_HASTED, 20);
        fixtureStatus(STATUS_INVISIBLE, 20);
        creature *target = fixtureTarget(MK_OGRE, 43, 14);
        target->status[STATUS_SLOWED] = target->maxStatus[STATUS_SLOWED] = 50;
        target->status[STATUS_INVISIBLE] = target->maxStatus[STATUS_INVISIBLE] = 50;
        target->ticksUntilTurn = 10000;
        item *weapon = fixtureFloorItem(WEAPON, SWORD, 41, 13); weapon->flags |= ITEM_CURSED | ITEM_PROTECTED;
        fixtureFloorItem(WAND, WAND_SLOW, 41, 15);
        item *carried = give(WEAPON, SWORD, 'b', false); carried->enchant1 = 2;
        fixtureRemoteRoom();
        fixtureFloorItem(WEAPON, SWORD, 22, 14);
    }
    updateEncumbrance();
}

/* These helpers set initial data only. All effects and costs are subsequently
 * performed by the unchanged command/item/turn functions through real input. */
static void fixtureMonsterStatus(creature *monst, int status, short duration) {
    monst->status[status] = monst->maxStatus[status] = duration;
}

static creature *fixtureFrozenTarget(short kind, int x, int y) {
    creature *monst = fixtureTarget(kind, x, y);
    monst->ticksUntilTurn = 10000;
    monst->turnsUntilRegen = 100000;
    monst->regenPerTurn = 0;
    return monst;
}

static void fixtureScroll(short kind, boolean known) {
    player.currentHP = player.info.maxHP;
    player.turnsUntilRegen = 100000;
    player.regenPerTurn = 0;
    item *primary = give(SCROLL, kind, 'a', known);
    primary->quantity = 2;
    primary->flags &= ~ITEM_MAGIC_DETECTED;
    switch (kind) {
        case SCROLL_ENCHANTING: case SCROLL_IDENTIFY: {
            item *weapon = give(WEAPON, SWORD, 'b', false);
            weapon->enchant1 = 0;
            weapon->timesEnchanted = 0;
            weapon->flags |= ITEM_CURSED;
            give(WEAPON, DAGGER, 'c', false);
            break;
        }
        case SCROLL_TELEPORT:
            fixtureRemoteRoom();
            fixtureStatus(STATUS_STUCK, 20);
            pmapAt(player.loc)->layers[SURFACE] = SPIDERWEB;
            break;
        case SCROLL_REMOVE_CURSE:
            give(WEAPON, SWORD, 'b', true)->flags |= ITEM_CURSED;
            give(ARMOR, LEATHER_ARMOR, 'c', true)->flags |= ITEM_CURSED;
            give(RING, RING_REGENERATION, 'd', true)->flags |= ITEM_CURSED;
            fixtureFloorItem(WEAPON, SWORD, 41, 13)->flags |= ITEM_CURSED;
            break;
        case SCROLL_RECHARGING:
            give(STAFF, STAFF_FIRE, 'b', true)->charges = 0;
            give(CHARM, CHARM_HEALTH, 'c', true)->charges = 100;
            give(WAND, WAND_SLOW, 'd', true)->charges = 3;
            break;
        case SCROLL_PROTECT_ARMOR: case SCROLL_PROTECT_WEAPON: {
            unsigned short category = kind == SCROLL_PROTECT_ARMOR ? ARMOR : WEAPON;
            short itemKind = category == ARMOR ? LEATHER_ARMOR : SWORD;
            item *equipped = give(category, itemKind, 'b', true);
            equipped->flags = (equipped->flags | ITEM_CURSED | ITEM_EQUIPPED) & ~ITEM_PROTECTED;
            item *other = give(category, itemKind, 'c', true);
            other->flags = (other->flags | ITEM_CURSED) & ~ITEM_PROTECTED;
            if (category == ARMOR) rogue.armor = equipped; else rogue.weapon = equipped;
            break;
        }
        case SCROLL_MAGIC_MAPPING:
            fixtureRemoteRoom();
            pmap[41][13].layers[DUNGEON] = SECRET_DOOR;
            break;
        case SCROLL_NEGATION: {
            fixtureStatus(STATUS_HASTED, 20);
            creature *near = fixtureFrozenTarget(MK_OGRE, 43, 14);
            fixtureMonsterStatus(near, STATUS_SLOWED, 50);
            fixtureMonsterStatus(near, STATUS_INVISIBLE, 50);
            fixtureRemoteRoom();
            creature *far = fixtureFrozenTarget(MK_RAT, 22, 15);
            fixtureMonsterStatus(far, STATUS_SLOWED, 50);
            fixtureMonsterStatus(far, STATUS_INVISIBLE, 50);
            fixtureFloorItem(WEAPON, SWORD, 41, 13)->flags |= ITEM_CURSED;
            fixtureFloorItem(WEAPON, SWORD, 22, 14)->flags |= ITEM_CURSED;
            give(WEAPON, SWORD, 'b', false)->enchant1 = 2;
            break;
        }
        case SCROLL_SHATTERING:
            pmap[41][13].layers[DUNGEON] = WALL;
            pmap[39][13].layers[DUNGEON] = WALL;
            pmap[39][13].flags |= IMPREGNABLE;
            break;
        case SCROLL_DISCORD:
            fixtureFrozenTarget(MK_OGRE, 43, 14);
            fixtureFrozenTarget(MK_ARROW_TURRET, 43, 16);
            fixtureRemoteRoom();
            fixtureFrozenTarget(MK_RAT, 22, 14);
            break;
        case SCROLL_AGGRAVATE_MONSTER:
            fixtureStatus(STATUS_INVISIBLE, 50);
            fixtureFrozenTarget(MK_GOBLIN, 44, 14)->creatureState = MONSTER_SLEEPING;
            break;
        case SCROLL_SANCTUARY: case SCROLL_SUMMON_MONSTER:
            break; /* empty initial surface / neighbors */
    }
    updateEncumbrance();
}

static creature *fixtureBoltTarget(int x) {
    creature *monst = fixtureFrozenTarget(MK_OGRE, x, 14);
    /* No innate immunities, reflection, regeneration or pre-existing statuses
     * obscure the particular effect. The original monster identity is retained. */
    monst->info.flags = monst->info.abilityFlags = 0;
    monst->info.turnsBetweenRegen = 0;
    monst->info.maxHP = monst->currentHP = 100;
    memset(monst->status, 0, sizeof monst->status);
    memset(monst->maxStatus, 0, sizeof monst->maxStatus);
    monst->poisonAmount = 0;
    return monst;
}

static void fixtureBoltAlly(creature *monst) {
    monst->creatureState = MONSTER_ALLY;
    monst->leader = &player;
    monst->bookkeepingFlags |= MB_FOLLOWER;
}

static void fixtureBoltStairs(void) {
    /* The original movement and environment rules use these coordinates, not
     * only the displayed tile. Keep stairs away from targets and walking tests. */
    pmapAt(rogue.upLoc)->layers[DUNGEON] = FLOOR;
    pmapAt(rogue.upLoc)->flags &= ~HAS_STAIRS;
    pmapAt(rogue.downLoc)->layers[DUNGEON] = FLOOR;
    pmapAt(rogue.downLoc)->flags &= ~HAS_STAIRS;
    rogue.upLoc = (pos){37, 11};
    rogue.downLoc = (pos){37, 17};
    pmapAt(rogue.upLoc)->layers[DUNGEON] = UP_STAIRS;
    pmapAt(rogue.upLoc)->flags |= HAS_STAIRS;
    pmapAt(rogue.downLoc)->layers[DUNGEON] = DOWN_STAIRS;
    pmapAt(rogue.downLoc)->flags |= HAS_STAIRS;
    levels[rogue.depthLevel - 1].upStairsLoc = rogue.upLoc;
    levels[rogue.depthLevel - 1].downStairsLoc = rogue.downLoc;
}

static void fixtureBolt(unsigned short category, short kind, int condition) {
    fixtureBoltStairs();
    player.info.maxHP = player.currentHP = 100;
    player.turnsUntilRegen = 100000;
    player.regenPerTurn = 0;
    item *primary = give(category, kind, 'a', condition != 2);
    /* A known kind can still have an unidentified instance/unknown charges. */
    tableForItemCategory(category)[kind].identified = true;
    primary->charges = condition == 1 || condition == 2 ? 0 : category == STAFF ? 2 : 3;
    primary->flags &= ~ITEM_MAX_CHARGES_KNOWN;
    memset(primary->lastUsed, 0, sizeof primary->lastUsed);
    if (category == STAFF) primary->enchant2 = 1000;

    const boolean primarySetup = condition <= 2;
    const boolean unsuitable = condition == 3;
    const boolean reflection = condition == 4;
    creature *target = NULL;
    boolean hasTarget = true;
    if (category == STAFF) {
        if (primarySetup && (kind == STAFF_TUNNELING || kind == STAFF_BLINKING || kind == STAFF_CONJURATION)) hasTarget = false;
        if (unsuitable && (kind == STAFF_TUNNELING || kind == STAFF_BLINKING
                           || kind == STAFF_OBSTRUCTION || kind == STAFF_CONJURATION)) hasTarget = false;
    }
    if (hasTarget) target = fixtureBoltTarget(43);

    if (category == STAFF && primarySetup) {
        if (kind == STAFF_LIGHTNING || kind == STAFF_FIRE) fixtureBoltTarget(42);
        if (kind == STAFF_TUNNELING) for (int x = 41; x <= 43; x++) pmap[x][14].layers[DUNGEON] = WALL;
        if (kind == STAFF_BLINKING) {
            for (int x = 41; x <= 47; x++) pmap[x][14].layers[DUNGEON] = FLOOR;
            fixtureStatus(STATUS_STUCK, 20);
        }
        if (kind == STAFF_HEALING) {
            target->currentHP = 20;
            fixtureMonsterStatus(target, STATUS_CONFUSED, 20);
        }
        if (kind == STAFF_HASTE) {
            fixtureMonsterStatus(target, STATUS_SLOWED, 20);
            target->movementSpeed = target->info.movementSpeed * 2;
            target->attackSpeed = target->info.attackSpeed * 2;
        }
    }
    if (category == WAND && primarySetup) {
        if (kind == WAND_TELEPORT || kind == WAND_BECKONING) fixtureMonsterStatus(target, STATUS_STUCK, 20);
        if (kind == WAND_TELEPORT) fixtureRemoteRoom();
        if (kind == WAND_SLOW || kind == WAND_NEGATION) {
            fixtureMonsterStatus(target, STATUS_HASTED, 20);
            target->movementSpeed = target->info.movementSpeed / 2;
            target->attackSpeed = target->info.attackSpeed / 2;
        }
        if (kind == WAND_NEGATION) {
            fixtureMonsterStatus(target, STATUS_INVISIBLE, 20);
            target->info.flags |= MONST_IMMUNE_TO_FIRE;
        }
        if (kind == WAND_DOMINATION) {
            target->currentHP = 1;
            fixtureMonsterStatus(target, STATUS_DISCORDANT, 20);
        }
        if (kind == WAND_PLENTY || kind == WAND_INVISIBILITY || kind == WAND_EMPOWERMENT) fixtureBoltAlly(target);
        if (kind == WAND_PLENTY) target->currentHP = 9;
        if (kind == WAND_EMPOWERMENT) {
            target->currentHP = 20;
            fixtureMonsterStatus(target, STATUS_POISONED, 20);
            target->poisonAmount = 1;
        }
    }
    if (unsuitable) {
        if (category == STAFF) {
            if (kind == STAFF_LIGHTNING) target->info.flags |= MONST_INVULNERABLE;
            if (kind == STAFF_FIRE) fixtureMonsterStatus(target, STATUS_IMMUNE_TO_FIRE, 20);
            if (kind == STAFF_POISON || kind == STAFF_ENTRANCEMENT || kind == STAFF_DISCORD || kind == STAFF_HASTE) target->info.flags |= MONST_INANIMATE;
            if (kind == STAFF_TUNNELING || kind == STAFF_BLINKING) pmap[41][14].layers[DUNGEON] = WALL;
            if (kind == STAFF_TUNNELING) pmap[41][14].flags |= IMPREGNABLE;
            if (kind == STAFF_OBSTRUCTION || kind == STAFF_CONJURATION) pmap[43][14].layers[DUNGEON] = WALL;
            if (kind == STAFF_PROTECTION) fixtureMonsterStatus(target, STATUS_SHIELDED, 500);
        } else {
            if (kind == WAND_TELEPORT || kind == WAND_BECKONING) target->info.flags |= MONST_IMMOBILE;
            else if (kind != WAND_NEGATION) target->info.flags |= MONST_INANIMATE;
        }
    }
    if (reflection) {
        target->info.abilityFlags = MA_REFLECT_100;
        if (category == STAFF) {
            if (kind == STAFF_BLINKING) fixtureStatus(STATUS_STUCK, 20);
            if (kind == STAFF_HEALING) player.currentHP = 20;
            if (kind == STAFF_HASTE) fixtureStatus(STATUS_SLOWED, 20);
        } else {
            if (kind == WAND_TELEPORT) { fixtureRemoteRoom(); fixtureStatus(STATUS_STUCK, 20); }
            if (kind == WAND_SLOW || kind == WAND_NEGATION) fixtureStatus(STATUS_HASTED, 20);
            if (kind == WAND_NEGATION) fixtureStatus(STATUS_INVISIBLE, 20);
            if (kind == WAND_PLENTY) player.currentHP = 9;
        }
    }
    updateEncumbrance();
}

/* Initial conditions only. Original combat, AI, machine and vision routines
 * remain reachable exclusively through subsequent real player events. */
static void fixtureContracts(int scene) {
    fixtureBoltStairs();
    player.info.maxHP = player.currentHP = 100;
    player.turnsUntilRegen = 100000;
    player.regenPerTurn = 0;
    if (scene == CHECK_SLAYING_MATCH || scene == CHECK_SLAYING_OTHER) {
        item *weapon = give(WEAPON, DAGGER, 'a', true);
        weapon->flags |= ITEM_RUNIC | ITEM_EQUIPPED;
        weapon->flags &= ~(ITEM_RUNIC_IDENTIFIED | ITEM_RUNIC_HINTED);
        weapon->enchant2 = W_SLAYING;
        weapon->vorpalEnemy = scene == CHECK_SLAYING_MATCH ? 4 : 2;
        rogue.weapon = weapon;
        creature *target = fixtureFrozenTarget(MK_OGRE, 41, 14);
        target->info.maxHP = target->currentHP = 100;
        /* Artificial shared hit guarantee isolates the slaying effect. */
        target->status[STATUS_STUCK] = target->maxStatus[STATUS_STUCK] = 50;
    } else if (scene == CHECK_VULNERABILITY || scene == CHECK_PLAIN_ARMOR_CONTROL) {
        item *armor = give(ARMOR, LEATHER_ARMOR, 'a', true);
        armor->flags |= ITEM_EQUIPPED;
        if (scene == CHECK_VULNERABILITY) { armor->flags |= ITEM_RUNIC; armor->enchant2 = A_VULNERABILITY; }
        rogue.armor = armor;
        pmapAt(player.loc)->layers[SURFACE] = SPIDERWEB;
        fixtureStatus(STATUS_STUCK, 50);
        fixtureTarget(MK_KOBOLD, 41, 14)->ticksUntilTurn = 0;
    } else if (scene == CHECK_SPIDER_OPEN || scene == CHECK_SPIDER_BLOCKED) {
        if (scene == CHECK_SPIDER_BLOCKED) for (int y = 10; y <= 18; y++) pmap[42][y].layers[DUNGEON] = WALL;
        fixtureTarget(MK_SPIDER, 44, 14)->ticksUntilTurn = 0;
    } else if (scene == CHECK_CAPTIVE) {
        creature *target = fixtureTarget(MK_OGRE, 41, 14);
        target->bookkeepingFlags |= MB_CAPTIVE | MB_SEIZED;
        target->bookkeepingFlags &= ~MB_FOLLOWER;
        target->leader = NULL;
        target->ticksUntilTurn = 0;
    } else if (scene == CHECK_LEVER || scene == CHECK_LEVER_BREAKER) {
        pmap[41][14].layers[DUNGEON] = WALL_LEVER;
        pmap[43][14].layers[DUNGEON] = PORTCULLIS_CLOSED;
        pmap[43][16].layers[DUNGEON] = PORTCULLIS_CLOSED;
        for (int i = 0; i < 3; i++) { int x = i ? 43 : 41, y = i == 2 ? 16 : 14;
            pmap[x][y].machineNumber = i == 2 ? 8 : 7; pmap[x][y].flags |= IS_IN_ROOM_MACHINE;
        }
        if (scene == CHECK_LEVER_BREAKER) { pmap[43][12].layers[DUNGEON] = ELECTRIC_CRYSTAL_OFF;
            pmap[43][12].machineNumber = 7; pmap[43][12].flags |= IS_IN_ROOM_MACHINE;
        }
    } else if (scene >= CHECK_KEY_DISPOSABLE && scene <= CHECK_KEY_WRONG_LOCK) {
        pmap[41][14].layers[DUNGEON] = LOCKED_DOOR;
        pmap[41][14].machineNumber = 7;
        pmap[41][14].flags |= IS_IN_ROOM_MACHINE;
        item *key = give(KEY, KEY_DOOR, 'a', true);
        key->flags |= ITEM_IS_KEY;
        key->originDepth = rogue.depthLevel + (scene == CHECK_KEY_WRONG_DEPTH ? 1 : 0);
        memset(key->keyLoc, 0, sizeof key->keyLoc);
        key->keyLoc[0] = (keyLocationProfile) {{20, 14}, scene == CHECK_KEY_WRONG_LOCK ? 8 : 7,
                                            scene != CHECK_KEY_REUSABLE};
    } else if (scene == CHECK_WATER || scene == CHECK_WATER_LEVITATING) {
        pmap[41][14].layers[LIQUID] = DEEP_WATER;
        if (scene == CHECK_WATER_LEVITATING) fixtureStatus(STATUS_LEVITATING, 100);
    } else if (scene == CHECK_VISIBILITY_MEMORY) {
        for (int y = 12; y <= 16; y++) pmap[41][y].layers[DUNGEON] = WALL;
        pmap[42][14].layers[SURFACE] = CARPET;
        /* Completely sealed, still undiscovered control beyond the local room. */
        pmap[22][14].layers[DUNGEON] = FLOOR;
    }
    updateEncumbrance();
}

int brogue_check_fixture(int scene) {
    if (preparedScene || !gameConst || brogue_check_wait_kind() != BROWSER_COMMAND
        || rogue.seed != 42 || rogue.playerTurnNumber != 0 || rogue.playbackMode || rogue.cursorMode
        || rogue.cursorLoc.x >= 0 || rogue.cursorLoc.y >= 0 || !rogue.gameInProgress) return -1;
#if defined(BROGUE_BROWSER)
    if (!initialCommandDisplay) return -1;
#endif
    unsigned short category = 0;
    int group = scene / 1000 * 1000, kind = scene % 1000, condition = 0;
    if (scene >= 1000) {
        if (group == CHECK_POTION_UNKNOWN || group == CHECK_POTION_KNOWN) category = POTION;
        else if (group == CHECK_CHARM_READY || group == CHECK_CHARM_COOLDOWN) category = CHARM;
        else if (group == CHECK_SCROLL_UNKNOWN || group == CHECK_SCROLL_KNOWN) category = SCROLL;
        else if (group == CHECK_STAFF_READY || group == CHECK_WAND_READY) {
            category = group == CHECK_STAFF_READY ? STAFF : WAND;
            condition = kind / 100;
            kind %= 100;
            if (condition > 4 && !(category == WAND && condition == 5 && kind == WAND_DOMINATION)) return -1;
        }
        else return -1;
        const int enumCount = category == POTION ? POTION_LICHEN + 1 : category == CHARM ? CHARM_NEGATION + 1
            : category == SCROLL ? SCROLL_SUMMON_MONSTER + 1 : category == STAFF ? STAFF_PROTECTION + 1 : WAND_EMPOWERMENT + 1;
        if (kind < 0 || kind >= enumCount || kind >= itemKindCount(category, 0)) return -1;
    } else if (scene < 1 || scene > CHECK_VISIBILITY_MEMORY) return -1;
    fixtureRoom();
    preparedScene = scene;
    if (category == POTION || category == CHARM) fixtureConsumable(category, kind, group == CHECK_POTION_KNOWN || category == CHARM, group == CHECK_CHARM_COOLDOWN);
    else if (category == SCROLL) fixtureScroll(kind, group == CHECK_SCROLL_KNOWN);
    else if (category == STAFF || category == WAND) fixtureBolt(category, kind, condition);
    else if (scene <= 8) fixtureInventory();
    else if (scene >= CHECK_SLAYING_MATCH) fixtureContracts(scene);
    switch (scene) {
        case CHECK_TARGET_CYCLE:
            /* Three independently targetable enemies distinguish forward and
             * reverse order. Keep the bolt-effect scenes' collinear targets. */
            fixtureBoltStairs();
            give(STAFF, STAFF_LIGHTNING, 'a', true);
            fixtureFrozenTarget(MK_OGRE, 42, 14);
            fixtureFrozenTarget(MK_OGRE, 43, 16);
            fixtureFrozenTarget(MK_OGRE, 38, 12);
            break;
        case 2: fixtureTarget(MK_OGRE, 43, 14); break;
        case 3:
            pmap[40][13].layers[DUNGEON] = WALL;
            pmap[41][14].layers[DUNGEON] = DOOR;
            pmap[39][14].layers[DUNGEON] = SECRET_DOOR;
            break;
        case 4: pmap[41][14].layers[DUNGEON] = GAS_TRAP_POISON_HIDDEN; break;
        case 5:
            player.status[STATUS_BURNING] = player.maxStatus[STATUS_BURNING] = 2;
            break;
        case 6: fixtureTarget(MK_GOBLIN, 44, 14); break;
        case 7: case 8:
            pmapAt(player.loc)->flags &= ~HAS_PLAYER;
            player.loc = rogue.downLoc;
            pmapAt(player.loc)->flags |= HAS_PLAYER;
            break;
        case 9:
            player.currentHP = 1;
            player.poisonAmount = 2;
            player.status[STATUS_POISONED] = player.maxStatus[STATUS_POISONED] = 2;
            rogue.gold = 123;
            break;
        case 10:
            give(AMULET, 0, 'a', true);
            rogue.gold = 123;
            pmapAt(player.loc)->flags &= ~HAS_PLAYER;
            player.loc = rogue.upLoc;
            pmapAt(player.loc)->flags |= HAS_PLAYER;
            break;
        case 11:
            give(AMULET, 0, 'a', true);
            rogue.gold = 123;
            rogue.depthLevel = gameConst->deepestLevel;
            pmapAt(player.loc)->flags &= ~HAS_PLAYER;
            player.loc = rogue.downLoc;
            pmapAt(player.loc)->flags |= HAS_PLAYER;
            pmapAt(player.loc)->layers[DUNGEON] = DUNGEON_PORTAL;
            break;
    }
    updateIdentifiableItems();
    updateMapToShore();
    updateVision(false);
    displayLevel();
    refreshSideBar(-1, -1, false);
#if defined(BROGUE_BROWSER)
    *initialCommandDisplay = saveDisplayBuffer();
#endif
    brogue_check_publish();
    return scene;
}
#endif
