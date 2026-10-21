#ifndef BROGUE_BROWSER_IO_H
#define BROGUE_BROWSER_IO_H
#include <stdint.h>

/* Public input-wait descriptor, set by the existing UI owner rather than
 * inferred from rendered English. keys contain only currently offered input. */
enum BrowserWaitKind {
    BROWSER_COMMAND, BROWSER_TARGET, BROWSER_ITEM, BROWSER_CONFIRM,
    BROWSER_TEXT, BROWSER_MENU, BROWSER_ACK, BROWSER_TITLE,
    BROWSER_ANY_KEY, BROWSER_CURSOR, BROWSER_PLAYBACK
};
#define BROWSER_WAIT_MAX_KEYS 128
typedef struct BrowserWait {
    int32_t values[4 + BROWSER_WAIT_MAX_KEYS]; /* kind, maxLength, cancel, count, keys */
} BrowserWait;

#ifdef BROGUE_BROWSER
BrowserWait browserWaitBegin(int kind, int maxLength, int cancel);
BrowserWait browserWaitButtons(void);
void browserWaitKey(int32_t key);
void browserWaitRestore(BrowserWait previous);
#else
static inline BrowserWait browserWaitBegin(int kind, int maxLength, int cancel) {
    (void)kind; (void)maxLength; (void)cancel;
    BrowserWait empty = {{0}}; return empty;
}
static inline BrowserWait browserWaitButtons(void) {
    BrowserWait empty = {{0}}; return empty;
}
static inline void browserWaitKey(int32_t key) { (void)key; }
static inline void browserWaitRestore(BrowserWait previous) { (void)previous; }
#endif

/* Read-only playback actions offered by Recordings.c. Physical unknown keys
 * still reach the original default handler; this list drives touch choices. */
static inline BrowserWait browserWaitPlayback(void) {
    BrowserWait previous = browserWaitBegin(BROWSER_PLAYBACK, 0, 1);
    const int keys[] = {ACKNOWLEDGE_KEY, ESCAPE_KEY, UP_KEY, DOWN_KEY, LEFT_KEY, RIGHT_KEY,
                        UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW, TAB_KEY,
                        ASCEND_KEY, DESCEND_KEY, INVENTORY_KEY, DISCOVERIES_KEY,
                        FEATS_KEY, MESSAGE_ARCHIVE_KEY, BROGUE_HELP_KEY,
                        VIEW_RECORDING_KEY, LOAD_SAVED_GAME_KEY, QUIT_KEY,
                        TRUE_COLORS_KEY, STEALTH_RANGE_KEY, GRAPHICS_KEY, SEED_KEY,
                        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'};
    for (unsigned int i = 0; i < sizeof keys / sizeof *keys; i++) browserWaitKey(keys[i]);
#ifdef ENABLE_PLAYBACK_SWITCH
    browserWaitKey(SWITCH_TO_PLAYING_KEY);
#endif
    return previous;
}
#endif
