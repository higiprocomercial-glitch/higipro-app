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
  AreaChart, 
  Area,
  ReferenceLine,
  Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, BarChart3, LineChart, 
  Calendar, Award, DollarSign, ArrowUpRight, ArrowDownRight, ChevronRight
} from 'lucide-react';
import { DatabaseState } from '../types';
import { formatCurrency, parseDateComponents } from '../lib/utils';
import { HISTORICAL_BILLING_RECORDS } from '../lib/historicalBilling';

interface FaturamentoGraficoProps {
  db: DatabaseState;
  setPage?: (page: any) => void;
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_FULL_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const FaturamentoGrafico = React.memo<FaturamentoGraficoProps>(({ db, setPage }) => {
  const currentRealYear = new Date().getFullYear();
  const currentRealMonth = new Date().getMonth(); // 0-indexed

  // Available years from database transactions and historical dataset
  const availableYears = useMemo(() => {
    const years = new Set<number>([2022, 2023, 2024, 2025, 2026]);
    (db.transactions || []).forEach(t => {
      if (t.data) {
        const { year } = parseDateComponents(t.data);
        if (year && year >= 2020 && year <= 2035) years.add(year);
      }
    });
    return Array.from(years).sort((a, b) => b - a); // 2026, 2025, 2024...
  }, [db.transactions]);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return availableYears.includes(currentRealYear) ? currentRealYear : (availableYears[0] || 2026);
  });
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');
  const [showTable, setShowTable] = useState(false);

  // Compute monthly data for the selected year
  const monthlyData = useMemo(() => {
    // 1. Initialize 12 months structure
    const months = Array.from({ length: 12 }, (_, i) => {
      const monthNumStr = String(i + 1).padStart(2, '0');
      return {
        monthIndex: i,
        monthKey: monthNumStr,
        name: MONTH_LABELS[i],
        fullName: MONTH_FULL_NAMES[i],
        faturamento: 0,
        despesas: 0,
        lucro: 0,
        status: (selectedYear === currentRealYear && i === currentRealMonth) 
          ? 'em_andamento' 
          : (selectedYear > currentRealYear || (selectedYear === currentRealYear && i > currentRealMonth)) 
            ? 'futuro' 
            : 'concluido',
        temDados: false,
      };
    });

    // 2. Aggregate from db.transactions
    (db.transactions || []).forEach(t => {
      if (!t.data || t.status === 'cancelado') return;
      const { year, month } = parseDateComponents(t.data);
      if (year === selectedYear && month >= 0 && month < 12) {
        if (t.tipo === 'receita') {
          months[month].faturamento += t.valor;
          months[month].temDados = true;
        } else if (t.tipo === 'despesa') {
          months[month].despesas += t.valor;
        }
      }
    });

    // 3. Fallback to HISTORICAL_BILLING_RECORDS if no transactions exist for that month
    HISTORICAL_BILLING_RECORDS.forEach(h => {
      if (h.year === selectedYear) {
        const mIdx = parseInt(h.month, 10) - 1;
        if (mIdx >= 0 && mIdx < 12 && months[mIdx].faturamento === 0) {
          months[mIdx].faturamento = h.valor;
          months[mIdx].temDados = true;
          if (h.status) months[mIdx].status = h.status;
        }
      }
    });

    // 4. Calculate profits and growth
    return months.map((m, idx) => {
      const prevRevenue = idx > 0 ? months[idx - 1].faturamento : 0;
      const growth = (prevRevenue > 0 && m.faturamento > 0)
        ? Math.round(((m.faturamento - prevRevenue) / prevRevenue) * 100)
        : null;

      return {
        ...m,
        lucro: m.faturamento - m.despesas,
        growth,
      };
    });
  }, [db.transactions, selectedYear, currentRealYear, currentRealMonth]);

  // Compute stats for selected year
  const stats = useMemo(() => {
    const activeMonths = monthlyData.filter(m => m.faturamento > 0);
    const totalFaturamento = monthlyData.reduce((acc, m) => acc + m.faturamento, 0);
    const totalDespesas = monthlyData.reduce((acc, m) => acc + m.despesas, 0);
    const mediaMensal = activeMonths.length > 0 ? Math.round(totalFaturamento / activeMonths.length) : 0;

    let melhorMes = monthlyData[0];
    monthlyData.forEach(m => {
      if (m.faturamento > melhorMes.faturamento) {
        melhorMes = m;
      }
    });

    // Previous year total for comparison
    const prevYear = selectedYear - 1;
    let prevYearTotal = 0;
    (db.transactions || []).forEach(t => {
      if (!t.data || t.status === 'cancelado') return;
      const { year } = parseDateComponents(t.data);
      if (year === prevYear && t.tipo === 'receita') {
        prevYearTotal += t.valor;
      }
    });
    if (prevYearTotal === 0) {
      HISTORICAL_BILLING_RECORDS.forEach(h => {
        if (h.year === prevYear) prevYearTotal += h.valor;
      });
    }

    const yearGrowth = prevYearTotal > 0 
      ? Math.round(((totalFaturamento - prevYearTotal) / prevYearTotal) * 100)
      : null;

    return {
      totalFaturamento,
      totalDespesas,
      mediaMensal,
      melhorMes,
      activeMonthsCount: activeMonths.length,
      prevYearTotal,
      yearGrowth,
    };
  }, [monthlyData, selectedYear, db.transactions]);

