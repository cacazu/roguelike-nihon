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
static creature *nativeAISubject;
static creature *enteredSubject;
static creature *corridorSubject;
static creature *corridorCompanion;
static pos nativeAIRoute[9];
static int nativeAIRouteCount;
#if defined(BROGUE_BROWSER)
static SavedDisplayBuffer *initialCommandDisplay;
void brogue_check_bind_command_display(SavedDisplayBuffer *saved) {
    if (!preparedScene && rogue.playerTurnNumber == 0
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
    featureAppend("],\"netEnchant\":");
    if (it->category & (WEAPON | ARMOR)) featureAppend("%lld", netEnchant(it));
    else featureAppend("null");
    featureAppend(",\"armorRaw\":");
    if (it->category & ARMOR) featureAppend("%d", it->armor); else featureAppend("null");
    featureAppend("}");
}

static void featureStatuses(const short *statuses) {
    featureAppend("[");
    for (int i = 0; i < NUMBER_OF_STATUS_EFFECTS; i++) featureAppend("%s%d", i ? "," : "", statuses[i]);
    featureAppend("]");
}

static void featureCell(pos loc) {
    featureAppend("{\"x\":%d,\"y\":%d,\"flags\":%lu,\"dungeon\":%d,\"liquid\":%d,"
           "\"surface\":%d,\"gas\":%d,\"volume\":%d,\"terrainFlags\":%lu,\"mechFlags\":%lu,\"rememberedTerrain\":%d,\"machine\":%d}",
           loc.x, loc.y, pmapAt(loc)->flags, pmapAt(loc)->layers[DUNGEON], pmapAt(loc)->layers[LIQUID],
           pmapAt(loc)->layers[SURFACE], pmapAt(loc)->layers[GAS], pmapAt(loc)->volume, terrainFlags(loc), terrainMechFlags(loc),
           pmapAt(loc)->rememberedTerrain, pmapAt(loc)->machineNumber);
}

static int featureLeaderIndex(creature *leader) {
    if (!leader) return -1;
    if (leader == &player) return -2;
    int index = 0;
    for (creatureIterator iter = iterateCreatures(monsters); hasNextCreature(iter); index++) {
        if (nextCreature(&iter) == leader) return index;
    }
    return -1;
}

/* A depth-one read of the native carried object, only for ENTER scenes.
 * enteredSubject is compared by identity, never dereferenced after death. */
static void featureCarriedMonster(creature *monst) {
    if (!monst) { featureAppend("null"); return; }
    featureAppend("{\"preparedSubject\":%d,\"kind\":%d,\"x\":%d,\"y\":%d,\"hp\":%d,\"maxHP\":%d,"
                  "\"state\":%d,\"flags\":%lu,\"abilityFlags\":%lu,\"bookkeepingFlags\":%lu,"
                  "\"ticksUntilTurn\":%d,\"movementSpeed\":%d,\"attackSpeed\":%d,"
                  "\"mode\":%d,\"mutationIndex\":%d,\"turnsUntilRegen\":%ld,\"regenPerTurn\":%d,\"statuses\":",
                  monst == enteredSubject, monst->info.monsterID, monst->loc.x, monst->loc.y,
                  monst->currentHP, monst->info.maxHP, monst->creatureState, monst->info.flags,
                  monst->info.abilityFlags, monst->bookkeepingFlags, monst->ticksUntilTurn,
                  monst->movementSpeed, monst->attackSpeed, monst->creatureMode, monst->mutationIndex,
                  monst->turnsUntilRegen, monst->regenPerTurn);
    featureStatuses(monst->status);
    featureAppend(",\"maxStatuses\":"); featureStatuses(monst->maxStatus);
    featureAppend(",\"combat\":{\"damageMin\":%d,\"damageMax\":%d,\"accuracy\":%d,\"defense\":%d}}",
                  monst->info.damage.lowerBound, monst->info.damage.upperBound,
                  monst->info.accuracy, monst->info.defense);
}

/* Bounded pure native-info observation; no safety map/pathfinding/AI call. */
static void featureDistanceObservation(creature *monst) {
    featureAppend(",\"fieldOfView\":%d,\"publicVisible\":%d,\"nativeBolts\":[",
                  !!(pmapAt(monst->loc)->flags & IN_FIELD_OF_VIEW), canSeeMonster(monst));
    for (int i = 0; i < 20; i++) featureAppend("%s%d", i ? "," : "", monst->info.bolts[i]);
    featureAppend("]");
}

/* Pure shape/scent/FOV evidence for corridor and aggravation scenes; never ask the AI
 * to choose a direction. The prepared pointers are compared, not dereferenced. */
static void featureCorridorObservation(creature *monst) {
    featureAppend(",\"corridorSubject\":%d,\"corridorCompanion\":%d,\"passableArcs\":%d,"
                  "\"scent\":%d,\"fieldOfView\":%d,\"publicVisible\":%d,\"adjacent\":[",
                  monst == corridorSubject, monst == corridorCompanion,
                  passableArcCount(monst->loc.x, monst->loc.y), scentMap[monst->loc.x][monst->loc.y],
                  !!(pmapAt(monst->loc)->flags & IN_FIELD_OF_VIEW), canSeeMonster(monst));
    int count = 0;
    if (monst == corridorSubject) for (int dir = 0; dir < DIRECTION_COUNT; dir++) {
        pos loc = {monst->loc.x + nbDirs[dir][0], monst->loc.y + nbDirs[dir][1]};
        if (!isPosInMap(loc)) continue;
        if (count++) featureAppend(",");
        featureAppend("{\"arc\":%d,\"scent\":%d,\"fieldOfView\":%d,\"cell\":",
                      passableArcCount(loc.x,loc.y), scentMap[loc.x][loc.y],
                      !!(pmapAt(loc)->flags & IN_FIELD_OF_VIEW));
        featureCell(loc);
        featureAppend("}");
    }
    featureAppend("]");
}

/* Native-AI observation is read-only: never select a destination, diffuse
 * scent or refresh a waypoint here. A stale pointer is compared, not read. */
static boolean fixtureIsNativeWorld(void) {
    return !preparedScene || preparedScene == CHECK_NATIVE_LEVELS
        || preparedScene / 1000 * 1000 == CHECK_NATIVE_AI
        || preparedScene / 1000 * 1000 == CHECK_NATIVE_SCENT;
}
static unsigned long long fixtureHashWord(unsigned long long h, unsigned long value) {
    for (int i = 0; i < 4; i++) { h ^= value & 255; h *= 1099511628211ULL; value >>= 8; }
    return h;
}
static void featureNativeWorld(void) {
    if (!rogue.gameInProgress || !fixtureIsNativeWorld() || rogue.playerTurnNumber != 0
        || rogue.wpCount <= 0 || rogue.wpCount > MAX_WAYPOINT_COUNT) { featureAppend("null"); return; }
    unsigned long long terrain = 14695981039346656037ULL, waypoints = terrain, scent = terrain;
    for (int x = 0; x < DCOLS; x++) for (int y = 0; y < DROWS; y++) {
        for (int layer = 0; layer < NUMBER_TERRAIN_LAYERS; layer++) terrain = fixtureHashWord(terrain, pmap[x][y].layers[layer]);
        terrain = fixtureHashWord(terrain, pmap[x][y].volume);
        terrain = fixtureHashWord(terrain, pmap[x][y].machineNumber);
        scent = fixtureHashWord(scent, scentMap[x][y]);
    }
    for (int i = 0; i < rogue.wpCount; i++) {
        if (!rogue.wpDistance[i]) { featureAppend("null"); return; }
        waypoints = fixtureHashWord(waypoints, rogue.wpCoordinates[i].x);
        waypoints = fixtureHashWord(waypoints, rogue.wpCoordinates[i].y);
        for (int x = 0; x < DCOLS; x++) for (int y = 0; y < DROWS; y++)
            waypoints = fixtureHashWord(waypoints, (unsigned short)rogue.wpDistance[i][x][y]);
    }
    featureAppend("{\"terrainHash\":\"%016llx\",\"waypointHash\":\"%016llx\",\"scentHash\":\"%016llx\",\"wpCount\":%d,\"scentTurnNumber\":%u}", terrain, waypoints, scent, rogue.wpCount, rogue.scentTurnNumber);
}
static void featureNativeAI(void) {
    creature *subject = NULL; int index = 0, subjectIndex = -1;
    if ((preparedScene / 1000 * 1000 == CHECK_NATIVE_AI
        || preparedScene / 1000 * 1000 == CHECK_NATIVE_SCENT) && rogue.gameInProgress && monsters) {
        for (creatureIterator it = iterateCreatures(monsters); hasNextCreature(it); index++) {
            creature *m = nextCreature(&it);
            if (m == nativeAISubject) { subject = m; subjectIndex = index; break; }
        }
    }
    if (!subject || !isPosInMap(subject->loc) || rogue.wpCount <= 0 || rogue.wpCount > MAX_WAYPOINT_COUNT) { featureAppend("null"); return; }
    featureAppend("{\"subjectIndex\":%d,\"targetWaypointIndex\":%d,\"scentTurnNumber\":%u,\"scentDistanceToPlayer\":%d,\"lastSeenPlayerAt\":[%d,%d],\"visited\":[", subjectIndex, subject->targetWaypointIndex, rogue.scentTurnNumber, scentDistance(subject->loc.x,subject->loc.y,player.loc.x,player.loc.y), subject->lastSeenPlayerAt.x,subject->lastSeenPlayerAt.y);
    for (int i = 0; i < rogue.wpCount; i++) featureAppend("%s%d", i ? "," : "", subject->waypointAlreadyVisited[i]);
    featureAppend("],\"waypoints\":[");
    for (int i = 0; i < rogue.wpCount; i++) featureAppend("%s[%d,%d]",i ? "," : "",rogue.wpCoordinates[i].x,rogue.wpCoordinates[i].y);
    featureAppend("],\"nearby\":["); int count = 0;
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
        pos cell = {subject->loc.x+dx,subject->loc.y+dy}; if (!isPosInMap(cell)) continue;
        featureAppend("%s{\"x\":%d,\"y\":%d,\"scent\":%u,\"fieldOfView\":%d,\"distances\":[",count++ ? "," : "",cell.x,cell.y,scentMap[cell.x][cell.y],!!(pmapAt(cell)->flags & IN_FIELD_OF_VIEW));
        for (int i = 0; i < rogue.wpCount; i++) featureAppend("%s%d",i ? "," : "",rogue.wpDistance[i] ? rogue.wpDistance[i][cell.x][cell.y] : -1);
        featureAppend("]}");
    }
    featureAppend("],\"route\":[");
    if (preparedScene / 1000 * 1000 == CHECK_NATIVE_SCENT)
        for (int i=0;i<nativeAIRouteCount;i++) featureAppend("%s[%d,%d]",i ? "," : "",nativeAIRoute[i].x,nativeAIRoute[i].y);
    featureAppend("]}");
}

