/* Memory and browser-host bridge. Input meanings and rendering belong to Rust. */
mergeInto(LibraryManager.library, {
  brogue_browser_frame: function(ptr, count) {
    globalThis.brogueHost.frame(HEAP32.slice(ptr >> 2, (ptr >> 2) + count));
  },
  brogue_browser_event__deps: ['$Asyncify'],
  brogue_browser_event__async: true,
  brogue_browser_event: function(ptr, textInput, colorsDance, wait, count) {
    return Asyncify.handleAsync(async function() {
      var values = await globalThis.brogueHost.event(!!textInput, !!colorsDance,
        HEAP32.slice(wait >> 2, (wait >> 2) + count));
      if (!values || values.length !== 5) throw new Error('Invalid browser input transfer');
      for (var i = 0; i < 5; i++) HEAP32[(ptr >> 2) + i] = values[i];
    });
  },
  brogue_browser_pause__deps: ['$Asyncify'],
  brogue_browser_pause__async: true,
  brogue_browser_pause: function(ms, interruptForMouseMove, wait, count) {
    return Asyncify.handleAsync(async function() {
      return +(await globalThis.brogueHost.pause(ms, !!interruptForMouseMove,
        HEAP32.slice(wait >> 2, (wait >> 2) + count)));
    });
  },
  brogue_browser_screenshot: function() {
    return +globalThis.brogueHost.screenshot();
  },
  brogue_browser_notify: function(eventId, data1, data2, str1, str2) {
    globalThis.brogueHost.notify(eventId, data1, data2,
      str1 ? UTF8ToString(str1) : '', str2 ? UTF8ToString(str2) : '');
  }
});
