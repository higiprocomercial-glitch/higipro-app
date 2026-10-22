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
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Send, 
  TrendingUp, 
  Target, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  BarChart2
} from 'lucide-react';
import { DatabaseState, Quote } from '../types';
import { formatCurrency, parseDateComponents, monthName } from '../lib/utils';

interface OrcamentosGraficosProps {
  db: DatabaseState;
  selectedMonth?: number | 'all';
  selectedYear?: number | 'all';
  onMonthChange?: (m: number | 'all') => void;
  onYearChange?: (y: number | 'all') => void;
  availableYears?: number[];
}

const ORIGIN_COLORS = ['#1e40af', '#0284c7', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#64748b'];

export const OrcamentosGraficos = React.memo<OrcamentosGraficosProps>(({ 
  db,
  selectedMonth,
  selectedYear,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [chartMode, setChartMode] = useState<'funil' | 'origens'>('funil');

  const now = useMemo(() => new Date(), []);
  const currentMonthNum = now.getMonth();
  const currentYearNum = now.getFullYear();

  const isCurrentMonthView = selectedMonth === currentMonthNum && (selectedYear === currentYearNum || selectedYear === 'all');

  const periodLabel = useMemo(() => {
    if (selectedYear === undefined || selectedYear === 'all') {
      if (selectedMonth === undefined || selectedMonth === 'all') return 'Todos os Períodos';
      return `${monthName(selectedMonth)} (Todos os Anos)`;
    }
    if (selectedMonth === undefined || selectedMonth === 'all') return `Ano ${selectedYear}`;
    return `${monthName(selectedMonth)} de ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  // Filtered quotes based on selectedMonth and selectedYear
  const quotes = useMemo(() => {
    return (db.quotes || []).filter(q => {
      if (!q) return false;
      const dateStr = q.created_at || q.enviado_em;
      if (!dateStr) return selectedMonth === 'all' && (selectedYear === 'all' || selectedYear === undefined);
      const { year, month } = parseDateComponents(dateStr);
      if (selectedYear !== undefined && selectedYear !== 'all' && year !== selectedYear) return false;
      if (selectedMonth !== undefined && selectedMonth !== 'all' && month !== selectedMonth) return false;
      return true;
    });
  }, [db.quotes, selectedMonth, selectedYear]);

  // Metrics computation
  const metrics = useMemo(() => {
    let totalVal = 0;
    let approvedVal = 0;
    let pendingVal = 0;
    let rejectedVal = 0;

    const counts = {
      rascunho: 0,
      enviado: 0,
      aprovado: 0,
      recusado: 0,
      expirado: 0,
    };

    const originMap: Record<string, { count: number; totalValue: number; approvedValue: number }> = {};

    quotes.forEach(q => {
      const val = q.total || 0;
      totalVal += val;

      if (q.status === 'aprovado') {
        approvedVal += val;
        counts.aprovado += 1;
      } else if (q.status === 'recusado') {
        rejectedVal += val;
        counts.recusado += 1;
      } else if (q.status === 'enviado') {
        pendingVal += val;
        counts.enviado += 1;
      } else if (q.status === 'expirado') {
        counts.expirado += 1;
      } else {
        counts.rascunho += 1;
      }

      // Origin
      const client = db.clients.find(c => c.id === q.client_id);
      const rawOrig = q.origem || client?.origem || 'Google';
      const orig = (rawOrig === 'Facebook' || rawOrig === 'Instagram' || rawOrig === 'Meta' || rawOrig === 'Meta Ads')
        ? 'Meta Ads'
        : (rawOrig === 'WhatsApp' ? 'Google' : rawOrig);
      if (!originMap[orig]) {
        originMap[orig] = { count: 0, totalValue: 0, approvedValue: 0 };
      }
      originMap[orig].count += 1;
      originMap[orig].totalValue += val;
      if (q.status === 'aprovado') {
        originMap[orig].approvedValue += val;
      }
    });

    const totalDecided = counts.aprovado + counts.recusado;
    const conversionRate = totalDecided > 0 
      ? Math.round((counts.aprovado / totalDecided) * 100) 
      : quotes.length > 0 
        ? Math.round((counts.aprovado / quotes.length) * 100) 
        : 0;

    const funnelData = [
      { name: 'Rascunhos', count: counts.rascunho, color: '#94a3b8' },
      { name: 'Enviados', count: counts.enviado, color: '#0284c7' },
      { name: 'Aprovados', count: counts.aprovado, color: '#10b981' },
      { name: 'Recusados', count: counts.recusado, color: '#f43f5e' },
    ];

    const originData = Object.entries(originMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        totalValue: data.totalValue,
        approvedValue: data.approvedValue,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    return {
      totalCount: quotes.length,
      totalVal,
      approvedVal,
      pendingVal,
      rejectedVal,
      conversionRate,
      counts,
      funnelData,
      originData,
    };
  }, [quotes]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden transition-all">
      {/* Header bar */}
      <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-800 font-display text-base sm:text-lg">
                Performance Comercial & Conversão de Orçamentos
              </h3>
              {isCurrentMonthView ? (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                  Mês Atual ({periodLabel})
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                  {periodLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Métricas de fechamento, funil de propostas e canais ({periodLabel})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isExpanded && (
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setChartMode('funil')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  chartMode === 'funil' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Funil de Status
              </button>
              <button
                type="button"
                onClick={() => setChartMode('origens')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  chartMode === 'origens' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Canais de Origem
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition cursor-pointer"
            title={isExpanded ? 'Recolher gráficos' : 'Expandir gráficos'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-5 sm:p-6 space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Conversion Rate */}
            <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-100">
              <div className="flex items-center justify-between text-emerald-700 mb-1">
                <span className="text-[11px] font-semibold">Taxa de Conversão</span>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-emerald-800 font-display">
                {metrics.conversionRate}%
              </p>
              <p className="text-[10px] text-emerald-600 mt-1">
                {metrics.counts.aprovado} aprovados de {metrics.totalCount} cotações
              </p>
            </div>

            {/* Approved Value */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Faturamento Aprovado</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <p className="text-base sm:text-xl font-bold text-slate-800 font-display">
                {formatCurrency(metrics.approvedVal)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Convertidos em faturamento</p>
            </div>

            {/* In Negotiation */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Em Negociação</span>
                <Clock className="w-3.5 h-3.5 text-sky-500" />
              </div>
              <p className="text-base sm:text-xl font-bold text-slate-800 font-display">
                {formatCurrency(metrics.pendingVal)}
              </p>
              <p className="text-[10px] text-sky-600 mt-1">
                {metrics.counts.enviado} {metrics.counts.enviado === 1 ? 'proposta enviada' : 'propostas enviadas'}
              </p>
            </div>

            {/* Pipeline Total */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Volume Total Cotado</span>
                <BarChart2 className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <p className="text-base sm:text-xl font-bold text-slate-800 font-display">
                {formatCurrency(metrics.totalVal)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Ticket médio: {metrics.totalCount > 0 ? formatCurrency(Math.round(metrics.totalVal / metrics.totalCount)) : 'R$ 0'}
              </p>
            </div>
          </div>

          {/* Chart Section */}
          {chartMode === 'funil' ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Quantidade de Orçamentos por Etapa</span>
                <span>Total de {metrics.totalCount} propostas</span>
              </div>

              <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                    <Tooltip 
                      formatter={(val: number) => [`${val} propostas`, 'Quantidade']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                      {metrics.funnelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Faturamento por Canal de Origem dos Orçamentos</span>
                <span>Canais mais lucrativos</span>
              </div>

              <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.originData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(val: number) => [formatCurrency(val), 'Valor Total']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="totalValue" fill="#1e40af" radius={[6, 6, 0, 0]} maxBarSize={40}>
                      {metrics.originData.map((_, index) => (
                        <Cell key={`orig-${index}`} fill={ORIGIN_COLORS[index % ORIGIN_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
