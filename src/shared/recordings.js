// Call recordings and transcripts, kept in the extension's own IndexedDB on this computer. The engine
// writes each chunk as it arrives (a long call never piles up in memory), and the
// recording page puts the chunks back together for playing and saving.

const DB_NAME = 'meet-tercuman';
const DB_VERSION = 2;
// Transcripts kept; the oldest go when there are more.
const KEEP_TRANSCRIPTS = 50;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['id', 'seq'] });
      if (!db.objectStoreNames.contains('transcripts')) db.createObjectStore('transcripts', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const result = fn(tx.objectStore(store));
        tx.oncomplete = () => {
          db.close();
          resolve(result?.result ?? result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export function saveChunk(id, seq, blob) {
  return run('chunks', 'readwrite', (store) => store.put({ id, seq, blob }));
}

export function saveRecording(meta) {
  return run('recordings', 'readwrite', (store) => store.put(meta));
}

export async function listRecordings() {
  const all = await run('recordings', 'readonly', (store) => store.getAll());
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function recordingBlob(id) {
  const meta = await run('recordings', 'readonly', (store) => store.get(id));
  if (!meta) return null;
  const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
  const chunks = await run('chunks', 'readonly', (store) => store.getAll(range));
  return { meta, blob: new Blob(chunks.sort((a, b) => a.seq - b.seq).map((c) => c.blob), { type: meta.mimeType }) };
}

// The chunks written so far, in order, with their sequence numbers.
export async function recordingChunks(id) {
  const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
  const chunks = await run('chunks', 'readonly', (store) => store.getAll(range));
  return chunks.sort((a, b) => a.seq - b.seq);
}

export async function deleteRecording(id) {
  const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
  await run('chunks', 'readwrite', (store) => store.delete(range));
  await run('recordings', 'readwrite', (store) => store.delete(id));
}

// ---- transcripts (shared/transcript.js) -------------------------------------------------

export async function saveTranscript(transcript) {
  await run('transcripts', 'readwrite', (store) => store.put(transcript));
  const all = await listTranscripts();
  for (const old of all.slice(KEEP_TRANSCRIPTS)) await deleteTranscript(old.id);
}

export async function listTranscripts() {
  const all = await run('transcripts', 'readonly', (store) => store.getAll());
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export function getTranscript(id) {
  return run('transcripts', 'readonly', (store) => store.get(id));
}

export function deleteTranscript(id) {
  return run('transcripts', 'readwrite', (store) => store.delete(id));
}
