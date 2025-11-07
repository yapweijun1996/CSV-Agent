const DB_NAME = 'csv_agent_memory';
const DB_VERSION = 1;
const STORE_TURNS = 'turns';
const HISTORY_LIMIT = 3;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('memory db open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_TURNS)) {
        const store = db.createObjectStore(STORE_TURNS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
  return dbPromise;
}

function withStore(mode, task) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TURNS, mode);
    const store = tx.objectStore(STORE_TURNS);
    let resultValue;
    try {
      const taskResult = task(store);
      if (taskResult && typeof taskResult.then === 'function') {
        taskResult
          .then((value) => {
            resultValue = value;
          })
          .catch((error) => {
            reject(error);
            tx.abort();
          });
      } else {
        resultValue = taskResult;
      }
    } catch (error) {
      reject(error);
      tx.abort();
      return;
    }
    tx.oncomplete = () => resolve(resultValue);
    tx.onerror = () => reject(tx.error || new Error('memory tx failed'));
  }));
}

export async function saveMemoryEntry({ userInput, response }) {
  if (!userInput || !response) return;
  try {
    const payload = {
      userInput,
      restatement: response.restatement || '',
      visibleReply: response.visible_reply || '',
      toolPlan: Array.isArray(response.tool_plan) ? response.tool_plan : [],
      timestamp: Date.now()
    };
    await withStore('readwrite', (store) => store.add(payload));
  } catch (error) {
    console.warn('memory save failed', error);
  }
}

export async function getMemoryContext(limit = HISTORY_LIMIT) {
  try {
    const entries = await withStore('readonly', (store) => {
      const results = [];
      const index = store.index('timestamp');
      return new Promise((resolve, reject) => {
        const cursorRequest = index.openCursor(null, 'prev');
        cursorRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor || results.length >= limit) {
            resolve(results);
            return;
          }
          results.push(cursor.value);
          cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error || new Error('memory cursor failed'));
      });
    });
    if (!entries.length) {
      return { history: [] };
    }
    const [latest] = entries;
    return {
      lastIntent: latest.restatement || '',
      lastToolPlan: latest.toolPlan || [],
      history: entries
        .map((entry) => ({
          userInput: entry.userInput,
          restatement: entry.restatement,
          visibleReply: entry.visibleReply,
          timestamp: entry.timestamp
        }))
        .reverse()
    };
  } catch (error) {
    console.warn('memory load failed', error);
    return { history: [] };
  }
}

export async function clearMemoryStore() {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch (error) {
    console.warn('memory clear failed', error);
  }
}
