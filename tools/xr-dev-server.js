/**
 * Static file server for app/ plus XR remote log relay.
 * Quest POSTs to /__xr_log; laptop views live stream at /__xr_logs.
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var PORT = parseInt(process.env.XR_DEV_PORT || '8080', 10);
var ROOT = path.resolve(__dirname, '..', 'app');
var LOG_FILE = path.resolve(__dirname, 'xr-live.log');
var MAX_BUFFER = 500;

var mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json'
};

var buffer = [];
var sseClients = new Set();

function appendLog(entry) {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  var line = '[' + entry.t + '] [' + entry.level + ']' +
    (entry.source ? ' (' + entry.source + ')' : '') + ' ' + entry.msg + '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) { /* ignore */ }
  process.stdout.write(line);
  var payload = 'data: ' + JSON.stringify(entry) + '\n\n';
  sseClients.forEach(function (res) {
    try { res.write(payload); } catch (err) { sseClients.delete(res); }
  });
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function safeJoin(root, reqPath) {
  var decoded = decodeURIComponent((reqPath || '/').split('?')[0]);
  if (decoded.indexOf('\0') !== -1) return null;
  var cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  if (cleaned === '.' || cleaned === '') cleaned = 'index.html';
  if (cleaned.charAt(0) === path.sep || cleaned.charAt(0) === '/') cleaned = cleaned.slice(1);
  var full = path.resolve(root, cleaned);
  if (full !== root && full.indexOf(root + path.sep) !== 0) return null;
  return full;
}

function serveStatic(req, res, pathname) {
  var full = safeJoin(ROOT, pathname);
  if (!full) return send(res, 403, 'Forbidden');
  fs.stat(full, function (err, st) {
    if (err) return send(res, 404, 'Not found');
    var file = st.isDirectory() ? path.join(full, 'index.html') : full;
    fs.readFile(file, function (err2, data) {
      if (err2) return send(res, 404, 'Not found');
      var ext = path.extname(file).toLowerCase();
      send(res, 200, data, mime[ext] || 'application/octet-stream');
    });
  });
}

