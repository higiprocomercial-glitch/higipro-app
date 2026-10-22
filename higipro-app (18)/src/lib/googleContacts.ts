/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, ClientOrigin } from '../types';
import { generateId } from './database';
import { formatPhone, stripCountryCode } from './utils';
import {
  saveContactsBatch,
  searchStoredContacts,
  getAllCachedContacts,
  normalizeSearchString,
  getContactsStorageSummary,
  CachedContact,
} from './contactsStorage';

export interface GoogleContactPerson {
  resourceName?: string;
  etag?: string;
  names?: Array<{
    displayName?: string;
    familyName?: string;
    givenName?: string;
    displayNameLastFirst?: string;
  }>;
  phoneNumbers?: Array<{
    value?: string;
    type?: string;
    canonicalForm?: string;
    formattedType?: string;
  }>;
  emailAddresses?: Array<{
    value?: string;
    type?: string;
    formattedType?: string;
  }>;
  addresses?: Array<{
    formattedValue?: string;
    streetAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    type?: string;
  }>;
  nicknames?: Array<{
    value?: string;
  }>;
  biographies?: Array<{
    value?: string;
    contentType?: string;
  }>;
  photos?: Array<{
    url?: string;
    default?: boolean;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
  }>;
}

export interface GoogleContactItem {
  id: string;
  resourceName: string;
  etag?: string;
  name: string;
  phone: string;
  rawPhone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  notes: string;
  photoUrl?: string;
  organization?: string;
  isExistingInHigiPro?: boolean;
  matchedClientId?: string;
}

// Convert Google People API person into a standardized GoogleContactItem
export const parseGooglePerson = (
  person: GoogleContactPerson,
  existingClients: Client[] = []
): GoogleContactItem => {
  const resourceName = person.resourceName || '';
  const etag = person.etag;

  // Name
  const name =
    person.names?.[0]?.displayName ||
    `${person.names?.[0]?.givenName || ''} ${person.names?.[0]?.familyName || ''}`.trim() ||
    person.organizations?.[0]?.name ||
    person.nicknames?.[0]?.value ||
    (person.emailAddresses?.[0]?.value ? person.emailAddresses[0].value.split('@')[0] : '') ||
    'Contato Sem Nome';

  // Primary Phone: find the best available phone number (prefer mobile, or first valid)
  const phoneList = person.phoneNumbers || [];
  const mobilePhone = phoneList.find(p => {
    const t = (p.type || p.formattedType || '').toLowerCase();
    return t.includes('cel') || t.includes('mob') || t.includes('móv') || t === 'mobile';
  });
  const primaryPhoneObj = mobilePhone || phoneList.find(p => p.value && p.value.trim().length > 0) || phoneList[0];
  const rawPhone = primaryPhoneObj?.value || '';
  const cleanPhone = stripCountryCode(rawPhone);
  const formattedPhone = formatPhone(cleanPhone || rawPhone);

  // Email
  const email = person.emailAddresses?.[0]?.value || '';

  // Address
  const primaryAddr = person.addresses?.[0];
  const address = primaryAddr?.streetAddress || primaryAddr?.formattedValue || '';
  const city = primaryAddr?.city || 'Passo Fundo';
  const state = primaryAddr?.region || 'RS';
  const postalCode = primaryAddr?.postalCode || '';

  // Notes
  const notes = person.biographies?.[0]?.value || '';

  // Photo
  const photoUrl = person.photos?.[0]?.url;

  // Organization
  const organization = person.organizations?.[0]?.name;

  // Match with existing HigiPro clients
  let matchedClient: Client | undefined;
  if (cleanPhone) {
    matchedClient = existingClients.find(c => {
      const cClean = stripCountryCode(c.telefone);
      return (
        cClean === cleanPhone ||
        (cleanPhone.length >= 8 && cClean.endsWith(cleanPhone.slice(-8))) ||
        (cClean.length >= 8 && cleanPhone.endsWith(cClean.slice(-8)))
      );
    });
  }

  if (!matchedClient && email) {
    matchedClient = existingClients.find(
      c => c.email && c.email.toLowerCase() === email.toLowerCase()
    );
  }

  if (!matchedClient && name && name !== 'Contato Sem Nome') {
    matchedClient = existingClients.find(
      c => c.nome.trim().toLowerCase() === name.trim().toLowerCase()
    );
  }

  return {
    id: resourceName || generateId(),
    resourceName,
    etag,
    name,
    phone: formattedPhone,
    rawPhone: formattedPhone,
    email,
    address,
    city,
    state,
    postalCode,
    notes,
    photoUrl,
    organization,
    isExistingInHigiPro: !!matchedClient,
    matchedClientId: matchedClient?.id,
  };
};

