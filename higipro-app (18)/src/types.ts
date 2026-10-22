/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ClientOrigin = 'Google' | 'Meta' | 'Indicação' | 'Cliente da Base' | 'Outros';

export type PhotoItemCategory = 'Sofá' | 'Colchão' | 'Cadeira' | 'Poltrona' | 'Tapete' | 'Outros';

export interface ClientPhoto {
  id: string;
  client_id: string;
  quote_id?: string;
  os_id?: string;
  url: string;
  categoria: PhotoItemCategory;
  descricao?: string;
  created_at: string;
  updated_at?: string;
  version?: number;
}

export interface ClientHistoricalService {
  id: string;
  nome_servico: string;
  servico?: string;
  categoria?: ServiceCategory;
  tipo_estofado: SofaType;
  valor: number;
  data: string; // YYYY-MM-DD
  tipo?: 'servico' | 'orcamento';
  status?: 'concluido' | 'pendente' | 'cancelado' | 'orcado';
  observacoes?: string;
}

export interface VersionedEntity {
  id: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  [key: string]: any;
}

export interface Client {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  endereco: string;
  bairro?: string;
  regiao?: string;
  cidade: string;
  estado: string;
  CEP: string;
  lat?: number;
  lng?: number;
  observacoes: string;
  tags: string[];
  origem: ClientOrigin;
  created_at: string;
  updated_at?: string;
  version?: number;
  total_gasto?: number;
  total_pedidos?: number;
  ultimo_servico?: string;
  historico_servicos?: ClientHistoricalService[];
}

export type ServiceCategory = 'Higienização' | 'Impermeabilização' | 'Limpeza' | 'Sanitização' | 'Tapete' | 'Outros';
export type SofaType = 'Sofá' | 'Colchão' | 'Poltrona' | 'Cadeira' | 'Tapete' | 'Cortina' | 'Carro' | 'Outros';

export type ProductCategory = 
  | 'Detergentes' 
  | 'Tira Manchas' 
  | 'Alvejantes' 
  | 'Impermeabilizantes' 
  | 'Sanitizantes & Neutralizadores' 
  | 'Finalizadores' 
  | 'Outros';

export const PRODUCT_CATEGORIES = [
  'Detergentes',
  'Tira Manchas',
  'Alvejantes',
  'Impermeabilizantes',
  'Sanitizantes & Neutralizadores',
  'Finalizadores',
  'Outros'
] as const;

