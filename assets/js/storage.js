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

export async function loadProject(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function loadActive() {
  return loadProject(localStorage.getItem(ACTIVE_KEY));
}

export async function listProjects() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function setActiveProject(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export async function clearActive() {
  localStorage.removeItem(ACTIVE_KEY);
}
