/**
 * Relays console + view/action descriptions to the laptop via POST /__xr_log.
 * Live view (dev server only): http://127.0.0.1:8080/__xr_logs
 *
 * Works for Quest AND desktop — same buffer/file.
 * Prefer XRRemoteLog.see(mode, '...') for intentional product lines:
 *   see('MR'|'VR', ...)     → source xr-view   (headset)
 *   see('DESKTOP', ...)     → source desktop-view
 *
 * Stable / GitHub Pages builds: no remote relay (static hosts have no __xr_log).
 * Dev keeps the full POST + /__xr_logs page for Quest playtesting.
 */
import BuildFlags from 'misc/BuildFlags';

var QUEUE = [];
var FLUSH_MS = 200;
var MAX_QUEUE = 400;
var timer = null;
var hooked = false;
var sourceTag = 'client';
var origInfo = null;
var origWarn = null;
var origError = null;
var origLog = null;

function relayEnabled() {
  // Product cut has no Express log endpoint — POSTing only causes 405 noise.
  return !BuildFlags.isStable;
}

function detectSource() {
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/Quest|OculusBrowser/i.test(ua)) return 'quest';
  return 'desktop';
}

function stringifyArg(a) {
  if (a == null) return String(a);
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.name + ': ' + a.message + (a.stack ? '\n' + a.stack : '');
  try {
    return JSON.stringify(a);
  } catch (e) {
    return String(a);
  }
}

function enqueue(level, args, tag) {
  if (!relayEnabled()) return;
  var msg = [];
  var i;
  for (i = 0; i < args.length; ++i)
    msg.push(stringifyArg(args[i]));
  QUEUE.push({
    t: new Date().toISOString(),
    level: level,
    source: tag || sourceTag,
    msg: msg.join(' ')
  });
  if (QUEUE.length > MAX_QUEUE)
    QUEUE = QUEUE.slice(-MAX_QUEUE);
  if (!timer)
    timer = setTimeout(flush, FLUSH_MS);
}

function flush() {
  timer = null;
  if (!relayEnabled() || !QUEUE.length) return;
  var entries = QUEUE;
  QUEUE = [];
  try {
    fetch(new URL('__xr_log', window.location.href).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: entries }),
      keepalive: true
    }).catch(function () { /* relay offline */ });
  } catch (e) { /* ignore */ }
}

function wrap(level, original) {
  return function () {
    try { enqueue(level, arguments); } catch (e) { /* ignore */ }
    if (typeof original === 'function')
      return original.apply(console, arguments);
  };
}

/**
 * Human-readable "what happened / what you should see".
 * @param {'MR'|'VR'|'XR'|'DESKTOP'} mode
 * @param {string} whatYouShouldSee
 * @param {object=} detail
 */
function see(mode, whatYouShouldSee, detail) {
  var m = mode || 'XR';
  var isDesktop = m === 'DESKTOP' || m === 'Desktop';
  var prefix = isDesktop ? '[DESKTOP]' : '[' + m + ' VIEW]';
  var tag = isDesktop ? 'desktop-view' : 'xr-view';
  if (relayEnabled()) {
    if (detail !== undefined)
      enqueue('info', [prefix, whatYouShouldSee, detail], tag);
    else
      enqueue('info', [prefix, whatYouShouldSee], tag);
  }
  try {
    var fn = origInfo || console.info;
    if (detail !== undefined)
      fn.call(console, prefix, whatYouShouldSee, detail);
    else
      fn.call(console, prefix, whatYouShouldSee);
  } catch (e) { /* ignore */ }
}

function event(tag, detail) {
  if (relayEnabled()) {
    if (detail !== undefined)
      enqueue('info', ['[XR]', tag, detail], 'xr');
    else
      enqueue('info', ['[XR]', tag], 'xr');
  }
  try {
    var fn = origInfo || console.info;
    if (detail !== undefined)
      fn.call(console, '[XR]', tag, detail);
    else
      fn.call(console, '[XR]', tag);
  } catch (e) { /* ignore */ }
}

function install() {
  if (hooked || typeof window === 'undefined') return;
  hooked = true;
  sourceTag = detectSource();

  // Stable product: no console hijack, no POST relay.
  if (!relayEnabled()) return;

  origLog = console.log.bind(console);
  origInfo = console.info.bind(console);
  origWarn = console.warn.bind(console);
  origError = console.error.bind(console);
  console.log = wrap('info', origLog);
  console.info = wrap('info', origInfo);
  console.warn = wrap('warn', origWarn);
  console.error = wrap('error', origError);
  window.addEventListener('error', function (ev) {
    enqueue('error', [ev.message || 'window.error', ev.filename, ev.lineno, ev.error && ev.error.stack]);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    enqueue('error', ['unhandledrejection', stringifyArg(ev.reason)]);
  });
  enqueue('info', [
    '[XRRemoteLog] installed — desktop + Quest both POST here; open /__xr_logs',
    'source=' + sourceTag,
    window.location.href
  ]);
  flush();
}

export default {
  install: install,
  log: function (level, msg) { enqueue(level || 'info', [msg]); },
  see: see,
  event: event,
  flush: flush
};
