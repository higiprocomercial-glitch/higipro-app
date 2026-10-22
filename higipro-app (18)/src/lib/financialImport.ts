/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { DatabaseState, Transaction, Client, TransactionType, PaymentMethod, TransactionStatus } from '../types';
import { saveDatabase } from './database';

export interface ParsedFinancialRow {
  data: string; // YYYY-MM-DD
  tipo: 'ENTRADA' | 'SAIDA';
  categoria: string;
  clienteOuDescricao: string;
  valor: number;
  metodoPagamento?: PaymentMethod;
  status?: TransactionStatus;
  raw?: any;
}

export interface FinancialImportStats {
  totalRows: number;
  receitasCount: number;
  despesasCount: number;
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
  newClientsCount: number;
  newTxCount: number;
  updatedTxCount: number;
  affectedMonthYear?: { year: number; month: number };
}

function parseCurrency(val: any): number {
  if (typeof val === 'number') return Math.abs(val);
  if (!val) return 0;
  const str = String(val)
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.abs(num);
}

function parseDate(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0];

  // If Excel numeric date serial
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }

  const str = String(val).trim();
  // Match DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Match YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try standard Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

function normalizeTipo(tipoVal: any, valorVal?: any): 'ENTRADA' | 'SAIDA' {
  const str = String(tipoVal || '').trim().toUpperCase();
  if (str.includes('ENTR') || str.includes('REC') || str.includes('CRED') || str === 'E' || str === '+') {
    return 'ENTRADA';
  }
  if (str.includes('SAI') || str.includes('DESP') || str.includes('DEB') || str === 'S' || str === '-') {
    return 'SAIDA';
  }
  // Check if value was negative
  if (typeof valorVal === 'number' && valorVal < 0) {
    return 'SAIDA';
  }
  if (typeof valorVal === 'string' && valorVal.includes('-')) {
    return 'SAIDA';
  }
  return 'ENTRADA';
}

function normalizeCategory(catVal: any, tipo: 'ENTRADA' | 'SAIDA', descVal: string): string {
  const c = String(catVal || '').trim();
  if (c) {
    const lower = c.toLowerCase();
    if (lower.includes('higieniza')) return 'Higienização';
    if (lower.includes('impermeabili')) return 'Impermeabilização';
    if (lower.includes('tapete')) return 'Tapete';
    if (lower.includes('combo')) return c;
    if (lower.includes('google')) return 'Google';
    if (lower.includes('meta') || lower.includes('face') || lower.includes('insta')) return 'Facebook';
    if (lower.includes('combust')) return 'Combustível';
    if (lower.includes('produto') || lower.includes('insumo')) return 'Compra de produtos';
    if (lower.includes('funcion') || lower.includes('diaria') || lower.includes('salario')) return 'Funcionários';
    if (lower.includes('estaciona')) return 'Estacionamento';
    return c;
  }

  // Infer from description
  const dLower = descVal.toLowerCase();
  if (tipo === 'ENTRADA') {
    if (dLower.includes('tapete')) return 'Tapetes';
    if (dLower.includes('imper')) return 'Impermeabilização';
    return 'Higienização';
  } else {
    if (dLower.includes('combust') || dLower.includes('gasolin') || dLower.includes('posto')) return 'Combustível';
    if (dLower.includes('google')) return 'Google';
    if (dLower.includes('facebook') || dLower.includes('meta')) return 'Facebook';
    if (dLower.includes('produto') || dLower.includes('quimico') || dLower.includes('insumo')) return 'Compra de produtos';
    if (dLower.includes('estaciona')) return 'Estacionamento';
    if (dLower.includes('diaria') || dLower.includes('salario') || dLower.includes('funcio')) return 'Funcionários';
    return 'Outros';
  }
}

/**
 * Parses raw text (CSV, TSV, or semicolon-delimited) into structured financial rows
 */
