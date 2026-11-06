const DB_NAME = 'gantt-studio';
const DB_VERSION = 1;
const STORE = 'projects';
const ACTIVE_KEY = 'gantt-studio.active-project';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocal(project, expectedRevision = null) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    let revisionError = null;
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => {
      const error = revisionError || tx.error || new Error('IndexedDB transaction aborted.');
      db.close();
      reject(error);
    };
    tx.onerror = () => { if (!revisionError) reject(tx.error || new Error('IndexedDB write failed.')); };
    const store = tx.objectStore(STORE);
    const put = () => {
      try { store.put(structuredClone(project)); }
      catch (error) { revisionError = error; try { tx.abort(); } catch {} reject(error); }
    };
    if (expectedRevision === null) {
      put();
    } else {
      // Read and write in the SAME readwrite transaction. A second browser tab
      // cannot silently overwrite a project with a more recent revision.
      const request = store.get(project.id);
      request.onsuccess = () => {
        if (!request.result || Number(request.result.revision) !== Number(expectedRevision)) {
          revisionError = new Error('Projekt wurde zwischenzeitlich geändert. Bitte neu laden und erneut versuchen.');
          revisionError.name = 'ConcurrentModificationError';
          tx.abort();
          return;
        }
        put();
      };
    }
  });
}

// Saving a project must never switch the active project. Selection is an explicit
// UI action; otherwise a delayed write can silently undo a project switch.

export async function loadProject(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function loadActive() {
  return loadProject(localStorage.getItem(ACTIVE_KEY));
}

export async function listProjects() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => { db.close(); resolve((request.result || []).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function deleteProject(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
      resolve();
    };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Projekt konnte nicht gelöscht werden.')); };
  });
}

export function setActiveProject(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export async function clearActive() {
  localStorage.removeItem(ACTIVE_KEY);
}
