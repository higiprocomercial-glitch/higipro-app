/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { DatabaseState, Quote, QuoteItem, ServiceOrder, Appointment, Client, ClientOrigin, SofaType, ServiceCategory, Transaction } from '../types';
import { saveDatabase } from './database';

export interface ParsedQuoteRow {
  index: number;
  dataOrcamento: string; // YYYY-MM-DD
  mes?: string;
  ano?: number;
  cliente: string;
  endereco?: string;
  complemento?: string;
  cidade?: string;
  fonte: string;
  origem: ClientOrigin;
  servico: string;
  fechou: boolean;
  valor: number;
  dataAgendamento?: string; // YYYY-MM-DD
  raw?: any;
}

export interface QuoteImportStats {
  totalQuotes: number;
  approvedQuotes: number;
  pendingQuotes: number;
  totalValor: number;
  approvedValor: number;
  newClientsCount: number;
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

  // If Excel numeric serial date
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

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

function capitalize(text: string): string {
  if (!text) return '';
  return text
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeServiceCategory(serv: string): { cat: ServiceCategory; estofado: SofaType } {
  const lower = (serv || '').toLowerCase();
  if (lower.includes('tapete')) {
    return { cat: 'Tapete', estofado: 'Tapete' };
  }
  if (lower.includes('imper')) {
    return { cat: 'Impermeabilização', estofado: 'Sofá' };
  }
  return { cat: 'Higienização', estofado: 'Sofá' };
}

function mapClientOrigin(fonte: string): ClientOrigin {
  const f = (fonte || '').toUpperCase().trim();
  if (f.includes('GOOGLE')) return 'Google';
  if (f.includes('FACEBOOK') || f.includes('META') || f.includes('INSTAGRAM')) return 'Meta Ads';
  return 'Outros';
}

/**
 * Parses raw tabular rows (matrix of cells) into structured quotes
 */
export function parseRawQuoteRows(rawRows: any[][]): ParsedQuoteRow[] {
  if (!rawRows || rawRows.length === 0) return [];

  // 1. Detect if first row is a header
  let startIndex = 0;
  const firstRow = rawRows[0].map(c => String(c || '').toLowerCase().trim());
  const hasHeader = firstRow.some(c => 
    c.includes('data') || c.includes('cliente') || c.includes('servi') || c.includes('valor') || c.includes('fechou')
  );

  let colMap = {
    data: -1,
    mes: -1,
    ano: -1,
    cliente: -1,
    endereco: -1,
    complemento: -1,
    cidade: -1,
    fonte: -1,
    servico: -1,
    fechou: -1,
    valor: -1,
    agendamento: -1,
  };

  if (hasHeader) {
    startIndex = 1;
    firstRow.forEach((h, idx) => {
      if (h.includes('agend')) colMap.agendamento = idx;
      else if (h.includes('data') || h === 'dt') colMap.data = idx;
      else if (h.includes('mês') || h.includes('mes')) colMap.mes = idx;
      else if (h.includes('ano')) colMap.ano = idx;
      else if (h.includes('client') || h.includes('nome')) colMap.cliente = idx;
      else if (h.includes('ender') || h.includes('rua')) colMap.endereco = idx;
      else if (h.includes('compl') || h.includes('bairro')) colMap.complemento = idx;
      else if (h.includes('cid')) colMap.cidade = idx;
      else if (h.includes('font') || h.includes('origem') || h.includes('canal')) colMap.fonte = idx;
      else if (h.includes('serv') || h.includes('item') || h.includes('descri')) colMap.servico = idx;
      else if (h.includes('fech') || h.includes('status') || h.includes('aprov')) colMap.fechou = idx;
      else if (h.includes('val') || h.includes('preço') || h.includes('total')) colMap.valor = idx;
    });
  }

  const results: ParsedQuoteRow[] = [];

  for (let i = startIndex; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0 || row.every(cell => cell === '' || cell === null || cell === undefined)) {
      continue;
    }

    let dataRaw = '';
    let mesRaw = '';
    let anoRaw = '2026';
    let clienteRaw = '';
    let enderecoRaw = '';
    let complementoRaw = '';
    let cidadeRaw = '';
    let fonteRaw = '';
    let servicoRaw = '';
    let fechouRaw = '';
    let valorRaw = '';
    let agendamentoRaw = '';

    if (hasHeader && colMap.data !== -1 && (colMap.cliente !== -1 || colMap.valor !== -1)) {
      dataRaw = colMap.data !== -1 ? row[colMap.data] : '';
      mesRaw = colMap.mes !== -1 ? row[colMap.mes] : '';
      anoRaw = colMap.ano !== -1 ? row[colMap.ano] : '2026';
      clienteRaw = colMap.cliente !== -1 ? row[colMap.cliente] : '';
      enderecoRaw = colMap.endereco !== -1 ? row[colMap.endereco] : '';
      complementoRaw = colMap.complemento !== -1 ? row[colMap.complemento] : '';
      cidadeRaw = colMap.cidade !== -1 ? row[colMap.cidade] : '';
      fonteRaw = colMap.fonte !== -1 ? row[colMap.fonte] : '';
      servicoRaw = colMap.servico !== -1 ? row[colMap.servico] : '';
      fechouRaw = colMap.fechou !== -1 ? row[colMap.fechou] : '';
      valorRaw = colMap.valor !== -1 ? row[colMap.valor] : '';
      agendamentoRaw = colMap.agendamento !== -1 ? row[colMap.agendamento] : '';
    } else {
      // Positional Fallbacks
      // Format 11 cols: [Data, Mes, Ano, Cliente, Endereço, Complemento, Fonte, Serviço, Fechou, Valor, Agendamento]
      if (row.length >= 11) {
        [dataRaw, mesRaw, anoRaw, clienteRaw, enderecoRaw, complementoRaw, fonteRaw, servicoRaw, fechouRaw, valorRaw, agendamentoRaw] = row;
      }
      // Format 9 cols: [Data, Mes, Ano, Cliente, Fonte, Serviço, Fechou, Valor, Agendamento]
      else if (row.length === 9 || row.length === 10) {
        [dataRaw, mesRaw, anoRaw, clienteRaw, fonteRaw, servicoRaw, fechouRaw, valorRaw, agendamentoRaw] = row;
      }
      // Format 6-8 cols: [Data, Cliente, Origem, Servico, Fechou, Valor, Agendamento]
      else if (row.length >= 6) {
        dataRaw = row[0];
        clienteRaw = row[1];
        fonteRaw = row[2];
        servicoRaw = row[3];
        fechouRaw = row[4];
        valorRaw = row[5];
        agendamentoRaw = row[6] || '';
      } else {
        continue;
      }
    }

    const dataOrcamento = parseDate(dataRaw);
    const dataAgendamento = agendamentoRaw ? parseDate(agendamentoRaw) : undefined;
    const fechouStr = String(fechouRaw || '').toLowerCase().trim();
    const fechou = fechouStr === 'sim' || fechouStr === 's' || fechouStr === 'yes' || fechouStr === 'true' || fechouStr === 'aprovado' || fechouStr === 'fechado';
    const valor = parseCurrency(valorRaw);

    const rawClienteStr = String(clienteRaw || '').trim();
    const cliente = rawClienteStr ? capitalize(rawClienteStr) : `Lead Orçamento #${results.length + 1}`;
    const origem = mapClientOrigin(String(fonteRaw || ''));
    
    let cidade = String(cidadeRaw || '').trim();
    if (!cidade) {
      if (String(complementoRaw || '').toLowerCase().includes('marau')) {
        cidade = 'Marau';
      } else {
        cidade = 'Passo Fundo';
      }
    }

    const endereco = String(enderecoRaw || '').trim() || (complementoRaw ? String(complementoRaw).trim() : `${cidade} - RS`);

    results.push({
      index: results.length + 1,
      dataOrcamento,
      mes: String(mesRaw || ''),
      ano: parseInt(String(anoRaw), 10) || 2026,
      cliente,
      endereco,
      complemento: String(complementoRaw || ''),
      cidade,
      fonte: String(fonteRaw || ''),
      origem,
      servico: String(servicoRaw || 'Higienização').trim(),
      fechou,
      valor,
      dataAgendamento: dataAgendamento || (fechou ? dataOrcamento : undefined),
      raw: row,
    });
  }

  return results;
}

/**
 * Parses raw CSV/TSV text into quote rows
 */
export function parseQuoteText(text: string): ParsedQuoteRow[] {
  if (!text || !text.trim()) return [];

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const delimiter = text.includes(';') ? ';' : (text.includes('\t') ? '\t' : ',');

  const rawRows: any[][] = lines.map(line => {
    return line.split(delimiter).map(cell => cell.trim());
  });

  return parseRawQuoteRows(rawRows);
}

/**
 * Parses Excel file (.xlsx, .xls) into quote rows
 */
export async function parseQuoteFile(file: File): Promise<ParsedQuoteRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
    const text = await file.text();
    return parseQuoteText(text);
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
  return parseRawQuoteRows(rawRows);
}

