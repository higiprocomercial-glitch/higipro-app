/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Smartphone, MessageSquare, Check, Copy, AlertTriangle, 
  Search, Clock, CheckCircle2, XCircle, Eye, ArrowRight, 
  Send, User, FileText, BellRing, DollarSign, Filter, RefreshCw,
  Edit, Edit3, Trash2, Archive
} from 'lucide-react';
import { DatabaseState, Quote, QuoteItem, Client, RecurrenceLog } from '../types';
import { formatPhone, formatDate, formatDateTime, formatCurrency, cleanWhatsAppPhone, parseDateComponents, monthName } from '../lib/utils';
import { Modal, EmptyState } from './UIComponents';
import { PeriodFilter } from './PeriodFilter';
import { generateId } from '../lib/database';
import { supabaseSaveQuote } from '../lib/supabase';

interface FollowUpOrcamentosProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
  onOpenClientCard: (client: Client) => void;
  onNavigateToQuote?: (quoteId: string) => void;
}

export const FollowUpOrcamentos: React.FC<FollowUpOrcamentosProps> = ({
  db,
  onUpdateDb,
  onOpenClientCard,
  onNavigateToQuote
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'alertas' | 'todos' | 'hoje' | 'contatados'>('alertas');
  const [sortBy, setSortBy] = useState<'tempo' | 'recentes' | 'valor'>('tempo');
  const [useClientNameGreeting, setUseClientNameGreeting] = useState(true);
  
  // Modals state
  const [selectedQuoteDetails, setSelectedQuoteDetails] = useState<Quote | null>(null);
  const [isQuoteDetailsOpen, setIsQuoteDetailsOpen] = useState(false);
  const [quoteToDecline, setQuoteToDecline] = useState<Quote | null>(null);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('Cliente sem interesse no momento');

  // Delete card modal state
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Edit Quote / Follow-up modal state (Make follow-up cards editable)
  const [isEditQuoteModalOpen, setIsEditQuoteModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [editQuoteForm, setEditQuoteForm] = useState({
    client_id: '',
    client_name: '',
    client_phone: '',
    total: '0',
    desconto: '0',
    status: 'enviado' as Quote['status'],
    enviado_em: '',
    validade: '',
    itens_resumo: '',
    observacoes: '',
    follow_up_tentativas: 0,
  });

  const handleOpenEditQuote = (quote: Quote, client?: Client, items: QuoteItem[] = []) => {
    setEditingQuote(quote);
    const clientName = client?.nome || quote.client_name || '';
    const clientPhone = client?.telefone || '';
    const summary = items.length > 0
      ? items.map(i => `${i.qtd > 1 ? `${i.qtd}x ` : ''}${i.descricao}`).join(', ')
      : '';
    
    const sentDate = (quote.enviado_em || quote.created_at || new Date().toISOString()).split('T')[0];
    const validadeDate = (quote.validade || '').split('T')[0];

    setEditQuoteForm({
      client_id: quote.client_id,
      client_name: clientName,
      client_phone: clientPhone,
      total: String(quote.total || 0),
      desconto: String(quote.desconto || 0),
      status: quote.status,
      enviado_em: sentDate,
      validade: validadeDate,
      itens_resumo: summary,
      observacoes: quote.observacoes || '',
      follow_up_tentativas: quote.follow_up_tentativas || 0,
    });
    setIsEditQuoteModalOpen(true);
  };

  const handleSaveEditQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuote) return;

    const parsedTotal = parseFloat(editQuoteForm.total) || 0;
    const parsedDesconto = parseFloat(editQuoteForm.desconto) || 0;

    // 1. Update quote
    const updatedQuote: Quote = {
      ...editingQuote,
      client_name: editQuoteForm.client_name.trim() || editingQuote.client_name,
      client_id: editQuoteForm.client_id || editingQuote.client_id,
      total: parsedTotal,
      desconto: parsedDesconto,
      status: editQuoteForm.status,
      enviado_em: editQuoteForm.enviado_em ? `${editQuoteForm.enviado_em}T12:00:00Z` : editingQuote.enviado_em,
      validade: editQuoteForm.validade,
      observacoes: editQuoteForm.observacoes.trim(),
      follow_up_tentativas: Number(editQuoteForm.follow_up_tentativas) || 0,
    };

    // 2. Update client if exists
    let updatedClients = [...db.clients];
    if (updatedQuote.client_id) {
      updatedClients = db.clients.map(c => {
        if (c.id === updatedQuote.client_id) {
          return {
            ...c,
            nome: editQuoteForm.client_name.trim() || c.nome,
            telefone: editQuoteForm.client_phone.trim() || c.telefone,
          };
        }
        return c;
      });
    }

    // 3. Update items summary
    let updatedQuoteItems = [...db.quoteItems];
    const existingItems = db.quoteItems.filter(i => i.quote_id === editingQuote.id);
    if (editQuoteForm.itens_resumo.trim()) {
      if (existingItems.length > 0) {
        // Update first item description
        updatedQuoteItems = db.quoteItems.map(i => {
          if (i.id === existingItems[0].id) {
            return {
              ...i,
              descricao: editQuoteForm.itens_resumo.trim(),
              preco_unit: parsedTotal,
              subtotal: parsedTotal,
            };
          }
          return i;
        });
      } else {
        const newItem: QuoteItem = {
          id: generateId(),
          quote_id: editingQuote.id,
          service_id: 'custom',
          descricao: editQuoteForm.itens_resumo.trim(),
          qtd: 1,
          preco_unit: parsedTotal,
          subtotal: parsedTotal,
        };
        updatedQuoteItems.push(newItem);
      }
    }

    const updatedQuotes = db.quotes.map(q => q.id === editingQuote.id ? updatedQuote : q);

    onUpdateDb({
      ...db,
      quotes: updatedQuotes,
      clients: updatedClients,
      quoteItems: updatedQuoteItems,
    });

    const itemsForSupabase = updatedQuoteItems.filter(i => i.quote_id === updatedQuote.id);
    supabaseSaveQuote(updatedQuote, itemsForSupabase);

    showToast(`Orçamento ${updatedQuote.numero} atualizado com sucesso!`);
    setIsEditQuoteModalOpen(false);
    setEditingQuote(null);
  };

  // Interactive feedback
  const [copiedQuoteId, setCopiedQuoteId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4000);
  };

  // Base message from company settings or user specification
  const defaultFollowUpTemplate = db.companySettings?.mensagem_follow_up_orcamento || 
    'Olá {cliente}! Ficou alguma dúvida sobre seu orçamento na HigiPro ou podemos agendar? 😊';

  // Month and Year selection for Follow-up (Mês corrente por padrão)
  const now = new Date();
  const currentMonthNum = now.getMonth();
  const currentYearNum = now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);

  // Available years dynamically discovered from quotes
  const availableYears = React.useMemo(() => {
    const years = new Set<number>([currentYearNum, currentYearNum - 1, currentYearNum + 1]);
    (db.quotes || []).forEach(q => {
      const d = q.enviado_em || q.created_at;
      if (d) {
        const y = parseDateComponents(d).year;
        if (!isNaN(y) && y > 2000) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [db.quotes, currentYearNum]);

  // Sent quotes waiting for customer response (filtered strictly by selected month and year, defaults to current month)
  const sentQuotes = db.quotes.filter(q => {
    if (q.status !== 'enviado' || q.arquivado) return false;
    const dateStr = q.enviado_em || q.created_at;
    if (!dateStr) return false;
    const { year, month } = parseDateComponents(dateStr);
    if (year !== selectedYear) return false;
    if (month !== selectedMonth) return false;
    return true;
  });

  // Compute time difference and alert status for each quote
  const todayDateOnly = now.toISOString().split('T')[0];

  const enrichedQuotes = sentQuotes.map(quote => {
    const client = db.clients.find(c => c.id === quote.client_id);
    const items = db.quoteItems.filter(i => i.quote_id === quote.id);
    const sentDateStr = quote.enviado_em || quote.created_at;
    const sentDate = new Date(sentDateStr);
    
    // Calculate difference
    const diffMs = Math.max(0, now.getTime() - sentDate.getTime());
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    const sentDateOnly = (sentDateStr || '').split('T')[0];
    // A quote is due for follow-up if at least 1 full day (24h) has passed or calendar day is earlier
    const isDue = diffDays >= 1 || (todayDateOnly > sentDateOnly);
    const displayDays = diffDays === 0 && isDue ? 1 : diffDays;

    return {
      quote,
      client,
      items,
      sentDateStr,
      diffHours,
      diffDays: displayDays,
      isDue,
    };
  });

  // KPI Metrics
  const alertQuotesCount = enrichedQuotes.filter(item => item.isDue).length;
  const totalSentValue = enrichedQuotes.reduce((sum, item) => sum + (item.quote.total || 0), 0);
  const alreadyFollowedUpCount = enrichedQuotes.filter(item => (item.quote.follow_up_tentativas || 0) > 0).length;

  // Filtered and Sorted list
  const filteredQuotes = enrichedQuotes.filter(item => {
    if (!item) return false;
    // 1. Search term filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      const clientName = String(item.client?.nome || item.quote?.client_name || '').toLowerCase();
      const matchClient = clientName.includes(query);
      const matchNum = String(item.quote?.numero || '').toLowerCase().includes(query);
      const matchPhone = String(item.client?.telefone || (item.quote as any)?.client_phone || '').includes(query);
      const matchItems = Array.isArray(item.items) && item.items.some(i => String(i?.descricao || '').toLowerCase().includes(query));
      if (!matchClient && !matchNum && !matchPhone && !matchItems) return false;
    }

    // 2. Filter Type
    if (filterType === 'alertas') {
      return item.isDue;
    }
    if (filterType === 'hoje') {
      return !item.isDue;
    }
    if (filterType === 'contatados') {
      return (item.quote.follow_up_tentativas || 0) > 0;
    }
    return true; // 'todos'
  }).sort((a, b) => {
    if (sortBy === 'tempo') {
      // Prioritize oldest waiting quotes
      return new Date(a.sentDateStr).getTime() - new Date(b.sentDateStr).getTime();
    }
    if (sortBy === 'recentes') {
      return new Date(b.sentDateStr).getTime() - new Date(a.sentDateStr).getTime();
    }
    if (sortBy === 'valor') {
      return (b.quote.total || 0) - (a.quote.total || 0);
    }
    return 0;
  });

  // Build message text for a client
  const generateMessageText = (client?: Client) => {
    if (useClientNameGreeting && client?.nome) {
      const firstName = client.nome.trim().split(' ')[0];
      return `Olá, *${firstName}*! Ficou alguma dúvida sobre o seu orçamento na HigiPro ou podemos agendar? 😊`;
    }
    const clientName = client?.nome ? client.nome.trim().split(' ')[0] : 'Cliente';
    return defaultFollowUpTemplate.replace(/{cliente}/g, clientName);
  };

  // Dispatch WhatsApp with follow-up message
  const handleSendWhatsApp = (quote: Quote, client?: Client) => {
    if (!client) {
      alert('Cadastro do cliente não localizado.');
      return;
    }

    const cleanPhone = cleanWhatsAppPhone(client.telefone);
    if (!cleanPhone) {
      alert(`O cliente "${client.nome}" não possui número de telefone válido para WhatsApp.`);
      return;
    }

    const message = generateMessageText(client);
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');

    // Register follow-up in database
    const nowIso = new Date().toISOString();
    const nowDate = nowIso.split('T')[0];

    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quote.id) {
        return {
          ...q,
          follow_up_enviado_em: nowIso,
          follow_up_tentativas: (q.follow_up_tentativas || 0) + 1,
          follow_up_status: 'enviado' as const,
        };
      }
      return q;
    });

    const newLog: RecurrenceLog = {
      id: generateId(),
      recurrence_id: quote.id,
      quote_id: quote.id,
      tipo: 'follow_up_orcamento',
      client_name: client.nome,
      data_contato: nowDate,
      resultado: 'sem_retorno',
      observacoes: `Follow-up de 1 dia enviado via WhatsApp para orçamento ${quote.numero} (${formatCurrency(quote.total)}).`,
    };

    onUpdateDb({
      ...db,
      quotes: updatedQuotes,
      recurrenceLogs: [newLog, ...db.recurrenceLogs],
    });

    showToast(`WhatsApp de Follow-up aberto e registrado para ${client.nome}!`);
  };

  // Copy message text to clipboard
  const handleCopyMessage = (quoteId: string, client?: Client) => {
    const text = generateMessageText(client);
    navigator.clipboard.writeText(text);
    setCopiedQuoteId(quoteId);
    showToast('Mensagem copiada para a área de transferência!');
    setTimeout(() => {
      setCopiedQuoteId(prev => (prev === quoteId ? null : prev));
    }, 2500);
  };

  // Fast-track Approve Quote from follow-up
  const handleApproveQuote = (quote: Quote) => {
    const client = db.clients.find(c => c.id === quote.client_id);
    const clientName = client?.nome || quote.client_name;

    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quote.id) {
        return {
          ...q,
          status: 'aprovado' as const,
          follow_up_status: 'respondido' as const,
        };
      }
      return q;
    });

    const newLog: RecurrenceLog = {
      id: generateId(),
      recurrence_id: quote.id,
      quote_id: quote.id,
      tipo: 'follow_up_orcamento',
      client_name: clientName,
      data_contato: new Date().toISOString().split('T')[0],
      resultado: 'sucesso',
      observacoes: `Orçamento ${quote.numero} APROVADO pelo cliente após contato de follow-up!`,
    };

    onUpdateDb({
      ...db,
      quotes: updatedQuotes,
      recurrenceLogs: [newLog, ...db.recurrenceLogs],
    });

    showToast(`Parabéns! Orçamento ${quote.numero} de ${clientName} aprovado com sucesso!`);
  };

  // Open decline modal
  const handleOpenDecline = (quote: Quote) => {
    setQuoteToDecline(quote);
    setDeclineReason('Cliente achou o valor acima do orçamento planejado');
    setIsDeclineModalOpen(true);
  };

  // Confirm Decline
  const handleConfirmDecline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteToDecline) return;

    const client = db.clients.find(c => c.id === quoteToDecline.client_id);
    const clientName = client?.nome || quoteToDecline.client_name;

    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quoteToDecline.id) {
        return {
          ...q,
          status: 'recusado' as const,
          follow_up_status: 'sem_interesse' as const,
        };
      }
      return q;
    });

    const newLog: RecurrenceLog = {
      id: generateId(),
      recurrence_id: quoteToDecline.id,
      quote_id: quoteToDecline.id,
      tipo: 'follow_up_orcamento',
      client_name: clientName,
      data_contato: new Date().toISOString().split('T')[0],
      resultado: 'recusado',
      observacoes: `Cliente recusou o orçamento ${quoteToDecline.numero}. Motivo: ${declineReason.trim()}`,
    };

    onUpdateDb({
      ...db,
      quotes: updatedQuotes,
      recurrenceLogs: [newLog, ...db.recurrenceLogs],
    });

    setIsDeclineModalOpen(false);
    setQuoteToDecline(null);
    showToast(`Orçamento ${quoteToDecline.numero} marcado como recusado.`);
  };

  // Open delete card modal
  const handleOpenDelete = (quote: Quote) => {
    setQuoteToDelete(quote);
    setIsDeleteModalOpen(true);
  };

  // Remove card from follow-up (archive follow-up while preserving quote record)
  const handleRemoveFromFollowUp = (quote: Quote) => {
    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quote.id) {
        return {
          ...q,
          arquivado: true,
          arquivado_em: new Date().toISOString(),
          arquivado_motivo: 'Card removido do Follow-up',
          follow_up_status: 'sem_interesse' as const,
        };
      }
      return q;
    });

    onUpdateDb({
      ...db,
      quotes: updatedQuotes,
    });

    const updatedQ = updatedQuotes.find(q => q.id === quote.id);
    if (updatedQ) {
      const items = db.quoteItems.filter(i => i.quote_id === quote.id);
      supabaseSaveQuote(updatedQ, items);
    }

    showToast(`Card do orçamento ${quote.numero} removido do Follow-up.`);
    setIsDeleteModalOpen(false);
    setQuoteToDelete(null);
  };

  // Permanently delete quote and items
  const handleDeleteQuotePermanently = (quote: Quote) => {
    const updatedQuotes = db.quotes.filter(q => q.id !== quote.id);
    const updatedQuoteItems = db.quoteItems.filter(i => i.quote_id !== quote.id);

    onUpdateDb({
      ...db,
      quotes: updatedQuotes,
      quoteItems: updatedQuoteItems,
    });

    showToast(`Orçamento ${quote.numero} e card de follow-up excluídos com sucesso.`);
    setIsDeleteModalOpen(false);
    setQuoteToDelete(null);
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#071a33] text-white px-4 py-3 rounded-xl shadow-2xl border border-blue-800 flex items-center gap-2.5 animate-bounce text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* KPI Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Alertas 1+ Dia */}
        <div className={`p-4 rounded-2xl border transition-all ${
          alertQuotesCount > 0 
            ? 'bg-amber-500/10 border-amber-300/80 shadow-xs' 
            : 'bg-white border-slate-100 shadow-2xs'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">Alertas Ativos</span>
            <span className={`p-1.5 rounded-lg ${alertQuotesCount > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
              <BellRing className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-black text-slate-800 font-display">
              {alertQuotesCount}
            </h3>
            <p className="text-[11px] text-amber-700 font-medium mt-0.5">
              {alertQuotesCount === 1 ? '1 dia sem resposta' : '1+ dias sem resposta'}
            </p>
          </div>
        </div>

        {/* Total Enviados Aguardando */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700">Total Aguardando</span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-black text-slate-800 font-display">
              {enrichedQuotes.length}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Propostas comerciais enviadas
            </p>
          </div>
        </div>

        {/* Valor Total em Negociação */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700">Valor em Negociação</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 font-display truncate">
              {formatCurrency(totalSentValue)}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Receita potencial a resgatar
            </p>
          </div>
        </div>

        {/* Follow-ups Realizados */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700">Já Contatados</span>
            <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
              <MessageSquare className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-black text-slate-800 font-display">
              {alreadyFollowedUpCount}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Clientes com follow-up enviado
            </p>
          </div>
        </div>
      </div>

      {/* Primary Alert Banner when 1+ day quotes exist */}
      {alertQuotesCount > 0 ? (
        <div className="p-4 bg-gradient-to-r from-amber-50 to-amber-100/60 border border-amber-200/80 rounded-2xl flex items-start gap-3.5 shadow-xs">
          <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs shrink-0 mt-0.5 animate-pulse">
            <BellRing className="w-4 h-4" />
          </div>
          <div className="text-xs text-amber-950 leading-relaxed flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <p className="font-black text-sm text-amber-900 font-display">
                🚨 Alerta de 1 dia: {alertQuotesCount} {alertQuotesCount === 1 ? 'orçamento sem resposta' : 'orçamentos sem resposta'}
              </p>
              <span className="text-[11px] font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-md w-fit">
                Timing Ideal de Retorno
              </span>
            </div>
            <p className="mt-1 text-amber-900/90">
              O sistema detectou orçamentos enviados há <strong>1 dia ou mais</strong> que ainda não responderam. 
              Clique no botão verde de cada cliente para disparar a mensagem oficial no WhatsApp e destravar o fechamento!
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3.5 bg-emerald-50/80 border border-emerald-200/60 rounded-2xl flex items-center gap-3 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Tudo em dia! Não há nenhum orçamento pendente sem resposta há mais de 1 dia.</span>
        </div>
      )}

      {/* Message Preview & Customization Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-bold text-slate-800">Mensagem Oficial de Follow-up (1 dia sem resposta)</span>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useClientNameGreeting}
              onChange={(e) => setUseClientNameGreeting(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="font-medium">Personalizar saudação com nome do cliente</span>
          </label>
        </div>

        {/* Message preview quotation */}
        <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs text-slate-700 leading-relaxed font-sans italic relative">
          <span className="text-slate-400 select-none font-serif text-lg leading-none absolute top-2 left-2">“</span>
          <p className="pl-3 pr-2">
            {generateMessageText({ 
              id: 'ex', 
              nome: 'Mariana', 
              telefone: '', 
              origem: 'Google', 
              email: '', 
              cidade: '', 
              estado: '', 
              endereco: '', 
              CEP: '', 
              observacoes: '', 
              tags: [], 
              created_at: '' 
            })}
          </p>
          <span className="text-slate-400 select-none font-serif text-lg leading-none absolute bottom-1 right-2">”</span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
        {/* Month & Year Selection Bar (Defaults to Current Month) */}
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

        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome do cliente, telefone, número do orçamento ou serviço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <span className="text-xs font-bold text-slate-500 shrink-0">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="w-full md:w-auto px-3 py-2 text-xs bg-slate-50 border border-slate-200/80 rounded-xl font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-blue-600"
            >
              <option value="tempo">Maior tempo sem resposta (Urgentes)</option>
              <option value="recentes">Mais recentes primeiro</option>
              <option value="valor">Maior valor do orçamento (R$)</option>
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setFilterType('alertas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterType === 'alertas'
                ? 'bg-amber-500 text-slate-950 shadow-xs ring-2 ring-amber-400/40'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <span>🚨 Alertas Ativos (1+ dia)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              filterType === 'alertas' ? 'bg-slate-900 text-amber-300' : 'bg-amber-200 text-amber-900'
            }`}>
              {alertQuotesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterType === 'todos'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <span>Todos Enviados Pendentes</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white/20">
              {enrichedQuotes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('hoje')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterType === 'hoje'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <span>Enviados Hoje (&lt; 24h)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white/20">
              {enrichedQuotes.filter(item => !item.isDue).length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('contatados')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterType === 'contatados'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <span>Follow-up Já Realizado</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white/20">
              {alreadyFollowedUpCount}
            </span>
          </button>
        </div>
      </div>

      {/* Quotes Cards Grid */}
      {filteredQuotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredQuotes.map(({ quote, client, items, sentDateStr, diffHours, diffDays, isDue }) => {
            const clientName = client?.nome || quote.client_name;
            const servicesSummary = items.length > 0 
              ? items.map(i => `${i.qtd}x ${i.descricao}`).join(' • ')
              : 'Higienização de Estofados';

            const isCopied = copiedQuoteId === quote.id;
            const hasFollowUpSent = (quote.follow_up_tentativas || 0) > 0;

            return (
              <div
                key={quote.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
                  isDue 
                    ? 'border-amber-300 bg-amber-50/10' 
                    : 'border-slate-200/80'
                }`}
              >
                <div className="space-y-3.5">
                  {/* Card Header: Number, Alert Tag & Total */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-mono text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {quote.numero}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditQuote(quote, client, items)}
                          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Editar Card e Orçamento"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(quote)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Deletar este card do Follow-up"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </button>
                        {isDue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse shadow-2xs">
                            <AlertTriangle className="w-3 h-3" />
                            Alerta: {diffDays} {diffDays === 1 ? 'dia sem resposta' : 'dias sem resposta'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <Clock className="w-3 h-3 text-blue-600" />
                            Enviado hoje ({diffHours}h atrás)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>Enviado em: <strong>{formatDate(sentDateStr)}</strong></span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-base sm:text-lg font-black text-emerald-600 font-display block">
                        {formatCurrency(quote.total)}
                      </span>
                      {quote.desconto && quote.desconto > 0 && (
                        <span className="text-[10px] text-slate-400 font-medium line-through">
                          {formatCurrency((quote.subtotal || quote.total) + quote.desconto)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Client Info Block */}
                  <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm truncate">
                        <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">{clientName}</span>
                      </div>
                      {client?.origem && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                          {client.origem}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-slate-600 text-[11px]">
                      <span className="font-mono flex items-center gap-1">
                        <Smartphone className="w-3 h-3 text-emerald-600" />
                        {client?.telefone ? formatPhone(client.telefone) : 'Telefone não cadastrado'}
                      </span>
                      {client && (
                        <button
                          type="button"
                          onClick={() => onOpenClientCard(client)}
                          className="text-blue-600 hover:text-blue-800 font-semibold hover:underline cursor-pointer"
                        >
                          Ficha do Cliente
                        </button>
                      )}
                    </div>

                    {/* Services Included */}
                    <div className="pt-1.5 border-t border-slate-200/60 text-[11px] text-slate-600 truncate">
                      <span className="font-semibold text-slate-700">Itens: </span>
                      <span className="text-slate-600 truncate">{servicesSummary}</span>
                    </div>

                    {/* Lembrete de Retorno do Orçamento */}
                    {quote.tem_lembrete && quote.lembrete_data && (
                      <div className={`mt-2 p-2 rounded-lg border text-xs ${
                        quote.lembrete_concluido 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                          : 'bg-amber-50 text-amber-900 border-amber-300 font-bold'
                      }`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Lembrete para chamar: <strong>{formatDate(quote.lembrete_data)}</strong></span>
                          </span>
                          {quote.lembrete_concluido && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">Feito</span>
                          )}
                        </div>
                        {quote.lembrete_motivo && (
                          <p className="mt-1 text-[11px] text-slate-700 italic font-normal">
                            Motivo: "{quote.lembrete_motivo}"
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Follow-up Message Preview Box */}
                  <div className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl text-xs text-slate-700 relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-amber-600" />
                        Mensagem WhatsApp
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(quote.id, client)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1 ${
                          isCopied 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                        title="Copiar texto da mensagem"
                      >
                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 text-slate-500" />}
                        <span>{isCopied ? 'Copiado!' : 'Copiar Texto'}</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-700 italic leading-relaxed">
                      “{generateMessageText(client)}”
                    </p>

                    {/* Dispatch History status */}
                    <div className="mt-2 pt-1.5 border-t border-amber-200/50 flex items-center justify-between text-[10px]">
                      {hasFollowUpSent ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Follow-up enviado em {formatDateTime(quote.follow_up_enviado_em)} ({quote.follow_up_tentativas}ª tentativa)
                        </span>
                      ) : (
                        <span className="text-amber-800 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Aguardando 1º envio de follow-up
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                  {/* Primary WhatsApp 1-Click Action */}
                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(quote, client)}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <Smartphone className="w-4 h-4 text-emerald-100" />
                    <span>Enviar WhatsApp (Follow-up)</span>
                  </button>

                  {/* Secondary Quick Actions */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs">
                    {/* Editar Orçamento / Card */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditQuote(quote, client, items)}
                      className="py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 text-[11px]"
                      title="Editar valores, cliente ou anotações deste orçamento"
                    >
                      <Edit3 className="w-3 h-3 text-blue-600" />
                      <span>Editar</span>
                    </button>

                    {/* Ver Orçamento */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedQuoteDetails(quote);
                        setIsQuoteDetailsOpen(true);
                      }}
                      className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 text-[11px]"
                      title="Ver itens e detalhes do orçamento"
                    >
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>Detalhes</span>
                    </button>

                    {/* Cliente Aprovou */}
                    <button
                      type="button"
                      onClick={() => handleApproveQuote(quote)}
                      className="py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 text-[11px]"
                      title="Cliente aprovou! Marcar orçamento como aprovado"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Aprovou!</span>
                    </button>

                    {/* Cliente Recusou */}
                    <button
                      type="button"
                      onClick={() => handleOpenDecline(quote)}
                      className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 text-[11px]"
                      title="Marcar que cliente não teve interesse"
                    >
                      <XCircle className="w-3 h-3 text-rose-500" />
                      <span>Recusou</span>
                    </button>

                    {/* Deletar Card */}
                    <button
                      type="button"
                      onClick={() => handleOpenDelete(quote)}
                      className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 text-[11px]"
                      title="Deletar este card do Follow-up"
                    >
                      <Trash2 className="w-3 h-3 text-rose-600" />
                      <span>Deletar</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="w-10 h-10 text-emerald-500" />}
          title={
            filterType === 'alertas' 
              ? `Nenhum alerta de follow-up pendente em ${monthName(selectedMonth)}/${selectedYear}`
              : `Nenhum orçamento encontrado em ${monthName(selectedMonth)}/${selectedYear}`
          }
          description={
            filterType === 'alertas'
              ? "Excelente! Todos os orçamentos enviados neste período estão respondidos ou foram enviados há menos de 24 horas."
              : "Não há propostas comerciais enviadas correspondentes a este período ou aos filtros ativos."
          }
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

      {/* Modal: View Quote Details */}
      <Modal
        isOpen={isQuoteDetailsOpen && selectedQuoteDetails !== null}
        onClose={() => {
          setIsQuoteDetailsOpen(false);
          setSelectedQuoteDetails(null);
        }}
        title={`Detalhes do Orçamento ${selectedQuoteDetails?.numero}`}
        size="lg"
      >
        {selectedQuoteDetails && (
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm font-display">
                  {selectedQuoteDetails.client_name}
                </h4>
                <p className="text-[11px] text-slate-500">
                  Data de emissão: {formatDate(selectedQuoteDetails.created_at)} • Validade: {formatDate(selectedQuoteDetails.validade)}
                </p>
              </div>
              <span className="px-2.5 py-1 bg-blue-100 text-blue-800 font-bold rounded-lg text-xs uppercase">
                {selectedQuoteDetails.status}
              </span>
            </div>

            {/* Items Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-[11px] text-slate-600 font-bold uppercase">
                  <tr>
                    <th className="p-2.5">Item / Serviço</th>
                    <th className="p-2.5 text-center">Qtd</th>
                    <th className="p-2.5 text-right">Unitário</th>
                    <th className="p-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {db.quoteItems
                    .filter(i => i.quote_id === selectedQuoteDetails.id)
                    .map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-medium">{item.descricao}</td>
                        <td className="p-2.5 text-center font-mono">{item.qtd}</td>
                        <td className="p-2.5 text-right font-mono">{formatCurrency(item.preco_unit)}</td>
                        <td className="p-2.5 text-right font-mono font-bold">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1 text-slate-700">
              {selectedQuoteDetails.desconto && selectedQuoteDetails.desconto > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Desconto Concedido:</span>
                  <span className="text-rose-600 font-bold">- {formatCurrency(selectedQuoteDetails.desconto)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1">
                <span>Valor Total da Proposta:</span>
                <span className="text-emerald-600 font-display">{formatCurrency(selectedQuoteDetails.total)}</span>
              </div>
            </div>

            {selectedQuoteDetails.observacoes && (
              <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl text-slate-700">
                <span className="font-bold text-blue-900 block mb-0.5">Observações:</span>
                <p className="italic">{selectedQuoteDetails.observacoes}</p>
              </div>
            )}

            <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsQuoteDetailsOpen(false);
                    handleOpenDelete(selectedQuoteDetails);
                  }}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer text-xs transition"
                  title="Deletar este card do Follow-up"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Deletar Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const client = db.clients.find(c => c.id === selectedQuoteDetails.client_id);
                    handleSendWhatsApp(selectedQuoteDetails, client);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-xs text-xs"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Enviar WhatsApp de Follow-up</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Decline Quote Record */}
      <Modal
        isOpen={isDeclineModalOpen && quoteToDecline !== null}
        onClose={() => {
          setIsDeclineModalOpen(false);
          setQuoteToDecline(null);
        }}
        title={`Registrar Recusa do Orçamento ${quoteToDecline?.numero}`}
      >
        {quoteToDecline && (
          <form onSubmit={handleConfirmDecline} className="space-y-4 text-xs">
            <p className="text-slate-600">
              Registre o motivo da não contratação pelo cliente para aprimoramento da estratégia comercial:
            </p>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Motivo da Recusa *</label>
              <select
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white cursor-pointer font-medium"
              >
                <option value="Cliente achou o valor acima do orçamento planejado">Preço / Valor acima do esperado</option>
                <option value="Optou por fazer com outro profissional/empresa">Optou por concorrente</option>
                <option value="Vai deixar para fazer no próximo mês">Adiado para mês futuro</option>
                <option value="Decidiu não realizar o serviço no momento">Desistiu do serviço</option>
                <option value="Não respondeu às tentativas de contato">Sem retorno definitivo</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeclineModalOpen(false);
                  setQuoteToDecline(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl font-semibold cursor-pointer text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer shadow-xs"
              >
                Confirmar Recusa
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Editar Orçamento e Card de Follow-up */}
      <Modal
        isOpen={isEditQuoteModalOpen && editingQuote !== null}
        onClose={() => {
          setIsEditQuoteModalOpen(false);
          setEditingQuote(null);
        }}
        title={`Editar Orçamento ${editingQuote?.numero} (Follow-up)`}
        size="md"
      >
        {editingQuote && (
          <form onSubmit={handleSaveEditQuote} className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl text-blue-900 flex items-center justify-between">
              <div>
                <span className="font-bold block text-sm">Proposta {editingQuote.numero}</span>
                <span className="text-[11px] text-blue-700">Edite os valores, cliente, status e detalhes do follow-up.</span>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                editQuoteForm.status === 'enviado' 
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : editQuoteForm.status === 'aprovado'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-slate-200 text-slate-800'
              }`}>
                {editQuoteForm.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Cliente Selecionado */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Cliente Vinculado</label>
                <select
                  value={editQuoteForm.client_id}
                  onChange={(e) => {
                    const selCli = db.clients.find(c => c.id === e.target.value);
                    setEditQuoteForm({
                      ...editQuoteForm,
                      client_id: e.target.value,
                      client_name: selCli?.nome || editQuoteForm.client_name,
                      client_phone: selCli?.telefone || editQuoteForm.client_phone,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-medium"
                >
                  <option value="">Selecione um cliente cadastrado...</option>
                  {db.clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nome} {c.telefone ? `(${c.telefone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nome do Cliente */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Nome do Cliente *</label>
                <input
                  type="text"
                  required
                  value={editQuoteForm.client_name}
                  onChange={(e) => setEditQuoteForm({ ...editQuoteForm, client_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Telefone / WhatsApp */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">WhatsApp / Telefone *</label>
                <input
                  type="text"
                  required
                  value={editQuoteForm.client_phone}
                  onChange={(e) => setEditQuoteForm({ ...editQuoteForm, client_phone: e.target.value })}
                  placeholder="(54) 99999-9999"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-mono"
                />
              </div>

              {/* Valor Total */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Valor Total (R$) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-medium">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editQuoteForm.total}
                    onChange={(e) => setEditQuoteForm({ ...editQuoteForm, total: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-bold font-mono"
                  />
                </div>
              </div>

              {/* Desconto */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Desconto Concedido (R$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-medium">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editQuoteForm.desconto}
                    onChange={(e) => setEditQuoteForm({ ...editQuoteForm, desconto: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* Status do Orçamento */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Status da Proposta</label>
                <select
                  value={editQuoteForm.status}
                  onChange={(e) => setEditQuoteForm({ ...editQuoteForm, status: e.target.value as Quote['status'] })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-bold"
                >
                  <option value="enviado">Enviado (Aguardando Resposta / Follow-up)</option>
                  <option value="aprovado">Aprovado pelo Cliente</option>
                  <option value="recusado">Recusado pelo Cliente</option>
                  <option value="rascunho">Rascunho Interno</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              {/* Tentativas de Follow-up */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Tentativas de Follow-up Feitas</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={editQuoteForm.follow_up_tentativas}
                  onChange={(e) => setEditQuoteForm({ ...editQuoteForm, follow_up_tentativas: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-mono"
                />
              </div>

              {/* Data de Envio */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Data de Envio do Orçamento</label>
                <input
                  type="date"
                  value={editQuoteForm.enviado_em}
                  onChange={(e) => setEditQuoteForm({ ...editQuoteForm, enviado_em: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Validade */}
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Validade da Proposta</label>
                <input
                  type="date"
                  value={editQuoteForm.validade}
                  onChange={(e) => setEditQuoteForm({ ...editQuoteForm, validade: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>

              {/* Itens / Serviços Descrição */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Itens / Serviços Incluídos</label>
                <input
                  type="text"
                  value={editQuoteForm.itens_resumo}
                  onChange={(e) => setEditQuoteForm({ ...editQuoteForm, itens_resumo: e.target.value })}
                  placeholder="Ex: Higienização Sofá Retrátil 3 Lugares + Impermeabilização"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 font-medium"
                />
              </div>

              {/* Observações */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Observações Comerciais / Anotações do Follow-up</label>
                <textarea
                  rows={2}
                  value={editQuoteForm.observacoes}
                  onChange={(e) => setEditQuoteForm({ ...editQuoteForm, observacoes: e.target.value })}
                  placeholder="Ex: Cliente tem interesse para o final do mês; contatar após as 18h..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsEditQuoteModalOpen(false);
                  setEditingQuote(null);
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

      {/* Modal: Deletar Card do Follow-up */}
      <Modal
        isOpen={isDeleteModalOpen && quoteToDelete !== null}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setQuoteToDelete(null);
        }}
        title={`Deletar Card do Follow-up • ${quoteToDelete?.numero}`}
        size="md"
      >
        {quoteToDelete && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-800 text-sm">
                <span>{quoteToDelete.client_name}</span>
                <span className="text-emerald-600 font-extrabold">{formatCurrency(quoteToDelete.total)}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Orçamento #{quoteToDelete.numero} • Enviado em {formatDate(quoteToDelete.enviado_em || quoteToDelete.created_at)}
              </p>
            </div>

            <p className="text-slate-600 font-medium leading-relaxed">
              O que você deseja fazer com este card de follow-up?
            </p>

            <div className="space-y-2.5">
              {/* Opção 1: Remover apenas do Follow-up */}
              <button
                type="button"
                onClick={() => handleRemoveFromFollowUp(quoteToDelete)}
                className="w-full text-left p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100 transition cursor-pointer flex items-start gap-3 group"
              >
                <div className="p-2 rounded-lg bg-amber-500 text-white shrink-0 mt-0.5">
                  <Archive className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-amber-900">
                    Remover apenas do Follow-up (Arquivar)
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    O card é retirado imediatamente da tela de follow-up e dos alertas, mantendo o orçamento e seus dados salvos no sistema.
                  </p>
                </div>
              </button>

              {/* Opção 2: Excluir definitivamente */}
              <button
                type="button"
                onClick={() => handleDeleteQuotePermanently(quoteToDelete)}
                className="w-full text-left p-3.5 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 transition cursor-pointer flex items-start gap-3 group"
              >
                <div className="p-2 rounded-lg bg-rose-600 text-white shrink-0 mt-0.5">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-rose-900">
                    Excluir Orçamento Definitivamente
                  </h4>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    Exclui de forma permanente o orçamento #{quoteToDelete.numero} e todos os seus itens da base de dados.
                  </p>
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setQuoteToDelete(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
