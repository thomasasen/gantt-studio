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

export async function saveLocal(project) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(structuredClone(project));
    tx.oncomplete = () => {
      localStorage.setItem(ACTIVE_KEY, project.id);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadActive() {
  const id = localStorage.getItem(ACTIVE_KEY);
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function clearActive() {
  localStorage.removeItem(ACTIVE_KEY);
}