static void featureNativeAIProbe(void);

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
    featureAppend(",\"mode\":%d,\"kindCounts\":{\"potion\":%d,\"charm\":%d,\"scroll\":%d,\"staff\":%d,\"wand\":%d,\"ring\":%d},"
           "\"movementSpeed\":%d,\"attackSpeed\":%d,\"turnsUntilRegen\":%ld,\"regenPerTurn\":%d,"
           "\"weaknessAmount\":%d,\"bookkeepingFlags\":%lu,\"searching\":%d,"
           "\"automationActive\":%d,\"autoPlayingLevel\":%d,\"disturbed\":%d,"
           "\"trueColorMode\":%d,\"displayStealthRangeMode\":%d,\"cursorMode\":%d,"
           "\"cursor\":{\"x\":%d,\"y\":%d},\"lightRadius\":{\"lower\":%d,\"upper\":%d},",
           rogue.mode, itemKindCount(POTION, 0), itemKindCount(CHARM, 0), itemKindCount(SCROLL, 0),
           itemKindCount(STAFF, 0), itemKindCount(WAND, 0), itemKindCount(RING, 0), player.movementSpeed, player.attackSpeed,
           player.turnsUntilRegen, player.regenPerTurn, player.weaknessAmount, player.bookkeepingFlags,
           player.status[STATUS_SEARCHING], rogue.automationActive, rogue.autoPlayingLevel, rogue.disturbed,
           rogue.trueColorMode, rogue.displayStealthRangeMode, rogue.cursorMode, rogue.cursorLoc.x, rogue.cursorLoc.y,
           rogue.minersLight.lightRadius.lowerBound, rogue.minersLight.lightRadius.upperBound);
    featureAppend("\"ringBonuses\":{\"clairvoyance\":%d,\"stealth\":%d,\"regeneration\":%d,"
           "\"transference\":%d,\"lightMultiplier\":%d,\"awareness\":%d,\"wisdom\":%d,\"reaping\":%d},"
           "\"stealthRange\":%d,\"regenInterval\":%ld,",
           rogue.clairvoyance, rogue.stealthBonus, rogue.regenerationBonus, rogue.transference,
           rogue.lightMultiplier, rogue.awarenessBonus, rogue.wisdomBonus, rogue.reaping,
           rogue.stealthRange, player.info.turnsBetweenRegen);
    featureAppend("\"levels\":[");
    /* Only native topology has meaningful visited/awaySince metadata. Some older
     * terminal fixtures deliberately change depth without travelling there. */
    if (rogue.gameInProgress && levels && fixtureIsNativeWorld()) {
        for (int i = 0; i < 2 && i < gameConst->deepestLevel; i++) {
            levelData *level = &levels[i];
            featureAppend("%s{\"depth\":%d,\"visited\":%d,\"seed\":\"%llu\",\"upX\":%d,\"upY\":%d,\"downX\":%d,\"downY\":%d,\"awaySince\":",
                   i ? "," : "", i + 1, level->visited, (unsigned long long) level->levelSeed,
                   level->upStairsLoc.x, level->upStairsLoc.y, level->downStairsLoc.x, level->downStairsLoc.y);
            /* awaySince is first initialized on exit, never on first entry. */
            if (level->visited && i + 1 != rogue.depthLevel) featureAppend("%lu", level->awaySince);
            else featureAppend("null");
            featureAppend("}");
        }
    }
    featureAppend("],");
    featureAppend("\"inWater\":%d,\"playerCombat\":{\"defense\":%d,\"damageMin\":%d,\"damageMax\":%d,\"accuracy\":%d},",
           rogue.inWater, player.info.defense, player.info.damage.lowerBound, player.info.damage.upperBound, player.info.accuracy);
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
               "\"newPowerCount\":%d,\"totalPowerCount\":%d,\"mode\":%d,\"mutationIndex\":%d,\"leaderIndex\":%d,\"turnsUntilRegen\":%ld,\"regenPerTurn\":%d,\"carriedItem\":", monst->poisonAmount,
               monst->movementSpeed, monst->attackSpeed, monst->newPowerCount, monst->totalPowerCount,
               monst->creatureMode, monst->mutationIndex, featureLeaderIndex(monst->leader), monst->turnsUntilRegen, monst->regenPerTurn);
        if (monst->carriedItem) featureItem(monst->carriedItem); else featureAppend("null");
        featureAppend(",\"combat\":{\"damageMin\":%d,\"damageMax\":%d,\"accuracy\":%d,\"defense\":%d}",
               monst->info.damage.lowerBound, monst->info.damage.upperBound, monst->info.accuracy, monst->info.defense);
        if (preparedScene >= CHECK_ENTER_SUMMONS && preparedScene <= CHECK_ENTER_PHOENIX) {
            featureAppend(",\"preparedSubject\":%d,\"carriedMonster\":", monst == enteredSubject);
            featureCarriedMonster(monst->carriedMonster);
        }
        if ((preparedScene >= CHECK_CORRIDOR_GROUP && preparedScene <= CHECK_CORRIDOR_WIDE)
            || (preparedScene >= CHECK_AGGRAVATE_MYSTIC && preparedScene <= CHECK_AGGRAVATE_OGRE))
            featureCorridorObservation(monst);
        if (preparedScene >= CHECK_DISTANCE_CLOSE && preparedScene <= CHECK_DISTANCE_KOBOLD)
            featureDistanceObservation(monst);
        if (preparedScene >= CHECK_AGGRAVATE_MYSTIC && preparedScene <= CHECK_AGGRAVATE_OGRE) {
            featureAppend(",\"nativeBolts\":[");
            for (int i = 0; i < 20; i++) featureAppend("%s%d", i ? "," : "", monst->info.bolts[i]);
            featureAppend("]");
        }
        featureAppend("}");
    }
    featureAppend("],\"cells\":[");
    count = 0;
    if (rogue.gameInProgress) for (int y = 10; y <= 18; y++) for (int x = 36; x <= 44; x++) {
        if (count++) featureAppend(",");
        featureCell((pos){x, y});
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
    featureAppend(",\"mapMetrics\":{\"discovered\":%u,\"visible\":%u,\"fieldOfView\":%u,\"mapped\":%u},\"nativeWorld\":",
           discovered, visible, fieldOfView, mapped);
    featureNativeWorld();
    featureAppend(",\"nativeAI\":"); featureNativeAI();
    featureAppend(",\"nativeAIProbe\":"); featureNativeAIProbe(); featureAppend("}");
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
    enteredSubject = NULL;
    corridorSubject = corridorCompanion = NULL;
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
static void fixtureSafeWorld(void) {
    fixtureBoltStairs();
    player.info.maxHP = player.currentHP = 100;
    player.turnsUntilRegen = 100000;
    player.regenPerTurn = 0;
}

/* Initial flight conditions only. Original updateMonsterState, safety maps,
 * fear decay and attacks run later through actual rest input, never here. */
static void fixtureMonsterFlight(int scene) {
    fixtureSafeWorld();
    creature *subject = fixtureTarget(MK_MONKEY, 41, 14);
    subject->creatureState = MONSTER_FLEEING;
    subject->creatureMode = scene == CHECK_FLIGHT_FEAR_NORMAL ? MODE_NORMAL : MODE_PERM_FLEEING;
    subject->ticksUntilTurn = 1;
    subject->carriedItem = generateItem(WEAPON, DART);
    subject->carriedItem->quantity = 3;
    if (scene != CHECK_FLIGHT_OPEN) {
        const pos blocked[] = {{40,13},{41,13},{42,13},{42,14},{42,15},{41,15},{40,15}};
        for (int i = 0; i < 7; i++) pmapAt(blocked[i])->layers[DUNGEON] = WALL;
    }
    if (scene == CHECK_FLIGHT_FEAR_NORMAL || scene == CHECK_FLIGHT_FEAR_PERMANENT)
        subject->status[STATUS_MAGICAL_FEAR] = subject->maxStatus[STATUS_MAGICAL_FEAR] = 4;
}

/* Passive original reflection only. Do not paralyze: a damaging bolt's
 * moralAttack would clear paralysis and replace the long initial clock. */
static void fixtureMonsterReflection(int scene) {
    const short actors[] = {MK_GUARDIAN, MK_WINGED_GUARDIAN, MK_MIRRORED_TOTEM, MK_OGRE, MK_GOLEM};
    fixtureSafeWorld();
    item *staff = give(STAFF, STAFF_LIGHTNING, 'a', true);
    tableForItemCategory(STAFF)[STAFF_LIGHTNING].identified = true;
    staff->enchant1 = 1;
    staff->charges = 12; /* Explicit over-capacity fixture, not natural capacity. */
    staff->enchant2 = 1000; /* >8333 would instead discharge a +1 staff. */
    creature *subject = fixtureTarget(actors[scene - CHECK_REFLECT_GUARDIAN], 43, 14);
    subject->ticksUntilTurn = 10000;
    subject->turnsUntilRegen = 100000;
    subject->regenPerTurn = 0;
}

/* Native kamikaze contact, with FLITS retained and no death/effect helper. */
static void fixtureMonsterKamikaze(int scene) {
    const short actors[] = {MK_BLOAT, MK_EXPLOSIVE_BLOAT, MK_RAT};
    const pos walls[] = {{40,13},{41,13},{42,13},{42,14},{42,15},{41,15},{40,15}};
    fixtureSafeWorld();
    creature *subject = fixtureTarget(actors[scene - CHECK_KAMIKAZE_BLOAT], 41, 14);
    subject->ticksUntilTurn = 1;
    for (int i = 0; i < 7; i++) pmapAt(walls[i])->layers[DUNGEON] = WALL;
}

/* Native Wisp hit-burn on nonflammable floor; no fire/effect helper. */
static void fixtureMonsterBurn(int scene) {
    const pos walls[] = {{40,13},{41,13},{42,13},{42,14},{42,15},{41,15},{40,15}};
    fixtureSafeWorld();
    player.info.defense = 0; /* Explicit initial defense, not inherited starting armor. */
    creature *subject = fixtureTarget(MK_WILL_O_THE_WISP, 41, 14);
    subject->ticksUntilTurn = 1;
    for (int i = 0; i < 7; i++) pmapAt(walls[i])->layers[DUNGEON] = WALL;
    if (scene != CHECK_BURN_UNPROTECTED) {
        player.status[STATUS_IMMUNE_TO_FIRE] = player.maxStatus[STATUS_IMMUNE_TO_FIRE]
            = scene == CHECK_BURN_IMMUNE ? 20 : 4;
    }
}

/* Native whip-range/AI controls: pure initial coordinates and one optional wall. */
static void fixtureMonsterWhip(int scene) {
    const short actorX[] = {42, 43, 44, 43, 42};
    fixtureSafeWorld();
    player.info.defense = 0; /* Explicit artificial initial defense. */
    pmapAt(player.loc)->flags &= ~HAS_PLAYER;
    player.loc = (pos) {38, 14};
    pmapAt(player.loc)->flags |= HAS_PLAYER;
    creature *subject = fixtureTarget(scene == CHECK_WHIP_OGRE ? MK_OGRE : MK_SALAMANDER,
                                     actorX[scene - CHECK_WHIP_RANGE4], 14);
    subject->ticksUntilTurn = 1;
    if (scene == CHECK_WHIP_OPAQUE) pmap[40][14].layers[DUNGEON] = WALL;
}

/* Pure initial conditions. Native summon, storage and death run only later
 * through real rests/targeted casts. Preserve all original monster information. */
static void fixtureMonsterEnter(int scene) {
    fixtureSafeWorld();
    player.info.maxHP = player.currentHP = 2000;
    player.info.defense = 0;
    item *staff = give(STAFF, STAFF_LIGHTNING, 'a', true);
    tableForItemCategory(STAFF)[STAFF_LIGHTNING].identified = true;
    staff->enchant1 = 45;
    staff->charges = 1; /* Within capacity; native natural recharge is retained. */
    staff->enchant2 = 111; /* 5000/45, below the native discharge boundary185. */
    enteredSubject = fixtureTarget(scene == CHECK_ENTER_VAMPIRE ? MK_VAMPIRE
                                  : scene == CHECK_ENTER_PHOENIX ? MK_PHOENIX_EGG : MK_PHYLACTERY, 42, 14);
    enteredSubject->ticksUntilTurn = 1;
}

/* Native hidden/negation traits only; real potion use and real wand input
 * must reveal/negate later. The long clock isolates traits from active AI. */
static void fixtureMonsterNegation(int scene) {
    fixtureSafeWorld();
    player.info.defense = 0;
    item *wand = give(WAND, WAND_NEGATION, 'a', true);
    wand->charges = 4; /* Common natural charge-range intersection across variants. */
    if (scene == CHECK_NEGATE_PHANTOM) give(POTION, POTION_TELEPATHY, 'b', true);
    creature *subject = fixtureTarget(scene == CHECK_NEGATE_PHANTOM ? MK_PHANTOM : MK_PHYLACTERY, 42, 14);
    subject->ticksUntilTurn = 10000;
}

/* Artificial group membership and a passable gate, not natural horde creation.
 * The isolated original companion is held by a long initial clock only. */
static void fixtureMonsterCorridor(int scene) {
    fixtureSafeWorld();
    player.info.defense = 0;
    for (int y = 10; y <= 18; y++) pmap[41][y].layers[DUNGEON] = y == 14 ? FLOOR : WALL;
    if (scene == CHECK_CORRIDOR_WIDE) {
        pmap[41][13].layers[DUNGEON] = FLOOR;
        pmap[41][15].layers[DUNGEON] = FLOOR;
    }
    corridorSubject = fixtureTarget(scene == CHECK_CORRIDOR_KOBOLD ? MK_KOBOLD : MK_OGRE, 44, 14);
    corridorSubject->ticksUntilTurn = 1;
    pmap[20][14].layers[DUNGEON] = FLOOR;
    corridorCompanion = fixtureTarget(MK_KOBOLD, 20, 14);
    corridorCompanion->ticksUntilTurn = 10000;
    if (scene != CHECK_CORRIDOR_SOLO) {
        corridorSubject->bookkeepingFlags |= MB_LEADER;
        corridorCompanion->bookkeepingFlags |= MB_FOLLOWER;
        corridorCompanion->leader = corridorSubject;
    }
}

/* Artificial solo actors keep native abilities and all spell choices.
 * Subsequent real rest inputs alone must produce distance maintenance. */
static void fixtureMonsterDistance(int scene) {
    fixtureSafeWorld();
    player.info.defense = 0;
    creature *subject = fixtureTarget(scene == CHECK_DISTANCE_KOBOLD ? MK_KOBOLD : MK_GOBLIN_MYSTIC,
                                      scene == CHECK_DISTANCE_BOUNDARY ? 43 : 42, 14);
    subject->ticksUntilTurn = 1;
}

/* Artificial current nutrition/quantity only; native max2150 and food table
 * remain. The real apply/eat command must perform all effects and costs. */
static void fixtureFruit(int scene) {
    fixtureSafeWorld();
    player.status[STATUS_NUTRITION] = scene == CHECK_FRUIT_STACK ? 300 : scene == CHECK_FRUIT_BOUNDARY ? 600 : 601;
    item *fruit = give(FOOD, FRUIT, 'a', true);
    fruit->quantity = scene == CHECK_FRUIT_STACK ? 2 : 1;
}

/* Artificial native actors/group and delayed clocks only. The real scroll
 * must remove traits, real rests must expire it, then original AI must act. */
static void fixtureMonsterAggravate(int scene) {
    fixtureSafeWorld();
    player.info.defense = 0;
    give(SCROLL, SCROLL_AGGRAVATE_MONSTER, 'a', true);
    if (scene == CHECK_AGGRAVATE_OGRE) {
        for (int y = 10; y <= 18; y++) pmap[41][y].layers[DUNGEON] = y == 14 ? FLOOR : WALL;
        corridorSubject = fixtureTarget(MK_OGRE, 44, 14);
        pmap[20][14].layers[DUNGEON] = FLOOR;
        corridorCompanion = fixtureTarget(MK_KOBOLD, 20, 14);
        corridorCompanion->ticksUntilTurn = 20000;
        corridorSubject->bookkeepingFlags |= MB_LEADER;
        corridorCompanion->bookkeepingFlags |= MB_FOLLOWER;
        corridorCompanion->leader = corridorSubject;
    } else {
        corridorSubject = fixtureTarget(MK_GOBLIN_MYSTIC, 42, 14);
    }
    corridorSubject->ticksUntilTurn = 10801;
}

/* Artificial cage/key/captive data only. Real movement/confirmation must
 * invoke the unchanged original key, promotion and liberation paths. */
static void fixtureCageKey(int scene) {
    fixtureSafeWorld();
    player.info.defense = 0;
    pmap[41][14].layers[DUNGEON] = MONSTER_CAGE_CLOSED;
    pmap[41][14].machineNumber = 7;
    pmap[41][14].flags |= IS_IN_ROOM_MACHINE;
    creature *subject = fixtureTarget(MK_JACKAL, 41, 14);
    subject->bookkeepingFlags |= MB_CAPTIVE;
    subject->ticksUntilTurn = 10000;
    item *key = give(KEY, KEY_CAGE, 'a', true);
    key->flags |= ITEM_IS_KEY;
    key->originDepth = rogue.depthLevel + (scene == CHECK_CAGE_WRONG_DEPTH ? 1 : 0);
    memset(key->keyLoc, 0, sizeof key->keyLoc);
    key->keyLoc[0] = (keyLocationProfile) {{20, 14},
        scene == CHECK_CAGE_WRONG_MACHINE ? 8 : 7, scene != CHECK_CAGE_REUSABLE};
}

/* Native runic preparation only. Combat and proc RNG are never called here. */
static void fixtureWeaponRunic(int kind, boolean plain, boolean inanimate) {
    fixtureSafeWorld();
    item *weapon = give(WEAPON, DAGGER, 'a', true);
    weapon->flags |= ITEM_EQUIPPED;
    if (!plain) weapon->flags |= ITEM_RUNIC;
    weapon->flags &= ~(ITEM_RUNIC_IDENTIFIED | ITEM_RUNIC_HINTED);
    weapon->enchant1 = 9;
    weapon->enchant2 = kind;
    weapon->strengthRequired = rogue.strength;
    weapon->vorpalEnemy = 4; /* Original ogre class; only slaying consults it. */
    rogue.weapon = weapon;
    creature *target = fixtureFrozenTarget(inanimate ? MK_ARROW_TURRET : MK_OGRE, 41, 14);
    target->info.maxHP = 1000;
    target->currentHP = 400;
    target->status[STATUS_STUCK] = target->maxStatus[STATUS_STUCK] = 50;
    pmapAt(target->loc)->layers[SURFACE] = SPIDERWEB;
    if (!plain && kind == W_FORCE) pmap[44][14].layers[DUNGEON] = WALL;
    updateEncumbrance();
}

/* Separate melee, gas, explosion and native caster initial conditions. */
static void fixtureArmorRunic(int kind, boolean plain, int condition) {
    fixtureSafeWorld();
    item *armor = give(ARMOR, LEATHER_ARMOR, 'a', true);
    armor->flags |= ITEM_EQUIPPED;
    if (!plain) armor->flags |= ITEM_RUNIC;
    armor->flags &= ~(ITEM_RUNIC_IDENTIFIED | ITEM_RUNIC_HINTED);
    armor->enchant1 = kind == A_MULTIPLICITY ? 3 : kind == A_REPRISAL ? 20
        : kind == A_ABSORPTION ? 1 : kind == A_REFLECTION && condition != 1 ? 50 : 0;
    armor->enchant2 = kind;
    armor->armor = 30;
    armor->strengthRequired = rogue.strength;
    armor->vorpalEnemy = condition == 1 ? 2 : 3; /* Animal vs Goblin class. */
    rogue.armor = armor;
    fixtureStatus(STATUS_DONNING, 0);
    if (kind == A_RESPIRATION) {
        for (int x = 39; x <= 41; x++) for (int y = 13; y <= 15; y++) {
            pmap[x][y].layers[GAS] = POISON_GAS;
            pmap[x][y].volume = 1000;
        }
    } else if (kind == A_DAMPENING) {
        /* A pre-existing GAS_EXPLOSION vanishes in updateEnvironment before
         * entry effects. A real kill must produce the native death DF instead. */
        creature *bloat = fixtureFrozenTarget(MK_EXPLOSIVE_BLOAT, 41, 14);
        bloat->currentHP = 1;
        fixtureStatus(STATUS_STUCK, 0);
        fixtureStatus(STATUS_IMMUNE_TO_FIRE, 100);
    } else if (kind == A_REFLECTION) {
        if (condition == 2) {
            fixtureStatus(STATUS_STUCK, 0);
            fixtureTarget(MK_SPIDER, 44, 14)->ticksUntilTurn = 1;
        } else fixtureTarget(MK_SPARK_TURRET, 44, 14)->ticksUntilTurn = 1;
    } else {
        pmapAt(player.loc)->layers[SURFACE] = SPIDERWEB;
        fixtureStatus(STATUS_STUCK, 50);
        const short attackerKind = kind == A_IMMUNITY ? MK_GOBLIN
            : condition == 1 && (kind == A_MULTIPLICITY || kind == A_REPRISAL) ? MK_SPECTRAL_BLADE : MK_KOBOLD;
        creature *attacker = fixtureTarget(attackerKind, 41, 14);
        attacker->ticksUntilTurn = 1;
        attacker->turnsUntilRegen = 100000;
        attacker->regenPerTurn = 0;
        if (kind == A_MUTUALITY) {
            creature *other = fixtureFrozenTarget(MK_KOBOLD, condition == 1 ? 43 : 39, 14);
            other->info.maxHP = other->currentHP = 100;
        }
        if (kind == A_IMMOLATION && condition == 1) fixtureStatus(STATUS_IMMUNE_TO_FIRE, 100);
    }
    updateEncumbrance();
}

/* Native attack abilities; preparation sets positions, gear and clocks only. */
static void fixtureMonsterAbility(int code) {
    const int kind = code / 2;
    const boolean negative = code % 2;
    const short actors[] = {MK_ACID_MOUND, MK_TOAD, MK_CENTIPEDE, MK_VAMPIRE_BAT,
                            MK_OGRE, MK_GOBLIN, MK_NAGA};
    fixtureSafeWorld();
    creature *attacker = fixtureTarget(actors[kind], 41, 14);
    attacker->ticksUntilTurn = kind == 0 ? 10000 : 1;
    attacker->turnsUntilRegen = 100000;
    attacker->regenPerTurn = 0;
    if (kind == 0) {
        item *weapon = give(WEAPON, DAGGER, 'a', true);
        weapon->enchant1 = 0;
        weapon->strengthRequired = rogue.strength;
        weapon->flags |= ITEM_EQUIPPED;
        if (negative) weapon->flags |= ITEM_PROTECTED;
        rogue.weapon = weapon;
        fixtureMonsterStatus(attacker, STATUS_STUCK, 50);
        pmapAt(attacker->loc)->layers[SURFACE] = SPIDERWEB;
    } else {
        fixtureStatus(STATUS_STUCK, 50);
        pmapAt(player.loc)->layers[SURFACE] = SPIDERWEB;
        if (kind <= 3) {
            item *armor = give(ARMOR, LEATHER_ARMOR, 'a', true);
            armor->flags |= ITEM_EQUIPPED;
            armor->enchant1 = 0;
            armor->armor = kind == 2 ? 30 : 0;
            armor->strengthRequired = rogue.strength;
            if (negative) {
                armor->flags |= ITEM_RUNIC;
                armor->flags &= ~(ITEM_RUNIC_IDENTIFIED | ITEM_RUNIC_HINTED);
                armor->enchant2 = A_IMMUNITY;
                armor->vorpalEnemy = 2; /* Original animal class includes Toad/Centipede/Bat. */
            }
            rogue.armor = armor;
            fixtureStatus(STATUS_DONNING, 0);
        }
        if (kind == 3) {
            attacker->currentHP = 1; /* Original maxHP18 and flitting/flying remain. */
            for (int x = 40; x <= 42; x++) for (int y = 13; y <= 15; y++) {
                if ((x != 41 || y != 14) && (x != 40 || y != 14)) pmap[x][y].layers[DUNGEON] = WALL;
            }
        } else if (kind == 4 && negative) pmap[39][14].layers[DUNGEON] = WALL;
        else if (kind == 5 || kind == 6) {
            creature *ally = fixtureFrozenTarget(MK_OGRE, kind == 5 ? 39 : 41,
                                                kind == 5 ? (negative ? 15 : 14) : (negative ? 16 : 15));
            ally->creatureState = MONSTER_ALLY;
            ally->leader = &player;
            ally->bookkeepingFlags |= MB_FOLLOWER;
            fixtureMonsterStatus(ally, STATUS_STUCK, 50);
            pmapAt(ally->loc)->layers[SURFACE] = SPIDERWEB;
        }
    }
    updateEncumbrance();
}

/* Unworn known rings and native actors/charge clocks; effects follow real equip. */
/* Native defensive traits, locomotion and terrain: initial state only. */
static void fixtureMonsterEnvironment(int code) {
    const int kind = code / 2;
    const boolean negative = code % 2;
    fixtureSafeWorld();
    creature *actor = NULL;
    if (kind <= 1) {
        actor = fixtureFrozenTarget(negative ? MK_OGRE : (kind == 0 ? MK_REVENANT : MK_WARDEN_OF_YENDOR), 41, 14);
        fixtureMonsterStatus(actor, STATUS_STUCK, 50);
        pmapAt(actor->loc)->layers[SURFACE] = SPIDERWEB;
        item *staff = give(STAFF, STAFF_LIGHTNING, 'a', true);
        staff->charges = staff->enchant1 = 2;
        staff->enchant2 = 1000;
        if (kind == 0) {
            item *weapon = give(WEAPON, SWORD, 'b', true);
            weapon->flags |= ITEM_EQUIPPED;
            weapon->enchant1 = 0;
            weapon->strengthRequired = rogue.strength;
            rogue.weapon = weapon;
        }
    } else if (kind == 2) {
        actor = fixtureTarget(MK_TROLL, 43, 14);
        actor->currentHP = 55;
        actor->ticksUntilTurn = 10000;
        if (negative) { fixtureMonsterStatus(actor, STATUS_POISONED, 3); actor->poisonAmount = 1; }
    } else if (kind == 3) {
        item *weapon = give(WEAPON, SWORD, 'a', true);
        weapon->flags |= ITEM_EQUIPPED;
        weapon->enchant1 = 0;
        weapon->strengthRequired = rogue.strength;
        rogue.weapon = weapon;
        actor = fixtureTarget(MK_WRAITH, 41, 14);
        actor->currentHP = negative ? actor->info.maxHP : 30;
        actor->creatureState = MONSTER_SLEEPING;
        actor->ticksUntilTurn = 1;
    } else if (kind == 4) {
        actor = fixtureFrozenTarget(negative ? MK_KOBOLD : MK_SPIDER, 43, 14);
        pmapAt(actor->loc)->layers[SURFACE] = SPIDERWEB;
    } else if (kind == 5) {
        for (int x = 39; x <= 44; x++) for (int y = 13; y <= 15; y += 2) pmap[x][y].layers[DUNGEON] = WALL;
        pmap[42][14].layers[LIQUID] = CHASM;
        actor = fixtureTarget(negative ? MK_KOBOLD : MK_FURY, 43, 14);
        actor->ticksUntilTurn = 1;
    } else if (kind == 6) {
        pmap[41][14].layers[LIQUID] = SHALLOW_WATER;
        if (!negative) pmap[40][14].layers[LIQUID] = SHALLOW_WATER;
        const pos blocked[] = {{40,13},{41,13},{42,13},{42,14},{42,15},{41,15},{40,15}};
        for (int i = 0; i < 7; i++) pmapAt(blocked[i])->layers[DUNGEON] = WALL;
        actor = fixtureTarget(MK_EEL, 41, 14);
        actor->ticksUntilTurn = 1;
        fixtureMonsterStatus(actor, STATUS_STUCK, 50);
        pmapAt(actor->loc)->layers[SURFACE] = SPIDERWEB;
    } else if (kind == 7) {
        actor = fixtureFrozenTarget(MK_NAGA, 43, 14);
        if (!negative) pmapAt(actor->loc)->layers[LIQUID] = SHALLOW_WATER;
    } else if (kind == 8) {
        fixtureStatus(STATUS_IMMUNE_TO_FIRE, 100);
        pmap[41][14].layers[DUNGEON] = negative ? WALL : WOODEN_BARRICADE;
        item *staff = give(STAFF, STAFF_FIRE, 'a', true);
        staff->charges = staff->enchant1 = 2;
        staff->enchant2 = 1000;
    } else if (kind == 9) {
        fixtureStatus(STATUS_BURNING, 7);
        if (negative) fixtureStatus(STATUS_LEVITATING, 100);
        pmap[41][14].layers[LIQUID] = SHALLOW_WATER;
    }
    updateEncumbrance();
}

/* Environmental exposure only; all application/promotion is real input. */
static void fixtureTerrainExposure(int code) {
    const int kind = code / 2;
    const boolean negative = code % 2;
    fixtureSafeWorld();
    item *armor = give(ARMOR, LEATHER_ARMOR, 'a', true);
    armor->flags |= ITEM_EQUIPPED;
    armor->flags &= ~(ITEM_RUNIC_IDENTIFIED | ITEM_RUNIC_HINTED);
    armor->enchant1 = 0;
    armor->enchant2 = A_RESPIRATION;
    armor->armor = 0;
    armor->strengthRequired = rogue.strength;
    if ((negative && (kind <= 3 || kind == 7)) || kind == 8) armor->flags |= ITEM_RUNIC;
    rogue.armor = armor;
    fixtureStatus(STATUS_DONNING, 0);
    if ((kind == 4 || kind == 8) && negative) fixtureStatus(STATUS_LEVITATING, 100);
    if (kind == 7) fixtureStatus(STATUS_IMMUNE_TO_FIRE, 100);
    if (kind == 5 || kind == 9) player.currentHP = 50;
    if (kind == 6) player.currentHP = 99;
    if (kind == 4 || kind == 8) pmapAt(player.loc)->layers[SURFACE] = LICHEN;
    else if (kind == 9) pmap[41][14].layers[SURFACE] = BLOODFLOWER_POD;
    else if (!(negative && (kind == 5 || kind == 6))) {
        const short gas = kind == 0 ? POISON_GAS : kind == 1 ? CONFUSION_GAS
            : kind == 2 ? PARALYSIS_GAS : (kind == 3 || kind == 7) ? STEAM : HEALING_CLOUD;
        for (int x = 39; x <= 41; x++) for (int y = 13; y <= 15; y++) {
            pmap[x][y].layers[GAS] = gas;
            pmap[x][y].volume = kind == 2 ? 8 : 1000;
        }
    }
    updateEncumbrance();
}

/* Only initial terrain/gear/status preparation; activation, falling and loss
 * must be reached by subsequent real player input and native RNG. */
static void fixtureTerrainHazard(int code) {
    fixtureSafeWorld();
    item *armor = give(ARMOR, LEATHER_ARMOR, 'a', true);
    armor->flags |= ITEM_EQUIPPED;
    armor->flags &= ~(ITEM_RUNIC_IDENTIFIED | ITEM_RUNIC_HINTED);
    armor->enchant1 = 0;
    armor->enchant2 = A_RESPIRATION;
    armor->armor = 0;
    armor->strengthRequired = rogue.strength;
    rogue.armor = armor;
    fixtureStatus(STATUS_DONNING, 0);
    if (code == 1 || code == 4 || code == 7 || code == 9) fixtureStatus(STATUS_LEVITATING, 100);
    if (code == 2) armor->flags |= ITEM_RUNIC;
    if (code == 5) fixtureStatus(STATUS_IMMUNE_TO_FIRE, 100);
    if (code <= 2) pmap[41][14].layers[DUNGEON] = GAS_TRAP_POISON_HIDDEN;
    else if (code <= 5) pmap[41][14].layers[DUNGEON] = FLAMETHROWER_HIDDEN;
    else if (code <= 7) pmap[41][14].layers[LIQUID] = CHASM;
    else {
        pmap[41][14].layers[LIQUID] = DEEP_WATER;
        give(FOOD, RATION, 'b', true)->quantity = 1;
    }
    updateEncumbrance();
}

/* Native spellcasters: initial positions/team/health/status only. Spell,
 * summon, movement, combat and all RNG remain subsequent original behavior. */
static void fixtureMonsterSpell(int code) {
    const int kind = code / 2;
    const boolean negative = code % 2;
    const short casters[] = {MK_DRAGON, MK_DAR_PRIESTESS, MK_OGRE_SHAMAN, MK_PIXIE, MK_LICH};
    fixtureSafeWorld();
    player.info.maxHP = player.currentHP = 1000;
    item *armor = give(ARMOR, LEATHER_ARMOR, 'a', true);
    armor->flags |= ITEM_EQUIPPED;
    armor->enchant1 = armor->armor = 0;
    armor->strengthRequired = rogue.strength;
    rogue.armor = armor;
    fixtureStatus(STATUS_DONNING, 0);
    if (negative && (kind == 0 || kind == 4)) fixtureStatus(STATUS_IMMUNE_TO_FIRE, 1000);
    if (negative && kind == 3) fixtureStatus(STATUS_SLOWED, 1000);
    creature *caster = fixtureTarget(casters[kind], 44, 14);
    if (kind == 4) {
        /* Existing, disabled minions limit native summon competition (n=5)
         * without disabling the ability or changing its original RNG rule. */
        for (int x = 36; x <= 44; x += 2) {
            creature *minion = fixtureTarget(MK_FURY, x, 10);
            minion->leader = caster;
            minion->bookkeepingFlags |= MB_FOLLOWER;
            fixtureMonsterStatus(minion, STATUS_PARALYZED, 1000);
        }
    }
    if (kind == 1 || kind == 2) {
        creature *teammate = fixtureTarget(MK_OGRE, kind == 2 ? 43 : 44, kind == 2 ? 15 : 16);
        teammate->leader = caster;
        teammate->bookkeepingFlags |= MB_FOLLOWER;
        fixtureMonsterStatus(teammate, STATUS_STUCK, 1000);
        pmapAt(teammate->loc)->layers[SURFACE] = SPIDERWEB;
        if (kind == 1 && !negative) teammate->currentHP = 1;
        if (kind == 2 && negative) {
            fixtureMonsterStatus(teammate, STATUS_HASTED, 1000);
            teammate->movementSpeed = teammate->info.movementSpeed / 2;
            teammate->attackSpeed = teammate->info.attackSpeed / 2;
        }
    }
    updateEncumbrance();
}

static void fixtureRing(short kind, int condition) {
    fixtureSafeWorld();
    item *ring = give(RING, kind, 'a', true);
    ring->enchant1 = condition == 2 ? -2 : 2;
    /* Negative-ring scenes represent an already-uncursed item; curse locking is separate. */
    if (condition == 1) give(RING, kind, 'b', true)->enchant1 = 2;
    if (kind == RING_CLAIRVOYANCE) {
        for (int y = 10; y <= 18; y++) pmap[41][y].layers[DUNGEON] = WALL;
        pmap[42][14].layers[DUNGEON] = CARPET;
    } else if (kind == RING_LIGHT) {
        rogue.minersLightRadius = FP_FACTOR;
        fixtureFrozenTarget(MK_KOBOLD, 42, 14);
    } else if (kind == RING_STEALTH) {
        fixtureTarget(MK_ARROW_TURRET, 44, 14)->ticksUntilTurn = 101;
    } else if (kind == RING_AWARENESS) {
        pmapAt(player.loc)->flags |= SEARCHED_FROM_HERE;
        pmap[42][14].layers[DUNGEON] = GAS_TRAP_POISON_HIDDEN;
    }
    if (kind == RING_TRANSFERENCE || kind == RING_REAPING) {
        player.currentHP = 50;
        item *weapon = give(WEAPON, BROADSWORD, 'b', true);
        weapon->flags |= ITEM_EQUIPPED;
        weapon->enchant1 = 0;
        weapon->strengthRequired = rogue.strength;
        rogue.weapon = weapon;
        creature *target = fixtureFrozenTarget(condition == 3 ? MK_ARROW_TURRET : MK_OGRE, 41, 14);
        target->info.maxHP = 1000;
        target->currentHP = 600;
        target->status[STATUS_STUCK] = target->maxStatus[STATUS_STUCK] = 50;
        pmapAt(target->loc)->layers[SURFACE] = SPIDERWEB;
    }
    if (kind == RING_WISDOM || kind == RING_REAPING) {
        item *staff = give(STAFF, STAFF_LIGHTNING, 'c', true);
        staff->enchant1 = 2;
        staff->charges = 0;
        staff->enchant2 = kind == RING_WISDOM && condition == 0 ? 31 : 1000;
        item *charm = give(CHARM, CHARM_HEALTH, 'd', true);
        charm->enchant1 = 1;
        charm->charges = 100;
    }
    updateEncumbrance();
    /* Establish derived, unequipped maxHP/light baseline; no ring is equipped here. */
    updateRingBonuses();
    if (kind == RING_REGENERATION) {
        player.currentHP = 50;
        player.turnsUntilRegen = 1000;
    }
}

static void fixtureContracts(int scene) {
    fixtureSafeWorld();
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
        /* One attack strictly inside the player turn, avoiding the t=0/t=100 double boundary. */
        fixtureTarget(MK_KOBOLD, 41, 14)->ticksUntilTurn = 1;
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

static void fixtureEquippedDagger(void) {
    item *weapon = give(WEAPON, DAGGER, 'a', true);
    weapon->flags |= ITEM_EQUIPPED;
    rogue.weapon = weapon;
}

static void fixtureAdvanced(int scene) {
    fixtureSafeWorld();
    if (scene == CHECK_KEY_COORDINATE) {
        pmap[41][14].layers[DUNGEON] = LOCKED_DOOR;
        pmap[41][14].machineNumber = 7;
        pmap[41][14].flags |= IS_IN_ROOM_MACHINE;
        item *key = give(KEY, KEY_DOOR, 'a', true);
        key->flags |= ITEM_IS_KEY;
        key->originDepth = rogue.depthLevel;
        memset(key->keyLoc, 0, sizeof key->keyLoc);
        key->keyLoc[0] = (keyLocationProfile) {{41, 14}, 8, true};
    } else if (scene == CHECK_FEAT_GOLD) {
        fixtureFloorItem(GOLD, 0, 41, 14)->quantity = 1;
    } else if (scene == CHECK_FEAT_SPECIALIST_READY || scene == CHECK_FEAT_SPECIALIST_BELOW) {
        give(SCROLL, SCROLL_ENCHANTING, 'a', true)->quantity = 2;
        /* Keep the same +16/+15 outcome boundary for each variant's real power. */
        give(WEAPON, DAGGER, 'b', true)->enchant1 =
            (scene == CHECK_FEAT_SPECIALIST_READY ? 16 : 15) - scrollTable[SCROLL_ENCHANTING].power;
    } else if (scene == CHECK_JELLY_OPEN || scene == CHECK_JELLY_BLOCKED) {
        fixtureEquippedDagger();
        creature *target = fixtureFrozenTarget(MK_PINK_JELLY, 41, 14);
        target->status[STATUS_STUCK] = target->maxStatus[STATUS_STUCK] = 50;
        pmap[41][14].layers[SURFACE] = SPIDERWEB;
        if (scene == CHECK_JELLY_BLOCKED) {
            const pos blocked[] = {{39,14},{40,13},{40,15},{42,14},{41,13},{41,15}};
            for (int i = 0; i < 6; i++) pmapAt(blocked[i])->layers[DUNGEON] = WALL;
        }
    } else if (scene == CHECK_SPIDER_MELEE || scene == CHECK_SPIDER_DELAYED) {
        pmapAt(player.loc)->layers[SURFACE] = SPIDERWEB;
        fixtureStatus(STATUS_STUCK, 50);
        fixtureTarget(MK_SPIDER, 41, 14)->ticksUntilTurn = scene == CHECK_SPIDER_MELEE ? 1 : 201;
    } else if (scene == CHECK_ACID_ARMOR || scene == CHECK_ACID_PROTECTED) {
        item *armor = give(ARMOR, LEATHER_ARMOR, 'a', true);
        armor->flags |= ITEM_EQUIPPED;
        if (scene == CHECK_ACID_PROTECTED) armor->flags |= ITEM_PROTECTED;
        rogue.armor = armor;
        pmapAt(player.loc)->layers[SURFACE] = SPIDERWEB;
        fixtureStatus(STATUS_STUCK, 50);
        fixtureTarget(MK_ACID_MOUND, 41, 14)->ticksUntilTurn = 1;
    } else if (scene == CHECK_MONKEY_ITEM || scene == CHECK_MONKEY_EMPTY) {
        fixtureEquippedDagger();
        if (scene == CHECK_MONKEY_ITEM) give(WEAPON, DART, 'b', true)->quantity = 5;
        pmapAt(player.loc)->layers[SURFACE] = SPIDERWEB;
        fixtureStatus(STATUS_STUCK, 50);
        fixtureTarget(MK_MONKEY, 41, 14)->ticksUntilTurn = 1;
    } else if (scene == CHECK_BOG_SEIZE || scene == CHECK_BOG_LEVITATING) {
        pmap[40][14].layers[LIQUID] = pmap[41][14].layers[LIQUID] = DEEP_WATER;
        const pos blocked[] = {{40,13},{41,13},{42,13},{42,14},{42,15},{41,15},{40,15}};
        for (int i = 0; i < 7; i++) pmapAt(blocked[i])->layers[DUNGEON] = WALL;
        if (scene == CHECK_BOG_LEVITATING) fixtureStatus(STATUS_LEVITATING, 100);
        fixtureTarget(MK_BOG_MONSTER, 41, 14)->ticksUntilTurn = 1;
    } else if (scene == CHECK_CONJURER || scene == CHECK_CONJURER_PARALYZED) {
        creature *target = fixtureTarget(MK_GOBLIN_CONJURER, 44, 14);
        target->ticksUntilTurn = 1;
        if (scene == CHECK_CONJURER_PARALYZED) target->status[STATUS_PARALYZED] = target->maxStatus[STATUS_PARALYZED] = 50;
    }
    updateEncumbrance();
}

/* Preflight leaves every state/RNG field untouched on rejection. The world,
 * items, monsters and level metadata are the original generated ones. */
static boolean fixtureNativeStart(pos *destination) {
    if (!levels || rogue.depthLevel != 1 || levels[1].visited
        || !isPosInMap(rogue.downLoc) || !isPosInMap(rogue.upLoc)
        || pmapAt(rogue.downLoc)->layers[DUNGEON] != DOWN_STAIRS
        || pmapAt(rogue.upLoc)->layers[DUNGEON] != DUNGEON_EXIT
        || !(pmapAt(rogue.downLoc)->flags & HAS_STAIRS)
        || !posEq(levels[0].downStairsLoc, rogue.downLoc)
        || !posEq(levels[0].upStairsLoc, rogue.upLoc)) return false;
    for (int dir = 0; dir < 4; dir++) {
        pos loc = {rogue.downLoc.x + nbDirs[dir][0], rogue.downLoc.y + nbDirs[dir][1]};
        if (isPosInMap(loc)
            && !(terrainFlags(loc) & T_PATHING_BLOCKER)
            && !(pmapAt(loc)->flags & (HAS_MONSTER | HAS_ITEM | HAS_STAIRS | IS_IN_MACHINE))) {
            *destination = loc;
            return true;
        }
    }
    return false;
}

/* Read-only two-stage selection. No terrain/waypoint/scent generation and
 * no state, occupancy, selected pointer or RNG change before success. */
static boolean fixtureAIEligible(creature *subject) {
    if (subject->mutationIndex >= 0 || subject->leader || subject->creatureMode != MODE_NORMAL
        || subject->movementSpeed != 100
        || (subject->bookkeepingFlags & (MB_LEADER | MB_FOLLOWER | MB_CAPTIVE | MB_IS_DYING))) return false;
    for (int i=0;i<NUMBER_OF_STATUS_EFFECTS;i++) if (i != STATUS_NUTRITION && subject->status[i]) return false;
    return true;
}
static boolean fixtureAISafeCellBase(pos cell, creature *subject) {
    if (!isPosInMap(cell) || posEq(cell, player.loc)
        || (pmapAt(cell)->layers[DUNGEON] != FLOOR && pmapAt(cell)->layers[DUNGEON] != CARPET)
        || (terrainFlags(cell) & ~((unsigned long) T_IS_FLAMMABLE))
        || pmapAt(cell)->machineNumber || (pmapAt(cell)->flags & (HAS_ITEM | HAS_STAIRS | IS_IN_MACHINE))) return false;
    for (int layer = 1; layer < NUMBER_TERRAIN_LAYERS; layer++) {
        int tile = pmapAt(cell)->layers[layer];
        if (layer == SURFACE) { if (tile && tile != GRASS && tile != DEAD_GRASS) return false; }
        else if (tile) return false;
    }
    return !(pmapAt(cell)->flags & HAS_MONSTER) || posEq(cell,subject->loc);
}
static int fixtureAIClearance(pos cell, creature *subject) {
    int clearance = DCOLS+DROWS;
    for (creatureIterator it = iterateCreatures(monsters); hasNextCreature(it);) {
        creature *m = nextCreature(&it);
        if (m != subject) clearance = min(clearance,distanceBetween(cell,m->loc));
    }
    return clearance;
}
static boolean fixtureAISafeCell(pos cell, creature *subject) {
    return fixtureAISafeCellBase(cell,subject) && fixtureAIClearance(cell,subject) > 12;
}
/* Player placement has its own conservative clearance; neither threshold
 * is an original AI rule. Runtime observations reject any interference. */
static boolean fixtureAIPlayerCell(pos cell, creature *subject) {
    return fixtureAISafeCellBase(cell,subject) && fixtureAIClearance(cell,subject) > 8;
}
static boolean fixtureAIOthersHidden(char fov[DCOLS][DROWS], creature *subject) {
    for (creatureIterator it = iterateCreatures(monsters); hasNextCreature(it);) {
        creature *m=nextCreature(&it);
        if (m != subject && fov[m->loc.x][m->loc.y]) return false;
    }
    return true;
}
static boolean fixtureAIHiddenNeighbours(pos cell, char fov[DCOLS][DROWS]) {
    for (int dir=0;dir<DIRECTION_COUNT;dir++) {
        pos next={cell.x+nbDirs[dir][0],cell.y+nbDirs[dir][1]};
        if (isPosInMap(next) && !(terrainFlags(next)&T_OBSTRUCTS_PASSABILITY)
            && !diagonalBlocked(cell.x,cell.y,next.x,next.y,false) && fov[next.x][next.y]) return false;
    }
    return true;
}
static boolean fixtureAIGradient(pos cell, creature *subject) {
    for (int i = 0; i < rogue.wpCount; i++) {
        if (!rogue.wpDistance[i]) return false;
        short distance = rogue.wpDistance[i][cell.x][cell.y];
        if (distance < 1 || distance >= DCOLS/2) continue;
        for (int dir = 0; dir < DIRECTION_COUNT; dir++) {
            pos next = {cell.x+nbDirs[dir][0],cell.y+nbDirs[dir][1]};
            if (fixtureAISafeCell(next,subject) && !diagonalBlocked(cell.x,cell.y,next.x,next.y,false)
                && rogue.wpDistance[i][next.x][next.y] >= 0 && rogue.wpDistance[i][next.x][next.y] < distance) return true;
        }
    }
    return false;
}
static boolean fixtureNativeAIStart(int kind, creature **selected, pos *destination, pos *playerDestination) {
    if (rogue.wpCount <= 0 || rogue.wpCount > MAX_WAYPOINT_COUNT) return false;
    const short preferred[] = {MK_KOBOLD,MK_RAT};
    for (int preference = 0; preference < 2; preference++) for (creatureIterator it = iterateCreatures(monsters); hasNextCreature(it);) {
        creature *subject = nextCreature(&it);
        if (subject->info.monsterID != preferred[preference] || !fixtureAIEligible(subject)) continue;
        for (int y = 1; y < DROWS-1; y++) for (int x = 1; x < DCOLS-1; x++) {
            pos cell = {x,y}; if (!fixtureAISafeCell(cell,subject) || !fixtureAIGradient(cell,subject)) continue;
            if (kind == 2) {
                for (int dir = 0; dir < 4; dir++) {
                    pos mid = {x+nbDirs[dir][0],y+nbDirs[dir][1]}, target = {x+2*nbDirs[dir][0],y+2*nbDirs[dir][1]};
                    if (!fixtureAISafeCell(mid,subject) || !fixtureAIPlayerCell(target,subject)) continue;
                    char fov[DCOLS][DROWS] = {{0}};
                    getFOVMask(fov,target.x,target.y,(DCOLS+DROWS)*FP_FACTOR,T_OBSTRUCTS_VISION,0,false);
                    if (!fov[x][y] || !fixtureAIOthersHidden(fov,subject)) continue;
                    *selected=subject;*destination=cell;*playerDestination=target;return true;
                }
            } else {
                char fov[DCOLS][DROWS] = {{0}};
                getFOVMask(fov,x,y,(DCOLS+DROWS)*FP_FACTOR,T_OBSTRUCTS_VISION,0,false);
                for (int py = 1; py < DROWS-1; py++) for (int px = 1; px < DCOLS-1; px++) {
                    pos target={px,py};if (distanceBetween(cell,target)<=4 || fov[px][py] || !fixtureAIPlayerCell(target,subject)) continue;
                    char reverseFov[DCOLS][DROWS] = {{0}};
                    getFOVMask(reverseFov,px,py,(DCOLS+DROWS)*FP_FACTOR,T_OBSTRUCTS_VISION,0,false);
                    if (reverseFov[x][y] || !fixtureAIOthersHidden(reverseFov,subject)
                        || (kind == 0 && !fixtureAIHiddenNeighbours(cell,reverseFov))) continue;
                    *selected=subject;*destination=cell;*playerDestination=target;return true;
                }
            }
        }
    }
    return false;
}

/* Pure bounded path search. Local FOV caches do not touch world state.
 * Safe steps may turn at native corners; no AI or scent helper is called. */
typedef struct {
    creature *subject;
    pos cell;
    char safe[DCOLS][DROWS];
    short visibility[DCOLS][DROWS]; /* -1 unknown; bit1 other-hidden, bit2 subject-neighbours-hidden, bit4 initial-subject-visible */
    int *stats;
} fixtureScentSearch;
static int fixtureScentVisibility(fixtureScentSearch *search, pos cell) {
    if (search->visibility[cell.x][cell.y]>=0) return search->visibility[cell.x][cell.y];
    char fov[DCOLS][DROWS]={{0}};
    getFOVMask(fov,cell.x,cell.y,(DCOLS+DROWS)*FP_FACTOR,T_OBSTRUCTS_VISION,0,false);
    int value=fixtureAIOthersHidden(fov,search->subject)?1:0;
    if (fov[search->cell.x][search->cell.y]) value|=4;
    if (!fov[search->cell.x][search->cell.y] && fixtureAIHiddenNeighbours(search->cell,fov)) value|=2;
    search->visibility[cell.x][cell.y]=value;return value;
}
static boolean fixtureScentRoute(fixtureScentSearch *search, pos route[9], int count, int goal) {
    if (count==goal) {
        if (search->stats) search->stats[3]++;
        /* Geometry heuristic only: form a real visible trail first and turn
         * early enough to leave later hidden pursuit inputs. Runtime effect
         * oracles still require actual subject motion, not this estimate. */
        int firstHidden=count;
        for (int i=1;i<count;i++) if (!(fixtureScentVisibility(search,route[i])&4)) { firstHidden=i;break; }
        if (firstHidden<=count-3 && (fixtureScentVisibility(search,route[count-1])&2)) { if (search->stats) search->stats[4]++;return true; }
        return false;
    }
    for (int dir=0;dir<4;dir++) {
        pos last=route[count-1],next={last.x+nbDirs[dir][0],last.y+nbDirs[dir][1]};
        if (!isPosInMap(next) || !search->safe[next.x][next.y] || distanceBetween(next,search->cell)<=2) continue;
        boolean repeated=false;for (int i=0;i<count;i++) if (posEq(next,route[i])) { repeated=true;break; }
        if (repeated || !(fixtureScentVisibility(search,next)&1)
            || (count==1 && !(fixtureScentVisibility(search,next)&4))) continue;
        route[count]=next;if (fixtureScentRoute(search,route,count+1,goal)) return true;
    }
    return false;
}
/* Both conditions choose identical subject/start/path/end on the unchanged
 * native world. Only outputs are assigned on success; rejection is pure. */
static boolean fixtureNativeScentStart(creature **selected, pos *destination, pos route[9], int *routeCount, int *stats) {
    const short preferred[]={MK_KOBOLD,MK_RAT};
    for (int preference=0;preference<2;preference++) for (creatureIterator it=iterateCreatures(monsters);hasNextCreature(it);) {
        creature *subject=nextCreature(&it);
        if (subject->info.monsterID!=preferred[preference] || !fixtureAIEligible(subject)) continue;
        fixtureScentSearch search={0};search.subject=subject;search.stats=stats;
        for (int y=0;y<DROWS;y++) for (int x=0;x<DCOLS;x++) {
            pos cell={x,y};search.safe[x][y]=fixtureAIPlayerCell(cell,subject);search.visibility[x][y]=-1;
        }
        for (int y=1;y<DROWS-1;y++) for (int x=1;x<DCOLS-1;x++) {
            pos cell={x,y};if (!fixtureAISafeCell(cell,subject)) continue;
            if (stats) stats[0]++;
            boolean clean=true;
            for (int dir=0;dir<DIRECTION_COUNT;dir++) {
                pos next={x+nbDirs[dir][0],y+nbDirs[dir][1]};
                if (!isPosInMap(next) || scentMap[next.x][next.y]) { clean=false;break; }
                if (!(terrainFlags(next)&T_OBSTRUCTS_PASSABILITY) && !diagonalBlocked(x,y,next.x,next.y,false)
                    && !fixtureAISafeCell(next,subject)) { clean=false;break; }
            }
            if (!clean || scentMap[x][y]) continue;
            if (stats) stats[1]++;
            search.cell=cell;
            /* Subject-dependent geometric cache is local to this candidate. */
            for (int py=0;py<DROWS;py++) for (int px=0;px<DCOLS;px++) search.visibility[px][py]=-1;
            for (int gap=5;gap>=3;gap--) for (int dir=0;dir<4;dir++) {
                pos start={x+gap*nbDirs[dir][0],y+gap*nbDirs[dir][1]};
                if (!isPosInMap(start) || !search.safe[start.x][start.y]) continue;
                clean=true;
                for (int n=1;n<gap;n++) { pos mid={x+n*nbDirs[dir][0],y+n*nbDirs[dir][1]};if (!fixtureAISafeCell(mid,subject)) { clean=false;break; } }
                if (!clean) continue;
                char initialFov[DCOLS][DROWS]={{0}};
                getFOVMask(initialFov,start.x,start.y,(DCOLS+DROWS)*FP_FACTOR,T_OBSTRUCTS_VISION,0,false);
                if (!initialFov[x][y] || !fixtureAIOthersHidden(initialFov,subject)) continue;
                if (stats) stats[2]++;
                for (int goal=9;goal>=4;goal--) {
                    pos trial[9];trial[0]=start;
                    if (!fixtureScentRoute(&search,trial,1,goal)) continue;
                    *selected=subject;*destination=cell;*routeCount=goal;
                    memcpy(route,trial,goal*sizeof(pos));return true;
                }
            }
        }
    }
    return false;
}

/* CHECK-only diagnosis of preparation reachability, without changing the
 * rejected world/RNG or exposing anything to the playable game. */
static void featureNativeAIProbe(void) {
    if (preparedScene || !rogue.gameInProgress || rogue.playerTurnNumber != 0) { featureAppend("null"); return; }
    featureAppend("{\"eligible\":["); int count=0;
    for (creatureIterator it = iterateCreatures(monsters); hasNextCreature(it);) {
        creature *subject=nextCreature(&it);
        if ((subject->info.monsterID != MK_KOBOLD && subject->info.monsterID != MK_RAT) || !fixtureAIEligible(subject)) continue;
        int base=0,maxClearance=0,over8=0,over10=0,over12=0,gradients=0;
        for (int y=1;y<DROWS-1;y++) for (int x=1;x<DCOLS-1;x++) {
            pos cell={x,y};if (!fixtureAISafeCellBase(cell,subject)) continue;
            int clearance=fixtureAIClearance(cell,subject);base++;maxClearance=max(maxClearance,clearance);
            over8+=clearance>8;over10+=clearance>10;over12+=clearance>12;
            if (clearance>12 && fixtureAIGradient(cell,subject)) gradients++;
        }
        featureAppend("%s{\"kind\":%d,\"index\":%d,\"baseCells\":%d,\"maxClearance\":%d,\"over8\":%d,\"over10\":%d,\"over12\":%d,\"gradients\":%d}",count++ ? "," : "",subject->info.monsterID,featureLeaderIndex(subject),base,maxClearance,over8,over10,over12,gradients);
    }
    featureAppend("],\"sceneAvailable\":[");
    for (int kind=0;kind<3;kind++) { creature *subject;pos cell,playerCell;featureAppend("%s%d",kind ? "," : "",fixtureNativeAIStart(kind,&subject,&cell,&playerCell)); }
    creature *subject;pos cell,route[9];int routeCount=0,stats[5]={0};
    boolean available=fixtureNativeScentStart(&subject,&cell,route,&routeCount,stats);
    featureAppend("],\"scentPlan\":{\"available\":%d,\"safeCells\":%d,\"cleanCells\":%d,\"starts\":%d,\"safeRoutes\":%d,\"hiddenEnds\":%d}}",available,stats[0],stats[1],stats[2],stats[3],stats[4]);
}

int brogue_check_fixture(int scene) {
    if (preparedScene || !gameConst || brogue_check_wait_kind() != BROWSER_COMMAND
        || (rogue.seed != 42 && scene / 1000 * 1000 != CHECK_NATIVE_SCENT)
        || rogue.playerTurnNumber != 0 || rogue.playbackMode || rogue.cursorMode
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
        else if (group == CHECK_WEAPON_RUNIC || group == CHECK_WEAPON_PLAIN || group == CHECK_WEAPON_INANIMATE) {
            if (kind < 0 || kind >= NUMBER_WEAPON_RUNIC_KINDS
                || (group == CHECK_WEAPON_PLAIN && kind != 0)
                || (group == CHECK_WEAPON_INANIMATE && kind == W_SLAYING)) return -1;
            category = WEAPON;
        }
        else if (group == CHECK_ARMOR_RUNIC || group == CHECK_ARMOR_PLAIN || group == CHECK_ARMOR_CONDITION) {
            if (group == CHECK_ARMOR_CONDITION) { condition = kind / 100; kind %= 100; }
            if (kind < 0 || kind >= NUMBER_ARMOR_ENCHANT_KINDS
                || (group == CHECK_ARMOR_CONDITION && !(condition == 1
                    && (kind == A_MULTIPLICITY || kind == A_MUTUALITY || kind == A_REPRISAL || kind == A_IMMUNITY
                        || kind == A_REFLECTION || kind == A_IMMOLATION))
                    && !(condition == 2 && kind == A_REFLECTION))) return -1;
            category = ARMOR;
        }
        else if (group == CHECK_RING_READY) {
            condition = kind / 100;
            kind %= 100;
            if (kind < 0 || kind >= NUMBER_RING_KINDS || condition > 3
                || (condition == 1 && kind != RING_AWARENESS && kind != RING_WISDOM)
                || (condition == 2 && kind != RING_AWARENESS && kind != RING_WISDOM)
                || (condition == 3 && kind != RING_TRANSFERENCE && kind != RING_REAPING)) return -1;
            category = RING;
        }
        else if (group == CHECK_MONSTER_ABILITIES) {
            if (kind < 0 || kind >= 14) return -1;
        }
        else if (group == CHECK_MONSTER_ENVIRONMENT) {
            if (kind < 0 || kind >= 20) return -1;
        }
        else if (group == CHECK_TERRAIN_EXPOSURE) {
            if (kind < 0 || kind >= 20) return -1;
        }
        else if (group == CHECK_TERRAIN_HAZARDS) {
            if (kind < 0 || kind >= 10) return -1;
        }
        else if (group == CHECK_MONSTER_SPELLS) {
            if (kind < 0 || kind >= 10) return -1;
        }
        else if (group == CHECK_NATIVE_AI) {
            if (kind < 0 || kind >= 3) return -1;
        }
        else if (group == CHECK_NATIVE_SCENT) {
            if (kind < 0 || kind >= 2) return -1;
        }
        else return -1;
        const int enumCount = category == POTION ? POTION_LICHEN + 1 : category == CHARM ? CHARM_NEGATION + 1
            : category == SCROLL ? SCROLL_SUMMON_MONSTER + 1 : category == RING ? NUMBER_RING_KINDS : category == STAFF ? STAFF_PROTECTION + 1 : WAND_EMPOWERMENT + 1;
        if (category && category != WEAPON && category != ARMOR && (kind < 0 || kind >= enumCount || kind >= itemKindCount(category, 0))) return -1;
    } else if (scene < 1 || scene > CHECK_CAGE_WRONG_MACHINE) return -1;
    if (group == CHECK_NATIVE_AI || group == CHECK_NATIVE_SCENT) {
        creature *subject; pos destination, playerDestination, route[9];int routeCount=0;
        if (group == CHECK_NATIVE_SCENT) {
            if (!fixtureNativeScentStart(&subject,&destination,route,&routeCount,NULL)) return -1;
            playerDestination=route[kind ? routeCount-1 : 0];
        } else if (!fixtureNativeAIStart(kind,&subject,&destination,&playerDestination)) return -1;
        pmapAt(player.loc)->flags &= ~HAS_PLAYER;
        pmapAt(subject->loc)->flags &= ~HAS_MONSTER;
        player.loc = playerDestination; subject->loc = destination;
        pmapAt(player.loc)->flags |= HAS_PLAYER; pmapAt(subject->loc)->flags |= HAS_MONSTER;
        subject->creatureState = group == CHECK_NATIVE_SCENT ? MONSTER_TRACKING_SCENT : kind == 0 ? MONSTER_WANDERING : MONSTER_SLEEPING;
        if (group == CHECK_NATIVE_AI && kind == 0) subject->targetWaypointIndex = -1;
        if (group == CHECK_NATIVE_SCENT) { nativeAIRouteCount=routeCount;memcpy(nativeAIRoute,route,routeCount*sizeof(pos)); }
        nativeAISubject = subject;
    } else if (scene == CHECK_NATIVE_LEVELS) {
        pos destination;
        if (!fixtureNativeStart(&destination)) return -1;
        pmapAt(player.loc)->flags &= ~HAS_PLAYER;
        player.loc = destination;
        pmapAt(player.loc)->flags |= HAS_PLAYER;
    } else fixtureRoom();
    preparedScene = scene;
    if (category == POTION || category == CHARM) fixtureConsumable(category, kind, group == CHECK_POTION_KNOWN || category == CHARM, group == CHECK_CHARM_COOLDOWN);
    else if (category == SCROLL) fixtureScroll(kind, group == CHECK_SCROLL_KNOWN);
    else if (category == STAFF || category == WAND) fixtureBolt(category, kind, condition);
    else if (category == WEAPON) fixtureWeaponRunic(kind, group == CHECK_WEAPON_PLAIN, group == CHECK_WEAPON_INANIMATE);
    else if (category == ARMOR) fixtureArmorRunic(kind, group == CHECK_ARMOR_PLAIN, condition);
    else if (category == RING) fixtureRing(kind, condition);
    else if (group == CHECK_MONSTER_ABILITIES) fixtureMonsterAbility(kind);
    else if (group == CHECK_MONSTER_ENVIRONMENT) fixtureMonsterEnvironment(kind);
    else if (group == CHECK_TERRAIN_EXPOSURE) fixtureTerrainExposure(kind);
    else if (group == CHECK_TERRAIN_HAZARDS) fixtureTerrainHazard(kind);
    else if (group == CHECK_MONSTER_SPELLS) fixtureMonsterSpell(kind);
    else if (scene >= CHECK_FLIGHT_OPEN && scene <= CHECK_FLIGHT_FEAR_PERMANENT) fixtureMonsterFlight(scene);
    else if (scene >= CHECK_REFLECT_GUARDIAN && scene <= CHECK_REFLECT_GOLEM) fixtureMonsterReflection(scene);
    else if (scene >= CHECK_KAMIKAZE_BLOAT && scene <= CHECK_KAMIKAZE_RAT) fixtureMonsterKamikaze(scene);
    else if (scene >= CHECK_BURN_UNPROTECTED && scene <= CHECK_BURN_EXPIRY) fixtureMonsterBurn(scene);
    else if (scene >= CHECK_WHIP_RANGE4 && scene <= CHECK_WHIP_OGRE) fixtureMonsterWhip(scene);
    else if (scene >= CHECK_ENTER_SUMMONS && scene <= CHECK_ENTER_PHOENIX) fixtureMonsterEnter(scene);
    else if (scene == CHECK_NEGATE_PHANTOM || scene == CHECK_NEGATE_PHYLACTERY) fixtureMonsterNegation(scene);
    else if (scene >= CHECK_CORRIDOR_GROUP && scene <= CHECK_CORRIDOR_WIDE) fixtureMonsterCorridor(scene);
    else if (scene >= CHECK_DISTANCE_CLOSE && scene <= CHECK_DISTANCE_KOBOLD) fixtureMonsterDistance(scene);
    else if (scene >= CHECK_FRUIT_STACK && scene <= CHECK_FRUIT_OVERFLOW) fixtureFruit(scene);
    else if (scene >= CHECK_AGGRAVATE_MYSTIC && scene <= CHECK_AGGRAVATE_OGRE) fixtureMonsterAggravate(scene);
    else if (scene >= CHECK_CAGE_DISPOSABLE && scene <= CHECK_CAGE_WRONG_MACHINE) fixtureCageKey(scene);
    else if (scene <= 8) fixtureInventory();
    else if (scene >= CHECK_SLAYING_MATCH && scene <= CHECK_VISIBILITY_MEMORY) fixtureContracts(scene);
    else if (scene >= CHECK_KEY_COORDINATE && scene < CHECK_NATIVE_LEVELS) fixtureAdvanced(scene);
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
    /* Native-AI preparation does not change inventory; retain even the
     * original generated floor-item identification flags exactly. */
    if (group != CHECK_NATIVE_AI && group != CHECK_NATIVE_SCENT) updateIdentifiableItems();
    updateMapToShore();
    updateVision(false);
    displayLevel();
    refreshSideBar(-1, -1, false);
    if (scene == CHECK_ORIGINAL_SYMBOL_COLORS) {
        /* UI palette probe only: public C glyph/RGB -> production Rust canvas.
         * These literal colors are not a terrain/healing/visibility fixture. */
        const color background = {10, 20, 30, 0, 0, 0, 0, false};
        const color foreground[] = {{25, 100, 25, 0, 0, 0, 0, false},
            {30, 5, 40, 0, 0, 0, 0, false}, {2, 5, 2, 0, 0, 0, 0, false}};
        const enum displayGlyph glyph[] = {G_FOLIAGE, G_BLOODWORT_STALK, G_FOLIAGE};
        for (short y = 13; y <= 15; y++) for (short x = 58; x <= 64; x++)
            plotCharWithColor(' ', (windowpos){x, y}, &background, &background);
        for (short i = 0; i < 3; i++)
            plotCharWithColor(glyph[i], (windowpos){59 + 2 * i, 14}, &foreground[i], &background);
    }
#if defined(BROGUE_BROWSER)
    *initialCommandDisplay = saveDisplayBuffer();
#endif
    brogue_check_publish();
    return scene;
}
#endif
