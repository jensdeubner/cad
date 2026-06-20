/**
 * Node 25+ may expose a broken global localStorage (setItem is not a function)
 * unless --localstorage-file is set. Vitest/jsdom tests need a working store.
 */
function installLocalStoragePolyfill(): void {
  const broken =
    typeof globalThis.localStorage === 'undefined' ||
    typeof globalThis.localStorage.setItem !== 'function';
  if (!broken) return;

  const store = new Map<string, string>();
  const polyfill: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: polyfill,
    configurable: true,
    writable: true,
  });
}

installLocalStoragePolyfill();