// Convert GoogleContactItem to a HigiPro Client
export const convertGoogleContactToClient = (contact: GoogleContactItem): Client => {
  const cleanPhone = stripCountryCode(contact.phone);

  return {
    id: generateId(),
    nome: contact.name,
    telefone: cleanPhone,
    email: contact.email,
    endereco: contact.address,
    cidade: contact.city || 'Passo Fundo',
    estado: contact.state || 'RS',
    CEP: contact.postalCode,
    observacoes: contact.notes ? `Google Contatos: ${contact.notes}` : 'Importado do Google Contatos',
    tags: ['Google Contatos'],
    origem: 'Google' as ClientOrigin,
    created_at: new Date().toISOString(),
  };
};

// Persistent storage keys for offline/fast contact retrieval on iOS & Android
const GOOGLE_CONTACTS_STORAGE_KEY = 'higipro_cached_google_contacts_v2';
const GOOGLE_CONTACTS_TIMESTAMP_KEY = 'higipro_cached_google_contacts_ts_v2';
const PHONE_CONTACTS_STORAGE_KEY = 'higipro_cached_phone_contacts_v2';

// In-memory cache for fast contact retrieval without delay, initialized from localStorage
let cachedGoogleContacts: GoogleContactItem[] = (() => {
  try {
    const raw = localStorage.getItem(GOOGLE_CONTACTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    // Ignore storage issues
  }
  return [];
})();

let cacheContactsTimestamp = (() => {
  try {
    const raw = localStorage.getItem(GOOGLE_CONTACTS_TIMESTAMP_KEY);
    return raw ? Number(raw) : 0;
  } catch (e) {
    return 0;
  }
})();

const CONTACTS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache freshness

export const clearGoogleContactsCache = () => {
  cachedGoogleContacts = [];
  cacheContactsTimestamp = 0;
  try {
    localStorage.removeItem(GOOGLE_CONTACTS_STORAGE_KEY);
    localStorage.removeItem(GOOGLE_CONTACTS_TIMESTAMP_KEY);
  } catch (e) {}
};

export const getCachedGoogleContacts = (): GoogleContactItem[] => {
  // Check high-capacity IndexedDB memory store first
  const stored = getAllCachedContacts();
  const googleStored = stored.filter(c => c.source === 'google');
  if (googleStored.length > 0) {
    return googleStored.map(c => ({
      id: c.id,
      resourceName: c.id,
      name: c.nome,
      phone: c.telefone,
      rawPhone: c.telefone,
      email: c.email || '',
      address: c.endereco || '',
      city: c.cidade || 'Passo Fundo',
      state: c.estado || 'RS',
      postalCode: '',
      notes: '',
      photoUrl: c.photoUrl,
    }));
  }

  if (cachedGoogleContacts.length > 0) return cachedGoogleContacts;
  try {
    const raw = localStorage.getItem(GOOGLE_CONTACTS_STORAGE_KEY);
    if (raw) {
      cachedGoogleContacts = JSON.parse(raw);
      return cachedGoogleContacts;
    }
  } catch (e) {}
  return [];
};

// Phone contacts (.vcf or device imported) persistence
export interface PhoneContactItem {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  source: 'phone_vcf' | 'device';
}

export const INITIAL_PHONE_CONTACTS: Array<{
  nome: string;
  telefone: string;
  email?: string;
  endereco?: string;
  cidade?: string;
}> = [
  { nome: 'Ana Paula Ferreira', telefone: '(54) 99182-3344', endereco: 'Rua Morom, 1540 - Centro', cidade: 'Passo Fundo' },
  { nome: 'Carlos Eduardo Souza', telefone: '(54) 98412-5566', endereco: 'Av. Brasil Leste, 820 - Petrópolis', cidade: 'Passo Fundo' },
  { nome: 'Mariana Silveira', telefone: '(54) 99654-1122', endereco: 'Rua General Osório, 420 - Centro', cidade: 'Passo Fundo' },
  { nome: 'Rodrigo Medeiros', telefone: '(54) 99933-7788', endereco: 'Rua Lava Pés, 310 - Boqueirão', cidade: 'Passo Fundo' },
  { nome: 'Fernanda Oliveira', telefone: '(54) 98125-9900', endereco: 'Rua Teixeira Soares, 650 - Centro', cidade: 'Passo Fundo' },
  { nome: 'Lucas Gabriel Becker', telefone: '(54) 99201-4477', endereco: 'Rua Uruguai, 1120 - Vera Cruz', cidade: 'Passo Fundo' },
  { nome: 'Patrícia Albuquerque', telefone: '(54) 98405-3322', endereco: 'Rua Fagundes dos Reis, 930', cidade: 'Passo Fundo' },
];

export const getCachedPhoneContacts = (): PhoneContactItem[] => {
  // Check high-capacity IndexedDB memory store first
  const stored = getAllCachedContacts();
  const phoneStored = stored.filter(c => c.source === 'phone_vcf');
  if (phoneStored.length > 0) {
    return phoneStored.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      endereco: c.endereco,
      cidade: c.cidade,
      source: 'phone_vcf' as const,
    }));
  }

  try {
    const raw = localStorage.getItem(PHONE_CONTACTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Seed with initial contacts if empty so user has instant contacts ready to schedule
    const seeded: PhoneContactItem[] = INITIAL_PHONE_CONTACTS.map(c => ({
      id: generateId(),
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      endereco: c.endereco,
      cidade: c.cidade,
      source: 'phone_vcf' as const,
    }));
    localStorage.setItem(PHONE_CONTACTS_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch (e) {}
  return [];
};

export const savePhoneContacts = (contacts: Array<{
  nome: string;
  telefone: string;
  email?: string;
  endereco?: string;
  cidade?: string;
}>) => {
  try {
    const existing = getCachedPhoneContacts();
    const existingPhones = new Set(existing.map(c => c.telefone.replace(/\D/g, '')));
    
    const newItems: PhoneContactItem[] = contacts.map(c => ({
      id: generateId(),
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      endereco: c.endereco,
      cidade: c.cidade,
      source: 'phone_vcf' as const,
    })).filter(item => {
      const clean = item.telefone.replace(/\D/g, '');
      return clean && !existingPhones.has(clean);
    });

    const combined = [...newItems, ...existing];

    // Asynchronously persist to high-capacity IndexedDB storage
    saveContactsBatch(combined.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      endereco: c.endereco,
      cidade: c.cidade,
      source: 'phone_vcf' as const,
    }))).catch(err => console.warn('IndexedDB save batch error:', err));

    try {
      localStorage.setItem(PHONE_CONTACTS_STORAGE_KEY, JSON.stringify(combined.slice(0, 500)));
    } catch (e) {}

    return combined;
  } catch (e) {
    console.warn('savePhoneContacts error:', e);
    return [];
  }
};

