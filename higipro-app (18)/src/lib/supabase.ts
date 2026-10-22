/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import { DatabaseState, Client, Service, Quote, QuoteItem, ServiceOrder, Appointment, Recurrence, Transaction } from '../types';

export const SUPABASE_URL = 'https://kxtfmepfbhxnbojpertk.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGZtZXBmYmh4bmJvanBlcnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NTkyNDUsImV4cCI6MjEwMDEzNTI0NX0.BjZb_JMUaRG9nLJB8re-N3DVzOmPi4zD29RZOR6EC2g';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const originToApp: Record<string, Client['origem']> = {
  google: 'Google',
  meta: 'Meta Ads',
  'meta ads': 'Meta Ads',
  instagram: 'Meta Ads',
  facebook: 'Meta Ads',
  whatsapp: 'Google',
  indicacao: 'Indicação',
  site: 'Site',
  outros: 'Outros',
};

const originToSupabase: Record<string, string> = {
  Google: 'google',
  'Meta Ads': 'meta',
  Indicação: 'indicacao',
  Site: 'outros',
  Outros: 'outros',
};

export async function fetchAllFromSupabase(): Promise<Partial<DatabaseState> | null> {
  try {
    const fetchWithPagination = async (table: string) => {
      let rows: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const to = from + step - 1;
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(from, to);
        if (error || !data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < step) break;
        from += step;
      }
      return rows;
    };

    const [
      servicesData,
      clientsData,
      quotesData,
      quoteItemsData,
      serviceOrdersData,
      appointmentsData,
      transactionsData,
      recurrencesData
    ] = await Promise.all([
      supabase.from('services').select('*').then(r => r.data || []),
      fetchWithPagination('clients'),
      supabase.from('quotes').select('*').then(r => r.data || []),
      supabase.from('quote_items').select('*').then(r => r.data || []),
      fetchWithPagination('service_orders'),
      supabase.from('appointments').select('*').then(r => r.data || []),
      supabase.from('transactions').select('*').then(r => r.data || []),
      supabase.from('recurrences').select('*').then(r => r.data || [])
    ]);

    const clientMap: Record<string, Client> = {};
    const clients: Client[] = clientsData.map((c: any) => {
      const orig = (c.origin || '').toLowerCase();
      const client: Client = {
        id: c.id,
        nome: c.name || 'Cliente',
        telefone: c.phone || '',
        email: c.email || '',
        endereco: c.address || '',
        cidade: c.city || 'Passo Fundo',
        estado: c.state || 'RS',
        CEP: c.zip_code || '',
        observacoes: c.notes || '',
        tags: Array.isArray(c.tags) ? c.tags : (c.tags ? [c.tags] : []),
        origem: originToApp[orig] || 'Outros',
        created_at: c.created_at || new Date().toISOString()
      };
      clientMap[c.id] = client;
      return client;
    });

    const services: Service[] = servicesData.map((s: any) => {
      const cat = (s.category || '').toLowerCase();
      let categoria: Service['categoria'] = 'Higienização';
      if (cat.includes('impermeabilizacao')) categoria = 'Impermeabilização';
      else if (cat.includes('limpeza')) categoria = 'Limpeza';
      else if (cat.includes('sanitizacao')) categoria = 'Sanitização';

      let tipo_estofado: Service['tipo_estofado'] = 'Sofá';
      const uph = (s.upholstery_type || '').toLowerCase();
      if (uph.includes('colchao')) tipo_estofado = 'Colchão';
      else if (uph.includes('cadeira')) tipo_estofado = 'Cadeira';
      else if (uph.includes('poltrona')) tipo_estofado = 'Poltrona';
      else if (uph.includes('tapete')) tipo_estofado = 'Tapete';
      else if (uph.includes('carro')) tipo_estofado = 'Carro';
      else if (uph.includes('cortina')) tipo_estofado = 'Cortina';

      return {
        id: s.id,
        nome: s.name,
        descricao: s.description || '',
        categoria,
        tipo_estofado,
        preco: Number(s.price) || 0,
        custo: Number(s.cost) || 0,
        duracao: Number(s.duration_minutes) || 60,
        ativo: s.active !== false
      };
    });

    const quotes: Quote[] = quotesData.map((q: any) => ({
      id: q.id,
      numero: q.number || 'ORC-001',
      client_id: q.client_id,
      client_name: clientMap[q.client_id]?.nome || 'Cliente',
      status: q.status || 'rascunho',
      total: Number(q.total) || 0,
      observacoes: q.notes || '',
      validade: (q.scheduled_date || q.created_at || new Date().toISOString()).split('T')[0],
      created_at: q.created_at || new Date().toISOString()
    }));

    const quoteItems: QuoteItem[] = quoteItemsData.map((qi: any) => ({
      id: qi.id,
      quote_id: qi.quote_id,
      service_id: qi.service_id,
      descricao: qi.description || 'Serviço',
      qtd: Number(qi.quantity) || 1,
      preco_unit: Number(qi.unit_price) || 0,
      subtotal: Number(qi.subtotal) || 0
    }));

    const serviceOrders: ServiceOrder[] = serviceOrdersData.map((o: any) => {
      const client = clientMap[o.client_id];
      const st = o.status === 'recebido' ? 'concluido' : (o.status || 'concluido');
      return {
        id: o.id,
        numero: o.number || 'OS',
        quote_id: o.quote_id || undefined,
        client_id: o.client_id,
        client_name: client?.nome || 'Cliente',
        client_phone: client?.telefone || '',
        status: st as any,
        total: Number(o.total) || 0,
        pago: Number(o.paid !== undefined ? o.paid : o.total) || 0,
        data_agendada: o.scheduled_date || undefined,
        data_conclusao: o.completed_date ? o.completed_date.split('T')[0] : undefined,
        tecnico: o.technician || 'Técnico HigiPro',
        endereco: o.address || client?.endereco || '',
        observacoes: o.services_description || o.notes || '',
        created_at: o.created_at || new Date().toISOString()
      };
    });

    const appointments: Appointment[] = appointmentsData.map((a: any) => {
      const client = clientMap[a.client_id];
      return {
        id: a.id,
        client_id: a.client_id,
        client_name: client?.nome || 'Cliente',
        servicos: a.title || 'Higienização',
        data_hora: (a.scheduled_date || new Date().toISOString()).slice(0, 16),
        duracao: 90,
        status: (a.status || 'agendado') as any,
        tecnico: a.technician || 'Técnico HigiPro',
        endereco: a.address || client?.endereco || '',
        observacoes: a.notes || ''
      };
    });

    const recurrences: Recurrence[] = recurrencesData.map((r: any) => {
      const client = clientMap[r.client_id];
      return {
        id: r.id,
        client_id: r.client_id,
        client_name: client?.nome || 'Cliente',
        service_id: r.service_id || undefined,
        service_name: 'Higienização Anual',
        frequencia: (r.frequency || 'anual') as any,
        intervalo: r.frequency === 'anual' ? 12 : 6,
        proxima_data: r.next_date || '2027-08-01',
        data_inicio: r.start_date || '2026-08-01',
        data_fim: r.end_date || undefined,
        ativo: r.active !== false,
        lembrete: Number(r.reminder_days) || 30,
        observacoes: r.notes || 'Recorrência anual gerada'
      };
    });

    const transactions: Transaction[] = transactionsData.map((t: any) => ({
      id: t.id,
      tipo: t.type || 'receita',
      categoria: t.category || 'Higienização Estofados',
      descricao: t.description || 'Transação',
      valor: Number(t.amount) || 0,
      data: t.date || new Date().toISOString().split('T')[0],
      metodo_pagamento: (t.payment_method || 'Pix') as any,
      status: (t.status || 'pago') as any,
      os_id: t.service_order_id || undefined,
      created_at: t.created_at || new Date().toISOString()
    }));

    return {
      clients,
      services,
      quotes,
      quoteItems,
      serviceOrders,
      appointments,
      recurrences,
      transactions
    };
  } catch (err) {
    console.error('Error fetching data from Supabase:', err);
    return null;
  }
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toValidUUID(id?: string | null): string {
  if (!id) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return '00000000-0000-4000-8000-000000000000';
  }
  if (uuidRegex.test(id)) return id;

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const part2 = Math.abs(hash * 31).toString(16).padStart(4, '0').slice(-4);
  const part3 = '4' + Math.abs(hash * 37).toString(16).padStart(3, '0').slice(-3);
  const part4 = '8' + Math.abs(hash * 41).toString(16).padStart(3, '0').slice(-3);
  const part5 = (Math.abs(hash * 43).toString(16) + Math.abs(hash * 47).toString(16)).padStart(12, '0').slice(-12);
  return `${hex}-${part2}-${part3}-${part4}-${part5}`;
}

