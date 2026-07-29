/**
 * Origin-private project continuity for WebXR (Quest Browser).
 * Save / Load use IndexedDB (.sgl blob). Not the Quest Files app.
 */

var DB_NAME = 'sculptgl-xr';
var DB_VERSION = 1;
var STORE = 'projects';
var LAST_KEY = 'last';

function openDb() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
  });
}

function stampName(ext) {
  var d = new Date();
  function p(n) { return n < 10 ? '0' + n : String(n); }
  return 'sculptgl-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.' + ext;
}

/** @param {Blob} blob @param {{ name?: string, meshCount?: number }} meta */
function saveLastProject(blob, meta) {
  meta = meta || {};
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      var rec = {
        id: LAST_KEY,
        blob: blob,
        savedAt: Date.now(),
        name: meta.name || stampName('sgl'),
        bytes: blob.size,
        meshCount: meta.meshCount || 0
      };
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = function () {
        db.close();
        resolve(rec);
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error('IndexedDB write failed'));
      };
    });
  });
}

/** @returns {Promise<{ blob: Blob, savedAt: number, name: string, bytes: number, meshCount: number }|null>} */
function loadLastProject() {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).get(LAST_KEY);
      req.onsuccess = function () {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = function () {
        db.close();
        reject(req.error || new Error('IndexedDB read failed'));
      };
    });
  });
}

function hasLastProject() {
  return loadLastProject().then(function (rec) {
    return !!(rec && rec.blob);
  });
}

export default {
  stampName: stampName,
  saveLastProject: saveLastProject,
  loadLastProject: loadLastProject,
  hasLastProject: hasLastProject
};
