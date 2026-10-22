/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Users, Calendar, 
  ArrowRightLeft, FileCheck, HelpCircle, ArrowUpRight, ArrowDownRight, FileText,
  BellRing, ArrowRight, Clock, MessageSquare, AlertCircle, Star,
  Pencil, Trash2, ChevronDown, CheckCircle2, AlertTriangle, ArrowLeft, X,
  LayoutDashboard, Calculator, Target, Zap, RefreshCw
} from 'lucide-react';
import { DatabaseState, Client, ServiceOrder, Transaction, Appointment, Quote, AppointmentStatus, OSStatus, PaymentMethod, TECNICOS_HIGIPRO } from '../types';
import { formatCurrency, formatDate, formatPhone, formatDateTime, monthName, parseDateComponents, cleanWhatsAppPhone } from '../lib/utils';
import { Modal, ConfirmDialog, StatusBadge } from './UIComponents';
import { SectionErrorBoundary } from './ErrorBoundary';
import { FaturamentoGrafico } from './FaturamentoGrafico';
import { PeriodFilter } from './PeriodFilter';
import { supabaseDeleteServiceOrder, supabaseSaveServiceOrder, supabaseSaveTransaction } from '../lib/supabase';
import { completeServiceAndSyncAll } from '../lib/serviceCompletion';
import { triggerCloudUpload } from '../lib/database';

interface DashboardProps {
  db: DatabaseState;
  onUpdateDb?: (updatedState: DatabaseState) => void;
  setPage: (page: any) => void;
  setSelectedClient: (client: Client) => void;
  setClientDrawerOpen: (isOpen: boolean) => void;
  onNavigateToRecorrenciaTab?: (tab: 'followup' | 'pos_venda' | 'leads' | 'logs') => void;
}

