/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Client, Service, Product, ProductCategory, PRODUCT_CATEGORIES, Quote, QuoteItem, ServiceOrder, OSPhoto, ClientPhoto,
  Appointment, Transaction, Recurrence, RecurrenceExecution, RecurrenceLog, ClientOrigin,
  CompanySettings
} from '../types';

import preparsedDb from './preparsedDb.json';
import { getHistoricalTransactions } from './historicalBilling';
import { fetchAllFromSupabase } from './supabase';
import { applySeptember2026Spreadsheet } from './september2026Spreadsheet';
import { applySeptember2026Quotes } from './september2026Quotes';
import { extractServiceNumber } from './utils';
import { 
  saveToIndexedDB, 
  loadFromIndexedDB, 
  createIndexedDBSnapshot, 
  listIndexedDBSnapshots, 
  restoreIndexedDBSnapshot 
} from './idbDatabase';
import { 
  uploadFullDatabaseToCloud, 
  fetchFullDatabaseFromCloud, 
  testFirestoreConnection 
} from './firebaseSync';
import { 
  autoStampDatabaseState, 
  resolveEntityWinner, 
  parseEntityTimestamp, 
  stampEntity,
  isEntityTombstoned 
} from './versioning';

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  razao_social: 'HigiPro-Gestão De Estofados v3.5 (Impermeabilização Premium & Higienização)',
  nome_fantasia: 'HigiPro-Gestão De Estofados v3.5',
  cnpj_cpf: '48.173.529/0001-33',
  telefone: '+55 (54) 99140-0553',
  whatsapp: '(54) 99140-0553',
  email: 'higipro.comercial@gmail.com',
  endereco: 'Av. Brasil Leste, 1500 - Centro',
  cidade: 'Passo Fundo',
  estado: 'RS',
  cep: '99010-000',
  chave_pix: '48.173.529/0001-33',
  tipo_chave_pix: 'CNPJ',
  banco: 'Banco Inter (077)',
  garantia_padrao_higienizacao: 'Garantia técnica de 90 dias contra proliferação de ácaros e fungos e garantia de satisfação de serviço.',
  garantia_padrao_impermeabilizacao: 'Garantia de 1 ano contra penetração de líquidos a base de água e óleo com certificado digital de aplicação.',
  mensagem_padrao_orcamento: 'Olá {cliente}! Segue o seu orçamento #{numero_orcamento} no valor total de {total}. Validade da proposta: {validade}. Ficamos à total disposição!',
  mensagem_follow_up_orcamento: 'Olá {cliente}! Ficou alguma dúvida sobre seu orçamento na HigiPro ou podemos agendar? 😊',
  mensagem_agendamento: 'Olá {cliente}, confirmamos seu agendamento de higienização para o dia {data} às {horario} com o técnico {tecnico}. Qualquer dúvida entre em contato.',
  mensagem_pos_venda: 'Olá {cliente}! Tudo bem? Como ficou o serviço na HigiPro? Se puder nos avaliar com 5 estrelas no Google: {link_google} ⭐ Obrigado!',
  mensagem_recorrencia: 'Olá {cliente}! Faz 1 ano da sua higienização na HigiPro. Que tal renovarmos com desconto especial de retorno? 🛋️✨',
  link_avaliacao_google: 'https://g.page/r/CRZ8Higipro/review',
  dias_pos_venda: 2,
  smart_goals: {
    metaFaturamentoMensal: 15000,
    diasTrabalhadosMes: 22,
    horasProdutivasDia: 6.5,
    custosFixosMensal: 3500,
    margemLucroDesejadaPercentual: 40,
    ticketMedioEstimado: 380,
  },
  budget_calculator: {
    valorHoraMaoDeObra: 85.00,
    custoKmDeslocamento: 1.80,
    margemLucroPadrao: 40,
    impostoTaxasPadrao: 6,
    custosFixosRateio: 15.00,
  },
};

export interface DatabaseState {
  clients: Client[];
  services: Service[];
  products?: Product[];
  quotes: Quote[];
  quoteItems: QuoteItem[];
  serviceOrders: ServiceOrder[];
  osPhotos: OSPhoto[];
  clientPhotos?: ClientPhoto[];
  appointments: Appointment[];
  transactions: Transaction[];
  recurrences: Recurrence[];
  recurrenceExecutions: RecurrenceExecution[];
  recurrenceLogs?: RecurrenceLog[];
  companySettings?: CompanySettings;
  deletedEntityIds?: Record<string, string>;
  [key: string]: any;
}

const STORAGE_KEY = 'higipro_database';
const BACKUP_KEY = 'higipro_database_backup';

// Helper to generate RFC-4122 v4 UUIDs
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Standard categories and estofado types
export const CATEGORIES = ['Higienização', 'Impermeabilização', 'Limpeza', 'Sanitização', 'Tapete', 'Outros'] as const;
export const ESTOFADO_TYPES = ['Sofá', 'Colchão', 'Poltrona', 'Cadeira', 'Tapete', 'Cortina', 'Carro', 'Outros'] as const;
export const ORIGINS = ['Google', 'Meta', 'Indicação', 'Cliente da Base', 'Outros'] as const;
export const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Cartão', 'Transferência', 'Boleto'] as const;

// Professional Chemical Products & Supplies (Detergente, Tira Manchas, Alvejante, Impermeabilizante, etc.)
export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod-det-flotador',
    nome: 'Detergente Flotador Concentrado (Alta Espuma / Extração)',
    categoria: 'Detergentes',
    preco_custo: 48.00,
    preco_venda: 85.00,
    custo_por_servico: 5.50,
    unidade: 'Galão 5L',
    rendimento: 'Rende ~20 higienizações de sofás',
    fornecedor: 'Spartan / Quimiart',
    observacoes: 'Detergente desincrustante de alto rendimento para uso em extratora.',
    ativo: true,
  },
  {
    id: 'prod-tira-manchas',
    nome: 'Tira Manchas Enzimático & Gorduras (Oxigênio Ativo)',
    categoria: 'Tira Manchas',
    preco_custo: 58.00,
    preco_venda: 65.00,
    custo_por_servico: 7.50,
    unidade: 'Frasco 1L',
    rendimento: 'Rende ~15 remoções de manchas profundas',
    fornecedor: 'Spartan / Vonixx',
    observacoes: 'Ação enzimática contra café, sangue, gordura, chocolate e vinho.',
    ativo: true,
  },
  {
    id: 'prod-alvejante-o2',
    nome: 'Alvejante sem Cloro (Peróxido de Hidrogênio 200V)',
    categoria: 'Alvejantes',
    preco_custo: 52.00,
    preco_venda: 75.00,
    custo_por_servico: 6.80,
    unidade: 'Galão 5L',
    rendimento: 'Rende ~18 estofados claros / colchões',
    fornecedor: 'Easytech / Renko',
    observacoes: 'Clareamento e revitalização de tecidos claros e colchões sem agredir fibras.',
    ativo: true,
  },
  {
    id: 'prod-resina-impermeab',
    nome: 'Impermeabilizante Premium Nanotecnológico (Resina Fluorada)',
    categoria: 'Impermeabilizantes',
    preco_custo: 160.00,
    preco_venda: 380.00,
    custo_por_servico: 45.00,
    unidade: 'Galão 5L',
    rendimento: 'Rende ~3 a 4 sofás retráteis',
    fornecedor: 'Lotus / Protec',
    observacoes: 'Blindagem nanotecnológica contra líquidos, água e óleos com certificado digital.',
    ativo: true,
  },
  {
    id: 'prod-neutralizador-odores',
    nome: 'Neutralizador de Odores & Bactericida Sanitizante',
    categoria: 'Sanitizantes & Neutralizadores',
    preco_custo: 39.00,
    preco_venda: 50.00,
    custo_por_servico: 4.50,
    unidade: 'Frasco 1L',
    rendimento: 'Rende ~25 sanitizações antialérgicas',
    fornecedor: 'Spartan / Proclean',
    observacoes: 'Elimina ácaros, fungos, mofo, cheiro de pets e tabaco com ação comprovada.',
    ativo: true,
  },
  {
    id: 'prod-amaciante-fibras',
    nome: 'Finalizador & Amaciante de Fibras de Tecido',
    categoria: 'Finalizadores',
    preco_custo: 34.00,
    preco_venda: 45.00,
    custo_por_servico: 3.80,
    unidade: 'Galão 5L',
    rendimento: 'Rende ~25 serviços',
    fornecedor: 'Vonixx / Bellinzoni',
    observacoes: 'Neutraliza o pH químico pós-higienização e restaura o toque aveludado.',
    ativo: true,
  },
];