/**
 * Searches across ALL cached Google Contacts AND Phone (.vcf) contacts.
 * Uses high-speed accent-insensitive matching and phone digit indexing.
 * Perfect for instant client lookup in "Novo Orçamento".
 */
export const searchAllCachedContacts = (query: string): Array<{
  id: string;
  name: string;
  phone: string;
  rawPhone: string;
  email?: string;
  address?: string;
  city?: string;
  source: 'google' | 'phone';
  googleItem?: GoogleContactItem;
}> => {
  const cleanQ = normalizeSearchString(query);
  const digitsQ = stripCountryCode(query);
  const rawDigitsQ = query.replace(/\D/g, '');

  const results: Array<{
    id: string;
    name: string;
    phone: string;
    rawPhone: string;
    email?: string;
    address?: string;
    city?: string;
    source: 'google' | 'phone';
    googleItem?: GoogleContactItem;
  }> = [];

  const seenKeys = new Set<string>();

  // 1. Query high-capacity contact store (IndexedDB / memory)
  const storedMatches = searchStoredContacts(query, 1000);
  const googleMap = new Map<string, GoogleContactItem>();
  for (const g of cachedGoogleContacts) {
    googleMap.set(g.id, g);
    const clean = stripCountryCode(g.phone);
    if (clean) googleMap.set(clean, g);
  }

  for (const m of storedMatches) {
    const clean = m.cleanPhone || stripCountryCode(m.telefone);
    const formatted = formatPhone(clean || m.telefone);
    const key = clean || normalizeSearchString(m.nome);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      const gItem = googleMap.get(m.id) || (clean ? googleMap.get(clean) : undefined);
      results.push({
        id: m.id,
        name: m.nome,
        phone: formatted,
        rawPhone: formatted,
        email: m.email,
        address: m.endereco,
        city: m.cidade,
        source: m.source === 'google' ? ('google' as const) : ('phone' as const),
        googleItem: gItem,
      });
    }
  }

  // 2. Also check cached Google Contacts (for any not yet synced to storedMatches)
  const googleList = getCachedGoogleContacts();
  for (const c of googleList) {
    const normName = normalizeSearchString(c.name);
    const cleanPhone = stripCountryCode(c.phone);
    const formatted = formatPhone(cleanPhone || c.phone);
    const nameMatch = !cleanQ || normName.includes(cleanQ);
    const phoneMatch = digitsQ && (cleanPhone.includes(digitsQ) || (rawDigitsQ && cleanPhone.endsWith(rawDigitsQ)));
    const emailMatch = c.email && cleanQ && c.email.toLowerCase().includes(cleanQ);

    if (nameMatch || phoneMatch || emailMatch) {
      const key = cleanPhone || normName;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push({
          id: c.id,
          name: c.name,
          phone: formatted,
          rawPhone: formatted,
          email: c.email,
          address: c.address,
          city: c.city,
          source: 'google',
          googleItem: c,
        });
      }
    }
  }

  // 3. Also check Phone Contacts (.vcf)
  const phoneList = getCachedPhoneContacts();
  for (const p of phoneList) {
    const normName = normalizeSearchString(p.nome);
    const cleanPhone = stripCountryCode(p.telefone);
    const formatted = formatPhone(cleanPhone || p.telefone);
    const nameMatch = !cleanQ || normName.includes(cleanQ);
    const phoneMatch = digitsQ && (cleanPhone.includes(digitsQ) || (rawDigitsQ && cleanPhone.endsWith(rawDigitsQ)));
    const emailMatch = p.email && cleanQ && p.email.toLowerCase().includes(cleanQ);

    if (nameMatch || phoneMatch || emailMatch) {
      const key = cleanPhone || normName;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push({
          id: p.id,
          name: p.nome,
          phone: formatted,
          rawPhone: formatted,
          email: p.email,
          address: p.endereco,
          city: p.cidade,
          source: 'phone',
        });
      }
    }
  }

  return results.slice(0, 1000);
};

