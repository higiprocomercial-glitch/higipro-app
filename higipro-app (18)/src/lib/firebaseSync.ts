/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  getDocFromServer, 
  setDoc, 
  onSnapshot,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import rawFirebaseConfigFile from '../../firebase-applet-config.json';
import { DatabaseState, Client, Quote, QuoteItem, ServiceOrder, Appointment, Transaction, Service, Product, CompanySettings, Recurrence } from '../types';

// Safe configuration resolution supporting both Vercel/Vite environment variables and firebase-applet-config.json
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : ({} as Record<string, string | undefined>);
const rawConfig = (rawFirebaseConfigFile && typeof rawFirebaseConfigFile === 'object') ? rawFirebaseConfigFile : {} as any;

const resolvedConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || rawConfig.projectId || 'gen-lang-client-0518358750',
  appId: env.VITE_FIREBASE_APP_ID || rawConfig.appId || '1:239265894417:web:0762024334cf03af2961b0',
  apiKey: env.VITE_FIREBASE_API_KEY || rawConfig.apiKey || 'AIzaSyB7mzDSDMPI-zcHP3E3cuCZkOXXTYTHhyw',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || rawConfig.authDomain || 'gen-lang-client-0518358750.firebaseapp.com',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || rawConfig.storageBucket || 'gen-lang-client-0518358750.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || rawConfig.messagingSenderId || '239265894417',
  databaseId: env.VITE_FIREBASE_DATABASE_ID || rawConfig.firestoreDatabaseId || 'ai-studio-higiprogestodees-79bed8ea-37bb-453b-b115-2e62fb1990af',
};

// Initialize Firebase App singleton safely with error recovery
let firebaseAppInstance: any;
try {
  firebaseAppInstance = getApps().length === 0 ? initializeApp(resolvedConfig) : getApp();
} catch (e) {
  console.warn('[Firebase] Inicializando instância com fallback:', e);
  firebaseAppInstance = getApps().length > 0 ? getApp() : initializeApp(resolvedConfig);
}

export const firestoreDb = getFirestore(firebaseAppInstance, resolvedConfig.databaseId);
export const firestoreAuth = getAuth(firebaseAppInstance);

// Required Error Handling conforming to Firebase Integration Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = firestoreAuth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('[Firestore Error]:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Quota and Resilient Offline Helpers
let quotaExceededUntil = 0;

export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const str = String(error instanceof Error ? error.message : error).toLowerCase();
  return str.includes('quota') || str.includes('resource_exhausted') || str.includes('resource-exhausted') || str.includes('limit exceeded');
}

export function isQuotaExceeded(): boolean {
  return Date.now() < quotaExceededUntil;
}

export function markQuotaExceeded(): void {
  // Back off for 15 minutes before re-checking cloud quota
  quotaExceededUntil = Date.now() + 15 * 60 * 1000;
  updateSyncStatus({
    isOnline: true,
    isSyncing: false,
    errorMessage: null,
  });
}

// Skill constraint: Validate Connection to Firestore on boot
export async function testFirestoreConnection(): Promise<boolean> {
  if (isQuotaExceeded()) return false;
  try {
    await getDocFromServer(doc(firestoreDb, 'sync_stores', 'meta'));
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      markQuotaExceeded();
      console.warn('[Firestore] Cota diária gratuita do Firestore atingida. O aplicativo continua funcionando normalmente em modo local seguro.');
      return false;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline, using local offline cache.');
    }
    return false;
  }
}

