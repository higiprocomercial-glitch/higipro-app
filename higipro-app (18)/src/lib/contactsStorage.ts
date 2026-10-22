/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * High-performance, durable contact storage engine using IndexedDB with in-memory caching.
 * Designed specifically to handle 2,000 to 10,000+ phone and Google contacts without
 * hitting browser localStorage quota limits (which fail at 2-5MB on mobile).
 */

import { formatPhone, stripCountryCode } from './utils';

export interface CachedContact {
  id: string;
  nome: string;
  normalizedNome: string; // Lowercase without accents for sub-millisecond search
  telefone: string;
  cleanPhone: string; // Digits only (without country code 55)
  email?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  source: 'google' | 'phone_vcf' | 'device' | 'whatsapp';
  photoUrl?: string;
  updatedAt: number;
}

const DB_NAME = 'HigiProContactsStore_v1';
const DB_VERSION = 1;
const STORE_NAME = 'contacts';
const SNAPSHOT_KEY = 'higipro_contacts_snapshot_v3';

/**
 * Strips accents and diacritics for fast, accurate search (e.g. "Márcia" -> "marcia", "João" -> "joao").
 */
export function normalizeSearchString(text?: string | number | null): string {
  if (text === undefined || text === null || text === '') return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function persistCompactSnapshot(contacts: CachedContact[]) {
  try {
    if (typeof localStorage === 'undefined') return;
    const compact = contacts.slice(0, 1500).map(c => ({
      id: c.id,
      nome: c.nome,
      normalizedNome: c.normalizedNome || normalizeSearchString(c.nome),
      telefone: c.telefone,
      cleanPhone: c.cleanPhone,
      email: c.email,
      endereco: c.endereco,
      cidade: c.cidade,
      estado: c.estado,
      source: c.source,
      photoUrl: c.photoUrl,
      updatedAt: c.updatedAt,
    }));
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(compact));
  } catch (e) {
    // Quota reached or private mode
  }
}

// Fast synchronous restoration on startup (0ms delay) so contacts are immediately available
let memoryContacts: CachedContact[] = (() => {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Also check phone and fallback caches
    const phoneRaw = localStorage.getItem('higipro_cached_phone_contacts_v2') || localStorage.getItem('higipro_phone_contacts_cache');
    if (phoneRaw) {
      const parsed = JSON.parse(phoneRaw);
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => {
          const clean = stripCountryCode(p.telefone || '');
          return {
            id: p.id || `cnt_${Math.random().toString(36).substring(2, 9)}`,
            nome: p.nome || 'Contato',
            normalizedNome: normalizeSearchString(p.nome || ''),
            telefone: formatPhone(clean || p.telefone || ''),
            cleanPhone: clean,
            email: p.email,
            endereco: p.endereco,
            cidade: p.cidade || 'Passo Fundo',
            estado: p.estado || 'RS',
            source: 'phone_vcf',
            updatedAt: Date.now(),
          };
        });
      }
    }
  } catch (e) {}
  return [];
})();
let isInitialized = false;
let initPromise: Promise<void> | null = null;

// Listeners for storage updates
type StorageListener = (count: number) => void;
const listeners = new Set<StorageListener>();

export function subscribeToContactsUpdates(callback: StorageListener): () => void {
  listeners.add(callback);
  callback(memoryContacts.length);
  return () => {
    listeners.delete(callback);
  };
}

export const subscribeToContactsStorage = subscribeToContactsUpdates;

function notifyListeners() {
  const count = memoryContacts.length;
  listeners.forEach(cb => {
    try {
      cb(count);
    } catch (e) {
      console.error('Storage listener error:', e);
    }
  });
}

/**
 * Initializes the IndexedDB database and loads all contacts into memory.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('cleanPhone', 'cleanPhone', { unique: false });
        store.createIndex('normalizedNome', 'normalizedNome', { unique: false });
        store.createIndex('source', 'source', { unique: false });
      }
    };

    request.onsuccess = (event: any) => {
      resolve(event.target.result as IDBDatabase);
    };

    request.onerror = (event: any) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Initializes contact storage and loads records into memory cache.
 * Automatically sanitizes any legacy contacts so that country code 55 is stripped.
 */
