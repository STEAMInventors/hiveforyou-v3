const DB_NAME = "hive3-landing-draft-files-v1";
const STORE_NAME = "files";

export type StoredDraftFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

export async function saveDraftFiles(draftId: string, files: File[]): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const file of files) {
      store.put({
        id: `${draftId}:${crypto.randomUUID()}`,
        draftId,
        name: file.name,
        type: file.type,
        size: file.size,
        blob: file,
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb_write_failed"));
  });
  db.close();
}

export async function readDraftFiles(draftId: string): Promise<File[]> {
  if (typeof indexedDB === "undefined") {
    return [];
  }
  const db = await openDb();
  const rows = await new Promise<StoredDraftFile[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const all = (request.result ?? []) as Array<StoredDraftFile & { draftId?: string }>;
      resolve(all.filter((row) => row.draftId === draftId && row.blob instanceof Blob));
    };
    request.onerror = () => reject(request.error ?? new Error("indexeddb_read_failed"));
  });
  db.close();
  return rows.map((row) => new File([row.blob], row.name, { type: row.type || undefined }));
}

export async function clearDraftFiles(draftId: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const all = (request.result ?? []) as Array<{ id?: string; draftId?: string }>;
      for (const row of all) {
        if (row.draftId === draftId && row.id) {
          store.delete(row.id);
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb_delete_failed"));
  });
  db.close();
}