export function parseFinancialText(rawText: string): ParsedFinancialRow[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Detect delimiter (; , \t)
  const firstLine = lines[0];
  const countSemi = (firstLine.match(/;/g) || []).length;
  const countTab = (firstLine.match(/\t/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;

  let delimiter = ';';
  if (countTab > countSemi && countTab > countComma) delimiter = '\t';
  else if (countComma > countSemi && countComma > countTab && countComma > 2) delimiter = ',';

  // Check if first row is header
  const firstLineCols = firstLine.split(delimiter).map(c => c.trim().toLowerCase());
  const hasHeader = firstLineCols.some(c => 
    c.includes('data') || c.includes('tipo') || c.includes('cliente') || c.includes('valor') || c.includes('categ')
  );

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: ParsedFinancialRow[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const cols = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) continue;

    // Pattern 1: [data, tipo, categoria, cliente, valor] (Standard HigiPro Pasta1 / September format)
    if (cols.length >= 4) {
      let dataCol = cols[0];
      let tipoCol = cols[1];
      let catCol = cols[2];
      let clientCol = cols[3];
      let valCol = cols[4] !== undefined ? cols[4] : cols[3];

      // If cols[1] is not tipo, check if cols[0] is date
      const isCols1Tipo = /entrada|saida|receita|despesa/i.test(tipoCol);
      if (!isCols1Tipo && /entrada|saida|receita|despesa/i.test(cols[2])) {
        // [data, categoria, tipo, cliente, valor]
        tipoCol = cols[2];
        catCol = cols[1];
      }

      const tipo = normalizeTipo(tipoCol, valCol);
      const parsedVal = parseCurrency(valCol);
      const parsedDt = parseDate(dataCol);
      const descOrClient = clientCol || (tipo === 'ENTRADA' ? 'Cliente Avulso' : catCol);
      const categoria = normalizeCategory(catCol, tipo, descOrClient);

      if (parsedVal > 0 || descOrClient) {
        rows.push({
          data: parsedDt,
          tipo,
          categoria,
          clienteOuDescricao: descOrClient,
          valor: parsedVal,
        });
      }
    } else if (cols.length >= 2) {
      // Shorter line [data, valor, ...]
      const parsedDt = parseDate(cols[0]);
      const parsedVal = parseCurrency(cols[1]);
      const tipo = normalizeTipo(cols[2] || '', cols[1]);
      rows.push({
        data: parsedDt,
        tipo,
        categoria: normalizeCategory(cols[2] || '', tipo, ''),
        clienteOuDescricao: cols[3] || 'Lançamento',
        valor: parsedVal,
      });
    }
  }

  return rows;
}

/**
 * Parses an Excel file (.xlsx, .xls) or .csv File object
 */
export async function parseFinancialFile(file: File): Promise<ParsedFinancialRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          resolve([]);
          return;
        }

        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (!rawJson || rawJson.length === 0) {
          resolve([]);
          return;
        }

        // Detect column positions
        const header = (rawJson[0] || []).map((h: any) => String(h || '').trim().toLowerCase());
        const dateIdx = header.findIndex(h => h.includes('data') || h.includes('dia') || h.includes('date'));
        const tipoIdx = header.findIndex(h => h.includes('tipo') || h.includes('natureza') || h.includes('e/s'));
        const catIdx = header.findIndex(h => h.includes('categ') || h.includes('classifica') || h.includes('servi'));
        const clientIdx = header.findIndex(h => h.includes('client') || h.includes('descri') || h.includes('favorec') || h.includes('fornece') || h.includes('nome'));
        const valIdx = header.findIndex(h => h.includes('val') || h.includes('pre') || h.includes('total') || h.includes('quantia'));

        const rows: ParsedFinancialRow[] = [];
        const dataRows = (dateIdx >= 0 || tipoIdx >= 0 || valIdx >= 0) ? rawJson.slice(1) : rawJson;

        dataRows.forEach((row) => {
          if (!row || row.length === 0) return;

          const rawDate = dateIdx >= 0 ? row[dateIdx] : row[0];
          const rawTipo = tipoIdx >= 0 ? row[tipoIdx] : (row.length >= 5 ? row[1] : undefined);
          const rawCat = catIdx >= 0 ? row[catIdx] : (row.length >= 5 ? row[2] : undefined);
          const rawClient = clientIdx >= 0 ? row[clientIdx] : (row.length >= 5 ? row[3] : undefined);
          const rawVal = valIdx >= 0 ? row[valIdx] : (row.length >= 5 ? row[4] : row[1]);

          const parsedDt = parseDate(rawDate);
          const tipo = normalizeTipo(rawTipo, rawVal);
          const parsedVal = parseCurrency(rawVal);
          const descOrClient = String(rawClient || '').trim() || (tipo === 'ENTRADA' ? 'Cliente' : String(rawCat || 'Despesa'));
          const categoria = normalizeCategory(rawCat, tipo, descOrClient);

          if (parsedVal > 0 || descOrClient) {
            rows.push({
              data: parsedDt,
              tipo,
              categoria,
              clienteOuDescricao: descOrClient,
              valor: parsedVal,
            });
          }
        });

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Merges imported rows into the DatabaseState, creates/updates CRM clients,
 * generates transactions, and saves changes.
 */
