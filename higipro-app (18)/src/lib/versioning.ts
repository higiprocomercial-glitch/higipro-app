/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseState, VersionedEntity } from '../types';

/**
 * Safely parses any date string (ISO, YYYY-MM-DD, etc.) into an epoch timestamp in milliseconds.
 * Priority: updated_at > created_at > enviado_em > data
 * Returns 0 if invalid or empty.
 */
export function parseEntityTimestamp(
  entity?: { updated_at?: string; created_at?: string; data?: string; enviado_em?: string } | null
): number {
  if (!entity) return 0;
  const raw = entity.updated_at || entity.created_at || entity.enviado_em || entity.data;
  if (!raw) return 0;

  try {
    const parsed = new Date(raw).getTime();
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

/**
 * Strips transient metadata (updated_at, version, _temp) and orders keys deterministically
 * to compare significant business payload.
 */
function getComparablePayload(entity: any): string {
  if (!entity || typeof entity !== 'object') return '';
  const sortedKeys = Object.keys(entity).sort();
  const clean: Record<string, any> = {};
  for (const k of sortedKeys) {
    if (k === 'updated_at' || k === 'version' || k === '_temp') continue;
    clean[k] = entity[k];
  }
  return JSON.stringify(clean);
}

/**
 * Checks if two entities differ in their business fields (excluding timestamps/version).
 */
export function isEntityChanged(a: any, b: any): boolean {
  if (!a || !b) return true;
  return getComparablePayload(a) !== getComparablePayload(b);
}

/**
 * Explicitly stamps an entity with the current timestamp and increments its version.
 */
export function stampEntity<T extends VersionedEntity>(entity: T, prev?: T): T {
  const nowIso = new Date().toISOString();
  const nextVersion = Math.max((prev?.version || entity.version || 0) + 1, 1);
  return {
    ...entity,
    created_at: entity.created_at || prev?.created_at || nowIso,
    updated_at: nowIso,
    version: nextVersion,
  };
}

/**
 * Resolves conflict between an existing local entity and an incoming remote entity with the same ID.
 * Follows Last-Write-Wins (LWW) prioritizing the most recent updated_at timestamp, followed by version counter.
 */
export function resolveEntityWinner<T extends VersionedEntity>(
  existing: T,
  incoming: T
): { winner: T; isUpdated: boolean } {
  // DOMAIN PROTECTION FOR FINANCIAL DATA & PAYMENTS:
  // Never downgrade a paid entity to pending or reduce an OS paid amount during sync merge
  const existingAny = existing as any;
  const incomingAny = incoming as any;

  // Protect Service Order payments: amount paid should never decrease
  if (typeof existingAny.pago === 'number' && typeof incomingAny.pago === 'number') {
    const maxPaid = Math.max(existingAny.pago || 0, incomingAny.pago || 0);
    existingAny.pago = maxPaid;
    incomingAny.pago = maxPaid;
    if (existingAny.total && maxPaid >= existingAny.total) {
      existingAny.status = 'concluido';
      incomingAny.status = 'concluido';
    }
  }

  // Protect Transaction status: if either existing or incoming was marked 'pago', it must remain 'pago'
  if (existingAny.status === 'pago' && incomingAny.status === 'pendente') {
    return {
      winner: {
        ...incoming,
        ...existing,
        status: 'pago',
        version: Math.max(existing.version || 1, incoming.version || 1) + 1,
        updated_at: existing.updated_at || new Date().toISOString(),
      },
      isUpdated: false,
    };
  }
  if (incomingAny.status === 'pago' && existingAny.status === 'pendente') {
    return {
      winner: {
        ...existing,
        ...incoming,
        status: 'pago',
        version: Math.max(existing.version || 1, incoming.version || 1) + 1,
        updated_at: incoming.updated_at || new Date().toISOString(),
      },
      isUpdated: true,
    };
  }

  // If identical business data, no conflict
  if (!isEntityChanged(existing, incoming)) {
    const maxVer = Math.max(existing.version || 1, incoming.version || 1);
    const maxTime = Math.max(parseEntityTimestamp(existing), parseEntityTimestamp(incoming));
    return {
      winner: {
        ...existing,
        version: maxVer,
        updated_at: maxTime > 0 ? new Date(maxTime).toISOString() : (existing.updated_at || incoming.updated_at),
      },
      isUpdated: false,
    };
  }

  const existingTime = parseEntityTimestamp(existing);
  const incomingTime = parseEntityTimestamp(incoming);
  const existingVer = existing.version || 1;
  const incomingVer = incoming.version || 1;

  // Rule 1: Decisive timestamp difference (> 1000ms takes priority, resolves most concurrent edits)
  if (incomingTime - existingTime > 1000) {
    return {
      winner: {
        ...existing,
        ...incoming,
        version: Math.max(incomingVer, existingVer + 1),
        updated_at: incoming.updated_at || new Date().toISOString(),
      },
      isUpdated: true,
    };
  }

  if (existingTime - incomingTime > 1000) {
    return {
      winner: existing,
      isUpdated: false,
    };
  }

  // Rule 2: If timestamps are close (within 1s or equal), version counter determines the winner
  if (incomingVer > existingVer) {
    return {
      winner: {
        ...existing,
        ...incoming,
        version: incomingVer,
        updated_at: incoming.updated_at || new Date().toISOString(),
      },
      isUpdated: true,
    };
  }

  if (existingVer > incomingVer) {
    return {
      winner: existing,
      isUpdated: false,
    };
  }

  // Rule 3: Tie breaker on version: use strict timestamp
  if (incomingTime > existingTime) {
    return {
      winner: {
        ...existing,
        ...incoming,
        version: Math.max(incomingVer, existingVer + 1),
        updated_at: incoming.updated_at || new Date().toISOString(),
      },
      isUpdated: true,
    };
  }

  if (existingTime > incomingTime) {
    return {
      winner: existing,
      isUpdated: false,
    };
  }

  // Rule 4: Tied version and tied timestamp, but different content:
  // Non-destructive field merge: incoming non-empty fields take precedence,
  // but existing non-empty fields are preserved if incoming is undefined/null/empty.
  const merged: any = { ...existing };
  let hasFieldChange = false;
  for (const key of Object.keys(incoming)) {
    const incVal = (incoming as any)[key];
    const exVal = (existing as any)[key];
    if (incVal !== undefined && incVal !== null && incVal !== '') {
      if (JSON.stringify(incVal) !== JSON.stringify(exVal)) {
        merged[key] = incVal;
        hasFieldChange = true;
      }
    }
  }

  if (hasFieldChange) {
    merged.version = Math.max(existingVer, incomingVer) + 1;
    merged.updated_at = new Date().toISOString();
  }

  return {
    winner: merged,
    isUpdated: hasFieldChange,
  };
}

/**
 * Checks if an entity has been deleted based on tombstones.
 */
export function isEntityTombstoned(
  entity: VersionedEntity,
  tombstones?: Record<string, string>
): boolean {
  if (!entity || !entity.id || !tombstones) return false;
  const delTimeStr = tombstones[entity.id];
  if (!delTimeStr) return false;
  const delTime = new Date(delTimeStr).getTime();
  const entityTime = parseEntityTimestamp(entity);
  // If the entity was modified strictly AFTER the deletion timestamp, it survives
  return entityTime <= delTime;
}

/**
 * Scans all collections in DatabaseState, detecting modified or newly added entities,
 * and automatically sets/increments updated_at and version.
 * Detects deleted records and maintains tombstones.
 */
export function autoStampDatabaseState(
  currentState: DatabaseState,
  previousState?: DatabaseState | null
): DatabaseState {
  if (!currentState) return currentState;

  const nowIso = new Date().toISOString();
  const deletedEntityIds: Record<string, string> = {
    ...(previousState?.deletedEntityIds || {}),
    ...(currentState?.deletedEntityIds || {}),
  };

  const stampList = <T extends VersionedEntity>(
    currentList?: T[],
    previousList?: T[]
  ): T[] => {
    if (!Array.isArray(currentList)) return [];

    const prevMap = new Map<string, T>();
    const hasPreviousList = Array.isArray(previousList) && previousList.length > 0;
    if (hasPreviousList) {
      previousList!.forEach(item => {
        if (item?.id) prevMap.set(item.id, item);
      });
    }

    const currentMap = new Map<string, T>();
    currentList.forEach(item => {
      if (item?.id) currentMap.set(item.id, item);
    });

    // Detect deletions from previousList to track tombstones
    if (hasPreviousList) {
      previousList!.forEach(prevItem => {
        if (prevItem?.id && !currentMap.has(prevItem.id)) {
          deletedEntityIds[prevItem.id] = nowIso;
        }
      });
    }

    return currentList.map(item => {
      if (!item || !item.id) return item;

      // Entity is alive in currentList: clear tombstone if any
      if (deletedEntityIds[item.id]) {
        delete deletedEntityIds[item.id];
      }

      // If no previousList was provided at all (baseline boot mode), only fill missing baseline fields
      if (!hasPreviousList) {
        if (!item.updated_at || !item.version) {
          return {
            ...item,
            created_at: item.created_at || nowIso,
            updated_at: item.updated_at || item.created_at || nowIso,
            version: item.version || 1,
          };
        }
        return item;
      }

      const prev = prevMap.get(item.id);

      // Case 1: Brand new entity added during this session
      if (!prev) {
        return {
          ...item,
          created_at: item.created_at || nowIso,
          updated_at: nowIso,
          version: item.version || 1,
        };
      }

      // Case 2: Entity modified compared to previous state
      if (isEntityChanged(prev, item)) {
        return {
          ...item,
          created_at: item.created_at || prev.created_at || nowIso,
          updated_at: nowIso,
          version: Math.max(prev.version || 1, item.version || 1) + 1,
        };
      }

      // Case 3: Entity unchanged, ensure baseline timestamp and version exist
      if (!item.updated_at || !item.version) {
        return {
          ...item,
          created_at: item.created_at || prev.created_at || nowIso,
          updated_at: item.updated_at || prev.updated_at || item.created_at || nowIso,
          version: item.version || prev.version || 1,
        };
      }

      return item;
    });
  };

  const stampedClients = stampList(currentState.clients, previousState?.clients);
  const stampedQuotes = stampList(currentState.quotes, previousState?.quotes);
  const stampedQuoteItems = stampList(currentState.quoteItems, previousState?.quoteItems);
  const stampedServiceOrders = stampList(currentState.serviceOrders, previousState?.serviceOrders);
  const stampedAppointments = stampList(currentState.appointments, previousState?.appointments);
  const stampedTransactions = stampList(currentState.transactions, previousState?.transactions);
  const stampedServices = stampList(currentState.services, previousState?.services);
  const stampedProducts = stampList(currentState.products, previousState?.products);
  const stampedRecurrences = stampList(currentState.recurrences, previousState?.recurrences);
  const stampedRecurrenceExecutions = stampList(currentState.recurrenceExecutions, previousState?.recurrenceExecutions);
  const stampedRecurrenceLogs = stampList(currentState.recurrenceLogs, previousState?.recurrenceLogs);
  const stampedClientPhotos = stampList(currentState.clientPhotos, previousState?.clientPhotos);
  const stampedOsPhotos = stampList(currentState.osPhotos, previousState?.osPhotos);

  // Handle CompanySettings
  let stampedSettings = currentState.companySettings;
  if (stampedSettings) {
    const prevSettings = previousState?.companySettings;
    if (!prevSettings) {
      stampedSettings = {
        ...stampedSettings,
        updated_at: stampedSettings.updated_at || nowIso,
        version: stampedSettings.version || 1,
      };
    } else if (isEntityChanged(prevSettings, stampedSettings)) {
      stampedSettings = {
        ...stampedSettings,
        updated_at: nowIso,
        version: Math.max(prevSettings.version || 1, stampedSettings.version || 1) + 1,
      };
    }
  }

  // Cap tombstones to latest 500 to keep memory tiny
  const tombstoneEntries = Object.entries(deletedEntityIds);
  let finalTombstones = deletedEntityIds;
  if (tombstoneEntries.length > 500) {
    tombstoneEntries.sort((a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime());
    finalTombstones = Object.fromEntries(tombstoneEntries.slice(0, 500));
  }

  return {
    ...currentState,
    clients: stampedClients,
    quotes: stampedQuotes,
    quoteItems: stampedQuoteItems,
    serviceOrders: stampedServiceOrders,
    appointments: stampedAppointments,
    transactions: stampedTransactions,
    services: stampedServices,
    products: stampedProducts,
    recurrences: stampedRecurrences,
    recurrenceExecutions: stampedRecurrenceExecutions,
    recurrenceLogs: stampedRecurrenceLogs,
    clientPhotos: stampedClientPhotos,
    osPhotos: stampedOsPhotos,
    companySettings: stampedSettings,
    deletedEntityIds: finalTombstones,
  };
}
