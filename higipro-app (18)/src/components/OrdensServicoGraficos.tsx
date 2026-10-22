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
  Users, 
  Wrench, 
  DollarSign, 
  ChevronDown, 
  ChevronUp,
  Activity,
  Calendar
} from 'lucide-react';
import { DatabaseState, ServiceOrder } from '../types';
import { formatCurrency, parseDateComponents, monthName } from '../lib/utils';
import { isExcludedServiceOrder } from '../lib/database';

interface OrdensServicoGraficosProps {
  db: DatabaseState;
  selectedMonth?: number | 'all';
  selectedYear?: number | 'all';
  onMonthChange?: (m: number | 'all') => void;
  onYearChange?: (y: number | 'all') => void;
  availableYears?: number[];
}

const STATUS_COLORS = {
  agendado: '#0284c7',
  em_execucao: '#f59e0b',
  concluido: '#10b981',
  cancelado: '#f43f5e',
  orcamento: '#64748b',
};

const TECH_COLORS = ['#1e40af', '#0284c7', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981'];

export const OrdensServicoGraficos = React.memo<OrdensServicoGraficosProps>(({ 
  db,
  selectedMonth,
  selectedYear,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'status' | 'tecnicos' | 'semana'>('status');

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

  // Filtered orders based on selectedMonth and selectedYear
  const orders = useMemo(() => {
    return (db.serviceOrders || []).filter(o => {
      if (!o) return false;
      if (isExcludedServiceOrder(o)) return false;
      const osDate = o.data_agendada || o.data_conclusao || o.created_at;
      if (!osDate) return selectedMonth === 'all' && (selectedYear === 'all' || selectedYear === undefined);
      const { year, month } = parseDateComponents(osDate);
      if (selectedYear !== undefined && selectedYear !== 'all' && year !== selectedYear) return false;
      if (selectedMonth !== undefined && selectedMonth !== 'all' && month !== selectedMonth) return false;
      return true;
    });
  }, [db.serviceOrders, selectedMonth, selectedYear]);

  const analytics = useMemo(() => {
    let totalRevenue = 0;
    let concludedRevenue = 0;
    let concludedCount = 0;
    let inProgressCount = 0;
    let scheduledCount = 0;

    const statusCounts: Record<string, number> = {
      agendado: 0,
      em_execucao: 0,
      concluido: 0,
      cancelado: 0,
      orcamento: 0,
    };

    const techMap: Record<string, { name: string; count: number; revenue: number; concluded: number }> = {};
    const weekdayCounts = [
      { name: 'Seg', count: 0 },
      { name: 'Ter', count: 0 },
      { name: 'Qua', count: 0 },
      { name: 'Qui', count: 0 },
      { name: 'Sex', count: 0 },
      { name: 'Sáb', count: 0 },
      { name: 'Dom', count: 0 },
    ];

    orders.forEach(o => {
      const val = o.total || 0;
      totalRevenue += val;

      const st = (o.status || 'agendado') as keyof typeof statusCounts;
      if (statusCounts[st] !== undefined) {
        statusCounts[st] += 1;
      }

      if (o.status === 'concluido') {
        concludedRevenue += val;
        concludedCount += 1;
      } else if (o.status === 'em_execucao') {
        inProgressCount += 1;
      } else if (o.status === 'agendado') {
        scheduledCount += 1;
      }

      // Technician
      const tech = o.tecnico || 'Técnico Não Definido';
      if (!techMap[tech]) {
        techMap[tech] = { name: tech, count: 0, revenue: 0, concluded: 0 };
      }
      techMap[tech].count += 1;
      techMap[tech].revenue += val;
      if (o.status === 'concluido') {
        techMap[tech].concluded += 1;
      }

      // Weekday
      if (o.data_agendamento) {
        try {
          const d = new Date(o.data_agendamento + 'T12:00:00');
          if (!isNaN(d.getTime())) {
            const day = d.getDay(); // 0 is Sunday, 1 is Monday...
            const idx = day === 0 ? 6 : day - 1; // map so Monday is 0
            if (weekdayCounts[idx]) weekdayCounts[idx].count += 1;
          }
        } catch {
          // ignore parsing error
        }
      }
    });

    const statusChartData = [
      { name: 'Concluídas', count: statusCounts.concluido, color: '#10b981' },
      { name: 'Em Execução', count: statusCounts.em_execucao, color: '#f59e0b' },
      { name: 'Agendadas', count: statusCounts.agendado, color: '#0284c7' },
      { name: 'Canceladas', count: statusCounts.cancelado, color: '#f43f5e' },
    ];

    const techChartData = Object.values(techMap)
      .sort((a, b) => b.revenue - a.revenue);

    const completionRate = orders.length > 0 
      ? Math.round((concludedCount / orders.length) * 100) 
      : 0;

    const avgTicket = concludedCount > 0 
      ? Math.round(concludedRevenue / concludedCount) 
      : orders.length > 0 
        ? Math.round(totalRevenue / orders.length) 
        : 0;

    return {
      totalOrders: orders.length,
      totalRevenue,
      concludedRevenue,
      concludedCount,
      inProgressCount,
      scheduledCount,
      completionRate,
      avgTicket,
      statusChartData,
      techChartData,
      weekdayCounts,
    };
  }, [orders]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden transition-all">
      {/* Header bar */}
      <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-800 font-display text-base sm:text-lg">
                Painel de Desempenho Operacional (O.S.)
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
              Taxa de conclusão física, produtividade da equipe e dias de pico ({periodLabel})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isExpanded && (
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('status')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === 'status' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Status & Execução
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tecnicos')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === 'tecnicos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Produtividade Técnicos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('semana')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === 'semana' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Dias de Pico
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
          {/* KPI Mini Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total OS */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Total de Ordens</span>
                <Wrench className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-800 font-display">
                {analytics.totalOrders}
              </p>
              <p className="text-[10px] text-blue-600 mt-1 font-medium">
                {analytics.scheduledCount} agendadas • {analytics.inProgressCount} em rota
              </p>
            </div>

            {/* Concluded Revenue */}
            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-100">
              <div className="flex items-center justify-between text-emerald-700 mb-1">
                <span className="text-[11px] font-semibold">Faturamento Concluído</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <p className="text-base sm:text-xl font-black text-emerald-800 font-display">
                {formatCurrency(analytics.concludedRevenue)}
              </p>
              <p className="text-[10px] text-emerald-600 mt-1">
                {analytics.concludedCount} ordens finalizadas
              </p>
            </div>

            {/* Average Ticket */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Ticket Médio Operacional</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <p className="text-base sm:text-xl font-bold text-slate-800 font-display">
                {formatCurrency(analytics.avgTicket)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Média por atendimento</p>
            </div>

            {/* Completion Rate */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Taxa de Conclusão</span>
                <Clock className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-slate-800 font-display">
                {analytics.completionRate}%
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Eficácia operacional</p>
            </div>
          </div>

          {/* Chart Display */}
          {activeTab === 'status' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Volume de Ordens por Etapa de Execução</span>
                <span>Visão geral do pipeline de campo</span>
              </div>

              <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.statusChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                    <Tooltip 
                      formatter={(val: number) => [`${val} ordens`, 'Total']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
                      {analytics.statusChartData.map((entry, index) => (
                        <Cell key={`status-cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === 'tecnicos' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Faturamento Gerado por Técnico Responsável</span>
                <span>Classificado por receita executada</span>
              </div>

              {analytics.techChartData.length > 0 ? (
                <div className="w-full h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.techChartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} />
                      <Tooltip 
                        formatter={(val: number) => [formatCurrency(val), 'Faturamento']}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                      />
                      <Bar dataKey="revenue" fill="#1e40af" radius={[6, 6, 0, 0]} maxBarSize={36}>
                        {analytics.techChartData.map((_, index) => (
                          <Cell key={`tech-${index}`} fill={TECH_COLORS[index % TECH_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center p-8 bg-slate-50 rounded-xl text-xs text-slate-400">
                  Nenhum técnico atribuído às ordens de serviço ainda.
                </div>
              )}
            </div>
          )}

          {activeTab === 'semana' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Concentração de Atendimentos por Dia da Semana</span>
                <span>Auxilia na escala e planejamento das equipes</span>
              </div>

              <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.weekdayCounts} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip 
                      formatter={(val: number) => [`${val} agendamentos`, 'Volume']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#0284c7" radius={[6, 6, 0, 0]} maxBarSize={32} />
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
