const DB_NAME = 'memorie-db';
const STORE = 'draft';
const KEY = 'v1';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('DB open failed'));
  });
}

// Cache identifiers only for the current roll. Ordinary edits never hash or clone photo bytes.
let identifiers = new Map();
let writes = Promise.resolve();

async function persist({ captured = [], ...edits }) {
  const ids = new Map();
  for (const photo of captured) {
    let id = identifiers.get(photo) || ids.get(photo);
    if (!id) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(photo));
      id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }
    ids.set(photo, id);
  }
  const blobs = new Map();
  for (const [photo, id] of ids) {
    if (!identifiers.has(photo) && photo.startsWith('data:')) blobs.set(id, await (await fetch(photo)).blob());
  }
  const photoIds = captured.map(photo => ids.get(photo));
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('Draft save failed'));
      const store = tx.objectStore(STORE);
      const previous = store.get(KEY);
      previous.onsuccess = () => {
        const old = new Set(previous.result?.photoIds || []);
        const keep = new Set(photoIds);
        for (const [photo, id] of ids) if (!old.has(id)) store.put(blobs.get(id) || photo, id);
        for (const id of old) if (!keep.has(id)) store.delete(id);
        store.put({ ...edits, photoIds, savedAt: Date.now() }, KEY);
      };
    });
    identifiers = ids;
  } finally { db.close(); }
}

export function saveDraft(draft) {
  const job = writes.then(() => persist(draft));
  writes = job.catch(() => {});
  return job;
}

export async function loadDraft() {
  const db = await openDB();
  try {
    const loaded = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const request = store.get(KEY);
      let draft;
      tx.onabort = () => reject(tx.error || new Error('Draft read failed'));
      tx.oncomplete = () => resolve(draft || null);
      request.onsuccess = () => {
        draft = request.result;
        if (!draft?.photoIds) return;
        draft.captured = [];
        draft.photoIds.forEach((id, i) => {
          const photo = store.get(id);
          photo.onsuccess = () => { draft.captured[i] = photo.result; };
        });
      };
    });
    if (loaded?.photoIds) {
      loaded.captured = await Promise.all(loaded.captured.map(value => {
        if (!(value instanceof Blob)) return value;
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(value);
        });
      }));
      identifiers = new Map(loaded.captured.map((photo, i) => [photo, loaded.photoIds[i]]));
    }
    return loaded;
  } finally { db.close(); }
}

export async function clearDraft() {
  await writes;
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    identifiers.clear();
  } finally { db.close(); }
}
