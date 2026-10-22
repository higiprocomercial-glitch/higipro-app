/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Merges class names into a single string.
 */
export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Formats a number as BRL currency (R$ 1.234,56).
 */
export function formatCurrency(value?: number | null): string {
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safeValue);
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into pt-BR format (DD/MM/YYYY).
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const cleanDate = dateStr.split(/[ T]/)[0];
  const parts = cleanDate.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Formats an ISO datetime string (YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm) into DD/MM/YYYY HH:mm.
 */
export function formatDateTime(dateTimeStr?: string): string {
  if (!dateTimeStr) return '-';
  const [datePart, timePart] = dateTimeStr.split(/[ T]/);
  if (!datePart) return '-';
  const formattedDate = formatDate(datePart);
  if (!timePart) return formattedDate;
  const timeStr = timePart.substring(0, 5); // HH:mm
  return `${formattedDate} às ${timeStr}`;
}

/**
 * Extracts and formats time from a datetime string as HH:mm.
 */
export function formatTime(dateTimeStr?: string): string {
  if (!dateTimeStr) return '-';
  const parts = dateTimeStr.split(/[ T]/);
  if (parts.length < 2) return '-';
  return parts[1].substring(0, 5);
}

/**
 * Safely extracts local year, month (0-indexed), and day from ISO string (YYYY-MM-DD or YYYY-MM-DDTHH:mm)
 * to prevent off-by-one errors caused by UTC/Local timezone conversions.
 */
export function parseDateComponents(dateStr?: string): { year: number; month: number; day: number } {
  if (!dateStr) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }
  const clean = dateStr.split(/[ T]/)[0];
  const parts = clean.split('-').map(Number);
  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return { year: parts[0], month: parts[1] - 1, day: parts[2] };
  }
  const fallback = new Date(dateStr);
  return { year: fallback.getFullYear(), month: fallback.getMonth(), day: fallback.getDate() };
}

/**
 * Strips Brazilian country code (55, +55, 0055, 055) from a phone string or digits.
 * Brazilian phone numbers have:
 * - 11 digits: 2 digits DDD (e.g. 54) + 9 digits mobile (e.g. 99140-0553)
 * - 10 digits: 2 digits DDD (e.g. 54) + 8 digits landline (e.g. 3311-2233)
 * - 8 or 9 digits: local number without DDD
 *
 * If phone starts with 55 and has 12 or 13 digits (or 14 with 055):
 * 55 is the international country code for Brazil.
 * This function strips the 55 prefix so numbers are never stored or displayed with it.
 */
export function stripCountryCode(phone?: string | number | null): string {
  if (phone === undefined || phone === null || phone === '') return '';
  let str = String(phone).trim();

  // Remove explicit international prefix
  if (str.startsWith('+55')) {
    str = str.substring(3).trim();
  } else if (str.startsWith('+ 55')) {
    str = str.substring(4).trim();
  } else if (str.startsWith('0055')) {
    str = str.substring(4).trim();
  }

  let digits = str.replace(/\D/g, '');

  // 14 digits starting with 055 (e.g. 05554991400553 -> 54991400553)
  if (digits.startsWith('055') && digits.length === 14) {
    digits = digits.slice(3);
  }

  // 13 digits starting with 55 (e.g. 5554991400553 -> 54991400553)
  if (digits.startsWith('55') && digits.length === 13) {
    digits = digits.slice(2);
  }

  // 12 digits starting with 55 (e.g. 555433112233 landline -> 5433112233)
  if (digits.startsWith('55') && digits.length === 12) {
    const potentialDDD = parseInt(digits.slice(2, 4), 10);
    // Valid Brazilian DDDs are between 11 and 99
    if (potentialDDD >= 11 && potentialDDD <= 99) {
      digits = digits.slice(2);
    }
  }

  // If starts with single trunk zero (e.g. 054991400553, 12 digits -> 11 digits)
  if (digits.startsWith('0') && (digits.length === 12 || digits.length === 11)) {
    digits = digits.slice(1);
  }

  return digits;
}