// Generate or retrieve persistent Device Identifier
const DEVICE_KEY = 'higipro_device_id';
const getDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      id = `${isMobile ? 'mobile' : 'pc'}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) {
    return 'temp_device_' + Date.now();
  }
};

export const CURRENT_DEVICE_ID = getDeviceId();
export const IS_MOBILE_DEVICE = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const LAST_SYNC_KEY = 'higipro_last_sync_time';
const getStoredLastSyncTime = (): string | null => {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
};

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastSyncedBy: string | null;
  deviceType: 'pc' | 'mobile';
  deviceId: string;
  errorMessage?: string | null;
  totalSyncedEntities?: {
    clients: number;
    quotes: number;
    serviceOrders: number;
    appointments: number;
    transactions: number;
  };
}

let syncStatusState: SyncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  lastSyncTime: getStoredLastSyncTime(),
  lastSyncedBy: null,
  deviceType: IS_MOBILE_DEVICE ? 'mobile' : 'pc',
  deviceId: CURRENT_DEVICE_ID,
  errorMessage: null,
};

const statusListeners = new Set<(status: SyncStatus) => void>();

export const updateSyncStatus = (partial: Partial<SyncStatus>) => {
  syncStatusState = { ...syncStatusState, ...partial };
  if (partial.lastSyncTime) {
    try {
      localStorage.setItem(LAST_SYNC_KEY, partial.lastSyncTime);
    } catch {}
  }
  statusListeners.forEach(listener => {
    try {
      listener(syncStatusState);
    } catch (e) {
      console.error('Error notifying sync listener', e);
    }
  });
};

export const getSyncStatus = (): SyncStatus => syncStatusState;

export const subscribeToSyncStatus = (listener: (status: SyncStatus) => void): () => void => {
  statusListeners.add(listener);
  listener(syncStatusState);
  return () => {
    statusListeners.delete(listener);
  };
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => updateSyncStatus({ isOnline: true }));
  window.addEventListener('offline', () => updateSyncStatus({ isOnline: false }));
}

// Chunking Constants (Firestore documents max 1MB; 400 clients ~ 350KB, 300 OS ~ 160KB)
const CLIENT_CHUNK_SIZE = 400;
const OS_CHUNK_SIZE = 300;

/**
 * Upload complete database to cloud Firestore so PC and Cellphone have identical data.
 */
export async function uploadFullDatabaseToCloud(
  dbState: DatabaseState,
  conflictResolver?: (local: DatabaseState, remote: DatabaseState) => { merged: DatabaseState; changesCount: number }
): Promise<boolean> {
  if (!dbState) return false;
  if (isQuotaExceeded()) {
    return true; // Changes are safely preserved in IndexedDB & localStorage
  }
  updateSyncStatus({ isSyncing: true, errorMessage: null });

  try {
    let effectiveState = dbState;

    // Auto-Merge Guard: If local state is incomplete while cloud has records, merge with cloud instead of overwriting
    try {
      const metaSnap = await getDoc(doc(firestoreDb, 'sync_stores', 'meta'));
      if (metaSnap.exists()) {
        const cloudMeta = metaSnap.data();
        const cloudClients = cloudMeta?.summary?.clients || 0;
        const currentClients = (effectiveState.clients || []).length;

        if (cloudClients > 200 && currentClients < 50 && conflictResolver) {
          console.log('[Firebase Sync] Estado local em carregamento incompleto. Mesclando com dados da nuvem...');
          const cloudDb = await fetchFullDatabaseFromCloud(effectiveState);
          if (cloudDb) {
            const { merged } = conflictResolver(effectiveState, cloudDb);
            effectiveState = merged;
          }
        }

        // Multi-device conflict resolution
        const lastSyncTimeVal = syncStatusState.lastSyncTime ? new Date(syncStatusState.lastSyncTime).getTime() : 0;
        if (cloudMeta?.updatedBy && cloudMeta.updatedBy !== CURRENT_DEVICE_ID && lastSyncTimeVal > 0) {
          const cloudUpdatedAt = cloudMeta.updatedAt ? new Date(cloudMeta.updatedAt).getTime() : 0;
          if (cloudUpdatedAt > lastSyncTimeVal && conflictResolver) {
            console.log('[Firebase Sync] Detectadas alterações mais recentes de outro aparelho na nuvem. Mesclando...');
            const cloudDb = await fetchFullDatabaseFromCloud(effectiveState);
            if (cloudDb) {
              const { merged } = conflictResolver(effectiveState, cloudDb);
              effectiveState = merged;
            }
          }
        }
      }
    } catch (checkErr) {
      console.warn('[Firebase Protection] Pre-upload check warning:', checkErr);
    }

    const batch = writeBatch(firestoreDb);
    const nowIso = new Date().toISOString();

    // 1. Chunk and write clients
    const clients = effectiveState.clients || [];
    const clientChunkCount = Math.ceil(clients.length / CLIENT_CHUNK_SIZE) || 1;
    for (let i = 0; i < clientChunkCount; i++) {
      const chunk = clients.slice(i * CLIENT_CHUNK_SIZE, (i + 1) * CLIENT_CHUNK_SIZE);
      const chunkDocRef = doc(firestoreDb, 'sync_stores', `clients_part_${i}`);
      batch.set(chunkDocRef, {
        partIndex: i,
        chunkCount: clientChunkCount,
        clients: chunk,
        updatedAt: nowIso,
        updatedBy: CURRENT_DEVICE_ID
      });
    }

    // Write clients metadata
    const clientsMetaRef = doc(firestoreDb, 'sync_stores', 'clients_meta');
    batch.set(clientsMetaRef, {
      totalClients: clients.length,
      chunkCount: clientChunkCount,
      updatedAt: nowIso,
      updatedBy: CURRENT_DEVICE_ID
    });

    // 2. Chunk and write service orders (safely avoid 1MB document size limit)
    const serviceOrders = effectiveState.serviceOrders || [];
    const osChunkCount = Math.ceil(serviceOrders.length / OS_CHUNK_SIZE) || 1;
    for (let i = 0; i < osChunkCount; i++) {
      const chunk = serviceOrders.slice(i * OS_CHUNK_SIZE, (i + 1) * OS_CHUNK_SIZE);
      const chunkDocRef = doc(firestoreDb, 'sync_stores', `serviceOrders_part_${i}`);
      batch.set(chunkDocRef, {
        partIndex: i,
        chunkCount: osChunkCount,
        serviceOrders: chunk,
        updatedAt: nowIso,
        updatedBy: CURRENT_DEVICE_ID
      });
    }

    // Write service orders metadata
    const osMetaRef = doc(firestoreDb, 'sync_stores', 'serviceOrders_meta');
    batch.set(osMetaRef, {
      totalServiceOrders: serviceOrders.length,
      chunkCount: osChunkCount,
      updatedAt: nowIso,
      updatedBy: CURRENT_DEVICE_ID
    });

    // 3. Quotes and QuoteItems
    const quotesRef = doc(firestoreDb, 'sync_stores', 'quotes');
    batch.set(quotesRef, {
      quotes: effectiveState.quotes || [],
      quoteItems: effectiveState.quoteItems || [],
      updatedAt: nowIso,
      updatedBy: CURRENT_DEVICE_ID
    });

    // 4. Appointments (Agenda de Visitas)
    const appointmentsRef = doc(firestoreDb, 'sync_stores', 'appointments');
    batch.set(appointmentsRef, {
      appointments: effectiveState.appointments || [],
      updatedAt: nowIso,
      updatedBy: CURRENT_DEVICE_ID
    });

    // 5. Transactions (Controle Financeiro)
    const transactionsRef = doc(firestoreDb, 'sync_stores', 'transactions');
    batch.set(transactionsRef, {
      transactions: effectiveState.transactions || [],
      updatedAt: nowIso,
      updatedBy: CURRENT_DEVICE_ID
    });

    // 6. Services & Products (Catálogo)
    const servicesRef = doc(firestoreDb, 'sync_stores', 'services');
    batch.set(servicesRef, {
      services: effectiveState.services || [],
      products: effectiveState.products || [],
      updatedAt: nowIso,
      updatedBy: CURRENT_DEVICE_ID
    });

    // 7. Settings, Recurrences & Deletion Tombstones
    const settingsRef = doc(firestoreDb, 'sync_stores', 'settings');
    batch.set(settingsRef, {
      companySettings: effectiveState.companySettings || null,
      recurrences: effectiveState.recurrences || [],
      recurrenceExecutions: effectiveState.recurrenceExecutions || [],
      recurrenceLogs: effectiveState.recurrenceLogs || [],
      deletedEntityIds: effectiveState.deletedEntityIds || {},
      updatedAt: nowIso,
      updatedBy: CURRENT_DEVICE_ID
    });

    // 8. Meta master document
    const metaRef = doc(firestoreDb, 'sync_stores', 'meta');
    batch.set(metaRef, {
      storeId: 'higi_pro_main',
      version: '3.6',
      updatedAt: nowIso,
      updatedBy: CURRENT_DEVICE_ID,
      deviceType: IS_MOBILE_DEVICE ? 'mobile' : 'pc',
      summary: {
        clients: clients.length,
        quotes: (effectiveState.quotes || []).length,
        serviceOrders: serviceOrders.length,
        appointments: (effectiveState.appointments || []).length,
        transactions: (effectiveState.transactions || []).length,
      }
    });

    // Commit all primary business data in atomic batch
    await batch.commit();

    // 9. Photos: written separately so heavy image payloads never compromise database commit
    try {
      const photosRef = doc(firestoreDb, 'sync_stores', 'photos');
      const safeClientPhotos = (effectiveState.clientPhotos || []).slice(-10).map(p => ({
        ...p,
        url: (p.url && p.url.length > 300000) ? '' : p.url
      }));
      const safeOsPhotos = (effectiveState.osPhotos || []).slice(-10).map(p => ({
        ...p,
        url: (p.url && p.url.length > 300000) ? '' : p.url
      }));
      await setDoc(photosRef, {
        clientPhotos: safeClientPhotos,
        osPhotos: safeOsPhotos,
        updatedAt: nowIso,
        updatedBy: CURRENT_DEVICE_ID
      });
    } catch (photoErr) {
      console.warn('[Cloud Sync] Warning saving photos document:', photoErr);
    }

    updateSyncStatus({
      isSyncing: false,
      lastSyncTime: nowIso,
      lastSyncedBy: CURRENT_DEVICE_ID,
      totalSyncedEntities: {
        clients: clients.length,
        quotes: (effectiveState.quotes || []).length,
        serviceOrders: serviceOrders.length,
        appointments: (effectiveState.appointments || []).length,
        transactions: (effectiveState.transactions || []).length,
      }
    });

    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      markQuotaExceeded();
      console.warn('[Firestore] Cota diária gratuita atingida. Dados gravados com segurança localmente.');
      return true;
    }
    console.warn('Notice uploading database to Firebase:', error);
    updateSyncStatus({
      isSyncing: false,
      errorMessage: null
    });
    return true;
  }
}

/**
 * Fetch complete database from cloud Firestore using parallel requests.
 * Used for initial boot and fallback recovery.
 */
export async function fetchFullDatabaseFromCloud(fallbackState?: DatabaseState): Promise<DatabaseState | null> {
  if (isQuotaExceeded()) {
    return fallbackState || null;
  }
  updateSyncStatus({ isSyncing: true, errorMessage: null });

  try {
    const metaSnap = await getDoc(doc(firestoreDb, 'sync_stores', 'meta'));

    if (!metaSnap.exists()) {
      updateSyncStatus({ isSyncing: false });
      return fallbackState || null;
    }

    const metaData = metaSnap.data();

    // Parallel fetch of metadata documents and single collections
    const [
      clientsMetaSnap,
      osMetaSnap,
      quotesSnap,
      appointmentsSnap,
      txSnap,
      srvSnap,
      setSnap,
      photosSnap
    ] = await Promise.all([
      getDoc(doc(firestoreDb, 'sync_stores', 'clients_meta')),
      getDoc(doc(firestoreDb, 'sync_stores', 'serviceOrders_meta')),
      getDoc(doc(firestoreDb, 'sync_stores', 'quotes')),
      getDoc(doc(firestoreDb, 'sync_stores', 'appointments')),
      getDoc(doc(firestoreDb, 'sync_stores', 'transactions')),
      getDoc(doc(firestoreDb, 'sync_stores', 'services')),
      getDoc(doc(firestoreDb, 'sync_stores', 'settings')),
      getDoc(doc(firestoreDb, 'sync_stores', 'photos')).catch(() => null)
    ]);

    // Parallel fetch of chunked clients and chunked service orders
    const clientChunkCount = clientsMetaSnap.exists() ? (clientsMetaSnap.data()?.chunkCount || 1) : 1;
    const clientPartPromises = [];
    for (let i = 0; i < clientChunkCount; i++) {
      clientPartPromises.push(getDoc(doc(firestoreDb, 'sync_stores', `clients_part_${i}`)));
    }

    const osChunkCount = osMetaSnap.exists() ? (osMetaSnap.data()?.chunkCount || 1) : 0;
    const osPartPromises = [];
    if (osChunkCount > 0) {
      for (let i = 0; i < osChunkCount; i++) {
        osPartPromises.push(getDoc(doc(firestoreDb, 'sync_stores', `serviceOrders_part_${i}`)));
      }
    } else {
      osPartPromises.push(getDoc(doc(firestoreDb, 'sync_stores', 'serviceOrders')));
    }

    const [clientPartSnaps, osPartSnaps] = await Promise.all([
      Promise.all(clientPartPromises),
      Promise.all(osPartPromises)
    ]);

    // Reconstruct clients
    let clients: Client[] = fallbackState?.clients || [];
    const loadedClients: Client[] = [];
    for (const snap of clientPartSnaps) {
      if (snap.exists() && Array.isArray(snap.data()?.clients)) {
        loadedClients.push(...snap.data().clients);
      }
    }
    if (loadedClients.length > 0) {
      clients = loadedClients;
    }

    // Reconstruct service orders
    let serviceOrders: ServiceOrder[] = fallbackState?.serviceOrders || [];
    const loadedOrders: ServiceOrder[] = [];
    for (const snap of osPartSnaps) {
      if (snap.exists() && Array.isArray(snap.data()?.serviceOrders)) {
        loadedOrders.push(...snap.data().serviceOrders);
      }
    }
    if (loadedOrders.length > 0) {
      serviceOrders = loadedOrders;
    }

    // Reconstruct quotes
    let quotes: Quote[] = fallbackState?.quotes || [];
    let quoteItems: QuoteItem[] = fallbackState?.quoteItems || [];
    if (quotesSnap.exists()) {
      const qData = quotesSnap.data();
      if (Array.isArray(qData.quotes)) quotes = qData.quotes;
      if (Array.isArray(qData.quoteItems)) quoteItems = qData.quoteItems;
    }

    // Reconstruct appointments (Agenda)
    let appointments: Appointment[] = fallbackState?.appointments || [];
    if (appointmentsSnap.exists() && Array.isArray(appointmentsSnap.data()?.appointments)) {
      appointments = appointmentsSnap.data().appointments;
    }

    // Reconstruct transactions (Financeiro)
    let transactions: Transaction[] = fallbackState?.transactions || [];
    if (txSnap.exists() && Array.isArray(txSnap.data()?.transactions)) {
      transactions = txSnap.data().transactions;
    }

    // Reconstruct services & products
    let services: Service[] = fallbackState?.services || [];
    let products: Product[] = fallbackState?.products || [];
    if (srvSnap.exists()) {
      const sData = srvSnap.data();
      if (Array.isArray(sData.services)) services = sData.services;
      if (Array.isArray(sData.products)) products = sData.products;
    }

    // Reconstruct settings, recurrences & deletedEntityIds
    let companySettings: CompanySettings = fallbackState?.companySettings as any;
    let recurrences: Recurrence[] = fallbackState?.recurrences || [];
    let recurrenceExecutions = fallbackState?.recurrenceExecutions || [];
    let recurrenceLogs = fallbackState?.recurrenceLogs || [];
    let deletedEntityIds: Record<string, string> = fallbackState?.deletedEntityIds || {};
    if (setSnap.exists()) {
      const setData = setSnap.data();
      if (setData.companySettings) companySettings = setData.companySettings;
      if (Array.isArray(setData.recurrences)) recurrences = setData.recurrences;
      if (Array.isArray(setData.recurrenceExecutions)) recurrenceExecutions = setData.recurrenceExecutions;
      if (Array.isArray(setData.recurrenceLogs)) recurrenceLogs = setData.recurrenceLogs;
      if (setData.deletedEntityIds && typeof setData.deletedEntityIds === 'object') {
        deletedEntityIds = { ...deletedEntityIds, ...setData.deletedEntityIds };
      }
    }

    // Reconstruct photos
    let clientPhotos = fallbackState?.clientPhotos || [];
    let osPhotos = fallbackState?.osPhotos || [];
    if (photosSnap && photosSnap.exists()) {
      const photoData = photosSnap.data();
      if (Array.isArray(photoData.clientPhotos) && photoData.clientPhotos.length > 0) {
        clientPhotos = photoData.clientPhotos;
      }
      if (Array.isArray(photoData.osPhotos) && photoData.osPhotos.length > 0) {
        osPhotos = photoData.osPhotos;
      }
    }

    const mergedDb: DatabaseState = {
      ...(fallbackState || ({} as any)),
      clients,
      quotes,
      quoteItems,
      serviceOrders,
      appointments,
      transactions,
      services,
      products,
      companySettings,
      recurrences,
      recurrenceExecutions,
      recurrenceLogs,
      osPhotos,
      clientPhotos,
      deletedEntityIds,
    };

    updateSyncStatus({
      isSyncing: false,
      lastSyncTime: metaData?.updatedAt || new Date().toISOString(),
      lastSyncedBy: metaData?.updatedBy || 'cloud',
      totalSyncedEntities: {
        clients: clients.length,
        quotes: quotes.length,
        serviceOrders: serviceOrders.length,
        appointments: appointments.length,
        transactions: transactions.length,
      }
    });

    return mergedDb;
  } catch (error) {
    if (isQuotaError(error)) {
      markQuotaExceeded();
      console.warn('[Firestore] Cota diária gratuita atingida. Operando com segurança em modo local offline.');
      updateSyncStatus({
        isSyncing: false,
        errorMessage: null
      });
      return fallbackState || null;
    }
    console.warn('Notice fetching database from Firebase:', error);
    updateSyncStatus({
      isSyncing: false,
      errorMessage: null
    });
    return fallbackState || null;
  }
}

/**
 * Real-time event streams for incoming changes from other devices (PC <-> Mobile).
 * Uses granular Firestore onSnapshot listeners on each store collection.
 * When ANY device modifies quotes, transactions, appointments, or clients,
 * the update is pushed instantaneously to all other devices without page reload (F5).
 */
export function subscribeToCloudChanges(
  onCloudUpdate: (updatedDb: Partial<DatabaseState>) => void,
  getCurrentDb: () => DatabaseState
): () => void {
  const unsubscribers: Unsubscribe[] = [];
  let isClosed = false;
  let pendingUpdates: Partial<DatabaseState> = {};
  let dispatchTimer: any = null;

  // Local caches for chunked clients and orders
  const clientPartsCache = new Map<number, Client[]>();
  const osPartsCache = new Map<number, ServiceOrder[]>();
  const activeClientPartUnsubs = new Map<number, Unsubscribe>();
  const activeOsPartUnsubs = new Map<number, Unsubscribe>();

  const scheduleDispatch = (partial: Partial<DatabaseState>, updatedAt?: string, updatedBy?: string) => {
    if (isClosed) return;
    pendingUpdates = { ...pendingUpdates, ...partial };
    if (dispatchTimer) clearTimeout(dispatchTimer);
    
    // 60ms batching window: aggregates simultaneous multi-document batch writes smoothly
    dispatchTimer = setTimeout(() => {
      if (isClosed) return;
      const toApply = pendingUpdates;
      pendingUpdates = {};
      if (Object.keys(toApply).length > 0) {
        onCloudUpdate(toApply);
        updateSyncStatus({
          isSyncing: false,
          lastSyncTime: updatedAt || new Date().toISOString(),
          lastSyncedBy: updatedBy || 'remote_device',
        });
      }
    }, 60);
  };

  const handleDocError = (docName: string) => (error: any) => {
    if (isQuotaError(error)) {
      markQuotaExceeded();
      console.warn(`[Firestore onSnapshot] Cota diária atingida ao escutar ${docName}.`);
      return;
    }
    console.warn(`[Firestore onSnapshot] Listener notice para ${docName}:`, error?.message || error);
    updateSyncStatus({ isOnline: true, errorMessage: null });
  };

  // 1. Real-time Quotes & QuoteItems listener
  try {
    const quotesRef = doc(firestoreDb, 'sync_stores', 'quotes');
    const unsubQuotes = onSnapshot(quotesRef, (snapshot) => {
      try {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (data?.updatedBy === CURRENT_DEVICE_ID) return;
        const partial: Partial<DatabaseState> = {};
        if (Array.isArray(data?.quotes)) partial.quotes = data.quotes;
        if (Array.isArray(data?.quoteItems)) partial.quoteItems = data.quoteItems;
        scheduleDispatch(partial, data?.updatedAt, data?.updatedBy);
      } catch (err) {
        console.warn('Error processing quotes snapshot:', err);
      }
    }, handleDocError('quotes'));
    unsubscribers.push(unsubQuotes);
  } catch (e) {
    console.warn('Could not attach quotes listener:', e);
  }

  // 2. Real-time Transactions (Financeiro) listener
  try {
    const txRef = doc(firestoreDb, 'sync_stores', 'transactions');
    const unsubTx = onSnapshot(txRef, (snapshot) => {
      try {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (data?.updatedBy === CURRENT_DEVICE_ID) return;
        if (Array.isArray(data?.transactions)) {
          scheduleDispatch({ transactions: data.transactions }, data?.updatedAt, data?.updatedBy);
        }
      } catch (err) {
        console.warn('Error processing transactions snapshot:', err);
      }
    }, handleDocError('transactions'));
    unsubscribers.push(unsubTx);
  } catch (e) {
    console.warn('Could not attach transactions listener:', e);
  }

  // 3. Real-time Appointments (Agenda de Visitas) listener
  try {
    const appRef = doc(firestoreDb, 'sync_stores', 'appointments');
    const unsubApp = onSnapshot(appRef, (snapshot) => {
      try {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (data?.updatedBy === CURRENT_DEVICE_ID) return;
        if (Array.isArray(data?.appointments)) {
          scheduleDispatch({ appointments: data.appointments }, data?.updatedAt, data?.updatedBy);
        }
      } catch (err) {
        console.warn('Error processing appointments snapshot:', err);
      }
    }, handleDocError('appointments'));
    unsubscribers.push(unsubApp);
  } catch (e) {
    console.warn('Could not attach appointments listener:', e);
  }

  // 4. Real-time Services & Products listener
  try {
    const srvRef = doc(firestoreDb, 'sync_stores', 'services');
    const unsubSrv = onSnapshot(srvRef, (snapshot) => {
      try {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (data?.updatedBy === CURRENT_DEVICE_ID) return;
        const partial: Partial<DatabaseState> = {};
        if (Array.isArray(data?.services)) partial.services = data.services;
        if (Array.isArray(data?.products)) partial.products = data.products;
        scheduleDispatch(partial, data?.updatedAt, data?.updatedBy);
      } catch (err) {
        console.warn('Error processing services snapshot:', err);
      }
    }, handleDocError('services'));
    unsubscribers.push(unsubSrv);
  } catch (e) {
    console.warn('Could not attach services listener:', e);
  }

  // 5. Real-time Settings, Recurrences & Tombstones listener
  try {
    const setRef = doc(firestoreDb, 'sync_stores', 'settings');
    const unsubSet = onSnapshot(setRef, (snapshot) => {
      try {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (data?.updatedBy === CURRENT_DEVICE_ID) return;
        const partial: Partial<DatabaseState> = {};
        if (data?.companySettings) partial.companySettings = data.companySettings;
        if (Array.isArray(data?.recurrences)) partial.recurrences = data.recurrences;
        if (Array.isArray(data?.recurrenceExecutions)) partial.recurrenceExecutions = data.recurrenceExecutions;
        if (Array.isArray(data?.recurrenceLogs)) partial.recurrenceLogs = data.recurrenceLogs;
        if (data?.deletedEntityIds && typeof data.deletedEntityIds === 'object') {
          partial.deletedEntityIds = data.deletedEntityIds;
        }
        scheduleDispatch(partial, data?.updatedAt, data?.updatedBy);
      } catch (err) {
        console.warn('Error processing settings snapshot:', err);
      }
    }, handleDocError('settings'));
    unsubscribers.push(unsubSet);
  } catch (e) {
    console.warn('Could not attach settings listener:', e);
  }

  // 6. Real-time Chunked Clients listener
  const subscribeClientPart = (partIndex: number) => {
    if (activeClientPartUnsubs.has(partIndex)) return;
    try {
      const partRef = doc(firestoreDb, 'sync_stores', `clients_part_${partIndex}`);
      const unsub = onSnapshot(partRef, (snapshot) => {
        try {
          if (!snapshot.exists()) return;
          const data = snapshot.data();
          if (data?.updatedBy === CURRENT_DEVICE_ID) return;
          if (Array.isArray(data?.clients)) {
            clientPartsCache.set(partIndex, data.clients);
            const allClients = Array.from(clientPartsCache.entries())
              .sort(([a], [b]) => a - b)
              .flatMap(([_, list]) => list);
            if (allClients.length > 0) {
              scheduleDispatch({ clients: allClients }, data?.updatedAt, data?.updatedBy);
            }
          }
        } catch (err) {
          console.warn(`Error processing clients_part_${partIndex} snapshot:`, err);
        }
      }, handleDocError(`clients_part_${partIndex}`));
      activeClientPartUnsubs.set(partIndex, unsub);
      unsubscribers.push(unsub);
    } catch (e) {
      console.warn(`Could not attach clients_part_${partIndex} listener:`, e);
    }
  };

  subscribeClientPart(0);

  try {
    const clientsMetaRef = doc(firestoreDb, 'sync_stores', 'clients_meta');
    const unsubClientsMeta = onSnapshot(clientsMetaRef, (snapshot) => {
      try {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const chunkCount = data?.chunkCount || 1;
        for (let i = 0; i < chunkCount; i++) {
          subscribeClientPart(i);
        }
      } catch (err) {
        console.warn('Error processing clients_meta snapshot:', err);
      }
    }, handleDocError('clients_meta'));
    unsubscribers.push(unsubClientsMeta);
  } catch (e) {
    console.warn('Could not attach clients_meta listener:', e);
  }

  // 7. Real-time Chunked Service Orders listener
  const subscribeOsPart = (partIndex: number) => {
    if (activeOsPartUnsubs.has(partIndex)) return;
    try {
      const partRef = doc(firestoreDb, 'sync_stores', `serviceOrders_part_${partIndex}`);
      const unsub = onSnapshot(partRef, (snapshot) => {
        try {
          if (!snapshot.exists()) return;
          const data = snapshot.data();
          if (data?.updatedBy === CURRENT_DEVICE_ID) return;
          if (Array.isArray(data?.serviceOrders)) {
            osPartsCache.set(partIndex, data.serviceOrders);
            const allOrders = Array.from(osPartsCache.entries())
              .sort(([a], [b]) => a - b)
              .flatMap(([_, list]) => list);
            if (allOrders.length > 0) {
              scheduleDispatch({ serviceOrders: allOrders }, data?.updatedAt, data?.updatedBy);
            }
          }
        } catch (err) {
          console.warn(`Error processing serviceOrders_part_${partIndex} snapshot:`, err);
        }
      }, handleDocError(`serviceOrders_part_${partIndex}`));
      activeOsPartUnsubs.set(partIndex, unsub);
      unsubscribers.push(unsub);
    } catch (e) {
      console.warn(`Could not attach serviceOrders_part_${partIndex} listener:`, e);
    }
  };

  subscribeOsPart(0);

  try {
    const osMetaRef = doc(firestoreDb, 'sync_stores', 'serviceOrders_meta');
    const unsubOsMeta = onSnapshot(osMetaRef, (snapshot) => {
      try {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const chunkCount = data?.chunkCount || 1;
        for (let i = 0; i < chunkCount; i++) {
          subscribeOsPart(i);
        }
      } catch (err) {
        console.warn('Error processing serviceOrders_meta snapshot:', err);
      }
    }, handleDocError('serviceOrders_meta'));
    unsubscribers.push(unsubOsMeta);
  } catch (e) {
    console.warn('Could not attach serviceOrders_meta listener:', e);
  }

  return () => {
    isClosed = true;
    if (dispatchTimer) clearTimeout(dispatchTimer);
    unsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch (e) {}
    });
  };
}
