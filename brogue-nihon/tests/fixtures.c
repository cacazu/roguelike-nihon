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

extern int brogue_check_wait_kind(void);
extern void brogue_check_publish(void);

static int preparedScene;
static char featureJSON[65536];
static size_t featureLength;
static boolean featureOverflow;

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
           "\"x\":%d,\"y\":%d,\"inscription\":",
           it->inventoryLetter, it->category, it->kind, it->quantity, it->charges,
           it->enchant1, it->flags, !!(it->flags & ITEM_IDENTIFIED), !!(it->flags & ITEM_EQUIPPED),
           !!(it->flags & ITEM_PROTECTED), it->loc.x, it->loc.y);
    featureString(it->inscription);
    featureAppend(",\"kindKnown\":%d,\"called\":%d,\"callTitle\":", table ? table[it->kind].identified : 0,
           table ? table[it->kind].called : 0);
    featureString(table ? table[it->kind].callTitle : "");
    featureAppend("}");
}

const char *brogue_check_features(void) {
    featureLength = 0;
    featureOverflow = false;
    featureAppend("{\"fixture\":%d,\"seed\":\"%llu\",\"turn\":%lu,\"rng\":%lu,\"x\":%d,\"y\":%d,"
           "\"hp\":%d,\"maxHP\":%d,\"depth\":%d,\"deepest\":%d,\"ended\":%d,\"inProgress\":%d,"
           "\"highScoreSaved\":%d,\"gold\":%lu,\"strength\":%d,\"poisonAmount\":%d,\"ready\":%d,"
           "\"weapon\":%d,\"armor\":%d,\"ringLeft\":%d,\"ringRight\":%d,"
           "\"upX\":%d,\"upY\":%d,\"downX\":%d,\"downY\":%d,\"statuses\":[",
           preparedScene, (unsigned long long) rogue.seed, rogue.playerTurnNumber, randomNumbersGenerated,
           player.loc.x, player.loc.y, player.currentHP, player.info.maxHP, rogue.depthLevel,
           gameConst->deepestLevel, rogue.gameHasEnded, rogue.gameInProgress, rogue.highScoreSaved,
           rogue.gold, rogue.strength, player.poisonAmount, brogue_check_wait_kind() == BROWSER_COMMAND,
           rogue.gameInProgress && rogue.weapon ? rogue.weapon->inventoryLetter : 0,
           rogue.gameInProgress && rogue.armor ? rogue.armor->inventoryLetter : 0,
           rogue.gameInProgress && rogue.ringLeft ? rogue.ringLeft->inventoryLetter : 0,
           rogue.gameInProgress && rogue.ringRight ? rogue.ringRight->inventoryLetter : 0,
           rogue.upLoc.x, rogue.upLoc.y, rogue.downLoc.x, rogue.downLoc.y);
    for (int i = 0; i < NUMBER_OF_STATUS_EFFECTS; i++) featureAppend("%s%d", i ? "," : "", player.status[i]);
    featureAppend("],\"status\":{\"nutrition\":%d,\"burning\":%d,\"poisoned\":%d,\"slowed\":%d,"
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
               "\"slowed\":%d,\"burning\":%d,\"poisoned\":%d,\"invisible\":%d,\"negated\":%d}",
               monst->info.monsterID, monst->loc.x, monst->loc.y, monst->currentHP, monst->info.maxHP,
               monst->creatureState, monst->status[STATUS_SLOWED], monst->status[STATUS_BURNING],
               monst->status[STATUS_POISONED], monst->status[STATUS_INVISIBLE], monst->wasNegated);
    }
    featureAppend("],\"cells\":[");
    count = 0;
    if (rogue.gameInProgress) for (int y = 10; y <= 18; y++) for (int x = 36; x <= 44; x++) {
        if (count++) featureAppend(",");
        featureAppend("{\"x\":%d,\"y\":%d,\"flags\":%lu,\"dungeon\":%d,\"liquid\":%d,\"surface\":%d,\"gas\":%d,\"volume\":%d}",
               x, y, pmap[x][y].flags, pmap[x][y].layers[DUNGEON], pmap[x][y].layers[LIQUID],
               pmap[x][y].layers[SURFACE], pmap[x][y].layers[GAS], pmap[x][y].volume);
    }
    featureAppend("]}");
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

int brogue_check_fixture(int scene) {
    if (scene < 1 || scene > 11 || preparedScene || brogue_check_wait_kind() != BROWSER_COMMAND
        || rogue.seed != 42 || rogue.playerTurnNumber != 0 || rogue.playbackMode || rogue.cursorMode
        || rogue.cursorLoc.x >= 0 || rogue.cursorLoc.y >= 0 || !rogue.gameInProgress) return -1;
    fixtureRoom();
    preparedScene = scene;
    if (scene <= 8) fixtureInventory();
    switch (scene) {
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
    brogue_check_publish();
    return scene;
}
#endif