// Write-back helpers
export async function supabaseSaveClient(client: Client) {
  try {
    const orig = originToSupabase[client.origem] || 'outros';
    const payload = {
      id: toValidUUID(client.id),
      name: client.nome,
      phone: client.telefone,
      email: client.email || null,
      address: client.endereco || null,
      city: client.cidade || null,
      state: client.estado || null,
      zip_code: client.CEP || null,
      notes: client.observacoes || null,
      origin: orig,
      created_at: client.created_at
    };
    await supabase.from('clients').upsert(payload);
  } catch (err) {
    console.error('Error saving client to Supabase:', err);
  }
}

export async function supabaseDeleteClient(clientId: string) {
  try {
    await supabase.from('clients').delete().eq('id', toValidUUID(clientId));
  } catch (err) {
    console.error('Error deleting client from Supabase:', err);
  }
}

export async function supabaseSaveQuote(quote: Quote, items: QuoteItem[] = []) {
  try {
    const validQuoteId = toValidUUID(quote.id);
    await supabase.from('quotes').upsert({
      id: validQuoteId,
      number: quote.numero,
      client_id: toValidUUID(quote.client_id),
      status: quote.status,
      total: quote.total,
      notes: quote.observacoes,
      scheduled_date: quote.validade,
      created_at: quote.created_at
    });

    if (items.length > 0) {
      await supabase.from('quote_items').delete().eq('quote_id', validQuoteId);
      await supabase.from('quote_items').insert(
        items.map(it => ({
          id: toValidUUID(it.id),
          quote_id: validQuoteId,
          service_id: it.service_id ? toValidUUID(it.service_id) : null,
          description: it.descricao,
          quantity: it.qtd,
          unit_price: it.preco_unit,
          subtotal: it.subtotal
        }))
      );
    }
  } catch (err) {
    console.error('Error saving quote to Supabase:', err);
  }
}

