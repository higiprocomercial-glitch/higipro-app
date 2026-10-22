/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatPhone, cleanWhatsAppPhone, stripCountryCode } from './utils';

export interface VCardContactData {
  nome: string;
  telefone: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  observacoes?: string;
}

/**
 * Generates a clean vCard 3.0 string compatible with Android, iOS and Google Contacts.
 */
export function generateVCard(contact: VCardContactData): string {
  const cleanName = contact.nome.trim();
  const nameParts = cleanName.split(' ');
  const firstName = nameParts[0] || cleanName;
  const lastName = nameParts.slice(1).join(' ') || '';
  const cleanPhone = contact.telefone.trim();

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${cleanName}`,
    `N:${lastName};${firstName};;;`,
    `TEL;TYPE=CELL,VOICE:${cleanPhone}`,
  ];

  if (contact.email?.trim()) {
    lines.push(`EMAIL;TYPE=INTERNET,HOME:${contact.email.trim()}`);
  }

  if (contact.endereco?.trim() || contact.cidade?.trim()) {
    const street = contact.endereco?.trim() || '';
    const city = contact.cidade?.trim() || 'Passo Fundo';
    const state = contact.estado?.trim() || 'RS';
    lines.push(`ADR;TYPE=HOME:;;${street};${city};${state};;Brasil`);
  }

  const note = contact.observacoes?.trim() || 'Cliente HigiPro - WhatsApp';
  lines.push(`NOTE:${note}`);
  lines.push('ORG:HigiPro Gestão de Estofados');
  lines.push('END:VCARD');

  return lines.join('\r\n');
}

/**
 * Triggers a download of a .vcf file.
 * On mobile devices (Android and iOS), opening this file immediately prompts
 * the user to save the contact directly into their phone's native address book / agenda.
 */
export function downloadVCard(contact: VCardContactData): boolean {
  try {
    const vcardContent = generateVCard(contact);
    const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Clean filename
    const safeName = contact.nome
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 30);
    
    link.href = url;
    link.setAttribute('download', `contato_${safeName || 'cliente'}.vcf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Error downloading vCard:', error);
    return false;
  }
}

/**
 * Parses raw text copied from WhatsApp (chat message, shared contact, or number)
 * to automatically extract client name, phone number, and address if present.
 */
export function parseWhatsAppContactText(rawText: string): {
  nome: string;
  telefone: string;
  endereco: string;
  cidade: string;
} {
  const result = {
    nome: '',
    telefone: '',
    endereco: '',
    cidade: 'Passo Fundo',
  };

  if (!rawText || !rawText.trim()) return result;

  const text = rawText.trim();

  // Extract phone number: look for Brazilian formats (e.g. +55 54 99140-0553, 54 99140-0553, 991400553)
  const phoneRegex = /(?:\+?55\s?)?(?:\(?([1-9]{2})\)?\s?)?(?:9\s?)?([0-9]{4,5})[-.\s]?([0-9]{4})/g;
  const phoneMatch = text.match(phoneRegex);

  if (phoneMatch && phoneMatch.length > 0) {
    // Strip Brazil country code 55 so it is never retained
    const cleanDigits = stripCountryCode(phoneMatch[0]);
    result.telefone = formatPhone(cleanDigits);
  }

  // Check lines for Name
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    
    // Explicit labels
    if (lower.startsWith('nome:') || lower.startsWith('cliente:')) {
      result.nome = line.replace(/^(nome|cliente):\s*/i, '').trim();
      continue;
    }
    
    if (lower.startsWith('endereço:') || lower.startsWith('endereco:') || lower.startsWith('rua:')) {
      result.endereco = line.replace(/^(endereço|endereco|rua):\s*/i, '').trim();
      continue;
    }

    if (lower.startsWith('cidade:')) {
      result.cidade = line.replace(/^cidade:\s*/i, '').trim();
      continue;
    }

    // If we don't have a name yet and line does not have digits or time indicators
    if (!result.nome && !line.includes(':') && !/\d{5}/.test(line) && line.length > 2 && line.length < 50) {
      // Ignore common conversational phrases
      if (!lower.includes('olá') && !lower.includes('ola') && !lower.includes('bom dia') && !lower.includes('boa tarde') && !lower.includes('boa noite') && !lower.includes('orçamento')) {
        result.nome = line;
      }
    }
  }

    // If name still empty and text is short, use first line or part before phone
    if (!result.nome && lines.length > 0) {
      const first = lines[0].replace(phoneRegex, '').replace(/[-–,]/g, '').trim();
      if (first && first.length > 2 && first.length < 50) {
        result.nome = first;
      }
    }

    return result;
  }

/**
 * Decodes vCard Quoted-Printable strings (e.g. =C3=A3 -> ã, =C3=A9 -> é, =20 -> space).
 */
