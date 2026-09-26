import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeSecureSessionPlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

const NativeSecureSession = registerPlugin<NativeSecureSessionPlugin>("SecureSession");
const WEB_PREFIX = "elsatia.tools.secure.";
const KEY_DATABASE = "elsatia-tools-crypto";
const KEY_STORE = "keys";
const KEY_ID = "session-key-v1";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function openKeyDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(KEY_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) request.result.createObjectStore(KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Stockage cryptographique indisponible."));
  });
}

async function webKey() {
  const database = await openKeyDatabase();
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE, "readonly");
    const request = transaction.objectStore(KEY_STORE).get(KEY_ID);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
    request.onerror = () => reject(request.error);
  });
  if (existing) { database.close(); return existing; }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE, "readwrite");
    transaction.objectStore(KEY_STORE).put(key, KEY_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return key;
}

async function encryptForWeb(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await webKey(), new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptForWeb(value: string) {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Session locale invalide.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await webKey(), base64ToBytes(encrypted));
  return new TextDecoder().decode(decrypted);
}

/** Storage Supabase : Keychain/Keystore en natif, AES-GCM + clé non exportable en IndexedDB sur le Web. */
export const secureSessionStorage = {
  async getItem(key: string) {
    if (Capacitor.isNativePlatform()) return (await NativeSecureSession.get({ key })).value;
    const encrypted = localStorage.getItem(WEB_PREFIX + key);
    if (!encrypted) return null;
    try { return await decryptForWeb(encrypted); } catch { localStorage.removeItem(WEB_PREFIX + key); return null; }
  },
  async setItem(key: string, value: string) {
    if (Capacitor.isNativePlatform()) return NativeSecureSession.set({ key, value });
    localStorage.setItem(WEB_PREFIX + key, await encryptForWeb(value));
  },
  async removeItem(key: string) {
    if (Capacitor.isNativePlatform()) return NativeSecureSession.remove({ key });
    localStorage.removeItem(WEB_PREFIX + key);
  },
};
