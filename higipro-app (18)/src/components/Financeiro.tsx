/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useDeferredValue, useCallback } from 'react';
import { 
  Plus, Search, Filter, ArrowUpRight, ArrowDownRight, DollarSign,
  TrendingUp, Calendar, Trash2, Edit2, AlertCircle, CheckCircle, BarChart3, User, FileText,
  ChevronLeft, ChevronRight, RotateCcw, Upload, FileSpreadsheet
} from 'lucide-react';
import { DatabaseState, Transaction, TransactionType, PaymentMethod, TransactionStatus, Client } from '../types';
import { formatCurrency, formatDate, formatPhone, monthName, parseDateComponents } from '../lib/utils';
import { PAYMENT_METHODS, generateId } from '../lib/database';
import { Modal, ConfirmDialog, EmptyState, StatusBadge } from './UIComponents';
import { FinanceiroGraficos } from './FinanceiroGraficos';
import { applySeptember2026Spreadsheet } from '../lib/september2026Spreadsheet';
import { ImportarPlanilhaModal } from './ImportarPlanilhaModal';

interface FinanceiroProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
}

const MONTHS_LIST = [
  { index: 0, short: 'Jan', full: 'Janeiro' },
  { index: 1, short: 'Fev', full: 'Fevereiro' },
  { index: 2, short: 'Mar', full: 'Março' },
  { index: 3, short: 'Abr', full: 'Abril' },
  { index: 4, short: 'Mai', full: 'Maio' },
  { index: 5, short: 'Jun', full: 'Junho' },
  { index: 6, short: 'Jul', full: 'Julho' },
  { index: 7, short: 'Ago', full: 'Agosto' },
  { index: 8, short: 'Set', full: 'Setembro' },
  { index: 9, short: 'Out', full: 'Outubro' },
  { index: 10, short: 'Nov', full: 'Novembro' },
  { index: 11, short: 'Dez', full: 'Dezembro' },
];