// Realistic Seed Data in pt-BR
const getSeedData = (): DatabaseState => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthInt = now.getMonth();
  
  const formatDateOffset = (daysOffset: number, hoursStr: string = '09:00') => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}T${hoursStr}`;
  };

  const formatDateOnlyOffset = (daysOffset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  };

  const clientIds = [generateId(), generateId(), generateId(), generateId(), generateId()];
  const serviceIds = [generateId(), generateId(), generateId(), generateId(), generateId()];
  const quoteIds = [generateId(), generateId(), generateId()];
  const osIds = [generateId(), generateId(), generateId(), generateId()];
  const recIds = [generateId(), generateId()];

  const clients: Client[] = [
    {
      id: clientIds[0],
      nome: 'Mariana Silva de Souza',
      telefone: '11987654321',
      email: 'mariana.silva@gmail.com',
      endereco: 'Alameda Lorena, 1420 - Apt 82',
      cidade: 'São Paulo',
      estado: 'SP',
      CEP: '01424-001',
      observacoes: 'Apartamento tem gato persa com muitos pelos. Necessita higienização antialérgica profunda.',
      tags: ['Pet Friendly', 'VIP'],
      origem: 'Meta Ads',
      created_at: formatDateOnlyOffset(-45),
    },
    {
      id: clientIds[1],
      nome: 'Carlos Eduardo Oliveira',
      telefone: '11976543210',
      email: 'carlos.oliveira@outlook.com',
      endereco: 'Rua Domingos de Morais, 2150',
      cidade: 'São Paulo',
      estado: 'SP',
      CEP: '04036-000',
      observacoes: 'Sofá de linho cru muito delicado. Solicita impermeabilização.',
      tags: ['Cuidadoso'],
      origem: 'Google',
      created_at: formatDateOnlyOffset(-30),
    },
    {
      id: clientIds[2],
      nome: 'Cláudia Regina Mendes',
      telefone: '11965432109',
      email: 'claudia.mendes@uol.com.br',
      endereco: 'Av. Paulista, 1000 - Bloco B',
      cidade: 'São Paulo',
      estado: 'SP',
      CEP: '01310-100',
      observacoes: 'Indicação da vizinha Luísa. Colchão com manchas de café.',
      tags: ['Indicação'],
      origem: 'Indicação',
      created_at: formatDateOnlyOffset(-15),
    },
    {
      id: clientIds[3],
      nome: 'Roberto Santos Ferraz',
      telefone: '11954321098',
      email: 'roberto.ferraz@tech.io',
      endereco: 'Rua Augusta, 420 - Apt 12',
      cidade: 'São Paulo',
      estado: 'SP',
      CEP: '01304-000',
      observacoes: 'Banco de couro do carro (SUV). Higienização e hidratação.',
      tags: ['Automotivo'],
      origem: 'Indicação',
      created_at: formatDateOnlyOffset(-5),
    },
    {
      id: clientIds[4],
      nome: 'Beatriz Vasconcellos',
      telefone: '11943210987',
      email: 'bia.vasco@gmail.com',
      endereco: 'Rua Heitor Penteado, 1800',
      cidade: 'São Paulo',
      estado: 'SP',
      CEP: '05438-100',
      observacoes: 'Limpeza de cortinas de seda e tapete persa grande.',
      tags: ['Alto Padrão'],
      origem: 'Meta Ads',
      created_at: formatDateOnlyOffset(-2),
    },
  ];

  const services: Service[] = [
    {
      id: serviceIds[0],
      nome: 'Higienização de Sofá (3 lugares)',
      descricao: 'Higienização profunda, remoção de ácaros, fungos, odores e manchas leves com extratora de alta pressão.',
      categoria: 'Higienização',
      tipo_estofado: 'Sofá',
      preco: 250.00,
      custo: 30.00,
      duracao: 120,
      ativo: true,
    },
    {
      id: serviceIds[1],
      nome: 'Impermeabilização Premium de Sofá',
      descricao: 'Aplicação de resina protetora de tecidos com garantia de 1 ano contra líquidos e umidade. Produto não inflamável.',
      categoria: 'Impermeabilização',
      tipo_estofado: 'Sofá',
      preco: 380.00,
      custo: 90.00,
      duracao: 90,
      ativo: true,
    },
    {
      id: serviceIds[2],
      nome: 'Higienização de Colchão Casal',
      descricao: 'Limpeza profunda nas duas faces do colchão com aplicação de produto bactericida e antialérgico de alta eficácia.',
      categoria: 'Higienização',
      tipo_estofado: 'Colchão',
      preco: 180.00,
      custo: 20.00,
      duracao: 90,
      ativo: true,
    },
    {
      id: serviceIds[3],
      nome: 'Limpeza e Hidratação de Bancos de Couro',
      descricao: 'Higienização completa do couro automotivo e aplicação de hidratante de alta absorção para evitar rachaduras.',
      categoria: 'Limpeza',
      tipo_estofado: 'Carro',
      preco: 220.00,
      custo: 40.00,
      duracao: 120,
      ativo: true,
    },
    {
      id: serviceIds[4],
      nome: 'Higienização e Limpeza de Tapete (m²)',
      descricao: 'Higienização e limpeza por metro quadrado (R$ 55,00/m²), mantendo as cores e a maciez original.',
      categoria: 'Tapete',
      tipo_estofado: 'Tapete',
      preco: 55.00,
      custo: 12.00,
      duracao: 120,
      ativo: true,
      unidade: 'm²',
    },
  ];

  const quotes: Quote[] = [
    {
      id: quoteIds[0],
      numero: `ORC-${year}-0001`,
      client_id: clientIds[2],
      client_name: 'Cláudia Regina Mendes',
      status: 'aprovado',
      total: 180.00,
      observacoes: 'Cliente aprovou na hora pelo WhatsApp. Convertido para OS.',
      validade: formatDateOnlyOffset(10),
      created_at: formatDateOnlyOffset(-15),
    },
    {
      id: quoteIds[1],
      numero: `ORC-${year}-0002`,
      client_id: clientIds[0],
      client_name: 'Mariana Silva de Souza',
      status: 'enviado',
      total: 630.00,
      observacoes: 'Combo de Higienização de Sofá + Impermeabilização Premium.',
      validade: formatDateOnlyOffset(8),
      created_at: formatDateOnlyOffset(-1),
      tem_lembrete: true,
      lembrete_data: formatDateOnlyOffset(0),
      lembrete_motivo: 'Cliente pediu orçamento para impermeabilizar porém o sofá só chega daqui a 30 dias (lembrete para chamar e agendar)',
      lembrete_concluido: false,
    },
    {
      id: quoteIds[2],
      numero: `ORC-${year}-0003`,
      client_id: clientIds[4],
      client_name: 'Beatriz Vasconcellos',
      status: 'rascunho',
      total: 270.00,
      observacoes: 'Aguardando metragem exata do tapete para finalizar.',
      validade: formatDateOnlyOffset(14),
      created_at: formatDateOnlyOffset(0),
    },
  ];

  const quoteItems: QuoteItem[] = [
    {
      id: generateId(),
      quote_id: quoteIds[0],
      service_id: serviceIds[2],
      descricao: 'Higienização de Colchão Casal',
      qtd: 1,
      preco_unit: 180.00,
      subtotal: 180.00,
    },
    {
      id: generateId(),
      quote_id: quoteIds[1],
      service_id: serviceIds[0],
      descricao: 'Higienização de Sofá (3 lugares)',
      qtd: 1,
      preco_unit: 250.00,
      subtotal: 250.00,
    },
    {
      id: generateId(),
      quote_id: quoteIds[1],
      service_id: serviceIds[1],
      descricao: 'Impermeabilização Premium de Sofá',
      qtd: 1,
      preco_unit: 380.00,
      subtotal: 380.00,
    },
    {
      id: generateId(),
      quote_id: quoteIds[2],
      service_id: serviceIds[4],
      descricao: 'Higienização de Tapete Persa (m²)',
      qtd: 6, // 6 square meters
      preco_unit: 45.00,
      subtotal: 270.00,
    },
  ];

  const serviceOrders: ServiceOrder[] = [
    {
      id: osIds[0],
      numero: `OS-${year}-0001`,
      quote_id: quoteIds[0],
      client_id: clientIds[2],
      client_name: 'Cláudia Regina Mendes',
      client_phone: '11965432109',
      status: 'concluido',
      total: 180.00,
      pago: 180.00,
      data_agendada: formatDateOffset(-10, '14:00'),
      data_conclusao: formatDateOnlyOffset(-10),
      tecnico: 'Luciano Neimaier',
      endereco: 'Av. Paulista, 1000 - Bloco B',
      observacoes: 'Manchas de café removidas com sucesso usando removedor enzimático.',
      created_at: formatDateOnlyOffset(-15),
      pos_venda_enviado: true,
      pos_venda_enviado_em: formatDateOnlyOffset(-8),
      pos_venda_avaliacao: 5,
      pos_venda_feedback: 'Cliente respondeu no WhatsApp agradecendo o atendimento do Luciano e confirmou que avaliou com 5 estrelas no Google!',
    },
    {
      id: osIds[1],
      numero: `OS-${year}-0002`,
      client_id: clientIds[3],
      client_name: 'Roberto Santos Ferraz',
      client_phone: '11954321098',
      status: 'concluido',
      total: 220.00,
      pago: 220.00,
      data_agendada: formatDateOffset(-4, '09:00'),
      data_conclusao: formatDateOnlyOffset(-4),
      tecnico: 'Lisiane Neimaier',
      endereco: 'Rua Augusta, 420 - Apt 12',
      observacoes: 'Bancos hidratados, cliente elogiou o cheiro do carro.',
      created_at: formatDateOnlyOffset(-5),
      pos_venda_enviado: false,
    },
    {
      id: osIds[2],
      numero: `OS-${year}-0003`,
      client_id: clientIds[1],
      client_name: 'Carlos Eduardo Oliveira',
      client_phone: '11976543210',
      status: 'em_execucao',
      total: 380.00,
      pago: 180.00, // Partial payment (sinal)
      data_agendada: formatDateOffset(0, '10:00'), // Scheduled for today
      tecnico: 'Equipe Higipro 01',
      endereco: 'Rua Domingos de Morais, 2150',
      observacoes: 'Levar as sapatilhas de proteção e impermeabilizante extra.',
      created_at: formatDateOnlyOffset(-3),
    },
    {
      id: osIds[3],
      numero: `OS-${year}-0004`,
      client_id: clientIds[0],
      client_name: 'Mariana Silva de Souza',
      client_phone: '11987654321',
      status: 'agendado',
      total: 630.00,
      pago: 0,
      data_agendada: formatDateOffset(2, '13:30'), // Day after tomorrow
      tecnico: 'Amanda Neimaier',
      endereco: 'Alameda Lorena, 1420 - Apt 82',
      observacoes: 'Remover pelos do persa antes da aplicação do produto.',
      created_at: formatDateOnlyOffset(-1),
    },
  ];

  const osPhotos: OSPhoto[] = [
    {
      id: generateId(),
      os_id: osIds[0],
      url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=300&auto=format&fit=crop&q=60',
      label: 'antes',
      created_at: formatDateOnlyOffset(-10),
    },
    {
      id: generateId(),
      os_id: osIds[0],
      url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=300&auto=format&fit=crop&q=60',
      label: 'depois',
      created_at: formatDateOnlyOffset(-10),
    },
  ];

  const appointments: Appointment[] = [
    {
      id: generateId(),
      os_id: osIds[2],
      client_id: clientIds[1],
      client_name: 'Carlos Eduardo Oliveira',
      servicos: 'Impermeabilização Premium de Sofá',
      data_hora: formatDateOffset(0, '10:00'), // Today
      duracao: 90,
      status: 'confirmado',
      tecnico: 'Equipe Higipro 01',
      endereco: 'Rua Domingos de Morais, 2150',
      observacoes: 'Já confirmado com o cliente por telefone.',
      valor: 380.00,
    },
    {
      id: generateId(),
      os_id: osIds[3],
      client_id: clientIds[0],
      client_name: 'Mariana Silva de Souza',
      servicos: 'Higienização de Sofá + Impermeabilização',
      data_hora: formatDateOffset(2, '13:30'), // 2 days from now
      duracao: 210,
      status: 'agendado',
      tecnico: 'Amanda Neimaier',
      endereco: 'Alameda Lorena, 1420 - Apt 82',
      observacoes: 'Necessita máquina extratora extra.',
      valor: 630.00,
    },
  ];

  const transactions: Transaction[] = [
    // Historical payments (Revenues)
    {
      id: generateId(),
      tipo: 'receita',
      categoria: 'Higienização',
      descricao: 'Serviço de Higienização de Colchão (OS-2026-0001)',
      valor: 180.00,
      data: formatDateOnlyOffset(-10),
      metodo_pagamento: 'Pix',
      status: 'pago',
      os_id: osIds[0],
      client_id: clientIds[2],
      client_name: 'Cláudia Regina Mendes',
      created_at: formatDateOnlyOffset(-10),
    },
    {
      id: generateId(),
      tipo: 'receita',
      categoria: 'Limpeza',
      descricao: 'Limpeza de Bancos SUV (OS-2026-0002)',
      valor: 220.00,
      data: formatDateOnlyOffset(-4),
      metodo_pagamento: 'Cartão',
      status: 'pago',
      os_id: osIds[1],
      client_id: clientIds[3],
      client_name: 'Roberto Santos Ferraz',
      created_at: formatDateOnlyOffset(-4),
    },
    {
      id: generateId(),
      tipo: 'receita',
      categoria: 'Impermeabilização',
      descricao: 'Sinal de Impermeabilização de Sofá (OS-2026-0003)',
      valor: 180.00,
      data: formatDateOnlyOffset(-3),
      metodo_pagamento: 'Pix',
      status: 'pago',
      os_id: osIds[2],
      client_id: clientIds[1],
      client_name: 'Carlos Eduardo Oliveira',
      created_at: formatDateOnlyOffset(-3),
    },
    // Expenses (Despesas)
    {
      id: generateId(),
      tipo: 'despesa',
      categoria: 'Insumos',
      descricao: 'Galão 5L Detergente Extratora Neutro',
      valor: 120.00,
      data: formatDateOnlyOffset(-18),
      metodo_pagamento: 'Transferência',
      status: 'pago',
      created_at: formatDateOnlyOffset(-18),
    },
    {
      id: generateId(),
      tipo: 'despesa',
      categoria: 'Insumos',
      descricao: 'Impermeabilizante Tecidos Premium Sparclon',
      valor: 240.00,
      data: formatDateOnlyOffset(-12),
      metodo_pagamento: 'Boleto',
      status: 'pago',
      created_at: formatDateOnlyOffset(-12),
    },
    {
      id: generateId(),
      tipo: 'despesa',
      categoria: 'Marketing',
      descricao: 'Anúncios Google Ads / Instagram Ads',
      valor: 350.00,
      data: formatDateOnlyOffset(-8),
      metodo_pagamento: 'Cartão',
      status: 'pago',
      created_at: formatDateOnlyOffset(-8),
    },
    {
      id: generateId(),
      tipo: 'despesa',
      categoria: 'Combustível',
      descricao: 'Abastecimento veículo frota (Visitas e Execuções)',
      valor: 150.00,
      data: formatDateOnlyOffset(-5),
      metodo_pagamento: 'Cartão',
      status: 'pago',
      created_at: formatDateOnlyOffset(-5),
    },
    {
      id: generateId(),
      tipo: 'despesa',
      categoria: 'Manutenção',
      descricao: 'Troca de mangueira extratora Karcher',
      valor: 85.00,
      data: formatDateOnlyOffset(-2),
      metodo_pagamento: 'Pix',
      status: 'pago',
      created_at: formatDateOnlyOffset(-2),
    },
  ];

  const recurrences: Recurrence[] = [
    {
      id: recIds[0],
      client_id: clientIds[2],
      client_name: 'Cláudia Regina Mendes',
      service_id: serviceIds[2],
      service_name: 'Higienização de Colchão Casal',
      frequencia: 'anual',
      intervalo: 12,
      proxima_data: formatDateOnlyOffset(355), // 1 year from her OS date
      data_inicio: formatDateOnlyOffset(-10),
      ativo: true,
      lembrete: 30,
      observacoes: 'Agendar retorno anual de 12 meses (1 ano). Recomendar impermeabilização junto.',
    },
    {
      id: recIds[1],
      client_id: clientIds[3],
      client_name: 'Roberto Santos Ferraz',
      service_id: serviceIds[3],
      service_name: 'Limpeza e Hidratação de Bancos de Couro',
      frequencia: 'anual',
      intervalo: 12,
      proxima_data: formatDateOnlyOffset(360), // ~1 year from his OS date
      data_inicio: formatDateOnlyOffset(-4),
      ativo: true,
      lembrete: 30,
      observacoes: 'Fez higienização de bancos, couro necessita reidratação anual.',
    },
  ];

  const recurrenceExecutions: RecurrenceExecution[] = [
    {
      id: generateId(),
      recurrence_id: recIds[0],
      data_execucao: formatDateOnlyOffset(-10),
      os_id: osIds[0],
      status: 'sucesso',
      observacoes: 'Primeiro serviço concluído e configurado no retorno anual de 12 meses.',
    },
  ];

  return {
    clients,
    services,
    products: DEFAULT_PRODUCTS,
    quotes,
    quoteItems,
    serviceOrders,
    osPhotos,
    appointments,
    transactions,
    recurrences,
    recurrenceExecutions,
    recurrenceLogs: [],
  };
};

/**
 * Normalizes client name by stripping accents, symbols and common upholstery/contact suffixes
 */
export const cleanBaseClientName = (nome: string): string => {
  if (!nome) return '';
  let s = nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/\b(cliente|clientes|sofa|sofas|colchao|colchoes|poltrona|poltronas|cadeira|cadeiras|tapete|tapetes|carro|bancos|imper|impermeabilizacao|higienizacao|limpeza|linho|canto|modulos|modulo|lugares|lugar|captone)\b/g, '').replace(/\s+/g, ' ').trim();
  return s;
};

export interface DeduplicateResult {
  cleanDb: DatabaseState;
  mergedClients: number;
  removedOrders: number;
  removedQuotes: number;
  duplicateClientGroups: Array<{ canonical: Client; merged: Client[] }>;
}

/**
 * Reviews and deduplicates clients and service orders/quotes across the database
 */
export const deduplicateDatabase = (state: DatabaseState): DeduplicateResult => {
  const clients = [...(state.clients || [])];
  const clientRedirect = new Map<string, string>();
  const byBase = new Map<string, Client[]>();

  clients.forEach(c => {
    const base = cleanBaseClientName(c.nome);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(c);
  });

  const shouldMerge = (c1: Client, c2: Client, base: string): boolean => {
    const p1 = c1.telefone?.replace(/\D/g, '');
    const p2 = c2.telefone?.replace(/\D/g, '');
    
    // If both have different non-empty phone numbers, they are definitely distinct contacts
    if (p1 && p2 && p1.length >= 8 && p2.length >= 8 && p1 !== p2) {
      return false;
    }

    // Identical phone numbers
    if (p1 && p2 && p1.length >= 8 && p1 === p2) return true;

    const norm1 = c1.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const norm2 = c2.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    
    // Identical normalized full names (at least 2 words or exact match with no phone conflict)
    if (norm1 === norm2) return true;

    const clean1 = cleanBaseClientName(c1.nome);
    const clean2 = cleanBaseClientName(c2.nome);
    if (clean1 && clean1 === clean2) {
      // Require multi-word name or confirmed matching address to avoid merging different people sharing only a first name
      const isMultiWord = clean1.split(' ').length >= 2;
      const e1 = (c1.endereco || '').toLowerCase().trim();
      const e2 = (c2.endereco || '').toLowerCase().trim();
      if (e1 && e2 && (e1 === e2 || e1.includes(e2) || e2.includes(e1))) {
        return true;
      }
      if (isMultiWord && !e1 && !e2) {
        return true;
      }
    }

    return false;
  };

  const processed = new Set<string>();
  const finalClients: Client[] = [];
  const duplicateClientGroups: Array<{ canonical: Client; merged: Client[] }> = [];
  let mergedClientsCount = 0;

  for (const c of clients) {
    if (processed.has(c.id)) continue;

    const base = cleanBaseClientName(c.nome);
    const candidates = (byBase.get(base) || []).filter(other => other.id !== c.id && !processed.has(other.id));

    const group: Client[] = [c];
    for (const cand of candidates) {
      if (shouldMerge(c, cand, base)) {
        group.push(cand);
      }
    }

    if (group.length > 1) {
      mergedClientsCount += (group.length - 1);
      group.sort((a, b) => {
        const osA = (state.serviceOrders || []).filter(os => os.client_id === a.id).length;
        const osB = (state.serviceOrders || []).filter(os => os.client_id === b.id).length;
        if (osB !== osA) return osB - osA;
        return (b.endereco?.length || 0) - (a.endereco?.length || 0);
      });

      const canonical = { ...group[0] };
      const mergedList: Client[] = [];

      for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        clientRedirect.set(dup.id, canonical.id);
        processed.add(dup.id);
        mergedList.push(dup);

        if (!canonical.telefone && dup.telefone) canonical.telefone = dup.telefone;
        if (!canonical.endereco && dup.endereco) canonical.endereco = dup.endereco;
        if (!canonical.email && dup.email) canonical.email = dup.email;
        if (dup.tags?.length) {
          canonical.tags = Array.from(new Set([...(canonical.tags || []), ...dup.tags]));
        }
        if (dup.observacoes && !canonical.observacoes?.includes(dup.observacoes)) {
          canonical.observacoes = canonical.observacoes ? `${canonical.observacoes} | ${dup.observacoes}` : dup.observacoes;
        }
        if ((canonical.origem === 'Outros' || !canonical.origem) && dup.origem && dup.origem !== 'Outros') {
          canonical.origem = dup.origem;
        }
      }
      processed.add(canonical.id);
      finalClients.push(canonical);
      duplicateClientGroups.push({ canonical, merged: mergedList });
    } else {
      processed.add(c.id);
      finalClients.push(c);
    }
  }

  // Client name mapping
  const clientNameMap = new Map<string, string>();
  finalClients.forEach(c => clientNameMap.set(c.id, c.nome));

  // Redirect client IDs in service orders and deduplicate duplicate service orders
  const updatedOrders = (state.serviceOrders || []).map(os => {
    let cid = os.client_id;
    if (clientRedirect.has(cid)) {
      cid = clientRedirect.get(cid)!;
    }
    const cname = clientNameMap.get(cid) || os.client_name;
    return {
      ...os,
      client_id: cid,
      client_name: cname,
    };
  });

  const osMap = new Map<string, ServiceOrder>();
  const finalOS: ServiceOrder[] = [];
  let removedOrdersCount = 0;

  updatedOrders.forEach(os => {
    const clientKey = (os.client_id || '').trim() || (os.client_name || '').toLowerCase().trim();
    const dateKey = (os.data_agendada || '').split('T')[0];
    const totalKey = Number(os.total) || 0;
    const obsKey = (os.observacoes || '').toLowerCase().trim();

    const key = `${clientKey}|${dateKey}|${totalKey}|${obsKey}`;
    if (!osMap.has(key)) {
      osMap.set(key, os);
      finalOS.push(os);
    } else {
      removedOrdersCount++;
      const existing = osMap.get(key)!;
      if (!existing.endereco && os.endereco) existing.endereco = os.endereco;
      if (!existing.client_phone && os.client_phone) existing.client_phone = os.client_phone;
    }
  });

  // Redirect and deduplicate quotes
  const updatedQuotes = (state.quotes || []).map(q => {
    let cid = q.client_id;
    if (clientRedirect.has(cid)) {
      cid = clientRedirect.get(cid)!;
    }
    const cname = clientNameMap.get(cid) || q.client_name;
    return { ...q, client_id: cid, client_name: cname };
  });

  const quoteMap = new Map<string, Quote>();
  const finalQuotes: Quote[] = [];
  let removedQuotesCount = 0;

  updatedQuotes.forEach(q => {
    const clientKey = (q.client_id || '').trim() || (q.client_name || '').toLowerCase().trim();
    const totalKey = Number(q.total) || 0;
    const dateKey = (q.created_at || '').split('T')[0];
    const key = `${clientKey}|${totalKey}|${dateKey}`;
    if (!quoteMap.has(key)) {
      quoteMap.set(key, q);
      finalQuotes.push(q);
    } else {
      removedQuotesCount++;
    }
  });

  // Redirect appointments
  const finalAppointments = (state.appointments || []).map(app => {
    let cid = app.client_id;
    if (clientRedirect.has(cid)) {
      cid = clientRedirect.get(cid)!;
    }
    const cname = clientNameMap.get(cid) || app.client_name;
    return { ...app, client_id: cid, client_name: cname };
  });

  // Redirect recurrences
  const finalRecurrences = (state.recurrences || []).map(rec => {
    let cid = rec.client_id;
    if (clientRedirect.has(cid)) {
      cid = clientRedirect.get(cid)!;
    }
    const cname = clientNameMap.get(cid) || rec.client_name;
    return { ...rec, client_id: cid, client_name: cname };
  });

  // Redirect client photos
  const finalClientPhotos = (state.clientPhotos || []).map(cp => {
    let cid = cp.client_id;
    if (clientRedirect.has(cid)) {
      cid = clientRedirect.get(cid)!;
    }
    return { ...cp, client_id: cid };
  });

  const cleanDb: DatabaseState = {
    ...state,
    clients: finalClients,
    serviceOrders: finalOS,
    quotes: finalQuotes,
    appointments: finalAppointments,
    recurrences: finalRecurrences,
    clientPhotos: finalClientPhotos,
  };

  return {
    cleanDb,
    mergedClients: mergedClientsCount,
    removedOrders: removedOrdersCount,
    removedQuotes: removedQuotesCount,
    duplicateClientGroups,
  };
};

export const EXCLUDED_SERVICE_ORDER_NUMBERS = new Set([
  // Orders 03 to 08 from previous request
  'OS-2026-0003',
  'OS-2026-0004',
  'OS-2026-0005',
  'OS-2026-0006',
  'OS-2026-0007',
  'OS-2026-0008',
  // Google Ads sales exclusions requested by user
  'OS-2026-237',
  'OS-2026-0237',
  'OS-2026-238',
  'OS-2026-0238',
  'OS-2026-240',
  'OS-2026-0240',
  'OS-2026-253',
  'OS-2026-0253',
  'OS-2026-270',
  'OS-2026-0270',
  'OS-2026-286',
  'OS-2026-0286',
  // Meta Ads sales exclusions requested by user
  'OS-2026-215',
  'OS-2026-0215',
  'OS-2026-218',
  'OS-2026-0218',
  'OS-2026-234',
  'OS-2026-0234',
  'OS3214-2026',
  'OS-3214-2026',
  '3214-2026',
  'OS3214',
  'OS-2026-269',
  'OS-2026-0269',
  // Indicação / Additional sales exclusions requested by user
  'OS-2026-285',
  'OS-2026-0285',
  'OS-2026-258',
  'OS-2026-0258',
  'OS-2026-268',
  'OS-2026-0268',
  // Google origin Dra. Patrícia Mendes deletion requested by user
  'OS-2026-0010',
  'OS-2026-010',
  'OS-2026-10',
  'OS20260010',
  'OS2026010',
  // Meta Ads duplicates requested by user
  'OS-2026-3241',
  'OS-3241-2026',
  '3241-2026',
  'OS3241-2026',
  'OS-3241',
  'OS3241',
  '3241',
  '#OS-2026-3241',
  '#OS-3241',
  '#3241',
]);

export const EXCLUDED_SERVICE_ORDER_IDS = new Set([
  // Agenda IDs from previous exclusion
  'os-agenda-2026-09-23-01',
  'os-agenda-2026-09-25-02',
  'os-agenda-2026-09-24-01',
  'os-agenda-2026-09-24-02',
  'os-agenda-2026-09-25-01',
  'os-agenda-2026-09-26-01',
  'os-agenda-2026-10-02-01',
  // Google sales OS ids
  'os-set2026-37',
  'os-set2026-38',
  'os-set2026-40',
  'os-set2026-53',
  'os-set2026-70',
  'os-set2026-86',
  // Meta Ads sales OS ids
  'os-set2026-15',
  'os-set2026-18',
  'os-set2026-34',
  'os-set2026-69',
  // Indicação / Additional sales OS ids
  'os-set2026-85',
  'os-set2026-58',
  'os-set2026-68',
]);

export const isExcludedServiceOrder = (os?: { id?: string; numero?: string; client_id?: string; client_name?: string } | null): boolean => {
  if (!os) return false;
  if (os.id && EXCLUDED_SERVICE_ORDER_IDS.has(os.id)) return true;
  if (os.numero && EXCLUDED_SERVICE_ORDER_NUMBERS.has(os.numero)) return true;
  if (os.client_id === 'client-patricia-mendes') return true;

  const clientName = (os.client_name || '').toLowerCase();
  if (clientName.includes('patrícia mendes') || clientName.includes('patricia mendes')) return true;
  if (clientName.includes('sofa e cadeiras') || clientName.includes('sofá e cadeiras')) return true;

  // Clesiane: leave strictly ONE (OS-2026-209 / os-set2026-09)
  if (clientName.includes('clesiane')) {
    const numClean = (os.numero || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (numClean && numClean !== 'OS2026209' && numClean !== 'OS209' && numClean !== '209') {
      return true;
    }
    if (os.id && os.id !== 'os-set2026-09' && (os.id.includes('3241') || os.id.includes('3214'))) {
      return true;
    }
  }

  // Fabiana: leave strictly ONE (OS-2026-0033 / os-out2026-0033)
  if (clientName.includes('fabiana')) {
    const numClean = (os.numero || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (numClean && numClean !== 'OS20260033' && numClean !== 'OS2026033' && numClean !== 'OS202633' && numClean !== 'OS0033' && numClean !== '0033') {
      return true;
    }
    if (os.id && os.id !== 'os-out2026-0033' && (os.id.includes('3241') || os.id.includes('3214') || os.id.includes('0001'))) {
      return true;
    }
  }

  if (os.numero) {
    const raw = os.numero.trim();
    if (raw.includes('3214') || raw.includes('3241')) return true;
    if (raw.includes('0010') && (raw.includes('OS') || raw.includes('2026'))) return true;
    const clean = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const targets = [
      'OS20260003', 'OS20260004', 'OS20260005', 'OS20260006', 'OS20260007', 'OS20260008',
      'OS20260010', 'OS2026010', 'OS202610',
      'OS20263241', 'OS3241', '32412026', 'OS32412026', '3241',
      'OS2026237', 'OS20260237', 'OS2026238', 'OS20260238', 'OS2026240', 'OS20260240',
      'OS2026253', 'OS20260253', 'OS2026270', 'OS20260270', 'OS2026286', 'OS20260286',
      'OS2026215', 'OS20260215', 'OS2026218', 'OS20260218', 'OS2026234', 'OS20260234',
      'OS32142026', 'OS3214', '32142026', 'OS2026269', 'OS20260269',
      'OS2026285', 'OS20260285', 'OS2026258', 'OS20260258',
      'OS2026268', 'OS20260268'
    ];
    if (targets.includes(clean)) return true;
  }

  if (os.id && (os.id.includes('3214') || os.id.includes('3241') || os.id === 'os-agenda-2026-10-02-01')) return true;
  return false;
};

export const isExcludedTransaction = (t?: Partial<Transaction> | null): boolean => {
  if (!t) return false;
  if (t.id === 'tx-set2026-20' || t.id === 'tx-out2026-01') return true;
  if (t.client_id === 'client-patricia-mendes') return true;
  if (t.os_id === 'os-agenda-2026-10-02-01') return true;
  if (t.os_id && isExcludedServiceOrder({ id: t.os_id, numero: t.os_id })) return true;
  if (t.descricao && isExcludedServiceOrder({ numero: t.descricao })) return true;

  const desc = (t.descricao || '').toLowerCase();
  const clientName = (t.client_name || '').toLowerCase();

  // Exclude duplicates requested by user
  if (desc.includes('os-2026-0001') && (desc.includes('cliente 2') || desc.includes('cliente'))) return true;
  if (desc.includes('3241') || desc.includes('3214')) return true;
  if (clientName.includes('sofa e cadeiras') || clientName.includes('sofá e cadeiras')) return true;

  if (desc.includes('patrícia mendes') || desc.includes('patricia mendes') || desc.includes('os-2026-0010')) {
    return true;
  }
  if (clientName.includes('patrícia mendes') || clientName.includes('patricia mendes')) {
    return true;
  }

  // "08/09/2026 • Receita em Caixa (Pago) • #Higienização (Avulso) - R$ 440,00"
  if (t.valor === 440 && (t.data === '2026-09-08' || desc.includes('avulso') || clientName.includes('avulso'))) {
    return true;
  }
  if (desc.includes('higienização (avulso)') || desc.includes('higienizacao (avulso)')) {
    return true;
  }

  // "07/09/2026 • Receita em Caixa (Pago) • #A receber — Orçamento aprovado - R$ 285,00"
  if (t.valor === 285 && t.data === '2026-09-07') {
    return true;
  }
  if (
    desc.includes('a receber — orçamento aprovado') || 
    desc.includes('a receber - orçamento aprovado') ||
    desc.includes('a receber — orcamento aprovado') || 
    desc.includes('a receber - orcamento aprovado') ||
    (desc.includes('a receber') && desc.includes('aprovado'))
  ) {
    return true;
  }
  if (
    clientName.includes('a receber — orçamento aprovado') || 
    clientName.includes('a receber - orçamento aprovado') ||
    clientName.includes('a receber — orcamento aprovado') || 
    clientName.includes('a receber - orcamento aprovado') ||
    (clientName.includes('a receber') && clientName.includes('aprovado'))
  ) {
    return true;
  }

  return false;
};

export const getEmptyDatabase = (): DatabaseState => {
  return {
    clients: [],
    services: [],
    quotes: [],
    quoteItems: [],
    serviceOrders: [],
    osPhotos: [],
    clientPhotos: [],
    appointments: [],
    transactions: getHistoricalTransactions(),
    recurrences: [],
    recurrenceExecutions: [],
    recurrenceLogs: [],
    companySettings: { ...DEFAULT_COMPANY_SETTINGS },
  };
};

export const clearDatabase = (): DatabaseState => {
  const emptyDb = getEmptyDatabase();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyDb));
  return emptyDb;
};

export const getDatabase = (): DatabaseState => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    let initial: DatabaseState = {
      ...(preparsedDb as any),
      serviceOrders: (preparsedDb as any).serviceOrders || [],
      quotes: (preparsedDb as any).quotes || [],
      quoteItems: (preparsedDb as any).quoteItems || [],
      appointments: (preparsedDb as any).appointments || [],
      transactions: (preparsedDb as any).transactions || [],
      clients: (preparsedDb as any).clients || [],
      clientPhotos: [],
      osPhotos: [],
      recurrenceLogs: [],
      recurrenceExecutions: [],
      companySettings: { ...DEFAULT_COMPANY_SETTINGS },
      hasClearedRegisteredServiceOrders_v1: true,
      hasImportedSeptember2026Spreadsheet_v1: true,
      hasImportedSeptember2026Spreadsheet_v2: true,
      hasImportedSeptember2026Spreadsheet_v3: true,
      hasImportedSeptember2026Spreadsheet_v4: true,
      hasImportedSeptember2026Spreadsheet_v5: true,
      hasImportedSeptember2026Spreadsheet_v6: true,
      hasImportedSeptember2026Spreadsheet_v7: true,
      hasImportedSeptember2026Quotes_v1: true,
      hasImportedSeptember2026Quotes_v2: true,
      hasImportedSeptember2026Quotes_v3: true,
      hasImportedSeptember2026Quotes_v4: true,
      hasImportedSeptember2026Quotes_v5: true,
      hasImportedSeptember2026Quotes_v6: true,
      hasImportedSeptember2026Quotes_v7: true,
      hasSynced2995Concluded_v4: true,
    };
    initial = applySeptember2026Quotes(initial);
    initial = applySeptember2026Spreadsheet(initial);
    const CONCLUDED_7_INIT = new Set([
      'os-set2026-31', // Janesca (385)
      'os-set2026-67', // Jeane (535)
      'os-set2026-71', // Timoteo (450)
      'os-set2026-78', // Bella (455)
      'os-set2026-87', // Fernanda Lenz (385)
      'os-set2026-09', // Clesiane (535)
      'os-out2026-0033' // Fabiana (250)
    ]);
    initial.serviceOrders = (initial.serviceOrders || []).map((os: any) => {
      if (CONCLUDED_7_INIT.has(os.id)) {
        return { ...os, status: 'concluido' };
      } else if (os.status === 'concluido') {
        return { ...os, status: 'agendado' };
      }
      return os;
    });
    saveDatabase(initial, true, true);
    return initial;
  }
  try {
    let parsed = JSON.parse(data);
    let modified = false;

    // Safeguard: Ensure corporate service orders are never lost or emptied
    if (!parsed.serviceOrders || parsed.serviceOrders.length === 0) {
      parsed.serviceOrders = (preparsedDb as any).serviceOrders || [];
      modified = true;
    }

    // Automatically deduplicate clients and orders if older duplicated storage is loaded
    if (parsed.clients && parsed.clients.length > 1500) {
      const dedup = deduplicateDatabase(parsed);
      if (dedup.mergedClients > 0 || dedup.removedOrders > 0) {
        parsed.clients = dedup.cleanDb.clients;
        parsed.serviceOrders = dedup.cleanDb.serviceOrders;
        parsed.quotes = dedup.cleanDb.quotes;
        parsed.appointments = dedup.cleanDb.appointments;
        parsed.recurrences = dedup.cleanDb.recurrences;
        parsed.clientPhotos = dedup.cleanDb.clientPhotos;
        modified = true;
      }
    }

    // Synchronize incoming clients with existing CRM clients and migrate origins (WhatsApp excluded, Facebook/Instagram -> Meta Ads)
    if (!parsed.crmClientsImported_v8 || !parsed.clients || parsed.clients.length < 1400) {
      const incomingClients: Client[] = (preparsedDb as any).clients || [];
      const currentClients: Client[] = Array.isArray(parsed.clients) ? [...parsed.clients] : [];

      const phoneMap = new Map<string, Client>();
      const nameMap = new Map<string, Client>();
      const idMap = new Map<string, Client>();

      const cleanPhone = (p?: string) => (p || '').replace(/\D/g, '').slice(-8);
      const cleanName = (n?: string) => (n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      currentClients.forEach(c => {
        if (c.id) idMap.set(c.id, c);
        const p8 = cleanPhone(c.telefone);
        if (p8) phoneMap.set(p8, c);
        const nm = cleanName(c.nome);
        if (nm) nameMap.set(nm, c);
      });

      incomingClients.forEach(inc => {
        const p8 = cleanPhone(inc.telefone);
        const nm = cleanName(inc.nome);

        let existing = idMap.get(inc.id);
        if (!existing && p8 && phoneMap.has(p8)) {
          const candidate = phoneMap.get(p8)!;
          const cName = cleanName(candidate.nome);
          if (cName === nm || cName.includes(nm) || nm.includes(cName) || (cName.split(' ')[0] === nm.split(' ')[0])) {
            existing = candidate;
          }
        }
        if (!existing && nm && nameMap.has(nm)) {
          existing = nameMap.get(nm);
        }

        if (existing) {
          if (inc.origem) {
            existing.origem = inc.origem;
          }
          if (!existing.endereco && inc.endereco) existing.endereco = inc.endereco;
          if ((!existing.cidade || existing.cidade === 'Passo Fundo') && inc.cidade) existing.cidade = inc.cidade;
          if (!existing.telefone && inc.telefone) existing.telefone = inc.telefone;

          const existingHistory = existing.historico_servicos || [];
          const incomingHistory = inc.historico_servicos || [];

          incomingHistory.forEach(incItem => {
            const alreadyHas = existingHistory.some(h =>
              (h.data === incItem.data && Math.abs((h.valor || 0) - (incItem.valor || 0)) < 0.01 && (h.tipo || 'servico') === (incItem.tipo || 'servico')) ||
              (h.nome_servico?.toLowerCase().trim() === incItem.nome_servico?.toLowerCase().trim() && h.data === incItem.data && Math.abs((h.valor || 0) - (incItem.valor || 0)) < 0.01)
            );
            if (!alreadyHas) {
              existingHistory.push(incItem);
            }
          });

          existing.historico_servicos = existingHistory;
          const executed = existingHistory.filter(h => h.tipo === 'servico');
          existing.total_gasto = executed.reduce((acc, h) => acc + (h.valor || 0), 0);
          existing.total_pedidos = executed.length;
          if (executed.length > 0) {
            existing.ultimo_servico = executed[0].data;
          }
        } else {
          currentClients.push(inc);
          if (inc.id) idMap.set(inc.id, inc);
          if (p8) phoneMap.set(p8, inc);
          if (nm) nameMap.set(nm, inc);
        }
      });

      // Ensure any lingering WhatsApp / Facebook / Instagram origins are migrated:
      // Pattern of 26: 6 Google, 10 Meta Ads, 10 Indicação
      const waPattern: ClientOrigin[] = [
        'Google', 'Meta Ads', 'Indicação',
        'Google', 'Meta Ads', 'Indicação',
        'Google', 'Meta Ads', 'Indicação',
        'Google', 'Meta Ads', 'Indicação',
        'Google', 'Meta Ads', 'Indicação',
        'Google', 'Meta Ads', 'Indicação',
        'Meta Ads', 'Indicação',
        'Meta Ads', 'Indicação',
        'Meta Ads', 'Indicação',
        'Meta Ads', 'Indicação',
      ];
      let waIdx = 0;
      currentClients.forEach(c => {
        const o = (c.origem as string) || '';
        if (o === 'WhatsApp') {
          c.origem = waPattern[waIdx % 26];
          waIdx++;
        } else if (o === 'Facebook' || o === 'Instagram' || o === 'Meta') {
          c.origem = 'Meta Ads';
        }
      });

      parsed.clients = currentClients;
      parsed.crmClientsImported_v8 = true;
      modified = true;
    }

    // Ensure serviceOrders is initialized as an array
    if (!parsed.serviceOrders) {
      parsed.serviceOrders = [];
      modified = true;
    }

    // Ensure services match the 22 official services from catalog
    if (!parsed.services || parsed.services.length < 20) {
      parsed.services = (preparsedDb as any).services || [];
      modified = true;
    }

    // Ensure chemical products & supplies (detergente, tira manchas, alvejante, impermeabilizante...) exist
    if (!parsed.hasInitializedProducts_v2 || !parsed.products || !Array.isArray(parsed.products) || parsed.products.length === 0) {
      parsed.products = DEFAULT_PRODUCTS;
      parsed.hasInitializedProducts_v2 = true;
      modified = true;
    }

    // Ensure quotes and quote items exist
    if (!parsed.quotes || !Array.isArray(parsed.quotes)) {
      parsed.quotes = (preparsedDb as any).quotes || [];
      modified = true;
    }
    if (!parsed.quoteItems || !Array.isArray(parsed.quoteItems)) {
      parsed.quoteItems = (preparsedDb as any).quoteItems || [];
      modified = true;
    }

    // Ensure recurrences exist
    if (!parsed.recurrences || !Array.isArray(parsed.recurrences)) {
      parsed.recurrences = (preparsedDb as any).recurrences || [];
      modified = true;
    }

    // Ensure appointments exist as array (respect user deletions so empty or reduced array stays intact)
    if (!parsed.appointments || !Array.isArray(parsed.appointments)) {
      parsed.appointments = (preparsedDb as any).appointments || [];
      modified = true;
    }

    // Ensure transactions exist as array
    if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
      parsed.transactions = (preparsedDb as any).transactions || [];
      modified = true;
    }

    // One-time load of September 2026 spreadsheet transactions (respecting any subsequent user changes or deletions)
    if (!parsed.hasImportedSeptember2026Spreadsheet_v7) {
      const withSep = applySeptember2026Spreadsheet(parsed);
      parsed.transactions = withSep.transactions;
      parsed.clients = withSep.clients;
      parsed.hasImportedSeptember2026Spreadsheet_v3 = true;
      parsed.hasImportedSeptember2026Spreadsheet_v4 = true;
      parsed.hasImportedSeptember2026Spreadsheet_v5 = true;
      parsed.hasImportedSeptember2026Spreadsheet_v6 = true;
      parsed.hasImportedSeptember2026Spreadsheet_v7 = true;
      modified = true;
    }

    // Safe initial load of appointments if empty (without touching or resetting quotes)
    if (!parsed.appointments || !Array.isArray(parsed.appointments) || parsed.appointments.length === 0) {
      const withQuotes = applySeptember2026Quotes(parsed);
      parsed.appointments = withQuotes.appointments;
      modified = true;
    }

    // Safe initial load of quotes, quote items and orders ONLY if database has no quotes
    if (!parsed.quotes || !Array.isArray(parsed.quotes) || parsed.quotes.length === 0) {
      const withQuotes = applySeptember2026Quotes(parsed);
      parsed.quotes = withQuotes.quotes;
      parsed.quoteItems = withQuotes.quoteItems;
      parsed.serviceOrders = withQuotes.serviceOrders;
      if (!parsed.appointments || parsed.appointments.length === 0) {
        parsed.appointments = withQuotes.appointments;
      }
      modified = true;
    }
    parsed.hasImportedSeptember2026Quotes_v1 = true;
    parsed.hasImportedSeptember2026Quotes_v2 = true;
    parsed.hasImportedSeptember2026Quotes_v3 = true;
    parsed.hasImportedSeptember2026Quotes_v4 = true;
    parsed.hasImportedSeptember2026Quotes_v5 = true;
    parsed.hasImportedSeptember2026Quotes_v6 = true;
    parsed.hasImportedSeptember2026Quotes_v7 = true;
    parsed.hasImportedSeptember2026Quotes_v8 = true;

    // 1. Purge any artificial Dra. Patrícia Mendes records and duplicate Clesiane / Fabiana records
    if (parsed.quotes && parsed.quotes.some((q: any) => q.id === 'quote-out2026-01' || q.numero === 'ORC-2026-0120' || q.client_id === 'client-patricia-mendes')) {
      parsed.quotes = parsed.quotes.filter((q: any) => q.id !== 'quote-out2026-01' && q.numero !== 'ORC-2026-0120' && q.client_id !== 'client-patricia-mendes');
      modified = true;
    }
    if (parsed.quoteItems && parsed.quoteItems.some((qi: any) => qi.id === 'item-quote-out2026-01' || qi.quote_id === 'quote-out2026-01')) {
      parsed.quoteItems = parsed.quoteItems.filter((qi: any) => qi.id !== 'item-quote-out2026-01' && qi.quote_id !== 'quote-out2026-01');
      modified = true;
    }
    if (parsed.serviceOrders && parsed.serviceOrders.some((os: any) => os.id === 'os-agenda-2026-10-02-01' || os.numero === 'OS-2026-0010' || os.client_id === 'client-patricia-mendes' || isExcludedServiceOrder(os))) {
      parsed.serviceOrders = parsed.serviceOrders.filter((os: any) => os.id !== 'os-agenda-2026-10-02-01' && os.numero !== 'OS-2026-0010' && os.client_id !== 'client-patricia-mendes' && !isExcludedServiceOrder(os));
      modified = true;
    }
    if (parsed.appointments && parsed.appointments.some((a: any) => a.id === 'app-agenda-2026-10-02-01' || a.client_id === 'client-patricia-mendes' || (a.os_id && isExcludedServiceOrder({ id: a.os_id, numero: a.os_id })))) {
      parsed.appointments = parsed.appointments.filter((a: any) => a.id !== 'app-agenda-2026-10-02-01' && a.client_id !== 'client-patricia-mendes' && (!a.os_id || !isExcludedServiceOrder({ id: a.os_id, numero: a.os_id })));
      modified = true;
    }
    if (parsed.clients && parsed.clients.some((c: any) => c.id === 'client-patricia-mendes' || (c.nome && (c.nome.toLowerCase().includes('patrícia mendes') || c.nome.toLowerCase().includes('clesiane cliente sofa'))))) {
      parsed.clients = parsed.clients.filter((c: any) => c.id !== 'client-patricia-mendes' && !(c.nome && (c.nome.toLowerCase().includes('patrícia mendes') || c.nome.toLowerCase().includes('clesiane cliente sofa'))));
      modified = true;
    }
    if (parsed.transactions && parsed.transactions.some((t: any) => isExcludedTransaction(t))) {
      parsed.transactions = parsed.transactions.filter((t: any) => !isExcludedTransaction(t));
      modified = true;
    }

    // 2. Adjust Meta Ads Origin data as requested (run once as migration):
    if (!parsed.hasAdjustedMetaAdsOrigins_v2) {
      if (!parsed.clients) parsed.clients = [];
      if (!parsed.serviceOrders) parsed.serviceOrders = [];
      if (!parsed.transactions) parsed.transactions = [];
      if (!parsed.quotes) parsed.quotes = [];

      // Update Clesiane Client
      let clesianeClient = parsed.clients.find((c: any) => c.id === 'e7c8279f-5f81-4ebb-bd14-764fef20baa4' || (c.nome && c.nome.toLowerCase().trim() === 'clesiane'));
      if (clesianeClient) {
        clesianeClient.nome = 'Clesiane';
        clesianeClient.origem = 'Meta Ads';
        clesianeClient.total_gasto = 535.00;
        clesianeClient.total_pedidos = 1;
        clesianeClient.ultimo_servico = '2026-10-02';
      } else {
        clesianeClient = {
          id: 'e7c8279f-5f81-4ebb-bd14-764fef20baa4',
          nome: 'Clesiane',
          origem: 'Meta Ads',
          cidade: 'Passo Fundo',
          estado: 'RS',
          telefone: '+55 (54) 99140-0553',
          tags: ['Cliente Ativo', 'Meta Ads'],
          total_gasto: 535.00,
          total_pedidos: 1,
          ultimo_servico: '2026-10-02',
          created_at: '2026-09-11T12:00:00.000Z',
        };
        parsed.clients.push(clesianeClient);
        modified = true;
      }

      // Ensure Clesiane has strictly OS-2026-209
      const existingClesianeOS = parsed.serviceOrders.find((os: any) => os.id === 'os-set2026-09' || os.numero === 'OS-2026-209');
      if (existingClesianeOS) {
        existingClesianeOS.client_id = clesianeClient.id;
        existingClesianeOS.client_name = 'Clesiane';
        existingClesianeOS.status = 'concluido';
        existingClesianeOS.total = 535.00;
        existingClesianeOS.pago = 535.00;
        existingClesianeOS.data_agendada = '2026-10-02T14:00';
        existingClesianeOS.data_conclusao = '2026-10-02';
        existingClesianeOS.metodo_pagamento = 'Pix';
        existingClesianeOS.observacoes = 'Ordem de Serviço (Pago) #OS-2026-209. Fonte: Meta Ads.';
      } else {
        parsed.serviceOrders.push({
          id: 'os-set2026-09',
          numero: 'OS-2026-209',
          quote_id: 'quote-set2026-09',
          quote_numero: 'ORC-2026-109',
          client_id: clesianeClient.id,
          client_name: 'Clesiane',
          client_phone: '+55 (54) 99140-0553',
          status: 'concluido',
          total: 535.00,
          pago: 535.00,
          data_agendada: '2026-10-02T14:00',
          data_conclusao: '2026-10-02',
          tecnico: 'Equipe Higipro 01',
          metodo_pagamento: 'Pix',
          endereco: 'Passo Fundo - RS',
          observacoes: 'Ordem de Serviço (Pago) #OS-2026-209. Fonte: Meta Ads.',
          created_at: '2026-10-01T09:00:00.000Z',
        });
        modified = true;
      }

      // Update Fabiana cliente colchão Client
      let fabianaClient = parsed.clients.find((c: any) => c.id === 'd9b5d880-93c3-40d2-a461-8796f136d742' || (c.nome && c.nome.toLowerCase().includes('fabiana') && c.origem === 'Meta Ads'));
      if (fabianaClient) {
        fabianaClient.nome = 'Fabiana cliente colchão';
        fabianaClient.origem = 'Meta Ads';
        fabianaClient.total_gasto = 250.00;
        fabianaClient.total_pedidos = 1;
        fabianaClient.ultimo_servico = '2026-10-02';
      } else {
        fabianaClient = {
          id: 'd9b5d880-93c3-40d2-a461-8796f136d742',
          nome: 'Fabiana cliente colchão',
          origem: 'Meta Ads',
          cidade: 'Passo Fundo',
          estado: 'RS',
          telefone: '+55 (54) 9987-9106',
          tags: ['Cliente Ativo', 'Colchão', 'Meta Ads'],
          total_gasto: 250.00,
          total_pedidos: 1,
          ultimo_servico: '2026-10-02',
          created_at: '2026-08-01T12:00:00.000Z',
        };
        parsed.clients.push(fabianaClient);
        modified = true;
      }

      // Update Fabiana Quote quote-set2026-08 if exists
      const fabianaQuote = parsed.quotes.find((q: any) => q.id === 'quote-set2026-08' || q.numero === 'ORC-2026-108');
      if (fabianaQuote) {
        fabianaQuote.client_name = 'Fabiana cliente colchão';
        fabianaQuote.client_id = fabianaClient.id;
        fabianaQuote.status = 'aprovado';
      }

      // Ensure Fabiana has strictly OS-2026-0033
      const existingFabianaOS = parsed.serviceOrders.find((os: any) => os.id === 'os-out2026-0033' || os.numero === 'OS-2026-0033');
      if (existingFabianaOS) {
        existingFabianaOS.client_id = fabianaClient.id;
        existingFabianaOS.client_name = 'Fabiana cliente colchão';
        existingFabianaOS.status = 'concluido';
        existingFabianaOS.total = 250.00;
        existingFabianaOS.pago = 250.00;
        existingFabianaOS.data_agendada = '2026-10-02T10:00';
        existingFabianaOS.data_conclusao = '2026-10-02';
        existingFabianaOS.metodo_pagamento = 'Pix';
        existingFabianaOS.servicos = 'Higienização de Colchão';
        existingFabianaOS.observacoes = 'Higienização de Colchão. Ordem de Serviço (Pago) #OS-2026-0033. Fonte: Meta Ads.';
      } else {
        parsed.serviceOrders.push({
          id: 'os-out2026-0033',
          numero: 'OS-2026-0033',
          quote_id: 'quote-set2026-08',
          quote_numero: 'ORC-2026-108',
          client_id: fabianaClient.id,
          client_name: 'Fabiana cliente colchão',
          client_phone: '+55 (54) 9987-9106',
          status: 'concluido',
          total: 250.00,
          pago: 250.00,
          data_agendada: '2026-10-02T10:00',
          data_conclusao: '2026-10-02',
          tecnico: 'Equipe Higipro 01',
          metodo_pagamento: 'Pix',
          endereco: 'Passo Fundo - RS',
          observacoes: 'Higienização de Colchão. Ordem de Serviço (Pago) #OS-2026-0033. Fonte: Meta Ads.',
          created_at: '2026-10-01T10:00:00.000Z',
        });
        modified = true;
      }
      parsed.hasAdjustedMetaAdsOrigins_v2 = true;
    }

    // Reconcile and synchronize all 7 concluded orders totaling exactly R$ 2.995,00
    if (!parsed.hasSynced2995Concluded_v4) {
      if (!parsed.serviceOrders) parsed.serviceOrders = [];
      if (!parsed.transactions) parsed.transactions = [];

      const CONCLUDED_7_SET = new Set([
        'os-set2026-31', // Janesca (385)
        'os-set2026-67', // Jeane (535)
        'os-set2026-71', // Timoteo (450)
        'os-set2026-78', // Bella (455)
        'os-set2026-87', // Fernanda Lenz (385)
        'os-set2026-09', // Clesiane (535)
        'os-out2026-0033' // Fabiana (250)
      ]);

      // 1. Ensure Clesiane has concluded OS dated in late September aligned with payment
      const clesianeOS = parsed.serviceOrders.find((o: any) => o.id === 'os-set2026-09' || o.numero === 'OS-2026-209');
      if (clesianeOS) {
        clesianeOS.status = 'concluido';
        clesianeOS.total = 535.00;
        clesianeOS.pago = 535.00;
        clesianeOS.data_conclusao = '2026-09-28';
        clesianeOS.data_agendada = '2026-09-28T14:00';
      }

      // 2. Ensure Fabiana has concluded OS dated in late September aligned with payment
      const fabianaOS = parsed.serviceOrders.find((o: any) => o.id === 'os-out2026-0033' || o.numero === 'OS-2026-0033');
      if (fabianaOS) {
        fabianaOS.status = 'concluido';
        fabianaOS.total = 250.00;
        fabianaOS.pago = 250.00;
        fabianaOS.data_conclusao = '2026-09-28';
        fabianaOS.data_agendada = '2026-09-28T10:00';
      }

      // 3. Ensure Fabiana has paid transaction
      if (!parsed.transactions.some((t: any) => t.id === 'tx-fabiana-01' || (t.descricao && t.descricao.includes('Fabiana cliente colchão')))) {
        parsed.transactions.push({
          id: 'tx-fabiana-01',
          tipo: 'receita',
          categoria: 'Higienização de Colchão',
          descricao: 'Higienização de Colchão - Fabiana cliente colchão',
          valor: 250.00,
          data: '2026-09-28',
          metodo_pagamento: 'Pix',
          status: 'pago',
          client_id: 'd9b5d880-93c3-40d2-a461-8796f136d742',
          os_id: 'os-out2026-0033',
          created_at: '2026-09-28T10:00:00.000Z',
        });
      }

      // 4. Ensure other active OS that were not concluded are marked as 'agendado' so concluded revenue is strictly 2.995
      parsed.serviceOrders = parsed.serviceOrders.map((os: any) => {
        if (CONCLUDED_7_SET.has(os.id)) {
          return { ...os, status: 'concluido' };
        } else if (os.status === 'concluido') {
          return { ...os, status: 'agendado' };
        }
        return os;
      });

      parsed.hasSynced2995Concluded_v4 = true;
      modified = true;
    }

    // Always eliminate any redundant transactions for Clesiane or Fabiana to prevent double/triple-counting
    if (parsed.transactions && parsed.transactions.length > 0) {
      const beforeCount = parsed.transactions.length;
      parsed.transactions = parsed.transactions.filter((t: any) => !isExcludedTransaction(t));
      if (parsed.transactions.length !== beforeCount) {
        modified = true;
      }
    }

    // Clean up August 2026 marketing expenses (R$ 2.300) from transactions
    if (parsed.transactions && parsed.transactions.some((t: any) => t.id === 'tx-mkt-2026-08' || t.id === 'tx-mkt-2026-08b' || (t.tipo === 'despesa' && t.data && t.data.startsWith('2026-08')))) {
      parsed.transactions = parsed.transactions.filter((t: any) => 
        t.id !== 'tx-mkt-2026-08' && 
        t.id !== 'tx-mkt-2026-08b' && 
        !(t.tipo === 'despesa' && t.data && t.data.startsWith('2026-08'))
      );
      modified = true;
    }

    // Ensure Tapete in services is configured per square meter (m²), category Tapete, and all services are sorted sequentially 01 to the last
    if (parsed.services && Array.isArray(parsed.services)) {
      parsed.services = parsed.services.map((s: any) => {
        const isTapete = s.tipo_estofado === 'Tapete' || (s.nome && s.nome.toLowerCase().includes('tapete')) || s.categoria === 'Tapete';
        let cleanName = s.nome || '';
        // If Tapete is missing its official sequential number 19, prefix it
        if (isTapete && !cleanName.match(/^\d+/)) {
          cleanName = `19-Higienização e Limpeza de Tapete`;
        }
        return {
          ...s,
          nome: cleanName,
          ativo: s.ativo !== false,
          ...(isTapete ? {
            categoria: 'Tapete' as const,
            tipo_estofado: 'Tapete' as const,
            unidade: 'm²' as const,
          } : {})
        };
      });

      // Sort services strictly by number (01 to the last)
      parsed.services.sort((a: any, b: any) => {
        const numA = extractServiceNumber(a.nome);
        const numB = extractServiceNumber(b.nome);
        if (numA !== numB) return numA - numB;
        return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
      });
      modified = true;
    }

    // Ensure past service orders do not generate fake pending receivables
    if (!parsed.hasClearedPastOSReceivables_v1 && parsed.serviceOrders) {
      parsed.serviceOrders = parsed.serviceOrders.map((os: any) => {
        if (os.created_at < '2026-09-08' && os.total > os.pago) {
          return { ...os, pago: os.total };
        }
        return os;
      });
      parsed.hasClearedPastOSReceivables_v1 = true;
      modified = true;
    }

    // Exclude service orders OS 03 to 08 as requested by user from Valores e Faturas Pendentes a Receber
    if (!parsed.hasExcludedOS03to08_v1) {
      const excludedNumbers = new Set(['OS-2026-0003', 'OS-2026-0004', 'OS-2026-0005', 'OS-2026-0006', 'OS-2026-0007', 'OS-2026-0008']);
      const excludedIds = new Set([
        'os-agenda-2026-09-23-01',
        'os-agenda-2026-09-25-02',
        'os-agenda-2026-09-24-01',
        'os-agenda-2026-09-24-02',
        'os-agenda-2026-09-25-01',
        'os-agenda-2026-09-26-01'
      ]);
      if (Array.isArray(parsed.serviceOrders)) {
        parsed.serviceOrders = parsed.serviceOrders.filter(
          (os: any) => !excludedNumbers.has(os.numero) && !excludedIds.has(os.id)
        );
      }
      parsed.hasExcludedOS03to08_v1 = true;
      modified = true;
    }

    // Migration: Exclude user-requested sales OS (Google, Meta Ads, Indicações, Dalva OS 268) and Avulso / A Receber transactions from paid sales
    if (!parsed.hasExcludedSalesOS_v4) {
      if (Array.isArray(parsed.serviceOrders)) {
        parsed.serviceOrders = parsed.serviceOrders.filter(
          (os: any) => !isExcludedServiceOrder(os)
        );
      }
      if (Array.isArray(parsed.appointments)) {
        parsed.appointments = parsed.appointments.filter(
          (app: any) => !app.os_id || !isExcludedServiceOrder({ id: app.os_id, numero: app.os_id })
        );
      }
      if (Array.isArray(parsed.transactions)) {
        parsed.transactions = parsed.transactions.filter(
          (tx: any) => !isExcludedTransaction(tx)
        );
      }
      parsed.hasExcludedSalesOS_v4 = true;
      modified = true;
    }

    // Migrate legacy technician names to official team members
    if (!parsed.techniciansUpdated_v1) {
      const migrateTech = (t?: string) => {
        if (!t) return 'Equipe Higipro 01';
        if (t === 'Felipe Santos') return 'Luciano Neimaier';
        if (t === 'Gustavo Barbosa') return 'Lisiane Neimaier';
        if (t === 'Ricardo Menezes' || t === 'Ricardo Menezes (Auxiliar)') return 'Amanda Neimaier';
        if (t === 'Equipe Externa SP' || t === 'Técnico HigiPro' || t === 'Técnico Não Definido' || t === 'Bruno Oliveira' || t === 'Rodrigo Mendes' || t === 'Carla Souza') return 'Equipe Higipro 01';
        return t;
      };

      if (Array.isArray(parsed.serviceOrders)) {
        parsed.serviceOrders = parsed.serviceOrders.map((os: any) => ({
          ...os,
          tecnico: migrateTech(os.tecnico),
        }));
      }

      if (Array.isArray(parsed.appointments)) {
        parsed.appointments = parsed.appointments.map((app: any) => ({
          ...app,
          tecnico: migrateTech(app.tecnico),
        }));
      }

      parsed.techniciansUpdated_v1 = true;
      modified = true;
    }

    if (!parsed.clientPhotos) {
      parsed.clientPhotos = [];
      modified = true;
    }
    if (!parsed.recurrenceLogs) {
      parsed.recurrenceLogs = [];
      modified = true;
    }
    if (!parsed.recurrenceExecutions) {
      parsed.recurrenceExecutions = [];
      modified = true;
    }

    // Always keep company settings updated with official HigiPro info
    if (!parsed.companySettings || !parsed.companySettings.cnpj_cpf?.includes('48.173.529')) {
      parsed.companySettings = { ...DEFAULT_COMPANY_SETTINGS };
      modified = true;
    }

    // Reconcile and deduplicate any duplicate transactions for the same OS only when the OS is fully paid
    if (parsed.transactions && parsed.transactions.length > 0) {
      const fullyPaidOSSet = new Set(
        (parsed.serviceOrders || [])
          .filter((os: any) => os && os.id && typeof os.total === 'number' && typeof os.pago === 'number' && os.pago >= os.total && os.total > 0)
          .map((os: any) => os.id)
      );
      const initialTxCount = parsed.transactions.length;
      parsed.transactions = parsed.transactions.filter((t: any) => {
        // Only discard duplicate pending transaction if the OS is confirmed fully paid
        if (t && t.os_id && t.status === 'pendente' && fullyPaidOSSet.has(t.os_id)) {
          return false;
        }
        return true;
      });
      if (parsed.transactions.length !== initialTxCount) {
        modified = true;
      }
    }

    // Stamp any legacy unstamped items with baseline version and updated_at
    parsed = autoStampDatabaseState(parsed);
    lastSavedDatabaseSnapshot = parsed;

    if (modified) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch (e) {
    console.error('Error parsing local storage database, returning preparsed data.', e);
    const initial: DatabaseState = {
      ...(preparsedDb as any),
      serviceOrders: (preparsedDb as any).serviceOrders || [],
      quotes: (preparsedDb as any).quotes || [],
      quoteItems: (preparsedDb as any).quoteItems || [],
      appointments: (preparsedDb as any).appointments || [],
      transactions: (preparsedDb as any).transactions || [],
      clients: (preparsedDb as any).clients || [],
      clientPhotos: [],
      recurrenceLogs: [],
      recurrenceExecutions: [],
      companySettings: { ...DEFAULT_COMPANY_SETTINGS },
      hasClearedRegisteredServiceOrders_v1: true,
      hasImportedSeptember2026Spreadsheet_v1: true,
      hasImportedSeptember2026Spreadsheet_v2: true,
      hasImportedSeptember2026Spreadsheet_v3: true,
      hasImportedSeptember2026Spreadsheet_v4: true,
      hasImportedSeptember2026Quotes_v1: true,
      hasImportedSeptember2026Quotes_v2: true,
    };
    saveDatabase(initial);
    return initial;
  }
};

export const syncDatabaseWithSupabase = async (
  currentDb: DatabaseState,
  onUpdated?: (newDb: DatabaseState) => void
): Promise<DatabaseState> => {
  try {
    const remote = await fetchAllFromSupabase();
    if (!remote) return currentDb;

    const merged: DatabaseState = {
      ...currentDb,
      clients: remote.clients && remote.clients.length > 0 ? remote.clients : currentDb.clients,
      services: remote.services && remote.services.length > 0 ? remote.services : currentDb.services,
      quotes: remote.quotes && remote.quotes.length > 0 ? remote.quotes : currentDb.quotes,
      quoteItems: remote.quoteItems && remote.quoteItems.length > 0 ? remote.quoteItems : currentDb.quoteItems,
      serviceOrders: remote.serviceOrders && remote.serviceOrders.length > 0 ? remote.serviceOrders : currentDb.serviceOrders,
      appointments: remote.appointments && remote.appointments.length > 0 ? remote.appointments : currentDb.appointments,
      recurrences: remote.recurrences && remote.recurrences.length > 0 ? remote.recurrences : currentDb.recurrences,
      transactions: currentDb.transactions.some(t => t.id === 'tx-hist-2022-11') ? currentDb.transactions : (remote.transactions || currentDb.transactions)
    };

    saveDatabase(merged);
    if (onUpdated) {
      onUpdated(merged);
    }
    return merged;
  } catch (err) {
    console.error('Error during Supabase sync:', err);
    return currentDb;
  }
};

export const hasPreviousBackup = (): boolean => {
  return localStorage.getItem(BACKUP_KEY) !== null;
};

export const restorePreviousBackup = (): DatabaseState | null => {
  const backup = localStorage.getItem(BACKUP_KEY);
  if (!backup) return null;
  try {
    const parsed = JSON.parse(backup);
    localStorage.setItem(STORAGE_KEY, backup);
    return parsed;
  } catch (e) {
    console.error('Error restoring backup', e);
    return null;
  }
};

let saveTimeout: any = null;
let pendingStateToSave: DatabaseState | null = null;
let pendingSkipCloudUpload: boolean = false;
let cloudSyncTimeout: any = null;

export const triggerCloudUpload = (state: DatabaseState, immediate: boolean = true): void => {
  if (cloudSyncTimeout) {
    clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = null;
  }
  uploadFullDatabaseToCloud(state, mergeDatabases).catch(err => {
    console.warn('[Cloud Sync] Upload error:', err);
  });
};

export const flushSaveDatabase = (immediate: boolean = true): void => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (!pendingStateToSave) return;
  const state = pendingStateToSave;
  const skipCloud = pendingSkipCloudUpload;
  pendingStateToSave = null;
  pendingSkipCloudUpload = false;

  // 1. ALWAYS persist the full uncompressed state into IndexedDB (virtually unlimited quota)
  saveToIndexedDB(state).catch(err => {
    console.warn('[IndexedDB] Save error:', err);
  });

  // 2. Automatically create versioned snapshots in IndexedDB
  createIndexedDBSnapshot(state, 'Backup Automático').catch(() => {});

  // 3. Persist to localStorage for synchronous instant reload
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e: any) {
    console.warn('Storage quota warning while saving database to localStorage:', e);
    // If quota exceeded, strip transient media & heavy history while keeping all business records and all clients
    try {
      const cleanState = {
        ...state,
        clientPhotos: [],
        osPhotos: [],
        recurrenceLogs: [],
      };
      // Compact historico_servicos on clients if still needed to fit within 5MB quota
      const compactClients = (cleanState.clients || []).map(c => ({
        ...c,
        historico_servicos: (c.historico_servicos || []).slice(0, 3)
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cleanState, clients: compactClients }));
    } catch (err) {
      console.warn('Could not save compact state to localStorage. Full database is safely preserved in IndexedDB.', err);
    }
  }

  // 4. Trigger cloud synchronization (PC <-> Mobile) ONLY if not explicitly skipped
  if (!skipCloud) {
    triggerCloudUpload(state, immediate);
  }
};

let lastSavedDatabaseSnapshot: DatabaseState | null = null;
let isHydratedFromStorageOrCloud = true;

export const setHydratedStatus = (status: boolean) => {
  isHydratedFromStorageOrCloud = status;
};

export const getHydratedStatus = (): boolean => isHydratedFromStorageOrCloud;

export const saveDatabase = (state: DatabaseState, immediate: boolean = false, skipCloudUpload: boolean = false): DatabaseState => {
  // If skipCloudUpload is true (incoming from cloud/indexedDB), do not re-stamp timestamps!
  const finalState = skipCloudUpload
    ? state
    : autoStampDatabaseState(state, lastSavedDatabaseSnapshot);

  lastSavedDatabaseSnapshot = finalState;
  pendingStateToSave = finalState;
  pendingSkipCloudUpload = skipCloudUpload;

  // 1. Persist IMMEDIATELY to localStorage synchronously so NO data is ever lost even on sudden tab close/refresh
  try {
    const serialized = JSON.stringify(finalState);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e: any) {
    try {
      const cleanState = {
        ...finalState,
        clientPhotos: [],
        osPhotos: [],
        recurrenceLogs: [],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
    } catch (err) {}
  }

  // 2. Persist IMMEDIATELY to IndexedDB in background without blocking UI
  saveToIndexedDB(finalState).catch(err => {
    console.warn('[IndexedDB] Immediate save warning:', err);
  });

  if (immediate) {
    flushSaveDatabase(true);
    return finalState;
  }
  if (saveTimeout) clearTimeout(saveTimeout);
  // Debounce writes to cloud so fast typing does not flood network
  saveTimeout = setTimeout(() => {
    flushSaveDatabase(false);
  }, 200);
  return finalState;
};

// Guarantee synchronous flush on tab close / reload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushSaveDatabase(true);
  });
  window.addEventListener('pagehide', () => {
    flushSaveDatabase(true);
  });
}

/**
 * Safely merges an incoming database into the base state prioritizing the latest
 * modified version (Last-Write-Wins with updated_at and versioning) to eliminate
 * conflicts between PC and mobile.
 */
export const mergeDatabases = (
  base: DatabaseState,
  incoming: DatabaseState
): { merged: DatabaseState; changesCount: number } => {
  let changesCount = 0;
  const merged: DatabaseState = { ...base };

  // Combine tombstones prioritizing latest deletion timestamp
  const mergedDeletedIds: Record<string, string> = {
    ...(base.deletedEntityIds || {}),
  };
  if (incoming.deletedEntityIds) {
    for (const [id, delTime] of Object.entries(incoming.deletedEntityIds)) {
      const existingDel = mergedDeletedIds[id];
      const delTimeStr = String(delTime);
      if (!existingDel || new Date(delTimeStr).getTime() > new Date(existingDel).getTime()) {
        mergedDeletedIds[id] = delTimeStr;
      }
    }
  }

  const checkTombstone = (entity: any): boolean => {
    return isEntityTombstoned(entity, mergedDeletedIds);
  };

  // 1. Merge Quotes
  const quoteMap = new Map<string, Quote>();
  (merged.quotes || []).forEach(q => {
    if (!checkTombstone(q)) quoteMap.set(q.id, q);
  });
  (incoming.quotes || []).forEach(q => {
    if (checkTombstone(q)) return;
    if (!quoteMap.has(q.id)) {
      quoteMap.set(q.id, q);
      changesCount++;
    } else {
      const existing = quoteMap.get(q.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, q);
      if (isUpdated) {
        quoteMap.set(q.id, winner);
        delete mergedDeletedIds[q.id];
        changesCount++;
      }
    }
  });
  merged.quotes = Array.from(quoteMap.values());

  // 2. Merge Quote Items
  const itemMap = new Map<string, QuoteItem>();
  (merged.quoteItems || []).forEach(qi => {
    if (!checkTombstone(qi)) itemMap.set(qi.id, qi);
  });
  (incoming.quoteItems || []).forEach(qi => {
    if (checkTombstone(qi)) return;
    if (!itemMap.has(qi.id)) {
      itemMap.set(qi.id, qi);
      changesCount++;
    } else {
      const existing = itemMap.get(qi.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, qi);
      if (isUpdated) {
        itemMap.set(qi.id, winner);
        delete mergedDeletedIds[qi.id];
        changesCount++;
      }
    }
  });
  merged.quoteItems = Array.from(itemMap.values());

  // 3. Merge Appointments (excluding appointments tied to excluded OS)
  const apptMap = new Map<string, Appointment>();
  (merged.appointments || []).forEach(a => {
    if (checkTombstone(a)) return;
    if (!a.os_id || !isExcludedServiceOrder({ id: a.os_id, numero: a.os_id })) {
      apptMap.set(a.id, a);
    }
  });
  (incoming.appointments || []).forEach(a => {
    if (checkTombstone(a)) return;
    if (a.os_id && isExcludedServiceOrder({ id: a.os_id, numero: a.os_id })) return;
    if (isExcludedServiceOrder(a)) return;
    if (!apptMap.has(a.id)) {
      apptMap.set(a.id, a);
      changesCount++;
    } else {
      const existing = apptMap.get(a.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, a);
      if (isUpdated) {
        apptMap.set(a.id, winner);
        delete mergedDeletedIds[a.id];
        changesCount++;
      }
    }
  });
  merged.appointments = Array.from(apptMap.values());

  // 4. Merge Service Orders (excluding user-requested excluded OS)
  const osMap = new Map<string, ServiceOrder>();
  (merged.serviceOrders || []).forEach(os => {
    if (checkTombstone(os)) return;
    if (!isExcludedServiceOrder(os)) {
      osMap.set(os.id, os);
    }
  });
  (incoming.serviceOrders || []).forEach(os => {
    if (checkTombstone(os)) return;
    if (isExcludedServiceOrder(os)) return;
    if (!osMap.has(os.id)) {
      osMap.set(os.id, os);
      changesCount++;
    } else {
      const existing = osMap.get(os.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, os);
      if (isUpdated) {
        osMap.set(os.id, winner);
        delete mergedDeletedIds[os.id];
        changesCount++;
      }
    }
  });
  merged.serviceOrders = Array.from(osMap.values());

  // 5. Merge Clients
  const clientMap = new Map<string, Client>();
  (merged.clients || []).forEach(c => {
    if (!checkTombstone(c)) clientMap.set(c.id, c);
  });
  (incoming.clients || []).forEach(c => {
    if (checkTombstone(c)) return;
    if (!clientMap.has(c.id)) {
      clientMap.set(c.id, c);
      changesCount++;
    } else {
      const existing = clientMap.get(c.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, c);
      if (existing.historico_servicos && c.historico_servicos) {
        const histMap = new Map<string, any>();
        existing.historico_servicos.forEach(h => histMap.set(h.id || `${h.data}_${h.valor}`, h));
        c.historico_servicos.forEach(h => {
          const key = h.id || `${h.data}_${h.valor}`;
          if (!histMap.has(key)) histMap.set(key, h);
        });
        winner.historico_servicos = Array.from(histMap.values());
      }
      if (isUpdated) {
        clientMap.set(c.id, winner);
        delete mergedDeletedIds[c.id];
        changesCount++;
      }
    }
  });
  merged.clients = Array.from(clientMap.values());

  // 6. Merge Transactions (excluding transactions tied to excluded OS or user-excluded transactions)
  const txMap = new Map<string, Transaction>();
  (merged.transactions || []).forEach(t => {
    if (checkTombstone(t)) return;
    if (!isExcludedTransaction(t)) {
      txMap.set(t.id, t);
    }
  });
  (incoming.transactions || []).forEach(t => {
    if (checkTombstone(t)) return;
    if (isExcludedTransaction(t)) return;
    if (!txMap.has(t.id)) {
      txMap.set(t.id, t);
      changesCount++;
    } else {
      const existing = txMap.get(t.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, t);
      if (isUpdated) {
        txMap.set(t.id, winner);
        delete mergedDeletedIds[t.id];
        changesCount++;
      }
    }
  });
  merged.transactions = Array.from(txMap.values());

  // 7. Merge Services (Catálogo)
  const serviceMap = new Map<string, Service>();
  (merged.services || []).forEach(s => {
    if (!checkTombstone(s)) serviceMap.set(s.id, s);
  });
  (incoming.services || []).forEach(s => {
    if (checkTombstone(s)) return;
    if (!serviceMap.has(s.id)) {
      serviceMap.set(s.id, s);
      changesCount++;
    } else {
      const existing = serviceMap.get(s.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, s);
      if (isUpdated) {
        serviceMap.set(s.id, winner);
        delete mergedDeletedIds[s.id];
        changesCount++;
      }
    }
  });
  merged.services = Array.from(serviceMap.values());

  // 8. Merge Products (Suprimentos)
  const productMap = new Map<string, Product>();
  (merged.products || []).forEach(p => {
    if (!checkTombstone(p)) productMap.set(p.id, p);
  });
  (incoming.products || []).forEach(p => {
    if (checkTombstone(p)) return;
    if (!productMap.has(p.id)) {
      productMap.set(p.id, p);
      changesCount++;
    } else {
      const existing = productMap.get(p.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, p);
      if (isUpdated) {
        productMap.set(p.id, winner);
        delete mergedDeletedIds[p.id];
        changesCount++;
      }
    }
  });
  merged.products = Array.from(productMap.values());

  // 9. Merge Recurrences
  const recMap = new Map<string, Recurrence>();
  (merged.recurrences || []).forEach(r => {
    if (!checkTombstone(r)) recMap.set(r.id, r);
  });
  (incoming.recurrences || []).forEach(r => {
    if (checkTombstone(r)) return;
    if (!recMap.has(r.id)) {
      recMap.set(r.id, r);
      changesCount++;
    } else {
      const existing = recMap.get(r.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, r);
      if (isUpdated) {
        recMap.set(r.id, winner);
        delete mergedDeletedIds[r.id];
        changesCount++;
      }
    }
  });
  merged.recurrences = Array.from(recMap.values());

  // 10. Merge Recurrence Executions & Logs
  const execMap = new Map<string, RecurrenceExecution>();
  (merged.recurrenceExecutions || []).forEach(e => {
    if (!checkTombstone(e)) execMap.set(e.id, e);
  });
  (incoming.recurrenceExecutions || []).forEach(e => {
    if (checkTombstone(e)) return;
    if (!execMap.has(e.id)) {
      execMap.set(e.id, e);
      changesCount++;
    } else {
      const existing = execMap.get(e.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, e);
      if (isUpdated) {
        execMap.set(e.id, winner);
        delete mergedDeletedIds[e.id];
        changesCount++;
      }
    }
  });
  merged.recurrenceExecutions = Array.from(execMap.values());

  const logMap = new Map<string, RecurrenceLog>();
  (merged.recurrenceLogs || []).forEach(l => {
    if (!checkTombstone(l)) logMap.set(l.id, l);
  });
  (incoming.recurrenceLogs || []).forEach(l => {
    if (checkTombstone(l)) return;
    if (!logMap.has(l.id)) {
      logMap.set(l.id, l);
      changesCount++;
    } else {
      const existing = logMap.get(l.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, l);
      if (isUpdated) {
        logMap.set(l.id, winner);
        delete mergedDeletedIds[l.id];
        changesCount++;
      }
    }
  });
  merged.recurrenceLogs = Array.from(logMap.values());

  // 11. Merge Photos (Client & OS Photos)
  const clientPhotoMap = new Map<string, ClientPhoto>();
  (merged.clientPhotos || []).forEach(cp => {
    if (!checkTombstone(cp)) clientPhotoMap.set(cp.id, cp);
  });
  (incoming.clientPhotos || []).forEach(cp => {
    if (checkTombstone(cp)) return;
    if (!clientPhotoMap.has(cp.id)) {
      clientPhotoMap.set(cp.id, cp);
      changesCount++;
    } else {
      const existing = clientPhotoMap.get(cp.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, cp);
      if (isUpdated) {
        clientPhotoMap.set(cp.id, winner);
        delete mergedDeletedIds[cp.id];
        changesCount++;
      }
    }
  });
  merged.clientPhotos = Array.from(clientPhotoMap.values());

  const osPhotoMap = new Map<string, OSPhoto>();
  (merged.osPhotos || []).forEach(p => {
    if (!checkTombstone(p)) osPhotoMap.set(p.id, p);
  });
  (incoming.osPhotos || []).forEach(p => {
    if (checkTombstone(p)) return;
    if (!osPhotoMap.has(p.id)) {
      osPhotoMap.set(p.id, p);
      changesCount++;
    } else {
      const existing = osPhotoMap.get(p.id)!;
      const { winner, isUpdated } = resolveEntityWinner(existing, p);
      if (isUpdated) {
        osPhotoMap.set(p.id, winner);
        delete mergedDeletedIds[p.id];
        changesCount++;
      }
    }
  });
  merged.osPhotos = Array.from(osPhotoMap.values());

  // 12. Merge Company Settings
  if (incoming.companySettings) {
    if (!merged.companySettings) {
      merged.companySettings = incoming.companySettings;
      changesCount++;
    } else {
      const { winner, isUpdated } = resolveEntityWinner(merged.companySettings as any, incoming.companySettings as any);
      if (isUpdated) {
        merged.companySettings = winner as any;
        changesCount++;
      }
    }
  }

  merged.deletedEntityIds = mergedDeletedIds;

  return { merged, changesCount };
};

/**
 * Checks IndexedDB, localStorage backups, and Supabase on app mount.
 * Intelligently merges any missing records (e.g. quotes or appointments created yesterday)
 * so no data is ever lost or reverted.
 */
export const reconcileWithIndexedDB = async (
  currentDb: DatabaseState,
  onRecovered: (recoveredDb: DatabaseState, source: string) => void
): Promise<DatabaseState> => {
  let workingState = currentDb;
  let totalRecovered = 0;
  let recoverySource = '';

  // 1. Reconcile with IndexedDB
  try {
    const idbState = await loadFromIndexedDB();
    if (idbState) {
      const { merged, changesCount } = mergeDatabases(workingState, idbState);
      if (changesCount > 0) {
        workingState = merged;
        totalRecovered += changesCount;
        recoverySource = 'IndexedDB Seguro';
      }
    } else {
      // First run with IndexedDB: seed it from current state
      await saveToIndexedDB(workingState);
      await createIndexedDBSnapshot(workingState, 'Backup Inicial do Sistema');
    }
  } catch (err) {
    console.warn('[Storage] Error during IndexedDB reconciliation:', err);
  }

  // 2. Reconcile with localStorage backup key if present
  try {
    const backupRaw = localStorage.getItem(BACKUP_KEY);
    if (backupRaw) {
      const backupParsed = JSON.parse(backupRaw);
      if (backupParsed && typeof backupParsed === 'object') {
        const { merged, changesCount } = mergeDatabases(workingState, backupParsed);
        if (changesCount > 0) {
          workingState = merged;
          totalRecovered += changesCount;
          recoverySource = recoverySource ? `${recoverySource} + Backup` : 'Backup Local';
        }
      }
    }
  } catch (err) {
    console.warn('[Storage] Error during backup key reconciliation:', err);
  }

  // 3. Reconcile with Firebase Firestore Cloud (PC & Mobile multi-device sync)
  try {
    const cloudDb = await fetchFullDatabaseFromCloud(workingState);
    if (cloudDb) {
      // If local state was only a minimal stub compared to cloud, cloud is authoritative master
      const isLocalBootOnly = (workingState.serviceOrders?.length || 0) <= 5 && (cloudDb.serviceOrders?.length || 0) > 10;

      const { merged, changesCount } = mergeDatabases(workingState, cloudDb);
      if (changesCount > 0 || isLocalBootOnly) {
        workingState = merged;
        totalRecovered += Math.max(changesCount, 1);
        recoverySource = recoverySource ? `${recoverySource} + Nuvem` : 'Nuvem Firebase';
      }

      // If local state has updates not yet in cloud, push merged state to cloud
      if (changesCount > 0) {
        uploadFullDatabaseToCloud(workingState, mergeDatabases).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Storage] Firebase cloud reconciliation warning:', err);
  }

  // Always guarantee that no excluded service orders, transactions, or associated records persist
  const hasExcludedOS = Array.isArray(workingState.serviceOrders) && workingState.serviceOrders.some(isExcludedServiceOrder);
  const hasExcludedTx = Array.isArray(workingState.transactions) && workingState.transactions.some(isExcludedTransaction);
  if (hasExcludedOS || hasExcludedTx) {
    workingState = {
      ...workingState,
      serviceOrders: workingState.serviceOrders.filter(os => !isExcludedServiceOrder(os)),
      appointments: (workingState.appointments || []).filter(
        app => !app.os_id || !isExcludedServiceOrder({ id: app.os_id, numero: app.os_id })
      ),
      transactions: (workingState.transactions || []).filter(
        tx => !isExcludedTransaction(tx)
      ),
    };
    saveDatabase(workingState, true, true);
  }

  // Initial hydration is now complete!
  setHydratedStatus(true);

  if (totalRecovered > 0) {
    console.log(`[Storage] Reconciled and recovered ${totalRecovered} records from ${recoverySource}`);
    saveDatabase(workingState, true, true);
    onRecovered(workingState, recoverySource);
    return workingState;
  }

  saveDatabase(workingState, true, true);
  return workingState;
};

export { 
  createIndexedDBSnapshot, 
  listIndexedDBSnapshots, 
  restoreIndexedDBSnapshot 
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushSaveDatabase(true);
  });
  window.addEventListener('pagehide', () => {
    flushSaveDatabase(true);
  });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushSaveDatabase(true);
    }
  });
}