/**
 * Formats a phone string into (XX) XXXXX-XXXX or (XX) XXXX-XXXX.
 * Automatically removes Brazilian country code 55 (+55 / 055) so that
 * contacts are never displayed or saved with the 55 prefix.
 */
export function formatPhone(phone?: string | number | null): string {
  if (phone === undefined || phone === null || phone === '') return '-';
  const digits = stripCountryCode(phone);
  if (!digits) return '-';

  // 11 digits: (XX) XXXXX-XXXX (Mobile with DDD)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  // 10 digits: (XX) XXXX-XXXX (Landline with DDD)
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  // 9 digits: XXXXX-XXXX (Mobile without DDD)
  if (digits.length === 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  }

  // 8 digits: XXXX-XXXX (Landline without DDD)
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
  }

  // Intermediate states during input typing
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Cleans phone number and formats for Brazilian WhatsApp international link (55XXXXXXXXXXX)
 * This is used exclusively for https://wa.me/55... API URLs which require the international code.
 */
export function cleanWhatsAppPhone(phone?: string | number | null): string {
  if (phone === undefined || phone === null || phone === '') return '';
  const digits = stripCountryCode(phone);
  if (!digits) return '';
  return `55${digits}`;
}

/**
 * Generates a formatted sequential code with current year, e.g., ORC-2026-0001
 */
export function generateNumber(prefix: string, count: number): string {
  const year = new Date().getFullYear();
  const sequence = String(count + 1).padStart(4, '0');
  return `${prefix}-${year}-${sequence}`;
}

/**
 * Returns the long name of a month in Portuguese.
 */
export function monthName(monthIndex: number): string {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return months[monthIndex] || '';
}

/**
 * Gets the start of the month date as YYYY-MM-DD
 */
export function startOfMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Gets the end of the month date as YYYY-MM-DD
 */
export function endOfMonth(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const formattedMonth = String(month + 1).padStart(2, '0');
  return `${year}-${formattedMonth}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Compares if two date strings are on the same day.
 */
export function isSameDay(dateStr1: string, dateStr2: string): boolean {
  return dateStr1.split('T')[0] === dateStr2.split('T')[0];
}

/**
 * Parses numeric currency values from text input (e.g. R$ 150,00 -> 150).
 */
export function parseCurrencyInput(value: string): number {
  const clean = value.replace(/[^\d,.-]/g, '').replace(',', '.');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Adds an integer number of months to a YYYY-MM-DD date string, returning a new YYYY-MM-DD date string.
 */
export function addMonths(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1 + months, day);
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extracts the sequential catalog number from a service name (e.g., "01-Higienização..." -> 1).
 * If no number prefix is found but it's a Tapete service, returns 19 (official catalog position).
 */
export function extractServiceNumber(name: string): number {
  const match = (name || '').trim().match(/^(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  if (name && name.toLowerCase().includes('tapete')) {
    return 19;
  }
  return 999;
}

/**
 * Formats a numeric value into a 2-digit string (e.g., 1 -> "01", 19 -> "19").
 */
export function formatServiceNumber(num: number): string {
  if (isNaN(num) || num <= 0 || num >= 999) return '??';
  return String(num).padStart(2, '0');
}

/**
 * Separates the service number prefix and the actual clean title.
 */
export function parseServiceTitle(name: string, fallbackIndex?: number): { numberStr: string; cleanName: string } {
  const raw = (name || '').trim();
  const match = raw.match(/^(\d+)\s*[-–.]\s*(.*)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return {
      numberStr: formatServiceNumber(num),
      cleanName: match[2].trim(),
    };
  }
  const extracted = extractServiceNumber(raw);
  if (extracted !== 999) {
    return {
      numberStr: formatServiceNumber(extracted),
      cleanName: raw,
    };
  }
  const fallbackNum = (typeof fallbackIndex === 'number' && fallbackIndex >= 0) ? fallbackIndex + 1 : 99;
  return {
    numberStr: formatServiceNumber(fallbackNum),
    cleanName: raw,
  };
}

