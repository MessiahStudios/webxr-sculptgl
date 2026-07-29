/**
 * Relays console + XR/MR view descriptions from Quest to the laptop via POST /__xr_log.
 * Live view: http://127.0.0.1:8080/__xr_logs
 *
 * Prefer XRRemoteLog.see('MR', '...') for headset-visible state — those lines
 * describe what the user should see in passthrough / room space.
 */
var QUEUE = [];
var FLUSH_MS = 200;
var MAX_QUEUE = 120;
var timer = null;
var hooked = false;
var sourceTag = 'client';
var origInfo = null;
var origWarn = null;
var origError = null;
var origLog = null;

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
  if (!QUEUE.length) return;
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
 * Human-readable "what you should see" log for MR/VR.
 * @param {'MR'|'VR'|'XR'} mode
 * @param {string} whatYouShouldSee
 * @param {object=} detail
 */
function see(mode, whatYouShouldSee, detail) {
  var prefix = '[' + (mode || 'XR') + ' VIEW]';
  if (detail !== undefined)
    enqueue('info', [prefix, whatYouShouldSee, detail], 'xr-view');
  else
    enqueue('info', [prefix, whatYouShouldSee], 'xr-view');
  try {
    var fn = origInfo || console.info;
    if (detail !== undefined)
      fn.call(console, prefix, whatYouShouldSee, detail);
    else
      fn.call(console, prefix, whatYouShouldSee);
  } catch (e) { /* ignore */ }
}

function event(tag, detail) {
  if (detail !== undefined)
    enqueue('info', ['[XR]', tag, detail], 'xr');
  else
    enqueue('info', ['[XR]', tag], 'xr');
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
  origLog = console.log.bind(console);
  origInfo = console.info.bind(console);
  origWarn = console.warn.bind(console);
  origError = console.error.bind(console);
  console.log = wrap('info', origLog);
  console.info = wrap('info', origInfo);
  console.warn = wrap('warn', origWarn);
  console.error = wrap('error', origError);
  window.addEventListener('error', function (ev) {
    enqueue('error', [ev.message || 'window.error', ev.filename, ev.lineno]);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    enqueue('error', ['unhandledrejection', ev.reason]);
  });
  enqueue('info', ['[XRRemoteLog] installed — MR/VR view logs appear as [MR VIEW] / [VR VIEW]', sourceTag, window.location.href]);
  flush();
}

export default {
  install: install,
  log: function (level, msg) { enqueue(level || 'info', [msg]); },
  see: see,
  event: event,
  flush: flush
};
