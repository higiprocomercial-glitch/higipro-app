/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
  Plus, Calendar, List, ChevronLeft, ChevronRight, Clock, 
  MapPin, User, Check, Trash2, Filter, Grid3X3, Smartphone, ChevronDown, DollarSign,
  CheckCircle2, X
} from 'lucide-react';
import { DatabaseState, Appointment, AppointmentStatus, Client, Service, Quote, ServiceOrder, TECNICOS_HIGIPRO } from '../types';
import { formatPhone, formatTime, formatDate, formatCurrency, parseDateComponents, monthName } from '../lib/utils';
import { Modal, ConfirmDialog, StatusBadge, EmptyState } from './UIComponents';
import { generateId } from '../lib/database';
import { supabaseSaveAppointment, supabaseDeleteAppointment } from '../lib/supabase';
import { PeriodFilter } from './PeriodFilter';
import { completeServiceAndSyncAll } from '../lib/serviceCompletion';

interface AgendamentosProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
}

const getStatusBadgeClass = (st: AppointmentStatus) => {
  switch (st) {
    case 'agendado':
      return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
    case 'confirmado':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100';
    case 'concluido':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
    case 'cancelado':
      return 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

export const Agendamentos = React.memo<AgendamentosProps>(({ db, onUpdateDb }) => {
  // Padrão solicitado: Iniciar sempre no Dia Corrente com visualização detalhada em cards destacados
  const [viewMode, setViewMode] = useState<'dia' | 'mes' | 'semana' | 'lista'>('dia');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0); // 0 = current week, -1 = prev, +1 = next
  const [techFilter, setTechFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('a_executar');
  const [concludedNotice, setConcludedNotice] = useState<string | null>(null);

  // Real-time now reference
  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(now.getFullYear());

  const activeCalendarMonth = selectedMonth === 'all' ? now.getMonth() : selectedMonth;
  const activeCalendarYear = selectedYear === 'all' ? now.getFullYear() : selectedYear;

  // Day navigation handlers
  const handlePrevDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const handleNextDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };

  const handleResetToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());
    setCurrentWeekOffset(0);
  };

  const handlePrevMonth = () => {
    if (activeCalendarMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(activeCalendarYear - 1);
    } else {
      setSelectedMonth(activeCalendarMonth - 1);
      setSelectedYear(activeCalendarYear);
    }
  };

  const handleNextMonth = () => {
    if (activeCalendarMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(activeCalendarYear + 1);
    } else {
      setSelectedMonth(activeCalendarMonth + 1);
      setSelectedYear(activeCalendarYear);
    }
  };

  const handleResetToCurrent = () => {
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
    setCurrentWeekOffset(0);
  };

  const monthCalendarDays = useMemo(() => {
    const firstDay = new Date(activeCalendarYear, activeCalendarMonth, 1);
    const lastDay = new Date(activeCalendarYear, activeCalendarMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday
    const daysInMonth = lastDay.getDate();

    // Previous month trailing days
    const prevMonthLastDay = new Date(activeCalendarYear, activeCalendarMonth, 0).getDate();
    const leadingDays: Array<{ date: Date; isCurrentMonth: boolean; dayNum: number }> = [];
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(activeCalendarYear, activeCalendarMonth - 1, prevMonthLastDay - i);
      leadingDays.push({ date: d, isCurrentMonth: false, dayNum: prevMonthLastDay - i });
    }

    // Current month days
    const monthDays: Array<{ date: Date; isCurrentMonth: boolean; dayNum: number }> = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(activeCalendarYear, activeCalendarMonth, i);
      monthDays.push({ date: d, isCurrentMonth: true, dayNum: i });
    }

    // Trailing days from next month
    const trailingDays: Array<{ date: Date; isCurrentMonth: boolean; dayNum: number }> = [];
    const totalSoFar = leadingDays.length + monthDays.length;
    const remainingToComplete = (totalSoFar % 7 === 0) ? 0 : (7 - (totalSoFar % 7));
    for (let i = 1; i <= remainingToComplete; i++) {
      const d = new Date(activeCalendarYear, activeCalendarMonth + 1, i);
      trailingDays.push({ date: d, isCurrentMonth: false, dayNum: i });
    }

    return [...leadingDays, ...monthDays, ...trailingDays];
  }, [activeCalendarYear, activeCalendarMonth]);

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]);
    (db?.appointments || []).forEach(a => {
      if (a.data_hora) {
        const { year } = parseDateComponents(a.data_hora);
        if (year && year >= 2020 && year <= 2035) yearsSet.add(year);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [db?.appointments, now]);

  const handleMonthChange = (m: number | 'all') => {
    setSelectedMonth(m);
    if (m !== 'all') {
      const targetYear = selectedYear === 'all' ? now.getFullYear() : selectedYear;
      if (selectedYear === 'all') setSelectedYear(targetYear);

      const today = new Date();
      const todaySunday = new Date(today);
      todaySunday.setDate(today.getDate() - today.getDay());
      todaySunday.setHours(0, 0, 0, 0);

      const targetDate = new Date(targetYear, m, 1);
      const targetSunday = new Date(targetDate);
      targetSunday.setDate(targetDate.getDate() - targetDate.getDay());
      targetSunday.setHours(0, 0, 0, 0);

      const diffWeeks = Math.round((targetSunday.getTime() - todaySunday.getTime()) / (7 * 24 * 60 * 60 * 1000));
      setCurrentWeekOffset(diffWeeks);
    }
  };

  const handleYearChange = (y: number | 'all') => {
    setSelectedYear(y);
    if (y !== 'all') {
      const targetMonth = selectedMonth === 'all' ? 0 : selectedMonth;
      const today = new Date();
      const todaySunday = new Date(today);
      todaySunday.setDate(today.getDate() - today.getDay());
      todaySunday.setHours(0, 0, 0, 0);

      const targetDate = new Date(y, targetMonth, 1);
      const targetSunday = new Date(targetDate);
      targetSunday.setDate(targetDate.getDate() - targetDate.getDay());
      targetSunday.setHours(0, 0, 0, 0);

      const diffWeeks = Math.round((targetSunday.getTime() - todaySunday.getTime()) / (7 * 24 * 60 * 60 * 1000));
      setCurrentWeekOffset(diffWeeks);
    }
  };

  // CRUD & Booking states
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);

  // Form Field State
  const [clientId, setClientId] = useState('');
  const [serviceText, setServiceText] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [duration, setDuration] = useState('120');
  const [techName, setTechName] = useState<string>(TECNICOS_HIGIPRO[0]);
  const [endereco, setEndereco] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [status, setStatus] = useState<AppointmentStatus>('agendado');
  const [valorInput, setValorInput] = useState('');

  // Memoized maps for instant O(1) lookups in getAppointmentValue
  const serviceOrdersById = useMemo(() => new Map(db.serviceOrders.map(o => [o.id, o])), [db.serviceOrders]);
  const quotesById = useMemo(() => new Map(db.quotes.map(q => [q.id, q])), [db.quotes]);
  const quotesByOsId = useMemo(() => {
    const map = new Map<string, Quote>();
    db.quotes.forEach(q => {
      if (q.os_id) map.set(q.os_id, q);
    });
    return map;
  }, [db.quotes]);
  const quotesByClientId = useMemo(() => {
    const map = new Map<string, Quote[]>();
    db.quotes.forEach(q => {
      if (q.client_id) {
        const arr = map.get(q.client_id) || [];
        arr.push(q);
        map.set(q.client_id, arr);
      }
    });
    return map;
  }, [db.quotes]);
  const quotesByClientNameLower = useMemo(() => {
    const map = new Map<string, Quote[]>();
    db.quotes.forEach(q => {
      if (q.client_name) {
        const key = q.client_name.toLowerCase().trim();
        const arr = map.get(key) || [];
        arr.push(q);
        map.set(key, arr);
      }
    });
    return map;
  }, [db.quotes]);
  const serviceOrdersByClientId = useMemo(() => {
    const map = new Map<string, ServiceOrder[]>();
    db.serviceOrders.forEach(o => {
      if (o.client_id) {
        const arr = map.get(o.client_id) || [];
        arr.push(o);
        map.set(o.client_id, arr);
      }
    });
    return map;
  }, [db.serviceOrders]);

  // Helper to determine the quote/service budget value for quick display
  const getAppointmentValue = useCallback((app: Appointment): number | null => {
    // 1. If explicit valor on appointment
    if (typeof app.valor === 'number' && !isNaN(app.valor) && app.valor > 0) {
      return app.valor;
    }

    // 2. If linked to an OS
    if (app.os_id) {
      const os = serviceOrdersById.get(app.os_id);
      if (os && typeof os.total === 'number' && os.total > 0) {
        return os.total;
      }
      // Check quote linked to this OS
      const linkedQuote = quotesByOsId.get(app.os_id) || (os?.quote_id ? quotesById.get(os.quote_id) : undefined);
      if (linkedQuote && typeof linkedQuote.total === 'number' && linkedQuote.total > 0) {
        return linkedQuote.total;
      }
    }

    // 3. If client has quotes (prefer approved)
    if (app.client_id) {
      const clientQuotes = quotesByClientId.get(app.client_id) || [];
      const approvedQuote = clientQuotes.find(q => q.status === 'aprovado') || clientQuotes[0];
      if (approvedQuote && typeof approvedQuote.total === 'number' && approvedQuote.total > 0) {
        return approvedQuote.total;
      }
      const clientOSList = serviceOrdersByClientId.get(app.client_id) || [];
      if (clientOSList.length > 0 && typeof clientOSList[0].total === 'number' && clientOSList[0].total > 0) {
        return clientOSList[0].total;
      }
    }

    if (app.client_name) {
      const key = app.client_name.toLowerCase().trim();
      const clientQuotes = quotesByClientNameLower.get(key) || [];
      const approvedQuote = clientQuotes.find(q => q.status === 'aprovado') || clientQuotes[0];
      if (approvedQuote && typeof approvedQuote.total === 'number' && approvedQuote.total > 0) {
        return approvedQuote.total;
      }
    }

    if (typeof app.valor === 'number') {
      return app.valor;
    }

    return null;
  }, [serviceOrdersById, quotesById, quotesByOsId, quotesByClientId, quotesByClientNameLower, serviceOrdersByClientId]);

  // ==========================================
  // CALENDAR CALCULATION ENGINE
  // ==========================================
  
  // Get start date of the target week (Sunday)
  const getStartOfWeek = (offsetWeeks: number): Date => {
    const today = new Date();
    // Adjust day of week (0 = Sun, 1 = Mon...)
    const currentDayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - currentDayOfWeek + (offsetWeeks * 7));
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  };

  const startOfWeek = getStartOfWeek(currentWeekOffset);

  // Generate 7 days of the active week
  const weekDays = Array.from({ length: 7 }).map((_, index) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + index);
    return d;
  });

  const weekDayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const weekDayShortNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Match dates format YYYY-MM-DD
  const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Filter Appointments based on technician and status filters
  // By default ('a_executar'), only pending services yet to be executed are shown. Concluded services are archived from active agenda.
  const filteredAppointments = useMemo(() => {
    return db.appointments.filter(a => {
      const matchesTech = techFilter ? a.tecnico === techFilter : true;
      if (!matchesTech) return false;

      if (statusFilter === 'a_executar' || !statusFilter) {
        if (a.status === 'concluido' || a.status === 'cancelado') return false;
      } else if (statusFilter !== 'todos') {
        if (a.status !== statusFilter) return false;
      }

      // In list view, apply Month & Year filter
      if (viewMode === 'lista') {
        if (!a.data_hora) return false;
        const { year, month } = parseDateComponents(a.data_hora);
        if (selectedYear !== 'all' && year !== selectedYear) return false;
        if (selectedMonth !== 'all' && month !== selectedMonth) return false;
      }

      return true;
    });
  }, [db.appointments, techFilter, statusFilter, viewMode, selectedMonth, selectedYear]);

  // Keys and appointments for 'dia' (Dia Corrente) view
  const selectedDateKey = formatDateKey(selectedDate);
  const isSelectedToday = formatDateKey(new Date()) === selectedDateKey;

  // Mini 7-day strip around selectedDate
  const miniWeekStrip = useMemo(() => {
    const cur = new Date(selectedDate);
    const dayOfWeek = cur.getDay(); // 0 = Sun
    const start = new Date(cur);
    start.setDate(cur.getDate() - dayOfWeek);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = formatDateKey(d);
      const count = filteredAppointments.filter(
        a => (a.data_hora ? a.data_hora.split(/[ T]/)[0] : '') === key
      ).length;
      return { date: d, key, count };
    });
  }, [selectedDate, filteredAppointments]);

  // Appointments for the active day in 'dia' view
  const dayAppointments = useMemo(() => {
    return filteredAppointments
      .filter(a => (a.data_hora ? a.data_hora.split(/[ T]/)[0] : '') === selectedDateKey)
      .sort((a, b) => (a.data_hora || '').localeCompare(b.data_hora || ''));
  }, [filteredAppointments, selectedDateKey]);

  // Day metrics
  const dayMetrics = useMemo(() => {
    let totalValor = 0;
    let pendentes = 0;
    let concluidos = 0;
    dayAppointments.forEach(app => {
      const v = getAppointmentValue(app) || app.valor || 0;
      totalValor += v;
      if (app.status === 'concluido') concluidos++;
      else if (app.status !== 'cancelado') pendentes++;
    });
    return {
      total: dayAppointments.length,
      pendentes,
      concluidos,
      totalValor,
    };
  }, [dayAppointments, getAppointmentValue]);

  // Quick Status Change directly from card or table
  const handleStatusChange = (appointmentId: string, newStatus: AppointmentStatus) => {
    const targetApp = db.appointments.find(a => a.id === appointmentId);

    if (newStatus === 'concluido') {
      const resolvedVal = (targetApp ? getAppointmentValue(targetApp) : null) || targetApp?.valor || 0;
      const result = completeServiceAndSyncAll(db, {
        source: 'agenda',
        id: appointmentId,
        valor: resolvedVal,
        tecnico: targetApp?.tecnico,
        observacoes: targetApp?.observacoes,
      });
      onUpdateDb(result.updatedDb);
      const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
      setConcludedNotice(`Serviço de ${result.clienteNome} concluído com sucesso! Valor${valStr} registrado automaticamente no financeiro e salvo no histórico.`);
      setTimeout(() => setConcludedNotice(null), 6000);
      return;
    }

    const updatedApps = db.appointments.map(a => {
      if (a.id === appointmentId) {
        return { ...a, status: newStatus };
      }
      return a;
    });

    // Synchronize linked OS if exists
    let updatedOS = db.serviceOrders;
    if (targetApp && targetApp.os_id) {
      updatedOS = db.serviceOrders.map(os => {
        if (os.id === targetApp.os_id) {
          if (newStatus === 'agendado' && os.status === 'orcamento') {
            return { ...os, status: 'agendado' };
          } else if (newStatus === 'cancelado' && os.status !== 'concluido') {
            return { ...os, status: 'cancelado' };
          }
        }
        return os;
      });
    }

    onUpdateDb({ ...db, appointments: updatedApps, serviceOrders: updatedOS });
  };

  // Open Create Appointment
  const handleCreateOpen = () => {
    setSelectedAppointment(null);
    setClientId(db.clients[0]?.id || '');
    
    // Default to tomorrow 10am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    setDateTime(`${tomorrow.getFullYear()}-${m}-${d}T10:00`);
    
    setServiceText(db.services[0]?.nome || 'Higienização de Estofado');
    setDuration('120');
    setTechName(TECNICOS_HIGIPRO[0]);
    setEndereco(db.clients[0]?.endereco || '');
    setObservacoes('');
    setStatus('agendado');
    setValorInput('');
    setIsCrudOpen(true);
  };

  // Open Edit Appointment
  const handleEditOpen = (app: Appointment) => {
    setSelectedAppointment(app);
    setClientId(app.client_id);
    setServiceText(app.servicos);
    setDateTime(app.data_hora);
    setDuration(app.duracao.toString());
    setTechName(app.tecnico);
    setEndereco(app.endereco);
    setObservacoes(app.observacoes);
    setStatus(app.status);
    const val = getAppointmentValue(app);
    setValorInput(val !== null && !isNaN(val) ? val.toString() : '');
    setIsCrudOpen(true);
  };

  // Auto load address when client selection changes
  const handleClientChange = (id: string) => {
    setClientId(id);
    const client = db.clients.find(c => c.id === id);
    if (client) {
      setEndereco(client.endereco);
      // Auto-suggest quote value for this client if exists and field is empty
      const clientQuote = db.quotes.find(q => q.client_id === id && q.status === 'aprovado') || db.quotes.find(q => q.client_id === id);
      if (clientQuote && !valorInput) {
        setValorInput(clientQuote.total.toString());
      }
    }
  };

  // Save Booking
  const handleSaveAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      setConcludedNotice('Por favor, selecione um cliente para o agendamento.');
      return;
    }

    const client = db.clients.find(c => c.id === clientId);
    if (!client) return;

    const parsedVal = valorInput.trim() !== '' ? parseFloat(valorInput.replace(',', '.')) : undefined;

    if (selectedAppointment) {
      // Edit
      const updatedApp: Appointment = {
        ...selectedAppointment,
        client_id: clientId,
        client_name: client.nome,
        servicos: serviceText.trim(),
        data_hora: dateTime,
        duracao: parseInt(duration) || 60,
        tecnico: techName,
        endereco: endereco.trim(),
        observacoes: observacoes.trim(),
        status: status,
        valor: parsedVal,
      };
      const updatedApps = db.appointments.map(a => a.id === selectedAppointment.id ? updatedApp : a);
      if (status === 'concluido') {
        const resolvedVal = parsedVal > 0 ? parsedVal : (getAppointmentValue(selectedAppointment) || 0);
        const result = completeServiceAndSyncAll(
          { ...db, appointments: updatedApps },
          {
            source: 'agenda',
            id: selectedAppointment.id,
            valor: resolvedVal,
            tecnico: techName,
            observacoes: observacoes.trim(),
          }
        );
        onUpdateDb(result.updatedDb);
        const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
        setConcludedNotice(`Serviço de ${result.clienteNome} concluído! Valor${valStr} lançado automaticamente no financeiro.`);
        setTimeout(() => setConcludedNotice(null), 6000);
      } else {
        onUpdateDb({ ...db, appointments: updatedApps });
      }
      supabaseSaveAppointment(updatedApp);
    } else {
      // Create
      const newApp: Appointment = {
        id: generateId(),
        client_id: clientId,
        client_name: client.nome,
        servicos: serviceText.trim(),
        data_hora: dateTime,
        duracao: parseInt(duration) || 60,
        status: status || 'agendado',
        tecnico: techName,
        endereco: endereco.trim(),
        observacoes: observacoes.trim(),
        valor: parsedVal,
      };
      if (status === 'concluido') {
        const resolvedVal = parsedVal > 0 ? parsedVal : (getAppointmentValue(newApp) || 0);
        const result = completeServiceAndSyncAll(
          { ...db, appointments: [newApp, ...db.appointments] },
          {
            source: 'agenda',
            id: newApp.id,
            valor: resolvedVal,
            tecnico: techName,
            observacoes: observacoes.trim(),
          }
        );
        onUpdateDb(result.updatedDb);
        const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
        setConcludedNotice(`Serviço de ${result.clienteNome} cadastrado e concluído! Valor${valStr} lançado no financeiro.`);
        setTimeout(() => setConcludedNotice(null), 6000);
      } else {
        onUpdateDb({ ...db, appointments: [newApp, ...db.appointments] });
      }
      supabaseSaveAppointment(newApp);
    }

    setIsCrudOpen(false);
  };

  // Delete Booking
  const handleDeleteConfirm = () => {
    if (!appointmentToDelete) return;
    const updated = db.appointments.filter(a => a.id !== appointmentToDelete.id);
    onUpdateDb({ ...db, appointments: updated });
    supabaseDeleteAppointment(appointmentToDelete.id);
    setAppointmentToDelete(null);
    setIsCrudOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 font-display">Agenda de Atendimentos</h1>
          <p className="text-sm text-slate-500">Escala de horários de visitas, limpezas e impermeabilizações para equipes técnicas.</p>
        </div>
        <button
          onClick={handleCreateOpen}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </button>
      </div>

      {/* Concluded Toast / Notice */}
      {concludedNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-semibold shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{concludedNotice}</span>
          </div>
          <button 
            type="button"
            onClick={() => setConcludedNotice(null)} 
            className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toolbar controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-4">
        
        {/* View Toggle: Dia Corrente (Padrão), Mensal, Semanal e Lista */}
        <div className="flex p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setViewMode('dia')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              viewMode === 'dia' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Dia Corrente</span>
          </button>
          <button
            onClick={() => setViewMode('mes')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              viewMode === 'mes' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Mensal</span>
          </button>
          <button
            onClick={() => setViewMode('semana')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'semana' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span>Semanal</span>
          </button>
          <button
            onClick={() => setViewMode('lista')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'lista' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Lista</span>
          </button>
        </div>

        {/* Technician Filter, Status Filter & Week control */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
          
          {/* Status Select Filter */}
          <div className="relative w-full sm:w-44">
            <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-100 rounded-xl appearance-none focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer text-slate-700"
            >
              <option value="a_executar">⏳ A Executar (Pendentes)</option>
              <option value="todos">📋 Todos os Status</option>
              <option value="agendado">📅 Agendado</option>
              <option value="confirmado">✅ Confirmado</option>
              <option value="concluido">🏆 Concluído (Histórico)</option>
              <option value="cancelado">❌ Cancelado</option>
            </select>
          </div>

          {/* Tech Select */}
          <div className="relative w-full sm:w-44">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <select
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-100 rounded-xl appearance-none focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer text-slate-700"
            >
              <option value="">Todos Técnicos</option>
              {TECNICOS_HIGIPRO.map((tec) => (
                <option key={tec} value={tec}>{tec}</option>
              ))}
            </select>
          </div>

          {/* Month and Year Period Selector */}
          <PeriodFilter
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthChange={handleMonthChange}
            onYearChange={handleYearChange}
            availableYears={availableYears}
            showAllMonthsOption={true}
            showAllYearsOption={true}
            allMonthsLabel="Todos os Meses"
            allYearsLabel="Todos os Anos"
            onResetToCurrent={handleResetToCurrent}
            compact={true}
          />

          {/* Week Navigation */}
          {viewMode === 'semana' && (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
                className="p-1 hover:bg-white rounded-lg text-slate-600 transition cursor-pointer"
                title="Semana anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentWeekOffset(0)}
                className="px-2.5 py-1 hover:bg-white text-[10px] font-bold text-blue-700 rounded-lg transition uppercase tracking-wider cursor-pointer"
              >
                Hoje
              </button>
              <button
                onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
                className="p-1 hover:bg-white rounded-lg text-slate-600 transition cursor-pointer"
                title="Próxima semana"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* View Switcher: Dia Corrente (Padrão), Grade Mensal, Grade Semanal ou Lista */}
      {viewMode === 'dia' ? (
        <div className="space-y-4">
          {/* Day Header Banner & Navigation */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20 shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-800 capitalize font-display">
                    {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </h2>
                  {isSelectedToday && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-600 text-white shadow-xs">
                      Hoje
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Visualização detalhada dos atendimentos do dia com cartões destacados e leitura facilitada
                </p>
              </div>
            </div>

            {/* Navigation Buttons + Date Picker */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={handlePrevDay}
                  className="px-2.5 py-1.5 hover:bg-white text-slate-700 text-xs font-bold rounded-lg transition border border-transparent hover:border-slate-200 cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Dia anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetToToday}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition cursor-pointer shadow-2xs ${
                    isSelectedToday
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-blue-700 hover:bg-blue-50'
                  }`}
                  title="Voltar para o dia de hoje"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={handleNextDay}
                  className="px-2.5 py-1.5 hover:bg-white text-slate-700 text-xs font-bold rounded-lg transition border border-transparent hover:border-slate-200 cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Próximo dia"
                >
                  <span className="hidden sm:inline">Próximo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Native Date Input for Quick Jump */}
              <input
                type="date"
                value={selectedDateKey}
                onChange={(e) => {
                  if (e.target.value) {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    setSelectedDate(new Date(y, m - 1, d));
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Mini 7-Day Week Strip */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 bg-slate-50 p-2 sm:p-2.5 rounded-2xl border border-slate-200/80">
            {miniWeekStrip.map(({ date, key, count }) => {
              const isSelected = key === selectedDateKey;
              const isToday = formatDateKey(new Date()) === key;
              const dayName = weekDayShortNames[date.getDay()];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]'
                      : 'bg-white text-slate-700 hover:bg-blue-50 border border-slate-200/60'
                  }`}
                >
                  <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                    {dayName}
                  </span>
                  <span className="text-sm sm:text-base font-extrabold font-display my-0.5">
                    {date.getDate()}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    {isToday && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-blue-600'}`} />
                    )}
                    {count > 0 && (
                      <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                        isSelected 
                          ? 'bg-white text-blue-900' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Day Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Atendimentos</span>
              <span className="text-xl sm:text-2xl font-black text-slate-800 font-display mt-0.5 block">{dayMetrics.total}</span>
            </div>
            <div className="bg-white p-3 sm:p-4 rounded-xl border border-blue-200 shadow-2xs">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">⏳ Pendentes / A Executar</span>
              <span className="text-xl sm:text-2xl font-black text-blue-700 font-display mt-0.5 block">{dayMetrics.pendentes}</span>
            </div>
            <div className="bg-white p-3 sm:p-4 rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">✅ Concluídos</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-700 font-display mt-0.5 block">{dayMetrics.concluidos}</span>
            </div>
            <div className="bg-white p-3 sm:p-4 rounded-xl border border-emerald-300 shadow-2xs bg-emerald-50/20">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">💰 Faturamento Previsto</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-700 font-mono mt-0.5 block">
                {formatCurrency(dayMetrics.totalValor)}
              </span>
            </div>
          </div>

          {/* Cards List for the Selected Day: Cartões em destaque, maiores e com leitura facilitada */}
          {dayAppointments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dayAppointments.map(app => {
                const appointmentVal = getAppointmentValue(app);
                const client = db.clients.find(c => c.id === app.client_id) || db.clients.find(c => c.nome.toLowerCase() === (app.client_name || '').toLowerCase());
                const phoneClean = (client?.telefone || '').replace(/\D/g, '');
                const waUrl = phoneClean ? `https://wa.me/55${phoneClean}` : null;
                const mapsUrl = app.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(app.endereco)}` : null;

                return (
                  <div
                    key={app.id}
                    className={`bg-white border-2 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 ${
                      app.status === 'concluido'
                        ? 'border-emerald-300 bg-emerald-50/10'
                        : app.status === 'cancelado'
                        ? 'border-red-300 opacity-70'
                        : app.status === 'confirmado'
                        ? 'border-blue-400 shadow-blue-500/5'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Top Row: Time Badge, Status Badge & Value */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-mono font-bold text-xs sm:text-sm">
                          <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          {formatTime(app.data_hora)} ({app.duracao} min)
                        </span>
                        
                        <div className="relative">
                          <select
                            value={app.status}
                            onChange={(e) => handleStatusChange(app.id, e.target.value as AppointmentStatus)}
                            className={`text-xs font-bold py-1 pl-2.5 pr-6 rounded-xl border appearance-none cursor-pointer transition focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs ${getStatusBadgeClass(app.status)}`}
                          >
                            <option value="agendado">📅 Agendado</option>
                            <option value="confirmado">✅ Confirmado</option>
                            <option value="concluido">🏆 Concluído</option>
                            <option value="cancelado">❌ Cancelado</option>
                          </select>
                          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                        </div>
                      </div>

                      {appointmentVal !== null && appointmentVal > 0 && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-extrabold text-sm sm:text-base">
                          <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
                          {formatCurrency(appointmentVal)}
                        </span>
                      )}
                    </div>

                    {/* Client & Service Info */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base sm:text-lg font-bold text-slate-800 font-display">
                            {app.client_name}
                          </h3>
                          {client?.telefone && (
                            <p className="text-xs text-slate-500 font-mono mt-0.5">
                              {formatPhone(client.telefone)}
                            </p>
                          )}
                        </div>

                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-xs shrink-0 cursor-pointer"
                            title="Conversar no WhatsApp"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>

                      {/* Service Details */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-xs sm:text-sm font-semibold text-blue-700">
                          {app.servicos}
                        </p>
                        <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Técnico Responsável: <strong className="text-slate-800">{app.tecnico}</strong></span>
                        </p>
                      </div>

                      {/* Address with Google Maps Link */}
                      {app.endereco && (
                        <div className="flex items-start justify-between gap-2 p-2.5 bg-slate-50/70 rounded-xl border border-slate-100">
                          <div className="flex items-start gap-2 min-w-0">
                            <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            <span className="text-xs text-slate-700 font-medium break-words">
                              {app.endereco}
                            </span>
                          </div>
                          {mapsUrl && (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-bold text-blue-600 hover:underline shrink-0 ml-2"
                            >
                              Abrir no GPS
                            </a>
                          )}
                        </div>
                      )}

                      {/* Observações */}
                      {app.observacoes && (
                        <p className="text-xs text-slate-500 italic bg-amber-50/60 border border-amber-200/60 p-2.5 rounded-xl">
                          📝 {app.observacoes}
                        </p>
                      )}
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      {app.status !== 'concluido' ? (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(app.id, 'concluido')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Concluir Atendimento</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          Atendimento Concluído
                        </span>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditOpen(app)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setAppointmentToDelete(app)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                          title="Excluir este agendamento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-8 sm:p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
                <Calendar className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 font-display">
                  Nenhum atendimento agendado para este dia
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Não há visitas ou serviços agendados para {selectedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                  const d = String(selectedDate.getDate()).padStart(2, '0');
                  setDateTime(`${selectedDate.getFullYear()}-${m}-${d}T09:00`);
                  setClientId(db.clients[0]?.id || '');
                  setServiceText('Higienização de Estofado');
                  setDuration('120');
                  setTechName(TECNICOS_HIGIPRO[0]);
                  setEndereco(db.clients[0]?.endereco || '');
                  setObservacoes('');
                  setStatus('agendado');
                  setIsCrudOpen(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-md shadow-blue-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Agendar Atendimento para Este Dia
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'mes' ? (
        <div className="space-y-4">
          {/* Month Header and Navigation */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-800 font-display capitalize">
                  {monthName(activeCalendarMonth)} de {activeCalendarYear}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Grade Mensal de Visitas e Atendimentos HigiPro
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-2 hover:bg-slate-100 active:bg-slate-200 text-slate-700 rounded-xl transition border border-slate-200 cursor-pointer shadow-2xs"
                title="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleResetToCurrent}
                className="px-3 py-1.5 hover:bg-blue-50 text-xs font-bold text-blue-700 border border-blue-200 rounded-xl transition cursor-pointer shadow-2xs"
                title="Ir para o mês atual"
              >
                Hoje / Mês Atual
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-2 hover:bg-slate-100 active:bg-slate-200 text-slate-700 rounded-xl transition border border-slate-200 cursor-pointer shadow-2xs"
                title="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar 7-Column Grid */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100 text-center py-2.5">
              {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((name, i) => (
                <div key={name} className="text-[10px] sm:text-xs font-bold uppercase text-slate-500 tracking-wider">
                  <span className="hidden md:inline">{name}</span>
                  <span className="md:hidden">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][i]}</span>
                </div>
              ))}
            </div>

            {/* Grid of Day Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
              {monthCalendarDays.map((cell, idx) => {
                const dateStr = formatDateKey(cell.date);
                const isToday = formatDateKey(new Date()) === dateStr;

                const dayApps = filteredAppointments.filter(
                  a => (a.data_hora ? a.data_hora.split(/[ T]/)[0] : '') === dateStr
                );

                return (
                  <div
                    key={idx}
                    className={`min-h-[110px] sm:min-h-[135px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors ${
                      !cell.isCurrentMonth
                        ? 'bg-slate-50/50 opacity-40'
                        : isToday
                          ? 'bg-blue-50/20 ring-1 ring-inset ring-blue-500/30'
                          : 'bg-white hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Day Cell Header - Click to open full Day view */}
                    <div 
                      onClick={() => {
                        setSelectedDate(cell.date);
                        setViewMode('dia');
                      }}
                      className="flex items-center justify-between mb-1 cursor-pointer group"
                      title={`Ver cartões ampliados do dia ${cell.dayNum}`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold font-display group-hover:scale-110 transition-transform ${
                          isToday
                            ? 'bg-blue-600 text-white shadow-xs'
                            : cell.isCurrentMonth
                              ? 'text-slate-800'
                              : 'text-slate-400'
                        }`}
                      >
                        {cell.dayNum}
                      </span>

                      {dayApps.length > 0 && (
                        <span className="text-[9.5px] font-black px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                          {dayApps.length}
                        </span>
                      )}
                    </div>

                    {/* Day Appointments List */}
                    <div className="flex-1 space-y-1 overflow-y-auto max-h-[80px] sm:max-h-[100px] custom-scrollbar">
                      {dayApps.slice(0, 3).map(app => {
                        const appointmentVal = getAppointmentValue(app);

                        return (
                          <div
                            key={app.id}
                            onClick={() => handleEditOpen(app)}
                            className="p-1 sm:p-1.5 rounded-lg border border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-xs transition cursor-pointer text-left group"
                            title={`${app.client_name} - ${app.servicos} (${formatTime(app.data_hora)})`}
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-slate-800 truncate">
                              <span className="text-blue-700 font-mono shrink-0">
                                {formatTime(app.data_hora)}
                              </span>
                              <span className="truncate group-hover:text-blue-600">
                                {app.client_name}
                              </span>
                            </div>
                            <p className="text-[9.5px] text-slate-500 truncate">
                              {app.servicos}
                            </p>
                            {appointmentVal !== null && appointmentVal > 0 && (
                              <span className="text-[9px] font-bold text-emerald-700 font-mono block">
                                {formatCurrency(appointmentVal)}
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {dayApps.length > 3 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMonth(cell.date.getMonth());
                            setSelectedYear(cell.date.getFullYear());
                            setViewMode('lista');
                          }}
                          className="text-[9px] font-bold text-blue-700 hover:underline block text-center w-full"
                        >
                          +{dayApps.length - 3} mais
                        </button>
                      )}
                    </div>

                    {/* Day Cell Footer: Add Button */}
                    {cell.isCurrentMonth && (
                      <div className="pt-1 mt-1 border-t border-slate-50 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const m = String(cell.date.getMonth() + 1).padStart(2, '0');
                            const d = String(cell.date.getDate()).padStart(2, '0');
                            setDateTime(`${cell.date.getFullYear()}-${m}-${d}T09:00`);
                            setClientId(db.clients[0]?.id || '');
                            setServiceText('Higienização de Estofado');
                            setDuration('120');
                            setTechName(TECNICOS_HIGIPRO[0]);
                            setEndereco(db.clients[0]?.endereco || '');
                            setObservacoes('');
                            setStatus('agendado');
                            setIsCrudOpen(true);
                          }}
                          className="p-0.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                          title={`Agendar atendimento no dia ${cell.dayNum}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : viewMode === 'semana' ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-medium">
            Exibindo semana de <span className="font-bold text-slate-700">{formatDate(weekDays[0].toISOString())}</span> a <span className="font-bold text-slate-700">{formatDate(weekDays[6].toISOString())}</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {weekDays.map((day, dIdx) => {
              const dateStr = formatDateKey(day);
              const isToday = formatDateKey(new Date()) === dateStr;
              
              // Appointments for this specific day
              const dayApps = filteredAppointments.filter(
                a => (a.data_hora ? a.data_hora.split(/[ T]/)[0] : '') === dateStr
              );

              return (
                <div 
                  key={dIdx} 
                  className={`bg-white border rounded-2xl p-3 min-h-[260px] flex flex-col justify-between ${
                    isToday 
                      ? 'border-blue-600 bg-blue-50/10 shadow-xs' 
                      : 'border-slate-100'
                  }`}
                >
                  {/* Day Header - Click to open full Day view */}
                  <div 
                    onClick={() => {
                      setSelectedDate(day);
                      setViewMode('dia');
                    }}
                    className="border-b border-slate-100 pb-2 mb-2 text-center cursor-pointer group"
                    title={`Ver cartões ampliados de ${weekDayNames[day.getDay()]}`}
                  >
                    <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-blue-600 block tracking-wide">
                      {weekDayShortNames[day.getDay()]}
                    </span>
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-sm font-display mt-0.5 group-hover:scale-110 transition-transform ${
                      isToday ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700'
                    }`}>
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Booking list for this day */}
                  <div className="flex-1 space-y-2 overflow-y-auto max-h-[250px] pr-0.5">
                    {dayApps.map(app => {
                      const appointmentVal = getAppointmentValue(app);

                      return (
                        <div
                          key={app.id}
                          onClick={() => handleEditOpen(app)}
                          className={`p-2.5 border rounded-xl text-[11px] leading-snug cursor-pointer transition shadow-2xs relative group hover:border-blue-300 ${
                            app.status === 'cancelado'
                              ? 'border-red-200 bg-red-50/30 opacity-80'
                              : app.status === 'concluido'
                              ? 'border-emerald-200 bg-emerald-50/20'
                              : app.status === 'confirmado'
                              ? 'border-indigo-200 bg-indigo-50/20'
                              : 'border-slate-200 bg-white hover:bg-slate-50/50'
                          }`}
                        >
                          {/* Header: Client Name & Direct Delete Button */}
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-slate-800 block truncate" title={app.client_name}>
                                {app.client_name}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 font-medium">
                                {formatTime(app.data_hora)} ({app.duracao}m)
                              </span>
                            </div>

                            {/* Direct Delete button on the card */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAppointmentToDelete(app);
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer shrink-0"
                              title="Excluir este agendamento direto no card"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Service description */}
                          <p className="text-blue-700 text-[10.5px] font-medium truncate mb-1" title={app.servicos}>
                            {app.servicos}
                          </p>

                          {/* Valor do Orçamento - Visualização Rápida no Card */}
                          <div className="flex items-center justify-between gap-1 mb-1.5 px-2 py-1 bg-emerald-50/90 border border-emerald-200/80 rounded-lg">
                            <span className="text-[9.5px] font-bold text-emerald-800 flex items-center gap-1">
                              <DollarSign className="w-3 h-3 text-emerald-600 shrink-0" />
                              Orçamento:
                            </span>
                            <span className="text-[11px] font-extrabold text-emerald-700 font-mono">
                              {appointmentVal !== null && !isNaN(appointmentVal) ? formatCurrency(appointmentVal) : 'A definir'}
                            </span>
                          </div>

                          {/* Technician */}
                          <p className="text-[9.5px] text-slate-500 truncate mb-1.5">
                            Téc: <strong className="text-slate-700 font-medium">{app.tecnico}</strong>
                          </p>

                          {/* Status selector with options open anytime */}
                          <div 
                            className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Status:</span>
                            <div className="relative">
                              <select
                                value={app.status}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(app.id, e.target.value as AppointmentStatus);
                                }}
                                className={`text-[10px] font-bold py-0.5 pl-2 pr-5 rounded-full border appearance-none cursor-pointer transition focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs ${getStatusBadgeClass(app.status)}`}
                                title="Clique para alterar o status a qualquer momento"
                              >
                                <option value="agendado">📅 Agendado</option>
                                <option value="confirmado">✅ Confirmado</option>
                                <option value="concluido">🏆 Concluído</option>
                                <option value="cancelado">❌ Cancelado</option>
                              </select>
                              <ChevronDown className="w-2.5 h-2.5 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {dayApps.length === 0 && (
                      <p className="text-[10px] text-slate-400 text-center italic mt-6">Livre</p>
                    )}
                  </div>

                  {/* Day Footer Quick add */}
                  <div className="pt-2 border-t border-slate-50 text-center">
                    <button
                      onClick={() => {
                        const m = String(day.getMonth() + 1).padStart(2, '0');
                        const d = String(day.getDate()).padStart(2, '0');
                        setDateTime(`${day.getFullYear()}-${m}-${d}T09:00`);
                        setClientId(db.clients[0]?.id || '');
                        setServiceText('Higienização de Estofado');
                        setDuration('120');
                        setTechName(TECNICOS_HIGIPRO[0]);
                        setEndereco(db.clients[0]?.endereco || '');
                        setObservacoes('');
                        setStatus('agendado');
                        setIsCrudOpen(true);
                      }}
                      className="p-1 hover:bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg transition mx-auto cursor-pointer"
                      title="Agendar neste dia"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View Mode */
        <div className="space-y-4">
          {filteredAppointments.length > 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3.5">Data & Hora</th>
                      <th className="px-6 py-3.5">Cliente</th>
                      <th className="px-6 py-3.5">Serviço / Atendimento</th>
                      <th className="px-6 py-3.5">Valor Orçamento</th>
                      <th className="px-6 py-3.5">Técnico</th>
                      <th className="px-6 py-3.5">Endereço</th>
                      <th className="px-6 py-3.5">Duração</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...filteredAppointments]
                      .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
                      .map(app => {
                        const appointmentVal = getAppointmentValue(app);

                        return (
                          <tr key={app.id} className="hover:bg-slate-50 text-xs text-slate-600">
                            <td className="px-6 py-4 font-semibold text-slate-800">
                              {formatDate(app.data_hora)} às {formatTime(app.data_hora)}
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-800">{app.client_name}</td>
                            <td className="px-6 py-4 text-blue-700 font-medium">{app.servicos}</td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 font-mono text-xs shadow-2xs">
                                <DollarSign className="w-3 h-3 text-emerald-600 shrink-0" />
                                {appointmentVal !== null && !isNaN(appointmentVal) ? formatCurrency(appointmentVal) : 'A definir'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-700">{app.tecnico}</td>
                            <td className="px-6 py-4 truncate max-w-xs">{app.endereco}</td>
                            <td className="px-6 py-4 text-slate-500">{app.duracao} min</td>
                            <td className="px-6 py-4">
                              <div className="relative inline-block">
                                <select
                                  value={app.status}
                                  onChange={(e) => handleStatusChange(app.id, e.target.value as AppointmentStatus)}
                                  className={`text-xs font-bold py-1 pl-2.5 pr-6 rounded-full border appearance-none cursor-pointer transition focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs ${getStatusBadgeClass(app.status)}`}
                                  title="Alterar status a qualquer momento"
                                >
                                  <option value="agendado">📅 Agendado</option>
                                  <option value="confirmado">✅ Confirmado</option>
                                  <option value="concluido">🏆 Concluído</option>
                                  <option value="cancelado">❌ Cancelado</option>
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleEditOpen(app)}
                                  className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => setAppointmentToDelete(app)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                  title="Excluir este agendamento"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Calendar className="w-10 h-10" />}
              title="Nenhum agendamento listado"
              description="Nenhum compromisso coincide com os filtros selecionados."
            />
          )}
        </div>
      )}

      {/* CRUD Modal Add / Edit Appointment */}
      <Modal
        isOpen={isCrudOpen}
        onClose={() => setIsCrudOpen(false)}
        title={selectedAppointment ? "Editar Agendamento" : "Novo Agendamento"}
        size="md"
      >
        <form onSubmit={handleSaveAppointment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Client dropdown */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Cliente *</label>
              <select
                required
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
              >
                <option value="">Selecione um cliente...</option>
                {db.clients.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {/* Service Title */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Título do Serviço / Descrição *</label>
              <input
                type="text"
                required
                value={serviceText}
                onChange={(e) => setServiceText(e.target.value)}
                placeholder="Ex: Higienização e Impermeabilização de Sofá"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Date-time */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Data e Hora *</label>
              <input
                type="datetime-local"
                required
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Duração Estimada (min)</label>
              <input
                type="number"
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Ex: 120"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Technician */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Técnico Escalado *</label>
              <select
                required
                value={techName}
                onChange={(e) => setTechName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer font-medium"
              >
                {TECNICOS_HIGIPRO.map((tec) => (
                  <option key={tec} value={tec}>{tec}</option>
                ))}
              </select>
            </div>

            {/* Valor do Orçamento */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Valor do Orçamento (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorInput}
                  onChange={(e) => setValorInput(e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                />
              </div>
            </div>

            {/* Status (Only on Edit) */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Status da Visita</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
              >
                <option value="agendado">Agendado</option>
                <option value="confirmado">Confirmado com Cliente</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            {/* Address */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Endereço Completo</label>
              <input
                type="text"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Carregado automaticamente do cadastro"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Observations */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Observações Operacionais</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Instruções especiais de acesso ou detalhes sobre manchas..."
                rows={2.5}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-4">
            {selectedAppointment ? (
              <button
                type="button"
                onClick={() => setAppointmentToDelete(selectedAppointment)}
                className="text-red-500 hover:text-red-700 hover:underline text-xs font-semibold"
              >
                Excluir Agendamento
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCrudOpen(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl transition shadow-xs cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete dialog */}
      <ConfirmDialog
        isOpen={appointmentToDelete !== null}
        onClose={() => setAppointmentToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Excluir Agendamento"
        description={
          appointmentToDelete
            ? `Deseja realmente remover permanentemente o agendamento de "${appointmentToDelete.client_name}" (${formatDate(appointmentToDelete.data_hora)} às ${formatTime(appointmentToDelete.data_hora)})? Essa ação removerá o compromisso da agenda técnica.`
            : "Deseja realmente remover permanentemente este compromisso de atendimento da escala técnica?"
        }
      />
    </div>
  );
});