export function applyImportedFinancialTransactions(
  db: DatabaseState,
  rows: ParsedFinancialRow[]
): { updatedDb: DatabaseState; stats: FinancialImportStats } {
  if (!rows || rows.length === 0) {
    return {
      updatedDb: db,
      stats: {
        totalRows: 0,
        receitasCount: 0,
        despesasCount: 0,
        totalReceitas: 0,
        totalDespesas: 0,
        saldo: 0,
        newClientsCount: 0,
        newTxCount: 0,
        updatedTxCount: 0,
      },
    };
  }

  const existingClients = Array.isArray(db.clients) ? [...db.clients] : [];
  const existingTransactions = Array.isArray(db.transactions) ? [...db.transactions] : [];

  const clientMap = new Map<string, Client>();
  existingClients.forEach(c => {
    if (c.nome) {
      clientMap.set(c.nome.toLowerCase().trim(), c);
    }
  });

  const newClients: Client[] = [];
  let receitasCount = 0;
  let despesasCount = 0;
  let totalReceitas = 0;
  let totalDespesas = 0;
  let newTxCount = 0;
  let updatedTxCount = 0;

  let sampleYear: number | undefined;
  let sampleMonth: number | undefined;

  const importedTransactions: Transaction[] = [];

  rows.forEach((row, idx) => {
    const isReceita = row.tipo === 'ENTRADA';
    const val = row.valor;

    if (isReceita) {
      receitasCount++;
      totalReceitas += val;
    } else {
      despesasCount++;
      totalDespesas += val;
    }

    if (!sampleYear && row.data) {
      const parts = row.data.split('-');
      if (parts.length >= 2) {
        sampleYear = parseInt(parts[0], 10);
        sampleMonth = parseInt(parts[1], 10) - 1; // 0-indexed month
      }
    }

    let clientId: string | undefined = undefined;
    let clientName: string | undefined = undefined;

    if (isReceita && row.clienteOuDescricao) {
      const lower = row.clienteOuDescricao.toLowerCase().trim();
      let matched = clientMap.get(lower);
      if (!matched) {
        matched = existingClients.find(c => 
          c.nome && (c.nome.toLowerCase().includes(lower) || lower.includes(c.nome.toLowerCase()))
        );
      }

      if (matched) {
        clientId = matched.id;
        clientName = matched.nome;
      } else {
        const newClientId = `client-imp-${Date.now()}-${String(idx + 1).padStart(2, '0')}`;
        const newClient: Client = {
          id: newClientId,
          nome: row.clienteOuDescricao,
          telefone: '',
          email: '',
          endereco: 'Passo Fundo - RS',
          cidade: 'Passo Fundo',
          estado: 'RS',
          CEP: '99010-000',
          observacoes: 'Cadastrado automaticamente via importação de planilha financeira',
          origem: row.categoria === 'Google' ? 'Google' : 'Meta Ads',
          tags: ['Cliente Ativo', 'Planilha Financeiro'],
          created_at: `${row.data}T08:00:00.000Z`,
          historico_servicos: [
            {
              id: `hist-imp-${Date.now()}-${String(idx + 1).padStart(2, '0')}`,
              nome_servico: row.categoria,
              servico: row.categoria,
              categoria: row.categoria.includes('Imper') ? 'Impermeabilização' : (row.categoria.includes('Tapete') ? 'Tapete' : 'Higienização'),
              tipo_estofado: row.categoria.includes('Tapete') ? 'Tapete' : 'Sofá',
              valor: val,
              data: row.data,
              tipo: 'servico',
              status: 'concluido',
              observacoes: `Lançamento de ${row.categoria} importado`,
            },
          ],
          total_gasto: val,
          total_pedidos: 1,
          ultimo_servico: row.data,
        };
        newClients.push(newClient);
        clientMap.set(lower, newClient);
        existingClients.push(newClient);
        clientId = newClient.id;
        clientName = newClient.nome;
      }
    }

    let descricao = '';
    if (isReceita) {
      descricao = clientName ? `${row.categoria} - ${clientName}` : `${row.categoria} (${row.clienteOuDescricao || 'Avulso'})`;
    } else {
      if (row.categoria === 'Compra de produtos') descricao = 'Compra de produtos e insumos de higienização';
      else if (row.categoria === 'Estacionamento') descricao = 'Estacionamento em atendimento externo';
      else if (row.categoria === 'Combustível') descricao = 'Abastecimento combustível frota';
      else if (row.categoria === 'Facebook') descricao = 'Anúncios Facebook / Meta Ads';
      else if (row.categoria === 'Google') descricao = 'Campanha Google Ads';
      else if (row.categoria === 'Funcionários') descricao = 'Pagamento funcionários / diárias equipe';
      else descricao = row.clienteOuDescricao || row.categoria;
    }

    // Deduplication check against existing transactions:
    // Same date, same value, same type, and similar description or category
    const existingIndex = existingTransactions.findIndex(t => {
      if (t.data !== row.data) return false;
      if (t.tipo !== (isReceita ? 'receita' : 'despesa')) return false;
      if (Math.abs(t.valor - val) > 0.01) return false;
      
      const tDesc = (t.descricao || '').toLowerCase();
      const newDesc = descricao.toLowerCase();
      const tCat = (t.categoria || '').toLowerCase();
      const newCat = row.categoria.toLowerCase();
      
      return tDesc === newDesc || tCat === newCat || (clientName && tDesc.includes(clientName.toLowerCase()));
    });

    if (existingIndex >= 0) {
      // Update existing transaction
      const existing = existingTransactions[existingIndex];
      existingTransactions[existingIndex] = {
        ...existing,
        categoria: row.categoria,
        descricao,
        valor: val,
        data: row.data,
        client_id: clientId || existing.client_id,
        client_name: clientName || existing.client_name,
        status: 'pago',
      };
      updatedTxCount++;
    } else {
      // Add new transaction
      const newTx: Transaction = {
        id: `tx-imp-${Date.now()}-${String(idx + 1).padStart(3, '0')}`,
        tipo: isReceita ? 'receita' : 'despesa',
        categoria: row.categoria,
        descricao,
        valor: val,
        data: row.data,
        metodo_pagamento: (row.categoria === 'Facebook' || row.categoria === 'Google') ? 'Cartão' : 'Pix',
        status: 'pago',
        client_id: clientId,
        client_name: clientName,
        created_at: `${row.data}T12:00:00.000Z`,
      };
      existingTransactions.push(newTx);
      newTxCount++;
    }
  });

  const updatedDb: DatabaseState = {
    ...db,
    clients: existingClients,
    transactions: existingTransactions,
  };

  // Save to persistent storage
  saveDatabase(updatedDb);

  const stats: FinancialImportStats = {
    totalRows: rows.length,
    receitasCount,
    despesasCount,
    totalReceitas,
    totalDespesas,
    saldo: totalReceitas - totalDespesas,
    newClientsCount: newClients.length,
    newTxCount,
    updatedTxCount,
    affectedMonthYear: sampleYear !== undefined && sampleMonth !== undefined ? { year: sampleYear, month: sampleMonth } : undefined,
  };

  return { updatedDb, stats };
}
