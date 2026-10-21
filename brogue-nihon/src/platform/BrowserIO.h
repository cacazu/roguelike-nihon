#ifndef BROGUE_BROWSER_IO_H
#define BROGUE_BROWSER_IO_H
#include <stdint.h>

/* Public input-wait descriptor, set by the existing UI owner rather than
 * inferred from rendered English. keys contain only currently offered input. */
enum BrowserWaitKind {
    BROWSER_COMMAND, BROWSER_TARGET, BROWSER_ITEM, BROWSER_CONFIRM,
    BROWSER_TEXT, BROWSER_MENU, BROWSER_ACK, BROWSER_TITLE
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
#endif