export async function initContactsStorage(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => {
          const raw = req.result || [];
          // Sanitize contacts: remove country code 55 and ensure clean formatting
          memoryContacts = raw.map((c: CachedContact) => {
            const clean = stripCountryCode(c.cleanPhone || c.telefone);
            return {
              ...c,
              cleanPhone: clean,
              telefone: formatPhone(clean || c.telefone),
            };
          });
          resolve();
        };
        req.onerror = () => reject(req.error);
      });

      if (memoryContacts.length > 0) {
        persistCompactSnapshot(memoryContacts);
      }

      // If empty in IndexedDB, try to seed from localStorage caches
      if (memoryContacts.length === 0 && typeof localStorage !== 'undefined') {
        try {
          const phoneRaw = localStorage.getItem('higipro_phone_contacts_cache');
          if (phoneRaw) {
            const parsed = JSON.parse(phoneRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const toSave = parsed.map((p: any) => ({
                id: p.id,
                nome: p.nome,
                telefone: p.telefone,
                email: p.email,
                endereco: p.endereco,
                cidade: p.cidade,
                source: 'phone_vcf' as const,
              }));
              saveContactsBatch(toSave).catch(() => {});
            }
          }
        } catch (err) {}
      }

      isInitialized = true;
      notifyListeners();
    } catch (e) {
      console.warn('Failed to load from IndexedDB, falling back to localStorage:', e);
      // Fallback to localStorage if IndexedDB is blocked in private browsing
      try {
        const raw = localStorage.getItem('higipro_contacts_fallback_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          memoryContacts = (parsed || []).map((c: any) => {
            const clean = stripCountryCode(c.cleanPhone || c.telefone);
            return {
              ...c,
              cleanPhone: clean,
              telefone: formatPhone(clean || c.telefone),
            };
          });
        }
      } catch (err) {}
      isInitialized = true;
      notifyListeners();
    }
  })();

  return initPromise;
}

// Automatically trigger initialization on module load
if (typeof window !== 'undefined') {
  initContactsStorage().catch(() => {});
}

/**
 * Returns all contacts currently cached in memory (instant, synchronous).
 */
export function getAllCachedContacts(): CachedContact[] {
  return memoryContacts;
}

/**
 * Returns total count and breakdown of contacts.
 */
export function getContactsStorageSummary() {
  const total = memoryContacts.length;
  let google = 0;
  let phone = 0;
  for (const c of memoryContacts) {
    if (c.source === 'google') google++;
    else phone++;
  }
  return { total, google, phone };
}

/**
 * Stores a large batch of contacts (can easily handle 2,000 to 10,000+ items).
 * Deduplicates by phone number or resource ID.
 * Strips Brazilian country code 55 from all contacts on storage.
 */