/**
 * Computes summary statistics for a list of parsed quotes
 */
export function computeQuoteImportStats(rows: ParsedQuoteRow[], existingClients: Client[] = []): QuoteImportStats {
  const existingNames = new Set(existingClients.map(c => (c.nome || '').toLowerCase().trim()));
  let newClientsCount = 0;
  const countedNames = new Set<string>();

  let totalValor = 0;
  let approvedValor = 0;
  let approvedQuotes = 0;

  rows.forEach(r => {
    totalValor += r.valor;
    if (r.fechou) {
      approvedQuotes += 1;
      approvedValor += r.valor;
    }

    const lower = r.cliente.toLowerCase().trim();
    if (!existingNames.has(lower) && !countedNames.has(lower)) {
      countedNames.add(lower);
      newClientsCount += 1;
    }
  });

  return {
    totalQuotes: rows.length,
    approvedQuotes,
    pendingQuotes: rows.length - approvedQuotes,
    totalValor,
    approvedValor,
    newClientsCount,
  };
}

/**
 * Applies parsed quote rows into the database, synchronizing quotes, items, CRM clients,
 * service orders, appointments, and financial records.
 */
export function applyImportedQuotesToDb(
  db: DatabaseState,
  rows: ParsedQuoteRow[],
  createFinancialTx: boolean = true
): DatabaseState {
  const existingClients = [...(db.clients || [])];
  const clientMap = new Map<string, Client>();
  existingClients.forEach(c => {
    if (c.nome) {
      clientMap.set(c.nome.toLowerCase().trim(), c);
    }
  });

  const newClients: Client[] = [];
  const generatedQuotes: Quote[] = [];
  const generatedQuoteItems: QuoteItem[] = [];
  const generatedServiceOrders: ServiceOrder[] = [];
  const generatedAppointments: Appointment[] = [];
  const generatedTransactions: Transaction[] = [];

  const maxQuoteNum = (db.quotes || []).reduce((max, q) => {
    const num = parseInt((q.numero || '').replace(/\D/g, ''), 10);
    return !isNaN(num) && num > max ? num : max;
  }, 100);

  const maxOsNum = (db.serviceOrders || []).reduce((max, os) => {
    const num = parseInt((os.numero || '').replace(/\D/g, ''), 10);
    return !isNaN(num) && num > max ? num : max;
  }, 200);

  rows.forEach((row, idx) => {
    const lowerName = row.cliente.toLowerCase().trim();
    let client = clientMap.get(lowerName);

    if (!client) {
      client = existingClients.find(c => {
        if (!c.nome) return false;
        return c.nome.toLowerCase().trim() === lowerName;
      });
    }

    if (!client) {
      const newClientId = `client-imp-${Date.now()}-${idx + 1}`;
      const { cat, estofado } = normalizeServiceCategory(row.servico);

      const newClientRecord: Client = {
        id: newClientId,
        nome: row.cliente,
        telefone: '(54) 99140-0553',
        email: '',
        endereco: row.endereco || `${row.cidade || 'Passo Fundo'} - RS`,
        cidade: row.cidade || 'Passo Fundo',
        estado: 'RS',
        CEP: '99010-000',
        observacoes: row.complemento ? `Lead captado via ${row.origem} (${row.complemento})` : `Lead captado via ${row.origem}`,
        origem: row.origem,
        tags: [row.fechou ? 'Cliente Fechado' : 'Orçamento Pendente', `Origem: ${row.origem}`],
        created_at: `${row.dataOrcamento}T09:00:00.000Z`,
        historico_servicos: [
          {
            id: `hist-imp-${Date.now()}-${idx + 1}`,
            nome_servico: row.servico,
            servico: row.servico,
            categoria: cat,
            tipo_estofado: estofado,
            valor: row.valor,
            data: row.fechou && row.dataAgendamento ? row.dataAgendamento : row.dataOrcamento,
            tipo: row.fechou ? 'servico' : 'orcamento',
            status: row.fechou ? 'concluido' : 'orcado',
            observacoes: row.fechou
              ? `Serviço realizado em ${row.dataAgendamento || row.dataOrcamento} (Orçamento fechado R$ ${row.valor})`
              : `Orçamento realizado em ${row.dataOrcamento} no valor de R$ ${row.valor}`,
          },
        ],
        total_gasto: row.fechou ? row.valor : 0,
        total_pedidos: row.fechou ? 1 : 0,
        ultimo_servico: row.fechou ? (row.dataAgendamento || row.dataOrcamento) : undefined,
      };

      newClients.push(newClientRecord);
      existingClients.push(newClientRecord);
      clientMap.set(lowerName, newClientRecord);
      client = newClientRecord;
    } else {
      if (client.origem === 'Outros' && row.origem !== 'Outros') {
        client.origem = row.origem;
      }
      if (row.fechou) {
        client.total_gasto = (client.total_gasto || 0) + row.valor;
        client.total_pedidos = (client.total_pedidos || 0) + 1;
        client.ultimo_servico = row.dataAgendamento || row.dataOrcamento;
      }
    }

    const quoteId = `quote-imp-${Date.now()}-${idx + 1}`;
    const quoteNumero = `ORC-2026-${String(maxQuoteNum + idx + 1).padStart(3, '0')}`;
    const osNumero = `OS-2026-${String(maxOsNum + idx + 1).padStart(3, '0')}`;
    const osId = `os-imp-${Date.now()}-${idx + 1}`;
    const appointmentId = `app-imp-${Date.now()}-${idx + 1}`;

    const quoteDate = new Date(`${row.dataOrcamento}T09:00:00Z`);
    const validUntil = new Date(quoteDate);
    validUntil.setDate(validUntil.getDate() + 15);
    const validadeStr = validUntil.toISOString().split('T')[0];

    const quote: Quote = {
      id: quoteId,
      numero: quoteNumero,
      client_id: client.id,
      client_name: client.nome,
      status: row.fechou ? 'aprovado' : 'enviado',
      subtotal: row.valor,
      total: row.valor,
      observacoes: row.fechou
        ? `Orçamento Fechado! Serviço agendado para o dia ${row.dataAgendamento || row.dataOrcamento}. Origem: ${row.origem}.`
        : `Orçamento enviado ao cliente. Origem: ${row.origem}. Aguardando fechamento/follow-up.`,
      validade: validadeStr,
      created_at: `${row.dataOrcamento}T09:00:00.000Z`,
      enviado_em: `${row.dataOrcamento}T09:15:00.000Z`,
      follow_up_status: row.fechou ? 'respondido' : 'pendente',
    };
    generatedQuotes.push(quote);

    const quoteItem: QuoteItem = {
      id: `item-quote-imp-${Date.now()}-${idx + 1}`,
      quote_id: quoteId,
      service_id: 'serv-hig-sofa',
      descricao: row.servico,
      qtd: 1,
      preco_unit: row.valor,
      subtotal: row.valor,
    };
    generatedQuoteItems.push(quoteItem);

    if (row.fechou) {
      const scheduledDate = row.dataAgendamento || row.dataOrcamento;
      const isFuture = scheduledDate > '2026-09-26';

      const serviceOrder: ServiceOrder = {
        id: osId,
        numero: osNumero,
        quote_id: quoteId,
        quote_numero: quoteNumero,
        client_id: client.id,
        client_name: client.nome,
        client_phone: client.telefone || '+55 (54) 99140-0553',
        status: isFuture ? 'agendado' : 'concluido',
        total: row.valor,
        pago: isFuture ? 0 : row.valor,
        data_agendada: `${scheduledDate}T14:00`,
        data_conclusao: isFuture ? undefined : scheduledDate,
        tecnico: 'Equipe Higipro 01',
        endereco: client.endereco || `${row.cidade || 'Passo Fundo'} - RS`,
        observacoes: `Ordem de Serviço gerada do ${quoteNumero} (${row.servico}). Origem: ${row.origem}.`,
        created_at: `${row.dataOrcamento}T09:00:00.000Z`,
      };
      generatedServiceOrders.push(serviceOrder);

      const appointment: Appointment = {
        id: appointmentId,
        os_id: osId,
        client_id: client.id,
        client_name: client.nome,
        servicos: row.servico,
        data_hora: `${scheduledDate}T14:00`,
        duracao: 120,
        status: isFuture ? 'confirmado' : 'concluido',
        tecnico: 'Equipe Higipro 01',
        endereco: client.endereco || `${row.cidade || 'Passo Fundo'} - RS`,
        observacoes: `Agendamento ${isFuture ? 'confirmado' : 'concluído'} do orçamento ${quoteNumero} (${row.servico}).`,
        valor: row.valor,
      };
      generatedAppointments.push(appointment);

      if (createFinancialTx) {
        const txId = `tx-imp-quote-${Date.now()}-${idx + 1}`;
        const tx: Transaction = {
          id: txId,
          tipo: 'receita',
          categoria: row.servico.includes('Imper') ? 'Impermeabilização' : (row.servico.includes('Tapete') ? 'Tapete' : 'Higienização'),
          descricao: `${row.servico} - ${client.nome}`,
          valor: row.valor,
          data: scheduledDate,
          metodo_pagamento: 'Pix',
          status: 'pago',
          client_id: client.id,
          client_name: client.nome,
          created_at: `${scheduledDate}T12:00:00.000Z`,
        };
        generatedTransactions.push(tx);
      }
    }
  });

  // Ensure unique clients by id
  const seenClientIds = new Set<string>();
  const finalClients: Client[] = [];
  for (const c of existingClients) {
    if (!seenClientIds.has(c.id)) {
      seenClientIds.add(c.id);
      finalClients.push(c);
    }
  }

  const updatedState: DatabaseState = {
    ...db,
    clients: finalClients,
    quotes: [...generatedQuotes, ...(db.quotes || [])],
    quoteItems: [...generatedQuoteItems, ...(db.quoteItems || [])],
    serviceOrders: [...generatedServiceOrders, ...(db.serviceOrders || [])],
    appointments: [...generatedAppointments, ...(db.appointments || [])],
    transactions: [...generatedTransactions, ...(db.transactions || [])],
  };

  saveDatabase(updatedState);
  return updatedState;
}
