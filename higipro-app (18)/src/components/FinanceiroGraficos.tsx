/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  BarChart3, 
  PieChart as PieIcon, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight,
  Wallet,
  TrendingUp
} from 'lucide-react';
import { DatabaseState, Transaction } from '../types';
import { formatCurrency, monthName, parseDateComponents } from '../lib/utils';
import { HISTORICAL_BILLING_RECORDS } from '../lib/historicalBilling';

interface FinanceiroGraficosProps {
  db: DatabaseState;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;
}

const PIE_COLORS = ['#1e40af', '#0284c7', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#64748b', '#ef4444'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const FinanceiroGraficos = React.memo<FinanceiroGraficosProps>(({
  db,
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
}) => {
  const [activeTab, setActiveTab] = useState<'fluxo' | 'despesas' | 'pagamentos'>('fluxo');

  // Available years
  const availableYears = useMemo(() => {
    const years = new Set<number>([2023, 2024, 2025, 2026]);
    (db.transactions || []).forEach(t => {
      if (t.data) {
        const { year } = parseDateComponents(t.data);
        if (year && year >= 2020 && year <= 2035) years.add(year);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [db.transactions]);

  // 1. Monthly flow (Receitas vs Despesas) across 12 months of selectedYear
  const monthlyFlowData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i,
      name: MONTH_SHORT[i],
      fullName: monthName(i),
      receitas: 0,
      despesas: 0,
      saldo: 0,
    }));

    // Transactions from database
    (db.transactions || []).forEach(t => {
      if (!t.data || t.status === 'cancelado') return;
      const { year, month } = parseDateComponents(t.data);
      if (year === selectedYear && month >= 0 && month < 12) {
        if (t.tipo === 'receita') {
          months[month].receitas += t.valor;
        } else if (t.tipo === 'despesa') {
          months[month].despesas += t.valor;
        }
      }
    });

    // Fallback to historical billing if revenues are 0
    HISTORICAL_BILLING_RECORDS.forEach(h => {
      if (h.year === selectedYear) {
        const mIdx = parseInt(h.month, 10) - 1;
        if (mIdx >= 0 && mIdx < 12 && months[mIdx].receitas === 0) {
          months[mIdx].receitas = h.valor;
        }
      }
    });

    return months.map(m => ({
      ...m,
      saldo: m.receitas - m.despesas,
    }));
  }, [db.transactions, selectedYear]);

  // 2. Despesas por Categoria (Filtered by selectedMonth and selectedYear)
  const expenseCategoryData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};

    (db.transactions || []).forEach(t => {
      if (!t.data || t.tipo !== 'despesa' || t.status === 'cancelado') return;
      const { year, month } = parseDateComponents(t.data);
      if (year === selectedYear && month === selectedMonth) {
        const cat = t.categoria || 'Outras Despesas';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + t.valor;
      }
    });

    // If current month has 0 expenses, aggregate for the whole selected year for meaningful insights
    if (Object.keys(categoryTotals).length === 0) {
      (db.transactions || []).forEach(t => {
        if (!t.data || t.tipo !== 'despesa' || t.status === 'cancelado') return;
        const { year } = parseDateComponents(t.data);
        if (year === selectedYear) {
          const cat = t.categoria || 'Outras Despesas';
          categoryTotals[cat] = (categoryTotals[cat] || 0) + t.valor;
        }
      });
    }

    const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

    return Object.entries(categoryTotals)
      .map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [db.transactions, selectedYear, selectedMonth]);

  // 3. Formas de Pagamento (Receitas)
  const paymentMethodsData = useMemo(() => {
    const methodTotals: Record<string, { total: number; count: number }> = {};

    (db.transactions || []).forEach(t => {
      if (!t.data || t.tipo !== 'receita' || t.status === 'cancelado') return;
      const { year } = parseDateComponents(t.data);
      if (year === selectedYear) {
        const method = t.metodo_pagamento || 'Outros';
        if (!methodTotals[method]) {
          methodTotals[method] = { total: 0, count: 0 };
        }
        methodTotals[method].total += t.valor;
        methodTotals[method].count += 1;
      }
    });

    const totalOverall = Object.values(methodTotals).reduce((a, b) => a + b.total, 0);

    return Object.entries(methodTotals)
      .map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        percentage: totalOverall > 0 ? Math.round((data.total / totalOverall) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [db.transactions, selectedYear]);

  // Year stats
  const yearStats = useMemo(() => {
    const totalRec = monthlyFlowData.reduce((acc, m) => acc + m.receitas, 0);
    const totalDesp = monthlyFlowData.reduce((acc, m) => acc + m.despesas, 0);
    return {
      totalRec,
      totalDesp,
      saldo: totalRec - totalDesp,
    };
  }, [monthlyFlowData]);

  // Custom Flow Tooltip
  const FlowTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-xs text-white p-3 rounded-xl shadow-xl border border-slate-700/60 text-xs min-w-[190px]">
          <p className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 mb-1.5">
            {data.fullName} {selectedYear}
          </p>
          <div className="space-y-1">
            <div className="flex justify-between items-center text-emerald-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Receitas:
              </span>
              <span className="font-bold font-mono">{formatCurrency(data.receitas)}</span>
            </div>
            <div className="flex justify-between items-center text-rose-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-400" /> Despesas:
              </span>
              <span className="font-bold font-mono">{formatCurrency(data.despesas)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
              <span>Resultado líquido:</span>
              <span className={`font-bold font-mono ${data.saldo >= 0 ? 'text-blue-300' : 'text-rose-300'}`}>
                {formatCurrency(data.saldo)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-100 shadow-xs space-y-5">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 font-display text-base sm:text-lg">
                Visão Gráfica Financeira & Fluxo de Caixa
              </h3>
              <p className="text-xs text-slate-400">
                Comparativo de entradas vs. saídas, custos por categoria e meios de recebimento
              </p>
            </div>
          </div>
        </div>

        {/* Filters & View Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('fluxo')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'fluxo' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              <span>Receitas vs Despesas</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('despesas')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'despesas' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5 text-rose-500" />
              <span>Categorias de Custo</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pagamentos')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'pagamentos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-blue-500" />
              <span>Formas de Pagamento</span>
            </button>
          </div>

          {/* Year Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {availableYears.map(y => (
              <button
                key={y}
                type="button"
                onClick={() => setSelectedYear(y)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  selectedYear === y ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab 1: Fluxo de Caixa Mensal (Receitas vs Despesas) */}
      {activeTab === 'fluxo' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-3 h-3 rounded-xs bg-emerald-500" /> Receitas ({formatCurrency(yearStats.totalRec)})
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-3 h-3 rounded-xs bg-rose-400" /> Despesas ({formatCurrency(yearStats.totalDesp)})
              </span>
              <span className={`font-bold font-mono px-2 py-0.5 rounded-md ${
                yearStats.saldo >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
              }`}>
                Lucro Operacional: {formatCurrency(yearStats.saldo)}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 italic">Clique em uma coluna ou mês para filtrar os lançamentos</span>
          </div>

          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyFlowData}
                margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload[0]) {
                    const mIdx = e.activePayload[0].payload.monthIndex;
                    if (typeof mIdx === 'number') {
                      setSelectedMonth(mIdx);
                    }
                  }
                }}
                className="cursor-pointer"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tickLine={false} 
                  axisLine={{ stroke: '#e2e8f0' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                />
                <YAxis 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<FlowTooltip />} />
                <Bar 
                  dataKey="receitas" 
                  name="Receitas" 
                  fill="#10b981" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={28}
                />
                <Bar 
                  dataKey="despesas" 
                  name="Despesas" 
                  fill="#f43f5e" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab 2: Categorias de Custo (Donut Chart) */}
      {activeTab === 'despesas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">
              Distribuição dos gastos operacionais em {selectedYear}
            </p>
            <span className="text-xs text-slate-400">
              Total analisado: {formatCurrency(expenseCategoryData.reduce((acc, c) => acc + c.value, 0))}
            </span>
          </div>

          {expenseCategoryData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Donut Chart */}
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseCategoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {expenseCategoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: number) => [formatCurrency(val), 'Valor']} 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Breakdown List */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {expenseCategoryData.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-3 h-3 rounded-full shrink-0" 
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} 
                      />
                      <span className="font-semibold text-slate-700">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 font-medium">{cat.percentage}%</span>
                      <span className="font-bold text-slate-900 font-mono">{formatCurrency(cat.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center p-8 bg-slate-50 rounded-xl text-xs text-slate-400">
              Nenhuma despesa registrada para o período selecionado.
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Formas de Pagamento */}
      {activeTab === 'pagamentos' && (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-slate-600">
            Canais e formas de recebimento mais utilizados pelos clientes em {selectedYear}
          </p>

          {paymentMethodsData.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {paymentMethodsData.map((pm, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      {pm.name}
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                      {pm.percentage}%
                    </span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 font-display">
                    {formatCurrency(pm.value)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {pm.count} {pm.count === 1 ? 'recebimento' : 'recebimentos'}
                  </p>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full rounded-full" 
                      style={{ width: `${pm.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-8 bg-slate-50 rounded-xl text-xs text-slate-400">
              Nenhum recebimento registrado para o período selecionado.
            </div>
          )}
        </div>
      )}

    </div>
  );
});
