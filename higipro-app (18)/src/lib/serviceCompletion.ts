/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  DatabaseState, 
  ServiceOrder, 
  Appointment, 
  Quote, 
  Transaction, 
  Client, 
  PaymentMethod,
  Recurrence,
  ServiceCategory,
  ClientHistoricalService,
  SofaType
} from '../types';
import { generateId, triggerCloudUpload } from './database';
import { generateNumber, addMonths } from './utils';
import { 
  supabaseSaveServiceOrder, 
  supabaseSaveTransaction, 
  supabaseSaveAppointment, 
  supabaseSaveRecurrence 
} from './supabase';

export interface CompleteServiceParams {
  source: 'agenda' | 'orcamento' | 'os';
  id: string; // appointmentId, quoteId, or osId
  valor?: number;
  dataConclusao?: string; // YYYY-MM-DD
  metodoPagamento?: PaymentMethod;
  tecnico?: string;
  observacoes?: string;
}

export interface CompletionResult {
  updatedDb: DatabaseState;
  valorRegistrado: number;
  clienteNome: string;
  osNumero?: string;
  transacaoId: string;
}

/**
 * Universal service completion function.
 * Whenever an appointment (agenda), quote (orçamento), or service order (OS) is marked as "concluido",
 * this function automatically:
 * 1. Sets OS to status 'concluido', marks pago = total, sets data_conclusao.
 * 2. Sets Appointment to status 'concluido' and saves to completed visit history.
 * 3. Archives / marks Quote as 'concluido' / 'aprovado'.
 * 4. Logs or updates the revenue in Financeiro (db.transactions) with status 'pago',
 *    ensuring financial charts, revenue KPIs, and net profits update immediately.
 * 5. Updates Client total_gasto and ultimo_servico in CRM.
 * 6. Sets an annual 1-year recurrence for customer retention.
 * 7. Automatically triggers cloud synchronization (Firebase Firestore) so PC and Mobile sync.
 */