// Fetch Google Contacts list via People API with automatic pagination for 2,000+ contacts
export const fetchGoogleContacts = async (
  accessToken: string,
  forceRefresh = false,
  onProgress?: (loaded: number, totalEstimate?: number) => void
): Promise<GoogleContactItem[]> => {
  // Return cached contacts instantly if fresh and not forcing refresh
  if (!forceRefresh && cachedGoogleContacts.length > 0 && Date.now() - cacheContactsTimestamp < CONTACTS_CACHE_TTL) {
    return cachedGoogleContacts;
  }

  try {
    const fields = 'names,phoneNumbers,emailAddresses,addresses,organizations,biographies,photos';
    let allConnections: GoogleContactPerson[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;

    // Loop through all pages to retrieve all contacts (e.g. 2,000+ contacts)
    do {
      pageCount++;
      const url = new URL('https://people.googleapis.com/v1/people/me/connections');
      url.searchParams.set('personFields', fields);
      url.searchParams.set('pageSize', '1000');
      url.searchParams.set('sortOrder', 'FIRST_NAME_ASCENDING');
      if (nextPageToken) {
        url.searchParams.set('pageToken', nextPageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Google People API error:', response.status, errorBody);
        throw new Error(`Falha ao carregar contatos do Google: ${response.statusText}`);
      }

      const data = await response.json();
      const connections: GoogleContactPerson[] = data.connections || [];
      allConnections = allConnections.concat(connections);

      if (onProgress) {
        onProgress(allConnections.length, data.totalPeople || data.totalItems);
      }

      nextPageToken = data.nextPageToken;
      // Guard against infinite loop (allows up to 50,000 contacts)
      if (pageCount >= 50) break;
    } while (nextPageToken);

    // Also attempt to fetch otherContacts (frequently contacted people)
    try {
      const otherUrl = new URL('https://people.googleapis.com/v1/otherContacts');
      otherUrl.searchParams.set('readMask', 'names,phoneNumbers,emailAddresses');
      otherUrl.searchParams.set('pageSize', '1000');
      const otherResponse = await fetch(otherUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (otherResponse.ok) {
        const otherData = await otherResponse.json();
        const otherList: GoogleContactPerson[] = otherData.otherContacts || [];
        if (otherList.length > 0) {
          allConnections = allConnections.concat(otherList);
          if (onProgress) {
            onProgress(allConnections.length);
          }
        }
      }
    } catch (e) {
      // Optional otherContacts scope, ignore if forbidden
    }

    const parsed = allConnections
      .map(p => parseGooglePerson(p))
      .filter(c => (c.name && c.name !== 'Contato Sem Nome') || (c.phone && c.phone.trim().length > 0));

    cachedGoogleContacts = parsed;
    cacheContactsTimestamp = Date.now();

    // Persist all contacts into high-capacity IndexedDB store
    await saveContactsBatch(parsed.map(c => ({
      id: c.id,
      nome: c.name,
      telefone: c.phone,
      email: c.email,
      endereco: c.address,
      cidade: c.city,
      estado: c.state,
      source: 'google' as const,
      photoUrl: c.photoUrl,
    })));

    try {
      localStorage.setItem(GOOGLE_CONTACTS_TIMESTAMP_KEY, String(Date.now()));
      // Save compact snapshot to localStorage for instant 0ms restoration
      const compact = parsed.slice(0, 800).map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        city: c.city,
      }));
      localStorage.setItem(GOOGLE_CONTACTS_STORAGE_KEY, JSON.stringify(compact));
    } catch (e) {}

    return parsed;
  } catch (error: any) {
    console.error('fetchGoogleContacts error:', error);
    // If error but we have cached contacts, fallback gracefully
    if (cachedGoogleContacts.length > 0) {
      return cachedGoogleContacts;
    }
    throw error;
  }
};

