/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseState, Quote, QuoteItem, QuoteStatus, ServiceOrder, Appointment, Client, ClientHistoricalService, ClientOrigin, SofaType, ServiceCategory } from '../types';
import { isExcludedServiceOrder } from './database';

export const RAW_SEPTEMBER_2026_QUOTES = `
26/09/2026;setembro;2026;bruna;;;OUTROS;Impermeabilização;; R$ 830,00 ;
25/09/2026;setembro;2026;bruno;;;GOOGLE;Higienização;; R$ 500,00 ;
25/09/2026;setembro;2026;jessica canto;;;GOOGLE;Higienização;; R$ 270,00 ;
25/09/2026;setembro;2026;leimar;;cidade marau;FACEBOOK;Higienização;; R$ 545,00 ;
25/09/2026;setembro;2026;aurea;;;GOOGLE;Higienização;; R$ 515,00 ;
25/09/2026;setembro;2026;valeria tanure;;;GOOGLE;Higienização;; R$ 295,00 ;
25/09/2026;setembro;2026;elenice;;;FACEBOOK;Higienização;; R$ 245,00 ;
25/09/2026;setembro;2026;fabiana;;;FACEBOOK;Higienização;; R$ 250,00 ;
25/09/2026;setembro;2026;clesiane;;;FACEBOOK;Higienização;sim; R$ 535,00 ;28/09/2026
24/09/2026;setembro;2026;monica;;;GOOGLE;Higienização;; R$ 300,00 ;
24/09/2026;setembro;2026;patty;;;GOOGLE;Higienização;; R$ 540,00 ;
24/09/2026;setembro;2026;pedro johan;;;GOOGLE;Higienização;; R$ 285,00 ;
24/09/2026;setembro;2026;fernanda utzig;;;FACEBOOK;Hig + Imper;; R$ 770,00 ;
24/09/2026;setembro;2026;nadia grazziotin;;;GOOGLE;Higienização;; R$ 318,00 ;
22/09/2026;setembro;2026;Lisi;OUTROS;Higienização;; R$ 285,00 ;23/09/2026
22/09/2026;setembro;2026;camila ;GOOGLE;Higienização;; R$ 210,00 ;__
22/09/2026;setembro;2026;eloane;OUTROS;Higienização;; R$ 540,00 ;
22/09/2026;setembro;2026;anjos;OUTROS;Higienização;; R$ 250,00 ;22/09/2026
21/09/2026;setembro;2026;ale;OUTROS;Higienização;; R$ 370,00 ;
21/09/2026;setembro;2026;kd;GOOGLE;Higienização;; R$ 530,00 ;
21/09/2026;setembro;2026;ketly;GOOGLE;Higienização;; R$ 390,00 ;
21/09/2026;setembro;2026;Maiza;GOOGLE;Impermeabilização;; R$ 545,00 ;
21/09/2026;setembro;2026;gaby;GOOGLE;Higienização;; R$ 245,00 ;
19/09/2026;setembro;2026;vania;GOOGLE;Higienização;; R$ 285,00 ;
19/09/2026;setembro;2026;greice mello;GOOGLE;Higienização;; R$ 285,00 ;
19/09/2026;setembro;2026;daiane;GOOGLE;Higi + Imper;; R$ 780,00 ;
18/09/2026;setembro;2026;juan;GOOGLE;Higienização;; R$ 295,00 ;
18/09/2026;setembro;2026;ingrit;FACEBOOK;Hig + Imper;; R$ 920,00 ;
18/09/2026;setembro;2026;sicredi;OUTROS;Higienização;; R$ 2.300,00 ;
18/09/2026;setembro;2026;michel;FACEBOOK;Hig + Imper;; R$ 1.570,00 ;
09/09/2026;setembro;2026;janesca;OUTROS;tapetes;sim; R$ 385,00 ;16/09/2026
17/09/2026;setembro;2026;karen ster;GOOGLE;Higienização;; R$ 325,00 ;
17/09/2026;setembro;2026;franciele;GOOGLE;Higienização;; R$ 200,00 ;
16/09/2026;setembro;2026;aiko;GOOGLE;Higienização;; R$ 460,00 ;17/09/2026
17/09/2026;setembro;2026;vitoria klein ;GOOGLE;Impermeabilização;; R$ 585,00 ;
17/09/2026;setembro;2026;luana;GOOGLE;Higienização;; R$ 285,00 ;
15/09/2026;setembro;2026;adriely;OUTROS;Higienização;; R$ 295,00 ;17/09/2026
15/09/2026;setembro;2026;joanne;GOOGLE;Higienização;; R$ 380,00 ;16/09/2026
15/09/2026;setembro;2026;douglas;GOOGLE;Higienização;; R$ 380,00 ;
14/09/2026;setembro;2026;lorien;GOOGLE;Higienização;; R$ 120,00 ;15/09/2026
14/09/2026;setembro;2026;BARBARA;GOOGLE;Hig + Imper;; R$ 750,00 ;
14/09/2026;setembro;2026;ketllyn;FACEBOOK;Hig + Imper;; R$ 1.080,00 ;
14/09/2026;setembro;2026;juliana renner;GOOGLE;Higienização;sim; R$ 245,00 ;19/09/2026
13/09/2026;setembro;2026;elaine;GOOGLE;Higienização;; R$ 330,00 ;
12/09/2026;setembro;2026;estela;FACEBOOK;Higienização;; R$ 455,00 ;
12/09/2026;setembro;2026;caroline;GOOGLE;Higienização;; R$ 320,00 ;
12/09/2026;setembro;2026;maria eduarda;GOOGLE;Impermeabilização;; R$ 585,00 ;
11/09/2026;setembro;2026;joraci;GOOGLE;Higienização;; R$ 245,00 ;
11/09/2026;setembro;2026;clesiane;FACEBOOK;Higienização;; R$ 535,00 ;
11/09/2026;setembro;2026;sss;GOOGLE;Higienização;; R$ 285,00 ;
10/09/2026;setembro;2026;bruna;GOOGLE;Hig + Imper;; R$ 1.210,00 ;
10/09/2026;setembro;2026;geovani;GOOGLE;Higienização;; R$ 245,00 ;
10/09/2026;setembro;2026;marinete;GOOGLE;Higienização;; R$ 245,00 ;11/09/2026
10/09/2026;setembro;2026;natieli;GOOGLE;Higienização;; R$ 340,00 ;
10/09/2026;setembro;2026;paola;GOOGLE;Higienização;; R$ 285,00 ;
09/09/2026;setembro;2026;nandi;FACEBOOK;Higienização;; R$ 330,00 ;
09/09/2026;setembro;2026;diel;FACEBOOK;Higienização;sim; R$ 330,00 ;16/09/2026
09/09/2026;setembro;2026;cristiane;GOOGLE;Higienização;sim; R$ 325,00 ;11/09/2026
09/09/2026;setembro;2026;mili;GOOGLE;Higienização;sim; R$ 245,00 ;10/09/2026
09/09/2026;setembro;2026;morgana;FACEBOOK;Higienização;sim; R$ 245,00 ;11/09/2026
09/09/2026;setembro;2026;bruna pereira;GOOGLE;Hig + Imper;; R$ 910,00 ;
09/09/2026;setembro;2026;tamara;GOOGLE;Higienização;; R$ 245,00 ;
09/09/2026;setembro;2026;diehl;GOOGLE;Higienização;; R$ 315,00 ;
09/09/2026;setembro;2026;;GOOGLE;Hig + Imper;; R$ 750,00 ;
09/09/2026;setembro;2026;irineu;GOOGLE;Higienização;sim; R$ 285,00 ;14/09/2026
05/09/2026;setembro;2026;aline;GOOGLE;Higienização;; R$ 285,00 ;
04/09/2026;setembro;2026;jeane;GOOGLE;Higienização;sim; R$ 535,00 ;09/09/2026
04/09/2026;setembro;2026;dalva;OUTROS;Higienização;sim; R$ 220,00 ;05/09/2026
03/09/2026;setembro;2026;eduardo;OUTROS;Impermeabilização;; R$ 759,00 ;04/09/2026
03/09/2026;setembro;2026;residencial;OUTROS;Higienização;; R$ 195,00 ;08/09/2026
03/09/2026;setembro;2026;timoteo;OUTROS;Higienização;sim; R$ 450,00 ;08/09/2026
02/09/2026;setembro;2026;william;GOOGLE;Higienização;sim; R$ 380,00 ;03/09/2026
02/09/2026;setembro;2026;Jananina;GOOGLE;Higienização;; R$ 295,00 ;
02/09/2026;setembro;2026;franciele boeira;GOOGLE;Hig + Imper;; R$ 780,00 ;
01/09/2026;setembro;2026;karine;GOOGLE;Higienização;; R$ 385,00 ;
01/09/2026;setembro;2026;bruna;GOOGLE;Higienização;; R$ 290,00 ;
01/09/2026;setembro;2026;dani;GOOGLE;Impermeabilização;; R$ 495,00 ;
01/09/2026;setembro;2026;bella;FACEBOOK;Higienização;sim; R$ 455,00 ;09/09/2026
01/09/2026;setembro;2026;kelly;FACEBOOK;Hig + Imper;; R$ 780,00 ;
01/09/2026;setembro;2026;debora schubert;GOOGLE;Hig + Imper;; R$ 780,00 ;
01/09/2026;setembro;2026;olivia;GOOGLE;Higienização;; R$ 1.590,00 ;
01/09/2026;setembro;2026;ana clara;GOOGLE;Higienização;; R$ 285,00 ;
01/09/2026;setembro;2026;wiolson;GOOGLE;Higienização;; R$ 165,00 ;
01/09/2026;setembro;2026;maquinas;FACEBOOK;Higienização;; R$ 285,00 ;
01/09/2026;setembro;2026;le;OUTROS;Higienização;sim; R$ 688,00 ;04/09/2026
01/09/2026;setembro;2026;bianca;GOOGLE;Higienização;; R$ 245,00 ;03/09/2026
01/09/2026;setembro;2026;fernanda lenz;GOOGLE;Higienização;sim; R$ 385,00 ;03/09/2026
01/09/2026;setembro;2026;lorenza;GOOGLE;Higienização;; R$ 285,00 ;
`.trim();