  // Custom Chart Tooltip
  const renderCustomTooltip = useMemo(() => {
    return ({ active, payload }: any) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
          <div className="bg-slate-900/95 backdrop-blur-xs text-white p-3.5 rounded-xl shadow-xl border border-slate-700/60 text-xs min-w-[200px] z-50">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <span className="font-bold text-sm text-slate-100">{data.fullName} {selectedYear}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                data.status === 'em_andamento'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : data.faturamento > 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
              }`}>
                {data.status === 'em_andamento' ? 'Em andamento' : data.faturamento > 0 ? 'Fechado' : 'Sem dados'}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                  Faturamento:
                </span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  {formatCurrency(data.faturamento)}
                </span>
              </div>

              {data.despesas > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    Despesas:
                  </span>
                  <span className="font-semibold text-rose-400 font-mono">
                    {formatCurrency(data.despesas)}
                  </span>
                </div>
              )}

              {data.growth !== null && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
                  <span className="text-slate-400">Var. mês anterior:</span>
                  <span className={`font-semibold flex items-center ${
                    data.growth >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {data.growth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {data.growth > 0 ? `+${data.growth}%` : `${data.growth}%`}
                  </span>
                </div>
              )}

              {stats.mediaMensal > 0 && data.faturamento > 0 && (
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <span>Vs. média do ano:</span>
                  <span className={data.faturamento >= stats.mediaMensal ? 'text-blue-300' : 'text-slate-400'}>
                    {data.faturamento >= stats.mediaMensal ? 'Acima da média' : 'Abaixo da média'}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      }
      return null;
    };
  }, [selectedYear, stats.mediaMensal]);

  return (
    <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-100 shadow-xs space-y-6">
      
      {/* Top Bar: Title, Year Tabs, Chart Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 font-display text-lg">
                Faturamento Mês a Mês do Ano
              </h3>
              <p className="text-xs text-slate-400">
                Acompanhamento visual do faturamento mensal realizado e metas
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Year Selector & Chart Type Switch */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Year Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {availableYears.map(year => (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedYear === year
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {year}
              </button>
            ))}
          </div>

          {/* Chart Type Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                chartType === 'bar' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Visualização em Barras"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Barras</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                chartType === 'area' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Visualização em Área / Tendência"
            >
              <LineChart className="w-4 h-4" />
              <span className="hidden sm:inline">Área</span>
            </button>
          </div>

          {/* View Details Link */}
          {setPage && (
            <button
              type="button"
              onClick={() => setPage('metricas')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
            >
              DRE & Métricas <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Year */}
        <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Total {selectedYear}</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <p className="text-base sm:text-xl font-bold text-slate-800 font-display">
            {formatCurrency(stats.totalFaturamento)}
          </p>
          {stats.yearGrowth !== null && (
            <p className="text-[10px] flex items-center gap-0.5 mt-1 font-semibold">
              <span className={stats.yearGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {stats.yearGrowth >= 0 ? `+${stats.yearGrowth}%` : `${stats.yearGrowth}%`}
              </span>
              <span className="text-slate-400 font-normal">vs. {selectedYear - 1}</span>
            </p>
          )}
        </div>

        {/* Monthly Average */}
        <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Média Mensal</span>
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <p className="text-base sm:text-xl font-bold text-slate-800 font-display">
            {formatCurrency(stats.mediaMensal)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Calculado em {stats.activeMonthsCount} {stats.activeMonthsCount === 1 ? 'mês' : 'meses'}
          </p>
        </div>

        {/* Best Month */}
        <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Melhor Mês (Recorde)</span>
            <Award className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-base sm:text-xl font-bold text-slate-800 font-display">
            {stats.melhorMes.faturamento > 0 ? formatCurrency(stats.melhorMes.faturamento) : 'R$ 0,00'}
          </p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-1">
            {stats.melhorMes.faturamento > 0 ? `${stats.melhorMes.fullName} de ${selectedYear}` : 'Sem dados'}
          </p>
        </div>

        {/* Current / Active Status */}
        <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">
              {selectedYear === currentRealYear ? 'Mês Atual' : 'Fechamento'}
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <p className="text-base sm:text-xl font-bold text-slate-800 font-display">
            {selectedYear === currentRealYear
              ? formatCurrency(monthlyData[currentRealMonth]?.faturamento || 0)
              : `${stats.activeMonthsCount} meses fechados`}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {selectedYear === currentRealYear
              ? `${MONTH_FULL_NAMES[currentRealMonth]} (Em andamento)`
              : `Ano de ${selectedYear} consolidado`}
          </p>
        </div>
      </div>

      {/* Main Interactive Chart with Recharts */}
      <div className="w-full h-72 sm:h-80 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart
              data={monthlyData}
              margin={{ top: 15, right: 10, left: -10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="barGradientActive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e40af" stopOpacity={1} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.75} />
                </linearGradient>
                <linearGradient id="barGradientBest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={1} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="barGradientCurrent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={1} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                tickLine={false} 
                axisLine={{ stroke: '#e2e8f0' }}
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
              />
              <YAxis 
                tickLine={false} 
                axisLine={false}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip content={renderCustomTooltip} />
              {stats.mediaMensal > 0 && (
                <ReferenceLine 
                  y={stats.mediaMensal} 
                  stroke="#f59e0b" 
                  strokeDasharray="4 4" 
                  label={{ 
                    value: `Média: ${formatCurrency(stats.mediaMensal)}`, 
                    fill: '#b45309', 
                    fontSize: 10, 
                    position: 'insideTopRight' 
                  }} 
                />
              )}
              <Bar 
                dataKey="faturamento" 
                radius={[6, 6, 0, 0]} 
                maxBarSize={48}
              >
                {monthlyData.map((entry, index) => {
                  const isBest = entry.faturamento > 0 && entry.faturamento === stats.melhorMes.faturamento;
                  const isCurrent = selectedYear === currentRealYear && index === currentRealMonth;
                  return (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={
                        isCurrent 
                          ? 'url(#barGradientCurrent)' 
                          : isBest 
                            ? 'url(#barGradientBest)' 
                            : 'url(#barGradientActive)'
                      } 
                    />
                  );
                })}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart
              data={monthlyData}
              margin={{ top: 15, right: 10, left: -10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="colorFaturamento" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e40af" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#1e40af" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                tickLine={false} 
                axisLine={{ stroke: '#e2e8f0' }}
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
              />
              <YAxis 
                tickLine={false} 
                axisLine={false}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip content={renderCustomTooltip} />
              {stats.mediaMensal > 0 && (
                <ReferenceLine 
                  y={stats.mediaMensal} 
                  stroke="#f59e0b" 
                  strokeDasharray="4 4" 
                />
              )}
              <Area 
                type="monotone" 
                dataKey="faturamento" 
                stroke="#1e40af" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorFaturamento)" 
                activeDot={{ r: 6, stroke: '#1e40af', strokeWidth: 2, fill: '#ffffff' }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Chart Legend & Toggle Table */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-blue-600" />
            <span>Faturamento Mensal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-600" />
            <span>Recorde do Ano</span>
          </div>
          {selectedYear === currentRealYear && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-blue-600" />
              <span>Mês Atual (Em andamento)</span>
            </div>
          )}
          {stats.mediaMensal > 0 && (
            <div className="flex items-center gap-1.5 text-amber-700">
              <span className="w-3 h-0.5 bg-amber-500 border-dashed" />
              <span>Média Anual ({formatCurrency(stats.mediaMensal)})</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
        >
          {showTable ? 'Ocultar tabela mês a mês' : 'Ver tabela mês a mês detalhada'}
        </button>
      </div>

      {/* Optional Monthly Breakdown Grid Table */}
      {showTable && (
        <div className="pt-2 border-t border-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {monthlyData.map((m) => {
              const isBest = m.faturamento > 0 && m.faturamento === stats.melhorMes.faturamento;
              const isCurrent = selectedYear === currentRealYear && m.monthIndex === currentRealMonth;
              return (
                <div
                  key={m.monthKey}
                  className={`p-2.5 rounded-xl border text-xs transition ${
                    isCurrent
                      ? 'bg-blue-50/80 border-blue-200'
                      : isBest
                        ? 'bg-emerald-50/80 border-emerald-200'
                        : m.faturamento > 0
                          ? 'bg-slate-50 border-slate-200/80'
                          : 'bg-slate-50/40 border-slate-100 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-center text-[11px] mb-1">
                    <span className="font-bold text-slate-700">{m.fullName}</span>
                    {isBest && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                        Top
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                        Atual
                      </span>
                    )}
                  </div>
                  <p className="font-black text-slate-900 font-mono text-xs">
                    {m.faturamento > 0 ? formatCurrency(m.faturamento) : '—'}
                  </p>
                  {m.growth !== null && (
                    <p className={`text-[10px] font-semibold flex items-center mt-0.5 ${
                      m.growth >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {m.growth >= 0 ? <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" /> : <ArrowDownRight className="w-2.5 h-2.5 mr-0.5" />}
                      {m.growth > 0 ? `+${m.growth}%` : `${m.growth}%`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
});