// Search Google Contacts
export const searchGoogleContacts = async (
  query: string,
  accessToken: string
): Promise<GoogleContactItem[]> => {
  if (!query.trim()) return [];
  try {
    const fields = 'names,phoneNumbers,emailAddresses,addresses,biographies,photos';
    const url = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(
      query
    )}&readMask=${fields}&pageSize=30`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Falha na busca de contatos do Google');
    }

    const data = await response.json();
    const results: Array<{ person: GoogleContactPerson }> = data.results || [];
    return results.map(r => parseGooglePerson(r.person));
  } catch (error) {
    console.error('searchGoogleContacts error:', error);
    return [];
  }
};

// Create a Contact in Google Contacts
export const createGoogleContact = async (
  client: {
    nome: string;
    telefone?: string;
    email?: string;
    endereco?: string;
    cidade?: string;
    estado?: string;
    CEP?: string;
    observacoes?: string;
  },
  accessToken: string
): Promise<GoogleContactPerson> => {
  const parts = client.nome.trim().split(' ');
  const givenName = parts[0] || '';
  const familyName = parts.slice(1).join(' ') || '';

  const body: any = {
    names: [
      {
        givenName,
        familyName,
      },
    ],
  };

  if (client.telefone) {
    body.phoneNumbers = [
      {
        value: client.telefone,
        type: 'mobile',
      },
    ];
  }

  if (client.email) {
    body.emailAddresses = [
      {
        value: client.email,
        type: 'work',
      },
    ];
  }

  if (client.endereco || client.cidade || client.estado || client.CEP) {
    body.addresses = [
      {
        streetAddress: client.endereco || '',
        city: client.cidade || '',
        region: client.estado || '',
        postalCode: client.CEP || '',
        type: 'home',
      },
    ];
  }

  if (client.observacoes) {
    body.biographies = [
      {
        value: `HigiPro Estofados: ${client.observacoes}`,
        contentType: 'TEXT_PLAIN',
      },
    ];
  }

  const response = await fetch('https://people.googleapis.com/v1/people:createContact', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Erro ao criar contato no Google: ${err}`);
  }

  const createdPerson = await response.json();
  try {
    const parsed = parseGooglePerson(createdPerson);
    cachedGoogleContacts = [parsed, ...cachedGoogleContacts.filter(c => c.resourceName !== parsed.resourceName)];
    cacheContactsTimestamp = Date.now();
  } catch (e) {}

  return createdPerson;
};

