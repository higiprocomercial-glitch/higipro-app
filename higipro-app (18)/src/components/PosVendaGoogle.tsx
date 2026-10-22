/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Star, MessageSquare, Check, CheckCircle2, Clock, 
  Search, Filter, ExternalLink, Sparkles, User, FileText, 
  Calendar, AlertCircle, ThumbsUp, Send, Heart, Eye,
  RefreshCw, Settings, Award, Edit3, ChevronRight, Copy
} from 'lucide-react';
import { DatabaseState, ServiceOrder, Client, RecurrenceLog } from '../types';
import { formatDate, formatDateTime, formatCurrency, cleanWhatsAppPhone, formatPhone, parseDateComponents, monthName } from '../lib/utils';
import { Modal, EmptyState } from './UIComponents';
import { PeriodFilter } from './PeriodFilter';
import { generateId } from '../lib/database';
import { supabaseSaveServiceOrder } from '../lib/supabase';

interface PosVendaGoogleProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
  onOpenClientCard: (client: Client) => void;
  onNavigateToConfig?: () => void;
}

export const PosVendaGoogle: React.FC<PosVendaGoogleProps> = ({
  db,
  onUpdateDb,
  onOpenClientCard,
  onNavigateToConfig,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'alertas' | 'todos' | 'pendentes' | 'enviados' | 'avaliados'>('alertas');
  const [sortBy, setSortBy] = useState<'recentes' | 'tempo_espera' | 'valor'>('tempo_espera');

  // Rating / Feedback Modal
  const [selectedOSForRating, setSelectedOSForRating] = useState<ServiceOrder | null>(null);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);

  // Quick Message Preview Modal
  const [previewOS, setPreviewOS] = useState<ServiceOrder | null>(null);
  const [customMsgText, setCustomMsgText] = useState<string>('');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const googleReviewLink = db.companySettings?.link_avaliacao_google || 'https://g.page/r/CRZ8Higipro/review';
  const delayDays = db.companySettings?.dias_pos_venda || 2;

  // Month and Year selection for Pós-Venda (Mês corrente por padrão)
  const now = new Date();
  const currentMonthNum = now.getMonth();
  const currentYearNum = now.getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);

  // Available years dynamically discovered from concluded service orders
  const availableYears = React.useMemo(() => {
    const years = new Set<number>([currentYearNum, currentYearNum - 1, currentYearNum + 1]);
    (db.serviceOrders || []).forEach(os => {
      const dateStr = os.data_conclusao || (os.data_agendada ? os.data_agendada.split(/[ T]/)[0] : os.created_at?.split(/[ T]/)[0]);
      if (dateStr) {
        const y = parseDateComponents(dateStr).year;
        if (!isNaN(y) && y > 2000) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [db.serviceOrders, currentYearNum]);

  // Concluded service orders filtered strictly by month and year (Mês corrente por padrão)
  const concludedOS = db.serviceOrders.filter(os => {
    if (os.status !== 'concluido') return false;
    const dateStr = os.data_conclusao || (os.data_agendada ? os.data_agendada.split(/[ T]/)[0] : os.created_at?.split(/[ T]/)[0]);
    if (!dateStr) return false;
    const { year, month } = parseDateComponents(dateStr);
    if (year !== selectedYear) return false;
    if (month !== selectedMonth) return false;
    return true;
  });

  // Calculate days since completion
  const getDaysSinceCompletion = (os: ServiceOrder): number => {
    const dateStr = os.data_conclusao || (os.data_agendada ? os.data_agendada.split(/[ T]/)[0] : os.created_at?.split(/[ T]/)[0]);
    if (!dateStr) return 0;
    const compDate = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - compDate.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Helper to get service description
  const getServiceDesc = (os: ServiceOrder): string => {
    if (os.quote_id) {
      const items = db.quoteItems.filter(i => i.quote_id === os.quote_id);
      if (items.length > 0) {
        return items.map(i => i.descricao).join(', ');
      }
    }
    const app = db.appointments.find(a => a.os_id === os.id);
    if (app && app.servicos) return app.servicos;
    return 'Higienização de Estofados';
  };

  // Helper to build WhatsApp Message
  const buildWhatsAppMessage = (os: ServiceOrder, client?: Client): string => {
    const rawTemplate = db.companySettings?.mensagem_pos_venda || 
      'Olá {cliente}! Tudo bem? Como ficou o serviço na HigiPro? Se puder nos avaliar com 5 estrelas no Google: {link_google} ⭐ Obrigado!';

    const clientName = client?.nome || os.client_name || 'Cliente';
    const firstName = clientName.split(' ')[0];
    const tech = os.tecnico || 'Nossa equipe técnica';
    const serviceName = getServiceDesc(os);
    const companyName = db.companySettings?.nome_fantasia || 'HigiPro';

    let msg = rawTemplate
      .replace(/{cliente}/g, firstName)
      .replace(/{tecnico}/g, tech)
      .replace(/{servico}/g, serviceName)
      .replace(/{link_google}/g, googleReviewLink)
      .replace(/{empresa}/g, companyName);

    return msg;
  };

  // Send WhatsApp Action
  const handleSendWhatsApp = (os: ServiceOrder, client?: Client, customText?: string) => {
    const phone = client?.telefone || os.client_phone;
    const cleanPhone = cleanWhatsAppPhone(phone);
    if (!cleanPhone) {
      alert('Telefone do cliente inválido ou não informado.');
      return;
    }

    const message = customText || buildWhatsAppMessage(os, client);
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');

    // Auto mark as sent
    const nowStr = new Date().toISOString();
    const updatedOSList = db.serviceOrders.map(item => {
      if (item.id === os.id) {
        return {
          ...item,
          pos_venda_enviado: true,
          pos_venda_enviado_em: nowStr,
        };
      }
      return item;
    });

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
    });

    const updatedOS = updatedOSList.find(i => i.id === os.id);
    if (updatedOS) {
      supabaseSaveServiceOrder(updatedOS);
    }
  };

  // Toggle mark as sent
  const handleToggleSent = (os: ServiceOrder) => {
    const isSent = !os.pos_venda_enviado;
    const nowStr = new Date().toISOString();

    const updatedOSList = db.serviceOrders.map(item => {
      if (item.id === os.id) {
        return {
          ...item,
          pos_venda_enviado: isSent,
          pos_venda_enviado_em: isSent ? nowStr : undefined,
        };
      }
      return item;
    });

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
    });

    const updatedOS = updatedOSList.find(i => i.id === os.id);
    if (updatedOS) {
      supabaseSaveServiceOrder(updatedOS);
    }
  };

  // Open Rating Modal
  const handleOpenRatingModal = (os: ServiceOrder) => {
    setSelectedOSForRating(os);
    setRatingStars(os.pos_venda_avaliacao || 5);
    setFeedbackText(os.pos_venda_feedback || '');
    setIsRatingModalOpen(true);
  };

  // Save Rating & Feedback
  const handleSaveRating = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOSForRating) return;

    const nowStr = new Date().toISOString();
    const os = selectedOSForRating;

    // 1. Update OS
    const updatedOSList = db.serviceOrders.map(item => {
      if (item.id === os.id) {
        return {
          ...item,
          pos_venda_enviado: true,
          pos_venda_enviado_em: item.pos_venda_enviado_em || nowStr,
          pos_venda_avaliacao: ratingStars,
          pos_venda_feedback: feedbackText.trim() || undefined,
        };
      }
      return item;
    });

    // 2. Also log in recurrenceLogs/timeline
    const newLog: RecurrenceLog = {
      id: generateId(),
      recurrence_id: os.id,
      client_name: os.client_name,
      data_contato: nowStr,
      resultado: 'sucesso',
      observacoes: `[Pós-Venda Google] Nota: ${ratingStars} Estrelas ⭐. ${feedbackText.trim() ? `Feedback: "${feedbackText.trim()}"` : 'Avaliação registrada com sucesso.'}`,
      tipo: 'recorrencia',
    };

    const currentLogs = db.recurrenceLogs || [];

    onUpdateDb({
      ...db,
      serviceOrders: updatedOSList,
      recurrenceLogs: [newLog, ...currentLogs],
    });

    const updatedOS = updatedOSList.find(i => i.id === os.id);
    if (updatedOS) {
      supabaseSaveServiceOrder(updatedOS);
    }

    setIsRatingModalOpen(false);
    setSelectedOSForRating(null);
  };

  // Filter logic
  const filteredList = concludedOS.filter(os => {
    if (!os) return false;
    const client = (db?.clients || []).find(c => c.id === os.client_id);
    const clientName = client?.nome || os.client_name || '';
    const phone = client?.telefone || os.client_phone || '';
    const serviceName = getServiceDesc(os);
    const term = (searchTerm || '').toLowerCase();

    const matchesSearch = 
      String(clientName).toLowerCase().includes(term) ||
      String(phone).includes(term) ||
      String(os.numero || '').toLowerCase().includes(term) ||
      String(os.tecnico || '').toLowerCase().includes(term) ||
      String(serviceName || '').toLowerCase().includes(term);

    if (!matchesSearch) return false;

    const daysSince = getDaysSinceCompletion(os);
    const isSent = !!os.pos_venda_enviado;
    const hasRating = typeof os.pos_venda_avaliacao === 'number' && os.pos_venda_avaliacao > 0;

    if (filterType === 'alertas') {
      // Ready to contact: Concluded at least delayDays days ago and not sent yet
      return !isSent && daysSince >= delayDays;
    }
    if (filterType === 'pendentes') {
      return !isSent;
    }
    if (filterType === 'enviados') {
      return isSent;
    }
    if (filterType === 'avaliados') {
      return hasRating;
    }
    return true; // 'todos'
  });

  // Sort logic
  filteredList.sort((a, b) => {
    if (sortBy === 'tempo_espera') {
      // Prioritize pending that are waiting longest
      const daysA = getDaysSinceCompletion(a);
      const daysB = getDaysSinceCompletion(b);
      return daysB - daysA;
    }
    if (sortBy === 'recentes') {
      const dateA = a.data_conclusao || a.created_at || '';
      const dateB = b.data_conclusao || b.created_at || '';
      return dateB.localeCompare(dateA);
    }
    if (sortBy === 'valor') {
      return (b.total || 0) - (a.total || 0);
    }
    return 0;
  });

  // Statistics calculation
  const totalConcluded = concludedOS.length;
  const pendingContactAlerts = concludedOS.filter(os => !os.pos_venda_enviado && getDaysSinceCompletion(os) >= delayDays).length;
  const totalSent = concludedOS.filter(os => os.pos_venda_enviado).length;
  const ratedOrders = concludedOS.filter(os => typeof os.pos_venda_avaliacao === 'number' && os.pos_venda_avaliacao > 0);
  const totalRated = ratedOrders.length;
  const fiveStarRated = ratedOrders.filter(os => os.pos_venda_avaliacao === 5).length;

  const copyGoogleLink = () => {
    navigator.clipboard.writeText(googleReviewLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Google Review Link Display */}
      <div className="bg-linear-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500 text-slate-950 rounded-xl shadow-xs">
              <Star className="w-5 h-5 fill-slate-950" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 font-display flex items-center gap-2">
                <span>Pós-Venda Automático & Avaliações Google</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                  Google Meu Negócio
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Acompanhe a satisfação dos clientes após a conclusão dos serviços e solicite avaliações 5 estrelas no Google para impulsionar sua empresa.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {onNavigateToConfig && (
            <button
              type="button"
              onClick={onNavigateToConfig}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Configurar Mensagem & Link</span>
            </button>
          )}

          <a
            href={googleReviewLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
            title="Abrir página de avaliação no Google"
          >
            <span>Ver Ficha do Google</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Google Review URL Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Award className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Link de Avaliação Vinculado às Mensagens
            </span>
            <span className="text-xs font-mono font-medium text-slate-700 truncate block">
              {googleReviewLink}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={copyGoogleLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            <Copy className="w-3 h-3 text-slate-500" />
            <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
          </button>
          <span className="text-[11px] text-slate-400 italic">
            Gatilho: {delayDays} {delayDays === 1 ? 'dia' : 'dias'} após serviço
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider">Aguardando Envio</span>
            <AlertCircle className={`w-4 h-4 ${pendingContactAlerts > 0 ? 'text-amber-500 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-800">{pendingContactAlerts}</p>
          <p className="text-[11px] text-amber-700 font-medium mt-1">
            {pendingContactAlerts > 0 ? 'Prontos para contato hoje' : 'Todos os pós-vendas em dia'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider">Pós-Venda Enviado</span>
            <Send className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-800">{totalSent}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {totalConcluded > 0 ? `${Math.round((totalSent / totalConcluded) * 100)}% das OS atendidas` : '0%'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider">Avaliações 5 Estrelas</span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-800">{fiveStarRated}</p>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1">
            {totalRated > 0 ? `${totalRated} avaliações registradas` : 'Aguardando retornos'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider">Total Concluídos</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-800">{totalConcluded}</p>
          <p className="text-[11px] text-slate-500 mt-1">Histórico completo de atendimentos</p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
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

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, telefone, OS, serviço ou técnico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-blue-600 focus:bg-white transition"
            />
          </div>

          {/* Filter Chips & Sort */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterType('alertas')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                filterType === 'alertas'
                  ? 'bg-amber-500 text-slate-950 shadow-xs ring-2 ring-amber-400/40'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Prontos p/ Enviar</span>
              {pendingContactAlerts > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  filterType === 'alertas' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500 text-slate-950 font-black'
                }`}>
                  {pendingContactAlerts}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFilterType('todos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                filterType === 'todos'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({totalConcluded})
            </button>

            <button
              type="button"
              onClick={() => setFilterType('pendentes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                filterType === 'pendentes'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Não Enviados
            </button>

            <button
              type="button"
              onClick={() => setFilterType('enviados')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                filterType === 'enviados'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Enviados ({totalSent})
            </button>

            <button
              type="button"
              onClick={() => setFilterType('avaliados')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                filterType === 'avaliados'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Star className="w-3 h-3 fill-current" />
              <span>Avaliados ({totalRated})</span>
            </button>

            {/* Sort Selector */}
            <div className="pl-1 border-l border-slate-200 flex items-center">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 cursor-pointer focus:outline-blue-600"
              >
                <option value="tempo_espera">Mais tempo sem contato</option>
                <option value="recentes">Mais recentes</option>
                <option value="valor">Maior valor</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Cards List */}
      {filteredList.length === 0 ? (
        <EmptyState
          icon={Star}
          title={
            filterType === 'alertas'
              ? 'Nenhum pós-venda pendente no momento'
              : 'Nenhum serviço encontrado neste filtro'
          }
          description={
            filterType === 'alertas'
              ? `Os serviços concluídos aparecerão aqui ${delayDays} dias após a finalização para envio do pós-venda.`
              : 'Altere os filtros acima para visualizar outros atendimentos.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {filteredList.map(os => {
            const client = db.clients.find(c => c.id === os.client_id);
            const daysSince = getDaysSinceCompletion(os);
            const isSent = !!os.pos_venda_enviado;
            const rating = os.pos_venda_avaliacao;
            const serviceName = getServiceDesc(os);
            const phone = client?.telefone || os.client_phone;
            const cleanPhone = cleanWhatsAppPhone(phone);
            const messagePreview = buildWhatsAppMessage(os, client);

            const isAlertReady = !isSent && daysSince >= delayDays;

            return (
              <div
                key={os.id}
                className={`bg-white rounded-2xl border transition shadow-xs flex flex-col justify-between overflow-hidden ${
                  isAlertReady
                    ? 'border-amber-400/80 ring-1 ring-amber-400/40'
                    : isSent
                    ? 'border-slate-200/80'
                    : 'border-slate-200'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          {os.numero}
                        </span>
                        <h3 className="font-bold text-slate-800 text-sm hover:text-blue-600 transition cursor-pointer"
                          onClick={() => client && onOpenClientCard(client)}
                        >
                          {client?.nome || os.client_name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                        <span className="text-blue-700 font-semibold">{serviceName}</span>
                        <span>•</span>
                        <span>Téc: <strong>{os.tecnico || 'HigiPro'}</strong></span>
                      </p>
                    </div>

                    {/* Status Pill */}
                    <div>
                      {rating ? (
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold shadow-2xs">
                          <div className="flex items-center text-amber-500">
                            {[...Array(rating)].map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-current" />
                            ))}
                          </div>
                          <span>{rating}.0</span>
                        </div>
                      ) : isSent ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold">
                          <Check className="w-3 h-3" />
                          <span>Enviado</span>
                        </span>
                      ) : isAlertReady ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500 text-slate-950 font-black rounded-lg text-[11px] shadow-2xs animate-pulse">
                          <Clock className="w-3 h-3" />
                          <span>Pronto p/ Enviar</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium">
                          <span>Aguardar ({delayDays - daysSince}d)</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Completion and Timing Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Conclusão</span>
                      <span className="font-semibold text-slate-700">
                        {formatDate(os.data_conclusao || os.data_agendada)}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        {daysSince === 0 ? 'Concluído hoje' : daysSince === 1 ? 'Concluído ontem' : `${daysSince} dias atrás`}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Valor do Serviço</span>
                      <span className="font-bold text-emerald-700 font-mono">
                        {formatCurrency(os.total)}
                      </span>
                      {phone && (
                        <span className="text-[11px] text-slate-500 block font-mono">
                          {formatPhone(phone)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Feedback comment if already registered */}
                  {os.pos_venda_feedback && (
                    <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1">
                      <span className="font-bold text-[10px] uppercase text-amber-800 tracking-wider flex items-center gap-1">
                        <Heart className="w-3 h-3 text-amber-600 fill-amber-500" />
                        Feedback do Cliente:
                      </span>
                      <p className="italic text-slate-700">"{os.pos_venda_feedback}"</p>
                    </div>
                  )}

                  {/* Message Preview Snippet */}
                  {!rating && !isSent && (
                    <div className="p-2.5 bg-blue-50/40 border border-blue-100 rounded-xl text-[11px] text-slate-600">
                      <span className="font-bold text-[10px] uppercase text-blue-800 tracking-wider block mb-0.5">
                        Mensagem Pré-configurada com Link do Google:
                      </span>
                      <p className="line-clamp-2 italic text-slate-600">
                        "{messagePreview}"
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {client && (
                      <button
                        type="button"
                        onClick={() => onOpenClientCard(client)}
                        className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-200 rounded-lg transition"
                        title="Ver Ficha do Cliente"
                      >
                        <User className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleToggleSent(os)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                        isSent
                          ? 'text-slate-600 bg-slate-200/60 hover:bg-slate-200'
                          : 'text-blue-700 hover:bg-blue-50'
                      }`}
                      title={isSent ? 'Desmarcar como enviado' : 'Marcar manualmente como enviado'}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSent ? 'Marcar Pendente' : 'Já Enviei'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenRatingModal(os)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                      <span>{rating ? 'Editar Avaliação' : 'Registrar Nota'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPreviewOS(os);
                        setCustomMsgText(buildWhatsAppMessage(os, client));
                        setIsPreviewModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Enviar no WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: REGISTRAR AVALIAÇÃO / NOTA DO CLIENTE */}
      <Modal
        isOpen={isRatingModalOpen}
        onClose={() => {
          setIsRatingModalOpen(false);
          setSelectedOSForRating(null);
        }}
        title={`Registrar Avaliação Google — ${selectedOSForRating?.numero}`}
        size="md"
      >
        {selectedOSForRating && (
          <form onSubmit={handleSaveRating} className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950">
              <span className="font-bold block">Cliente: {selectedOSForRating.client_name}</span>
              <p className="text-[11px] text-amber-900/80 mt-0.5">
                Serviço concluído por <strong>{selectedOSForRating.tecnico}</strong> no valor de <strong>{formatCurrency(selectedOSForRating.total)}</strong>.
              </p>
            </div>

            {/* Stars Picker */}
            <div className="space-y-2 text-center py-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Classificação de Satisfação:
              </label>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingStars(star)}
                    className="p-1.5 hover:scale-110 transition cursor-pointer focus:outline-hidden"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= ratingStars
                          ? 'text-amber-500 fill-amber-400 drop-shadow-xs'
                          : 'text-slate-300 fill-slate-100'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs font-bold text-amber-700 block">
                {ratingStars === 5
                  ? '⭐⭐⭐⭐⭐ Excelente! (5 Estrelas no Google)'
                  : ratingStars === 4
                  ? '⭐⭐⭐⭐ Muito Bom (4 Estrelas)'
                  : ratingStars === 3
                  ? '⭐⭐⭐ Razoável (3 Estrelas)'
                  : 'Abaixo do esperado'}
              </span>
            </div>

            {/* Feedback textarea */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Comentário ou Elogio do Cliente:
              </label>
              <textarea
                rows={3}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Ex: Cliente elogiou muito o resultado, disse que o sofá ficou como novo e confirmou que avaliou com 5 estrelas no Google!"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsRatingModalOpen(false);
                  setSelectedOSForRating(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Salvar Avaliação
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: PREVIEW & CUSTOMIZAR MENSAGEM ANTES DO WHATSAPP */}
      <Modal
        isOpen={isPreviewModalOpen}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setPreviewOS(null);
        }}
        title={`Enviar Pós-Venda WhatsApp — ${previewOS?.client_name}`}
        size="md"
      >
        {previewOS && (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between">
              <div>
                <span className="font-bold block">{previewOS.client_name}</span>
                <span className="text-[11px] text-emerald-800 font-mono">
                  {formatPhone(previewOS.client_phone)}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                {previewOS.numero}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mensagem a ser enviada (com link do Google Review):
              </label>
              <textarea
                rows={5}
                value={customMsgText}
                onChange={(e) => setCustomMsgText(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-blue-600 focus:bg-white transition font-sans leading-relaxed"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Você pode personalizar a mensagem livremente antes de abrir o WhatsApp.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsPreviewModalOpen(false);
                  setPreviewOS(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const client = db.clients.find(c => c.id === previewOS.client_id);
                  handleSendWhatsApp(previewOS, client, customMsgText);
                  setIsPreviewModalOpen(false);
                  setPreviewOS(null);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Abrir no WhatsApp</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
