/* Test-only console for replaying browser-consumed input against untouched
 * upstream Brogue sources. Never linked into the browser distribution.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <limits.h>
#include "platform.h"
#include "GlobalsBase.h"

static boolean shiftHeld, controlHeld;
#ifdef BROGUE_COMPARE_FIXTURES
#include "BrowserIO.h"
extern int brogue_check_fixture(int scene);
extern const char *brogue_check_features(void);
static boolean fixturePrepared;
/* Fixture setup is allowed only once at the seeded game's first event wait.
 * This platform value is excluded from the semantic-state comparison. */
int brogue_check_wait_kind(void) { return BROWSER_COMMAND; }
void brogue_check_publish(void) { }
static void prepare_fixture(boolean textInput) {
    if (fixturePrepared) return;
    fixturePrepared = true;
    const char *value = getenv("BROGUE_COMPARE_SCENE");
    char *end;
    errno = 0;
    long scene = value ? strtol(value, &end, 10) : 0;
    if (textInput || !rogue.gameInProgress || rogue.seed != 42 || rogue.playerTurnNumber != 0
        || !value || !*value || *end || errno || scene < 1 || scene > INT_MAX
        || brogue_check_fixture((int) scene) != scene) {
        fputs("Invalid or rejected native comparison fixture\n", stderr);
        exit(3);
    }
}
#endif
static void replay_loop(void) { exit(rogueMain()); }
static boolean replay_pause(short milliseconds, PauseBehavior behavior) {
    (void)milliseconds;
    (void)behavior;
    return false;
}
static void replay_event(rogueEvent *event, boolean textInput, boolean colorsDance) {
    int type, one, two, control, shift;
    (void)textInput;
    (void)colorsDance;
#ifdef BROGUE_COMPARE_FIXTURES
    prepare_fixture(textInput);
    printf("FIXTURE_COMPARE %s\n", brogue_check_features());
#else
    printf("BROWSER_COMPARE {\"seed\":\"%llu\",\"turn\":%lu,\"rng\":%lu,"
           "\"x\":%d,\"y\":%d,\"hp\":%d,\"depth\":%d,\"ended\":%d}\n",
           (unsigned long long)rogue.seed, rogue.playerTurnNumber,
           randomNumbersGenerated, player.loc.x, player.loc.y,
           player.currentHP, rogue.depthLevel, rogue.gameHasEnded);
#endif
    fflush(stdout);
    const int fields = scanf("%d %d %d %d %d", &type, &one, &two, &control, &shift);
    if (fields == EOF) exit(0);
    if (fields != 5) exit(2);
    event->eventType = type;
    event->param1 = one;
    event->param2 = two;
    event->controlKey = controlHeld = control != 0;
    event->shiftKey = shiftHeld = shift != 0;
}
static void replay_plot(enum displayGlyph glyph, short x, short y,
                        short fr, short fg, short fb, short br, short bg, short bb) {
    (void)glyph; (void)x; (void)y; (void)fr; (void)fg; (void)fb;
    (void)br; (void)bg; (void)bb;
}
static boolean replay_modifier(int modifier) { return modifier == 0 ? shiftHeld : controlHeld; }
struct brogueConsole nullConsole = {
    replay_loop, replay_pause, replay_event, replay_plot,
    NULL, replay_modifier, NULL, NULL, NULL
};