export const Dashboard = React.memo<DashboardProps>(({ 
  db, onUpdateDb, setPage, setSelectedClient, setClientDrawerOpen, onNavigateToRecorrenciaTab
}) => {
  const [activeModal, setActiveModal] = useState<'receitas' | 'despesas' | 'receber' | 'clientes' | null>(null);
  const [receivableToast, setReceivableToast] = useState<string | null>(null);

  useEffect(() => {
    if (!receivableToast) return;
    const timer = setTimeout(() => {
      setReceivableToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [receivableToast]);

  // Appointment Edit & Delete states
  const [appointmentToEdit, setAppointmentToEdit] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);
  const [osToDelete, setOsToDelete] = useState<ServiceOrder | null>(null);

  // Form field state for editing appointment
  const [editClientId, setEditClientId] = useState('');
  const [editServiceText, setEditServiceText] = useState('');
  const [editDateTime, setEditDateTime] = useState('');
  const [editDuration, setEditDuration] = useState('120');
  const [editTechName, setEditTechName] = useState<string>(TECNICOS_HIGIPRO[0]);
  const [editEndereco, setEditEndereco] = useState('');
  const [editObservacoes, setEditObservacoes] = useState('');
  const [editStatus, setEditStatus] = useState<AppointmentStatus>('agendado');
  const [editValorInput, setEditValorInput] = useState('');

  // Handlers for Appointment actions
  const handleOpenEditAppointment = (app: Appointment) => {
    setAppointmentToEdit(app);
    setEditClientId(app.client_id || '');
    setEditServiceText(app.servicos || '');
    setEditDateTime(app.data_hora || '');
    setEditDuration((app.duracao || 60).toString());
    setEditTechName(app.tecnico || TECNICOS_HIGIPRO[0]);
    setEditEndereco(app.endereco || '');
    setEditObservacoes(app.observacoes || '');
    setEditStatus(app.status || 'agendado');
    setEditValorInput(typeof app.valor === 'number' && !isNaN(app.valor) ? app.valor.toString() : '');
  };

  const handleEditClientChange = (clientId: string) => {
    setEditClientId(clientId);
    const client = db.clients.find(c => c.id === clientId);
    if (client && client.endereco) {
      setEditEndereco(client.endereco);
    }
  };

  const handleSaveAppointmentEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointmentToEdit || !onUpdateDb) return;

    const client = db.clients.find(c => c.id === editClientId);
    const parsedVal = editValorInput.trim() !== '' ? parseFloat(editValorInput.replace(',', '.')) : undefined;

    const updatedAppointments = db.appointments.map(a => {
      if (a.id === appointmentToEdit.id) {
        return {
          ...a,
          client_id: editClientId || a.client_id,
          client_name: client ? client.nome : a.client_name,
          servicos: editServiceText.trim(),
          data_hora: editDateTime,
          duracao: parseInt(editDuration) || 60,
          tecnico: editTechName,
          endereco: editEndereco.trim(),
          observacoes: editObservacoes.trim(),
          status: editStatus,
          valor: parsedVal,
        };
      }
      return a;
    });

    let updatedOS = db.serviceOrders;
    if (appointmentToEdit.os_id) {
      updatedOS = db.serviceOrders.map(os => {
        if (os.id === appointmentToEdit.os_id) {
          if (editStatus === 'concluido') {
            return {
              ...os,
              status: 'concluido',
              data_conclusao: os.data_conclusao || new Date().toISOString().split('T')[0],
            };
          } else if (editStatus === 'cancelado' && os.status !== 'concluido') {
            return { ...os, status: 'cancelado' };
          }
        }
        return os;
      });
    }

    onUpdateDb({
      ...db,
      appointments: updatedAppointments,
      serviceOrders: updatedOS,
    });

    setAppointmentToEdit(null);
  };

  const handleDeleteAppointmentConfirm = () => {
    if (!appointmentToDelete || !onUpdateDb) return;

    const updatedAppointments = db.appointments.filter(a => a.id !== appointmentToDelete.id);
    onUpdateDb({
      ...db,
      appointments: updatedAppointments,
    });

    setAppointmentToDelete(null);
    if (appointmentToEdit && appointmentToEdit.id === appointmentToDelete.id) {
      setAppointmentToEdit(null);
    }
  };

  // Actions for pending service orders in "Valores e Faturas Pendentes a Receber"
  const handleDeletePendingOS = (os: ServiceOrder) => {
    if (!onUpdateDb) return;
    const updatedOS = (db.serviceOrders || []).filter(o => o.id !== os.id);
    onUpdateDb({
      ...db,
      serviceOrders: updatedOS,
    });
    supabaseDeleteServiceOrder(os.id);
    setOsToDelete(null);
  };

  const handleMarkOSAsPaid = (os: ServiceOrder) => {
    if (!onUpdateDb) return;
    const result = completeServiceAndSyncAll(db, {
      source: 'os',
      id: os.id,
      valor: os.total,
      metodoPagamento: os.metodo_pagamento || 'Pix',
      tecnico: os.tecnico,
    });
    onUpdateDb(result.updatedDb);
    setReceivableToast(`OS ${os.numero} (${os.client_name}) foi alterada para Pago (Concluído)! Os valores foram atualizados automaticamente no Painel Geral, Métricas e Financeiro.`);
  };

  const handleOSStatusChange = (os: ServiceOrder, newStatus: OSStatus) => {
    if (!onUpdateDb) return;
    if (newStatus === 'concluido') {
      handleMarkOSAsPaid(os);
      return;
    }

    const updatedOS = (db.serviceOrders || []).map(o => {
      if (o.id === os.id) {
        return {
          ...o,
          status: newStatus,
        };
      }
      return o;
    });

    const updatedTarget = updatedOS.find(o => o.id === os.id);
    const updatedDb: DatabaseState = {
      ...db,
      serviceOrders: updatedOS,
    };
    onUpdateDb(updatedDb);
    if (updatedTarget) {
      supabaseSaveServiceOrder(updatedTarget);
    }
    triggerCloudUpload(updatedDb);
    setReceivableToast(`Status da OS ${os.numero} alterado para "${newStatus}".`);
  };

  const handleMarkTransactionAsPaid = (tx: Transaction) => {
    if (!onUpdateDb) return;
    const nowStr = new Date().toISOString().split('T')[0];
    const updatedTransactions = (db.transactions || []).map(t => {
      if (t.id === tx.id) {
        return {
          ...t,
          status: 'pago' as const,
          data: t.data || nowStr,
        };
      }
      return t;
    });

    let updatedClients = db.clients;
    if (tx.client_id) {
      updatedClients = (db.clients || []).map(c => {
        if (c.id === tx.client_id) {
          return {
            ...c,
            total_gasto: (c.total_gasto || 0) + (tx.valor || 0),
            ultimo_servico: nowStr,
          };
        }
        return c;
      });
    }

    const updatedDb: DatabaseState = {
      ...db,
      transactions: updatedTransactions,
      clients: updatedClients,
    };

    onUpdateDb(updatedDb);
    const targetTx = updatedTransactions.find(t => t.id === tx.id);
    if (targetTx) {
      supabaseSaveTransaction(targetTx);
    }
    triggerCloudUpload(updatedDb);
    setReceivableToast(`Receita avulsa "${tx.descricao}" marcada como Paga! Valores atualizados no Painel Geral, Métricas e Financeiro.`);
  };

  const handleTransactionStatusChange = (tx: Transaction, newStatus: 'pago' | 'pendente') => {
    if (!onUpdateDb) return;
    if (newStatus === 'pago') {
      handleMarkTransactionAsPaid(tx);
      return;
    }
    const updatedTransactions = (db.transactions || []).map(t => {
      if (t.id === tx.id) {
        return {
          ...t,
          status: 'pendente' as const,
        };
      }
      return t;
    });
    const updatedDb: DatabaseState = {
      ...db,
      transactions: updatedTransactions,
    };
    onUpdateDb(updatedDb);
    const targetTx = updatedTransactions.find(t => t.id === tx.id);
    if (targetTx) {
      supabaseSaveTransaction(targetTx);
    }
    triggerCloudUpload(updatedDb);
    setReceivableToast(`Lançamento "${tx.descricao}" retornado para Pendente.`);
  };

  const handleExcludeOS03to08 = () => {
    if (!onUpdateDb) return;
    const excludedNumbers = new Set(['OS-2026-0003', 'OS-2026-0004', 'OS-2026-0005', 'OS-2026-0006', 'OS-2026-0007', 'OS-2026-0008']);
    const excludedIds = new Set([
      'os-agenda-2026-09-23-01',
      'os-agenda-2026-09-25-02',
      'os-agenda-2026-09-24-01',
      'os-agenda-2026-09-24-02',
      'os-agenda-2026-09-25-01',
      'os-agenda-2026-09-26-01'
    ]);
    const updatedOS = (db.serviceOrders || []).filter(
      o => !excludedNumbers.has(o.numero) && !excludedIds.has(o.id)
    );
    onUpdateDb({
      ...db,
      serviceOrders: updatedOS,
    });
    excludedIds.forEach(id => supabaseDeleteServiceOrder(id));
  };

  const handleQuickStatusChange = (appId: string, newStatus: AppointmentStatus) => {
    if (!onUpdateDb) return;
    const targetApp = db.appointments.find(a => a.id === appId);
    const updatedAppointments = db.appointments.map(a => {
      if (a.id === appId) {
        return { ...a, status: newStatus };
      }
      return a;
    });

    let updatedOS = db.serviceOrders;
    if (targetApp && targetApp.os_id) {
      updatedOS = db.serviceOrders.map(os => {
        if (os.id === targetApp.os_id) {
          if (newStatus === 'concluido') {
            return {
              ...os,
              status: 'concluido',
              data_conclusao: os.data_conclusao || new Date().toISOString().split('T')[0],
            };
          } else if (newStatus === 'cancelado' && os.status !== 'concluido') {
            return { ...os, status: 'cancelado' };
          }
        }
        return os;
      });
    }

    onUpdateDb({
      ...db,
      appointments: updatedAppointments,
      serviceOrders: updatedOS,
    });
  };

  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => now.toISOString().split('T')[0], [now]);
  const todayDateOnly = todayStr;

  // Selected Month & Year for monitoring Dashboard KPIs and activities
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(() => now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(() => now.getFullYear());

  // Available years derived from database transactions, OS, quotes, and appointments
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]);
    (db.transactions || []).forEach(t => {
      if (t.data) {
        const { year } = parseDateComponents(t.data);
        if (year && year >= 2020 && year <= 2035) yearsSet.add(year);
      }
    });
    (db.serviceOrders || []).forEach(os => {
      const d = os.data_conclusao || os.data_agendada || os.created_at;
      if (d) {
        const { year } = parseDateComponents(d);
        if (year && year >= 2020 && year <= 2035) yearsSet.add(year);
      }
    });
    (db.quotes || []).forEach(q => {
      if (q.created_at) {
        const { year } = parseDateComponents(q.created_at);
        if (year && year >= 2020 && year <= 2035) yearsSet.add(year);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [db.transactions, db.serviceOrders, db.quotes, now]);

  const periodLabel = useMemo(() => {
    if (selectedMonth === 'all') {
      return `Ano Completo de ${selectedYear}`;
    }
    return `${monthName(selectedMonth)} de ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  const periodBadge = useMemo(() => {
    if (selectedMonth === 'all') {
      return `Ano ${selectedYear}`;
    }
    return `${monthName(selectedMonth).slice(0, 3)}/${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  // Appointments period in Dashboard: 'hoje' | 'semana' | 'mes_selecionado' | 'mes_seguinte'
  const [agendaPeriod, setAgendaPeriod] = useState<'hoje' | 'semana' | 'mes_selecionado' | 'mes_seguinte'>('hoje');

  // Memoized KPIs, Alerts and Lists
  const {
    revenueTotal,
    expenseTotal,
    receivableTotal,
    pendingOS,
    activeClientsCount,
    activeClientsList,
    originCounts,
    totalClients,
    recentTransactions,
    recentOS,
    recentQuotes,
    followUpAlertQuotes,
    posVendaAlertOrders,
    recorrenciaAlerts,
    quoteRemindersDue,
    currentMonth,
    currentYear,
    currentMonthRevenues,
    currentMonthExpenses,
    standalonePendingTransactions,
    osReceivableTotal,
    txReceivableTotal,
    delayDays,
  } = useMemo(() => {
    const isDateInPeriod = (dateStr: string) => {
      if (!dateStr) return false;
      const { year, month } = parseDateComponents(dateStr);
      if (year !== selectedYear) return false;
      if (selectedMonth !== 'all' && month !== selectedMonth) return false;
      return true;
    };

    // 1. Period Revenues
    const currentMonthRevenues: Transaction[] = [];
    let revSum = 0;
    (db.transactions || []).forEach(t => {
      if (t.tipo === 'receita' && t.status === 'pago' && isDateInPeriod(t.data)) {
        revSum += t.valor || 0;
        currentMonthRevenues.push(t);
      }
    });

    // 2. Period Expenses
    const currentMonthExpenses: Transaction[] = [];
    let expSum = 0;
    (db.transactions || []).forEach(t => {
      if (t.tipo === 'despesa' && t.status === 'pago' && isDateInPeriod(t.data)) {
        expSum += t.valor || 0;
        currentMonthExpenses.push(t);
      }
    });

    // 3. Accounts Receivable
    const pendingOSList = (db?.serviceOrders || []).filter(
      os => os.status !== 'cancelado' && (os.total || 0) > (os.pago || 0)
    );
    const osReceivableTotal = pendingOSList.reduce((sum, os) => sum + Math.max(0, (os.total || 0) - (os.pago || 0)), 0);

    const pendingOsClientIds = new Set(pendingOSList.map(os => os.client_id).filter(Boolean));

    const standalonePendingTransactions: Transaction[] = [];
    let txReceivableTotal = 0;
    (db?.transactions || []).forEach(t => {
      if (!t || t.tipo !== 'receita' || t.status !== 'pendente') return;
      if (t.os_id) return;
      const descLower = (t.descricao || '').toLowerCase();
      if (descLower.includes('os-') || descLower.includes('o.s.')) return;
      if (t.client_id && pendingOsClientIds.has(t.client_id)) return;
      txReceivableTotal += t.valor || 0;
      standalonePendingTransactions.push(t);
    });

    // 4. Active Clients
    const activeClientIds = new Set<string>();
    (db.serviceOrders || []).forEach(os => { if (os.status !== 'cancelado' && os.client_id) activeClientIds.add(os.client_id); });
    (db.recurrences || []).forEach(r => { if (r.ativo && r.client_id) activeClientIds.add(r.client_id); });
    (db.quotes || []).forEach(q => { if ((q.status === 'aprovado' || q.status === 'enviado') && q.client_id) activeClientIds.add(q.client_id); });
    const activeClients = (db.clients || []).filter(c => activeClientIds.has(c.id));

    // Client origins
    const origCounts: Record<string, number> = {
      Google: 0,
      Meta: 0,
      Indicação: 0,
      'Cliente da Base': 0,
      Outros: 0,
    };
    (db.clients || []).forEach(c => {
      const rawOrig = (c.origem || 'Google').trim();
      let orig = 'Outros';
      if (rawOrig.includes('Google') || rawOrig.includes('WhatsApp')) orig = 'Google';
      else if (rawOrig.includes('Meta') || rawOrig.includes('Facebook') || rawOrig.includes('Instagram') || rawOrig.includes('Ads')) orig = 'Meta';
      else if (rawOrig.includes('Indica')) orig = 'Indicação';
      else if (rawOrig.includes('Base') || rawOrig.includes('Cliente')) orig = 'Cliente da Base';
      else orig = 'Outros';
      origCounts[orig] = (origCounts[orig] || 0) + 1;
    });

    // Recent items
    const recTx = [...(db.transactions || [])].sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 5);
    const recOS = [...(db.serviceOrders || [])].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 4);
    const recQuotes = (db.quotes || []).filter(q => !q.arquivado).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 4);

    // Alerts (Filtered strictly to current month / selected period so old months don't show perpetual alerts)
    const fuQuotes = (db.quotes || []).filter(q => {
      if (q.status !== 'enviado' || q.arquivado) return false;
      const sentDateStr = q.enviado_em || q.created_at;
      if (!sentDateStr) return false;
      const { year, month } = parseDateComponents(sentDateStr);
      if (year !== selectedYear) return false;
      if (selectedMonth !== 'all' && month !== selectedMonth) return false;
      const sentDateOnly = sentDateStr.split('T')[0];
      return todayStr > sentDateOnly;
    });

    const delay = db.companySettings?.dias_pos_venda || 2;
    const pvOrders = (db.serviceOrders || []).filter(os => {
      if (os.status !== 'concluido' || os.pos_venda_enviado) return false;
      const dateStr = os.data_conclusao || (os.data_agendada ? os.data_agendada.split(/[ T]/)[0] : os.created_at?.split(/[ T]/)[0]);
      if (!dateStr) return false;
      const { year, month } = parseDateComponents(dateStr);
      if (year !== selectedYear) return false;
      if (selectedMonth !== 'all' && month !== selectedMonth) return false;
      const compDate = new Date(dateStr);
      const diffDays = Math.floor(Math.abs(now.getTime() - compDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= delay;
    });

    const recAlerts = (db.recurrences || []).filter(r => {
      if (!r || r.ativo === false) return false;
      const recDateStr = r.proxima_data_sugerida || r.proxima_data || r.ultimo_servico_at || r.data_inicio || r.created_at;
      if (!recDateStr) return false;
      const { year, month } = parseDateComponents(recDateStr);
      if (year !== selectedYear) return false;
      if (selectedMonth !== 'all' && month !== selectedMonth) return false;
      return true;
    });

    const qReminders = (db.quotes || []).filter(q =>
      q.tem_lembrete && q.lembrete_data && !q.lembrete_concluido && !q.arquivado && q.lembrete_data <= todayStr
    );

    return {
      revenueTotal: revSum,
      expenseTotal: expSum,
      receivableTotal: osReceivableTotal + txReceivableTotal,
      pendingOS: pendingOSList,
      activeClientsCount: activeClientIds.size,
      activeClientsList: activeClients,
      originCounts: origCounts,
      totalClients: db.clients?.length || 1,
      recentTransactions: recTx,
      recentOS: recOS,
      recentQuotes: recQuotes,
      followUpAlertQuotes: fuQuotes,
      posVendaAlertOrders: pvOrders,
      recorrenciaAlerts: recAlerts,
      quoteRemindersDue: qReminders,
      currentMonth: selectedMonth,
      currentYear: selectedYear,
      currentMonthRevenues,
      currentMonthExpenses,
      standalonePendingTransactions,
      osReceivableTotal,
      txReceivableTotal,
      delayDays: delay,
    };
  }, [db, now, todayStr, selectedMonth, selectedYear]);

  const originConfig: Record<string, { color: string; bg: string }> = {
    Google: { color: 'text-blue-600', bg: 'bg-blue-500' },
    Meta: { color: 'text-indigo-600', bg: 'bg-indigo-500' },
    Indicação: { color: 'text-emerald-600', bg: 'bg-emerald-500' },
    'Cliente da Base': { color: 'text-amber-600', bg: 'bg-amber-500' },
    Outros: { color: 'text-slate-600', bg: 'bg-slate-500' },
  };

  // Today's Appointments (Pending to execute: excludes cancelado and concluido)
  const todayAppointments = useMemo(() => {
    return (db.appointments || [])
      .filter(a => (a.data_hora ? a.data_hora.split(/[ T]/)[0] : '') === todayStr && a.status !== 'cancelado' && a.status !== 'concluido')
      .sort((a, b) => (a.data_hora || '').localeCompare(b.data_hora || ''));
  }, [db.appointments, todayStr]);

  // Current Week Appointments (Sunday to Saturday)
  const { weekStartStr, weekEndStr, weekLabel } = useMemo(() => {
    const dayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);

    const sDay = String(sunday.getDate()).padStart(2, '0');
    const sMonth = String(sunday.getMonth() + 1).padStart(2, '0');
    const eDay = String(saturday.getDate()).padStart(2, '0');
    const eMonth = String(saturday.getMonth() + 1).padStart(2, '0');

    return {
      weekStartStr: sunday.toISOString().split('T')[0],
      weekEndStr: saturday.toISOString().split('T')[0],
      weekLabel: `${sDay}/${sMonth} a ${eDay}/${eMonth}`,
    };
  }, [now]);

  const weekAppointments = useMemo(() => {
    return (db.appointments || [])
      .filter(a => {
        if (!a.data_hora) return false;
        const d = a.data_hora.split(/[ T]/)[0];
        return d >= weekStartStr && d <= weekEndStr && a.status !== 'cancelado' && a.status !== 'concluido';
      })
      .sort((a, b) => (a.data_hora || '').localeCompare(b.data_hora || ''));
  }, [db.appointments, weekStartStr, weekEndStr]);

  // Appointments for the Selected Month/Year
  const selectedMonthAppointments = useMemo(() => {
    return (db.appointments || [])
      .filter(a => {
        if (!a.data_hora) return false;
        const { year, month } = parseDateComponents(a.data_hora);
        if (year !== selectedYear) return false;
        if (selectedMonth !== 'all' && month !== selectedMonth) return false;
        return a.status !== 'cancelado' && a.status !== 'concluido';
      })
      .sort((a, b) => (a.data_hora || '').localeCompare(b.data_hora || ''));
  }, [db.appointments, selectedMonth, selectedYear]);

  // Next Month Appointments
  const { nextMonthPrefix, nextMonthName } = useMemo(() => {
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const y = nextMonthDate.getFullYear();
    const m = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
    const name = nextMonthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      nextMonthPrefix: `${y}-${m}`,
      nextMonthName: capitalizedName,
    };
  }, [now]);

  const nextMonthAppointments = useMemo(() => {
    return (db.appointments || [])
      .filter(a => {
        if (!a.data_hora) return false;
        const d = a.data_hora.split(/[ T]/)[0];
        return d.startsWith(nextMonthPrefix) && a.status !== 'cancelado' && a.status !== 'concluido';
      })
      .sort((a, b) => (a.data_hora || '').localeCompare(b.data_hora || ''));
  }, [db.appointments, nextMonthPrefix]);

  const displayedAppointments = useMemo(() => {
    if (agendaPeriod === 'hoje') return todayAppointments;
    if (agendaPeriod === 'semana') return weekAppointments;
    if (agendaPeriod === 'mes_selecionado') return selectedMonthAppointments;
    return nextMonthAppointments;
  }, [agendaPeriod, todayAppointments, weekAppointments, selectedMonthAppointments, nextMonthAppointments]);

  const handleClientClick = (client: Client) => {
    setSelectedClient(client);
    setClientDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header with Month and Year Filter for Painel Geral */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shadow-2xs">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 font-display">
                Painel Geral
              </h1>
              <p className="text-xs text-slate-500">
                Acompanhando: <span className="font-bold text-blue-700">{periodLabel}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Quick Period Buttons */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-50 border border-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); }}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
                selectedMonth === now.getMonth() && selectedYear === now.getFullYear()
                  ? 'bg-blue-600 text-white shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mês Atual (Out)
            </button>
            <button
              type="button"
              onClick={() => { setSelectedMonth(8); setSelectedYear(now.getFullYear()); }}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
                selectedMonth === 8 && selectedYear === now.getFullYear()
                  ? 'bg-blue-600 text-white shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Setembro
            </button>
            <button
              type="button"
              onClick={() => { setSelectedMonth('all'); setSelectedYear(now.getFullYear()); }}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
                selectedMonth === 'all'
                  ? 'bg-white text-blue-700 shadow-2xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ano Completo
            </button>
          </div>

          <PeriodFilter
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthChange={setSelectedMonth}
            onYearChange={(y) => setSelectedYear(y === 'all' ? now.getFullYear() : y)}
            availableYears={availableYears}
            allMonthsLabel="Ano Completo"
          />
        </div>
      </div>

      {/* Alerta de Sucesso - Alteração de Status / Baixa de Recebível */}
      {receivableToast && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-semibold shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{receivableToast}</span>
          </div>
          <button 
            type="button"
            onClick={() => setReceivableToast(null)} 
            className="text-emerald-700 hover:text-emerald-950 p-1 rounded-lg hover:bg-emerald-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Alerta Compacto de Lembretes de Orçamentos */}
      {quoteRemindersDue.length > 0 && (
        <div className="bg-blue-50/90 border border-blue-200/80 rounded-xl p-2.5 sm:p-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Clock className="w-3.5 h-3.5 animate-bounce" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                  <span>{quoteRemindersDue.length} {quoteRemindersDue.length === 1 ? 'lembrete de orçamento para chamar hoje' : 'lembretes de orçamentos para chamar hoje'}</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-600 text-white font-bold uppercase">Aviso</span>
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  Contatar clientes que aguardavam data ou chegada do estofado.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPage('orcamentos')}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-lg transition shadow-2xs cursor-pointer shrink-0 self-end sm:self-center"
            >
              <span>Ver Lembretes</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Quick chips of reminders due */}
          <div className="mt-2 pt-2 border-t border-blue-200/50 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1.5">
            {quoteRemindersDue.slice(0, 4).map(q => {
              const client = db.clients.find(c => c.id === q.client_id);
              const cleanPhone = client?.telefone ? cleanWhatsAppPhone(client.telefone) : '';
              const whatsappMsg = encodeURIComponent(
                `Olá, *${client?.nome || q.client_name}*! Tudo bem? Passando para acompanhar o orçamento *${q.numero}* na HigiPro.` +
                (q.lembrete_motivo ? ` (${q.lembrete_motivo})` : '')
              );
              return (
                <div key={q.id} className="p-1.5 bg-white rounded-lg border border-blue-100 flex items-center justify-between gap-1 shadow-2xs">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-bold text-blue-700 truncate">{q.numero} • {q.client_name}</p>
                    <p className="text-[9px] text-amber-700 truncate">📌 {q.lembrete_motivo || 'Chamar hoje'}</p>
                  </div>
                  {cleanPhone && (
                    <a
                      href={`https://wa.me/${cleanPhone}?text=${whatsappMsg}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded text-[10px] font-bold shrink-0 transition"
                      title="Chamar no WhatsApp"
                    >
                      <MessageSquare className="w-3 h-3 text-emerald-600" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alertas Compactos de Ação Comercial: Follow-up, Pós-Venda e Recorrência Anual */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-2.5">
        {/* Card Compacto: Follow-up (Pré-Venda) */}
        <div className="bg-[#0b2447] border border-amber-400/60 hover:border-amber-400 rounded-xl p-2 sm:p-2.5 flex items-center justify-between gap-2 shadow-2xs text-white transition">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 font-bold shadow-2xs">
              <BellRing className="w-3.5 h-3.5 animate-pulse text-slate-950" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-white tracking-tight">
                  <span className="text-amber-300 font-black">{followUpAlertQuotes.length}</span> {followUpAlertQuotes.length === 1 ? 'Follow-up' : 'Follow-ups'}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold uppercase">
                  Pré-Venda
                </span>
              </div>
              <p className="text-[10px] text-slate-300 truncate">
                {followUpAlertQuotes.length > 0
                  ? (followUpAlertQuotes.length === 1 ? '1 proposta aguardando (+1d)' : `${followUpAlertQuotes.length} propostas aguardando (+1d)`)
                  : 'Nenhum pendente no mês'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToRecorrenciaTab ? onNavigateToRecorrenciaTab('followup') : setPage('recorrencia')}
            className="px-2 py-1 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-[11px] rounded-lg transition cursor-pointer shrink-0 inline-flex items-center gap-1 shadow-2xs"
            title="Acessar lista de follow-up"
          >
            <span>Ver</span>
            <ArrowRight className="w-3 h-3 stroke-[3]" />
          </button>
        </div>

        {/* Card Compacto: Pós-Venda Google (Avaliações 5★) */}
        <div className="bg-[#0b2447] border border-amber-400/60 hover:border-amber-400 rounded-xl p-2 sm:p-2.5 flex items-center justify-between gap-2 shadow-2xs text-white transition">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 font-bold shadow-2xs">
              <Star className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-white tracking-tight">
                  <span className="text-amber-300 font-black">{posVendaAlertOrders.length}</span> {posVendaAlertOrders.length === 1 ? 'Pós-Venda' : 'Pós-Vendas'}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold uppercase">
                  Google 5★
                </span>
              </div>
              <p className="text-[10px] text-slate-300 truncate">
                {posVendaAlertOrders.length > 0
                  ? (posVendaAlertOrders.length === 1 ? `1 pronto (+${delayDays}d conclusão)` : `${posVendaAlertOrders.length} prontos (+${delayDays}d conclusão)`)
                  : 'Em dia no mês'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToRecorrenciaTab ? onNavigateToRecorrenciaTab('pos_venda') : setPage('recorrencia')}
            className="px-2 py-1 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-[11px] rounded-lg transition cursor-pointer shrink-0 inline-flex items-center gap-1 shadow-2xs"
            title="Acessar pós-venda Google"
          >
            <span>Enviar</span>
            <ArrowRight className="w-3 h-3 stroke-[3]" />
          </button>
        </div>

        {/* Card Compacto: Recorrência Anual (Aviso Pequeno) */}
        <div className="bg-[#0b2447] border border-blue-400/60 hover:border-blue-400 rounded-xl p-2 sm:p-2.5 flex items-center justify-between gap-2 shadow-2xs text-white transition">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 font-bold shadow-2xs">
              <RefreshCw className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-white tracking-tight">
                  <span className="text-blue-300 font-black">{recorrenciaAlerts.length}</span> {recorrenciaAlerts.length === 1 ? 'Recorrência' : 'Recorrências'}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 font-bold uppercase">
                  12 Meses
                </span>
              </div>
              <p className="text-[10px] text-slate-300 truncate">
                {recorrenciaAlerts.length > 0
                  ? (recorrenciaAlerts.length === 1 ? '1 retorno preventivo no mês' : `${recorrenciaAlerts.length} retornos preventivos no mês`)
                  : 'Sem retornos no mês'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToRecorrenciaTab ? onNavigateToRecorrenciaTab('leads') : setPage('recorrencia')}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-[11px] rounded-lg transition cursor-pointer shrink-0 inline-flex items-center gap-1 shadow-2xs"
            title="Acessar recorrência anual"
          >
            <span>Ver</span>
            <ArrowRight className="w-3 h-3 stroke-[3]" />
          </button>
        </div>
      </div>

      {/* Smart Goals Quick Progress Banner */}
      <div className="bg-gradient-to-r from-[#07172c] via-[#0b2447] to-[#12396e] rounded-2xl p-3.5 sm:p-4 text-white shadow-xs border border-blue-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-400/30">
            <Target className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-white">
                🎯 Meta Mensal: {formatCurrency(db.companySettings?.smart_goals?.metaFaturamentoMensal || 15000)}
              </span>
              <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-bold border border-indigo-400/20">
                Valor/Hora Ideal: {formatCurrency(Math.round(((db.companySettings?.smart_goals?.metaFaturamentoMensal || 15000) / ((db.companySettings?.smart_goals?.diasTrabalhadosMes || 22) * (db.companySettings?.smart_goals?.horasProdutivasDia || 6.5))) * 100) / 100)}/h
              </span>
            </div>
            <p className="text-[11px] text-blue-200/70 mt-0.5">
              Precifique orçamentos no valor ideal mínimo considerando horas, químicos e deslocamento.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPage('calculadora')}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/15 cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5 text-emerald-400" />
            <span>Calculadora</span>
          </button>
          <button
            type="button"
            onClick={() => setPage('metas')}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Target className="w-3.5 h-3.5" />
            <span>Ver Metas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPIs Grid - Ultra Alto Contraste */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* KPI 1: Monthly Revenues */}
        <div 
          onClick={() => setActiveModal('receitas')}
          className="bg-white dark:bg-[#0b1f3c] p-3.5 sm:p-4.5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs hover:border-emerald-400/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-14 sm:w-16 h-14 sm:h-16 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex justify-between items-start relative z-10">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700/40 group-hover:bg-emerald-100 transition shadow-2xs">
              <TrendingUp className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/40 px-2 py-0.5 rounded-full font-bold">
              {periodBadge}
            </span>
          </div>
          <div className="mt-2.5 relative z-10">
            <p className="text-xs text-slate-500 dark:text-slate-300 font-bold">Receita ({periodBadge})</p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-display mt-0.5 truncate">
              {formatCurrency(revenueTotal)}
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-1 truncate font-medium">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5" />
                {currentMonthRevenues.length} lançados
              </span>
            </p>
          </div>
        </div>

        {/* KPI 2: Monthly Expenses */}
        <div 
          onClick={() => setActiveModal('despesas')}
          className="bg-white dark:bg-[#0b1f3c] p-3.5 sm:p-4.5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs hover:border-rose-400/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-14 sm:w-16 h-14 sm:h-16 bg-rose-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex justify-between items-start relative z-10">
            <div className="p-2 bg-rose-50 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-300 border border-rose-200/60 dark:border-rose-700/40 group-hover:bg-rose-100 transition shadow-2xs">
              <TrendingDown className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <span className="text-[10px] bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700/40 px-2 py-0.5 rounded-full font-bold">
              {periodBadge}
            </span>
          </div>
          <div className="mt-2.5 relative z-10">
            <p className="text-xs text-slate-500 dark:text-slate-300 font-bold">Despesas ({periodBadge})</p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-display mt-0.5 truncate">
              {formatCurrency(expenseTotal)}
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-1 truncate font-medium">
              <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center">
                <ArrowDownRight className="w-3.5 h-3.5" />
                {currentMonthExpenses.length} despesas
              </span>
            </p>
          </div>
        </div>

        {/* KPI 3: Accounts Receivable */}
        <div 
          onClick={() => setActiveModal('receber')}
          className="bg-white dark:bg-[#0b1f3c] p-3.5 sm:p-4.5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs hover:border-amber-400/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-14 sm:w-16 h-14 sm:h-16 bg-amber-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex justify-between items-start relative z-10">
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700/40 group-hover:bg-amber-100 transition shadow-2xs">
              <DollarSign className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <span className="text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700/40 px-2 py-0.5 rounded-full font-bold">
              Pendências
            </span>
          </div>
          <div className="mt-2.5 relative z-10">
            <p className="text-xs text-slate-500 dark:text-slate-300 font-bold">A Receber</p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-display mt-0.5 truncate">
              {formatCurrency(receivableTotal)}
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-1 truncate font-medium">
              <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center">
                {pendingOS.length} OS {pendingOS.length === 1 ? 'pendente' : 'pendentes'}
                {standalonePendingTransactions.length > 0 && ` + ${standalonePendingTransactions.length} avulsa(s)`}
              </span>
            </p>
          </div>
        </div>

        {/* KPI 4: Active Clients */}
        <div 
          onClick={() => setActiveModal('clientes')}
          className="bg-white dark:bg-[#0b1f3c] p-3.5 sm:p-4.5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs hover:border-blue-400/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-14 sm:w-16 h-14 sm:h-16 bg-blue-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex justify-between items-start relative z-10">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700/40 group-hover:bg-blue-100 transition shadow-2xs">
              <Users className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <span className="text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-700/40 px-2 py-0.5 rounded-full font-bold">
              Retenção
            </span>
          </div>
          <div className="mt-2.5 relative z-10">
            <p className="text-xs text-slate-500 dark:text-slate-300 font-bold">Clientes Ativos</p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-display mt-0.5 truncate">
              {activeClientsCount}
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-1 truncate font-medium">
              <span className="text-blue-600 dark:text-blue-400 font-bold flex items-center">
                {db.clients.length} no cadastro
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Painel Geral a Receber: Faturas e Saldos Pendentes */}
      {pendingOS.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200/90 shadow-xs p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-amber-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-800 font-display text-base">
                    Painel Geral a Receber (Ordens de Serviço)
                  </h3>
                  <span className="px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 rounded-md">
                    {pendingOS.length} {pendingOS.length === 1 ? 'pendência' : 'pendências'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Gerencie o status operacional ou marque diretamente como <strong>Pago (Concluído)</strong> para baixar e atualizar em tempo real o Painel Geral, as Métricas e o Financeiro.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total a Receber</span>
                <span className="text-base sm:text-lg font-black text-amber-700 font-display">
                  {formatCurrency(receivableTotal)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('receber')}
                className="px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition cursor-pointer"
              >
                Abrir Detalhado
              </button>
            </div>
          </div>

          {/* Mobile Card View (Phone screens) */}
          <div className="sm:hidden space-y-2.5">
            {pendingOS.map(os => {
              const remaining = Math.max(0, (os.total || 0) - (os.pago || 0));
              return (
                <div key={os.id} className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">{os.numero}</span>
                      <span className="font-bold text-slate-800 text-xs truncate">{os.client_name}</span>
                    </div>
                    <span className="font-black text-amber-700 text-xs shrink-0">{formatCurrency(remaining)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Total: {formatCurrency(os.total)}</span>
                    <span>Pago: {formatCurrency(os.pago)}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                    <select
                      value={os.status}
                      onChange={(e) => handleOSStatusChange(os, e.target.value as OSStatus)}
                      className={`flex-1 px-2 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                        os.status === 'concluido'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : os.status === 'em_execucao'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : os.status === 'agendado'
                          ? 'bg-blue-50 text-blue-800 border-blue-300'
                          : 'bg-white text-slate-800 border-slate-300'
                      }`}
                    >
                      <option value="agendado">Agendado</option>
                      <option value="em_execucao">Em Execução</option>
                      <option value="concluido">Pago (Concluído)</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleMarkOSAsPaid(os)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition cursor-pointer shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Pago</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block border border-slate-100 rounded-xl overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/80 text-[11px] text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3.5 py-2.5">Nº OS</th>
                  <th className="px-3.5 py-2.5">Cliente</th>
                  <th className="px-3.5 py-2.5">Total OS</th>
                  <th className="px-3.5 py-2.5">Já Pago</th>
                  <th className="px-3.5 py-2.5 text-right">Saldo a Receber</th>
                  <th className="px-3.5 py-2.5 text-center">Opção de Status</th>
                  <th className="px-3.5 py-2.5 text-center">Ação Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingOS.map(os => {
                  const remaining = Math.max(0, (os.total || 0) - (os.pago || 0));
                  return (
                    <tr key={os.id} className="hover:bg-amber-50/30 transition">
                      <td className="px-3.5 py-2.5 font-mono font-bold text-slate-700">{os.numero}</td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-800">{os.client_name}</td>
                      <td className="px-3.5 py-2.5 text-slate-600">{formatCurrency(os.total)}</td>
                      <td className="px-3.5 py-2.5 text-slate-500">{formatCurrency(os.pago)}</td>
                      <td className="px-3.5 py-2.5 text-right font-black text-amber-700">{formatCurrency(remaining)}</td>
                      <td className="px-3.5 py-2.5 text-center">
                        <select
                          value={os.status}
                          onChange={(e) => handleOSStatusChange(os, e.target.value as OSStatus)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition cursor-pointer ${
                            os.status === 'concluido'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : os.status === 'em_execucao'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : os.status === 'agendado'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : 'bg-slate-50 text-slate-800 border-slate-300'
                          }`}
                          title="Selecione o status. Ao selecionar 'Pago (Concluído)', os valores do Painel Geral, Métricas e Financeiro serão atualizados automaticamente."
                        >
                          <option value="agendado">Agendado</option>
                          <option value="em_execucao">Em Execução</option>
                          <option value="concluido">Pago (Concluído)</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleMarkOSAsPaid(os)}
                          title="Alterar como Pago (Concluído) e sincronizar valores com Painel Geral, Métricas e Financeiro"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Alterar como Pago</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Appointments & Acquisition channels (takes 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Appointments Card with Hoje, Semana, and Mês Seguinte tabs */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 font-display text-base">
                    {agendaPeriod === 'hoje' && 'Agendamentos de Hoje'}
                    {agendaPeriod === 'semana' && 'Agendamentos da Semana'}
                    {agendaPeriod === 'mes_selecionado' && `Agendamentos de ${periodLabel}`}
                    {agendaPeriod === 'mes_seguinte' && `Agendamentos de ${nextMonthName}`}
                  </h3>
                  <span className="text-xs bg-blue-50 text-blue-700 font-semibold border border-blue-100 px-2 py-0.5 rounded-lg">
                    {displayedAppointments.length} a executar
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {agendaPeriod === 'hoje' && 'Serviços e rotas a executar no dia de hoje'}
                  {agendaPeriod === 'semana' && `Serviços a executar nesta semana (${weekLabel})`}
                  {agendaPeriod === 'mes_selecionado' && `Serviços programados para o período selecionado (${periodLabel})`}
                  {agendaPeriod === 'mes_seguinte' && `Serviços já programados para o próximo mês (${nextMonthName})`}
                </p>
              </div>

              {/* Range Toggle Buttons */}
              <div className="flex flex-wrap items-center p-1 bg-slate-100 rounded-xl self-start sm:self-auto gap-0.5">
                <button
                  type="button"
                  onClick={() => setAgendaPeriod('hoje')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    agendaPeriod === 'hoje'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hoje ({todayAppointments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaPeriod('semana')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    agendaPeriod === 'semana'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semana ({weekAppointments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaPeriod('mes_selecionado')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    agendaPeriod === 'mes_selecionado'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {selectedMonth === 'all' ? `Ano ${selectedYear}` : `${periodBadge} (${selectedMonthAppointments.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaPeriod('mes_seguinte')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    agendaPeriod === 'mes_seguinte'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Próximo Mês ({nextMonthAppointments.length})
                </button>
              </div>
            </div>

            {displayedAppointments.length > 0 ? (
              <div className="space-y-3">
                {displayedAppointments.map(app => {
                  const client = db.clients.find(c => c.id === app.client_id);
                  return (
                    <div 
                      key={app.id} 
                      className="group border border-slate-100 hover:border-slate-200 bg-slate-50/30 hover:bg-white p-4 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p 
                            onClick={() => client && handleClientClick(client)}
                            className="font-semibold text-slate-800 text-sm hover:underline cursor-pointer"
                          >
                            {app.client_name}
                          </p>
                          <span className="text-slate-300">•</span>
                          <span className="text-[11px] text-blue-700 font-semibold bg-blue-50/80 px-2 py-0.5 rounded-md font-mono">
                            {agendaPeriod === 'hoje'
                              ? (formatDateTime(app.data_hora).split(' às ')[1] ? `às ${formatDateTime(app.data_hora).split(' às ')[1]}` : formatDateTime(app.data_hora))
                              : formatDateTime(app.data_hora)}
                          </span>
                        </div>
                        <p className="text-xs text-blue-700 font-medium">{app.servicos}</p>
                        <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1">
                          <span className="font-medium">Téc:</span> {app.tecnico} | <span className="font-medium">End:</span> {app.endereco}
                          {app.valor ? (
                            <>
                              <span className="text-slate-300">|</span>
                              <span className="font-semibold text-emerald-600">{formatCurrency(app.valor)}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                        {/* Status Quick Selector */}
                        <div className="relative">
                          <select
                            value={app.status}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleQuickStatusChange(app.id, e.target.value as AppointmentStatus);
                            }}
                            className="text-[11px] font-bold py-1 pl-2.5 pr-6 rounded-full border border-slate-200 bg-white hover:bg-slate-50 appearance-none cursor-pointer transition focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs text-slate-700"
                            title="Alterar status do agendamento"
                          >
                            <option value="agendado">📅 Agendado</option>
                            <option value="confirmado">✅ Confirmado</option>
                            <option value="concluido">🏆 Concluído</option>
                            <option value="cancelado">❌ Cancelado</option>
                          </select>
                          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                        </div>

                        {/* WhatsApp button */}
                        {client && (
                          <a
                            href={`https://wa.me/${cleanWhatsAppPhone(client.telefone)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-8 px-2.5 flex items-center gap-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-semibold border border-emerald-200 transition cursor-pointer"
                            title="Abrir WhatsApp com cliente"
                          >
                            <span>WhatsApp</span>
                          </a>
                        )}

                        {/* Botão Editar Agendamento */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditAppointment(app)}
                          className="h-8 px-2.5 flex items-center gap-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold transition cursor-pointer active:scale-95"
                          title="Editar este agendamento"
                        >
                          <Pencil className="w-3.5 h-3.5 text-blue-600" />
                          <span>Editar</span>
                        </button>

                        {/* Botão Excluir Agendamento */}
                        <button
                          type="button"
                          onClick={() => setAppointmentToDelete(app)}
                          className="h-8 px-2.5 flex items-center gap-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-semibold transition cursor-pointer active:scale-95"
                          title="Excluir este agendamento"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Excluir</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center p-6 bg-slate-50/50 rounded-xl border border-slate-100 border-dashed">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-medium">
                  {agendaPeriod === 'hoje' && 'Nenhum serviço a executar agendado para hoje.'}
                  {agendaPeriod === 'semana' && 'Nenhum serviço a executar agendado para esta semana.'}
                  {agendaPeriod === 'mes_seguinte' && `Nenhum serviço a executar agendado para ${nextMonthName} ainda.`}
                </p>
                <button 
                  onClick={() => setPage('agendamentos')} 
                  className="text-blue-600 hover:underline text-[10px] font-semibold mt-1 cursor-pointer"
                >
                  Abrir Agenda Completa
                </button>
              </div>
            )}
          </div>

          {/* Orçamentos Recentes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 font-display text-base">Orçamentos Recentes</h3>
                  <p className="text-xs text-slate-400">Últimas propostas e cotações emitidas</p>
                </div>
              </div>
              <button 
                onClick={() => setPage('orcamentos')} 
                className="text-blue-600 text-xs font-semibold hover:underline cursor-pointer flex items-center gap-0.5"
              >
                Ver Todos <span className="text-sm font-sans">→</span>
              </button>
            </div>

            {recentQuotes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recentQuotes.map(quote => {
                  const client = db.clients.find(c => c.id === quote.client_id);
                  return (
                    <div 
                      key={quote.id}
                      className="p-4 border border-slate-100 hover:border-slate-200 bg-white rounded-xl flex flex-col justify-between hover:shadow-xs transition"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="font-mono text-xs font-semibold text-slate-700">{quote.numero}</span>
                          <StatusBadge type="quote" status={quote.status} />
                        </div>
                        <p 
                          onClick={() => client && handleClientClick(client)}
                          className="font-bold text-slate-800 text-sm truncate hover:underline cursor-pointer"
                        >
                          {quote.client_name}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Total: <span className="font-semibold text-slate-800">{formatCurrency(quote.total)}</span>
                        </p>
                        {quote.tem_lembrete && quote.lembrete_data && (
                          <div className={`mt-2 p-1.5 rounded-lg border text-[10px] ${
                            quote.lembrete_concluido 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : (quote.lembrete_data <= todayDateOnly 
                                  ? 'bg-amber-50 text-amber-900 border-amber-300 font-bold animate-pulse' 
                                  : 'bg-blue-50 text-blue-800 border-blue-200 font-medium')
                          }`}>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>{quote.lembrete_concluido ? 'Lembrete Concluído' : (quote.lembrete_data <= todayDateOnly ? 'Lembrete Hoje!' : `Lembrete: ${formatDate(quote.lembrete_data)}`)}</span>
                            </div>
                            {quote.lembrete_motivo && (
                              <p className="mt-0.5 text-[9.5px] truncate text-slate-600 italic">
                                {quote.lembrete_motivo}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="border-t border-slate-100 pt-2.5 mt-3 flex justify-between items-center">
                        <span className="text-[10px] text-slate-400">
                          {quote.created_at ? formatDate(quote.created_at) : 'Data recente'}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-600">
                          Val: {quote.validade ? formatDate(quote.validade) : '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-4">Nenhum orçamento registrado ainda.</p>
            )}
          </div>

          {/* Service Orders (OS) Recentes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-slate-800 font-display text-base">Ordens de Serviço Recentes</h3>
                <p className="text-xs text-slate-400">Últimos atendimentos operacionais abertos</p>
              </div>
              <button 
                onClick={() => setPage('os')} 
                className="text-blue-600 text-xs font-semibold hover:underline cursor-pointer flex items-center gap-0.5"
              >
                Ver Todas <span className="text-sm font-sans">→</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentOS.map(os => {
                const client = db.clients.find(c => c.id === os.client_id);
                return (
                  <div 
                    key={os.id}
                    className="p-4 border border-slate-100 hover:border-slate-200 bg-white rounded-xl flex flex-col justify-between hover:shadow-xs transition"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-700">{os.numero}</span>
                        <StatusBadge type="os" status={os.status} />
                      </div>
                      <p 
                        onClick={() => client && handleClientClick(client)}
                        className="font-bold text-slate-800 text-sm truncate hover:underline cursor-pointer"
                      >
                        {os.client_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Total: <span className="font-semibold text-slate-700">{formatCurrency(os.total)}</span>
                      </p>
                    </div>
                    <div className="border-t border-slate-100 pt-2.5 mt-3 flex justify-between items-center">
                      <span className="text-[10px] text-slate-400">
                        {os.data_agendada ? formatDate(os.data_agendada) : 'Não agendado'}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-600">
                        Téc: {os.tecnico}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Customer Origins & Recent Cashflow */}
        <div className="space-y-6">
          {/* Customer Origins Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <div>
              <h3 className="font-bold text-slate-800 font-display text-base">Origem dos Clientes</h3>
              <p className="text-xs text-slate-400">Eficiência por canal de captação</p>
            </div>

            <div className="space-y-3.5 mt-5">
              {Object.keys(originConfig).map(origin => {
                const count = originCounts[origin] || 0;
                const percentage = Math.round((count / totalClients) * 100);
                const cfg = originConfig[origin] || originConfig['Outros'];
                
                return (
                  <div key={origin} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600 font-medium">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${cfg.bg}`} />
                        {origin}
                      </span>
                      <span>{count} ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${cfg.bg}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Cashflow Activity */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-slate-800 font-display text-base">Financeiro Recente</h3>
                <p className="text-xs text-slate-400">Últimas movimentações de caixa</p>
              </div>
              <button 
                onClick={() => setPage('financeiro')} 
                className="text-blue-600 text-xs font-semibold hover:underline cursor-pointer"
              >
                Fluxo <span className="text-sm font-sans">→</span>
              </button>
            </div>

            <div className="space-y-3">
              {recentTransactions.map(tx => (
                <div key={tx.id} className="flex justify-between items-center p-2 rounded-xl hover:bg-slate-50 transition text-xs">
                  <div className="space-y-0.5 truncate pr-2">
                    <p className="font-semibold text-slate-800 truncate">{tx.descricao}</p>
                    <p className="text-[10px] text-slate-400">
                      {formatDate(tx.data)} • {tx.metodo_pagamento}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold ${tx.tipo === 'receita' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {tx.tipo === 'receita' ? '+' : '-'}{formatCurrency(tx.valor)}
                    </p>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-md ${
                      tx.status === 'pago' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {tx.status === 'pago' ? 'pago' : 'pendente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico de Faturamento Mês a Mês do Ano */}
      <SectionErrorBoundary title="Gráfico de Faturamento">
        <FaturamentoGrafico db={db} setPage={setPage} />
      </SectionErrorBoundary>

      {/* Breakdown Modals for KPIs */}
      {/* 1. Revenues Breakdown Modal */}
      <Modal
        isOpen={activeModal === 'receitas'}
        onClose={() => setActiveModal(null)}
        title={`Receitas Detalhadas — ${periodLabel}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Abaixo estão listadas todas as receitas registradas no caixa para o período selecionado ({periodLabel}):
          </p>
          <div className="border border-slate-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Descrição</th>
                  <th className="px-4 py-2.5">Categoria</th>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Forma</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentMonthRevenues.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.descricao}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.categoria}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDate(r.data)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.metodo_pagamento}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{formatCurrency(r.valor)}</td>
                  </tr>
                ))}
                {currentMonthRevenues.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-400 italic">Nenhuma receita registrada neste período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* 2. Expenses Breakdown Modal */}
      <Modal
        isOpen={activeModal === 'despesas'}
        onClose={() => setActiveModal(null)}
        title={`Despesas Detalhadas — ${periodLabel}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Abaixo estão listadas todas as despesas ou custos operacionais lançados para o período selecionado ({periodLabel}):
          </p>
          <div className="border border-slate-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Descrição</th>
                  <th className="px-4 py-2.5">Categoria</th>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Forma</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentMonthExpenses.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.descricao}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.categoria}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDate(r.data)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.metodo_pagamento}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-500">{formatCurrency(r.valor)}</td>
                  </tr>
                ))}
                {currentMonthExpenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-400 italic">Nenhuma despesa registrada neste período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* 3. Receivables Breakdown Modal */}
      <Modal
        isOpen={activeModal === 'receber'}
        onClose={() => setActiveModal(null)}
        title="Valores e Faturas Pendentes a Receber"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Estes são os saldos restantes de ordens de serviço em aberto ou concluídas ainda não totalmente pagas, além de outras receitas financeiras avulsas pendentes (sem duplicação):
          </p>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase">Saldos de Ordens de Serviço ({pendingOS.length})</h4>
                  {pendingOS.some(os => ['OS-2026-0003', 'OS-2026-0004', 'OS-2026-0005', 'OS-2026-0006', 'OS-2026-0007', 'OS-2026-0008'].includes(os.numero)) && (
                    <button
                      type="button"
                      onClick={handleExcludeOS03to08}
                      className="px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 hover:bg-red-100 rounded-md border border-red-200 transition cursor-pointer"
                    >
                      Excluir OS 03 a 08
                    </button>
                  )}
                </div>
                <span className="text-xs font-bold text-amber-600">{formatCurrency(osReceivableTotal)}</span>
              </div>
              <div className="border border-slate-100 rounded-xl overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Nº OS</th>
                      <th className="px-4 py-2.5">Cliente</th>
                      <th className="px-4 py-2.5">Total OS</th>
                      <th className="px-4 py-2.5">Pago</th>
                      <th className="px-4 py-2.5 text-right">A Receber</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingOS.map(os => (
                      <tr key={os.id} className="hover:bg-slate-50 text-xs">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{os.numero}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-700">{os.client_name}</td>
                        <td className="px-4 py-2.5 text-slate-500">{formatCurrency(os.total)}</td>
                        <td className="px-4 py-2.5 text-slate-500">{formatCurrency(os.pago)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-amber-600">{formatCurrency(os.total - os.pago)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <select
                            value={os.status}
                            onChange={(e) => handleOSStatusChange(os, e.target.value as OSStatus)}
                            className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
                              os.status === 'concluido'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : os.status === 'em_execucao'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : os.status === 'agendado'
                                ? 'bg-blue-50 text-blue-800 border-blue-300'
                                : 'bg-slate-50 text-slate-800 border-slate-300'
                            }`}
                            title="Selecione o status da OS. Ao escolher 'Pago (Concluído)', os valores serão baixados no financeiro e métricas."
                          >
                            <option value="agendado">Agendado</option>
                            <option value="em_execucao">Em Execução</option>
                            <option value="concluido">Pago (Concluído)</option>
                            <option value="cancelado">Cancelado</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleMarkOSAsPaid(os)}
                              title="Marcar como Pago (Concluído) e sincronizar valores no Painel Geral, Métricas e Financeiro"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Marcar Pago</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOsToDelete(os)}
                              title="Excluir Ordem de Serviço"
                              className="p-1 rounded text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pendingOS.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-slate-400 italic">Nenhuma OS com saldo pendente.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {standalonePendingTransactions.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase">Outras Receitas Financeiras Avulsas ({standalonePendingTransactions.length})</h4>
                  <span className="text-xs font-bold text-amber-600">{formatCurrency(txReceivableTotal)}</span>
                </div>
                <div className="border border-slate-100 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Descrição</th>
                        <th className="px-4 py-2.5">Data</th>
                        <th className="px-4 py-2.5 text-right">Valor</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                        <th className="px-4 py-2.5 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {standalonePendingTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50 text-xs">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{t.descricao}</td>
                          <td className="px-4 py-2.5 text-slate-500">{formatDate(t.data)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-amber-600">{formatCurrency(t.valor)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <select
                              value={t.status}
                              onChange={(e) => handleTransactionStatusChange(t, e.target.value as 'pago' | 'pendente')}
                              className="px-2 py-1 text-[11px] font-bold rounded-lg border bg-amber-50 text-amber-800 border-amber-300 cursor-pointer"
                            >
                              <option value="pendente">Aguardando Pagamento</option>
                              <option value="pago">Pago (Concluído)</option>
                            </select>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleMarkTransactionAsPaid(t)}
                              title="Marcar como Pago e atualizar valores no Painel Geral, Métricas e Financeiro"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Marcar Pago</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between text-sm">
              <span className="font-bold text-amber-900">Total Geral a Receber:</span>
              <span className="font-extrabold text-amber-700 text-base">{formatCurrency(receivableTotal)}</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* 4. Active Clients Breakdown Modal */}
      <Modal
        isOpen={activeModal === 'clientes'}
        onClose={() => setActiveModal(null)}
        title="Lista de Clientes Ativos"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Estes clientes possuem contratos de recorrência de retorno ativos, propostas/orçamentos vigentes ou ordens de serviço pendentes de execução:
          </p>
          <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">Telefone</th>
                  <th className="px-4 py-2.5">Cidade</th>
                  <th className="px-4 py-2.5">Origem</th>
                  <th className="px-4 py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeClientsList.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{c.nome}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatPhone(c.telefone)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.cidade}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.origem}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => {
                          setActiveModal(null);
                          handleClientClick(c);
                        }}
                        className="text-xs text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        Ficha Completa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* 5. Modal de Edição de Agendamento no Painel Geral */}
      <Modal
        isOpen={appointmentToEdit !== null}
        onClose={() => setAppointmentToEdit(null)}
        onBack={() => setAppointmentToEdit(null)}
        title="Editar Agendamento (Painel Geral)"
        size="lg"
      >
        <form onSubmit={handleSaveAppointmentEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Cliente */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cliente *</label>
              <select
                required
                value={editClientId}
                onChange={(e) => handleEditClientChange(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer font-medium"
              >
                <option value="">Selecione um cliente...</option>
                {db.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.telefone ? `(${c.telefone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Serviço */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Serviço / Atendimento *</label>
              <input
                type="text"
                required
                value={editServiceText}
                onChange={(e) => setEditServiceText(e.target.value)}
                placeholder="Ex: Higienização e Impermeabilização de Sofá"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Data e Hora */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Data e Hora *</label>
              <input
                type="datetime-local"
                required
                value={editDateTime}
                onChange={(e) => setEditDateTime(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
              />
            </div>

            {/* Duração */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Duração Estimada (min)</label>
              <input
                type="number"
                required
                value={editDuration}
                onChange={(e) => setEditDuration(e.target.value)}
                placeholder="Ex: 120"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Técnico */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Técnico Escalado *</label>
              <select
                required
                value={editTechName}
                onChange={(e) => setEditTechName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer font-medium"
              >
                {TECNICOS_HIGIPRO.map((tec) => (
                  <option key={tec} value={tec}>{tec}</option>
                ))}
              </select>
            </div>

            {/* Valor do Orçamento */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Valor do Orçamento (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editValorInput}
                  onChange={(e) => setEditValorInput(e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                />
              </div>
            </div>

            {/* Status da Visita */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status da Visita</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as AppointmentStatus)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer font-medium"
              >
                <option value="agendado">📅 Agendado</option>
                <option value="confirmado">✅ Confirmado com Cliente</option>
                <option value="concluido">🏆 Concluído</option>
                <option value="cancelado">❌ Cancelado</option>
              </select>
            </div>

            {/* Endereço */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço Completo</label>
              <input
                type="text"
                value={editEndereco}
                onChange={(e) => setEditEndereco(e.target.value)}
                placeholder="Rua, número, complemento, bairro"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Observações */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Observações Operacionais</label>
              <textarea
                value={editObservacoes}
                onChange={(e) => setEditObservacoes(e.target.value)}
                placeholder="Instruções especiais de acesso, manchas, detalhes da mobília..."
                rows={2.5}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 mt-4">
            <button
              type="button"
              onClick={() => {
                if (appointmentToEdit) {
                  setAppointmentToDelete(appointmentToEdit);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition cursor-pointer border border-rose-200"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Excluir Agendamento</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAppointmentToEdit(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 6. Confirm Dialog para Exclusão de Agendamento */}
      <ConfirmDialog
        isOpen={appointmentToDelete !== null}
        onClose={() => setAppointmentToDelete(null)}
        onConfirm={handleDeleteAppointmentConfirm}
        title="Excluir Agendamento"
        description={`Deseja realmente excluir o agendamento de "${appointmentToDelete?.client_name}" (${appointmentToDelete?.servicos || 'Serviço'})? A alteração é gravada no banco de dados e permanecerá salva mesmo após fechar o app.`}
        confirmText="Sim, Excluir"
        cancelText="Voltar / Cancelar"
        isDanger={true}
      />
    </div>
  );
});