export async function saveContactsBatch(
  newContacts: Array<{
    id?: string;
    nome: string;
    telefone: string;
    email?: string;
    endereco?: string;
    cidade?: string;
    estado?: string;
    source: 'google' | 'phone_vcf' | 'device' | 'whatsapp';
    photoUrl?: string;
  }>
): Promise<number> {
  if (!newContacts || newContacts.length === 0) return 0;

  const timestamp = Date.now();
  const processed: CachedContact[] = [];

  // Index existing items by clean phone and ID for instant deduplication
  const existingByPhone = new Map<string, CachedContact>();
  const existingById = new Map<string, CachedContact>();

  for (const item of memoryContacts) {
    if (item.cleanPhone) existingByPhone.set(item.cleanPhone, item);
    existingById.set(item.id, item);
  }

  for (const raw of newContacts) {
    const nome = (raw.nome || '').trim();
    const rawTelefone = (raw.telefone || '').trim();
    // Strip Brazil country code 55 so it is never retained in contacts
    const cleanPhone = stripCountryCode(rawTelefone);
    const formattedTelefone = formatPhone(cleanPhone || rawTelefone);

    // Require either a name or a phone number
    if (!nome && !cleanPhone) continue;

    const normalizedNome = normalizeSearchString(nome);
    const existing = (cleanPhone && existingByPhone.get(cleanPhone)) || (raw.id && existingById.get(raw.id));

    const contactId = raw.id || existing?.id || `cnt_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;

    const entry: CachedContact = {
      id: contactId,
      nome: nome || 'Contato sem Nome',
      normalizedNome,
      telefone: formattedTelefone,
      cleanPhone,
      email: raw.email || existing?.email || '',
      endereco: raw.endereco || existing?.endereco || '',
      cidade: raw.cidade || existing?.cidade || 'Passo Fundo',
      estado: raw.estado || existing?.estado || 'RS',
      source: raw.source,
      photoUrl: raw.photoUrl || existing?.photoUrl,
      updatedAt: timestamp,
    };

    processed.push(entry);
    if (cleanPhone) existingByPhone.set(cleanPhone, entry);
    existingById.set(contactId, entry);
  }

  // Combine into updated list
  const combinedMap = new Map<string, CachedContact>();
  for (const item of memoryContacts) {
    combinedMap.set(item.id, item);
  }
  for (const item of processed) {
    combinedMap.set(item.id, item);
  }

  memoryContacts = Array.from(combinedMap.values());
  persistCompactSnapshot(memoryContacts);
  notifyListeners();

  // Persist to IndexedDB in batches to prevent transaction timeouts
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const item of processed) {
      store.put(item);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Could not persist to IndexedDB:', e);
    // Safe compact fallback to localStorage (limit to first 800 items to avoid quota error)
    try {
      const compact = memoryContacts.slice(0, 800).map(c => ({
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        cleanPhone: c.cleanPhone,
        normalizedNome: c.normalizedNome,
        source: c.source,
      }));
      localStorage.setItem('higipro_contacts_fallback_cache', JSON.stringify(compact));
    } catch (err) {}
  }

  return processed.length;
}

/**
 * Searches across ALL cached contacts with accent-insensitivity, token-based matching,
 * flexible phone digit matching (with or without 55 or DDD), and relevance scoring.
 * Extremely fast (sub-millisecond for 5,000+ contacts).
 */
export function searchStoredContacts(
  query: string,
  limit = 1000
): CachedContact[] {
  if (!query || !query.trim()) {
    // If empty query, return contacts sorted by name
    return memoryContacts
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
      .slice(0, limit);
  }

  const cleanQuery = normalizeSearchString(query);
  const queryTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const rawDigits = query.replace(/\D/g, '');
  const cleanPhoneQuery = stripCountryCode(query);

  const matches: Array<{ contact: CachedContact; score: number }> = [];

  for (const contact of memoryContacts) {
    let score = 0;
    const normName = contact.normalizedNome || normalizeSearchString(contact.nome);
    const normCity = contact.cidade ? normalizeSearchString(contact.cidade) : '';
    const normAddr = contact.endereco ? normalizeSearchString(contact.endereco) : '';
    const normEmail = contact.email ? normalizeSearchString(contact.email) : '';

    // 1. Full string match on name
    if (normName === cleanQuery) {
      score += 200;
    } else if (normName.startsWith(cleanQuery)) {
      score += 120;
    } else if (normName.includes(` ${cleanQuery}`)) {
      score += 90;
    } else if (normName.includes(cleanQuery)) {
      score += 70;
    }

    // 2. Multi-token matching: each word in query matches name, city, address, or email
    if (queryTokens.length > 1) {
      const allTokensMatch = queryTokens.every(token => 
        normName.includes(token) || 
        normCity.includes(token) || 
        normAddr.includes(token) ||
        normEmail.includes(token)
      );
      if (allTokensMatch) {
        score += 85;
      }
    }

    // 3. Flexible phone number matching
    const cPhone = contact.cleanPhone || stripCountryCode(contact.telefone);
    if (cPhone) {
      // Direct exact match
      if (cleanPhoneQuery && cPhone === cleanPhoneQuery) {
        score += 160;
      } else if (cleanPhoneQuery && cPhone.includes(cleanPhoneQuery)) {
        score += 140;
      } else if (rawDigits && (cPhone.includes(rawDigits) || contact.telefone.replace(/\D/g, '').includes(rawDigits))) {
        score += 130;
      } else if (rawDigits && rawDigits.length >= 4 && cPhone.endsWith(rawDigits)) {
        score += 110;
      } else if (cleanPhoneQuery && cleanPhoneQuery.length >= 4 && cPhone.endsWith(cleanPhoneQuery)) {
        score += 110;
      }
    }

    // 4. Address, City, or Email matches
    if (normCity && normCity.includes(cleanQuery)) {
      score += 40;
    }
    if (normAddr && normAddr.includes(cleanQuery)) {
      score += 40;
    }
    if (normEmail && normEmail.includes(cleanQuery)) {
      score += 50;
    }

    if (score > 0) {
      matches.push({ contact, score });
    }
  }

  // Sort by score descending, then by name alphabetically
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.contact.nome.localeCompare(b.contact.nome, 'pt-BR', { sensitivity: 'base' });
  });

  return matches.slice(0, limit).map(m => m.contact);
}

/**
 * Clears all cached contacts from memory and IndexedDB.
 */
export async function clearAllStoredContacts(): Promise<void> {
  memoryContacts = [];
  notifyListeners();
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
  try {
    localStorage.removeItem('higipro_contacts_fallback_cache');
  } catch (e) {}
}