export function completeServiceAndSyncAll(
  db: DatabaseState,
  params: CompleteServiceParams
): CompletionResult {
  const now = new Date();
  const todayStr = params.dataConclusao || now.toISOString().split('T')[0];
  const nowIso = now.toISOString();

  let targetAppointment: Appointment | undefined;
  let targetOS: ServiceOrder | undefined;
  let targetQuote: Quote | undefined;
  let targetClientId = '';
  let targetClientName = '';
  let targetTech = params.tecnico;
  let targetAddress = '';
  let serviceDesc = '';
  let serviceVal = params.valor;

  // 1. Identify records based on source
  if (params.source === 'agenda') {
    targetAppointment = (db.appointments || []).find(a => a.id === params.id);
    if (targetAppointment) {
      targetClientId = targetAppointment.client_id;
      targetClientName = targetAppointment.client_name;
      targetTech = targetTech || targetAppointment.tecnico;
      targetAddress = targetAppointment.endereco || '';
      serviceDesc = targetAppointment.servicos;
      if (serviceVal === undefined || serviceVal === null || serviceVal === 0) {
        serviceVal = targetAppointment.valor;
      }

      if (targetAppointment.os_id) {
        targetOS = (db.serviceOrders || []).find(os => os.id === targetAppointment?.os_id);
      }
    }
  } else if (params.source === 'orcamento') {
    targetQuote = (db.quotes || []).find(q => q.id === params.id);
    if (targetQuote) {
      targetClientId = targetQuote.client_id;
      targetClientName = targetQuote.client_name;
      if (serviceVal === undefined || serviceVal === null || serviceVal === 0) {
        serviceVal = targetQuote.total;
      }

      const quoteItems = (db.quoteItems || []).filter(qi => qi.quote_id === targetQuote?.id);
      serviceDesc = quoteItems.map(qi => qi.descricao).join(', ') || `Orçamento ${targetQuote.numero}`;

      if (targetQuote.os_id) {
        targetOS = (db.serviceOrders || []).find(os => os.id === targetQuote?.os_id);
      }
    }
  } else if (params.source === 'os') {
    targetOS = (db.serviceOrders || []).find(os => os.id === params.id);
    if (targetOS) {
      targetClientId = targetOS.client_id;
      targetClientName = targetOS.client_name;
      targetTech = targetTech || targetOS.tecnico;
      targetAddress = targetOS.endereco || '';
      serviceDesc = targetOS.observacoes || `Ordem de Serviço ${targetOS.numero}`;
      if (serviceVal === undefined || serviceVal === null || serviceVal === 0) {
        serviceVal = targetOS.total;
      }

      if (targetOS.quote_id) {
        targetQuote = (db.quotes || []).find(q => q.id === targetOS?.quote_id);
      }
    }
  }

  // Cross-reference remaining missing entities
  if (targetOS && !targetAppointment) {
    targetAppointment = (db.appointments || []).find(a => a.os_id === targetOS?.id);
  }
  if (!targetAppointment && targetClientId) {
    targetAppointment = (db.appointments || []).find(a => a.client_id === targetClientId && a.status !== 'concluido' && a.status !== 'cancelado')
      || (db.appointments || []).find(a => a.client_id === targetClientId);
  }
  if (!targetAppointment && targetClientName) {
    const norm = targetClientName.toLowerCase().trim();
    targetAppointment = (db.appointments || []).find(a => a.client_name && a.client_name.toLowerCase().trim() === norm);
  }

  if (targetOS && !targetQuote) {
    if (targetOS.quote_id) {
      targetQuote = (db.quotes || []).find(q => q.id === targetOS?.quote_id);
    } else if ((targetOS as any).quote_numero) {
      targetQuote = (db.quotes || []).find(q => q.numero === (targetOS as any).quote_numero);
    }
  }
  if (!targetQuote && targetClientId) {
    targetQuote = (db.quotes || []).find(q => q.client_id === targetClientId && (q.status === 'aprovado' || q.status === 'concluido' || q.status === 'enviado')) 
      || (db.quotes || []).find(q => q.client_id === targetClientId);
  }
  if (!targetQuote && targetClientName) {
    const norm = targetClientName.toLowerCase().trim();
    targetQuote = (db.quotes || []).find(q => q.client_name && q.client_name.toLowerCase().trim() === norm && (q.status === 'aprovado' || q.status === 'concluido' || q.status === 'enviado'))
      || (db.quotes || []).find(q => q.client_name && q.client_name.toLowerCase().trim() === norm);
  }

  // If source is 'orcamento', only match an OS specifically linked to this quote.
  // We do NOT want to overwrite an old unrelated OS for this client when concluding a new quote!
  if (!targetOS && targetClientId && params.source !== 'orcamento') {
    targetOS = (db.serviceOrders || []).find(os => os.client_id === targetClientId && os.status !== 'cancelado')
      || (db.serviceOrders || []).find(os => os.client_id === targetClientId);
  }
  if (!targetOS && targetClientName && params.source !== 'orcamento') {
    const norm = targetClientName.toLowerCase().trim();
    targetOS = (db.serviceOrders || []).find(os => os.client_name && os.client_name.toLowerCase().trim() === norm && os.status !== 'cancelado')
      || (db.serviceOrders || []).find(os => os.client_name && os.client_name.toLowerCase().trim() === norm);
  }

  // Lookup client if address or phone needed
  const targetClient = (db.clients || []).find(c => 
    (targetClientId && c.id === targetClientId) || 
    (targetClientName && c.nome && c.nome.toLowerCase().trim() === targetClientName.toLowerCase().trim())
  );
  if (targetClient) {
    targetClientId = targetClientId || targetClient.id;
    targetClientName = targetClientName || targetClient.nome;
    targetAddress = targetAddress || targetClient.endereco || '';
  }

  // Sum quote items or OS items if needed
  let itemsSum = 0;
  if (targetQuote?.id) {
    const quoteItems = (db.quoteItems || []).filter(qi => qi.quote_id === targetQuote?.id);
    itemsSum = quoteItems.reduce((acc, it) => acc + (it.subtotal || (it.qtd * it.preco_unit) || 0), 0);
  }
  if (itemsSum === 0 && targetOS?.items && Array.isArray(targetOS.items)) {
    itemsSum = targetOS.items.reduce((acc: number, it: any) => acc + (it.subtotal || (it.qtd * it.preco_unit) || 0), 0);
  }

  // Final service value determination with thorough fallbacks
  let finalValue = Math.max(
    0, 
    serviceVal || 0, 
    targetOS?.total || 0, 
    targetQuote?.total || 0, 
    itemsSum || 0, 
    targetAppointment?.valor || 0
  );

  // If still 0, check pending transactions for this client
  if (finalValue === 0 && targetClientId) {
    const pendingTx = (db.transactions || []).find(t => t.client_id === targetClientId && t.tipo === 'receita' && t.valor > 0);
    if (pendingTx) {
      finalValue = pendingTx.valor;
    }
  }

  // Category and sofa type mapping
  let mappedCategory: ServiceCategory = 'Higienização';
  let sofaType: SofaType = 'Sofá';
  const descLower = (
    (serviceDesc || '') + ' ' + 
    (targetAppointment?.servicos || '') + ' ' + 
    (targetQuote?.observacoes || '') + ' ' +
    (targetOS?.observacoes || '')
  ).toLowerCase();

  if (descLower.includes('colchão') || descLower.includes('colchao')) {
    mappedCategory = 'Higienização';
    sofaType = 'Colchão';
  } else if (descLower.includes('impermeabiliz') || descLower.includes('imper')) {
    mappedCategory = 'Impermeabilização';
    sofaType = 'Sofá';
  } else if (descLower.includes('tapete')) {
    mappedCategory = 'Tapete';
    sofaType = 'Tapete';
  } else if (descLower.includes('sanitiz')) {
    mappedCategory = 'Sanitização';
    sofaType = 'Outros';
  } else if (descLower.includes('poltrona')) {
    mappedCategory = 'Higienização';
    sofaType = 'Poltrona';
  } else if (descLower.includes('cadeira')) {
    mappedCategory = 'Higienização';
    sofaType = 'Cadeira';
  } else if (descLower.includes('carro') || descLower.includes('veicular') || descLower.includes('automotivo')) {
    mappedCategory = 'Higienização';
    sofaType = 'Carro';
  }

  // If finalValue is still 0, check standard base prices
  if (finalValue === 0 && (db.services || []).length > 0) {
    const matchedService = (db.services || []).find(s => descLower.includes(s.nome.toLowerCase()));
    if (matchedService && matchedService.preco > 0) {
      finalValue = matchedService.preco;
    }
  }

  // 2. Ensure OS exists and is Concluded
  let updatedOrders = [...(db.serviceOrders || [])];
  let finalOSId = targetOS?.id;
  let finalOSNum = targetOS?.numero;

  if (targetOS) {
    updatedOrders = updatedOrders.map(os => {
      if (os.id === targetOS?.id) {
        const updated = {
          ...os,
          status: 'concluido' as const,
          total: finalValue || os.total,
          pago: finalValue || os.total,
          data_conclusao: os.data_conclusao || todayStr,
          tecnico: targetTech || os.tecnico,
        };
        supabaseSaveServiceOrder(updated);
        return updated;
      }
      return os;
    });
  } else {
    // Generate new completed OS
    finalOSId = generateId();
    let countOS = updatedOrders.length;
    finalOSNum = generateNumber('OS', countOS);
    while (updatedOrders.some(o => o.numero === finalOSNum)) {
      countOS++;
      finalOSNum = generateNumber('OS', countOS);
    }

    // Copy quote items if available
    const quoteItemsFromDb = targetQuote ? (db.quoteItems || []).filter(qi => qi.quote_id === targetQuote?.id) : [];
    const directQuoteItems = (targetQuote?.itens || (targetQuote as any)?.items || []) as any[];
    const sourceItems = quoteItemsFromDb.length > 0 ? quoteItemsFromDb : directQuoteItems;
    const osItems = sourceItems.length > 0 ? sourceItems.map(qi => ({
      id: generateId(),
      service_id: qi.service_id || '',
      descricao: qi.descricao || 'Serviço',
      qtd: typeof qi.qtd === 'number' ? qi.qtd : 1,
      preco_unit: typeof qi.preco_unit === 'number' ? qi.preco_unit : (finalValue || 0),
      subtotal: typeof qi.subtotal === 'number' ? qi.subtotal : (finalValue || 0),
      unidade: qi.unidade || 'un',
      tamanho_largura: qi.tamanho_largura || qi.largura,
      tamanho_comprimento: qi.tamanho_comprimento || qi.comprimento,
      tamanho_m2: qi.tamanho_m2,
    })) : [];

    const newOS: ServiceOrder = {
      id: finalOSId,
      numero: finalOSNum,
      quote_id: targetQuote?.id,
      quote_numero: targetQuote?.numero,
      client_id: targetClientId,
      client_name: targetClientName || 'Cliente',
      client_phone: targetClient?.telefone || '',
      status: 'concluido',
      total: finalValue,
      pago: finalValue,
      data_agendada: targetAppointment?.data_hora || `${todayStr}T09:00`,
      data_conclusao: todayStr,
      tecnico: targetTech || 'Equipe Higipro 01',
      endereco: targetAddress || 'Passo Fundo - RS',
      observacoes: params.observacoes || serviceDesc || `Serviço gerado a partir do Orçamento ${targetQuote?.numero || ''} concluído`,
      created_at: todayStr,
      items: osItems,
    };
    updatedOrders = [newOS, ...updatedOrders];
    supabaseSaveServiceOrder(newOS);
  }

  // 3. Ensure Appointment exists and is Concluded
  let updatedAppointments = [...(db.appointments || [])];
  if (targetAppointment) {
    updatedAppointments = updatedAppointments.map(a => {
      if (a.id === targetAppointment?.id) {
        const updated = {
          ...a,
          status: 'concluido' as const,
          os_id: a.os_id || finalOSId,
          valor: finalValue || a.valor,
          tecnico: targetTech || a.tecnico,
        };
        supabaseSaveAppointment(updated);
        return updated;
      }
      return a;
    });
  } else if (finalOSId) {
    // Create completed appointment in history
    const newApp: Appointment = {
      id: generateId(),
      os_id: finalOSId,
      client_id: targetClientId,
      client_name: targetClientName || 'Cliente',
      servicos: serviceDesc || `Serviço OS ${finalOSNum}`,
      data_hora: `${todayStr}T09:00`,
      duracao: 120,
      status: 'concluido',
      tecnico: targetTech || 'Equipe Higipro 01',
      endereco: targetAddress || 'Passo Fundo - RS',
      observacoes: 'Atendimento concluído e faturado.',
      valor: finalValue,
    };
    updatedAppointments = [newApp, ...updatedAppointments];
    supabaseSaveAppointment(newApp);
  }

  // 4. Update Quotes (Archive & mark approved/concluded)
  let updatedQuotes = [...(db.quotes || [])];
  if (targetQuote) {
    updatedQuotes = updatedQuotes.map(q => {
      if (q.id === targetQuote?.id) {
        return {
          ...q,
          status: 'concluido' as any,
          os_id: q.os_id || finalOSId,
          arquivado: true,
          arquivado_em: todayStr,
          arquivado_motivo: `Serviço concluído e quitado (OS ${finalOSNum})`,
        };
      }
      return q;
    });
  } else if (finalOSId) {
    // Check if any quote is tied to this OS
    updatedQuotes = updatedQuotes.map(q => {
      if (q.os_id === finalOSId || (targetOS?.quote_id && q.id === targetOS.quote_id)) {
        return {
          ...q,
          status: 'concluido' as any,
          arquivado: true,
          arquivado_em: todayStr,
          arquivado_motivo: `Serviço concluído (OS ${finalOSNum})`,
        };
      }
      return q;
    });
  }

  // 5. Financeiro (Transactions) - AUTOMATIC ENTRY AS 'RECEITA' AND STATUS 'PAGO'
  let updatedTransactions = [...(db.transactions || [])];
  let finalTxId = '';

  // Look for existing transaction matching this OS, quote, or pending transaction for this client
  const existingTxIndex = updatedTransactions.findIndex(t => 
    (finalOSId && t.os_id === finalOSId) || 
    (finalOSNum && t.descricao && t.descricao.includes(finalOSNum)) ||
    (targetQuote?.id && t.descricao && t.descricao.includes(targetQuote.numero)) ||
    (targetClientId && t.client_id === targetClientId && t.tipo === 'receita' && t.status === 'pendente')
  );

  const txDescription = `Recebimento Serviço Concluído ${finalOSNum ? `OS ${finalOSNum}` : ''} - ${targetClientName || 'Cliente'}`;

  if (existingTxIndex >= 0) {
    const existing = updatedTransactions[existingTxIndex];
    finalTxId = existing.id;
    const updatedTx: Transaction = {
      ...existing,
      tipo: 'receita',
      categoria: existing.categoria || mappedCategory,
      descricao: existing.descricao.includes('Recebimento') ? existing.descricao : txDescription,
      valor: finalValue || existing.valor,
      data: todayStr,
      metodo_pagamento: params.metodoPagamento || existing.metodo_pagamento || 'Pix',
      status: 'pago',
      os_id: finalOSId || existing.os_id,
      client_id: targetClientId || existing.client_id,
      client_name: targetClientName || existing.client_name,
    };
    updatedTransactions[existingTxIndex] = updatedTx;
    supabaseSaveTransaction(updatedTx);
  } else {
    finalTxId = generateId();
    const newTx: Transaction = {
      id: finalTxId,
      tipo: 'receita',
      categoria: mappedCategory,
      descricao: txDescription,
      valor: finalValue,
      data: todayStr,
      metodo_pagamento: params.metodoPagamento || 'Pix',
      status: 'pago', // Automatically PAID and counted in revenue!
      os_id: finalOSId,
      client_id: targetClientId,
      client_name: targetClientName || 'Cliente',
      created_at: nowIso,
    };
    updatedTransactions = [newTx, ...updatedTransactions];
    supabaseSaveTransaction(newTx);
  }

  // 6. Update Clientes (CRM metrics: total_gasto, total_pedidos, ultimo_servico, historico)
  let updatedClients = [...(db.clients || [])];
  if (targetClientId) {
    updatedClients = updatedClients.map(c => {
      if (c.id === targetClientId) {
        const currentHist = Array.isArray(c.historico_servicos) ? c.historico_servicos : [];
        const hasSameServiceInHist = currentHist.some(h => (h as any).os_id === finalOSId || (h.data === todayStr && h.valor === finalValue));
        
        const newHistItem: ClientHistoricalService = {
          id: generateId(),
          nome_servico: serviceDesc || `Serviço OS ${finalOSNum || ''}`,
          servico: serviceDesc || `Serviço OS ${finalOSNum || ''}`,
          tipo_estofado: sofaType,
          categoria: mappedCategory,
          valor: finalValue,
          data: todayStr,
          tipo: 'servico',
          status: 'concluido',
          observacoes: `Concluído em ${todayStr} (${targetTech || 'Equipe Higipro'})`,
        };

        return {
          ...c,
          total_gasto: (c.total_gasto || 0) + (hasSameServiceInHist ? 0 : finalValue),
          total_pedidos: (c.total_pedidos || 0) + (hasSameServiceInHist ? 0 : 1),
          ultimo_servico: todayStr,
          historico_servicos: hasSameServiceInHist ? currentHist : [newHistItem, ...currentHist],
        };
      }
      return c;
    });
  }

  // 7. Recurrence (Schedule automatic 1-year annual reminder)
  let updatedRecurrences = [...(db.recurrences || [])];
  if (targetClientId) {
    const existingRecIndex = updatedRecurrences.findIndex(r => r.client_id === targetClientId);
    const nextAnnualDate = addMonths(todayStr, 12);
    if (existingRecIndex >= 0) {
      const existing = updatedRecurrences[existingRecIndex];
      const updatedRec: Recurrence = {
        ...existing,
        ativo: true,
        data_inicio: todayStr,
        proxima_data: nextAnnualDate,
        proxima_data_sugerida: nextAnnualDate,
        servico_origem: mappedCategory,
        service_name: `${mappedCategory} Anual`,
      };
      updatedRecurrences[existingRecIndex] = updatedRec;
      supabaseSaveRecurrence(updatedRec);
    } else {
      const newRec: Recurrence = {
        id: generateId(),
        client_id: targetClientId,
        client_name: targetClientName || 'Cliente',
        frequencia: 'anual',
        intervalo: 12,
        intervalo_meses: 12,
        data_inicio: todayStr,
        proxima_data: nextAnnualDate,
        proxima_data_sugerida: nextAnnualDate,
        servico_origem: mappedCategory,
        service_name: `${mappedCategory} Anual`,
        ativo: true,
      };
      updatedRecurrences = [newRec, ...updatedRecurrences];
      supabaseSaveRecurrence(newRec);
    }
  }

  const updatedDb: DatabaseState = {
    ...db,
    serviceOrders: updatedOrders,
    appointments: updatedAppointments,
    quotes: updatedQuotes,
    transactions: updatedTransactions,
    clients: updatedClients,
    recurrences: updatedRecurrences,
  };

  // Immediate Cloud Sync trigger to keep PC & mobile synchronized
  try {
    triggerCloudUpload(updatedDb);
  } catch (err) {
    console.warn('Auto cloud sync dispatch failed:', err);
  }

  return {
    updatedDb,
    valorRegistrado: finalValue,
    clienteNome: targetClientName,
    osNumero: finalOSNum,
    transacaoId: finalTxId,
  };
}