// Update an existing Contact in Google Contacts
export const updateGoogleContact = async (
  resourceName: string,
  etag: string,
  client: {
    nome: string;
    telefone?: string;
    email?: string;
    endereco?: string;
    cidade?: string;
    estado?: string;
    CEP?: string;
    observacoes?: string;
  },
  accessToken: string
): Promise<GoogleContactPerson> => {
  const parts = client.nome.trim().split(' ');
  const givenName = parts[0] || '';
  const familyName = parts.slice(1).join(' ') || '';

  const body: any = {
    etag,
    names: [
      {
        givenName,
        familyName,
      },
    ],
  };

  if (client.telefone) {
    body.phoneNumbers = [
      {
        value: client.telefone,
        type: 'mobile',
      },
    ];
  }

  if (client.email) {
    body.emailAddresses = [
      {
        value: client.email,
        type: 'work',
      },
    ];
  }

  if (client.endereco || client.cidade || client.estado || client.CEP) {
    body.addresses = [
      {
        streetAddress: client.endereco || '',
        city: client.cidade || '',
        region: client.estado || '',
        postalCode: client.CEP || '',
        type: 'home',
      },
    ];
  }

  if (client.observacoes) {
    body.biographies = [
      {
        value: `HigiPro Estofados: ${client.observacoes}`,
        contentType: 'TEXT_PLAIN',
      },
    ];
  }

  const updatePersonFields = 'names,phoneNumbers,emailAddresses,addresses,biographies';
  const url = `https://people.googleapis.com/v1/${resourceName}:updateContact?updatePersonFields=${updatePersonFields}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Erro ao atualizar contato no Google: ${err}`);
  }

  return await response.json();
};