export const Financeiro = React.memo<FinanceiroProps>(({ db, onUpdateDb }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [typeFilter, setTypeFilter] = useState<string>(''); // '', 'receita', 'despesa'
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  
  // Real-time current date: Always leave current month and year in first view
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // References to keep current month centered in first view on mobile
  const currentMonthRef = useRef<HTMLButtonElement | null>(null);
  const monthContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Keep the active or current month in view horizontally
    if (currentMonthRef.current) {
      currentMonthRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selectedMonth, selectedYear]);

  // Available years from database transactions and dynamic window
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([currentYear - 2, currentYear - 1, currentYear, currentYear + 1]);
    (db.transactions || []).forEach(t => {
      if (t.data) {
        const { year } = parseDateComponents(t.data);
        if (year && year >= 2020 && year <= 2035) yearsSet.add(year);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [db.transactions, currentYear]);

  // Is current month active in the current year?
  const isCurrentMonthView = selectedYear === currentYear && selectedMonth === currentMonth;

  // Period label
  const currentPeriodLabel = useMemo(() => {
    if (selectedMonth === 'all') {
      return `Ano Inteiro de ${selectedYear}`;
    }
    return `${monthName(selectedMonth)} de ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  // Group transactions count and volume per month for selectedYear
  const monthActivityMap = useMemo(() => {
    const map = new Map<number, { count: number; receitas: number; despesas: number }>();
    for (let i = 0; i < 12; i++) {
      map.set(i, { count: 0, receitas: 0, despesas: 0 });
    }
    (db.transactions || []).forEach(t => {
      if (!t.data || (t.status as any) === 'cancelado') return;
      const { year, month } = parseDateComponents(t.data);
      if (year === selectedYear && month >= 0 && month < 12) {
        const item = map.get(month);
        if (item) {
          item.count += 1;
          if (t.tipo === 'receita') item.receitas += t.valor;
          if (t.tipo === 'despesa') item.despesas += t.valor;
        }
      }
    });
    return map;
  }, [db.transactions, selectedYear]);

  const handleResetToCurrentMonth = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
  };

  // CRUD states
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);

  // Form Field State
  const [formData, setFormData] = useState({
    tipo: 'receita' as TransactionType,
    categoria: 'higienização estofados',
    descricao: '',
    valor: '',
    data: new Date().toISOString().split('T')[0],
    metodo_pagamento: 'Pix' as PaymentMethod,
    status: 'pago' as TransactionStatus,
    client_id: '',
    client_name: '',
  });

  const categoriesByTipo = {
    receita: [
      'Higienização',
      'Combo Hig + Tapete',
      'Impermeabilização',
      'Combo Hig + Imp',
      'Tapetes',
      'higienização estofados',
      'higienização colchoes',
      'limpeza de tapetes',
      'Outros'
    ],
    despesa: [
      'Compra de produtos',
      'Combustível',
      'Facebook',
      'Google',
      'Funcionários',
      'Estacionamento',
      'retirada pró-labore',
      'produtos',
      'manutenção',
      'equipamentos',
      'lavanderia',
      'Outros'
    ],
  };

  // Pre-indexed lookups for speed
  const clientMap = useMemo(() => new Map<string, Client>(db.clients.map(c => [c.id, c])), [db.clients]);
  const osMap = useMemo(() => new Map(db.serviceOrders.map(o => [o.id, o])), [db.serviceOrders]);

  // Helper to extract client and OS information from transaction with O(1) maps
  const getTransactionDetails = useCallback((tx: Transaction) => {
    let clientName = tx.client_name;
    let clientPhone: string | undefined;
    let osNumber: string | undefined;
    const serviceOrder = tx.os_id ? osMap.get(tx.os_id) : undefined;

    if (serviceOrder) {
      osNumber = serviceOrder.numero;
      if (!clientName) clientName = serviceOrder.client_name;
      clientPhone = serviceOrder.client_phone;
    }

    if (tx.client_id) {
      const client = clientMap.get(tx.client_id);
      if (client) {
        if (!clientName) clientName = client.nome;
        if (!clientPhone) clientPhone = client.telefone;
      }
    }

    return { clientName, clientPhone, osNumber };
  }, [clientMap, osMap]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const term = (deferredSearchTerm || '').toLowerCase();

    return (db?.transactions || []).filter(t => {
      if (!t) return false;
      const { year, month } = parseDateComponents(t.data);
      const matchesYear = year === selectedYear;
      const matchesMonth = selectedMonth === 'all' ? true : month === selectedMonth;
      if (!matchesYear || !matchesMonth) return false;
      
      const matchesType = typeFilter ? t.tipo === typeFilter : true;
      if (!matchesType) return false;

      if (!term) return true;

      const details = getTransactionDetails(t);

      return (
        String(t.descricao || '').toLowerCase().includes(term) ||
        String(t.categoria || '').toLowerCase().includes(term) ||
        Boolean(details.clientName && String(details.clientName).toLowerCase().includes(term)) ||
        Boolean(details.osNumber && String(details.osNumber).toLowerCase().includes(term))
      );
    });
  }, [db?.transactions, getTransactionDetails, selectedYear, selectedMonth, deferredSearchTerm, typeFilter]);

  // Pre-sort transactions once per filter change
  const sortedFilteredTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  }, [filteredTransactions]);

  // Reset page when search or period changes
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, selectedYear, selectedMonth, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(sortedFilteredTransactions.length / pageSize));
  const paginatedTransactions = useMemo(() => {
    return sortedFilteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sortedFilteredTransactions, currentPage, pageSize]);

  // Totals for the filtered period
  const totalReceitas = useMemo(() => {
    return filteredTransactions
      .filter(t => t.tipo === 'receita' && t.status === 'pago')
      .reduce((sum, t) => sum + t.valor, 0);
  }, [filteredTransactions]);

  const totalDespesas = useMemo(() => {
    return filteredTransactions
      .filter(t => t.tipo === 'despesa' && t.status === 'pago')
      .reduce((sum, t) => sum + t.valor, 0);
  }, [filteredTransactions]);

  const netBalance = totalReceitas - totalDespesas;

  // Open Create Transaction
  const [formClientSearch, setFormClientSearch] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  const filteredClientOptions = useMemo(() => {
    if (!formClientSearch.trim()) {
      return (db.clients || []).slice(0, 25);
    }
    const q = formClientSearch.toLowerCase().trim();
    return (db.clients || [])
      .filter(c => c.nome.toLowerCase().includes(q) || (c.telefone && c.telefone.includes(q)))
      .slice(0, 25);
  }, [db.clients, formClientSearch]);

  const handleCreateOpen = (type: TransactionType) => {
    setEditingTransaction(null);
    setFormClientSearch('');
    setIsClientDropdownOpen(false);
    setFormData({
      tipo: type,
      categoria: categoriesByTipo[type][0],
      descricao: '',
      valor: '',
      data: new Date().toISOString().split('T')[0],
      metodo_pagamento: 'Pix',
      status: 'pago',
      client_id: '',
      client_name: '',
    });
    setIsCrudOpen(true);
  };

  // Open Edit Transaction
  const handleEditOpen = (tx: Transaction) => {
    const details = getTransactionDetails(tx);
    setEditingTransaction(tx);
    const cName = tx.client_name || details.clientName || '';
    setFormClientSearch(cName);
    setIsClientDropdownOpen(false);
    setFormData({
      tipo: tx.tipo,
      categoria: tx.categoria,
      descricao: tx.descricao,
      valor: tx.valor.toString(),
      data: tx.data,
      metodo_pagamento: tx.metodo_pagamento,
      status: tx.status,
      client_id: tx.client_id || '',
      client_name: cName,
    });
    setIsCrudOpen(true);
  };

  // Save Transaction
  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const valueNum = parseFloat(formData.valor) || 0;
    if (valueNum <= 0) {
      alert('Por favor, informe um valor maior que zero.');
      return;
    }

    if (editingTransaction) {
      let updatedOrders = db.serviceOrders;
      if (editingTransaction.os_id && formData.status === 'pago') {
        updatedOrders = db.serviceOrders.map(os => {
          if (os.id === editingTransaction.os_id) {
            return {
              ...os,
              pago: Math.max(os.pago, valueNum),
              status: os.status === 'agendado' ? 'concluido' : os.status,
            };
          }
          return os;
        });
      }

      const nowIso = new Date().toISOString();
      const updated = db.transactions.map(t => {
        if (t.id === editingTransaction.id) {
          return {
            ...t,
            tipo: formData.tipo,
            categoria: formData.categoria,
            descricao: formData.descricao.trim() || 'Serviço s/ descrição',
            valor: valueNum,
            data: formData.data,
            metodo_pagamento: formData.metodo_pagamento,
            status: formData.status,
            client_id: formData.client_id || undefined,
            client_name: formData.client_name || undefined,
            updated_at: nowIso,
            version: (t.version || 1) + 1,
          };
        }
        return t;
      });
      onUpdateDb({ ...db, transactions: updated, serviceOrders: updatedOrders });
    } else {
      const nowIso = new Date().toISOString();
      const newTx: Transaction = {
        id: generateId(),
        tipo: formData.tipo,
        categoria: formData.categoria,
        descricao: formData.descricao.trim() || (formData.tipo === 'receita' ? 'Entrada Manual de Caixa' : 'Saída Manual de Caixa'),
        valor: valueNum,
        data: formData.data,
        metodo_pagamento: formData.metodo_pagamento,
        status: formData.status,
        client_id: formData.client_id || undefined,
        client_name: formData.client_name || undefined,
        created_at: nowIso,
        updated_at: nowIso,
        version: 1,
      };
      onUpdateDb({ ...db, transactions: [newTx, ...db.transactions] });
    }

    setIsCrudOpen(false);
  };

  // Delete Transaction
  const handleDeleteConfirm = () => {
    if (!txToDelete) return;
    const updated = db.transactions.filter(t => t.id !== txToDelete.id);
    onUpdateDb({ ...db, transactions: updated });
    setTxToDelete(null);
  };

  // Handle transaction type change inside form (resets category)
  const handleFormTypeChange = (newType: TransactionType) => {
    setFormData({
      ...formData,
      tipo: newType,
      categoria: categoriesByTipo[newType][0]
    });
  };

  const [syncFeedback, setSyncFeedback] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleReloadSpreadsheet = () => {
    const updated = applySeptember2026Spreadsheet(db);
    onUpdateDb(updated);
    setSelectedYear(2026);
    setSelectedMonth(8); // Setembro (0-indexed 8)
    setSyncFeedback(true);
    setTimeout(() => setSyncFeedback(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 font-display">Fluxo de Caixa & Finanças</h1>
          <p className="text-sm text-slate-500">Lance recebimentos, registre despesas, consulte o saldo mensal consolidado e controle pendências financeiras.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => handleCreateOpen('receita')}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Lançar Receita
          </button>
          <button
            onClick={() => handleCreateOpen('despesa')}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Lançar Despesa
          </button>
        </div>
      </div>

      {/* Seletor de Período: Meses dos Anos com Mês Corrente sempre em Primeira Visão */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          
          {/* Título do Período e Indicador de Mês Corrente */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Período:</span>
                <h2 className="text-base sm:text-lg font-bold text-slate-800 font-display">
                  {currentPeriodLabel}
                </h2>
                {isCurrentMonthView ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Mês Corrente (Em Primeira Visão)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResetToCurrentMonth}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition cursor-pointer"
                    title="Retornar para visualização do mês atual"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Ir para Mês Atual ({MONTHS_LIST[currentMonth].short}/{currentYear})
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedMonth === 'all'
                  ? `Consolidado anual de todas as receitas e despesas de ${selectedYear}`
                  : `Movimentações financeiras, receitas, despesas e gráficos de ${monthName(selectedMonth)} de ${selectedYear}`}
              </p>
            </div>
          </div>

          {/* Navegador de Anos */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-50 p-1.5 rounded-xl border border-slate-200/70">
            <span className="text-xs font-semibold text-slate-500 px-1 hidden sm:inline">Ano:</span>
            <button
              type="button"
              onClick={() => setSelectedYear(prev => prev - 1)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition cursor-pointer"
              title="Ano anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1">
              {availableYears.map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSelectedYear(y)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    selectedYear === y
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSelectedYear(prev => prev + 1)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition cursor-pointer"
              title="Próximo ano"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de Seleção dos Meses do Ano */}
        <div 
          ref={monthContainerRef}
          className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200"
        >
          {MONTHS_LIST.map(m => {
            const isSelected = selectedMonth === m.index;
            const isCurrent = m.index === currentMonth && selectedYear === currentYear;
            const stats = monthActivityMap.get(m.index);
            const hasActivity = stats && stats.count > 0;

            return (
              <button
                key={m.index}
                ref={isCurrent ? currentMonthRef : null}
                type="button"
                onClick={() => setSelectedMonth(m.index)}
                className={`flex-1 min-w-[70px] sm:min-w-[78px] py-2 px-1.5 rounded-xl text-center transition cursor-pointer relative flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40 font-bold'
                    : isCurrent
                    ? 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 font-semibold'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/70'
                }`}
              >
                {/* Badge Mês Atual */}
                {isCurrent && (
                  <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-full mb-0.5 ${
                    isSelected ? 'bg-emerald-400 text-slate-950 font-bold' : 'bg-emerald-600 text-white'
                  }`}>
                    Atual
                  </span>
                )}

                <span className={`text-xs sm:text-sm ${isSelected ? 'font-bold' : 'font-medium'}`}>
                  {m.short}
                </span>

                <span className={`text-[10px] mt-0.5 ${
                  isSelected 
                    ? 'text-blue-100 font-medium' 
                    : hasActivity 
                    ? 'text-slate-400' 
                    : 'text-slate-300'
                }`}>
                  {hasActivity ? `${stats?.count} mov.` : '—'}
                </span>
              </button>
            );
          })}

          {/* Opção Ano Completo */}
          <button
            type="button"
            onClick={() => setSelectedMonth('all')}
            className={`min-w-[76px] py-2 px-2.5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
              selectedMonth === 'all'
                ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40 font-bold'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/70 font-medium'
            }`}
          >
            <span className="text-xs sm:text-sm">Ano Todo</span>
            <span className={`text-[10px] mt-0.5 ${selectedMonth === 'all' ? 'text-blue-100' : 'text-slate-400'}`}>
              {selectedYear}
            </span>
          </button>
        </div>
      </div>

      {/* Date-time and Period selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* KPI 1: Income total */}
        <div className="bg-white dark:bg-[#0b1f3c] p-5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs flex justify-between items-center transition-all">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-300 font-bold uppercase tracking-wider block">Receitas Conciliadas</span>
              {isCurrentMonthView && (
                <span className="text-[9px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold rounded-md border border-emerald-200 dark:border-emerald-700/50">
                  Mês Atual
                </span>
              )}
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-display mt-0.5">{formatCurrency(totalReceitas)}</p>
            <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">{currentPeriodLabel}</span>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700/40">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Expenses total */}
        <div className="bg-white dark:bg-[#0b1f3c] p-5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs flex justify-between items-center transition-all">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-300 font-bold uppercase tracking-wider block">Despesas Pagas</span>
              {isCurrentMonthView && (
                <span className="text-[9px] px-2 py-0.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold rounded-md border border-rose-200 dark:border-rose-700/50">
                  Mês Atual
                </span>
              )}
            </div>
            <p className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 font-display mt-0.5">{formatCurrency(totalDespesas)}</p>
            <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">{currentPeriodLabel}</span>
          </div>
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-300 border border-rose-200/60 dark:border-rose-700/40">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Saldo de Caixa */}
        <div className="bg-white dark:bg-[#0b1f3c] p-5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs flex justify-between items-center transition-all">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-300 font-bold uppercase tracking-wider block">Resultado do Período</span>
              {isCurrentMonthView && (
                <span className="text-[9px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 font-bold rounded-md border border-blue-200 dark:border-blue-700/50">
                  Mês Atual
                </span>
              )}
            </div>
            <p className={`text-2xl sm:text-3xl font-black font-display mt-0.5 ${netBalance >= 0 ? 'text-blue-600 dark:text-blue-300' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatCurrency(netBalance)}
            </p>
            <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">{currentPeriodLabel}</span>
          </div>
          <div className={`p-3 rounded-xl border ${netBalance >= 0 ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border-blue-200/60 dark:border-blue-700/40' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 border-rose-200/60 dark:border-rose-700/40'}`}>
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Gráficos Interativos Financeiros: Fluxo de Caixa, Despesas e Formas de Pagamento */}
      <FinanceiroGraficos
        db={db}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        selectedMonth={typeof selectedMonth === 'number' ? selectedMonth : currentMonth}
        setSelectedMonth={setSelectedMonth}
      />

      {/* Transaction Table and filters */}
      <div className="space-y-4">
        {/* Filter Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row gap-3">
          
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, OS, descrição ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-100 rounded-xl focus:outline-none"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm bg-slate-50 border border-slate-100 rounded-xl appearance-none focus:outline-none cursor-pointer"
          >
            <option value="">Todas Transações</option>
            <option value="receita">Apenas Receitas</option>
            <option value="despesa">Apenas Despesas</option>
          </select>
        </div>

        {/* Ledger Context Sub-header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span>Listando lançamentos de:</span>
            <strong className="text-slate-800 font-semibold">{currentPeriodLabel}</strong>
            {isCurrentMonthView && (
              <span className="text-[10px] px-2 py-0.2 bg-emerald-50 text-emerald-700 font-bold rounded-full border border-emerald-200">
                Mês Corrente
              </span>
            )}
          </div>
          <span>
            {filteredTransactions.length} {filteredTransactions.length === 1 ? 'registro' : 'registros encontrados'}
          </span>
        </div>

        {/* Dynamic Ledger table listing */}
        {filteredTransactions.length > 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-100 font-display">
                  <tr>
                    <th className="px-6 py-3.5">Data</th>
                    <th className="px-6 py-3.5">Cliente</th>
                    <th className="px-6 py-3.5">Descrição / OS</th>
                    <th className="px-6 py-3.5">Categoria</th>
                    <th className="px-6 py-3.5">Forma Pagamento</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Valor</th>
                    <th className="px-6 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedTransactions.map(tx => {
                    const details = getTransactionDetails(tx);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 transition text-slate-600">
                          <td className="px-6 py-4 font-mono text-xs whitespace-nowrap">{formatDate(tx.data)}</td>
                          <td className="px-6 py-4">
                            {details.clientName ? (
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100 shadow-2xs">
                                  {details.clientName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 text-sm truncate max-w-[200px]" title={details.clientName}>
                                    {details.clientName}
                                  </p>
                                  {details.osNumber ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-700 font-medium">
                                      <FileText className="w-3 h-3 text-blue-600" />
                                      {details.osNumber}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">Cliente vinculado</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Despesa / Geral</span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              {tx.tipo === 'receita' ? (
                                <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <span className="p-1.5 bg-red-50 text-red-600 rounded-lg shrink-0">
                                  <ArrowDownRight className="w-3.5 h-3.5" />
                                </span>
                              )}
                              <div>
                                <p className="font-semibold leading-tight text-slate-800">{tx.descricao}</p>
                                {details.osNumber ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-700 bg-blue-50/80 border border-blue-200/50 px-1.5 py-0.5 rounded mt-0.5 font-medium">
                                    OS: {details.osNumber}
                                  </span>
                                ) : tx.os_id ? (
                                  <p className="text-[9px] text-slate-400 mt-0.5">Lançado via O.S.</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold">{tx.categoria}</td>
                          <td className="px-6 py-4 text-xs">{tx.metodo_pagamento}</td>
                          <td className="px-6 py-4">
                            <StatusBadge type="transaction_status" status={tx.status} />
                          </td>
                          <td className={`px-6 py-4 text-right font-bold text-xs whitespace-nowrap ${tx.tipo === 'receita' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {tx.tipo === 'receita' ? '+' : '-'}{formatCurrency(tx.valor)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEditOpen(tx)}
                                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                title="Editar lançamento"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setTxToDelete(tx)}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                title="Excluir lançamento"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/50">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>

                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 mr-2">
                    Exibindo <strong>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                    <strong>{Math.min(currentPage * pageSize, sortedFilteredTransactions.length)}</strong> de{' '}
                    <strong>{sortedFilteredTransactions.length}</strong> lançamentos
                  </span>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                    let pageNum = idx + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = Math.min(totalPages - 4, currentPage - 2) + idx;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition cursor-pointer ${
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<Calendar className="w-10 h-10 text-slate-400" />}
            title={`Nenhuma movimentação em ${currentPeriodLabel}`}
            description={
              searchTerm || typeFilter
                ? "Nenhuma transação atende aos critérios do filtro ou busca para este período."
                : `Não há movimentações financeiras registradas para ${currentPeriodLabel}. Você pode registrar uma nova receita ou despesa nos botões acima.`
            }
            actionText={!isCurrentMonthView ? `Voltar para o Mês Atual (${MONTHS_LIST[currentMonth].full})` : undefined}
            onAction={!isCurrentMonthView ? handleResetToCurrentMonth : undefined}
          />
        )}
      </div>

      {/* CRUD Modal Add / Edit Transaction */}
      <Modal
        isOpen={isCrudOpen}
        onClose={() => setIsCrudOpen(false)}
        title={editingTransaction ? "Editar Lançamento" : "Novo Lançamento Financeiro"}
      >
        <form onSubmit={handleSaveTransaction} className="space-y-4">
          
          {/* Tipo Selector */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => handleFormTypeChange('receita')}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                formData.tipo === 'receita'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Receita / Entrada
            </button>
            <button
              type="button"
              onClick={() => handleFormTypeChange('despesa')}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                formData.tipo === 'despesa'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Despesa / Saída
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Cliente Vinculado (Opcional) */}
            {formData.tipo === 'receita' && (
              <div className="sm:col-span-2 relative">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Cliente Vinculado (Opcional)</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Digite para buscar cliente..."
                    value={formClientSearch}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    onChange={(e) => {
                      setFormClientSearch(e.target.value);
                      setIsClientDropdownOpen(true);
                    }}
                    className="w-full pl-3.5 pr-8 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  {(formClientSearch || formData.client_id) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormClientSearch('');
                        setFormData({ ...formData, client_id: '', client_name: '' });
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer text-xs"
                      title="Limpar seleção"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {isClientDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    <div 
                      onClick={() => {
                        setFormData({ ...formData, client_id: '', client_name: '' });
                        setFormClientSearch('');
                        setIsClientDropdownOpen(false);
                      }}
                      className="p-2 hover:bg-slate-50 text-xs text-slate-500 cursor-pointer font-medium"
                    >
                      Nenhum / Não vinculado
                    </div>
                    {filteredClientOptions.map(c => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            client_id: c.id,
                            client_name: c.nome,
                          });
                          setFormClientSearch(c.nome);
                          setIsClientDropdownOpen(false);
                        }}
                        className="p-2 hover:bg-blue-50 transition cursor-pointer flex items-center justify-between text-xs"
                      >
                        <span className="font-bold text-slate-800">{c.nome}</span>
                        <span className="text-[11px] text-slate-500 font-mono">{formatPhone(c.telefone)}</span>
                      </div>
                    ))}
                    {filteredClientOptions.length === 0 && (
                      <div className="p-3 text-xs text-slate-400 text-center">Nenhum cliente encontrado</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Descrição do Lançamento *</label>
              <input
                type="text"
                required
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder={formData.tipo === 'receita' ? 'Ex: Higienização Sofá à Vista' : 'Ex: Compra de Escovas e Pulverizadores'}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Categoria</label>
              <select
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl cursor-pointer"
              >
                {categoriesByTipo[formData.tipo].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Valor */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Valor do Lançamento (R$) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.valor}
                onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                placeholder="Ex: 150.00"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
              />
            </div>

            {/* Data */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Data Competência *</label>
              <input
                type="date"
                required
                value={formData.data}
                onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
              />
            </div>

            {/* Método pagamento */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Forma de Pagamento</label>
              <select
                value={formData.metodo_pagamento}
                onChange={(e) => setFormData({ ...formData, metodo_pagamento: e.target.value as PaymentMethod })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl cursor-pointer"
              >
                {PAYMENT_METHODS.map(method => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>

            {/* Status (Pago/Pendente) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Status de Conciliação de Caixa</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as TransactionStatus })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl cursor-pointer"
              >
                <option value="pago">Quitado / Liquidado (Pago)</option>
                <option value="pendente">Aguardando Liquidação (Pendente)</option>
              </select>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
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
              Confirmar Lançamento
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={txToDelete !== null}
        onClose={() => setTxToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Apagar Lançamento Financeiro"
        description={`Tem certeza absoluta que deseja excluir o lançamento "${txToDelete?.descricao}" do caixa? Essa alteração afetará diretamente as métricas de receita, despesa e saldo consolidados do mês.`}
      />

      {/* Import Spreadsheet Modal (CSV, Excel Pasta1.csv) */}
      <ImportarPlanilhaModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        db={db}
        onUpdateDb={onUpdateDb}
        onSuccessNavigate={(year, month) => {
          setSelectedYear(year);
          setSelectedMonth(month);
        }}
      />
    </div>
  );
});