export async function supabaseDeleteQuote(quoteId: string) {
  try {
    const validId = toValidUUID(quoteId);
    await supabase.from('quote_items').delete().eq('quote_id', validId);
    await supabase.from('quotes').delete().eq('id', validId);
  } catch (err) {
    console.error('Error deleting quote from Supabase:', err);
  }
}

export async function supabaseSaveServiceOrder(os: ServiceOrder) {
  try {
    await supabase.from('service_orders').upsert({
      id: toValidUUID(os.id),
      number: os.numero,
      quote_id: os.quote_id ? toValidUUID(os.quote_id) : null,
      client_id: toValidUUID(os.client_id),
      status: os.status,
      total: os.total,
      paid: os.pago,
      scheduled_date: os.data_agendada || null,
      completed_date: os.data_conclusao ? `${os.data_conclusao}T12:00:00Z` : null,
      technician: os.tecnico || null,
      address: os.endereco || null,
      services_description: os.observacoes || null,
      created_at: os.created_at
    });
  } catch (err) {
    console.error('Error saving service order to Supabase:', err);
  }
}

export async function supabaseDeleteServiceOrder(id: string) {
  try {
    const validId = toValidUUID(id);
    await supabase.from('service_orders').delete().eq('id', validId);
  } catch (err) {
    console.warn('[Supabase] Could not delete service order:', err);
  }
}

export async function supabaseSaveAppointment(app: Appointment) {
  try {
    await supabase.from('appointments').upsert({
      id: toValidUUID(app.id),
      client_id: toValidUUID(app.client_id),
      title: app.servicos,
      scheduled_date: app.data_hora ? `${app.data_hora}:00Z` : null,
      technician: app.tecnico || null,
      address: app.endereco || null,
      status: app.status,
      notes: app.observacoes || null
    });
  } catch (err) {
    console.error('Error saving appointment to Supabase:', err);
  }
}

export async function supabaseDeleteAppointment(appId: string) {
  try {
    await supabase.from('appointments').delete().eq('id', toValidUUID(appId));
  } catch (err) {
    console.error('Error deleting appointment from Supabase:', err);
  }
}

export async function supabaseSaveTransaction(tx: Transaction) {
  try {
    await supabase.from('transactions').upsert({
      id: toValidUUID(tx.id),
      type: tx.tipo,
      category: tx.categoria,
      description: tx.descricao,
      amount: tx.valor,
      date: tx.data,
      payment_method: tx.metodo_pagamento,
      status: tx.status,
      service_order_id: tx.os_id ? toValidUUID(tx.os_id) : null
    });
  } catch (err) {
    console.error('Error saving transaction to Supabase:', err);
  }
}

export async function supabaseSaveRecurrence(rec: Recurrence) {
  try {
    await supabase.from('recurrences').upsert({
      id: toValidUUID(rec.id),
      client_id: toValidUUID(rec.client_id),
      service_id: rec.service_id ? toValidUUID(rec.service_id) : null,
      frequency: rec.frequencia || 'anual',
      next_date: rec.proxima_data,
      start_date: rec.data_inicio,
      end_date: rec.data_fim || null,
      active: rec.ativo,
      reminder_days: rec.lembrete || 30,
      notes: rec.observacoes || null
    });
  } catch (err) {
    console.error('Error saving recurrence to Supabase:', err);
  }
}
