/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { 
  Search, Filter, Eye, ArrowRight, CheckCircle, CheckCircle2, Calendar, 
  Camera, Plus, User, MapPin, DollarSign, FileText, Smartphone,
  Trello, List, Clock, ChevronLeft, ChevronRight, Edit, Info, Trash2, Receipt,
  RefreshCw, Play, XCircle, Check, Star, MessageSquare, ExternalLink,
  UserPlus, Percent, Tag, Sparkles, AlertCircle, Phone, X, Layers, Ruler
} from 'lucide-react';
import { DatabaseState, ServiceOrder, OSStatus, OSPhoto, Client, Transaction, Recurrence, Quote, QuoteItem, Appointment, ClientOrigin, TECNICOS_HIGIPRO } from '../types';
import { formatCurrency, formatDate, formatDateTime, formatPhone, addMonths, cleanWhatsAppPhone, generateNumber, parseDateComponents } from '../lib/utils';
import { Modal, StatusBadge, EmptyState } from './UIComponents';
import { generateId, ORIGINS } from '../lib/database';
import { supabaseSaveServiceOrder, supabaseSaveTransaction, supabaseSaveRecurrence, supabaseSaveQuote, supabaseSaveClient, supabaseSaveAppointment } from '../lib/supabase';
import { OrcamentoDocument } from './OrcamentoDocument';
import { ReciboDocument } from './ReciboDocument';
import { PeriodFilter } from './PeriodFilter';
import { completeServiceAndSyncAll } from '../lib/serviceCompletion';

// Helper to automatically archive the linked quote when an OS is concluded
const archiveQuotesForCompletedOS = (quotes: Quote[], os: ServiceOrder): Quote[] => {
  const nowStr = new Date().toISOString().split('T')[0];
  return quotes.map(q => {
    const isLinked = (os.quote_id && q.id === os.quote_id) || 
      (os.quote_numero && q.numero === os.quote_numero) ||
      (q.client_id === os.client_id && q.status === 'aprovado' && !q.arquivado);
    
    if (isLinked && !q.arquivado) {
      const updatedQuote: Quote = {
        ...q,
        arquivado: true,
        arquivado_em: nowStr,
        arquivado_motivo: `OS ${os.numero} concluída com sucesso`
      };
      supabaseSaveQuote(updatedQuote);
      return updatedQuote;
    }
    return q;
  });
};

// Helper to create annual recurrences (Higienização and Impermeabilização) for concluded & paid OS
const createAnnualRecurrencesForOS = (
  os: ServiceOrder,
  clientName: string,
  nowStr: string,
  existingRecurrences: Recurrence[]
): Recurrence[] => {
  const proximaDataSugerida = addMonths(nowStr, 12);
  const newRecs: Recurrence[] = [];

  const hasHig = existingRecurrences.some(
    r => r.client_id === os.client_id &&
    ((r.service_name && r.service_name.toLowerCase().includes('higien')) || 
     (r.servico_origem && r.servico_origem.toLowerCase().includes('higien'))) &&
    r.ativo
  );

  if (!hasHig) {
    const rec: Recurrence = {
      id: generateId(),
      client_id: os.client_id,
      client_name: clientName || os.client_name,
      service_name: 'Higienização Anual de Estofados',
      servico_origem: 'Higienização',
      frequencia: 'anual',
      intervalo: 12,
      intervalo_meses: 12,
      data_inicio: nowStr,
      ultimo_servico_at: nowStr,
      proxima_data: proximaDataSugerida,
      proxima_data_sugerida: proximaDataSugerida,
      ativo: true,
      lembrete: 15,
      observacoes: `Criado automaticamente pela conclusão e recebimento da OS ${os.numero}`,
    };
    newRecs.push(rec);
    supabaseSaveRecurrence(rec);
  }

  const hasImp = existingRecurrences.some(
    r => r.client_id === os.client_id &&
    ((r.service_name && r.service_name.toLowerCase().includes('impermeab')) || 
     (r.servico_origem && r.servico_origem.toLowerCase().includes('impermeab'))) &&
    r.ativo
  );

  if (!hasImp) {
    const rec: Recurrence = {
      id: generateId(),
      client_id: os.client_id,
      client_name: clientName || os.client_name,
      service_name: 'Impermeabilização Anual',
      servico_origem: 'Impermeabilização',
      frequencia: 'anual',
      intervalo: 12,
      intervalo_meses: 12,
      data_inicio: nowStr,
      ultimo_servico_at: nowStr,
      proxima_data: proximaDataSugerida,
      proxima_data_sugerida: proximaDataSugerida,
      ativo: true,
      lembrete: 15,
      observacoes: `Criado automaticamente pela conclusão e recebimento da OS ${os.numero}`,
    };
    newRecs.push(rec);
    supabaseSaveRecurrence(rec);
  }

  return newRecs;
};

interface OrdensServicoProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
}

