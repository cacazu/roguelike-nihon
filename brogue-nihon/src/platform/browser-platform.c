/* Browser I/O adapter for Brogue CE. Game rules and saved-game data remain in C.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
#include <stdint.h>
#include <string.h>
#include "platform.h"
#include "GlobalsBase.h"
#include "BrowserIO.h"

/* Row-major ABI: glyph, Unicode, foreground RGB, background RGB, flags, reserved.
 * Colors retain Brogue's 0..100 scale. Bit 0 of flags identifies environment
 * glyphs; it is derived only from the already-public display glyph.
 */
#define BROWSER_CELL_FIELDS 10
static int32_t browserCells[ROWS * COLS * BROWSER_CELL_FIELDS];
static boolean dirty = true;
static boolean shiftHeld, controlHeld;
static BrowserWait inputWait;
#ifdef BROGUE_BROWSER_CHECK
static void checkEnterEvent(boolean textInput);
static void checkLeaveEvent(void);
#endif

extern void brogue_browser_frame(const int32_t *cells, int count);
extern void brogue_browser_event(int32_t *event, int textInput, int colorsDance,
                                 const int32_t *wait, int count);
extern int brogue_browser_pause(int milliseconds, int interruptForMouseMove,
                                const int32_t *wait, int count);
extern void brogue_browser_notify(int eventId, int data1, int data2,
                                  const char *str1, const char *str2);
extern int brogue_browser_screenshot(void);

BrowserWait browserWaitBegin(int kind, int maxLength, int cancel) {
    BrowserWait previous = inputWait;
    memset(&inputWait, 0, sizeof inputWait);
    inputWait.values[0] = kind;
    inputWait.values[1] = maxLength;
    inputWait.values[2] = cancel;
    return previous;
}

BrowserWait browserWaitButtons(void) {
    int kind = inputWait.values[0];
    return browserWaitBegin(kind == BROWSER_COMMAND || kind == BROWSER_PLAYBACK ? BROWSER_MENU : kind,
                            inputWait.values[1], true);
}

void browserWaitKey(int32_t key) {
    if (!key) return;
    int count = inputWait.values[3];
    for (int i = 0; i < count; i++) if (inputWait.values[4 + i] == key) return;
    if (count < BROWSER_WAIT_MAX_KEYS) {
        inputWait.values[4 + count] = key;
        inputWait.values[3]++;
    }
}

void browserWaitRestore(BrowserWait previous) { inputWait = previous; }

static void flushFrame(void) {
    if (!dirty) return;
    brogue_browser_frame(browserCells, ROWS * COLS * BROWSER_CELL_FIELDS);
    dirty = false;
}

static void browser_gameLoop(void) {
    rogueMain();
    flushFrame();
}

static boolean browser_pause(short milliseconds, PauseBehavior behavior) {
    flushFrame();
    return brogue_browser_pause(max(0, milliseconds), behavior.interuptForMouseMove,
                                inputWait.values, 4 + inputWait.values[3]) != 0;
}

static void browser_event(rogueEvent *event, boolean textInput, boolean colorsDance) {
    int32_t values[5];
    flushFrame();
    /* The host resolves this only after an actual input event. An empty queue
     * never becomes an Escape or other synthetic game command. */
#ifdef BROGUE_BROWSER_CHECK
    checkEnterEvent(textInput);
#endif
    brogue_browser_event(values, textInput, colorsDance,
                         inputWait.values, 4 + inputWait.values[3]);
#ifdef BROGUE_BROWSER_CHECK
    checkLeaveEvent();
#endif
    event->eventType = values[0];
    event->param1 = values[1];
    event->param2 = values[2];
    event->controlKey = controlHeld = values[3] != 0;
    event->shiftKey = shiftHeld = values[4] != 0;
}

static void browser_plot(enum displayGlyph glyph, short x, short y,
                         short fr, short fg, short fb, short br, short bg, short bb) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    int32_t *cell = &browserCells[(y * COLS + x) * BROWSER_CELL_FIELDS];
    const int32_t next[BROWSER_CELL_FIELDS] = {
        glyph,
        glyph >= LOCALIZED_GLYPH_BASE ? glyph - LOCALIZED_GLYPH_BASE : glyphToUnicode(glyph),
        fr, fg, fb, br, bg, bb,
        glyph < LOCALIZED_GLYPH_BASE && isEnvironmentGlyph(glyph), 0
    };
    if (memcmp(cell, next, sizeof next)) {
        memcpy(cell, next, sizeof next);
        dirty = true;
    }
}

static boolean browser_modifier(int modifier) {
    return modifier == 0 ? shiftHeld : controlHeld;
}

static void browser_notify(short eventId, int data1, int data2,
                           const char *str1, const char *str2) {
    flushFrame();
    brogue_browser_notify(eventId, data1, data2, str1, str2);
}

static boolean browser_screenshot(void) {
    flushFrame();
    return brogue_browser_screenshot() != 0;
}

struct brogueConsole browserConsole = {
    browser_gameLoop, browser_pause, browser_event, browser_plot,
    NULL, browser_modifier, browser_notify, browser_screenshot, NULL
};

#ifdef BROGUE_BROWSER_CHECK
/* Dedicated verification builds only; no state access in the playable build. */
static unsigned checkCommandWaits;
static boolean checkFirstCommandBoundary;
static void checkEnterEvent(boolean textInput) {
    checkFirstCommandBoundary = false;
    if (inputWait.values[0] == BROWSER_COMMAND) {
        checkCommandWaits++;
        checkFirstCommandBoundary = checkCommandWaits == 1 && !textInput
            && rogue.seed == 42 && rogue.playerTurnNumber == 0
            && rogue.gameInProgress && !rogue.playbackMode
            && !rogue.cursorMode && rogue.cursorLoc.x < 0 && rogue.cursorLoc.y < 0;
    }
}
static void checkLeaveEvent(void) { checkFirstCommandBoundary = false; }
int brogue_check_wait_kind(void) {
    return checkFirstCommandBoundary ? inputWait.values[0] : -1;
}
void brogue_check_publish(void) { commitDraws(); flushFrame(); }

const char *brogue_check_snapshot(void) {
    static char result[512];
    snprintf(result, sizeof result,
             "{\"seed\":\"%llu\",\"turn\":%lu,\"rng\":%lu,"
             "\"x\":%d,\"y\":%d,\"hp\":%d,\"depth\":%d,\"ended\":%d}",
             (unsigned long long)rogue.seed, rogue.playerTurnNumber,
             randomNumbersGenerated, player.loc.x, player.loc.y,
             player.currentHP, rogue.depthLevel, rogue.gameHasEnded);
    return result;
}
#endif
