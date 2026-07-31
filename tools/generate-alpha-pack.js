/**
 * Generate built-in sculpt alpha stamps (greyscale PNG).
 * All images are original Messiah Studios / project assets — free to ship.
 *
 *   node tools/generate-alpha-pack.js
 */
var zlib = require('zlib');
var fs = require('fs');
var path = require('path');

var SIZE = 256;
var OUT = path.join(__dirname, '..', 'app', 'resources', 'alpha');

function crc32(buf) {
  var c = ~0;
  for (var i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (var k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  var len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  var t = Buffer.from(type);
  var td = Buffer.concat([t, data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function writeGrayPng(file, fn) {
  var raw = Buffer.alloc((SIZE + 1) * SIZE);
  for (var y = 0; y < SIZE; y++) {
    raw[y * (SIZE + 1)] = 0;
    for (var x = 0; x < SIZE; x++) {
      var u = ((x + 0.5) / SIZE) * 2 - 1;
      var v = ((y + 0.5) / SIZE) * 2 - 1;
      var g = Math.max(0, Math.min(1, fn(u, v, x, y)));
      raw[y * (SIZE + 1) + 1 + x] = Math.round(g * 255);
    }
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  var png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function smoothstep(e0, e1, x) {
  var t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function hash2(x, y) {
  var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

var stamps = {
  'softspot.png': function (u, v) {
    var r = Math.sqrt(u * u + v * v);
    return Math.pow(clamp01(1 - r), 1.55);
  },
  'hardspot.png': function (u, v) {
    var r = Math.sqrt(u * u + v * v);
    return smoothstep(1.02, 0.72, r);
  },
  'ring.png': function (u, v) {
    var r = Math.sqrt(u * u + v * v);
    return Math.exp(-Math.pow((r - 0.62) / 0.16, 2));
  },
  'crescent.png': function (u, v) {
    var r1 = Math.sqrt(u * u + v * v);
    var r2 = Math.sqrt((u - 0.35) * (u - 0.35) + v * v);
    var a = smoothstep(1.0, 0.55, r1);
    var b = smoothstep(0.55, 0.95, r2);
    return a * b;
  },
  'stripes.png': function (u) {
    var t = (u + 1) * 0.5;
    var w = Math.abs(((t * 7) % 1) - 0.5);
    return smoothstep(0.22, 0.05, w) * smoothstep(1.05, 0.85, Math.abs(u));
  },
  'hatch.png': function (u, v) {
    var a = Math.abs(((u + v) * 4) % 1);
    if (a > 0.5) a = 1 - a;
    var b = Math.abs(((u - v) * 4) % 1);
    if (b > 0.5) b = 1 - b;
    var edge = smoothstep(1.15, 0.75, Math.sqrt(u * u + v * v));
    return Math.max(smoothstep(0.12, 0.02, a), smoothstep(0.12, 0.02, b)) * edge;
  },
  'dots.png': function (u, v, x, y) {
    var cell = 28;
    var cx = (Math.floor(x / cell) + 0.5) * cell;
    var cy = (Math.floor(y / cell) + 0.5) * cell;
    var dx = (x - cx) / (cell * 0.38);
    var dy = (y - cy) / (cell * 0.38);
    var d = Math.sqrt(dx * dx + dy * dy);
    var edge = smoothstep(1.1, 0.7, Math.sqrt(u * u + v * v));
    return smoothstep(1.0, 0.15, d) * edge;
  },
  'grit.png': function (u, v, x, y) {
    var n = hash2(x * 0.37, y * 0.41) * 0.65 + hash2(x * 0.11 + 3, y * 0.17) * 0.35;
    var edge = Math.pow(clamp01(1 - Math.sqrt(u * u + v * v)), 1.2);
    return n * edge;
  },
  'ridge.png': function (u, v) {
    var g = Math.exp(-Math.pow(v / 0.22, 2));
    var edge = smoothstep(1.05, 0.7, Math.abs(u));
    return g * edge;
  },
  'crack.png': function (u, v) {
    var wobble = Math.sin(u * 9.0) * 0.08 + Math.sin(u * 23.0) * 0.03;
    var d = Math.abs(v - wobble);
    var line = Math.exp(-Math.pow(d / 0.045, 2));
    var twigs = Math.exp(-Math.pow((Math.abs(u) - 0.35) / 0.08, 2)) *
      Math.exp(-Math.pow((v - 0.2 * Math.sign(u)) / 0.06, 2));
    var edge = smoothstep(1.1, 0.65, Math.sqrt(u * u + v * v));
    return Math.max(line, twigs * 0.85) * edge;
  }
};

var keys = Object.keys(stamps);
for (var i = 0; i < keys.length; i++) {
  var name = keys[i];
  writeGrayPng(path.join(OUT, name), stamps[name]);
  console.log('wrote', name);
}

fs.writeFileSync(path.join(OUT, 'README.txt'), [
  'Built-in sculpt alpha stamps for WebXR Sculpt / SculptGL.',
  '',
  'Generated stamps (*.png): original project assets — free to use with this app.',
  'Legacy stamps: square.jpg, skin.jpg — from upstream SculptGL resources.',
  '',
  'Regenerate PNGs: node tools/generate-alpha-pack.js',
  ''
].join('\n'));

console.log('Done —', keys.length, 'alphas in', OUT);