export const OrdensServico = React.memo<OrdensServicoProps>(({ db, onUpdateDb }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [originFilter, setOriginFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('grid');
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Month & Year selection for OS monitoring (0-indexed: 9 = Outubro)
  const now = useMemo(() => new Date(), []);
  const currentMonthNum = now.getMonth();
  const currentYearNum = now.getFullYear();
  const monthNames = useMemo(() => [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ], []);
  const currentMonthName = monthNames[currentMonthNum] || 'Atual';
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(currentYearNum);

  // Quick count metrics for period pills
  const periodCounts = useMemo(() => {
    let octCount = 0;
    let sepCount = 0;
    (db?.serviceOrders || []).forEach(os => {
      const d = os.data_agendada || os.data_conclusao || os.created_at;
      if (d) {
        const { year, month } = parseDateComponents(d);
        if (year === currentYearNum && month === currentMonthNum) octCount++;
        if (year === currentYearNum && month === 8) sepCount++;
      }
    });
    return {
      all: (db?.serviceOrders || []).length,
      current: octCount,
      september: sepCount
    };
  }, [db?.serviceOrders, currentMonthNum, currentYearNum]);

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]);
    (db?.serviceOrders || []).forEach(os => {
      const d = os.data_agendada || os.data_conclusao || os.created_at;
      if (d) {
        const { year } = parseDateComponents(d);
        if (year && year >= 2020 && year <= 2035) yearsSet.add(year);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [db?.serviceOrders, now]);

  // Dialog state
  const [selectedOS, setSelectedOS] = useState<ServiceOrder | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedQuoteForOS, setSelectedQuoteForOS] = useState<Quote | null>(null);

  // Recibo State
  const [isReciboOpen, setIsReciboOpen] = useState(false);
  const [selectedOSForRecibo, setSelectedOSForRecibo] = useState<ServiceOrder | null>(null);

  const handleOpenRecibo = (os: ServiceOrder) => {
    setSelectedOSForRecibo(os);
    setIsReciboOpen(true);
  };

  // Edit OS Modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<ServiceOrder | null>(null);
  const [osToDelete, setOsToDelete] = useState<ServiceOrder | null>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);

  // Direct Create OS State & Handlers
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createClientMode, setCreateClientMode] = useState<'existing' | 'new'>('existing');
  const [createClientSearch, setCreateClientSearch] = useState('');
  const [selectedClientIdForCreate, setSelectedClientIdForCreate] = useState<string>('');

  // New Client quick fields
  const [newClientNome, setNewClientNome] = useState('');
  const [newClientTelefone, setNewClientTelefone] = useState('');
  const [newClientEndereco, setNewClientEndereco] = useState('');
  const [newClientBairro, setNewClientBairro] = useState('');
  const [newClientCidade, setNewClientCidade] = useState('Passo Fundo');
  const [newClientOrigem, setNewClientOrigem] = useState<ClientOrigin>('WhatsApp');

  // OS Operational & Schedule fields
  const [createStatus, setCreateStatus] = useState<OSStatus>('agendado');
  const [createDataAgendada, setCreateDataAgendada] = useState<string>(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d.toISOString().substring(0, 16);
  });
  const [createDataConclusao, setCreateDataConclusao] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [createTecnico, setCreateTecnico] = useState<string>('Equipe Higipro 01');
  const [createEndereco, setCreateEndereco] = useState<string>('');
  const [createObservacoes, setCreateObservacoes] = useState<string>('');

  // Items in OS
  interface CreateOSItem {
    id: string;
    service_id?: string;
    descricao: string;
    qtd: number;
    preco_unit: number;
    subtotal: number;
    unidade?: 'un' | 'm²';
    largura?: number;
    comprimento?: number;
    tamanho_m2?: number;
    showDimensions?: boolean;
  }
  const [createItems, setCreateItems] = useState<CreateOSItem[]>([]);
  const [selectedCatalogServiceId, setSelectedCatalogServiceId] = useState<string>('');
  const [catalogTapeteLargura, setCatalogTapeteLargura] = useState<string>('2.00');
  const [catalogTapeteComprimento, setCatalogTapeteComprimento] = useState<string>('2.50');
  const [customItemDesc, setCustomItemDesc] = useState('');
  const [customItemPreco, setCustomItemPreco] = useState('');
  const [customItemQtd, setCustomItemQtd] = useState('1');
  const [customItemUnidade, setCustomItemUnidade] = useState<'un' | 'm²'>('un');
  const [customTapeteLargura, setCustomTapeteLargura] = useState<string>('2.00');
  const [customTapeteComprimento, setCustomTapeteComprimento] = useState<string>('2.50');
  const [createDesconto, setCreateDesconto] = useState<string>('0');

  // Payment
  const [createPaymentMethod, setCreatePaymentMethod] = useState<'Pix' | 'Cartão' | 'Dinheiro' | 'Transferência' | 'Boleto'>('Pix');
  const [createValorPago, setCreateValorPago] = useState<string>('');
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  const createSubtotal = useMemo(() => {
    return createItems.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
  }, [createItems]);

  const discountAmount = useMemo(() => {
    const val = parseFloat(String(createDesconto).replace(',', '.')) || 0;
    return val > 0 ? val : 0;
  }, [createDesconto]);

  const createTotal = useMemo(() => {
    return Math.max(0, createSubtotal - discountAmount);
  }, [createSubtotal, discountAmount]);

  const filteredClientsForCreate = useMemo(() => {
    const clients = Array.isArray(db?.clients) ? db.clients : [];
    if (!createClientSearch || !createClientSearch.trim()) {
      return clients.slice(0, 10);
    }
    const term = createClientSearch.toLowerCase().trim();
    const cleanDigits = createClientSearch.replace(/\D/g, '');

    return clients.filter(c => {
      if (!c) return false;
      const nome = String(c.nome || '').toLowerCase();
      const tel = String(c.telefone || '').toLowerCase();
      const telDigits = String(c.telefone || '').replace(/\D/g, '');
      const endereco = String(c.endereco || '').toLowerCase();
      const cidade = String(c.cidade || '').toLowerCase();
      const bairro = String(c.bairro || '').toLowerCase();

      return (
        nome.includes(term) ||
        tel.includes(term) ||
        (cleanDigits.length >= 2 && telDigits.includes(cleanDigits)) ||
        endereco.includes(term) ||
        cidade.includes(term) ||
        bairro.includes(term)
      );
    }).slice(0, 30);
  }, [db?.clients, createClientSearch]);

  const handleOpenCreateOS = () => {
    setSelectedClientIdForCreate('');
    setCreateClientSearch('');
    setCreateClientMode('existing');
    setNewClientNome('');
    setNewClientTelefone('');
    setNewClientEndereco('');
    setNewClientBairro('');
    setNewClientCidade('Passo Fundo');
    setNewClientOrigem('WhatsApp');
    setCreateStatus('agendado');
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    setCreateDataAgendada(d.toISOString().substring(0, 16));
    setCreateDataConclusao(new Date().toISOString().split('T')[0]);
    setCreateTecnico('Equipe Higipro 01');
    setCreateEndereco('');
    setCreateObservacoes('');
    setCreateItems([]);
    setSelectedCatalogServiceId('');
    setCustomItemDesc('');
    setCustomItemPreco('');
    setCustomItemQtd('1');
    setCustomItemUnidade('un');
    setCreateDesconto('0');
    setCreatePaymentMethod('Pix');
    setCreateValorPago('');
    setCreateFormError(null);
    setIsCreateOpen(true);
  };

  const handleSelectExistingClient = (client: Client) => {
    setSelectedClientIdForCreate(client.id);
    setCreateEndereco(client.endereco || '');
    setCreateClientSearch('');
  };

  const handleAddCatalogItem = () => {
    if (!selectedCatalogServiceId) return;
    const s = db.services.find(item => item.id === selectedCatalogServiceId);
    if (!s) return;

    const isTapete = s.unidade === 'm²' || 
      s.tipo_estofado === 'Tapete' || 
      s.categoria === 'Tapete' || 
      s.nome.toLowerCase().includes('tapete');

    let qtd = 1;
    let desc = s.nome;
    let larg: number | undefined = undefined;
    let comp: number | undefined = undefined;
    let area: number | undefined = undefined;

    if (isTapete) {
      larg = Math.max(0.1, parseFloat(catalogTapeteLargura.replace(',', '.')) || 2.0);
      comp = Math.max(0.1, parseFloat(catalogTapeteComprimento.replace(',', '.')) || 2.5);
      area = parseFloat((larg * comp).toFixed(2));
      qtd = area;
      desc = `${s.nome} (${larg.toFixed(2)}m × ${comp.toFixed(2)}m = ${area.toFixed(2)} m²)`;
    }

    const newItem: CreateOSItem = {
      id: generateId(),
      service_id: s.id,
      descricao: desc,
      qtd: qtd,
      preco_unit: s.preco,
      subtotal: parseFloat((qtd * s.preco).toFixed(2)),
      unidade: isTapete ? 'm²' : (s.unidade || 'un'),
      largura: larg,
      comprimento: comp,
      tamanho_m2: area,
      showDimensions: isTapete,
    };
    setCreateItems(prev => [newItem, ...prev]);
    setSelectedCatalogServiceId('');
  };

  const handleAddCustomItem = () => {
    if (!customItemDesc.trim()) {
      setCreateFormError('Informe a descrição do serviço / item.');
      return;
    }
    const priceNum = parseFloat(customItemPreco.replace(',', '.')) || 0;
    const isTapete = customItemUnidade === 'm²' || customItemDesc.toLowerCase().includes('tapete');

    let qtdNum = parseFloat(customItemQtd.replace(',', '.')) || 1;
    let desc = customItemDesc.trim();
    let larg: number | undefined = undefined;
    let comp: number | undefined = undefined;
    let area: number | undefined = undefined;

    if (isTapete && customItemUnidade === 'm²') {
      larg = Math.max(0.1, parseFloat(customTapeteLargura.replace(',', '.')) || 2.0);
      comp = Math.max(0.1, parseFloat(customTapeteComprimento.replace(',', '.')) || 2.5);
      area = parseFloat((larg * comp).toFixed(2));
      qtdNum = area;
      desc = `${customItemDesc.trim()} (${larg.toFixed(2)}m × ${comp.toFixed(2)}m = ${area.toFixed(2)} m²)`;
    }

    const newItem: CreateOSItem = {
      id: generateId(),
      descricao: desc,
      qtd: qtdNum,
      preco_unit: priceNum,
      subtotal: parseFloat((priceNum * qtdNum).toFixed(2)),
      unidade: isTapete ? 'm²' : customItemUnidade,
      largura: larg,
      comprimento: comp,
      tamanho_m2: area,
      showDimensions: isTapete,
    };
    setCreateItems(prev => [newItem, ...prev]);
    setCustomItemDesc('');
    setCustomItemPreco('');
    setCustomItemQtd('1');
    setCreateFormError(null);
  };

  const handleToggleItemDimensions = (itemId: string) => {
    setCreateItems(prev => prev.map(i => {
      if (i.id === itemId) {
        const nextShow = !i.showDimensions;
        return {
          ...i,
          showDimensions: nextShow,
          largura: i.largura || 2.0,
          comprimento: i.comprimento || 2.5,
        };
      }
      return i;
    }));
  };

  const handleUpdateItemDimensions = (itemId: string, newLarg: number, newComp: number) => {
    setCreateItems(prev => prev.map(i => {
      if (i.id === itemId) {
        const safeL = Math.max(0, newLarg);
        const safeC = Math.max(0, newComp);
        const area = (safeL > 0 && safeC > 0) ? parseFloat((safeL * safeC).toFixed(2)) : (i.qtd || 1);
        const rawName = i.descricao.replace(/\s*\(\d+.*m²\)/i, '').trim();
        const newDesc = (safeL > 0 && safeC > 0)
          ? `${rawName} (${safeL.toFixed(2)}m × ${safeC.toFixed(2)}m = ${area.toFixed(2)} m²)`
          : rawName;
        return {
          ...i,
          largura: safeL,
          comprimento: safeC,
          tamanho_m2: area,
          qtd: area,
          subtotal: parseFloat((area * i.preco_unit).toFixed(2)),
          descricao: newDesc,
          unidade: 'm²',
        };
      }
      return i;
    }));
  };

  const handleRemoveCreateItem = (itemId: string) => {
    setCreateItems(prev => prev.filter(i => i.id !== itemId));
  };

  const handleUpdateItemQtd = (itemId: string, newQtd: number) => {
    if (newQtd <= 0) {
      handleRemoveCreateItem(itemId);
      return;
    }
    setCreateItems(prev => prev.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          qtd: newQtd,
          subtotal: parseFloat((i.preco_unit * newQtd).toFixed(2)),
        };
      }
      return i;
    }));
  };

  const handleUpdateItemPrice = (itemId: string, newPrice: number) => {
    setCreateItems(prev => prev.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          preco_unit: newPrice,
          subtotal: parseFloat((newPrice * i.qtd).toFixed(2)),
        };
      }
      return i;
    }));
  };

  const handleSaveCreateOS = () => {
    setCreateFormError(null);

    let resolvedClientId = selectedClientIdForCreate;
    let resolvedClientName = '';
    let resolvedClientPhone = '';
    let resolvedClientAddress = createEndereco.trim();
    let resolvedClientOrigem: ClientOrigin = 'WhatsApp';

    let updatedClients = [...db.clients];
    const nowStr = new Date().toISOString().split('T')[0];

    if (createClientMode === 'new') {
      if (!newClientNome.trim()) {
        setCreateFormError('Informe o nome do novo cliente.');
        return;
      }
      if (!newClientTelefone.trim()) {
        setCreateFormError('Informe o telefone / WhatsApp do novo cliente.');
        return;
      }

      const newClient: Client = {
        id: generateId(),
        nome: newClientNome.trim(),
        telefone: newClientTelefone.trim(),
        email: '',
        endereco: newClientEndereco.trim(),
        bairro: newClientBairro.trim() || undefined,
        cidade: newClientCidade.trim() || 'Passo Fundo',
        estado: 'RS',
        CEP: '',
        observacoes: 'Cadastrado direto pela aba de Ordens de Serviço',
        tags: ['OS Direta'],
        origem: newClientOrigem,
        created_at: nowStr,
        total_gasto: createStatus === 'concluido' ? createTotal : 0,
        total_pedidos: 1,
        ultimo_servico: nowStr,
      };

      updatedClients = [newClient, ...updatedClients];
      supabaseSaveClient(newClient);

      resolvedClientId = newClient.id;
      resolvedClientName = newClient.nome;
      resolvedClientPhone = newClient.telefone;
      resolvedClientAddress = createEndereco.trim() || newClient.endereco;
      resolvedClientOrigem = newClient.origem;
    } else {
      const existingClient = db.clients.find(c => c.id === selectedClientIdForCreate);
      if (!existingClient) {
        setCreateFormError('Selecione um cliente cadastrado ou clique em "Cadastrar Novo Cliente".');
        return;
      }
      resolvedClientId = existingClient.id;
      resolvedClientName = existingClient.nome;
      resolvedClientPhone = existingClient.telefone;
      resolvedClientAddress = createEndereco.trim() || existingClient.endereco || 'A definir';
      resolvedClientOrigem = existingClient.origem || 'WhatsApp';
    }

    if (createItems.length === 0 && createTotal <= 0) {
      setCreateFormError('Adicione pelo menos 1 serviço ou defina o valor da Ordem de Serviço.');
      return;
    }

    // Determine unique OS number
    let countOS = db.serviceOrders.length;
    let osNum = generateNumber('OS', countOS);
    while (db.serviceOrders.some(o => o.numero === osNum)) {
      countOS++;
      osNum = generateNumber('OS', countOS);
    }

    // Determine unique Quote number for synchronization
    let countQuote = db.quotes.length;
    let quoteNum = generateNumber('ORC', countQuote);
    while (db.quotes.some(q => q.numero === quoteNum)) {
      countQuote++;
      quoteNum = generateNumber('ORC', countQuote);
    }

    const osId = generateId();
    const quoteId = generateId();
    const assignedTech = createTecnico.trim() || 'Equipe Higipro 01';
    const isConcluded = createStatus === 'concluido';
    const paidVal = isConcluded 
      ? (parseFloat(String(createValorPago).replace(',', '.')) || createTotal) 
      : (parseFloat(String(createValorPago).replace(',', '.')) || 0);

    // 1. Create ServiceOrder
    const newOS: ServiceOrder = {
      id: osId,
      numero: osNum,
      quote_id: quoteId,
      quote_numero: quoteNum,
      client_id: resolvedClientId,
      client_name: resolvedClientName,
      client_phone: resolvedClientPhone,
      status: createStatus,
      total: createTotal,
      pago: paidVal,
      data_agendada: createDataAgendada || undefined,
      data_conclusao: isConcluded ? (createDataConclusao || nowStr) : undefined,
      tecnico: assignedTech,
      endereco: resolvedClientAddress,
      observacoes: createObservacoes.trim(),
      created_at: nowStr,
      items: createItems.map(item => ({
        id: item.id || generateId(),
        service_id: item.service_id || '',
        descricao: item.descricao,
        qtd: item.qtd,
        preco_unit: item.preco_unit,
        subtotal: item.subtotal,
        unidade: item.unidade || 'un',
        tamanho_largura: item.largura,
        tamanho_comprimento: item.comprimento,
        tamanho_m2: item.tamanho_m2 || (item.unidade === 'm²' ? item.qtd : undefined),
      })),
    };

    // 2. Synchronize with Quote & QuoteItems
    const newQuote: Quote = {
      id: quoteId,
      numero: quoteNum,
      client_id: resolvedClientId,
      client_name: resolvedClientName,
      status: isConcluded ? 'aprovado' : (createStatus === 'orcamento' ? 'rascunho' : 'aprovado'),
      subtotal: createSubtotal,
      desconto: discountAmount,
      total: createTotal,
      observacoes: createObservacoes.trim() ? `Criado direto pela OS ${osNum}. ${createObservacoes.trim()}` : `Criado direto pela OS ${osNum}.`,
      validade: nowStr,
      created_at: nowStr,
      os_id: osId,
      origem: resolvedClientOrigem,
      arquivado: isConcluded,
      arquivado_em: isConcluded ? nowStr : undefined,
      arquivado_motivo: isConcluded ? `OS ${osNum} concluída` : undefined,
      itens: newOS.items as any,
    };

    const newQuoteItems: QuoteItem[] = (newOS.items || []).map(item => ({
      id: generateId(),
      quote_id: quoteId,
      service_id: item.service_id || '',
      descricao: item.descricao,
      qtd: item.qtd,
      preco_unit: item.preco_unit,
      subtotal: item.subtotal,
      unidade: item.unidade || 'un',
      tamanho_largura: item.tamanho_largura,
      tamanho_comprimento: item.tamanho_comprimento,
      tamanho_m2: item.tamanho_m2,
    }));

    // 3. Synchronize with Appointment (Agenda)
    let updatedAppointments = [...db.appointments];
    if (createDataAgendada || createStatus === 'agendado' || createStatus === 'em_execucao') {
      const newAppt: Appointment = {
        id: generateId(),
        os_id: osId,
        client_id: resolvedClientId,
        client_name: resolvedClientName,
        servicos: createItems.map(i => i.descricao).join(', ') || `Serviço O.S. ${osNum}`,
        data_hora: createDataAgendada || `${nowStr}T09:00`,
        duracao: 120,
        status: isConcluded ? 'concluido' : 'agendado',
        tecnico: assignedTech,
        endereco: resolvedClientAddress,
        observacoes: createObservacoes.trim(),
        valor: createTotal,
      };
      updatedAppointments = [newAppt, ...updatedAppointments];
      supabaseSaveAppointment(newAppt);
    }

    // 4. Synchronize with Financial Transactions
    let updatedTransactions = [...db.transactions];
    let mappedCategory = 'higienização estofados';
    const descLower = createItems.map(i => i.descricao.toLowerCase()).join(' ') + ' ' + (createObservacoes || '').toLowerCase();
    if (descLower.includes('colchão') || descLower.includes('colchao')) {
      mappedCategory = 'higienização colchoes';
    } else if (descLower.includes('impermeabilização') || descLower.includes('impermeabilizacao')) {
      mappedCategory = 'impermeabilização';
    } else if (descLower.includes('tapete')) {
      mappedCategory = 'limpeza de tapetes';
    }

    if (isConcluded) {
      // Completed receipt
      const newTx: Transaction = {
        id: generateId(),
        tipo: 'receita',
        categoria: mappedCategory,
        descricao: `Recebimento O.S. ${osNum} - ${resolvedClientName}`,
        valor: paidVal > 0 ? paidVal : createTotal,
        data: createDataConclusao || nowStr,
        metodo_pagamento: createPaymentMethod,
        status: 'pago',
        os_id: osId,
        client_id: resolvedClientId,
        client_name: resolvedClientName,
        created_at: nowStr,
      };
      updatedTransactions = [newTx, ...updatedTransactions];
      supabaseSaveTransaction(newTx);
    } else if (createStatus === 'agendado' || createStatus === 'em_execucao') {
      // Accounts receivable entry
      const newTx: Transaction = {
        id: generateId(),
        tipo: 'receita',
        categoria: mappedCategory,
        descricao: `Serviço O.S. ${osNum} (${resolvedClientName})`,
        valor: createTotal,
        data: (createDataAgendada ? createDataAgendada.split('T')[0] : nowStr),
        metodo_pagamento: createPaymentMethod,
        status: 'pendente',
        os_id: osId,
        client_id: resolvedClientId,
        client_name: resolvedClientName,
        created_at: nowStr,
      };
      updatedTransactions = [newTx, ...updatedTransactions];
      supabaseSaveTransaction(newTx);
    }

    // 5. Synchronize with Recurrences (if concluded)
    let updatedRecurrences = [...db.recurrences];
    if (isConcluded) {
      const newRecs = createAnnualRecurrencesForOS(
        newOS,
        resolvedClientName,
        nowStr,
        updatedRecurrences
      );
      if (newRecs.length > 0) {
        updatedRecurrences = [...newRecs, ...updatedRecurrences];
      }

      // Update client stats
      if (createClientMode === 'existing') {
        updatedClients = updatedClients.map(c => {
          if (c.id === resolvedClientId) {
            return {
              ...c,
              ultimo_servico: nowStr,
              total_pedidos: (c.total_pedidos || 0) + 1,
              total_gasto: (c.total_gasto || 0) + (paidVal > 0 ? paidVal : createTotal),
            };
          }
          return c;
        });
      }
    }

    // Update state & persist
    const baseNewDb: DatabaseState = {
      ...db,
      clients: updatedClients,
      serviceOrders: [newOS, ...db.serviceOrders],
      quotes: [newQuote, ...db.quotes],
      quoteItems: [...newQuoteItems, ...db.quoteItems],
      appointments: updatedAppointments,
      transactions: updatedTransactions,
      recurrences: updatedRecurrences,
    };

    if (isConcluded) {
      const result = completeServiceAndSyncAll(baseNewDb, {
        source: 'os',
        id: newOS.id,
        valor: paidVal > 0 ? paidVal : createTotal,
        tecnico: newOS.tecnico,
        dataConclusao: newOS.data_conclusao,
        observacoes: newOS.observacoes,
      });
      onUpdateDb(result.updatedDb);
      const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
      setStatusToast(`OS ${newOS.numero} cadastrada como concluída! Receita${valStr} lançada no financeiro.`);
      setTimeout(() => setStatusToast(null), 5000);
      setIsCreateOpen(false);
      const freshlyConcluded = result.updatedDb.serviceOrders.find(o => o.id === newOS.id) || newOS;
      setSelectedOS(freshlyConcluded);
      setIsViewOpen(true);
      return;
    }

    onUpdateDb(baseNewDb);
    supabaseSaveServiceOrder(newOS);
    supabaseSaveQuote(newQuote);

    setIsCreateOpen(false);
    setSelectedOS(newOS);
    setIsViewOpen(true);
  };

  // Status Change Modal State
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedOSForStatus, setSelectedOSForStatus] = useState<ServiceOrder | null>(null);
  const [targetStatusToApply, setTargetStatusToApply] = useState<OSStatus>('agendado');
  const [statusModalTech, setStatusModalTech] = useState('');
  const [statusModalDate, setStatusModalDate] = useState('');
  const [statusModalAutoPay, setStatusModalAutoPay] = useState(true);

  // Delete OS Handler
  const handleDeleteOSConfirm = () => {
    if (!osToDelete) return;
    const updatedOrders = db.serviceOrders.filter(item => item.id !== osToDelete.id);
    const updatedPhotos = (db.osPhotos || []).filter(p => p.os_id !== osToDelete.id);
    onUpdateDb({
      ...db,
      serviceOrders: updatedOrders,
      osPhotos: updatedPhotos
    });
    if (selectedOS?.id === osToDelete.id) {
      setIsViewOpen(false);
      setSelectedOS(null);
    }
    setOsToDelete(null);
  };

  // Clear all OS handler
  const handleClearAllOSConfirm = () => {
    onUpdateDb({
      ...db,
      serviceOrders: [],
      osPhotos: []
    });
    setIsViewOpen(false);
    setSelectedOS(null);
    setIsClearAllModalOpen(false);
  };

  const [editForm, setEditForm] = useState<{
    clientId: string;
    clientName: string;
    clientPhone: string;
    tecnico: string;
    dataAgendada: string;
    dataConclusao: string;
    endereco: string;
    status: OSStatus;
    total: number;
    pago: number;
    observacoes: string;
  }>({
    clientId: '',
    clientName: '',
    clientPhone: '',
    tecnico: '',
    dataAgendada: '',
    dataConclusao: '',
    endereco: '',
    status: 'orcamento',
    total: 0,
    pago: 0,
    observacoes: '',
  });

  // Drag and drop handler for OS cards
  const handleMoveOS = (osId: string, targetStatus: OSStatus) => {
    const os = db.serviceOrders.find(item => item.id === osId);
    if (!os) return;

    if (os.status === targetStatus) return;

    // If moving to agendado, it needs a schedule/date.
    if (targetStatus === 'agendado' && !os.data_agendada) {
      handleOpenSchedule(os);
      return;
    }

    if (targetStatus === 'concluido') {
      const result = completeServiceAndSyncAll(db, {
        source: 'os',
        id: os.id,
        valor: os.total,
      });
      onUpdateDb(result.updatedDb);
      const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
      setStatusToast(`Ordem de Serviço ${os.numero} concluída com sucesso! Receita${valStr} lançada automaticamente no financeiro.`);
      setTimeout(() => setStatusToast(null), 5000);
      return;
    }

    const nowStr = new Date().toISOString().split('T')[0];
    const updatedOSList = db.serviceOrders.map(item => {
      if (item.id === os.id) {
        return {
          ...item,
          status: targetStatus,
          data_conclusao: item.data_conclusao,
          pago: item.pago
        };
      }
      return item;
    });

    // Synchronize linked appointments in Calendar
    const updatedAppointments = db.appointments.map(app => {
      if (app.os_id === os.id) {
        return {
          ...app,
          status: targetStatus === 'cancelado' ? ('cancelado' as const) :
                  targetStatus === 'agendado' ? ('agendado' as const) : app.status
        };
      }
      return app;
    });

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
      appointments: updatedAppointments,
    });
  };

  // Scheduling states inside sub-forms
  const [techName, setTechName] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [osNotes, setOsNotes] = useState('');

  // Payment update state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Pix' | 'Cartão' | 'Transferência' | 'Boleto'>('Pix');

  // Photo state
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoLabel, setPhotoLabel] = useState<'antes' | 'depois'>('antes');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, statusFilter, originFilter, selectedMonth, selectedYear]);

  // Pre-indexed client lookup map for O(1) performance
  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    (db?.clients || []).forEach(c => {
      if (c?.id) map.set(c.id, c);
    });
    return map;
  }, [db?.clients]);

  // Filter lists & sort newest first
  const filteredOS = useMemo(() => {
    const lowerSearch = (deferredSearchTerm || '').toLowerCase();
    const digitsSearch = (deferredSearchTerm || '').replace(/\D/g, '');

    return (db?.serviceOrders || []).filter(os => {
      if (!os) return false;
      const client = clientMap.get(os.client_id);
      const rawPhone = client?.telefone || os.client_phone || '';
      const clientPhone = String(rawPhone).replace(/\D/g, '');

      const matchesSearch = !deferredSearchTerm || (
        String(os.numero || '').toLowerCase().includes(lowerSearch) ||
        String(os.client_name || '').toLowerCase().includes(lowerSearch) ||
        (digitsSearch && clientPhone.includes(digitsSearch)) ||
        (os.observacoes && String(os.observacoes).toLowerCase().includes(lowerSearch))
      );
      
      const matchesStatus = statusFilter ? os.status === statusFilter : true;
      const matchesOrigin = originFilter ? (client?.origem === originFilter) : true;

      // Filter by Month and Year
      let matchesPeriod = true;
      const osDate = os.data_agendada || os.data_conclusao || os.created_at;
      if (osDate) {
        const { year, month } = parseDateComponents(osDate);
        if (selectedYear !== 'all' && year !== selectedYear) matchesPeriod = false;
        if (selectedMonth !== 'all' && month !== selectedMonth) matchesPeriod = false;
      } else if (selectedYear !== 'all' || selectedMonth !== 'all') {
        matchesPeriod = false;
      }

      return matchesSearch && matchesStatus && matchesOrigin && matchesPeriod;
    }).sort((a, b) => {
      const dateA = a?.created_at || a?.data_conclusao || a?.data_agendada || '';
      const dateB = b?.created_at || b?.data_conclusao || b?.data_agendada || '';
      return String(dateB).localeCompare(String(dateA));
    });
  }, [db?.serviceOrders, clientMap, deferredSearchTerm, statusFilter, originFilter, selectedMonth, selectedYear]);

  const totalPages = Math.max(1, Math.ceil(filteredOS.length / pageSize));
  const paginatedOS = filteredOS.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Open Scheduler Modal
  const handleOpenSchedule = (os: ServiceOrder) => {
    setSelectedOS(os);
    setTechName(os.tecnico && os.tecnico !== 'Não Definido' && os.tecnico !== 'A definir' ? os.tecnico : TECNICOS_HIGIPRO[0]);
    setScheduleDate(os.data_agendada || new Date().toISOString().substring(0, 16));
    setOsNotes(os.observacoes);
    setIsScheduleOpen(true);
  };

  // Save Schedule Booking Details
  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOS) return;

    // Update OS to "agendado" status
    const updatedOSList = db.serviceOrders.map(os => {
      if (os.id === selectedOS.id) {
        return {
          ...os,
          status: 'agendado' as const,
          tecnico: techName,
          data_agendada: scheduleDate,
          observacoes: osNotes,
        };
      }
      return os;
    });

    // Create an Appointment listing automatically to synchronize calendars
    const appointmentId = generateId();
    const newAppointment = {
      id: appointmentId,
      os_id: selectedOS.id,
      client_id: selectedOS.client_id,
      client_name: selectedOS.client_name,
      servicos: `Serviço O.S. ${selectedOS.numero}`,
      data_hora: scheduleDate,
      duracao: 120, // default 2 hours
      status: 'agendado' as const,
      tecnico: techName,
      endereco: selectedOS.endereco,
      observacoes: osNotes,
      valor: selectedOS.total,
    };

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
      appointments: [newAppointment, ...db.appointments]
    });

    setIsScheduleOpen(false);
    
    // Auto-update view if open
    const targetOS = updatedOSList.find(os => os.id === selectedOS.id);
    if (targetOS) setSelectedOS(targetOS);
    
    alert(`Ordem de serviço ${selectedOS.numero} foi agendada com sucesso com ${techName}!`);
  };

  // Quick Advance Status Flow
  const handleAdvanceStatus = (os: ServiceOrder) => {
    let nextStatus: OSStatus = 'orcamento';
    const nowStr = new Date().toISOString().split('T')[0];

    if (os.status === 'orcamento') {
      // Must be scheduled
      handleOpenSchedule(os);
      return;
    } else if (os.status === 'agendado') {
      nextStatus = 'em_execucao';
    } else if (os.status === 'em_execucao') {
      nextStatus = 'concluido';
      const result = completeServiceAndSyncAll(db, {
        source: 'os',
        id: os.id,
        valor: os.total,
      });
      onUpdateDb(result.updatedDb);
      const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
      setStatusToast(`OS ${os.numero} avançada para concluída! Receita${valStr} lançada no financeiro.`);
      setTimeout(() => setStatusToast(null), 5000);
      return;
    } else {
      return; // Already concluded or cancelled
    }

    const updatedOSList = db.serviceOrders.map(item => {
      if (item.id === os.id) {
        return {
          ...item,
          status: nextStatus,
        };
      }
      return item;
    });

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
    });

    // Sync modal view details
    const target = updatedOSList.find(item => item.id === os.id);
    if (target) setSelectedOS(target);
  };

  // Record Custom Partial Payment
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOS) return;
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) return;

    if (amount > (selectedOS.total - selectedOS.pago)) {
      alert('O valor do pagamento excede o saldo devedor restante.');
      return;
    }

    const nowIso = new Date().toISOString();
    const nowStr = nowIso.split('T')[0];
    const newPagoTotal = selectedOS.pago + amount;
    const isFullyPaid = newPagoTotal >= selectedOS.total;

    const updatedOSList = db.serviceOrders.map(item => {
      if (item.id === selectedOS.id) {
        return {
          ...item,
          pago: newPagoTotal,
          status: isFullyPaid && item.status === 'agendado' ? 'concluido' : item.status,
          updated_at: nowIso,
          version: (item.version || 1) + 1,
        };
      }
      return item;
    });

    // Add to cashflow or update existing pending transaction
    let updatedTransactions = [...db.transactions];
    const existingPendingIdx = updatedTransactions.findIndex(
      t => (t.os_id === selectedOS.id || (t.descricao && t.descricao.includes(selectedOS.numero))) && t.status === 'pendente'
    );

    if (existingPendingIdx >= 0) {
      if (isFullyPaid) {
        updatedTransactions[existingPendingIdx] = {
          ...updatedTransactions[existingPendingIdx],
          status: 'pago',
          valor: selectedOS.total,
          data: nowStr,
          metodo_pagamento: paymentMethod,
          descricao: `Pagamento OS ${selectedOS.numero} - ${selectedOS.client_name}`,
          updated_at: nowIso,
          version: (updatedTransactions[existingPendingIdx].version || 1) + 1,
        };
      } else {
        // Adjust pending remainder and record this payment
        const newTx: Transaction = {
          id: generateId(),
          tipo: 'receita',
          categoria: 'Higienização',
          descricao: `Pagamento Parcial OS ${selectedOS.numero} - ${selectedOS.client_name}`,
          valor: amount,
          data: nowStr,
          metodo_pagamento: paymentMethod,
          status: 'pago',
          os_id: selectedOS.id,
          client_id: selectedOS.client_id,
          client_name: selectedOS.client_name,
          created_at: nowIso,
          updated_at: nowIso,
          version: 1,
        };
        const remainingAfter = Math.max(0, selectedOS.total - newPagoTotal);
        updatedTransactions[existingPendingIdx] = {
          ...updatedTransactions[existingPendingIdx],
          valor: remainingAfter,
          updated_at: nowIso,
          version: (updatedTransactions[existingPendingIdx].version || 1) + 1,
        };
        updatedTransactions = [newTx, ...updatedTransactions];
      }
    } else {
      const newTransaction: Transaction = {
        id: generateId(),
        tipo: 'receita',
        categoria: 'Higienização',
        descricao: `Pagamento OS ${selectedOS.numero} - ${selectedOS.client_name}`,
        valor: amount,
        data: nowStr,
        metodo_pagamento: paymentMethod,
        status: 'pago',
        os_id: selectedOS.id,
        client_id: selectedOS.client_id,
        client_name: selectedOS.client_name,
        created_at: nowIso,
        updated_at: nowIso,
        version: 1,
      };
      updatedTransactions = [newTransaction, ...updatedTransactions];
    }

    let updatedRecurrences = [...db.recurrences];
    // If this OS is completed (concluido) and now fully paid, create annual recurrence!
    if (selectedOS.status === 'concluido' && isFullyPaid) {
      const newRecs = createAnnualRecurrencesForOS(
        selectedOS,
        selectedOS.client_name,
        nowStr,
        updatedRecurrences
      );
      if (newRecs.length > 0) {
        updatedRecurrences = [...newRecs, ...updatedRecurrences];
      }
    }

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
      transactions: updatedTransactions,
      recurrences: updatedRecurrences,
    });

    setPaymentAmount('');
    
    // Sync current modal state
    const target = updatedOSList.find(item => item.id === selectedOS.id);
    if (target) setSelectedOS(target);

    if (selectedOS.status === 'concluido' && isFullyPaid) {
      alert(`Pagamento de ${formatCurrency(amount)} registrado! Como a OS está concluída e quitada, as recorrências anuais foram criadas com sucesso.`);
    } else {
      alert(`Pagamento de ${formatCurrency(amount)} registrado com sucesso!`);
    }
  };

  // Send Post-Sale WhatsApp with Google Review Link
  const handleSendPosVendaWhatsApp = (os: ServiceOrder) => {
    const client = db.clients.find(c => c.id === os.client_id);
    const phone = client?.telefone || os.client_phone;
    const clean = cleanWhatsAppPhone(phone);
    if (!clean) {
      alert('Telefone do cliente inválido ou não informado.');
      return;
    }
    const googleLink = db.companySettings?.link_avaliacao_google || 'https://g.page/r/CRZ8Higipro/review';
    const clientName = (client?.nome || os.client_name || 'Cliente').split(' ')[0];
    const tech = os.tecnico || 'nosso técnico';
    const rawTemplate = db.companySettings?.mensagem_pos_venda || 
      'Olá {cliente}! Tudo bem? Como ficou o serviço na HigiPro? Se puder nos avaliar com 5 estrelas no Google: {link_google} ⭐ Obrigado!';

    const msg = rawTemplate
      .replace(/{cliente}/g, clientName)
      .replace(/{tecnico}/g, tech)
      .replace(/{link_google}/g, googleLink)
      .replace(/{empresa}/g, db.companySettings?.nome_fantasia || 'HigiPro');

    const nowStr = new Date().toISOString();
    const updatedOS: ServiceOrder = {
      ...os,
      pos_venda_enviado: true,
      pos_venda_enviado_em: nowStr
    };
    const updatedOSList = db.serviceOrders.map(item => item.id === os.id ? updatedOS : item);
    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList
    });
    supabaseSaveServiceOrder(updatedOS);
    if (selectedOS && selectedOS.id === os.id) {
      setSelectedOS(updatedOS);
    }
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Add Before/After Photo
  const handleAddPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOS || !photoUrl.trim()) return;

    const newPhoto: OSPhoto = {
      id: generateId(),
      os_id: selectedOS.id,
      url: photoUrl.trim(),
      label: photoLabel,
      created_at: new Date().toISOString().split('T')[0],
    };

    onUpdateDb({
      ...db,
      osPhotos: [newPhoto, ...db.osPhotos]
    });

    setPhotoUrl('');
    alert('Foto adicionada com sucesso!');
  };

  // Cancel OS
  const handleCancelOS = (os: ServiceOrder) => {
    if (!confirm(`Tem certeza que deseja CANCELAR a ordem de serviço ${os.numero}?`)) return;

    const updated = db.serviceOrders.map(item => {
      if (item.id === os.id) {
        return { ...item, status: 'cancelado' as const };
      }
      return item;
    });

    onUpdateDb({ ...db, serviceOrders: updated });
    
    const target = updated.find(item => item.id === os.id);
    if (target) setSelectedOS(target);
  };

  // Open Status Change Modal
  const handleOpenStatusModal = (os: ServiceOrder) => {
    setSelectedOSForStatus(os);
    setTargetStatusToApply(os.status);
    setStatusModalTech(os.tecnico && os.tecnico !== 'Não Definido' && os.tecnico !== 'A definir' ? os.tecnico : '');
    setStatusModalDate(os.data_agendada ? os.data_agendada.substring(0, 16) : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 16));
    setStatusModalAutoPay(true);
    setIsStatusModalOpen(true);
  };

  const getStatusLabel = (s: OSStatus): string => {
    switch (s) {
      case 'orcamento': return 'Orçamento Convertido';
      case 'agendado': return 'Agendado / Confirmado';
      case 'em_execucao': return 'Em Execução';
      case 'concluido': return 'Concluído';
      case 'cancelado': return 'Cancelado';
      default: return s;
    }
  };

  // Confirm Status Change
  const handleConfirmStatusChange = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedOSForStatus) return;

    const os = selectedOSForStatus;
    const targetStatus = targetStatusToApply;

    if (targetStatus === 'concluido') {
      const result = completeServiceAndSyncAll(db, {
        source: 'os',
        id: os.id,
        valor: os.total,
        tecnico: statusModalTech.trim() || os.tecnico,
      });
      onUpdateDb(result.updatedDb);
      setIsStatusModalOpen(false);
      setSelectedOSForStatus(null);
      if (selectedOS && selectedOS.id === os.id) {
        const freshlyConcluded = result.updatedDb.serviceOrders.find(o => o.id === os.id) || null;
        setSelectedOS(freshlyConcluded);
      }
      const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
      setStatusToast(`OS ${os.numero} concluída com sucesso! Receita${valStr} registrada no financeiro.`);
      setTimeout(() => setStatusToast(null), 5000);
      return;
    }

    const updatedOS: ServiceOrder = {
      ...os,
      status: targetStatus,
      tecnico: targetStatus === 'agendado' && statusModalTech.trim() ? statusModalTech.trim() : os.tecnico,
      data_agendada: targetStatus === 'agendado' && statusModalDate ? statusModalDate : os.data_agendada,
    };

    const updatedOSList = db.serviceOrders.map(item => item.id === os.id ? updatedOS : item);
    let updatedAppointments = [...db.appointments];

    // If set to agendado and has a date, sync or create appointment in calendar
    if (targetStatus === 'agendado' && statusModalDate) {
      const existingApp = updatedAppointments.find(a => a.os_id === os.id);
      if (existingApp) {
        updatedAppointments = updatedAppointments.map(a => a.os_id === os.id ? {
          ...a,
          data_hora: statusModalDate,
          tecnico: statusModalTech.trim() || a.tecnico,
          status: 'agendado' as const,
          valor: a.valor !== undefined ? a.valor : os.total,
        } : a);
      } else {
        const newApp = {
          id: generateId(),
          os_id: os.id,
          client_id: os.client_id,
          client_name: os.client_name,
          servicos: `Serviço O.S. ${os.numero}`,
          data_hora: statusModalDate,
          duracao: 120,
          status: 'agendado' as const,
          tecnico: statusModalTech.trim() || os.tecnico,
          endereco: os.endereco,
          observacoes: os.observacoes,
          valor: os.total,
        };
        updatedAppointments = [newApp, ...updatedAppointments];
      }
    }

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
      appointments: updatedAppointments,
    });

    supabaseSaveServiceOrder(updatedOS);

    if (selectedOS && selectedOS.id === os.id) {
      setSelectedOS(updatedOS);
    }

    setIsStatusModalOpen(false);
    setSelectedOSForStatus(null);
  };

  // Open Edit OS Modal
  const handleOpenEdit = (os: ServiceOrder) => {
    setEditingOS(os);
    setEditForm({
      clientId: os.client_id,
      clientName: os.client_name,
      clientPhone: os.client_phone || '',
      tecnico: os.tecnico && os.tecnico !== 'Não Definido' && os.tecnico !== 'A definir' ? os.tecnico : '',
      dataAgendada: os.data_agendada ? os.data_agendada.substring(0, 16) : '',
      dataConclusao: os.data_conclusao ? os.data_conclusao.substring(0, 10) : '',
      endereco: os.endereco || '',
      status: os.status,
      total: os.total,
      pago: os.pago,
      observacoes: os.observacoes || '',
    });
    setIsEditOpen(true);
  };

  // Handle client selection inside Edit form
  const handleClientSelect = (clientId: string) => {
    const client = db.clients.find(c => c.id === clientId);
    if (client) {
      const fullAddress = [
        client.endereco,
        client.bairro,
        client.cidade ? `${client.cidade}${client.estado ? ` - ${client.estado}` : ''}` : ''
      ].filter(Boolean).join(', ');

      setEditForm(prev => ({
        ...prev,
        clientId: client.id,
        clientName: client.nome,
        clientPhone: client.telefone || prev.clientPhone,
        endereco: fullAddress || prev.endereco,
      }));
    }
  };

  // Save changes to OS
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOS) return;

    const totalVal = Math.max(0, Number(editForm.total) || 0);
    const pagoVal = Math.max(0, Number(editForm.pago) || 0);
    const nowStr = new Date().toISOString().split('T')[0];

    const updatedOS: ServiceOrder = {
      ...editingOS,
      client_id: editForm.clientId || editingOS.client_id,
      client_name: editForm.clientName.trim() || editingOS.client_name,
      client_phone: editForm.clientPhone.trim(),
      tecnico: editForm.tecnico,
      data_agendada: editForm.dataAgendada ? editForm.dataAgendada : undefined,
      data_conclusao: editForm.status === 'concluido' 
        ? (editForm.dataConclusao || editingOS.data_conclusao || nowStr)
        : (editForm.dataConclusao || undefined),
      endereco: editForm.endereco.trim(),
      status: editForm.status,
      total: totalVal,
      pago: pagoVal,
      observacoes: editForm.observacoes,
    };

    const updatedOSList = db.serviceOrders.map(item => item.id === editingOS.id ? updatedOS : item);

    if (editForm.status === 'concluido') {
      const result = completeServiceAndSyncAll({
        ...db,
        serviceOrders: updatedOSList,
      }, {
        source: 'os',
        id: updatedOS.id,
        valor: totalVal,
        tecnico: updatedOS.tecnico,
        dataConclusao: updatedOS.data_conclusao,
        observacoes: updatedOS.observacoes,
      });
      onUpdateDb(result.updatedDb);
      setIsEditOpen(false);
      setEditingOS(null);
      if (selectedOS && selectedOS.id === updatedOS.id) {
        const freshlyConcluded = result.updatedDb.serviceOrders.find(o => o.id === updatedOS.id) || null;
        setSelectedOS(freshlyConcluded);
      }
      const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
      setStatusToast(`OS ${updatedOS.numero} salva como concluída! Receita${valStr} lançada no financeiro.`);
      setTimeout(() => setStatusToast(null), 5000);
      return;
    }

    // Synchronize linked appointments if technician, date, or address changed
    const updatedAppointments = db.appointments.map(app => {
      if (app.os_id === editingOS.id) {
        return {
          ...app,
          client_id: updatedOS.client_id,
          client_name: updatedOS.client_name,
          tecnico: updatedOS.tecnico,
          data_hora: updatedOS.data_agendada || app.data_hora,
          endereco: updatedOS.endereco,
          observacoes: updatedOS.observacoes,
        };
      }
      return app;
    });

    let updatedTransactions = [...db.transactions];
    let updatedRecurrences = [...db.recurrences];
    let updatedQuotes = [...db.quotes];

    // If new payment received during edit, record transaction
    if (pagoVal > editingOS.pago) {
      const diffPaid = pagoVal - editingOS.pago;
      const newTx: Transaction = {
        id: generateId(),
        tipo: 'receita',
        categoria: 'Higienização',
        descricao: `Recebimento Atualização OS ${editingOS.numero} - ${updatedOS.client_name}`,
        valor: diffPaid,
        data: nowStr,
        metodo_pagamento: 'Pix',
        status: 'pago',
        os_id: editingOS.id,
        client_id: updatedOS.client_id,
        client_name: updatedOS.client_name,
        created_at: nowStr,
      };
      updatedTransactions = [newTx, ...updatedTransactions];
      supabaseSaveTransaction(newTx);
    }

    // Automatically create annual recurrences if concluded and fully received/paid
    const isConcluded = updatedOS.status === 'concluido';
    const isPaidInFull = updatedOS.pago >= updatedOS.total && updatedOS.total > 0;
    let recurrenceCreated = false;

    if (isConcluded && isPaidInFull) {
      const newRecs = createAnnualRecurrencesForOS(
        updatedOS,
        updatedOS.client_name,
        nowStr,
        updatedRecurrences
      );
      if (newRecs.length > 0) {
        updatedRecurrences = [...newRecs, ...updatedRecurrences];
        recurrenceCreated = true;
      }
    }

    if (isConcluded) {
      // Automatically archive linked quote so it is cleared from Painel Inicial
      updatedQuotes = archiveQuotesForCompletedOS(updatedQuotes, updatedOS);
    }

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
      appointments: updatedAppointments,
      transactions: updatedTransactions,
      recurrences: updatedRecurrences,
      quotes: updatedQuotes,
    });

    // Supabase sync
    supabaseSaveServiceOrder(updatedOS);

    // Keep active viewing OS in sync if it's currently open
    if (selectedOS && selectedOS.id === editingOS.id) {
      setSelectedOS(updatedOS);
    }

    setIsEditOpen(false);
    setEditingOS(null);

    if (recurrenceCreated) {
      alert(`Ordem de serviço ${updatedOS.numero} atualizada com sucesso! Como o serviço foi concluído e o valor recebido, a recorrência anual de retorno foi gerada automaticamente.`);
    } else {
      alert(`Ordem de serviço ${updatedOS.numero} atualizada com sucesso!`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 font-display">Operacional - Ordens de Serviço (OS)</h1>
          <p className="text-sm text-slate-500">Acompanhe o fluxo de execução física de serviços, agende técnicos, adicione fotos e controle pagamentos.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleOpenCreateOS}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-bold transition shadow-xs cursor-pointer hover:shadow-md"
            title="Criar nova Ordem de Serviço diretamente nesta aba"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Ordem de Serviço</span>
          </button>
          {db.serviceOrders.length > 0 && (
            <button
              type="button"
              onClick={() => setIsClearAllModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer"
              title="Excluir todas as ordens de serviço cadastradas"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir Todas as O.S. ({db.serviceOrders.length})
            </button>
          )}
        </div>
      </div>

      {/* Concluded Toast / Notice */}
      {statusToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-semibold shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusToast}</span>
          </div>
          <button 
            type="button"
            onClick={() => setStatusToast(null)} 
            className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Toolbar - Barra de pesquisa ampliada e controles limpos */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3.5 items-center flex-wrap">
        <div className="relative flex-1 w-full min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500 sm:text-slate-400" />
          <input
            type="text"
            placeholder="Buscar OS por número (#OS), cliente, telefone, serviço ou técnico..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-12 py-3.5 text-base bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-500 transition shadow-xs text-slate-900 placeholder:text-slate-400 font-medium"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-auto pl-3.5 pr-8 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-500 transition cursor-pointer font-medium text-slate-700"
        >
          <option value="">Todos Status</option>
          <option value="orcamento">Orçamento Convertido</option>
          <option value="agendado">Agendado / Confirmado</option>
          <option value="em_execucao">Em Execução</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
        </select>

        <select
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value)}
          className="w-full sm:w-auto pl-3.5 pr-8 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-500 transition cursor-pointer font-medium text-slate-700"
        >
          <option value="">Todas Origens</option>
          {ORIGINS.map(org => (
            <option key={org} value={org}>{org}</option>
          ))}
        </select>

        {/* Quick Period Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto p-0.5 bg-slate-50 border border-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => { setSelectedMonth('all'); setSelectedYear('all'); }}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
              selectedMonth === 'all'
                ? 'bg-white text-blue-700 shadow-2xs border border-slate-200/80 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({periodCounts.all})
          </button>
          <button
            type="button"
            onClick={() => { setSelectedMonth(currentMonthNum); setSelectedYear(currentYearNum); }}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
              selectedMonth === currentMonthNum && selectedYear === currentYearNum
                ? 'bg-blue-600 text-white shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mês Atual: {currentMonthName} ({periodCounts.current})
          </button>
          <button
            type="button"
            onClick={() => { setSelectedMonth(8); setSelectedYear(currentYearNum); }}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
              selectedMonth === 8 && selectedYear === currentYearNum
                ? 'bg-blue-600 text-white shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Setembro ({periodCounts.september})
          </button>
        </div>

        {/* Month and Year Period Selector */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <PeriodFilter
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthChange={setSelectedMonth}
            onYearChange={setSelectedYear}
            availableYears={availableYears}
            showAllMonthsOption={true}
            showAllYearsOption={true}
            allMonthsLabel="Todos os Meses"
            allYearsLabel="Todos os Anos"
            compact={true}
          />
        </div>

        {/* View Mode Toggle Button Group */}
        <div className="flex border border-slate-150 rounded-xl overflow-hidden self-stretch sm:self-auto shrink-0 bg-slate-50 p-1 w-full sm:w-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'grid' 
                ? 'bg-white text-blue-600 shadow-xs border border-slate-100 font-black' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Grid
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'kanban' 
                ? 'bg-white text-blue-600 shadow-xs border border-slate-100 font-black' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Trello className="w-3.5 h-3.5" />
            Kanban
          </button>
        </div>
      </div>

      {/* OS Listings - Conditional View */}
      {viewMode === 'grid' ? (
        filteredOS.length > 0 ? (
          <>
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                Exibindo <strong>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                <strong>{Math.min(currentPage * pageSize, filteredOS.length)}</strong> de{' '}
                <strong>{filteredOS.length}</strong> ordens de serviço
              </span>
              {totalPages > 1 && (
                <span>Página {currentPage} de {totalPages}</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedOS.map(os => {
                const client = db.clients.find(c => c.id === os.client_id);
                const remaining = os.total - os.pago;
                return (
                  <div 
                    key={os.id}
                    className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs hover:border-slate-200 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Top */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-700">{os.numero}</span>
                          {client?.origem && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              client.origem === 'Google' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              client.origem === 'Meta Ads' || client.origem === 'Meta' || client.origem === 'Instagram' || client.origem === 'Facebook' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                              client.origem === 'Indicação' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              Origem: {client.origem}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenStatusModal(os)}
                          className="cursor-pointer hover:opacity-80 transition flex items-center gap-1"
                          title="Clique para alterar o status desta OS"
                        >
                          <StatusBadge type="os" status={os.status} />
                        </button>
                      </div>

                      <h3 className="font-bold text-slate-800 text-sm font-display mb-1 truncate">{os.client_name}</h3>
                      <p className="text-[11px] text-slate-400 font-mono mb-3 flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5" />
                        {formatPhone(os.client_phone)}
                      </p>

                      <div className="space-y-1.5 text-xs text-slate-500 border-t border-b border-slate-50 py-3 mb-4">
                        <p className="flex items-center gap-1.5 text-blue-900 bg-blue-50/70 px-2 py-1 rounded-lg border border-blue-100 font-semibold text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Feita em: <strong className="font-bold text-slate-900">{formatDate(os.created_at || os.data_conclusao || os.data_agendada)}</strong></span>
                        </p>
                        <p className="truncate flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          {os.endereco}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {os.data_agendada ? formatDateTime(os.data_agendada) : <span className="italic text-amber-500 font-medium">Aguardando agendamento</span>}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          Téc: <span className="font-medium text-slate-700">{os.tecnico}</span>
                        </p>
                      </div>

                      {/* Pricing Status summary */}
                      <div className="flex justify-between text-xs mb-4 p-2 bg-slate-50 rounded-xl">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Total</span>
                          <span className="font-bold text-slate-800">{formatCurrency(os.total)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Pago</span>
                          <span className="font-semibold text-emerald-600">{formatCurrency(os.pago)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Saldo</span>
                          <span className={`font-semibold ${remaining > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {remaining > 0 ? formatCurrency(remaining) : 'Quitado'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-2 justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedOS(os);
                            setIsViewOpen(true);
                          }}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 font-semibold cursor-pointer text-xs"
                        >
                          <Eye className="w-4 h-4 text-slate-400" />
                          Ficha
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenRecibo(os)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition cursor-pointer border border-emerald-200"
                          title="Emitir Recibo do Serviço Realizado"
                        >
                          <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Recibo</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Botão Alterar Status */}
                        <button
                          type="button"
                          onClick={() => handleOpenStatusModal(os)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs transition cursor-pointer border border-blue-200 shadow-2xs"
                          title="Alterar Status da Ordem de Serviço"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                          <span>Status</span>
                        </button>

                        {/* Botão Editar OS */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(os)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs transition cursor-pointer"
                          title="Editar Ordem de Serviço"
                        >
                          <Edit className="w-3.5 h-3.5 text-slate-500" />
                          <span>Editar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setOsToDelete(os)}
                          className="inline-flex items-center p-1.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-xs transition cursor-pointer"
                          title="Excluir Ordem de Serviço"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                    let pageNum = idx + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = Math.min(totalPages - 4, currentPage - 2) + idx;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<FileText className="w-10 h-10" />}
            title="Nenhuma ordem de serviço encontrada"
            description="Crie uma nova Ordem de Serviço diretamente aqui ou limpe os filtros para visualizar as existentes."
            actionText="Nova Ordem de Serviço"
            onAction={handleOpenCreateOS}
          />
        )
      ) : (
        /* Kanban View Block for OS */
        <div className="flex lg:grid lg:grid-cols-5 gap-4 overflow-x-auto pb-4 select-none snap-x">
          {[
            { id: 'orcamento' as OSStatus, label: 'Orçamento Convertido', bg: 'bg-slate-50 border-slate-150', dot: 'bg-slate-400' },
            { id: 'agendado' as OSStatus, label: 'Agendado / Confirmado', bg: 'bg-blue-50/40 border-blue-100/60', dot: 'bg-blue-500' },
            { id: 'em_execucao' as OSStatus, label: 'Em Execução', bg: 'bg-indigo-50/30 border-indigo-100/50', dot: 'bg-indigo-500' },
            { id: 'concluido' as OSStatus, label: 'Concluído', bg: 'bg-blue-50/30 border-blue-100/50', dot: 'bg-blue-600' },
            { id: 'cancelado' as OSStatus, label: 'Cancelado', bg: 'bg-rose-50/30 border-rose-100/50', dot: 'bg-rose-500' }
          ].map(col => {
            const osInCol = filteredOS.filter(item => item.status === col.id);
            const displayedInCol = osInCol.slice(0, 35);
            return (
              <div 
                key={col.id} 
                className={`flex flex-col w-[280px] sm:w-[320px] lg:w-auto shrink-0 lg:shrink rounded-2xl border ${col.bg} p-4 min-h-[500px] transition duration-200 snap-center`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('text');
                  if (id) handleMoveOS(id, col.id);
                }}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3.5 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">{col.label}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-200/50 text-[10px] font-black rounded-full text-slate-600">
                    {osInCol.length}
                  </span>
                </div>

                {osInCol.length > 35 && (
                  <div className="text-[10px] text-slate-400 italic mb-2">
                    Mostrando 35 mais recentes de {osInCol.length}
                  </div>
                )}

                {/* Cards Container */}
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[700px]">
                  {displayedInCol.length > 0 ? (
                    displayedInCol.map(os => {
                      const client = db.clients.find(c => c.id === os.client_id);
                      const remaining = os.total - os.pago;
                      return (
                        <div
                          key={os.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text', os.id)}
                          className="bg-white border border-slate-150 hover:border-blue-600/50 hover:shadow-lg hover:shadow-blue-600/5 rounded-xl p-4 transition-all duration-200 cursor-grab active:cursor-grabbing group relative"
                        >
                          {/* Number & Actions */}
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono font-bold text-slate-500">{os.numero}</span>
                              {client?.origem && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                  client.origem === 'Google' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  client.origem === 'Meta Ads' || client.origem === 'Meta' || client.origem === 'Instagram' || client.origem === 'Facebook' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                  client.origem === 'Indicação' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                  {client.origem}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition duration-150">
                              <button
                                type="button"
                                onClick={() => handleOpenStatusModal(os)}
                                className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer transition"
                                title="Alterar Status da OS"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(os)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg cursor-pointer transition"
                                title="Editar Ordem de Serviço"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setOsToDelete(os)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                                title="Excluir Ordem de Serviço"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenRecibo(os)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition"
                                title="Emitir Recibo do Serviço"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedOS(os);
                                  setIsViewOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer transition"
                                title="Ficha da OS"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Client name */}
                          <h4 className="font-bold text-slate-800 text-sm leading-snug mb-1 truncate">
                            {os.client_name}
                          </h4>

                          {/* Address & Tech */}
                          <div className="space-y-1 mt-2 mb-3 text-[11px] text-slate-500">
                            <p className="truncate flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                              {os.endereco}
                            </p>
                            <p className="flex items-center gap-1 font-medium">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{os.tecnico}</span>
                            </p>
                            {os.data_agendada && (
                              <p className="flex items-center gap-1 text-[10px] text-indigo-600 font-semibold bg-indigo-50/50 p-1 rounded-md">
                                <Calendar className="w-3 h-3 shrink-0" />
                                <span>{os.data_agendada.substring(8, 10)}/{os.data_agendada.substring(5, 7)} às {os.data_agendada.substring(11, 16)}</span>
                              </p>
                            )}
                          </div>

                          {/* Value & Balance */}
                          <div className="flex justify-between items-center mt-3 border-t border-slate-50 pt-2 text-xs">
                            <span className="font-black text-slate-800">
                              {formatCurrency(os.total)}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${remaining > 0 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                              {remaining > 0 ? `Falta ${formatCurrency(remaining)}` : 'Quitada'}
                            </span>
                          </div>

                          {/* Kanban Card Action Bar */}
                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(os)}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                              title="Editar Ordem de Serviço"
                            >
                              <Edit className="w-3.5 h-3.5 text-slate-500" />
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenStatusModal(os)}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                              title="Alterar Status da OS"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                              <span>Status</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100/60 rounded-2xl p-4 text-center">
                      <p className="text-[10px] font-medium text-slate-400/80 italic leading-snug">
                        Arrastar OS aqui
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: View Details and Photos of OS */}
      <Modal
        isOpen={isViewOpen && selectedOS !== null}
        onClose={() => setIsViewOpen(false)}
        title={`Detalhamento Operacional da OS ${selectedOS?.numero}`}
        size="lg"
      >
        {selectedOS && (
          <div className="space-y-6 text-sm">
            
            {/* Status & Flow details banner */}
            {(() => {
              const selectedClient = db.clients.find(c => c.id === selectedOS.client_id);
              return (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-400 font-medium font-mono">{selectedOS.numero}</p>
                    <p className="text-base font-bold text-slate-800 font-display">{selectedOS.client_name}</p>
                    <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500 font-mono">{formatPhone(selectedOS.client_phone)}</span>
                      {selectedClient?.origem && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          selectedClient.origem === 'Google' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          selectedClient.origem === 'Meta Ads' || selectedClient.origem === 'Meta' || selectedClient.origem === 'Instagram' || selectedClient.origem === 'Facebook' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                          selectedClient.origem === 'Indicação' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          Origem: {selectedClient.origem}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleOpenStatusModal(selectedOS)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Alterar Status desta Ordem de Serviço"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                      Alterar Status
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(selectedOS)}
                      className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      title="Editar dados desta Ordem de Serviço"
                    >
                      <Edit className="w-3.5 h-3.5 text-slate-500" />
                      Editar OS
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenRecibo(selectedOS)}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-emerald-200"
                      title="Emitir Recibo do Serviço"
                    >
                      <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                      Recibo
                    </button>
                    <button
                      type="button"
                      onClick={() => setOsToDelete(selectedOS)}
                      className="px-3 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      title="Excluir esta Ordem de Serviço"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenStatusModal(selectedOS)}
                      className="cursor-pointer hover:opacity-85 transition"
                      title="Clique para alterar o status desta OS"
                    >
                      <StatusBadge type="os" status={selectedOS.status} />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Linked Quote Banner & O Que Foi Feito */}
            {(() => {
              const linkedQuote = selectedOS.quote_id 
                ? db.quotes.find(q => q.id === selectedOS.quote_id) 
                : db.quotes.find(q => q.client_id === selectedOS.client_id || (selectedOS.client_name && q.client_name && q.client_name.toLowerCase().trim() === selectedOS.client_name.toLowerCase().trim()));
              const quoteItems = linkedQuote && db.quoteItems.filter(item => item.quote_id === linkedQuote.id).length > 0
                ? db.quoteItems.filter(item => item.quote_id === linkedQuote.id) 
                : (selectedOS.items && Array.isArray(selectedOS.items) && selectedOS.items.length > 0)
                  ? selectedOS.items
                  : [];
              const linkedApp = db.appointments.find(a => a.os_id === selectedOS.id);

              return (
                <div className="space-y-4">
                  {/* Linked Quote Banner */}
                  {linkedQuote && (
                    <div className="p-3.5 bg-blue-50 border border-blue-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-blue-900">
                            Orçamento de Origem: #{linkedQuote.numero}
                          </p>
                          <p className="text-[11px] text-blue-700">
                            Proposta comercial vinculada • Total: <strong className="font-extrabold">{formatCurrency(linkedQuote.total)}</strong>
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedQuoteForOS(linkedQuote)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Abrir Orçamento Completo
                      </button>
                    </div>
                  )}

                  {/* Recibo de Serviço Banner */}
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-900">
                          Recibo Oficial do Serviço Realizado
                        </p>
                        <p className="text-[11px] text-emerald-700">
                          Emita o comprovante de prestação de serviço com declaração de quitação pronto para print no celular ou envio no WhatsApp.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenRecibo(selectedOS)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Emitir Recibo do Serviço
                    </button>
                  </div>

                  {/* Pós-Venda Automático & Avaliação Google Banner */}
                  {selectedOS.status === 'concluido' && (
                    <div className="p-3.5 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
                          <Star className="w-5 h-5 fill-slate-950" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-amber-950">
                              Pós-Venda & Avaliação no Google Meu Negócio
                            </p>
                            {selectedOS.pos_venda_avaliacao ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-bold flex items-center gap-1">
                                <Star className="w-3 h-3 text-amber-600 fill-amber-500" />
                                {selectedOS.pos_venda_avaliacao}.0 Estrelas
                              </span>
                            ) : selectedOS.pos_venda_enviado ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                                Enviado em {formatDate(selectedOS.pos_venda_enviado_em)}
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 font-bold">
                                Pendente
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-amber-900/80 mt-0.5">
                            {selectedOS.pos_venda_feedback 
                              ? `Feedback do cliente: "${selectedOS.pos_venda_feedback}"`
                              : 'Envie a mensagem de satisfação pelo WhatsApp com o link direto da ficha do Google para receber 5 estrelas.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSendPosVendaWhatsApp(selectedOS)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{selectedOS.pos_venda_enviado ? 'Reenviar WhatsApp' : 'Enviar WhatsApp c/ Link Google'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Section: O Que Foi Feito */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-blue-600" />
                        <span>O Que Foi Feito (Serviços e Itens Realizados)</span>
                      </h4>
                      {linkedQuote && (
                        <span className="text-[11px] text-slate-400">
                          Itens da proposta #{linkedQuote.numero}
                        </span>
                      )}
                    </div>

                    {quoteItems.length > 0 ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                              <th className="py-2.5 px-3">Item / Serviço Realizado</th>
                              <th className="py-2.5 px-3 text-center">Qtd</th>
                              <th className="py-2.5 px-3 text-right">Preço Unit.</th>
                              <th className="py-2.5 px-3 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {quoteItems.map(item => (
                              <tr key={item.id} className="hover:bg-slate-50/60 transition">
                                <td className="py-2.5 px-3 font-semibold text-slate-800">
                                  {item.descricao}
                                </td>
                                <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                                  {item.qtd} {item.unidade || 'un'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                  {formatCurrency(item.preco_unit)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                  {formatCurrency(item.subtotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                              <td colSpan={3} className="py-2.5 px-3 text-right uppercase text-[11px]">Total da O.S.:</td>
                              <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-600 text-sm">
                                {formatCurrency(selectedOS.total)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : linkedApp?.servicos ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Serviço Cadastrado na Agenda:
                        </p>
                        <p className="text-sm font-bold text-slate-800">{linkedApp.servicos}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })()}

            {/* Main Info Blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Informações de Agenda e Rotas</h4>
                <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100/50">
                  <p className="text-xs flex items-center gap-2 text-slate-600">
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    Técnico: <span className="font-semibold text-slate-800">{selectedOS.tecnico}</span>
                  </p>
                  <p className="text-xs flex items-center gap-2 text-slate-600">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    Data Agendada: <span className="font-semibold text-slate-800">{selectedOS.data_agendada ? formatDateTime(selectedOS.data_agendada) : 'Não agendada'}</span>
                  </p>
                  <p className="text-xs flex items-start gap-2 text-slate-600 leading-normal">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    Endereço: <span className="font-medium text-slate-800">{selectedOS.endereco}</span>
                  </p>
                </div>
                {selectedOS.status !== 'concluido' && selectedOS.status !== 'cancelado' && (
                  <button
                    onClick={() => handleOpenSchedule(selectedOS)}
                    className="w-full py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs rounded-lg transition"
                  >
                    Remarcar Data / Alterar Técnico
                  </button>
                )}
              </div>

              {/* Payments Ledger Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Controle Financeiro de Recebimentos</h4>
                <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Valor Total Fechado:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(selectedOS.total)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Valor Pago até agora:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(selectedOS.pago)}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-slate-200/50 pt-2 font-semibold">
                    <span className="text-slate-600">Saldo Restante Devedor:</span>
                    <span className="text-amber-600">{formatCurrency(selectedOS.total - selectedOS.pago)}</span>
                  </div>
                </div>

                {/* Small form to launch payment */}
                {selectedOS.total > selectedOS.pago && selectedOS.status !== 'cancelado' && (
                  <form onSubmit={handleRecordPayment} className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Valor Pago"
                      className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-600"
                    />
                    <select
                      value={paymentMethod}
                      onChange={(e: any) => setPaymentMethod(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-xs"
                    >
                      <option value="Pix">Pix</option>
                      <option value="Cartão">Cartão</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Transferência">Transf.</option>
                    </select>
                    <button
                      type="submit"
                      className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition"
                    >
                      Lançar
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Photos Section */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-slate-400" />
                Relatório Fotográfico (Antes & Depois)
              </h4>

              {/* Upload input photo (URL based) */}
              {selectedOS.status !== 'cancelado' && (
                <form onSubmit={handleAddPhoto} className="flex flex-col sm:flex-row gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <input
                    type="url"
                    required
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="Cole a URL da imagem (Ex: Unsplash, Imgur...)"
                    className="flex-1 px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs"
                  />
                  <div className="flex gap-2">
                    <select
                      value={photoLabel}
                      onChange={(e: any) => setPhotoLabel(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 bg-white rounded-lg text-xs"
                    >
                      <option value="antes">Antes do Serviço</option>
                      <option value="depois">Depois do Serviço</option>
                    </select>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition shrink-0"
                    >
                      Gravar Foto
                    </button>
                  </div>
                </form>
              )}

              {/* Photos Gallery View */}
              {db.osPhotos.filter(p => p.os_id === selectedOS.id).length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {db.osPhotos
                    .filter(p => p.os_id === selectedOS.id)
                    .map(photo => (
                      <div key={photo.id} className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50 relative group">
                        <img 
                          src={photo.url} 
                          alt={photo.label}
                          className="w-full h-32 object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-900/60 p-2 text-white flex justify-between items-center text-[10px]">
                          <span className="uppercase font-bold tracking-wide">{photo.label}</span>
                          <span>{formatDate(photo.created_at)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center p-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 italic">
                  Nenhuma fotografia anexada a este atendimento ainda.
                </div>
              )}
            </div>

            {/* Observations */}
            {selectedOS.observacoes && (
              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notas Técnicas</h4>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 leading-relaxed">
                  {selectedOS.observacoes}
                </div>
              </div>
            )}

            {/* Actions: Concluir ou Cancelar */}
            {selectedOS.status !== 'cancelado' && selectedOS.status !== 'concluido' && (
              <div className="border-t border-slate-100 pt-4 flex flex-wrap justify-between items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const result = completeServiceAndSyncAll(db, {
                      source: 'os',
                      id: selectedOS.id,
                      valor: selectedOS.total,
                      tecnico: selectedOS.tecnico,
                      observacoes: selectedOS.observacoes,
                    });
                    onUpdateDb(result.updatedDb);
                    const freshlyConcluded = result.updatedDb.serviceOrders.find(o => o.id === selectedOS.id) || null;
                    setSelectedOS(freshlyConcluded);
                    const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
                    setStatusToast(`OS ${selectedOS.numero} concluída com sucesso! Receita${valStr} lançada no financeiro.`);
                    setTimeout(() => setStatusToast(null), 5000);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-100" />
                  <span>Concluir Atendimento (Lança no Financeiro)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelOS(selectedOS)}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs rounded-lg transition cursor-pointer"
                >
                  Cancelar Ordem de Serviço
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Update Schedule Booking and Tech */}
      <Modal
        isOpen={isScheduleOpen && selectedOS !== null}
        onClose={() => setIsScheduleOpen(false)}
        title="Agendamento e Escala de Técnico"
      >
        {selectedOS && (
          <form onSubmit={handleSaveSchedule} className="space-y-4 text-sm">
            <p className="text-xs text-slate-500 leading-normal">
              Defina os parâmetros operacionais abaixo para a Ordem de Serviço <span className="font-bold">{selectedOS.numero}</span>. Isso gerará um agendamento correspondente na agenda e calendários semanais:
            </p>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Técnico / Profissional Responsável *</label>
              <select
                required
                value={techName}
                onChange={(e) => setTechName(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer font-medium"
              >
                {TECNICOS_HIGIPRO.map((tec) => (
                  <option key={tec} value={tec}>{tec}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Data e Hora do Atendimento *</label>
              <input
                type="datetime-local"
                required
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Notas e Instruções do Serviço</label>
              <textarea
                value={osNotes}
                onChange={(e) => setOsNotes(e.target.value)}
                placeholder="Ex: Cliente solicita ligar 30min antes de chegar. Entregar sapatilhas descartáveis."
                rows={3}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl transition shadow-xs cursor-pointer"
              >
                Salvar Agendamento
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit OS Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingOS(null);
        }}
        title={`Editar Ordem de Serviço ${editingOS?.numero || ''}`}
        size="lg"
      >
        {editingOS && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {/* Quick alert helper */}
            <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-800">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Ao atualizar a OS para o status <strong>Concluído</strong> e com o valor total <strong>recebido</strong>, a recorrência anual (12 meses) de retorno será gerada automaticamente na aba de Recorrências.
              </span>
            </div>

            {/* Client selection and contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cliente Vinculado</label>
                <select
                  value={editForm.clientId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                >
                  <option value="">Selecione um cliente cadastrado...</option>
                  {db.clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nome} {c.telefone ? `(${c.telefone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do Cliente na OS</label>
                <input
                  type="text"
                  required
                  value={editForm.clientName}
                  onChange={(e) => setEditForm(prev => ({ ...prev, clientName: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={editForm.clientPhone}
                  onChange={(e) => setEditForm(prev => ({ ...prev, clientPhone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Técnico Responsável</label>
                <input
                  type="text"
                  list="os-edit-tech-list"
                  value={editForm.tecnico}
                  onChange={(e) => setEditForm(prev => ({ ...prev, tecnico: e.target.value }))}
                  placeholder="Digite o nome do técnico responsável..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
                <datalist id="os-edit-tech-list">
                  {TECNICOS_HIGIPRO.map((tec) => (
                    <option key={tec} value={tec} />
                  ))}
                </datalist>
                <p className="text-[10px] text-slate-400 mt-0.5">Campo livre para digitar (ou deixe em branco se a definir).</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Endereço do Local de Atendimento</label>
              <input
                type="text"
                value={editForm.endereco}
                onChange={(e) => setEditForm(prev => ({ ...prev, endereco: e.target.value }))}
                placeholder="Rua, número, complemento, bairro, cidade"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Dates and Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Status da OS</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as OSStatus }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white font-medium"
                >
                  <option value="orcamento">Orçamento Convertido (Pendente)</option>
                  <option value="agendado">Agendado / Confirmado</option>
                  <option value="em_execucao">Em Execução</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Data / Hora Agendada</label>
                <input
                  type="datetime-local"
                  value={editForm.dataAgendada}
                  onChange={(e) => setEditForm(prev => ({ ...prev, dataAgendada: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Data de Conclusão</label>
                <input
                  type="date"
                  value={editForm.dataConclusao}
                  onChange={(e) => setEditForm(prev => ({ ...prev, dataConclusao: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            {/* Financial values */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor Total (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editForm.total}
                  onChange={(e) => setEditForm(prev => ({ ...prev, total: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor Pago (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.pago}
                  onChange={(e) => setEditForm(prev => ({ ...prev, pago: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-600 mb-1">Saldo Devedor</span>
                <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold">
                  {Math.max(0, editForm.total - editForm.pago) > 0 ? (
                    <span className="text-amber-600">{formatCurrency(Math.max(0, editForm.total - editForm.pago))}</span>
                  ) : (
                    <span className="text-emerald-600">Quitado (100%)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Observations */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Observações e Detalhes dos Serviços</label>
              <textarea
                value={editForm.observacoes}
                onChange={(e) => setEditForm(prev => ({ ...prev, observacoes: e.target.value }))}
                placeholder="Detalhes dos itens a serem higienizados/impermeabilizados, orientações especiais..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsEditOpen(false);
                  setEditingOS(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Quick Change OS Status */}
      <Modal
        isOpen={isStatusModalOpen && selectedOSForStatus !== null}
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedOSForStatus(null);
        }}
        title={`Alterar Status — O.S. ${selectedOSForStatus?.numero}`}
        size="md"
      >
        {selectedOSForStatus && (
          <form onSubmit={handleConfirmStatusChange} className="space-y-4">
            {/* Header info */}
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Cliente</span>
                <p className="text-xs font-bold text-slate-800 truncate max-w-[200px] sm:max-w-xs">{selectedOSForStatus.client_name}</p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">Total: {formatCurrency(selectedOSForStatus.total)}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1 tracking-wider">Status Atual</span>
                <StatusBadge type="os" status={selectedOSForStatus.status} />
              </div>
            </div>

            {/* Status Options */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Selecione o novo status da Ordem de Serviço:
              </label>

              <div className="space-y-2">
                {[
                  {
                    id: 'orcamento' as OSStatus,
                    label: 'Orçamento Convertido',
                    desc: 'Aguardando agendamento com o cliente ou alocação de técnico.',
                    icon: Clock,
                  },
                  {
                    id: 'agendado' as OSStatus,
                    label: 'Agendado / Confirmado',
                    desc: 'Data e horário definidos na agenda com técnico responsável.',
                    icon: Calendar,
                  },
                  {
                    id: 'em_execucao' as OSStatus,
                    label: 'Em Execução',
                    desc: 'Técnico em trânsito ou no local realizando a higienização.',
                    icon: Play,
                  },
                  {
                    id: 'concluido' as OSStatus,
                    label: 'Concluído',
                    desc: 'Serviço finalizado com sucesso. Permite quitar e gerar recorrência anual.',
                    icon: CheckCircle,
                  },
                  {
                    id: 'cancelado' as OSStatus,
                    label: 'Cancelado',
                    desc: 'Atendimento cancelado ou suspenso.',
                    icon: XCircle,
                  },
                ].map(opt => {
                  const isSelected = targetStatusToApply === opt.id;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTargetStatusToApply(opt.id)}
                      className={`w-full p-3 rounded-xl border text-left transition flex items-start justify-between cursor-pointer ${
                        isSelected 
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-600/20' 
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">{opt.label}</span>
                            {selectedOSForStatus.status === opt.id && (
                              <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                Atual
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.desc}</p>
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-1 transition ${
                        isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Extra inputs if agendado */}
            {targetStatusToApply === 'agendado' && (
              <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl space-y-3">
                <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  Detalhes do Agendamento
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Data e Hora do Atendimento *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={statusModalDate}
                      onChange={(e) => setStatusModalDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Técnico Responsável
                    </label>
                    <input
                      type="text"
                      list="status-modal-tech-suggestions"
                      value={statusModalTech}
                      onChange={(e) => setStatusModalTech(e.target.value)}
                      placeholder="Digite o técnico..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-medium"
                    />
                    <datalist id="status-modal-tech-suggestions">
                      {TECNICOS_HIGIPRO.map((tec) => (
                        <option key={tec} value={tec} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>
            )}

            {/* Extra options if concluido */}
            {targetStatusToApply === 'concluido' && (
              <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-2">
                <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  Conclusão e Recebimento
                </p>
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={statusModalAutoPay}
                    onChange={(e) => setStatusModalAutoPay(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    <strong>Quitar valor total ({formatCurrency(selectedOSForStatus.total)})</strong> e registrar recebimento no Financeiro se houver saldo pendente.
                  </span>
                </label>
                <p className="text-[11px] text-emerald-700/90 pl-5 leading-relaxed">
                  Ao concluir, o sistema também programará automaticamente o alerta de <strong>Recorrência Anual de 12 meses</strong> para higienização/impermeabilização.
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsStatusModalOpen(false);
                  setSelectedOSForStatus(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Salvar Novo Status
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: View Linked Quote */}
      <Modal
        isOpen={selectedQuoteForOS !== null}
        onClose={() => setSelectedQuoteForOS(null)}
        title={`Orçamento ${selectedQuoteForOS?.numero}`}
        size="xl"
      >
        {selectedQuoteForOS && (
          <OrcamentoDocument
            quote={selectedQuoteForOS}
            db={db}
            items={selectedQuoteForOS.itens}
          />
        )}
      </Modal>

      {/* Modal: Confirm Single OS Deletion */}
      <Modal
        isOpen={osToDelete !== null}
        onClose={() => setOsToDelete(null)}
        title="Excluir Ordem de Serviço"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Tem certeza de que deseja excluir a ordem de serviço <strong className="font-mono text-slate-800">{osToDelete?.numero}</strong> do cliente <strong>{osToDelete?.client_name}</strong>?
          </p>
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 p-3 rounded-xl">
            A exclusão removerá esta ordem de serviço e fotos associadas. Esta ação não poderá ser desfeita.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOsToDelete(null)}
              className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDeleteOSConfirm}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Confirmar Exclusão
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Criar Nova Ordem de Serviço Direta */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Criar Nova Ordem de Serviço (OS)"
        size="xl"
      >
        <div className="space-y-6 text-sm">
          {/* Top Banner / Auto-sequence info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-blue-50/80 border border-blue-100 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-900">
                  Abertura Direta de Ordem de Serviço
                </p>
                <p className="text-[11px] text-blue-700">
                  Preencha os dados abaixo. O número sequencial da O.S., agenda do técnico e fluxo financeiro serão sincronizados automaticamente.
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto text-xs font-mono font-bold px-3 py-1 bg-white text-blue-700 border border-blue-200 rounded-xl shadow-2xs">
              Nova O.S.
            </span>
          </div>

          {/* Form Error Banner */}
          {createFormError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{createFormError}</span>
            </div>
          )}

          {/* SECTION 1: CLIENTE */}
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600" />
                <span>1. Dados do Cliente</span>
              </label>

              {/* Toggle: Existing vs New */}
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => {
                    setCreateClientMode('existing');
                    setCreateFormError(null);
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    createClientMode === 'existing'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cliente Cadastrado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateClientMode('new');
                    setSelectedClientIdForCreate('');
                    setCreateFormError(null);
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    createClientMode === 'new'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-3 h-3" />
                  <span>+ Novo Cliente</span>
                </button>
              </div>
            </div>

            {createClientMode === 'existing' ? (
              <div className="space-y-2">
                {selectedClientIdForCreate ? (
                  // Selected client card
                  (() => {
                    const selClient = db.clients.find(c => c.id === selectedClientIdForCreate);
                    if (!selClient) return null;
                    return (
                      <div className="p-3 bg-white border border-blue-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-800">{selClient.nome}</span>
                            {selClient.origem && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                                {selClient.origem}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {formatPhone(selClient.telefone)}
                            {selClient.endereco && ` • ${selClient.endereco}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedClientIdForCreate('')}
                          className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition cursor-pointer border border-blue-200"
                        >
                          Trocar Cliente
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  // Search autocomplete
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar cliente por nome, telefone ou endereço..."
                        value={createClientSearch}
                        onChange={e => setCreateClientSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-2xs">
                      {filteredClientsForCreate.length > 0 ? (
                        filteredClientsForCreate.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectExistingClient(c)}
                            className="w-full p-2.5 text-left hover:bg-blue-50/60 transition flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{c.nome || 'Cliente sem nome'}</p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {formatPhone(c.telefone)} {c.endereco ? `• ${c.endereco}` : ''}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md shrink-0">
                              {c.origem || 'WhatsApp'}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-400">
                          Nenhum cliente encontrado. Digite outro termo ou clique em "+ Novo Cliente".
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // New client form fields
              <div className="space-y-3 bg-white p-3.5 border border-slate-200 rounded-xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Nome do Cliente <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Maria Silveira"
                      value={newClientNome}
                      onChange={e => setNewClientNome(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Telefone / WhatsApp <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="(54) 99999-0000"
                      value={newClientTelefone}
                      onChange={e => setNewClientTelefone(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Endereço (Rua e Número)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Rua Morom, 1200 - Apto 301"
                      value={newClientEndereco}
                      onChange={e => {
                        setNewClientEndereco(e.target.value);
                        setCreateEndereco(e.target.value);
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Bairro
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Centro"
                      value={newClientBairro}
                      onChange={e => setNewClientBairro(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Canal de Origem
                    </label>
                    <select
                      value={newClientOrigem}
                      onChange={e => setNewClientOrigem(e.target.value as ClientOrigin)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 cursor-pointer"
                    >
                      {ORIGINS.map(org => (
                        <option key={org} value={org}>{org}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: SERVIÇOS E ITENS */}
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>2. Serviços & Valores da O.S.</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {createItems.length} {createItems.length === 1 ? 'item adicionado' : 'itens adicionados'}
              </span>
            </div>

            {/* Quick Add from Catalog */}
            <div className="bg-white p-3 border border-slate-200 rounded-xl space-y-2">
              <p className="text-[11px] font-bold text-slate-600">
                Adicionar do Catálogo Comercial:
              </p>
              <div className="flex gap-2">
                <select
                  value={selectedCatalogServiceId}
                  onChange={e => {
                    const id = e.target.value;
                    setSelectedCatalogServiceId(id);
                    const s = db.services.find(item => item.id === id);
                    if (s && (s.unidade === 'm²' || s.tipo_estofado === 'Tapete' || s.categoria === 'Tapete' || s.nome.toLowerCase().includes('tapete'))) {
                      if (s.tamanho_largura) setCatalogTapeteLargura(s.tamanho_largura.toString());
                      if (s.tamanho_comprimento) setCatalogTapeteComprimento(s.tamanho_comprimento.toString());
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 cursor-pointer"
                >
                  <option value="">Selecione um serviço do catálogo...</option>
                  {db.services.filter(s => s.ativo).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nome} — {formatCurrency(s.preco)}{s.unidade === 'm²' ? '/m²' : ''} ({s.categoria})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddCatalogItem}
                  disabled={!selectedCatalogServiceId}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition cursor-pointer shrink-0 shadow-xs"
                >
                  + Adicionar
                </button>
              </div>

              {/* Tapete Dimension Calculator when rug service is chosen */}
              {(() => {
                const s = db.services.find(item => item.id === selectedCatalogServiceId);
                const isTapete = s && (
                  s.unidade === 'm²' || 
                  s.tipo_estofado === 'Tapete' || 
                  s.categoria === 'Tapete' || 
                  s.nome.toLowerCase().includes('tapete')
                );
                if (!isTapete) return null;

                const l = parseFloat(catalogTapeteLargura.replace(',', '.')) || 2.0;
                const c = parseFloat(catalogTapeteComprimento.replace(',', '.')) || 2.5;
                const area = parseFloat((l * c).toFixed(2));
                const estPrice = area * s.preco;

                return (
                  <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-xl space-y-2 mt-2">
                    <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                      <span className="flex items-center gap-1.5">
                        <Ruler className="w-3.5 h-3.5 text-blue-600" />
                        Medidas do Tapete (Metragem em m²)
                      </span>
                      <span className="text-[11px] font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                        {area.toFixed(2)} m²
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Largura (metros)</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          placeholder="Ex: 2.00"
                          value={catalogTapeteLargura}
                          onChange={e => setCatalogTapeteLargura(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Comprimento (metros)</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          placeholder="Ex: 2.50"
                          value={catalogTapeteComprimento}
                          onChange={e => setCatalogTapeteComprimento(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-bold text-slate-800"
                        />
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-blue-200 text-right">
                        <span className="text-[10px] text-slate-400 block font-medium">Subtotal Estimado ({formatCurrency(s.preco)}/m²)</span>
                        <span className="text-xs font-black font-mono text-blue-900">
                          {formatCurrency(estPrice)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Quick Custom Item */}
            <div className="bg-white p-3 border border-slate-200 rounded-xl space-y-2">
              <p className="text-[11px] font-bold text-slate-600">
                Ou digitar Item / Serviço Personalizado:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="text"
                  placeholder="Descrição do serviço (ex: Higienização Tapete Sala ou Sofá)"
                  value={customItemDesc}
                  onChange={e => {
                    const desc = e.target.value;
                    setCustomItemDesc(desc);
                    if (desc.toLowerCase().includes('tapete') && customItemUnidade !== 'm²') {
                      setCustomItemUnidade('m²');
                    }
                  }}
                  className="sm:col-span-6 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <div className="sm:col-span-2 flex items-center gap-1">
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    placeholder="Qtd"
                    value={customItemQtd}
                    onChange={e => setCustomItemQtd(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-bold"
                  />
                  <select
                    value={customItemUnidade}
                    onChange={e => setCustomItemUnidade(e.target.value as 'un' | 'm²')}
                    className="px-1.5 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg cursor-pointer font-bold"
                  >
                    <option value="un">un</option>
                    <option value="m²">m²</option>
                  </select>
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Valor Unit. (R$)"
                  value={customItemPreco}
                  onChange={e => setCustomItemPreco(e.target.value)}
                  className="sm:col-span-2 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-bold"
                />
                <button
                  type="button"
                  onClick={handleAddCustomItem}
                  className="sm:col-span-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  + Inserir
                </button>
              </div>

              {/* Dimensions input for custom m² or tapete */}
              {(customItemUnidade === 'm²' || customItemDesc.toLowerCase().includes('tapete')) && (
                <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg mt-2 space-y-1.5">
                  <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1">
                    <Ruler className="w-3 h-3 text-blue-600" />
                    Medidas do Tapete Personalizado:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Largura (m)</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={customTapeteLargura}
                        onChange={e => {
                          const l = e.target.value;
                          setCustomTapeteLargura(l);
                          const lNum = parseFloat(l.replace(',', '.')) || 0;
                          const cNum = parseFloat(customTapeteComprimento.replace(',', '.')) || 0;
                          if (lNum > 0 && cNum > 0) {
                            setCustomItemQtd((lNum * cNum).toFixed(2));
                          }
                        }}
                        className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Comprimento (m)</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={customTapeteComprimento}
                        onChange={e => {
                          const c = e.target.value;
                          setCustomTapeteComprimento(c);
                          const lNum = parseFloat(customTapeteLargura.replace(',', '.')) || 0;
                          const cNum = parseFloat(c.replace(',', '.')) || 0;
                          if (lNum > 0 && cNum > 0) {
                            setCustomItemQtd((lNum * cNum).toFixed(2));
                          }
                        }}
                        className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-xs font-bold"
                      />
                    </div>
                    <div className="col-span-2 bg-white px-2.5 py-1 rounded border border-blue-200 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Área calculada:</span>
                      <span className="font-mono font-black text-blue-800 text-xs">
                        {((parseFloat(customTapeteLargura.replace(',', '.')) || 0) * (parseFloat(customTapeteComprimento.replace(',', '.')) || 0)).toFixed(2)} m²
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Items Table */}
            {createItems.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Item / Serviço</th>
                      <th className="py-2.5 px-3 text-center w-28">Qtd / Área</th>
                      <th className="py-2.5 px-3 text-right w-28">Preço Unit.</th>
                      <th className="py-2.5 px-3 text-right w-28">Subtotal</th>
                      <th className="py-2.5 px-2 text-center w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {createItems.map(item => {
                      const isTapeteItem = item.unidade === 'm²' || (item.descricao && item.descricao.toLowerCase().includes('tapete'));

                      return (
                        <React.Fragment key={item.id}>
                          <tr className="hover:bg-slate-50/50 transition">
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{item.descricao}</span>
                                  {isTapeteItem && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                      Tapete m²
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQtd(item.id, Math.max(0, item.qtd - 1))}
                                  className="px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200 cursor-pointer font-bold"
                                >
                                  -
                                </button>
                                <span className="px-2 text-xs font-bold text-slate-800">
                                  {item.qtd} {item.unidade === 'm²' ? 'm²' : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQtd(item.id, item.qtd + 1)}
                                  className="px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200 cursor-pointer font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              <input
                                type="number"
                                step="0.01"
                                value={item.preco_unit}
                                onChange={e => handleUpdateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                                className="w-20 px-1 py-0.5 text-right font-mono text-xs border border-slate-200 rounded bg-slate-50 focus:bg-white font-bold"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(item.subtotal)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {isTapeteItem && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleItemDimensions(item.id)}
                                    className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${
                                      item.showDimensions
                                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                                        : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                    title="Ajustar medidas de largura e comprimento (m²)"
                                  >
                                    <Ruler className="w-3.5 h-3.5 text-blue-600" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCreateItem(item.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer rounded-lg hover:bg-rose-50"
                                  title="Remover item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Dimensions Drawer Row */}
                          {item.showDimensions && (
                            <tr className="bg-blue-50/50 border-b border-blue-100">
                              <td colSpan={5} className="p-3">
                                <div className="p-2.5 bg-white border border-blue-200 rounded-xl space-y-2">
                                  <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                                    <span className="flex items-center gap-1.5">
                                      <Ruler className="w-3.5 h-3.5 text-blue-600" />
                                      Ajustar Medidas do Tapete (Largura × Comprimento)
                                    </span>
                                    <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                                      {item.qtd} m² × {formatCurrency(item.preco_unit)} = {formatCurrency(item.subtotal)}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                                    <div>
                                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                        Largura (metros)
                                      </label>
                                      <input
                                        type="number"
                                        step="0.05"
                                        min="0.1"
                                        placeholder="Ex: 2.00"
                                        value={item.largura || ''}
                                        onChange={e => handleUpdateItemDimensions(item.id, parseFloat(e.target.value) || 0, item.comprimento || 0)}
                                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-bold text-slate-800"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                        Comprimento (metros)
                                      </label>
                                      <input
                                        type="number"
                                        step="0.05"
                                        min="0.1"
                                        placeholder="Ex: 2.50"
                                        value={item.comprimento || ''}
                                        onChange={e => handleUpdateItemDimensions(item.id, item.largura || 0, parseFloat(e.target.value) || 0)}
                                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-bold text-slate-800"
                                      />
                                    </div>

                                    <div className="bg-blue-50/70 p-2 rounded-lg border border-blue-200 flex flex-col justify-center text-right">
                                      <span className="text-[10px] text-slate-500 font-medium">Metragem Calculada</span>
                                      <span className="text-xs font-black text-blue-900 font-mono">
                                        {item.largura && item.comprimento
                                          ? `${item.largura.toFixed(2)}m × ${item.comprimento.toFixed(2)}m = ${(item.largura * item.comprimento).toFixed(2)} m²`
                                          : `${item.qtd} m²`}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50/70 border-t border-slate-200">
                      <td colSpan={3} className="py-2 px-3 text-right font-bold text-slate-600 text-xs">
                        Subtotal dos Serviços:
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800 text-xs">
                        {formatCurrency(createSubtotal)}
                      </td>
                      <td></td>
                    </tr>
                    <tr className="bg-slate-50/70 border-t border-slate-100">
                      <td colSpan={3} className="py-2 px-3 text-right font-semibold text-slate-500 text-xs">
                        Desconto / Bônus (R$):
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={createDesconto}
                          onChange={e => setCreateDesconto(e.target.value)}
                          className="w-24 px-1 py-0.5 text-right font-mono text-xs border border-slate-200 rounded bg-white text-rose-600 font-bold"
                          placeholder="0,00"
                        />
                      </td>
                      <td></td>
                    </tr>
                    <tr className="bg-emerald-50/80 border-t-2 border-emerald-300">
                      <td colSpan={3} className="py-2.5 px-3 text-right font-extrabold text-emerald-950 uppercase text-xs">
                        Valor Total da O.S.:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700 text-base">
                        {formatCurrency(createTotal)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-white border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                Nenhum serviço adicionado ainda. Adicione acima pelo catálogo ou digite manualmente.
              </div>
            )}
          </div>

          {/* SECTION 3: AGENDAMENTO E OPERAÇÃO */}
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3.5">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>3. Planejamento Operacional & Agenda</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3.5 border border-slate-200 rounded-xl">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Status Inicial da O.S.
                </label>
                <select
                  value={createStatus}
                  onChange={e => {
                    const st = e.target.value as OSStatus;
                    setCreateStatus(st);
                    if (st === 'concluido' && (!createValorPago || parseFloat(createValorPago) === 0)) {
                      setCreateValorPago(String(createTotal));
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 cursor-pointer font-bold"
                >
                  <option value="agendado">📅 Agendado (Adicionar à Agenda)</option>
                  <option value="em_execucao">⚡ Em Execução (Técnico em campo)</option>
                  <option value="concluido">✅ Concluído (Já Realizado e Quitado)</option>
                  <option value="orcamento">📄 Orçamento Aprovado</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Data e Horário do Agendamento
                </label>
                <input
                  type="datetime-local"
                  value={createDataAgendada}
                  onChange={e => setCreateDataAgendada(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Técnico / Equipe Responsável
                </label>
                <select
                  value={createTecnico}
                  onChange={e => setCreateTecnico(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 cursor-pointer"
                >
                  {TECNICOS_HIGIPRO.map(tech => (
                    <option key={tech} value={tech}>{tech}</option>
                  ))}
                  <option value="Outro Técnico">Outro Técnico...</option>
                </select>
              </div>

              {createStatus === 'concluido' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Data da Conclusão
                  </label>
                  <input
                    type="date"
                    value={createDataConclusao}
                    onChange={e => setCreateDataConclusao(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Endereço de Execução do Serviço
                </label>
                <input
                  type="text"
                  placeholder="Endereço onde será executado o serviço"
                  value={createEndereco}
                  onChange={e => setCreateEndereco(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Observações Técnicas / Detalhes dos Estofados
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Sofá retrátil tecido linho cru, mancha de café no assento esquerdo. Cliente possui cachorro."
                  value={createObservacoes}
                  onChange={e => setCreateObservacoes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: PAGAMENTO E SINCRONIZAÇÃO */}
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3.5">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>4. Financeiro & Sincronização</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3.5 border border-slate-200 rounded-xl">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={createPaymentMethod}
                  onChange={e => setCreatePaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 cursor-pointer"
                >
                  <option value="Pix">Pix (Chave HigiPro)</option>
                  <option value="Cartão">Cartão (Débito / Crédito)</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Transferência">Transferência Bancária</option>
                  <option value="Boleto">Boleto Bancário</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Valor Pago / Entrada Recebida (R$)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={createValorPago}
                    onChange={e => setCreateValorPago(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setCreateValorPago(String(createTotal))}
                    className="px-2.5 py-2 text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition cursor-pointer shrink-0"
                    title="Definir valor total como pago"
                  >
                    Total
                  </button>
                </div>
              </div>
            </div>

            {/* Synchronization Banner */}
            <div className="p-3 bg-blue-50/70 border border-blue-200/70 rounded-xl text-xs text-blue-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-blue-950">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Sincronização Automática em Tempo Real:
              </p>
              <ul className="text-[11px] text-blue-800 list-disc list-inside space-y-0.5">
                <li>A O.S. será agendada na <strong>Agenda de Visitas</strong> do técnico selecionado.</li>
                <li>O lançamento financeiro será gerado em <strong>Contas a Receber / Receitas</strong> no Controle Financeiro.</li>
                <li>Caso concluída, programará a <strong>Recorrência Anual</strong> e atualizará a ficha do cliente.</li>
                <li>O <strong>Recibo Oficial</strong> com quitação e o <strong>Pós-Venda Google</strong> ficarão disponíveis instantaneamente.</li>
              </ul>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveCreateOS}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-2 shadow-xs hover:shadow-md"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Criar e Sincronizar O.S.</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Confirm Clear All OS */}
      <Modal
        isOpen={isClearAllModalOpen}
        onClose={() => setIsClearAllModalOpen(false)}
        title="Excluir Todas as Ordens de Serviço"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Tem certeza de que deseja excluir <strong>todas as {db.serviceOrders.length} ordens de serviço</strong> cadastradas?
          </p>
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl font-medium">
            Atenção: Todas as ordens de serviço operacionais e suas fotos serão permanentemente removidas. Os cadastros de clientes, serviços e orçamentos permanecerão intactos.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsClearAllModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleClearAllOSConfirm}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir Todas as O.S.
            </button>
          </div>
        </div>
      </Modal>

      {/* Recibo de Serviço Modal / Fullscreen */}
      {isReciboOpen && selectedOSForRecibo && (
        <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-md overflow-y-auto p-2 sm:p-6 pb-16 flex flex-col items-center select-none animate-fade-in">
          <ReciboDocument
            os={selectedOSForRecibo}
            db={db}
            onClose={() => {
              setIsReciboOpen(false);
              setSelectedOSForRecibo(null);
            }}
          />
        </div>
      )}
    </div>
  );
});
