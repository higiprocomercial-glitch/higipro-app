/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Plus, Calendar, Smartphone, MessageSquare, Check, Filter, 
  Search, RefreshCw, Clock, History, AlertTriangle, ChevronRight, CheckSquare,
  User, Edit, Edit3, MapPin, Mail, Sparkles, Trash2, BellRing, CheckCircle2,
  Sliders, ShieldCheck, Sparkle, Star
} from 'lucide-react';
import { DatabaseState, Recurrence, RecurrenceLog, Client, ClientOrigin } from '../types';
import { formatPhone, formatDate, addMonths, cleanWhatsAppPhone, parseDateComponents, monthName } from '../lib/utils';
import { Modal, EmptyState, ConfirmDialog } from './UIComponents';
import { PeriodFilter } from './PeriodFilter';
import { generateId, ORIGINS } from '../lib/database';
import { supabaseSaveRecurrence } from '../lib/supabase';
import { FollowUpOrcamentos } from './FollowUpOrcamentos';
import { PosVendaGoogle } from './PosVendaGoogle';

interface RecorrenciaProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
  onNavigateToQuote?: (quoteId: string) => void;
  onNavigateToConfig?: () => void;
  initialTab?: 'followup' | 'pos_venda' | 'leads' | 'logs';
}

export const Recorrencia = React.memo<RecorrenciaProps>(({ 
  db, 
  onUpdateDb, 
  onNavigateToQuote,
  onNavigateToConfig,
  initialTab 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'followup' | 'pos_venda' | 'leads' | 'logs'>(initialTab || 'followup');

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Auto-migrate any existing higienização recurrence with 6 months to 12 months (1 ano)
  React.useEffect(() => {
    let hasChanges = false;
    const updated = db.recurrences.map(r => {
      const isHig = (r.servico_origem?.toLowerCase().includes('higien') || r.service_name?.toLowerCase().includes('higien'));
      if (isHig && (r.intervalo_meses === 6 || r.intervalo === 6)) {
        hasChanges = true;
        const lastDate = (r.ultimo_servico_at || r.data_inicio || new Date().toISOString()).split('T')[0];
        const next12m = addMonths(lastDate, 12);
        return {
          ...r,
          intervalo_meses: 12,
          intervalo: 12,
          frequencia: 'anual' as const,
          proxima_data: next12m,
          proxima_data_sugerida: next12m,
        };
      }
      return r;
    });

    if (hasChanges) {
      onUpdateDb({
        ...db,
        recurrences: updated
      });
    }
  }, [db.recurrences]);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [selectedRecurrence, setSelectedRecurrence] = useState<Recurrence | null>(null);

  // Deletion modals state
  const [recurrenceToDelete, setRecurrenceToDelete] = useState<Recurrence | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<RecurrenceLog | null>(null);
  const [isDeleteLogDialogOpen, setIsDeleteLogDialogOpen] = useState(false);

  // Client Card & Edit Modal
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({
    nome: '',
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    estado: 'RS',
    CEP: '',
    origem: 'Google' as ClientOrigin,
    observacoes: '',
  });

  const handleOpenClientCard = (client: Client) => {
    setEditingClient(client);
    setClientForm({
      nome: client.nome || '',
      telefone: client.telefone || '',
      email: client.email || '',
      endereco: client.endereco || '',
      cidade: client.cidade || 'Passo Fundo',
      estado: client.estado || 'RS',
      CEP: client.CEP || '',
      origem: client.origem || 'Outros',
      observacoes: client.observacoes || '',
    });
    setIsClientModalOpen(true);
  };

  const handleSaveClientForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    if (!clientForm.nome.trim()) {
      alert('Por favor, informe o nome do cliente.');
      return;
    }

    const updatedClient: Client = {
      ...editingClient,
      nome: clientForm.nome.trim(),
      telefone: clientForm.telefone.trim(),
      email: clientForm.email.trim(),
      endereco: clientForm.endereco.trim(),
      cidade: clientForm.cidade.trim(),
      estado: clientForm.estado.trim(),
      CEP: clientForm.CEP.trim(),
      origem: clientForm.origem,
      observacoes: clientForm.observacoes.trim(),
    };

    const updatedClients = db.clients.map(c => c.id === editingClient.id ? updatedClient : c);
    onUpdateDb({
      ...db,
      clients: updatedClients,
    });

    setIsClientModalOpen(false);
    setEditingClient(null);
  };

  // Recurrence Edit Modal state (Make recurrence cards editable)
  const [isEditRecurrenceModalOpen, setIsEditRecurrenceModalOpen] = useState(false);
  const [editingRecurrence, setEditingRecurrence] = useState<Recurrence | null>(null);
  const [editRecurrenceForm, setEditRecurrenceForm] = useState({
    client_id: '',
    client_name: '',
    client_phone: '',
    servico_origem: 'Higienização',
    intervalo_meses: '12',
    ultimo_servico_at: '',
    proxima_data_sugerida: '',
    ativo: true,
    observacoes: '',
  });

  const handleOpenEditRecurrence = (rec: Recurrence) => {
    setEditingRecurrence(rec);
    const client = db.clients.find(c => c.id === rec.client_id);
    const lastDate = (rec.ultimo_servico_at || rec.data_inicio || new Date().toISOString()).split('T')[0];
    const isHig = (rec.servico_origem?.toLowerCase().includes('higien') || rec.service_name?.toLowerCase().includes('higien'));
    const safeInterval = isHig ? 12 : (rec.intervalo_meses || rec.intervalo || 12);
    const nextDate = (rec.proxima_data_sugerida || rec.proxima_data || addMonths(lastDate, safeInterval)).split('T')[0];

    setEditRecurrenceForm({
      client_id: rec.client_id,
      client_name: client?.nome || rec.client_name || '',
      client_phone: client?.telefone || '',
      servico_origem: rec.servico_origem || rec.service_name || 'Higienização',
      intervalo_meses: String(safeInterval),
      ultimo_servico_at: lastDate,
      proxima_data_sugerida: nextDate,
      ativo: rec.ativo !== false,
      observacoes: rec.observacoes || '',
    });
    setIsEditRecurrenceModalOpen(true);
  };

  const handleSaveEditRecurrence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecurrence) return;

    const intervalNum = parseInt(editRecurrenceForm.intervalo_meses) || 12;
    const nextDate = editRecurrenceForm.proxima_data_sugerida || addMonths(editRecurrenceForm.ultimo_servico_at, intervalNum);

    const updatedRecurrence: Recurrence = {
      ...editingRecurrence,
      client_id: editRecurrenceForm.client_id,
      client_name: editRecurrenceForm.client_name.trim() || editingRecurrence.client_name,
      servico_origem: editRecurrenceForm.servico_origem,
      service_name: editRecurrenceForm.servico_origem,
      intervalo_meses: intervalNum,
      intervalo: intervalNum,
      ultimo_servico_at: editRecurrenceForm.ultimo_servico_at,
      proxima_data_sugerida: nextDate,
      proxima_data: nextDate,
      ativo: editRecurrenceForm.ativo,
      observacoes: editRecurrenceForm.observacoes.trim(),
    };

    // Also update client if user changed the name or phone
    let updatedClients = [...db.clients];
    if (editRecurrenceForm.client_id) {
      updatedClients = db.clients.map(c => {
        if (c.id === editRecurrenceForm.client_id) {
          return {
            ...c,
            nome: editRecurrenceForm.client_name.trim() || c.nome,
            telefone: editRecurrenceForm.client_phone.trim() || c.telefone,
          };
        }
        return c;
      });
    }

    const updatedRecurrences = db.recurrences.map(r => r.id === editingRecurrence.id ? updatedRecurrence : r);

    onUpdateDb({
      ...db,
      recurrences: updatedRecurrences,
      clients: updatedClients,
    });

    supabaseSaveRecurrence(updatedRecurrence);
    setIsEditRecurrenceModalOpen(false);
    setEditingRecurrence(null);
  };

  // Form states
  const [clientId, setClientId] = useState('');
  const [servico, setServico] = useState<'Higienização' | 'Impermeabilização'>('Higienização');
  const [intervalo, setIntervalo] = useState('12'); // 1 ano (12 meses)
  const [ultimoServico, setUltimoServico] = useState(new Date().toISOString().split('T')[0]);

  // Log contact form
  const [logNotes, setLogNotes] = useState('');
  const [logResultado, setLogResultado] = useState<'sucesso' | 'sem_retorno' | 'recusado'>('sucesso');

  // Month and Year selection for Recorrência (Mês corrente por padrão)
  const now = new Date();
  const currentMonthNum = now.getMonth();
  const currentYearNum = now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);

  // Available years dynamically discovered from recurrences
  const availableYears = React.useMemo(() => {
    const years = new Set<number>([currentYearNum, currentYearNum - 1, currentYearNum + 1]);
    (db?.recurrences || []).forEach(r => {
      const d = r.proxima_data_sugerida || r.proxima_data || r.ultimo_servico_at || r.data_inicio || r.created_at;
      if (d) {
        const y = parseDateComponents(d).year;
        if (!isNaN(y) && y > 2000) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [db?.recurrences, currentYearNum]);

  // Active leads filter (Filtered strictly by selected month and year, defaults strictly to current month)
  const activeRecurrences = (db?.recurrences || []).filter(r => {
    if (!r) return false;

    // Date filter: only selected month and year (Mês corrente por padrão)
    const recDateStr = r.proxima_data_sugerida || r.proxima_data || r.ultimo_servico_at || r.data_inicio || r.created_at;
    if (recDateStr) {
      const { year, month } = parseDateComponents(recDateStr);
      if (year !== selectedYear) return false;
      if (month !== selectedMonth) return false;
    } else {
      return false;
    }

    const client = (db?.clients || []).find(c => c.id === r.client_id);
    const clientName = client?.nome || r.client_name || '';
    const term = (searchTerm || '').toLowerCase();
    const matchesSearch = !term || String(clientName).toLowerCase().includes(term);
    return matchesSearch;
  });

  // Calculate alerts for follow-up (quotes sent with >= 1 day without response, current month)
  const todayDateOnly = now.toISOString().split('T')[0];
  const followUpAlertCount = db.quotes.filter(q => {
    if (q.status !== 'enviado' || q.arquivado) return false;
    const sentDateStr = q.enviado_em || q.created_at;
    if (!sentDateStr) return false;
    const { year, month } = parseDateComponents(sentDateStr);
    if (year !== currentYearNum || month !== currentMonthNum) return false;
    const sentDate = new Date(sentDateStr);
    const diffDays = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
    const sentDateOnly = (sentDateStr || '').split('T')[0];
    return diffDays >= 1 || (todayDateOnly > sentDateOnly);
  }).length;

  // Calculate alerts for Google Post-Sale (concluded OS with >= delayDays without post-sale sent, current month)
  const delayDays = db.companySettings?.dias_pos_venda || 2;
  const posVendaAlertCount = db.serviceOrders.filter(os => {
    if (os.status !== 'concluido' || os.pos_venda_enviado) return false;
    const dateStr = os.data_conclusao || (os.data_agendada ? os.data_agendada.split(/[ T]/)[0] : os.created_at?.split(/[ T]/)[0]);
    if (!dateStr) return false;
    const { year, month } = parseDateComponents(dateStr);
    if (year !== currentYearNum || month !== currentMonthNum) return false;
    const compDate = new Date(dateStr);
    const diffDays = Math.floor(Math.abs(now.getTime() - compDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= delayDays;
  }).length;

  // Open Create Recurrence
  const handleOpenCreate = () => {
    setSelectedRecurrence(null);
    setClientId(db.clients[0]?.id || '');
    setServico('Higienização');
    setIntervalo('12');
    setUltimoServico(new Date().toISOString().split('T')[0]);
    setIsFormOpen(true);
  };

  // Save Recurrence
  const handleSaveRecurrence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    const intervalNum = parseInt(intervalo) || 12;
    const proximaData = addMonths(ultimoServico, intervalNum);

    const newRecurrence: Recurrence = {
      id: generateId(),
      client_id: clientId,
      servico_origem: servico,
      ultimo_servico_at: ultimoServico,
      intervalo_meses: intervalNum,
      proxima_data_sugerida: proximaData,
      ativo: true,
    };

    onUpdateDb({
      ...db,
      recurrences: [newRecurrence, ...db.recurrences]
    });

    setIsFormOpen(false);
  };

  // Open Delete Recurrence Dialog
  const handleOpenDelete = (recurrence: Recurrence) => {
    setRecurrenceToDelete(recurrence);
    setIsDeleteDialogOpen(true);
  };

  // Confirm Delete Recurrence
  const handleConfirmDelete = () => {
    if (!recurrenceToDelete) return;
    const updatedRecurrences = db.recurrences.filter(r => r.id !== recurrenceToDelete.id);
    onUpdateDb({
      ...db,
      recurrences: updatedRecurrences,
    });
    setRecurrenceToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  // Open Delete Log Dialog
  const handleOpenDeleteLog = (log: RecurrenceLog) => {
    setLogToDelete(log);
    setIsDeleteLogDialogOpen(true);
  };

  // Confirm Delete Log
  const handleConfirmDeleteLog = () => {
    if (!logToDelete) return;
    const updatedLogs = db.recurrenceLogs.filter(l => l.id !== logToDelete.id);
    onUpdateDb({
      ...db,
      recurrenceLogs: updatedLogs,
    });
    setLogToDelete(null);
    setIsDeleteLogDialogOpen(false);
  };

  // Open Log Contact
  const handleOpenLog = (recurrence: Recurrence) => {
    setSelectedRecurrence(recurrence);
    setLogNotes('');
    setLogResultado('sucesso');
    setIsLogOpen(true);
  };

  // Save Contact Follow-up Log
  const handleSaveLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecurrence) return;

    const client = db.clients.find(c => c.id === selectedRecurrence.client_id);
    const clientName = client?.nome || 'Cliente';

    const nowStr = new Date().toISOString().split('T')[0];

    // Create follow-up log entry
    const newLog: RecurrenceLog = {
      id: generateId(),
      recurrence_id: selectedRecurrence.id,
      client_name: clientName,
      data_contato: nowStr,
      resultado: logResultado,
      observacoes: logNotes.trim() || 'Sem observações registradas.',
    };

    let updatedRecurrences = [...db.recurrences];

    // If customer agreed ("sucesso"), we renew the recurrence by shifting last service to today!
    if (logResultado === 'sucesso') {
      updatedRecurrences = db.recurrences.map(r => {
        if (r.id === selectedRecurrence.id) {
          const nextSuggested = addMonths(nowStr, r.intervalo_meses);
          return {
            ...r,
            ultimo_servico_at: nowStr,
            proxima_data_sugerida: nextSuggested,
          };
        }
        return r;
      });
      alert(`Fantástico! Lead de retorno marcado como SUCESSO. A recorrência de ${clientName} foi automaticamente renovada para daqui a ${selectedRecurrence.intervalo_meses} meses!`);
    }

    onUpdateDb({
      ...db,
      recurrences: updatedRecurrences,
      recurrenceLogs: [newLog, ...db.recurrenceLogs]
    });

    setIsLogOpen(false);
  };

  // Dispatch CRM text on WhatsApp
  const handleDispatchWhatsApp = (recurrence: Recurrence) => {
    const client = db.clients.find(c => c.id === recurrence.client_id);
    if (!client) return;

    const cleanPhone = cleanWhatsAppPhone(client.telefone);
    if (!cleanPhone) return;
    const isHigienizacao = recurrence.servico_origem === 'Higienização';

    const firstName = client.nome ? client.nome.trim().split(' ')[0] : 'Cliente';
    let message = '';
    
    if (isHigienizacao) {
      message = `Olá, *${firstName}*! Tudo bem? Faz 1 ano que realizamos a higienização dos seus estofados na HigiPro. Gostaria de agendar a renovação anual com desconto especial de cliente? 🛋️✨`;
    } else {
      message = `Olá, *${firstName}*! Tudo bem? Já completamos 1 ano da impermeabilização do seu estofado na HigiPro. Gostaria de agendar a revisão preventiva anual? 🛡️✨`;
    }

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 font-display">Recorrência & Follow-up de Clientes</h1>
            {followUpAlertCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-xs animate-pulse flex items-center gap-1">
                <BellRing className="w-3 h-3" />
                {followUpAlertCount} {followUpAlertCount === 1 ? 'alerta de follow-up' : 'alertas de follow-up'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {activeTab === 'followup'
              ? 'Gestão de pré-venda: acompanhe orçamentos enviados e envie mensagens de fechamento pelo WhatsApp.'
              : activeTab === 'leads'
              ? 'Gestão de pós-venda: acompanhe o ciclo de higienização e impermeabilização preventiva para retorno de clientes.'
              : 'Histórico auditável de todas as mensagens e retornos realizados no WhatsApp.'}
          </p>
        </div>
        {activeTab === 'leads' && (
          <button
            onClick={handleOpenCreate}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Recorrência
          </button>
        )}
      </div>

      {/* Sub-menu de Separação Clara: Follow-up vs Pós-Venda Google vs Recorrência */}
      <div className="bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
          {/* Submenu Item 1: Follow-up (Pré-Venda) */}
          <button
            type="button"
            onClick={() => setActiveTab('followup')}
            className={`p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'followup' 
                ? 'bg-white dark:bg-[#0b1f3c] text-slate-900 dark:text-white shadow-sm border border-amber-400 ring-2 ring-amber-400/20' 
                : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-[#0b1f3c]/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'followup' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-black block leading-tight">Follow-up</span>
                  <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-300 tracking-wider">Pré-Venda</span>
                </div>
              </div>
              {followUpAlertCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse shadow-2xs">
                  {followUpAlertCount} alertas
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {db.quotes.filter(q => q.status === 'enviado' && !q.arquivado).length} pendentes
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-300 line-clamp-1 font-medium">
              Propostas enviadas aguardando fechamento
            </p>
          </button>

          {/* Submenu Item 2: Pós-Venda Automático & Google Review */}
          <button
            type="button"
            onClick={() => setActiveTab('pos_venda')}
            className={`p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'pos_venda' 
                ? 'bg-white dark:bg-[#0b1f3c] text-slate-900 dark:text-white shadow-sm border border-amber-400 ring-2 ring-amber-500/30' 
                : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-[#0b1f3c]/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'pos_venda' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <span className="text-xs font-black block leading-tight">Pós-Venda Google</span>
                  <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-300 tracking-wider">Avaliações 5★</span>
                </div>
              </div>
              {posVendaAlertCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse shadow-2xs">
                  {posVendaAlertCount} hoje
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  Em dia
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-300 line-clamp-1 font-medium">
              Satisfação pós-serviço & link Google Review
            </p>
          </button>

          {/* Submenu Item 3: Recorrência Anual (12 Meses) */}
          <button
            type="button"
            onClick={() => setActiveTab('leads')}
            className={`p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'leads' 
                ? 'bg-white dark:bg-[#0b1f3c] text-slate-900 dark:text-white shadow-sm border border-blue-400 ring-2 ring-blue-500/20' 
                : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-[#0b1f3c]/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'leads' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-black block leading-tight">Recorrência Anual</span>
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-300 tracking-wider">12 Meses</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'leads' ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200' : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                {activeRecurrences.length} clientes
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-300 line-clamp-1 font-medium">
              Retornos preventivos anuais pós-serviço
            </p>
          </button>

          {/* Submenu Item 4: Histórico de Contatos */}
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'logs' 
                ? 'bg-white dark:bg-[#0b1f3c] text-slate-900 dark:text-white shadow-sm border border-purple-400 ring-2 ring-purple-500/20' 
                : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-[#0b1f3c]/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'logs' ? 'bg-purple-600 text-white font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-black block leading-tight">Histórico de Contatos</span>
                  <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-300 tracking-wider">Auditável</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'logs' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200' : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                Logs
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-300 line-clamp-1 font-medium">
              Registro de mensagens e disparos realizados
            </p>
          </button>
        </div>
      </div>

      {activeTab === 'pos_venda' && (
        <PosVendaGoogle
          db={db}
          onUpdateDb={onUpdateDb}
          onOpenClientCard={handleOpenClientCard}
          onNavigateToConfig={onNavigateToConfig}
        />
      )}

      {activeTab === 'followup' && (
        <div className="space-y-4">
          <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              <span className="font-bold">Módulo Pré-Venda: Follow-up de Orçamentos</span>
              <span className="text-amber-700 hidden sm:inline">— Propostas enviadas aos clientes. Clique em <strong>Editar</strong> para alterar valores, prazos ou dados do contato.</span>
            </div>
          </div>
          <FollowUpOrcamentos
            db={db}
            onUpdateDb={onUpdateDb}
            onOpenClientCard={handleOpenClientCard}
            onNavigateToQuote={onNavigateToQuote}
          />
        </div>
      )}

      {activeTab === 'leads' && (
        <div className="space-y-4">
          {/* Section banner */}
          <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl flex items-center justify-between text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-bold">Módulo Pós-Venda: Recorrência Preventiva</span>
              <span className="text-blue-700 hidden sm:inline">— Higienizações (1 ano / 12 meses) e Impermeabilizações (1 ano / 12 meses). Clique em <strong>Editar</strong> para mudar prazos, serviços e notas.</span>
            </div>
          </div>

          {/* Recommended alert block */}
          <div className="p-4 bg-blue-50 border border-blue-100/50 rounded-2xl flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 leading-relaxed">
              <p className="font-bold">Como funciona a fidelização preventiva?</p>
              <p className="mt-0.5 text-blue-700/90">A higienização e impermeabilização preventiva anual (12 meses / 1 ano) mantêm os estofados sempre limpos e protegidos. O CRM monitora estas datas sugerindo re-contatos automáticos no momento ideal de fidelização.</p>
            </div>
          </div>

          {/* Search bar & PeriodFilter toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
            {/* Month & Year Selection Bar (Defaults strictly to Current Month) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <PeriodFilter
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  onMonthChange={(m) => setSelectedMonth(typeof m === 'number' ? m : currentMonthNum)}
                  onYearChange={(y) => setSelectedYear(typeof y === 'number' ? y : currentYearNum)}
                  availableYears={availableYears}
                  showAllMonthsOption={false}
                  showAllYearsOption={false}
                  onResetToCurrent={() => {
                    setSelectedMonth(currentMonthNum);
                    setSelectedYear(currentYearNum);
                  }}
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                <span>Período Selecionado:</span>
                <strong className="text-slate-800 font-bold">
                  {monthName(selectedMonth)}/{selectedYear}
                </strong>
                {selectedMonth === currentMonthNum && selectedYear === currentYearNum ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white">
                    Mês Corrente
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth(currentMonthNum);
                      setSelectedYear(currentYearNum);
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    (Voltar ao Mês Corrente)
                  </button>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar leads por nome do cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Leads Grid Card listing */}
          {activeRecurrences.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeRecurrences.map(rec => {
                const client = db.clients.find(c => c.id === rec.client_id);
                if (!client) return null;

                const todayStr = new Date().toISOString().split('T')[0];
                const isOverdue = rec.proxima_data_sugerida < todayStr;

                return (
                  <div 
                    key={rec.id}
                    className={`bg-white border p-5 rounded-2xl shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all ${
                      isOverdue ? 'border-amber-200 bg-amber-50/10' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      {/* Alert block */}
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">
                          {rec.servico_origem || rec.service_name || 'Higienização'}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          {client.origem && (
                            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                              client.origem === 'Google' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                              client.origem === 'Meta Ads' || client.origem === 'Meta' || client.origem === 'Instagram' || client.origem === 'Facebook' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                              client.origem === 'Indicação' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {client.origem}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                            isOverdue 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-emerald-50 text-emerald-800'
                          }`}>
                            {isOverdue ? 'Em Atraso' : 'No Prazo'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(rec)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Excluir recorrência"
                            aria-label="Excluir recorrência"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-slate-800 text-sm font-display truncate">{client.nome}</h3>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditRecurrence(rec)}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer shrink-0"
                            title="Editar Dados da Recorrência"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenClientCard(client)}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer shrink-0"
                            title="Abrir e Editar Ficha do Cliente"
                          >
                            <User className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 font-mono mb-3 flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5" />
                        {formatPhone(client.telefone)}
                      </p>

                      <div className="p-3 bg-slate-50/80 rounded-xl space-y-1.5 text-xs text-slate-600 mb-3 border border-slate-100/30">
                        <div className="flex justify-between">
                          <span>Último serviço:</span>
                          <span className="font-semibold text-slate-700">{formatDate(rec.ultimo_servico_at)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Periodicidade:</span>
                          <span className="font-semibold text-slate-700">
                            {rec.intervalo_meses || rec.intervalo || 12} meses ({(rec.intervalo_meses || rec.intervalo || 12) === 12 ? '1 ano' : `${(rec.intervalo_meses || rec.intervalo || 12)}m`})
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold">
                          <span>Próximo Retorno:</span>
                          <span className={isOverdue ? 'text-amber-600' : 'text-slate-700'}>
                            {formatDate(rec.proxima_data_sugerida || rec.proxima_data)}
                          </span>
                        </div>
                        {rec.observacoes && (
                          <div className="border-t border-slate-100/60 pt-1 text-[11px] text-slate-500 italic line-clamp-2">
                            "{rec.observacoes}"
                          </div>
                        )}
                      </div>

                      {/* Quick Action Buttons for Card */}
                      <div className="grid grid-cols-2 gap-1.5 mb-3">
                        <button
                          type="button"
                          onClick={() => handleOpenEditRecurrence(rec)}
                          className="py-1.5 px-2 text-[11px] text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100/80 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border border-blue-200/70"
                        >
                          <Edit3 className="w-3 h-3" />
                          Editar Card
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenClientCard(client)}
                          className="py-1.5 px-2 text-[11px] text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200/70 rounded-lg font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <User className="w-3 h-3" />
                          Ficha Cliente
                        </button>
                      </div>
                    </div>

                    {/* Operational Contacts Actions */}
                    <div className="border-t border-slate-100 pt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDispatchWhatsApp(rec)}
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition shadow-xs cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        WhatsApp Lead
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLog(rec)}
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Registrar Retorno
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDelete(rec)}
                        className="p-1.5 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition cursor-pointer shrink-0"
                        title="Excluir recorrência"
                        aria-label="Excluir recorrência"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<History className="w-10 h-10" />}
              title={`Nenhum lead de recorrência em ${monthName(selectedMonth)}/${selectedYear}`}
              description="Nenhum cliente cadastrado em ciclo de retorno periódico coincide com este período ou com a busca."
              actionText={
                (selectedMonth !== currentMonthNum || selectedYear !== currentYearNum)
                  ? `Ver Mês Corrente (${monthName(currentMonthNum)}/${currentYearNum})`
                  : undefined
              }
              onAction={
                (selectedMonth !== currentMonthNum || selectedYear !== currentYearNum)
                  ? () => {
                      setSelectedMonth(currentMonthNum);
                      setSelectedYear(currentYearNum);
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}

      {activeTab === 'logs' && (() => {
        const filteredLogs = (db.recurrenceLogs || []).filter(log => {
          const d = log.data_contato || log.created_at;
          if (d) {
            const { year, month } = parseDateComponents(d);
            if (year !== selectedYear) return false;
            if (month !== selectedMonth) return false;
          }
          return true;
        });

        return (
          /* Contact Logs history list */
          <div className="space-y-4">
            {/* PeriodFilter toolbar for Logs */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <PeriodFilter
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  onMonthChange={(m) => setSelectedMonth(typeof m === 'number' ? m : currentMonthNum)}
                  onYearChange={(y) => setSelectedYear(typeof y === 'number' ? y : currentYearNum)}
                  availableYears={availableYears}
                  showAllMonthsOption={false}
                  showAllYearsOption={false}
                  onResetToCurrent={() => {
                    setSelectedMonth(currentMonthNum);
                    setSelectedYear(currentYearNum);
                  }}
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                <span>Período Selecionado:</span>
                <strong className="text-slate-800 font-bold">
                  {monthName(selectedMonth)}/{selectedYear}
                </strong>
                {selectedMonth === currentMonthNum && selectedYear === currentYearNum ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white">
                    Mês Corrente
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth(currentMonthNum);
                      setSelectedYear(currentYearNum);
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    (Voltar ao Mês Corrente)
                  </button>
                )}
              </div>
            </div>

            {filteredLogs.length > 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-100 font-display">
                      <tr>
                        <th className="px-6 py-3.5">Data Contato</th>
                        <th className="px-6 py-3.5">Cliente</th>
                        <th className="px-6 py-3.5">Tipo / Canal</th>
                        <th className="px-6 py-3.5">Resultado</th>
                        <th className="px-6 py-3.5">Histórico Observação</th>
                        <th className="px-4 py-3.5 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition text-xs text-slate-600">
                        <td className="px-6 py-4 font-mono font-semibold">{formatDate(log.data_contato)}</td>
                        <td className="px-6 py-4 font-bold text-slate-800">{log.client_name}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            log.tipo === 'follow_up_orcamento'
                              ? 'bg-amber-100 text-amber-900 border border-amber-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}>
                            {log.tipo === 'follow_up_orcamento' ? 'Follow-up Orçamento' : 'Recorrência Preventiva'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            log.resultado === 'sucesso' 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : log.resultado === 'sem_retorno'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {log.resultado === 'sucesso' && 'Agendou Retorno / Aprovou'}
                            {log.resultado === 'sem_retorno' && 'Sem Retorno / Mensagem Ignorada'}
                            {log.resultado === 'recusado' && 'Não Tem Interesse Agora'}
                          </span>
                        </td>
                        <td className="px-6 py-4 leading-normal italic">{log.observacoes}</td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteLog(log)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Excluir histórico de contato"
                            aria-label="Excluir histórico de contato"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<History className="w-10 h-10" />}
              title="Sem histórico registrado"
              description="Nenhum contato ativo do CRM foi logado no sistema para este período."
            />
          )}
        </div>
      );
    })()}

      {/* Modal: Create Recurrence Setup */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Configurar Plano de Retorno Recorrente"
      >
        <form onSubmit={handleSaveRecurrence} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Cliente *</label>
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
            >
              <option value="">Selecione um cliente...</option>
              {db.clients.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de Serviço Recorrente *</label>
            <select
              required
              value={servico}
              onChange={(e: any) => {
                const val = e.target.value;
                setServico(val);
                setIntervalo('12'); // Both higienização and impermeabilização recommended at 12 months (1 year)
              }}
              className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl cursor-pointer"
            >
              <option value="Higienização">Higienização (Recomendado a cada 1 ano / 12 meses)</option>
              <option value="Impermeabilização">Impermeabilização (Recomendado a cada 1 ano / 12 meses)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Intervalo de Recorrência (Meses) *</label>
            <input
              type="number"
              required
              min="1"
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Data de Realização do Último Serviço *</label>
            <input
              type="date"
              required
              value={ultimoServico}
              onChange={(e) => setUltimoServico(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl shadow-xs cursor-pointer"
            >
              Ativar Recorrência
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Log Contact Record */}
      <Modal
        isOpen={isLogOpen && selectedRecurrence !== null}
        onClose={() => setIsLogOpen(false)}
        title="Registrar Resultado do Contato"
      >
        <form onSubmit={handleSaveLog} className="space-y-4 text-sm">
          <p className="text-xs text-slate-500 leading-normal">
            Registre os detalhes de feedback após contatar o cliente pelo WhatsApp para futuras tomadas de decisão comercial:
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Resultado do Contato *</label>
            <select
              value={logResultado}
              onChange={(e: any) => setLogResultado(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl cursor-pointer"
            >
              <option value="sucesso">Agendou Retorno com Sucesso (Sucesso)</option>
              <option value="sem_retorno">Cliente visualizou e não respondeu (Sem Retorno)</option>
              <option value="recusado">Cliente recusou a oferta no momento (Recusado)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Comentários e Detalhes do Contato</label>
            <textarea
              required={logResultado !== 'sucesso'}
              value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              placeholder="Ex: Cliente está viajando e solicitou re-contato em 15 dias."
              rows={3}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <button
              type="button"
              onClick={() => setIsLogOpen(false)}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl shadow-xs cursor-pointer"
            >
              Salvar Contato
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Client Details & Edit Card */}
      <Modal
        isOpen={isClientModalOpen && editingClient !== null}
        onClose={() => {
          setIsClientModalOpen(false);
          setEditingClient(null);
        }}
        title={`Ficha do Cliente — ${editingClient?.nome}`}
        size="lg"
      >
        {editingClient && (
          <form onSubmit={handleSaveClientForm} className="space-y-4">
            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-800 flex items-center justify-between">
              <span>Visualizando e editando cadastro oficial de <strong>{editingClient.nome}</strong>. As alterações refletem em todo o sistema.</span>
              <span className="font-mono text-[10px] text-blue-600 bg-white px-2 py-0.5 rounded border border-blue-200">ID: {editingClient.id.substring(0, 8)}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Nome */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-500 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={clientForm.nome}
                  onChange={(e) => setClientForm({ ...clientForm, nome: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Origem do Cliente */}
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Origem do Cliente (Canal de Aquisição)</label>
                <select
                  value={clientForm.origem}
                  onChange={(e) => setClientForm({ ...clientForm, origem: e.target.value as ClientOrigin })}
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 cursor-pointer"
                >
                  {ORIGINS.map(orig => (
                    <option key={orig} value={orig}>{orig}</option>
                  ))}
                </select>
              </div>

              {/* Telefone */}
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Telefone / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={clientForm.telefone}
                  onChange={(e) => setClientForm({ ...clientForm, telefone: e.target.value })}
                  placeholder="(54) 99999-9999"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-mono"
                />
              </div>

              {/* Email */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-500 mb-1">Email</label>
                <input
                  type="email"
                  value={clientForm.email}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  placeholder="cliente@email.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Endereço */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-500 mb-1">Endereço (Rua, Número, Apto)</label>
                <input
                  type="text"
                  value={clientForm.endereco}
                  onChange={(e) => setClientForm({ ...clientForm, endereco: e.target.value })}
                  placeholder="Ex: Rua Morom, 1200 - Apto 302"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Cidade */}
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Cidade</label>
                <input
                  type="text"
                  value={clientForm.cidade}
                  onChange={(e) => setClientForm({ ...clientForm, cidade: e.target.value })}
                  placeholder="Passo Fundo"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Estado */}
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Estado</label>
                <input
                  type="text"
                  value={clientForm.estado}
                  onChange={(e) => setClientForm({ ...clientForm, estado: e.target.value })}
                  placeholder="RS"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Observações */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-500 mb-1">Observações Internas</label>
                <textarea
                  rows={3}
                  value={clientForm.observacoes}
                  onChange={(e) => setClientForm({ ...clientForm, observacoes: e.target.value })}
                  placeholder="Preferências do cliente, cuidados com pets, etc."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsClientModalOpen(false);
                  setEditingClient(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Salvar Alterações
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Editar Recorrência (Card Editável) */}
      <Modal
        isOpen={isEditRecurrenceModalOpen && editingRecurrence !== null}
        onClose={() => {
          setIsEditRecurrenceModalOpen(false);
          setEditingRecurrence(null);
        }}
        title="Editar Recorrência e Dados do Card"
        size="md"
      >
        {editingRecurrence && (
          <form onSubmit={handleSaveEditRecurrence} className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl text-blue-900 flex items-center justify-between">
              <div>
                <span className="font-bold block text-sm">Cliente: {editRecurrenceForm.client_name || 'Não identificado'}</span>
                <span className="text-[11px] text-blue-700">Ajuste os prazos, serviço contratado e notas de retorno deste cliente.</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                editRecurrenceForm.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {editRecurrenceForm.ativo ? 'Recorrência Ativa' : 'Recorrência Pausada'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Cliente Selector */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Cliente Vinculado</label>
                <select
                  value={editRecurrenceForm.client_id}
                  onChange={(e) => {
                    const selectedCli = db.clients.find(c => c.id === e.target.value);
                    setEditRecurrenceForm({
                      ...editRecurrenceForm,
                      client_id: e.target.value,
                      client_name: selectedCli?.nome || editRecurrenceForm.client_name,
                      client_phone: selectedCli?.telefone || editRecurrenceForm.client_phone,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-medium"
                >
                  {db.clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nome} {c.telefone ? `(${c.telefone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nome do Cliente */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Nome no Card *</label>
                <input
                  type="text"
                  required
                  value={editRecurrenceForm.client_name}
                  onChange={(e) => setEditRecurrenceForm({ ...editRecurrenceForm, client_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Telefone / WhatsApp */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">WhatsApp / Telefone *</label>
                <input
                  type="text"
                  required
                  value={editRecurrenceForm.client_phone}
                  onChange={(e) => setEditRecurrenceForm({ ...editRecurrenceForm, client_phone: e.target.value })}
                  placeholder="(54) 99999-9999"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-mono"
                />
              </div>

              {/* Serviço Origem */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Serviço / Procedimento *</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditRecurrenceForm({
                        ...editRecurrenceForm,
                        servico_origem: 'Higienização de Estofados',
                        intervalo_meses: '12',
                        proxima_data_sugerida: addMonths(editRecurrenceForm.ultimo_servico_at, 12),
                      });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      editRecurrenceForm.servico_origem.toLowerCase().includes('higieniz')
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    Higienização (1 ano / 12 meses)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditRecurrenceForm({
                        ...editRecurrenceForm,
                        servico_origem: 'Impermeabilização Protetiva',
                        intervalo_meses: '12',
                        proxima_data_sugerida: addMonths(editRecurrenceForm.ultimo_servico_at, 12),
                      });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      editRecurrenceForm.servico_origem.toLowerCase().includes('impermeab')
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    Impermeabilização (1 ano / 12 meses)
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={editRecurrenceForm.servico_origem}
                  onChange={(e) => setEditRecurrenceForm({ ...editRecurrenceForm, servico_origem: e.target.value })}
                  placeholder="Ex: Higienização de Sofá Retrátil, Impermeabilização, Colchão..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-medium"
                />
              </div>

              {/* Data do Último Serviço */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Data do Último Serviço *</label>
                <input
                  type="date"
                  required
                  value={editRecurrenceForm.ultimo_servico_at}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    const interval = parseInt(editRecurrenceForm.intervalo_meses) || 6;
                    setEditRecurrenceForm({
                      ...editRecurrenceForm,
                      ultimo_servico_at: newDate,
                      proxima_data_sugerida: addMonths(newDate, interval),
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Periodicidade em Meses */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Periodicidade (Meses) *</label>
                <div className="flex gap-1.5 mb-1.5">
                  {[3, 6, 12].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setEditRecurrenceForm({
                          ...editRecurrenceForm,
                          intervalo_meses: String(m),
                          proxima_data_sugerida: addMonths(editRecurrenceForm.ultimo_servico_at, m),
                        });
                      }}
                      className={`flex-1 py-1 text-xs rounded-lg font-bold border transition cursor-pointer ${
                        editRecurrenceForm.intervalo_meses === String(m)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="48"
                  required
                  value={editRecurrenceForm.intervalo_meses}
                  onChange={(e) => {
                    const val = e.target.value;
                    const intervalNum = parseInt(val) || 6;
                    setEditRecurrenceForm({
                      ...editRecurrenceForm,
                      intervalo_meses: val,
                      proxima_data_sugerida: addMonths(editRecurrenceForm.ultimo_servico_at, intervalNum),
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Próxima Data Sugerida */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Data Prevista para Próximo Retorno *</label>
                <input
                  type="date"
                  required
                  value={editRecurrenceForm.proxima_data_sugerida}
                  onChange={(e) => setEditRecurrenceForm({ ...editRecurrenceForm, proxima_data_sugerida: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-semibold text-blue-700"
                />
              </div>

              {/* Status Ativo / Pausado */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Status da Recorrência</label>
                <select
                  value={editRecurrenceForm.ativo ? 'true' : 'false'}
                  onChange={(e) => setEditRecurrenceForm({ ...editRecurrenceForm, ativo: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-semibold"
                >
                  <option value="true">Ativo (Gera avisos no CRM)</option>
                  <option value="false">Pausado (Não alertar no momento)</option>
                </select>
              </div>

              {/* Observações */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Observações / Detalhes do Cliente</label>
                <textarea
                  rows={2}
                  value={editRecurrenceForm.observacoes}
                  onChange={(e) => setEditRecurrenceForm({ ...editRecurrenceForm, observacoes: e.target.value })}
                  placeholder="Ex: Sofá retrátil 3 lugares cinza, tem 2 gatos, prefere contato à tarde..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsEditRecurrenceModalOpen(false);
                  setEditingRecurrence(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Salvar Alterações
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm Dialog: Delete Recurrence */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen && recurrenceToDelete !== null}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setRecurrenceToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Excluir Recorrência"
        description={
          recurrenceToDelete
            ? `Tem certeza que deseja excluir a recorrência de "${
                db.clients.find(c => c.id === recurrenceToDelete.client_id)?.nome || recurrenceToDelete.client_name || 'Cliente'
              }" (${recurrenceToDelete.servico_origem || recurrenceToDelete.service_name || 'Higienização'})? Este cliente deixará de aparecer na lista de avisos periódicos.`
            : ''
        }
        confirmText="Sim, Excluir"
        cancelText="Cancelar"
        isDanger={true}
      />

      {/* Confirm Dialog: Delete Recurrence Log */}
      <ConfirmDialog
        isOpen={isDeleteLogDialogOpen && logToDelete !== null}
        onClose={() => {
          setIsDeleteLogDialogOpen(false);
          setLogToDelete(null);
        }}
        onConfirm={handleConfirmDeleteLog}
        title="Excluir Histórico de Contato"
        description={
          logToDelete
            ? `Deseja realmente remover o registro de retorno de "${logToDelete.client_name}" realizado em ${formatDate(logToDelete.data_contato)}?`
            : ''
        }
        confirmText="Sim, Excluir"
        cancelText="Cancelar"
        isDanger={true}
      />
    </div>
  );
});