export interface Product {
  id: string;
  nome: string;
  categoria: ProductCategory | string;
  preco_custo: number; // Custo de compra da embalagem / galão / frasco (R$)
  preco_venda?: number; // Preço sugerido de aplicação ou repasse ao cliente (opcional / depreciado)
  custo_por_servico: number; // Custo médio estimado gasto por serviço/estofado (R$)
  unidade: string; // 'Galão 5L' | 'Frasco 1L' | 'L' | 'Kg' | 'un'
  rendimento?: string; // ex: 'Rende ~20 sofás'
  estoque_qtd?: number;
  fornecedor?: string;
  observacoes?: string;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export const TECNICOS_HIGIPRO = [
  'Equipe Higipro 01',
  'Luciano Neimaier',
  'Lisiane Neimaier',
  'Amanda Neimaier',
] as const;

export type TecnicoHigipro = typeof TECNICOS_HIGIPRO[number];

export interface Service {
  id: string;
  nome: string;
  descricao: string;
  categoria: ServiceCategory;
  tipo_estofado: SofaType;
  preco: number;
  custo: number;
  duracao: number; // in minutes
  ativo: boolean;
  unidade?: 'un' | 'm²';
  tamanho_largura?: number;
  tamanho_comprimento?: number;
  tamanho_m2?: number;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export type QuoteStatus = 'rascunho' | 'enviado' | 'aprovado' | 'recusado' | 'expirado' | 'concluido';

export interface Quote {
  id: string;
  numero: string;
  client_id: string;
  client_name: string;
  status: QuoteStatus;
  subtotal?: number;
  desconto?: number;
  tipo_desconto?: 'valor' | 'porcentagem';
  desconto_percentual?: number;
  desconto_motivo?: string;
  total: number;
  observacoes: string;
  validade: string; // YYYY-MM-DD
  created_at: string;
  updated_at?: string;
  version?: number;
  enviado_em?: string;
  follow_up_enviado_em?: string;
  follow_up_tentativas?: number;
  follow_up_status?: 'pendente' | 'enviado' | 'respondido' | 'sem_interesse';
  // Arquivamento de orçamento (ex: quando OS é concluída)
  arquivado?: boolean;
  arquivado_em?: string;
  arquivado_motivo?: string;
  // Lembrete no orçamento (ex: sofá chega daqui a 30 dias - chamar cliente dia...)
  tem_lembrete?: boolean;
  lembrete_data?: string; // YYYY-MM-DD
  lembrete_motivo?: string;
  lembrete_concluido?: boolean;
  lembrete_concluido_em?: string;
  os_id?: string;
  origem?: ClientOrigin;
  itens?: QuoteItem[];
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  service_id: string;
  descricao: string;
  qtd: number;
  preco_unit: number;
  subtotal: number;
  unidade?: 'un' | 'm²';
  tamanho_largura?: number;
  tamanho_comprimento?: number;
  tamanho_m2?: number;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export type OSStatus = 'orcamento' | 'agendado' | 'em_execucao' | 'concluido' | 'cancelado';

export interface ServiceOrder {
  id: string;
  numero: string;
  quote_id?: string;
  quote_numero?: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  status: OSStatus;
  total: number;
  pago: number;
  data_agendada?: string; // YYYY-MM-DDTHH:mm
  data_conclusao?: string; // YYYY-MM-DD
  tecnico: string;
  endereco: string;
  observacoes: string;
  created_at: string;
  updated_at?: string;
  version?: number;
  pos_venda_enviado?: boolean;
  pos_venda_enviado_em?: string;
  pos_venda_avaliacao?: number; // 1 to 5 estrelas
  pos_venda_feedback?: string;
  items?: any[];
  data_agendamento?: string;
  metodo_pagamento?: PaymentMethod;
}

export interface OSPhoto {
  id: string;
  os_id: string;
  url: string;
  label: 'antes' | 'depois';
  created_at: string;
  updated_at?: string;
  version?: number;
}

export type AppointmentStatus = 'agendado' | 'confirmado' | 'concluido' | 'cancelado';

export interface Appointment {
  id: string;
  os_id?: string;
  client_id: string;
  client_name: string;
  servicos: string;
  data_hora: string; // YYYY-MM-DDTHH:mm
  duracao: number; // in minutes
  status: AppointmentStatus;
  tecnico: string;
  endereco: string;
  observacoes: string;
  valor?: number;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export type TransactionType = 'receita' | 'despesa';
export type PaymentMethod = 'Dinheiro' | 'Pix' | 'Cartão' | 'Transferência' | 'Boleto';
export type TransactionStatus = 'pago' | 'pendente' | 'cancelado';

export interface Transaction {
  id: string;
  tipo: TransactionType;
  categoria: string;
  descricao: string;
  valor: number;
  data: string; // YYYY-MM-DD
  metodo_pagamento: PaymentMethod;
  status: TransactionStatus;
  os_id?: string;
  client_id?: string;
  client_name?: string;
  created_at: string;
  updated_at?: string;
  version?: number;
}

export type RecurrenceFrequency = 'mensal' | 'trimestral' | 'semestral' | 'anual';

export interface Recurrence {
  id: string;
  client_id: string;
  client_name?: string;
  service_id?: string;
  service_name?: string;
  frequencia?: RecurrenceFrequency;
  intervalo?: number; // in months
  proxima_data?: string; // YYYY-MM-DD
  data_inicio?: string; // YYYY-MM-DD
  data_fim?: string; // YYYY-MM-DD
  ativo: boolean;
  lembrete?: number; // days in advance
  observacoes?: string;
  // Backward compatibility fields
  servico_origem?: string;
  ultimo_servico_at?: string;
  intervalo_meses?: number;
  proxima_data_sugerida?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export interface RecurrenceLog {
  id: string;
  recurrence_id: string;
  client_name: string;
  data_contato: string;
  resultado: 'sucesso' | 'sem_retorno' | 'recusado';
  observacoes: string;
  tipo?: 'recorrencia' | 'follow_up_orcamento';
  quote_id?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export interface RecurrenceExecution {
  id: string;
  recurrence_id: string;
  data_execucao: string; // YYYY-MM-DD
  os_id?: string;
  status: 'sucesso' | 'erro';
  observacoes: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export interface CompanySettings {
  razao_social: string;
  nome_fantasia: string;
  cnpj_cpf: string;
  telefone: string;
  whatsapp: string;
  email: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  chave_pix: string;
  tipo_chave_pix: 'CNPJ' | 'CPF' | 'Celular' | 'E-mail' | 'Aleatória';
  banco: string;
  garantia_padrao_higienizacao: string;
  garantia_padrao_impermeabilizacao: string;
  mensagem_padrao_orcamento: string;
  mensagem_follow_up_orcamento?: string;
  mensagem_pos_venda: string;
  mensagem_agendamento: string;
  mensagem_recorrencia: string;
  link_avaliacao_google?: string;
  dias_pos_venda?: number;
  smart_goals?: SmartGoalsConfig;
  budget_calculator?: BudgetCalculatorDefaults;
  updated_at?: string;
  version?: number;
}

export interface SmartGoalsConfig {
  metaFaturamentoMensal: number; // e.g. 15000
  diasTrabalhadosMes: number; // e.g. 22
  horasProdutivasDia: number; // e.g. 6.5
  custosFixosMensal: number; // e.g. 3500
  margemLucroDesejadaPercentual: number; // e.g. 40
  ticketMedioEstimado: number; // e.g. 380
  updated_at?: string;
}

export interface BudgetCalculatorDefaults {
  valorHoraMaoDeObra: number; // e.g. 85.00
  custoKmDeslocamento: number; // e.g. 1.80
  margemLucroPadrao: number; // e.g. 40
  impostoTaxasPadrao: number; // e.g. 6
  custosFixosRateio: number; // e.g. 15.00
  updated_at?: string;
}

export type PageId = 
  | 'dashboard' 
  | 'clientes' 
  | 'catalogo' 
  | 'orcamentos' 
  | 'calculadora'
  | 'os' 
  | 'agendamentos' 
  | 'agenda'
  | 'financeiro' 
  | 'metas'
  | 'recorrencia' 
  | 'metricas' 
  | 'relatorios' 
  | 'configuracoes';

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
  hasClearedRegisteredServiceOrders_v1?: boolean;
  hasImportedSeptember2026Spreadsheet_v1?: boolean;
  hasImportedSeptember2026Spreadsheet_v2?: boolean;
  hasImportedSeptember2026Spreadsheet_v3?: boolean;
  hasImportedSeptember2026Spreadsheet_v4?: boolean;
  hasImportedSeptember2026Spreadsheet_v5?: boolean;
  hasImportedSeptember2026Spreadsheet_v6?: boolean;
  hasImportedSeptember2026Spreadsheet_v7?: boolean;
  hasImportedSeptember2026Quotes_v1?: boolean;
  hasImportedSeptember2026Quotes_v2?: boolean;
  hasImportedSeptember2026Quotes_v3?: boolean;
  hasImportedSeptember2026Quotes_v4?: boolean;
  hasImportedSeptember2026Quotes_v5?: boolean;
  hasImportedSeptember2026Quotes_v6?: boolean;
  hasImportedSeptember2026Quotes_v7?: boolean;
  [key: string]: any;
}

