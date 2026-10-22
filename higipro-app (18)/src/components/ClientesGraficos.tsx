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
  Users, 
  UserCheck, 
  Compass, 
  Share2, 
  ChevronDown, 
  ChevronUp, 
  Repeat,
  HeartHandshake
} from 'lucide-react';
import { DatabaseState, Client } from '../types';

interface ClientesGraficosProps {
  db: DatabaseState;
}

const ORIGIN_PALETTE = ['#1e40af', '#0284c7', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#64748b'];

export const ClientesGraficos = React.memo<ClientesGraficosProps>(({ db }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'origens' | 'bairros' | 'fidelidade'>('origens');

  const clients = db.clients || [];
  const orders = db.serviceOrders || [];

  const analytics = useMemo(() => {
    const originCounts: Record<string, number> = {
      Google: 0,
      Meta: 0,
      Indicação: 0,
      'Cliente da Base': 0,
      Outros: 0,
    };
    const neighborhoodCounts: Record<string, number> = {};
    const clientOrderCounts: Record<string, number> = {};

    // Count orders per client for loyalty metric
    orders.forEach(o => {
      if (o.client_id) {
        clientOrderCounts[o.client_id] = (clientOrderCounts[o.client_id] || 0) + 1;
      }
    });

    let withWhatsapp = 0;
    let recurrentClientsCount = 0;

    clients.forEach(c => {
      // Origin
      const rawOrig = (c.origem || 'Google').trim();
      let orig = 'Outros';
      if (rawOrig.includes('Google') || rawOrig.includes('WhatsApp')) orig = 'Google';
      else if (rawOrig.includes('Meta') || rawOrig.includes('Facebook') || rawOrig.includes('Instagram') || rawOrig.includes('Ads')) orig = 'Meta';
      else if (rawOrig.includes('Indica')) orig = 'Indicação';
      else if (rawOrig.includes('Base') || rawOrig.includes('Cliente')) orig = 'Cliente da Base';
      else orig = 'Outros';
      originCounts[orig] = (originCounts[orig] || 0) + 1;

      // Phone
      if (c.telefone && c.telefone.replace(/\D/g, '').length >= 10) {
        withWhatsapp += 1;
      }

      // Neighborhood / City
      const bairro = c.bairro ? c.bairro.trim() : (c.cidade ? c.cidade.trim() : 'Não informado');
      if (bairro && bairro !== 'Não informado') {
        neighborhoodCounts[bairro] = (neighborhoodCounts[bairro] || 0) + 1;
      }

      // Recurrence
      const numOrders = clientOrderCounts[c.id] || 0;
      if (numOrders > 1) {
        recurrentClientsCount += 1;
      }
    });

    const totalClients = clients.length;

    const originChartData = Object.entries(originCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalClients > 0 ? Math.round((count / totalClients) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const topOrigins = originChartData[0] || { name: 'Indicação', count: 0, percentage: 0 };

    const neighborhoodChartData = Object.entries(neighborhoodCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const loyaltyData = [
      { name: '1 Atendimento', count: Math.max(0, totalClients - recurrentClientsCount), color: '#94a3b8' },
      { name: 'Recorrentes (2+ Serviços)', count: recurrentClientsCount, color: '#10b981' },
    ];

    const recurrenceRate = totalClients > 0 
      ? Math.round((recurrentClientsCount / totalClients) * 100) 
      : 0;

    return {
      totalClients,
      withWhatsapp,
      recurrentClientsCount,
      recurrenceRate,
      topOrigins,
      originChartData,
      neighborhoodChartData,
      loyaltyData,
    };
  }, [clients, orders]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden transition-all">
      {/* Header bar */}
      <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 font-display text-base sm:text-lg flex items-center gap-2">
              Inteligência de Base de Clientes (CRM)
            </h3>
            <p className="text-xs text-slate-400">
              Canais de aquisição de novos clientes, concentração geográfica e taxa de retenção
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isExpanded && (
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('origens')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === 'origens' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Canais de Aquisição
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('bairros')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === 'bairros' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Top Bairros / Regiões
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('fidelidade')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === 'fidelidade' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Fidelização & Recompra
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
            {/* Total Clients */}
            <div className="bg-slate-50 dark:bg-[#07172e] p-3.5 rounded-xl border border-slate-200 dark:border-blue-900/50">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-300 mb-1">
                <span className="text-[11px] font-bold">Total de Clientes</span>
                <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-display">
                {analytics.totalClients} contatos
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-300 mt-1 font-medium">Base ativa cadastrada</p>
            </div>

            {/* Top Origin */}
            <div className="bg-slate-50 dark:bg-[#07172e] p-3.5 rounded-xl border border-slate-200 dark:border-blue-900/50">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-300 mb-1">
                <span className="text-[11px] font-bold">Principal Canal</span>
                <Share2 className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-white font-display truncate">
                {analytics.topOrigins.name}
              </p>
              <p className="text-[10px] text-sky-600 dark:text-sky-300 font-bold mt-1">
                {analytics.topOrigins.percentage}% ({analytics.topOrigins.count} clientes)
              </p>
            </div>

            {/* Loyalty / Recurrence Rate */}
            <div className="bg-emerald-50/80 dark:bg-emerald-950/50 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 mb-1">
                <span className="text-[11px] font-bold">Clientes Fidelizados</span>
                <Repeat className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 font-display">
                {analytics.recurrentClientsCount}
              </p>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold mt-1">
                {analytics.recurrenceRate}% retornou 2+ vezes
              </p>
            </div>

            {/* Contactability */}
            <div className="bg-slate-50 dark:bg-[#07172e] p-3.5 rounded-xl border border-slate-200 dark:border-blue-900/50">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-300 mb-1">
                <span className="text-[11px] font-bold">Com WhatsApp</span>
                <UserCheck className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-display">
                {analytics.withWhatsapp}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-300 mt-1 font-medium">
                Prontos para pós-venda
              </p>
            </div>
          </div>

          {/* Chart Display */}
          {activeTab === 'origens' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Distribuição por Canal de Chegada do Cliente</span>
                <span>Onde focar o investimento de captação</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="w-full h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.originChartData}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {analytics.originChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={ORIGIN_PALETTE[index % ORIGIN_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(val: number) => [`${val} clientes`, 'Origem']}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2">
                  {analytics.originChartData.map((o, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ORIGIN_PALETTE[idx % ORIGIN_PALETTE.length] }} />
                        <span className="font-semibold text-slate-700">{o.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-medium">{o.percentage}%</span>
                        <span className="font-bold text-slate-900">{o.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bairros' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Concentração Geográfica por Bairro / Região</span>
                <span>Bairros mais atendidos</span>
              </div>

              {analytics.neighborhoodChartData.length > 0 ? (
                <div className="w-full h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.neighborhoodChartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip 
                        formatter={(val: number) => [`${val} clientes`, 'Clientes']}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                      />
                      <Bar dataKey="count" fill="#1e40af" radius={[6, 6, 0, 0]} maxBarSize={38}>
                        {analytics.neighborhoodChartData.map((_, index) => (
                          <Cell key={`bairro-${index}`} fill={ORIGIN_PALETTE[index % ORIGIN_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center p-8 bg-slate-50 rounded-xl text-xs text-slate-400">
                  Preencha o campo Bairro no cadastro dos clientes para visualizar a distribuição geográfica.
                </div>
              )}
            </div>
          )}

          {activeTab === 'fidelidade' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Taxa de Fidelização e Recontratação</span>
                <span>Proporção de clientes com compras recorrentes</span>
              </div>

              <div className="w-full h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.loyaltyData} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                    <Tooltip 
                      formatter={(val: number) => [`${val} clientes`, 'Quantidade']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                      {analytics.loyaltyData.map((entry, index) => (
                        <Cell key={`loyalty-${index}`} fill={entry.color} />
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