function readBody(req, cb) {
  var chunks = [];
  var size = 0;
  req.on('data', function (c) {
    size += c.length;
    if (size > 2e6) {
      cb(new Error('body too large'));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', function () { cb(null, Buffer.concat(chunks).toString('utf8')); });
  req.on('error', cb);
}

function clearLogs(reason) {
  buffer = [];
  try { fs.writeFileSync(LOG_FILE, ''); } catch (e) { /* ignore */ }
  var payload = 'event: clear\ndata: ' + JSON.stringify({ t: new Date().toISOString(), reason: reason || 'cleared' }) + '\n\n';
  sseClients.forEach(function (res) {
    try { res.write(payload); } catch (err) { sseClients.delete(res); }
  });
  appendLog({
    t: new Date().toISOString(),
    level: 'info',
    source: 'server',
    msg: 'Logs cleared' + (reason ? ' (' + reason + ')' : '') + ' — buffer + xr-live.log reset'
  });
}

function viewerHtml() {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>XR Live Logs</title>',
    '<style>',
    'html,body{margin:0;background:#0e1117;color:#d7dde8;font:13px/1.45 ui-monospace,Consolas,monospace}',
    '#bar{position:fixed;top:0;left:0;right:0;z-index:10;padding:10px 14px;background:rgba(22,27,36,0.96);backdrop-filter:blur(8px);border-bottom:1px solid #2a3344;display:flex;gap:12px;align-items:center;flex-wrap:wrap;box-shadow:0 6px 18px rgba(0,0,0,0.35)}',
    '#bar b{color:#9ec1ff} #status{color:#8b98b0;flex:1;min-width:8em}',
    '#clear,#clearView{cursor:pointer;background:#243049;color:#cfe0ff;border:1px solid #3a4a66;border-radius:6px;padding:6px 10px}',
    '#clear{background:#3a2430;border-color:#66404a;color:#ffd0d8}',
    '#clear:hover{background:#4a2e3a} #clearView:hover{background:#2e3c58}',
    '#count{color:#6b7a94;font-size:12px}',
    '#log{padding:64px 14px 48px;white-space:pre-wrap;word-break:break-word}',
    '.info{color:#c9d4e8}.warn{color:#ffcc66}.error{color:#ff8f8f}.debug{color:#8b98b0}',
    '</style></head><body>',
    '<div id="bar"><b>XR Live Logs</b><span id="status">connecting…</span><span id="count"></span>',
    '<button id="clearView" type="button" title="Hide lines in this tab only">Clear view</button>',
    '<button id="clear" type="button" title="Wipe server buffer, log file, and all open viewers">Clear logs</button></div>',
    '<div id="log"></div><script>',
    'var log=document.getElementById("log"), statusEl=document.getElementById("status"), countEl=document.getElementById("count");',
    'function updateCount(){countEl.textContent=log.childNodes.length+" lines";}',
    'function clearDom(){log.textContent="";updateCount();}',
    'document.getElementById("clearView").onclick=function(){clearDom();};',
    'document.getElementById("clear").onclick=function(){',
    '  if(!confirm("Clear all XR logs on the server (buffer + xr-live.log)?"))return;',
    '  fetch("/__xr_logs/clear",{method:"POST"}).then(function(r){',
    '    if(!r.ok)throw new Error("clear failed");',
    '    clearDom();statusEl.textContent="cleared";',
    '  }).catch(function(e){statusEl.textContent="clear failed";console.warn(e);});',
    '};',
    'function line(e){var d=document.createElement("div");d.className=e.level||"info";',
    'd.textContent="["+e.t+"] ["+(e.level||"info")+"]"+(e.source?" ("+e.source+")":"")+" "+e.msg;',
    'log.appendChild(d);if(log.childNodes.length>500)log.removeChild(log.firstChild);',
    'updateCount();window.scrollTo(0,document.body.scrollHeight);}',
    'fetch("/__xr_logs.json").then(function(r){return r.json()}).then(function(a){(a||[]).forEach(line);updateCount();}).catch(function(){});',
    'var es=new EventSource("/__xr_logs/stream");',
    'es.onopen=function(){statusEl.textContent="live";};',
    'es.onerror=function(){statusEl.textContent="reconnecting…";};',
    'es.addEventListener("clear",function(){clearDom();statusEl.textContent="cleared (remote)";});',
    'es.onmessage=function(ev){try{line(JSON.parse(ev.data));}catch(e){}};',
    '</script></body></html>'
  ].join('\n');
}

try { fs.writeFileSync(LOG_FILE, ''); } catch (e) { /* ignore */ }

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    });
    return res.end();
  }

  if (pathname === '/__xr_log' && req.method === 'POST') {
    return readBody(req, function (err, raw) {
      if (err) return send(res, 400, 'bad body');
      try {
        var data = JSON.parse(raw || '{}');
        var entries = Array.isArray(data.entries) ? data.entries : [data];
        for (var i = 0; i < entries.length; ++i) {
          var e = entries[i] || {};
          appendLog({
            t: e.t || new Date().toISOString(),
            level: e.level || 'info',
            source: e.source || 'client',
            msg: typeof e.msg === 'string' ? e.msg : JSON.stringify(e.msg)
          });
        }
        send(res, 204, '');
      } catch (e2) {
        send(res, 400, 'invalid json');
      }
    });
  }

  if (pathname === '/__xr_logs' || pathname === '/__xr_logs/') {
    return send(res, 200, viewerHtml(), 'text/html; charset=utf-8');
  }
  if ((pathname === '/__xr_logs/clear' || pathname === '/__xr_logs/clear/') &&
      (req.method === 'POST' || req.method === 'DELETE')) {
    clearLogs('desktop');
    return send(res, 200, JSON.stringify({ ok: true, cleared: true }), 'application/json; charset=utf-8');
  }
  if (pathname === '/__xr_logs.json') {
    return send(res, 200, JSON.stringify(buffer), 'application/json; charset=utf-8');
  }
  if (pathname === '/__xr_logs/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');
    sseClients.add(res);
    req.on('close', function () { sseClients.delete(res); });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, '127.0.0.1', function () {
  appendLog({
    t: new Date().toISOString(),
    level: 'info',
    source: 'server',
    msg: 'XR log relay ready — live view http://127.0.0.1:' + PORT + '/__xr_logs'
  });
  console.log('SculptGL XR dev server');
  console.log('  App:      http://127.0.0.1:' + PORT + '/');
  console.log('  Live log: http://127.0.0.1:' + PORT + '/__xr_logs');
});
