// V11.20 — onboarding video stash (IndexedDB).
//
// The onboarding "Record on camera" path captures a clip BEFORE the
// account gate (so the reveal lands first). Sign-in is magic-link, which
// opens a fresh tab — an in-memory Blob would be lost on that round-trip
// (typed drafts survive because they're small text in localStorage; a
// video can't go there). So we stash the recorded clip + its one-liner
// in IndexedDB and restore it after the magic-link return, then run the
// existing video pipeline (upload-url → PUT → finalize) post-auth.
//
// One pending clip at a time, under a fixed key. All ops fail soft
// (resolve null/void) so a storage-blocked browser never breaks the flow.

var DB_NAME = 'paradocs-onboarding'
var STORE = 'pending-video'
var KEY = 'current'

export interface StashedVideoMeta {
  oneLiner: string
  category: string
  mime: string
  size: number
  durationSec: number | null
}

export interface StashedVideo extends StashedVideoMeta {
  blob: Blob
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(function (resolve) {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      var req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = function () {
        var db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = function () { resolve(req.result) }
      req.onerror = function () { resolve(null) }
    } catch { resolve(null) }
  })
}

export async function stashVideo(blob: Blob, meta: StashedVideoMeta): Promise<void> {
  var db = await openDb()
  if (!db) return
  await new Promise<void>(function (resolve) {
    try {
      var tx = db!.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ blob: blob, ...meta }, KEY)
      tx.oncomplete = function () { resolve() }
      tx.onerror = function () { resolve() }
      tx.onabort = function () { resolve() }
    } catch { resolve() }
  })
}

export async function loadStashedVideo(): Promise<StashedVideo | null> {
  var db = await openDb()
  if (!db) return null
  return new Promise(function (resolve) {
    try {
      var tx = db!.transaction(STORE, 'readonly')
      var r = tx.objectStore(STORE).get(KEY)
      r.onsuccess = function () {
        var v = r.result as StashedVideo | undefined
        resolve(v && v.blob ? v : null)
      }
      r.onerror = function () { resolve(null) }
    } catch { resolve(null) }
  })
}

export async function clearStashedVideo(): Promise<void> {
  var db = await openDb()
  if (!db) return
  await new Promise<void>(function (resolve) {
    try {
      var tx = db!.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = function () { resolve() }
      tx.onerror = function () { resolve() }
      tx.onabort = function () { resolve() }
    } catch { resolve() }
  })
}
