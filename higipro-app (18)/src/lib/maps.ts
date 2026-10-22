/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Source: Google Maps Platform Code Assist

export const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
export const DEMO_MAP_ID = 'DEMO_MAP_ID';

const GMAPS_KEY_STORAGE = 'higipro_google_maps_api_key';

/**
 * Retrieves the Google Maps API Key from environment or local storage
 */
export function getGoogleMapsApiKey(): string {
  const envKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim() !== '') {
    return envKey.trim();
  }
  try {
    const local = localStorage.getItem(GMAPS_KEY_STORAGE);
    if (local && local.trim() !== '') {
      return local.trim();
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Sets a Google Maps API Key in localStorage for live preview/testing
 */
export function setGoogleMapsApiKey(key: string): void {
  try {
    if (!key || key.trim() === '') {
      localStorage.removeItem(GMAPS_KEY_STORAGE);
    } else {
      localStorage.setItem(GMAPS_KEY_STORAGE, key.trim());
    }
  } catch {
    // ignore
  }
}

export interface ExtractedLocationInfo {
  endereco: string;
  bairro: string;
  regiao: string;
  cidade: string;
  estado: string;
  cep: string;
  lat?: number;
  lng?: number;
  formattedAddress: string;
}

/**
 * Extracts structured Brazilian address & neighborhood/region info from a modern Google Place object
 */
export function extractAddressInfoFromPlace(place: google.maps.places.Place): ExtractedLocationInfo {
  let street = '';
  let number = '';
  let bairro = '';
  let cidade = '';
  let estado = '';
  let cep = '';

  const components = place.addressComponents || [];
  for (const comp of components) {
    const types = comp.types || [];
    if (types.includes('route')) {
      street = comp.longText || comp.shortText || '';
    } else if (types.includes('street_number')) {
      number = comp.longText || comp.shortText || '';
    } else if (
      types.includes('sublocality_level_1') ||
      types.includes('sublocality') ||
      types.includes('neighborhood')
    ) {
      bairro = comp.longText || comp.shortText || '';
    } else if (
      types.includes('administrative_area_level_2') ||
      types.includes('locality')
    ) {
      cidade = comp.longText || comp.shortText || '';
    } else if (types.includes('administrative_area_level_1')) {
      estado = comp.shortText || comp.longText || '';
    } else if (types.includes('postal_code')) {
      cep = comp.longText || comp.shortText || '';
    }
  }

  let lat: number | undefined;
  let lng: number | undefined;

  if (place.location) {
    lat = typeof place.location.lat === 'function' ? place.location.lat() : (place.location as any).lat;
    lng = typeof place.location.lng === 'function' ? place.location.lng() : (place.location as any).lng;
  }

  const enderecoMontado = street ? (number ? `${street}, ${number}` : street) : (place.formattedAddress || '');

  return {
    endereco: enderecoMontado,
    bairro: bairro,
    regiao: bairro,
    cidade: cidade || 'Passo Fundo',
    estado: estado || 'RS',
    cep: cep,
    lat,
    lng,
    formattedAddress: place.formattedAddress || enderecoMontado,
  };
}

/**
 * Heuristic parser to extract neighborhood/bairro and city from standard Brazilian address strings
 * Examples:
 * - "Rua Morom, 1234 - Centro, Passo Fundo - RS" -> bairro: "Centro", cidade: "Passo Fundo", estado: "RS"
 * - "Av. Brasil Leste, 500, Petrópolis" -> bairro: "Petrópolis"
 */
export function parseBrazilianAddressFallback(fullAddress: string, defaultCity = 'Passo Fundo', defaultState = 'RS'): {
  bairro?: string;
  regiao?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
} {
  if (!fullAddress) return {};

  let text = fullAddress.trim();

  // Extract CEP if present (00000-000 or 00000000)
  const cepMatch = text.match(/\b(\d{5}-?\d{3})\b/);
  const cep = cepMatch ? cepMatch[1] : undefined;
  if (cepMatch) {
    text = text.replace(cepMatch[0], '').trim();
  }

  // Extract state if present at end (e.g. " - RS" or "/RS" or ", RS")
  let estado = defaultState;
  const stateMatch = text.match(/(?:[-/,]\s*)([A-Z]{2})\b/);
  if (stateMatch) {
    estado = stateMatch[1];
    text = text.substring(0, stateMatch.index).trim();
  }

  // Split by hyphens or commas
  const parts = text.split(/[-–,]/).map(p => p.trim()).filter(Boolean);

  let bairro: string | undefined;
  let cidade = defaultCity;

  if (parts.length >= 3) {
    // e.g. ["Rua Morom 1234", "Centro", "Passo Fundo"]
    bairro = parts[1];
    cidade = parts[2];
  } else if (parts.length === 2) {
    // e.g. ["Rua Morom 1234", "Centro"]
    bairro = parts[1];
  }

  // Clean up prefixes like "Bairro ", "Jardim ", etc.
  if (bairro) {
    bairro = bairro.replace(/^(bairro|b\.)\s+/i, '').trim();
  }

  return {
    bairro: bairro || undefined,
    regiao: bairro || undefined,
    cidade,
    estado,
    cep,
  };
}

/**
 * Builds a direct Google Maps search link for the given address
 */
export function getGoogleMapsSearchUrl(address: string, city?: string, state?: string): string {
  const parts = [address, city, state].filter(Boolean);
  const query = parts.join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Builds a direct Google Maps navigation / directions link to destination
 */
export function getGoogleMapsDirectionsUrl(address: string, city?: string, state?: string): string {
  const parts = [address, city, state].filter(Boolean);
  const query = parts.join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}