function capitalize(text: string): string {
  if (!text) return '';
  return text
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function parseBrazilianDate(dateStr: string): string {
  if (!dateStr || dateStr.includes('_') || dateStr.trim().length === 0) return '';
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return dateStr;
}

function parseCurrency(valStr: string): number {
  if (!valStr) return 0;
  const cleaned = valStr
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeServiceCategory(serv: string): { cat: ServiceCategory; estofado: SofaType } {
  const lower = serv.toLowerCase();
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

export interface SeptemberQuoteData {
  index: number;
  dataOrcamento: string; // YYYY-MM-DD
  mes: string;
  ano: number;
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
}

export function parseSeptemberQuotes(): SeptemberQuoteData[] {
  const lines = RAW_SEPTEMBER_2026_QUOTES.split('\n');
  return lines.map((line, idx) => {
    const parts = line.split(';').map(p => p.trim());
    let dataOrcRaw = '';
    let mes = '';
    let anoStr = '2026';
    let clienteRaw = '';
    let enderecoRaw = '';
    let complementoRaw = '';
    let fonteRaw = '';
    let servicoRaw = '';
    let fechouRaw = '';
    let valorRaw = '';
    let dataAgendRaw = '';

    if (parts.length >= 11) {
      [dataOrcRaw, mes, anoStr, clienteRaw, enderecoRaw, complementoRaw, fonteRaw, servicoRaw, fechouRaw, valorRaw, dataAgendRaw] = parts;
    } else {
      [dataOrcRaw, mes, anoStr, clienteRaw, fonteRaw, servicoRaw, fechouRaw, valorRaw, dataAgendRaw] = parts;
    }

    const dataOrcamento = parseBrazilianDate(dataOrcRaw);
    const dataAgendamento = parseBrazilianDate(dataAgendRaw);
    const fechou = (fechouRaw || '').toLowerCase() === 'sim';
    const valor = parseCurrency(valorRaw);
    const cliente = clienteRaw ? capitalize(clienteRaw) : `Lead ${mapClientOrigin(fonteRaw)} #${idx + 1}`;
    const origem = mapClientOrigin(fonteRaw);
    const cidade = (complementoRaw && complementoRaw.toLowerCase().includes('marau')) ? 'Marau' : 'Passo Fundo';
    const endereco = enderecoRaw || (complementoRaw ? complementoRaw : `${cidade} - RS`);

    return {
      index: idx + 1,
      dataOrcamento,
      mes,
      ano: parseInt(anoStr, 10) || 2026,
      cliente,
      endereco,
      complemento: complementoRaw,
      cidade,
      fonte: fonteRaw,
      origem,
      servico: servicoRaw || 'Higienização',
      fechou,
      valor,
      dataAgendamento: dataAgendamento || (fechou ? dataOrcamento : undefined),
    };
  });
}

export function applySeptember2026Quotes(db: DatabaseState): DatabaseState {
  const parsedData = parseSeptemberQuotes();

  // Create a map of existing clients by lower name
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

  parsedData.forEach(row => {
    const lowerName = row.cliente.toLowerCase().trim();
    let client = clientMap.get(lowerName);

    if (!client) {
      // Find exact match by full name
      client = existingClients.find(c => {
        if (!c.nome) return false;
        return c.nome.toLowerCase().trim() === lowerName;
      });
    }

    if (!client) {
      // Create new client
      const newClientId = `client-orc-set2026-${String(row.index).padStart(2, '0')}`;
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
        observacoes: row.complemento ? `Lead captado via ${row.origem} em Setembro/2026 (${row.complemento})` : `Lead captado via ${row.origem} em Setembro/2026`,
        origem: row.origem,
        tags: [row.fechou ? 'Cliente Fechado' : 'Orçamento Pendente', `Origem: ${row.origem}`, 'Setembro 2026'],
        created_at: `${row.dataOrcamento}T09:00:00.000Z`,
        historico_servicos: [
          {
            id: `hist-orc-set2026-${String(row.index).padStart(2, '0')}`,
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
      // Update existing client origin if Outros and row has specific Google/Meta
      if (client.origem === 'Outros' && row.origem !== 'Outros') {
        client.origem = row.origem;
      }
      if (row.fechou) {
        client.total_gasto = (client.total_gasto || 0) + row.valor;
        client.total_pedidos = (client.total_pedidos || 0) + 1;
        client.ultimo_servico = row.dataAgendamento || row.dataOrcamento;
      }
    }

    const quoteId = `quote-set2026-${String(row.index).padStart(2, '0')}`;
    const quoteNumero = `ORC-2026-${String(100 + row.index).padStart(3, '0')}`;
    const osNumero = `OS-2026-${String(200 + row.index).padStart(3, '0')}`;
    const osId = `os-set2026-${String(row.index).padStart(2, '0')}`;
    const appointmentId = `app-set2026-${String(row.index).padStart(2, '0')}`;

    // Calculate quote validity (15 days from quote date)
    const quoteDate = new Date(`${row.dataOrcamento}T09:00:00Z`);
    const validUntil = new Date(quoteDate);
    validUntil.setDate(validUntil.getDate() + 15);
    const validadeStr = validUntil.toISOString().split('T')[0];

    // 1. Quote
    const isScheduledQuote = 
      lowerName === 'camila' ||
      lowerName === 'eloane' ||
      lowerName === 'ale' ||
      lowerName === 'ketly' ||
      lowerName === 'maiza';

    const isConcludedQuote = 
      lowerName.includes('clesiane') ||
      lowerName.includes('fabiana') ||
      lowerName.includes('janesca') ||
      lowerName.includes('jeane') ||
      lowerName.includes('timoteo') ||
      lowerName.includes('timóteo') ||
      lowerName.includes('bella') ||
      lowerName.includes('fernanda lenz');

    const quoteStatus: QuoteStatus = isConcludedQuote 
      ? 'concluido' 
      : ((row.fechou || isScheduledQuote) ? 'aprovado' : 'enviado');

    const quote: Quote = {
      id: quoteId,
      numero: quoteNumero,
      client_id: client.id,
      client_name: client.nome,
      status: quoteStatus,
      subtotal: row.valor,
      total: row.valor,
      observacoes: isConcludedQuote
        ? `Orçamento Concluído e Pago! Serviço realizado em ${row.dataAgendamento || row.dataOrcamento}. Fonte: ${row.origem}.`
        : row.fechou
        ? `Orçamento Fechado! Serviço agendado para o dia ${row.dataAgendamento || row.dataOrcamento}. Fonte: ${row.origem}.`
        : isScheduledQuote
        ? `Orçamento Aprovado! Serviço agendado na Agenda semanal. Fonte: ${row.origem}.`
        : `Orçamento enviado ao cliente. Fonte: ${row.origem}. Aguardando fechamento/follow-up.`,
      validade: validadeStr,
      created_at: `${row.dataOrcamento}T09:00:00.000Z`,
      enviado_em: `${row.dataOrcamento}T09:15:00.000Z`,
      follow_up_status: (row.fechou || isScheduledQuote || isConcludedQuote) ? 'respondido' : 'pendente',
    };
    generatedQuotes.push(quote);

    // 2. Quote Item
    const quoteItem: QuoteItem = {
      id: `item-quote-set2026-${String(row.index).padStart(2, '0')}`,
      quote_id: quoteId,
      service_id: 'serv-hig-sofa',
      descricao: row.servico,
      qtd: 1,
      preco_unit: row.valor,
      subtotal: row.valor,
    };
    generatedQuoteItems.push(quoteItem);

    // 3. If closed ('sim'), create ServiceOrder & Appointment
    if (row.fechou) {
      const scheduledDate = row.dataAgendamento || row.dataOrcamento;
      const isConcluded = isConcludedQuote;

      const serviceOrder: ServiceOrder = {
        id: osId,
        numero: osNumero,
        quote_id: quoteId,
        quote_numero: quoteNumero,
        client_id: client.id,
        client_name: client.nome,
        client_phone: client.telefone || '+55 (54) 99140-0553',
        status: isConcluded ? 'concluido' : 'agendado',
        total: row.valor,
        pago: isConcluded ? row.valor : 0,
        data_agendada: `${scheduledDate}T14:00`,
        data_conclusao: isConcluded ? scheduledDate : undefined,
        tecnico: 'Equipe Higipro 01',
        endereco: client.endereco || `${row.cidade || 'Passo Fundo'} - RS`,
        observacoes: `Ordem de Serviço gerada do ${quoteNumero} (${row.servico}). Fonte: ${row.origem}.${isConcluded ? ' Serviço Concluído e Quitado.' : ''}`,
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
        status: isConcluded ? 'concluido' : 'agendado',
        tecnico: 'Equipe Higipro 01',
        endereco: client.endereco || `${row.cidade || 'Passo Fundo'} - RS`,
        observacoes: `Agendamento ${isConcluded ? 'concluído' : 'programado'} do orçamento ${quoteNumero} (${row.servico}).`,
        valor: row.valor,
      };
      generatedAppointments.push(appointment);
    }
  });

  // Dynamic lookup for active weekly orders linked quotes
  const findQuoteForClient = (clientNameSub: string) => {
    return generatedQuotes.find(q => (q.client_name || '').toLowerCase().includes(clientNameSub.toLowerCase()));
  };

  const camilaQ = findQuoteForClient('camila');
  const eloaneQ = findQuoteForClient('eloane');
  const maizaQ = findQuoteForClient('maiza');
  const ketlyQ = findQuoteForClient('ketly');
  const aleQ = findQuoteForClient('ale');

  // Active scheduled Service Orders for current period (September/October)
  const activeWeeklyOrders: ServiceOrder[] = [
    {
      id: 'os-agenda-2026-09-26-02',
      numero: 'OS-2026-0009',
      quote_id: aleQ?.id || 'quote-set2026-19',
      quote_numero: aleQ?.numero || 'ORC-2026-119',
      client_id: 'client-ale',
      client_name: 'Ale',
      client_phone: '(54) 99140-0553',
      status: 'agendado',
      total: 370.00,
      pago: 0,
      data_agendada: '2026-09-26T13:30',
      tecnico: 'Amanda Neimaier',
      endereco: 'Rua Uruguai, 980 - Boqueirão, Passo Fundo - RS',
      observacoes: 'Higienização de Sofá e Poltronas. Agendado para sábado à tarde.',
      created_at: '2026-09-21T13:30:00.000Z',
    },
    {
      id: 'os-set2026-09',
      numero: 'OS-2026-209',
      quote_id: 'quote-set2026-09',
      quote_numero: 'ORC-2026-109',
      client_id: 'e7c8279f-5f81-4ebb-bd14-764fef20baa4',
      client_name: 'Clesiane',
      client_phone: '+55 (54) 99140-0553',
      status: 'concluido',
      total: 535.00,
      pago: 535.00,
      data_agendada: '2026-09-28T14:00',
      data_conclusao: '2026-09-28',
      tecnico: 'Equipe Higipro 01',
      metodo_pagamento: 'Pix',
      endereco: 'Passo Fundo - RS',
      observacoes: 'Ordem de Serviço (Pago) #OS-2026-209. Fonte: Meta Ads.',
      created_at: '2026-09-25T09:00:00.000Z',
    },
    {
      id: 'os-out2026-0033',
      numero: 'OS-2026-0033',
      quote_id: 'quote-set2026-08',
      quote_numero: 'ORC-2026-108',
      client_id: 'd9b5d880-93c3-40d2-a461-8796f136d742',
      client_name: 'Fabiana cliente colchão',
      client_phone: '+55 (54) 9987-9106',
      status: 'concluido',
      total: 250.00,
      pago: 250.00,
      data_agendada: '2026-09-28T10:00',
      data_conclusao: '2026-09-28',
      tecnico: 'Equipe Higipro 01',
      metodo_pagamento: 'Pix',
      endereco: 'Passo Fundo - RS',
      observacoes: 'Higienização de Colchão. Ordem de Serviço (Pago) #OS-2026-0033. Fonte: Meta Ads.',
      created_at: '2026-09-25T10:00:00.000Z',
    },
    {
      id: 'os-agenda-2026-10-06-01',
      numero: 'OS-2026-0011',
      quote_id: 'quote-out2026-02',
      quote_numero: 'ORC-2026-0121',
      client_id: 'client-condominio-solar',
      client_name: 'Condomínio Solar das Palmeiras',
      client_phone: '(54) 99654-7890',
      status: 'agendado',
      total: 890.00,
      pago: 0,
      data_agendada: '2026-10-06T14:00',
      tecnico: 'Amanda Neimaier',
      endereco: 'Av. Brasil, 1200 - Centro, Passo Fundo - RS',
      observacoes: 'Limpeza e Higienização de Estofados de Recepção e Cadeiras. Serviço corporativo agendado.',
      created_at: '2026-10-02T10:00:00.000Z',
    },
  ];

  const activeWeeklyAppointments: Appointment[] = [
    {
      id: 'app-agenda-2026-09-23-01',
      os_id: 'os-agenda-2026-09-23-01',
      client_id: 'client-carlos-eduardo',
      client_name: 'Carlos Eduardo Oliveira',
      servicos: 'Impermeabilização Premium de Sofá',
      data_hora: '2026-09-23T10:00',
      duracao: 90,
      status: 'confirmado',
      tecnico: 'Equipe Higipro 01',
      endereco: 'Rua Domingos de Morais, 2150',
      observacoes: 'Serviço em execução nesta manhã. Levar sapatilhas de proteção.',
      valor: 380.00,
    },
    {
      id: 'app-agenda-2026-09-24-01',
      os_id: 'os-agenda-2026-09-24-01',
      client_id: 'client-camila',
      client_name: 'Camila',
      servicos: 'Higienização de Sofá (3 lugares)',
      data_hora: '2026-09-24T09:30',
      duracao: 120,
      status: 'agendado',
      tecnico: 'Equipe Higipro 01',
      endereco: 'Rua Morom, 1420 - Centro, Passo Fundo - RS',
      observacoes: 'Agendamento para amanhã quinta-feira de manhã. Orçamento fechado.',
      valor: 210.00,
    },
    {
      id: 'app-agenda-2026-09-24-02',
      os_id: 'os-agenda-2026-09-24-02',
      client_id: 'client-eloane',
      client_name: 'Eloane',
      servicos: 'Higienização de Sofá e Estofados',
      data_hora: '2026-09-24T14:00',
      duracao: 150,
      status: 'confirmado',
      tecnico: 'Equipe Higipro 01',
      endereco: 'Av. Brasil Leste, 850 - Petrópolis, Passo Fundo - RS',
      observacoes: 'Agendamento confirmado para amanhã quinta-feira à tarde.',
      valor: 540.00,
    },
    {
      id: 'app-agenda-2026-09-25-01',
      os_id: 'os-agenda-2026-09-25-01',
      client_id: 'client-maiza',
      client_name: 'Maiza',
      servicos: 'Impermeabilização Premium de Sofá',
      data_hora: '2026-09-25T09:00',
      duracao: 120,
      status: 'agendado',
      tecnico: 'Equipe Higipro 01',
      endereco: 'Rua Bento Gonçalves, 340 - Centro, Passo Fundo - RS',
      observacoes: 'Agendamento para sexta-feira de manhã.',
      valor: 545.00,
    },
    {
      id: 'app-agenda-2026-09-25-02',
      os_id: 'os-agenda-2026-09-25-02',
      client_id: 'client-mariana-silva',
      client_name: 'Mariana Silva de Souza',
      servicos: 'Higienização de Sofá + Impermeabilização',
      data_hora: '2026-09-25T13:30',
      duracao: 210,
      status: 'agendado',
      tecnico: 'Amanda Neimaier',
      endereco: 'Alameda Lorena, 1420 - Apt 82',
      observacoes: 'Agendamento para sexta-feira à tarde. Levar máquina extratora extra.',
      valor: 630.00,
    },
    {
      id: 'app-agenda-2026-09-26-01',
      os_id: 'os-agenda-2026-09-26-01',
      client_id: 'client-ketly',
      client_name: 'Ketly',
      servicos: 'Higienização Profunda de Estofados',
      data_hora: '2026-09-26T09:00',
      duracao: 120,
      status: 'confirmado',
      tecnico: 'Equipe Higipro 01',
      endereco: 'Rua Independência, 510 - Vila Vergueiro, Passo Fundo - RS',
      observacoes: 'Agendamento confirmado para sábado de manhã.',
      valor: 390.00,
    },
    {
      id: 'app-agenda-2026-09-26-02',
      os_id: 'os-agenda-2026-09-26-02',
      client_id: 'client-ale',
      client_name: 'Ale',
      servicos: 'Higienização de Sofá e Poltronas',
      data_hora: '2026-09-26T13:30',
      duracao: 120,
      status: 'agendado',
      tecnico: 'Amanda Neimaier',
      endereco: 'Rua Uruguai, 980 - Boqueirão, Passo Fundo - RS',
      observacoes: 'Agendamento para sábado à tarde.',
      valor: 370.00,
    },
    {
      id: 'app-agenda-2026-10-06-01',
      os_id: 'os-agenda-2026-10-06-01',
      client_id: 'client-condominio-solar',
      client_name: 'Condomínio Solar das Palmeiras',
      servicos: 'Limpeza e Higienização de Estofados de Recepção e Cadeiras',
      data_hora: '2026-10-06T14:00',
      duracao: 180,
      status: 'agendado',
      tecnico: 'Amanda Neimaier',
      endereco: 'Av. Brasil, 1200 - Centro, Passo Fundo - RS',
      observacoes: 'Serviço corporativo agendado para o próximo mês.',
      valor: 890.00,
    },
  ];

  // Additional October active Quotes
  const octoberQuotes: Quote[] = [
    {
      id: 'quote-out2026-02',
      numero: 'ORC-2026-0121',
      client_id: 'client-condominio-solar',
      client_name: 'Condomínio Solar das Palmeiras',
      status: 'aprovado',
      subtotal: 890.00,
      total: 890.00,
      observacoes: 'Orçamento Comercial Aprovado em Outubro! Serviço agendado para 06/10/2026.',
      validade: '2026-10-17',
      created_at: '2026-10-02T10:00:00.000Z',
      enviado_em: '2026-10-02T10:15:00.000Z',
      follow_up_status: 'respondido',
    },
  ];

  const octoberQuoteItems: QuoteItem[] = [
    {
      id: 'item-quote-out2026-02',
      quote_id: 'quote-out2026-02',
      service_id: 'serv-hig-sofa',
      descricao: 'Limpeza e Higienização de Estofados de Recepção e Cadeiras',
      qtd: 1,
      preco_unit: 890.00,
      subtotal: 890.00,
    },
  ];

  // October Clients
  const octoberClients: Client[] = [
    {
      id: 'client-condominio-solar',
      nome: 'Condomínio Solar das Palmeiras',
      telefone: '(54) 99654-7890',
      email: 'administracao@solardaspalmeiras.com.br',
      endereco: 'Av. Brasil, 1200 - Centro',
      cidade: 'Passo Fundo',
      estado: 'RS',
      CEP: '99010-000',
      origem: 'Indicação',
      observacoes: 'Atendimento corporativo para higienização e limpeza de estofados da recepção.',
      tags: ['Cliente Corporativo', 'Condomínio'],
      created_at: '2026-10-02T10:00:00.000Z',
      total_pedidos: 1,
      total_gasto: 0,
      historico_servicos: [
        {
          id: 'hist-out2026-02',
          nome_servico: 'Limpeza e Higienização de Estofados de Recepção e Cadeiras',
          servico: 'Higienização Comercial',
          categoria: 'Higienização',
          tipo_estofado: 'Sofá',
          valor: 890.00,
          data: '2026-10-06',
          tipo: 'servico',
        }
      ]
    }
  ];

  existingClients.push(...octoberClients);

  // NEVER discard existing user quotes, items, orders, or appointments.
  // Only add initial generated entries if they don't already exist.
  const allInitialQuotes = [...generatedQuotes, ...octoberQuotes];
  const allInitialItems = [...generatedQuoteItems, ...octoberQuoteItems];

  const existingQuoteIds = new Set((db.quotes || []).map(q => q.id));
  const newQuotesToAdd = allInitialQuotes.filter(q => !existingQuoteIds.has(q.id));

  const existingItemIds = new Set((db.quoteItems || []).map(qi => qi.id));
  const newItemsToAdd = allInitialItems.filter(qi => !existingItemIds.has(qi.id));

  const existingOrderIds = new Set((db.serviceOrders || []).map(os => os.id));
  const newOrdersToAdd = [...activeWeeklyOrders, ...generatedServiceOrders].filter(
    os => !existingOrderIds.has(os.id) && !isExcludedServiceOrder(os)
  );

  const existingApptIds = new Set((db.appointments || []).map(a => a.id));
  const newApptsToAdd = [...activeWeeklyAppointments, ...generatedAppointments].filter(
    a => !existingApptIds.has(a.id) && (!a.os_id || !isExcludedServiceOrder({ id: a.os_id, numero: a.os_id })) && !isExcludedServiceOrder(a)
  );

  // Ensure unique clients by id
  const seenClientIds = new Set<string>();
  const finalClients: Client[] = [];
  for (const c of existingClients) {
    if (!seenClientIds.has(c.id)) {
      seenClientIds.add(c.id);
      finalClients.push(c);
    }
  }

  return {
    ...db,
    clients: finalClients,
    quotes: [...(db.quotes || []), ...newQuotesToAdd],
    quoteItems: [...(db.quoteItems || []), ...newItemsToAdd],
    serviceOrders: [...(db.serviceOrders || []), ...newOrdersToAdd].filter(os => !isExcludedServiceOrder(os)),
    appointments: [...(db.appointments || []), ...newApptsToAdd].filter(
      a => !a.os_id || !isExcludedServiceOrder({ id: a.os_id, numero: a.os_id })
    ),
  };
}