function decodeQuotedPrintable(str: string): string {
  if (!str) return '';
  try {
    // Replace soft line breaks
    const cleanStr = str.replace(/=\r?\n/g, '');
    // Convert =XX to %XX for decodeURIComponent
    const hexReplaced = cleanStr.replace(/=([0-9A-Fa-f]{2})/g, '%$1');
    return decodeURIComponent(hexReplaced);
  } catch (e) {
    // Fallback: replace common latin characters manually
    return str
      .replace(/=C3=A1/gi, 'á')
      .replace(/=C3=A9/gi, 'é')
      .replace(/=C3=AD/gi, 'í')
      .replace(/=C3=B3/gi, 'ó')
      .replace(/=C3=BA/gi, 'ú')
      .replace(/=C3=A3/gi, 'ã')
      .replace(/=C3=B5/gi, 'õ')
      .replace(/=C3=A7/gi, 'ç')
      .replace(/=C3=81/gi, 'Á')
      .replace(/=C3=89/gi, 'É')
      .replace(/=C3=8D/gi, 'Í')
      .replace(/=C3=93/gi, 'Ó')
      .replace(/=C3=9A/gi, 'Ú')
      .replace(/=C3=83/gi, 'Ã')
      .replace(/=C3=95/gi, 'Õ')
      .replace(/=C3=87/gi, 'Ç')
      .replace(/=20/gi, ' ')
      .replace(/=([0-9A-Fa-f]{2})/g, '');
  }
}

/**
 * Parses raw text from an exported .vcf file (vCard) into a list of contact items.
 * Robustly supports vCard 2.1, 3.0 and 4.0 from Samsung, Motorola, Xiaomi, iPhone and Google.
 * Can parse 2,000+ to 5,000+ contacts without memory crashes.
 */
export function parseVCardFileContent(vcfString: string): Array<{
  nome: string;
  telefone: string;
  email?: string;
  endereco?: string;
  cidade?: string;
}> {
  if (!vcfString) return [];

  const contacts: Array<{
    nome: string;
    telefone: string;
    email?: string;
    endereco?: string;
    cidade?: string;
  }> = [];

  // Unfold folded lines (RFC 2426: lines beginning with whitespace are continuations)
  const unfolded = vcfString.replace(/\r?\n[ \t]/g, '');

  const cards = unfolded.split(/BEGIN:VCARD/i).filter(c => c.trim().length > 0);

  for (const card of cards) {
    let fn = '';
    let structuredName = '';
    let bestPhone = '';
    let secondaryPhone = '';
    let email = '';
    let endereco = '';
    let cidade = 'Passo Fundo';

    const lines = card.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Extract parameter and value parts: TAG;PARAMS:VALUE
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const tagWithParams = line.substring(0, colonIdx);
      let value = line.substring(colonIdx + 1).trim();

      const isQuotedPrintable = /ENCODING=QUOTED-PRINTABLE/i.test(tagWithParams);
      if (isQuotedPrintable) {
        value = decodeQuotedPrintable(value);
      }

      // 1. Formatted Name (FN)
      if (/(?:^|\.)FN(?:;|$)/i.test(tagWithParams)) {
        if (!fn && value) {
          fn = value.replace(/\\;/g, ';').replace(/\\,/g, ',').trim();
        }
      }
      // 2. Structured Name (N: Family;Given;Middle;Prefix;Suffix)
      else if (/(?:^|\.)N(?:;|$)/i.test(tagWithParams)) {
        if (!structuredName && value) {
          const parts = value.split(';').map(p => p.trim()).filter(Boolean);
          if (parts.length > 0) {
            // Usually Family; Given -> "Given Family"
            if (parts.length >= 2) {
              structuredName = `${parts[1]} ${parts[0]}`.trim();
            } else {
              structuredName = parts[0];
            }
          }
        }
      }
      // 3. Telephone (TEL)
      else if (/(?:^|\.)TEL(?:;|$)/i.test(tagWithParams)) {
        const cleanDigits = stripCountryCode(value);
        if (cleanDigits.length >= 8) {
          const formatted = formatPhone(cleanDigits);
          // Prefer CELL / MOBILE / PREF
          if (/CELL|MOBILE|PREF/i.test(tagWithParams)) {
            if (!bestPhone) bestPhone = formatted;
          } else {
            if (!secondaryPhone) secondaryPhone = formatted;
          }
        }
      }
      // 4. Email (EMAIL)
      else if (/(?:^|\.)EMAIL(?:;|$)/i.test(tagWithParams)) {
        if (!email && value.includes('@')) {
          email = value.trim();
        }
      }
      // 5. Address (ADR)
      else if (/(?:^|\.)ADR(?:;|$)/i.test(tagWithParams)) {
        const parts = value.split(';').map(p => p.trim()).filter(Boolean);
        if (parts.length > 0 && !endereco) {
          endereco = parts[0] || '';
          if (parts.length > 1) cidade = parts[1] || 'Passo Fundo';
        }
      }
    }

    const chosenName = fn || structuredName || '';
    const chosenPhone = bestPhone || secondaryPhone || '';

    // Only add if there is a name or phone
    if (chosenName || chosenPhone) {
      contacts.push({
        nome: chosenName || 'Contato sem nome',
        telefone: chosenPhone,
        email,
        endereco,
        cidade,
      });
    }
  }

  return contacts;
}
