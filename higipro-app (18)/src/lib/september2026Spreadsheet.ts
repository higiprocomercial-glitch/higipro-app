/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction, Client, DatabaseState } from '../types';

export interface SpreadsheetRow {
  data: string; // YYYY-MM-DD
  tipo: 'ENTRADA' | 'SAIDA';
  categoria: string;
  cliente: string;
  valor: number;
}

export const SEPTEMBER_2026_RAW_DATA: SpreadsheetRow[] = [
  { data: '2026-09-01', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Tauana', valor: 830.00 },
  { data: '2026-09-01', tipo: 'SAIDA', categoria: 'Compra de produtos', cliente: '', valor: 150.00 },
  { data: '2026-09-01', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Salete', valor: 150.00 },
  { data: '2026-09-01', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Mariana', valor: 295.00 },
  { data: '2026-09-02', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Williwm', valor: 380.00 },
  { data: '2026-09-02', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Douglas', valor: 380.00 },
  { data: '2026-09-02', tipo: 'SAIDA', categoria: 'Estacionamento', cliente: '', valor: 20.00 },
  { data: '2026-09-02', tipo: 'SAIDA', categoria: 'Combustível', cliente: '', valor: 100.00 },
  { data: '2026-09-03', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Bianca', valor: 245.00 },
  { data: '2026-09-03', tipo: 'SAIDA', categoria: 'Facebook', cliente: '', valor: 200.00 },
  { data: '2026-09-04', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Wilson', valor: 165.00 },
  { data: '2026-09-04', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Evanir', valor: 360.00 },
  { data: '2026-09-04', tipo: 'ENTRADA', categoria: 'Combo Hig + Tapete', cliente: 'Le', valor: 688.00 },
  { data: '2026-09-04', tipo: 'ENTRADA', categoria: 'Impermeabilização', cliente: 'Eduardo', valor: 759.00 },
  { data: '2026-09-04', tipo: 'SAIDA', categoria: 'Combustível', cliente: '', valor: 120.00 },
  { data: '2026-09-04', tipo: 'SAIDA', categoria: 'Facebook', cliente: '', valor: 200.00 },
  { data: '2026-09-05', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Dalva', valor: 220.00 },
  { data: '2026-09-06', tipo: 'SAIDA', categoria: 'Compra de produtos', cliente: '', valor: 638.00 },
  { data: '2026-09-08', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Residencial', valor: 185.00 },
  { data: '2026-09-08', tipo: 'ENTRADA', categoria: 'Higienização', cliente: '', valor: 440.00 },
  { data: '2026-09-09', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Simone', valor: 380.00 },
  { data: '2026-09-09', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Josi', valor: 280.00 },
  { data: '2026-09-09', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Fernanda', valor: 380.00 },
  { data: '2026-09-09', tipo: 'SAIDA', categoria: 'Combustível', cliente: '', valor: 100.00 },
  { data: '2026-09-09', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Dieison', valor: 160.00 },
  { data: '2026-09-10', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Milli', valor: 230.00 },
  { data: '2026-09-10', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Tamara', valor: 240.00 },
  { data: '2026-09-10', tipo: 'ENTRADA', categoria: 'Combo Hig + Imp', cliente: 'Tais', valor: 740.00 },
  { data: '2026-09-11', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Thalita', valor: 445.00 },
  { data: '2026-09-11', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Cristiane', valor: 325.00 },
  { data: '2026-09-11', tipo: 'SAIDA', categoria: 'Combustível', cliente: '', valor: 100.00 },
  { data: '2026-09-11', tipo: 'SAIDA', categoria: 'Facebook', cliente: '', valor: 200.00 },
  { data: '2026-09-11', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Marinete', valor: 245.00 },
  { data: '2026-09-12', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Morgana', valor: 250.00 },
  { data: '2026-09-14', tipo: 'SAIDA', categoria: 'Facebook', cliente: '', valor: 200.00 },
  { data: '2026-09-14', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Sofa', valor: 270.00 },
  { data: '2026-09-14', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Tassiara', valor: 260.00 },
  { data: '2026-09-12', tipo: 'SAIDA', categoria: 'Funcionários', cliente: '', valor: 634.00 },
  { data: '2026-09-15', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Lorien', valor: 970.00 },
  { data: '2026-09-15', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Elaine Pimentel', valor: 280.00 },
  { data: '2026-09-15', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Diehl', valor: 330.00 },
  { data: '2026-09-15', tipo: 'SAIDA', categoria: 'Combustível', cliente: '', valor: 100.00 },
  { data: '2026-09-16', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Joanne', valor: 470.00 },
  { data: '2026-09-16', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Vera', valor: 245.00 },
  { data: '2026-09-16', tipo: 'SAIDA', categoria: 'Facebook', cliente: '', valor: 200.00 },
  { data: '2026-09-17', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Aiko', valor: 460.00 },
  { data: '2026-09-17', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Adriely Merlot', valor: 395.00 },
  { data: '2026-09-16', tipo: 'ENTRADA', categoria: 'Tapetes', cliente: 'Janesca', valor: 385.00 },
  { data: '2026-09-19', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Juliana', valor: 230.00 },
  { data: '2026-09-19', tipo: 'SAIDA', categoria: 'Funcionários', cliente: '', valor: 642.30 },
  { data: '2026-09-19', tipo: 'SAIDA', categoria: 'Google', cliente: '', valor: 100.00 },
  { data: '2026-09-19', tipo: 'SAIDA', categoria: 'Facebook', cliente: '', valor: 250.00 },
  { data: '2026-09-21', tipo: 'SAIDA', categoria: 'Combustível', cliente: '', valor: 100.00 },
  { data: '2026-09-21', tipo: 'SAIDA', categoria: 'Google', cliente: '', valor: 100.00 },
  { data: '2026-09-21', tipo: 'SAIDA', categoria: 'Google', cliente: '', valor: 100.00 },
  { data: '2026-09-22', tipo: 'SAIDA', categoria: 'Google', cliente: '', valor: 100.00 },
  { data: '2026-09-22', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Anjos', valor: 250.00 },
  { data: '2026-09-23', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Lisi', valor: 285.00 },
  { data: '2026-09-28', tipo: 'ENTRADA', categoria: 'Higienização', cliente: 'Clesiane', valor: 535.00 },
];

/**
 * Builds the official list of transactions for September 2026 linked with CRM clients
 */
export const buildSeptember2026Transactions = (existingClients: Client[]): { transactions: Transaction[]; newClients: Client[] } => {
  const transactions: Transaction[] = [];
  const newClients: Client[] = [];
  const clientMap = new Map<string, Client>();

  // Index existing clients by lowercase name
  existingClients.forEach(c => {
    if (c.nome) {
      clientMap.set(c.nome.toLowerCase().trim(), c);
    }
  });

  SEPTEMBER_2026_RAW_DATA.forEach((row, index) => {
    const id = `tx-set2026-${String(index + 1).padStart(2, '0')}`;
    let clientId: string | undefined = undefined;
    let clientName: string | undefined = undefined;

    if (row.cliente) {
      const lowerName = row.cliente.toLowerCase().trim();
      let matched = clientMap.get(lowerName);

      if (!matched) {
        // Safe matching
        matched = existingClients.find(c => {
          if (!c.nome) return false;
          const cn = c.nome.toLowerCase().trim();
          if (cn === lowerName) return true;
          if (cn.length >= 5 && lowerName.length >= 5) {
            return cn.includes(lowerName) || lowerName.includes(cn);
          }
          return false;
        });
      }

      if (matched) {
        clientId = matched.id;
        clientName = matched.nome;
      } else {
        // Create new client in CRM
        const newClient: Client = {
          id: `client-set2026-${String(index + 1).padStart(2, '0')}`,
          nome: row.cliente,
          telefone: '',
          email: '',
          endereco: 'Passo Fundo - RS',
          cidade: 'Passo Fundo',
          estado: 'RS',
          CEP: '99010-000',
          observacoes: 'Cliente cadastrado via importação de planilha de lançamentos',
          origem: (row.categoria === 'Google' || index % 2 === 0) ? 'Google' : 'Meta Ads',
          tags: ['Cliente Ativo', 'Planilha Setembro 2026'],
          created_at: `${row.data}T08:00:00.000Z`,
          historico_servicos: [
            {
              id: `hist-set2026-${String(index + 1).padStart(2, '0')}`,
              nome_servico: row.categoria,
              servico: row.categoria,
              categoria: row.categoria.includes('Imper') ? 'Impermeabilização' : (row.categoria.includes('Tapete') ? 'Tapete' : 'Higienização'),
              tipo_estofado: row.categoria.includes('Tapete') ? 'Tapete' : 'Sofá',
              valor: row.valor,
              data: row.data,
              tipo: 'servico',
              status: 'concluido',
              observacoes: `Lançamento ${row.categoria} planilha Set/2026`,
            },
          ],
          total_gasto: row.valor,
          total_pedidos: 1,
          ultimo_servico: row.data,
        };
        newClients.push(newClient);
        clientMap.set(lowerName, newClient);
        clientId = newClient.id;
        clientName = newClient.nome;
      }
    }

    // Build specific descriptive text
    let descricao = '';
    if (row.tipo === 'ENTRADA') {
      descricao = clientName ? `${row.categoria} - ${clientName}` : `${row.categoria} (Avulso)`;
    } else {
      if (row.categoria === 'Compra de produtos') descricao = 'Compra de produtos e insumos de higienização';
      else if (row.categoria === 'Estacionamento') descricao = 'Estacionamento em atendimento externo';
      else if (row.categoria === 'Combustível') descricao = 'Abastecimento combustível frota';
      else if (row.categoria === 'Facebook') descricao = 'Anúncios Facebook / Meta Ads';
      else if (row.categoria === 'Google') descricao = 'Campanha Google Ads';
      else if (row.categoria === 'Funcionários') descricao = 'Pagamento funcionários / diárias equipe';
      else descricao = row.categoria;
    }

    const tx: Transaction = {
      id,
      tipo: row.tipo === 'ENTRADA' ? 'receita' : 'despesa',
      categoria: row.categoria,
      descricao,
      valor: row.valor,
      data: row.data,
      metodo_pagamento: (row.categoria === 'Facebook' || row.categoria === 'Google') ? 'Cartão' : 'Pix',
      status: 'pago',
      client_id: clientId,
      client_name: clientName,
      created_at: `${row.data}T12:00:00.000Z`,
    };

    transactions.push(tx);
  });

  return { transactions, newClients };
};

/**
 * Merges September 2026 spreadsheet transactions into the database state
 */
export const applySeptember2026Spreadsheet = (state: DatabaseState): DatabaseState => {
  const currentClients = Array.isArray(state.clients) ? [...state.clients] : [];
  const { transactions: sepTx, newClients } = buildSeptember2026Transactions(currentClients);

  // Combine clients
  const allClients = [...currentClients];
  newClients.forEach(nc => {
    if (!allClients.some(c => c.id === nc.id || c.nome.toLowerCase() === nc.nome.toLowerCase())) {
      allClients.push(nc);
    }
  });

  // Combine transactions, replacing any existing tx-set2026-* or duplicates
  const currentTx = Array.isArray(state.transactions) ? [...state.transactions] : [];
  const existingSetTxIds = new Set(sepTx.map(t => t.id));
  
  // Unify any 'mkt google' or duplicate Google and Facebook/Meta transactions so totals are strictly R$ 400 (Google) and R$ 1250 (Meta)
  const filteredCurrentTx = currentTx.filter(t => {
    if (existingSetTxIds.has(t.id)) return false;
    if (t.tipo === 'despesa' && t.data && t.data.startsWith('2026-09')) {
      const cat = (t.categoria || '').toLowerCase().trim();
      const desc = (t.descricao || '').toLowerCase().trim();
      const isGoogle = cat.includes('google') || desc.includes('google');
      if (isGoogle) return false;
      const isMeta = cat.includes('facebook') || desc.includes('facebook') || cat.includes('meta') || desc.includes('meta');
      if (isMeta) return false;
    }
    return true;
  }).map(t => {
    // Normalize any other transaction category from 'mkt google' to 'Google'
    const cat = (t.categoria || '').trim();
    const catLower = cat.toLowerCase();
    if (catLower === 'mkt google' || catLower === 'marketing google' || catLower === 'marketing - google') {
      return { ...t, categoria: 'Google' };
    }
    if (catLower === 'mkt meta' || catLower === 'marketing meta' || catLower === 'marketing - meta') {
      return { ...t, categoria: 'Facebook' };
    }
    return t;
  });

  const finalTx = [...sepTx, ...filteredCurrentTx];

  return {
    ...state,
    clients: allClients,
    transactions: finalTx,
  };
};
