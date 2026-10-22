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
  Award, 
  Clock, 
  Layers, 
  DollarSign, 
  PieChart as PieIcon, 
  ChevronDown, 
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { DatabaseState } from '../types';
import { formatCurrency } from '../lib/utils';

interface CatalogoGraficosProps {
  db: DatabaseState;
}

const CATEGORY_COLORS = ['#1e40af', '#0284c7', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#64748b', '#ef4444'];

export const CatalogoGraficos: React.FC<CatalogoGraficosProps> = ({ db }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'ranking' | 'estofados'>('ranking');

  // Compute analytics based on service orders, quotes, and catalog services
  const analytics = useMemo(() => {
    const serviceDemandMap: Record<string, { name: string; count: number; revenue: number; category: string }> = {};
    const sofaTypeMap: Record<string, { count: number; revenue: number }> = {};
    const categoryMap: Record<string, { count: number; revenue: number }> = {};

    // 1. Analyze Service Orders (executed demand)
    (db.serviceOrders || []).forEach(order => {
      if (order.status === 'cancelado') return;

      (order.items || []).forEach(item => {
        const name = item.servico_nome || 'Serviço Personalizado';
        const total = item.subtotal || item.preco || 0;
        const qty = item.quantidade || 1;

        if (!serviceDemandMap[name]) {
          // find in services
          const foundSvc = db.services.find(s => s.id === item.servico_id || s.nome === name);
          serviceDemandMap[name] = {
            name,
            count: 0,
            revenue: 0,
            category: foundSvc?.categoria || 'Higienização',
          };
        }
        serviceDemandMap[name].count += qty;
        serviceDemandMap[name].revenue += total;
      });
    });

    // 2. Fallback: if no service order items, aggregate from Quotes
    if (Object.keys(serviceDemandMap).length === 0) {
      (db.quotes || []).forEach(quote => {
        if (quote.status === 'recusado') return;
        const items = quote.itens || (db.quoteItems || []).filter(qi => qi.quote_id === quote.id);
        items.forEach((item: any) => {
          const name = item.descricao || item.servico_nome || 'Serviço';
          const total = item.subtotal || item.preco || item.preco_unit || 0;
          const qty = item.qtd || item.quantidade || 1;

          if (!serviceDemandMap[name]) {
            const foundSvc = db.services.find(s => s.id === (item.service_id || item.servico_id) || s.nome === name);
            serviceDemandMap[name] = {
              name,
              count: 0,
              revenue: 0,
              category: foundSvc?.categoria || 'Higienização',
            };
          }
          serviceDemandMap[name].count += qty;
          serviceDemandMap[name].revenue += total;
        });
      });
    }

    // 3. Fallback: if still empty, aggregate catalog base pricing
    if (Object.keys(serviceDemandMap).length === 0) {
      db.services.forEach(s => {
        serviceDemandMap[s.nome] = {
          name: s.nome,
          count: 1,
          revenue: s.preco,
          category: s.categoria,
        };
      });
    }

    // Process categories and upholstery types from services
    db.services.forEach(s => {
      const cat = s.categoria || 'Higienização';
      const sofa = s.tipo_estofado || 'Outros';

      if (!categoryMap[cat]) categoryMap[cat] = { count: 0, revenue: 0 };
      categoryMap[cat].count += 1;
      categoryMap[cat].revenue += s.preco;

      if (!sofaTypeMap[sofa]) sofaTypeMap[sofa] = { count: 0, revenue: 0 };
      sofaTypeMap[sofa].count += 1;
      sofaTypeMap[sofa].revenue += s.preco;
    });

    const ranking = Object.values(serviceDemandMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 7);

    const totalCatalogServices = db.services.length;
    const avgPrice = totalCatalogServices > 0 
      ? Math.round(db.services.reduce((acc, s) => acc + s.preco, 0) / totalCatalogServices) 
      : 0;

    const upholsteryData = Object.entries(sofaTypeMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.count - a.count);

    const categoryData = Object.entries(categoryMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      ranking,
      upholsteryData,
      categoryData,
      totalCatalogServices,
      avgPrice,
      topService: ranking[0] || null,
    };
  }, [db.serviceOrders, db.quotes, db.services]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden transition-all">
      {/* Header bar */}
      <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 font-display text-base sm:text-lg flex items-center gap-2">
              Inteligência do Catálogo & Demanda de Serviços
            </h3>
            <p className="text-xs text-slate-400">
              Ranking dos serviços mais vendidos, ticket médio e mix de tipos de estofados
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isExpanded && (
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('ranking')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === 'ranking' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Top Serviços
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('estofados')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === 'estofados' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Mix por Estofado
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
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Total no Catálogo</span>
                <Layers className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-800 font-display">
                {analytics.totalCatalogServices} opções
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Serviços e metragens cadastrados</p>
            </div>

            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Preço Médio Catálogo</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-800 font-display">
                {formatCurrency(analytics.avgPrice)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Média por item/unidade</p>
            </div>

            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 col-span-2">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-semibold">Carro-Chefe da Empresa</span>
                <Award className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <p className="text-base sm:text-lg font-bold text-blue-800 truncate font-display">
                {analytics.topService ? analytics.topService.name : 'Higienização de Sofá'}
              </p>
              <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                {analytics.topService ? `${analytics.topService.count} execuções registradas • ${formatCurrency(analytics.topService.revenue)} gerados` : 'Principal serviço'}
              </p>
            </div>
          </div>

          {/* Chart Display */}
          {activeTab === 'ranking' ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Ranking por Faturamento Gerado (Top Serviços)</span>
                <span>Receita estimada realizada</span>
              </div>

              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.ranking} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      tickLine={false} 
                      axisLine={false} 
                      width={160}
                      tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }} 
                    />
                    <Tooltip 
                      formatter={(val: number) => [formatCurrency(val), 'Faturamento Gerado']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="revenue" fill="#1e40af" radius={[0, 6, 6, 0]} maxBarSize={22}>
                      {analytics.ranking.map((_, index) => (
                        <Cell key={`rank-${index}`} fill={index === 0 ? '#059669' : '#1e40af'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Distribuição do Catálogo por Tipo de Estofado</span>
                <span>Proporção de itens por modelo</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="w-full h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.upholsteryData}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {analytics.upholsteryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(val: number) => [`${val} modelos`, 'Itens']}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2">
                  {analytics.upholsteryData.map((u, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} />
                        <span className="font-semibold text-slate-700">{u.name}</span>
                      </div>
                      <span className="font-bold text-slate-900">{u.count} opções</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
