/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, Printer, TrendingUp, TrendingDown, DollarSign, 
  Users, ShoppingBag, Target, Calendar, Award, CheckCircle2, XCircle, 
  Clock, ArrowUpRight, ArrowDownRight, Layers, BarChart3, Download,
  Percent, ShieldCheck, Sparkles, Filter, ChevronRight
} from 'lucide-react';
import { DatabaseState, ServiceOrder, Transaction, Quote, Client } from '../types';
import { formatCurrency, formatDate, parseDateComponents, monthName } from '../lib/utils';
import { LogoHigiPro } from './HigiProLogo';

interface RelatoriosProps {
  db: DatabaseState;
}

type TabType = 'geral' | 'vendas' | 'marketing' | 'financeiro';

export const Relatorios = React.memo<RelatoriosProps>(({ db }) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const [activeTab, setActiveTab] = useState<TabType>('geral');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentMonth);

  // Available years list
  const years = useMemo(() => {
    const list = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    return [...new Set(list)].sort((a, b) => b - a);
  }, [currentYear]);

  // Filter items based on selected year & month
  const isDateInPeriod = (dateStr?: string) => {
    if (!dateStr) return false;
    const { year, month } = parseDateComponents(dateStr);
    if (year !== selectedYear) return false;
    if (selectedMonth !== 'all' && month !== selectedMonth) return false;
    return true;
  };

  const periodLabel = useMemo(() => {
    if (selectedMonth === 'all') {
      return `Ano Completo de ${selectedYear}`;
    }
    return `${monthName(selectedMonth)} de ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  // Filtered datasets
  const periodTransactions = useMemo(() => {
    return db.transactions.filter(t => isDateInPeriod(t.data));
  }, [db.transactions, selectedYear, selectedMonth]);

  const periodServiceOrders = useMemo(() => {
    return db.serviceOrders.filter(os => {
      const dateToTest = os.data_conclusao || os.data_agendada || os.created_at;
      return isDateInPeriod(dateToTest);
    });
  }, [db.serviceOrders, selectedYear, selectedMonth]);

  const periodQuotes = useMemo(() => {
    return db.quotes.filter(q => isDateInPeriod(q.created_at));
  }, [db.quotes, selectedYear, selectedMonth]);

  const periodClients = useMemo(() => {
    return db.clients.filter(c => isDateInPeriod(c.created_at));
  }, [db.clients, selectedYear, selectedMonth]);

  // =========================================================================
  // FINANCIAL CALCULATIONS
  // =========================================================================
  const receitaTotal = useMemo(() => {
    return periodTransactions
      .filter(t => t.tipo === 'receita' && t.status === 'pago')
      .reduce((acc, t) => acc + (t.valor || 0), 0);
  }, [periodTransactions]);

  const despesaTotal = useMemo(() => {
    return periodTransactions
      .filter(t => t.tipo === 'despesa')
      .reduce((acc, t) => acc + (t.valor || 0), 0);
  }, [periodTransactions]);

  const lucroLiquido = receitaTotal - despesaTotal;
  const margemLucro = receitaTotal > 0 ? (lucroLiquido / receitaTotal) * 100 : 0;

  const aReceberPendente = useMemo(() => {
    return periodTransactions
      .filter(t => t.tipo === 'receita' && t.status === 'pendente')
      .reduce((acc, t) => acc + (t.valor || 0), 0);
  }, [periodTransactions]);

  // Categories Breakdown
  const receitasPorCategoria = useMemo(() => {
    const map: { [cat: string]: number } = {};
    periodTransactions
      .filter(t => t.tipo === 'receita' && t.status === 'pago')
      .forEach(t => {
        const cat = t.categoria || 'Geral';
        map[cat] = (map[cat] || 0) + (t.valor || 0);
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodTransactions]);

  const despesasPorCategoria = useMemo(() => {
    const map: { [cat: string]: number } = {};
    periodTransactions
      .filter(t => t.tipo === 'despesa')
      .forEach(t => {
        const cat = t.categoria || 'Outras Despesas';
        map[cat] = (map[cat] || 0) + (t.valor || 0);
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodTransactions]);

  const receitasPorMetodo = useMemo(() => {
    const map: { [metodo: string]: { count: number; total: number } } = {};
    periodTransactions
      .filter(t => t.tipo === 'receita' && t.status === 'pago')
      .forEach(t => {
        const m = t.metodo_pagamento || 'Outros';
        if (!map[m]) map[m] = { count: 0, total: 0 };
        map[m].count += 1;
        map[m].total += t.valor || 0;
      });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [periodTransactions]);

  // =========================================================================
  // SALES / VENDAS CALCULATIONS
  // =========================================================================
  const osConcluidas = periodServiceOrders.filter(os => os.status === 'concluido');
  const osCanceladas = periodServiceOrders.filter(os => os.status === 'cancelado');
  const osEmExecucao = periodServiceOrders.filter(os => os.status === 'em_execucao' || os.status === 'agendado');

  const faturamentoOS = osConcluidas.reduce((acc, os) => acc + (os.total || 0), 0);
  const ticketMedio = osConcluidas.length > 0 ? faturamentoOS / osConcluidas.length : 0;

  const totalOrcamentos = periodQuotes.length;
  const orcamentosAprovados = periodQuotes.filter(q => q.status === 'aprovado').length;
  const orcamentosRecusados = periodQuotes.filter(q => q.status === 'recusado').length;
  const taxaAprovacaoOrcamentos = totalOrcamentos > 0 ? (orcamentosAprovados / totalOrcamentos) * 100 : 0;

  // Technician performance
  const performanceTecnicos = useMemo(() => {
    const map: { [tec: string]: { concluidas: number; totalFaturado: number } } = {};
    periodServiceOrders.forEach(os => {
      const tec = os.tecnico || 'Não Atribuído';
      if (!map[tec]) map[tec] = { concluidas: 0, totalFaturado: 0 };
      if (os.status === 'concluido') {
        map[tec].concluidas += 1;
        map[tec].totalFaturado += os.total || 0;
      }
    });
    return Object.entries(map).sort((a, b) => b[1].totalFaturado - a[1].totalFaturado);
  }, [periodServiceOrders]);

  // =========================================================================
  // MARKETING & CAC CALCULATIONS
  // =========================================================================
  const marketingCategories = ['Marketing', 'Anúncios', 'Tráfego', 'Publicidade', 'Google', 'Facebook', 'Meta', 'Google Ads', 'Meta Ads', 'Instagram Ads'];
  const totalMarketingInvestido = useMemo(() => {
    return periodTransactions
      .filter(t => t.tipo === 'despesa' && marketingCategories.some(cat => t.categoria.toLowerCase().includes(cat.toLowerCase())))
      .reduce((acc, t) => acc + (t.valor || 0), 0);
  }, [periodTransactions]);

  const totalNovosClientes = periodClients.length;
  const totalClientesAtendidos = new Set(osConcluidas.map(os => os.client_id)).size;

  const averageCostPerService = useMemo(() => {
    const activeProds = (db.products || []).filter(p => p.ativo !== false);
    if (activeProds.length === 0) return 0;
    return activeProds.reduce((sum, p) => sum + (p.custo_por_servico || 0), 0) / activeProds.length;
  }, [db.products]);

  const marketingCacUnitario = totalClientesAtendidos > 0 && totalMarketingInvestido > 0 
    ? totalMarketingInvestido / totalClientesAtendidos 
    : 0;

  // CAC Total sempre inclui o custo médio por serviço executado
  const cac = marketingCacUnitario + (averageCostPerService || 0);

  const roas = totalMarketingInvestido > 0 
    ? receitaTotal / totalMarketingInvestido 
    : 0;

  const roi = totalMarketingInvestido > 0 
    ? ((receitaTotal - totalMarketingInvestido) / totalMarketingInvestido) * 100 
    : 0;

  // Origens Breakdown
  const origensStats = useMemo(() => {
    const map: { [origem: string]: { cadastrados: number; atendidos: number; receita: number } } = {};
    
    // Count all clients in period
    periodClients.forEach(c => {
      const o = c.origem || 'Outros';
      if (!map[o]) map[o] = { cadastrados: 0, atendidos: 0, receita: 0 };
      map[o].cadastrados += 1;
    });

    // Match with service orders
    osConcluidas.forEach(os => {
      const client = db.clients.find(c => c.id === os.client_id);
      const o = client?.origem || 'Outros';
      if (!map[o]) map[o] = { cadastrados: 0, atendidos: 0, receita: 0 };
      map[o].atendidos += 1;
      map[o].receita += os.total || 0;
    });

    return Object.entries(map).sort((a, b) => b[1].receita - a[1].receita);
  }, [periodClients, osConcluidas, db.clients]);

  // =========================================================================
  // PRINT / EXPORT DOCUMENT HANDLER
  // =========================================================================
  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const company = db.companySettings;
    const companyName = company?.nome_fantasia || 'HigiPro — Gestão de Estofados';
    const companyCnpj = company?.cnpj_cpf || '48.912.345/0001-89';
    const companyTel = company?.telefone || '(54) 99123-4567';
    const companyEmail = company?.email || 'higiprocomercial@gmail.com';

    const tabTitle = activeTab === 'geral' ? 'Relatório Executivo Geral' 
      : activeTab === 'vendas' ? 'Relatório de Vendas e Performance'
      : activeTab === 'marketing' ? 'Relatório de Marketing, ROAS e Aquisição'
      : 'Relatório Financeiro e DRE';

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${companyName} — ${tabTitle} (${periodLabel})</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #fff; padding: 32px; max-width: 900px; margin: 0 auto; font-size: 13px; line-height: 1.5; }
          .header { border-bottom: 2px solid #1e40af; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .brand-title { font-size: 20px; font-weight: 800; color: #0f172a; }
          .brand-sub { font-size: 12px; color: #64748b; }
          .report-meta { text-align: right; font-size: 11px; color: #64748b; }
          .report-badge { display: inline-block; background: #f0fdfa; color: #1e40af; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 4px; border: 1px solid #dbeafe; }
          h2 { font-size: 15px; color: #0f172a; margin: 20px 0 10px 0; border-left: 4px solid #1e40af; padding-left: 8px; font-weight: 700; }
          .grid-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
          .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .kpi-label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          .kpi-value { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
          .kpi-sub { font-size: 11px; color: #1e40af; font-weight: 600; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          th { background: #f1f5f9; color: #334155; text-align: left; padding: 8px 10px; font-weight: 600; border-bottom: 1px solid #cbd5e1; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #334155; }
          .text-right { text-align: right; }
          .font-bold { font-weight: 700; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
          @media print {
            body { padding: 0; }
            @page { margin: 1.5cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand-title">${companyName}</div>
            <div class="brand-sub">${companyCnpj} • ${companyTel} • ${companyEmail}</div>
          </div>
          <div class="report-meta">
            <div class="report-badge">${tabTitle}</div>
            <div>Período: <strong>${periodLabel}</strong></div>
            <div>Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        <div class="grid-kpis">
          <div class="kpi-card">
            <div class="kpi-label">Receita Realizada</div>
            <div class="kpi-value">${formatCurrency(receitaTotal)}</div>
            <div class="kpi-sub">${osConcluidas.length} OS Concluídas</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Despesas Operacionais</div>
            <div class="kpi-value" style="color:#e11d48;">${formatCurrency(despesaTotal)}</div>
            <div class="kpi-sub" style="color:#64748b;">${periodTransactions.filter(t => t.tipo === 'despesa').length} lançamentos</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Lucro Líquido</div>
            <div class="kpi-value" style="color:${lucroLiquido >= 0 ? '#1e40af' : '#e11d48'};">${formatCurrency(lucroLiquido)}</div>
            <div class="kpi-sub">Margem: ${margemLucro.toFixed(1)}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Ticket Médio</div>
            <div class="kpi-value">${formatCurrency(ticketMedio)}</div>
            <div class="kpi-sub">Novos Clientes: ${totalNovosClientes}</div>
          </div>
        </div>

        <h2>Demonstrativo do Resultado do Exercício (DRE Gerencial)</h2>
        <table>
          <thead>
            <tr>
              <th>Rubrica / Descrição</th>
              <th class="text-right">Valor (R$)</th>
              <th class="text-right">% Receita</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-bold">(=) Faturamento Bruto / Receitas Recebidas</td>
              <td class="text-right font-bold" style="color:#1e40af;">${formatCurrency(receitaTotal)}</td>
              <td class="text-right">100.0%</td>
            </tr>
            <tr>
              <td>(-) Despesas Operacionais e Insumos</td>
              <td class="text-right" style="color:#e11d48;">${formatCurrency(despesaTotal)}</td>
              <td class="text-right">${receitaTotal > 0 ? ((despesaTotal / receitaTotal) * 100).toFixed(1) : 0}%</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td class="font-bold">(=) Resultado Líquido Operacional</td>
              <td class="text-right font-bold" style="color:${lucroLiquido >= 0 ? '#1e40af' : '#e11d48'};">${formatCurrency(lucroLiquido)}</td>
              <td class="text-right font-bold">${margemLucro.toFixed(1)}%</td>
            </tr>
            <tr>
              <td>(+) Valores a Receber (Em Aberto / Pendente)</td>
              <td class="text-right" style="color:#d97706;">${formatCurrency(aReceberPendente)}</td>
              <td class="text-right">—</td>
            </tr>
          </tbody>
        </table>

        <h2>Performance por Técnico e Equipe</h2>
        <table>
          <thead>
            <tr>
              <th>Técnico Responsável</th>
              <th class="text-right">OS Concluídas</th>
              <th class="text-right">Faturamento Total</th>
              <th class="text-right">Ticket Médio</th>
            </tr>
          </thead>
          <tbody>
            ${performanceTecnicos.map(([tec, data]) => `
              <tr>
                <td class="font-bold">${tec}</td>
                <td class="text-right">${data.concluidas}</td>
                <td class="text-right font-bold">${formatCurrency(data.totalFaturado)}</td>
                <td class="text-right">${formatCurrency(data.concluidas > 0 ? data.totalFaturado / data.concluidas : 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Origens de Clientes & Aquisição</h2>
        <table>
          <thead>
            <tr>
              <th>Canal de Entrada</th>
              <th class="text-right">Novos Cadastros</th>
              <th class="text-right">Atendimentos</th>
              <th class="text-right">Receita Gerada</th>
            </tr>
          </thead>
          <tbody>
            ${origensStats.map(([origem, data]) => `
              <tr>
                <td class="font-bold">${origem}</td>
                <td class="text-right">${data.cadastrados}</td>
                <td class="text-right">${data.atendidos}</td>
                <td class="text-right font-bold">${formatCurrency(data.receita)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>Documento gerado automaticamente pelo Sistema HigiPro • Software de Gestão de Estofados</div>
          <div>Página 1 de 1</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 350);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    const lines = [
      `\uFEFFRELATÓRIO HIGIPRO - ${periodLabel.toUpperCase()}`,
      `Gerado em:;${new Date().toLocaleString('pt-BR')}`,
      '',
      '=== INDICADORES GERAIS ===',
      `Receita Total;${receitaTotal.toFixed(2)}`,
      `Despesa Total;${despesaTotal.toFixed(2)}`,
      `Lucro Líquido;${lucroLiquido.toFixed(2)}`,
      `Margem de Lucro;${margemLucro.toFixed(1)}%`,
      `Ticket Médio;${ticketMedio.toFixed(2)}`,
      `OS Concluídas;${osConcluidas.length}`,
      `Novos Clientes;${totalNovosClientes}`,
      '',
      '=== PERFORMANCE POR TÉCNICO ===',
      'Técnico;OS Concluídas;Faturamento (R$);Ticket Médio (R$)',
      ...performanceTecnicos.map(([tec, data]) => 
        `"${tec}";${data.concluidas};${data.totalFaturado.toFixed(2)};${(data.concluidas > 0 ? data.totalFaturado / data.concluidas : 0).toFixed(2)}`
      ),
      '',
      '=== ORIGEM DOS CLIENTES ===',
      'Canal de Origem;Cadastros;Atendimentos;Receita Gerada (R$)',
      ...origensStats.map(([origem, data]) => 
        `"${origem}";${data.cadastrados};${data.atendidos};${data.receita.toFixed(2)}`
      )
    ];

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `higipro-relatorio-${selectedYear}-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Period Selectors */}
      <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 font-display">
              Relatórios Gerenciais & Executivos
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Análise aprofundada de vendas, marketing, lucratividade e equipe técnica.
          </p>
        </div>

        {/* Period Selectors & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer text-sm"
            >
              <option value="all">Ano Completo</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>{monthName(i)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer text-sm"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-semibold text-xs transition cursor-pointer shadow-2xs"
            title="Exportar Planilha Excel CSV"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Exportar</span> CSV
          </button>

          <button
            onClick={handlePrintReport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Relatório</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('geral')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'geral'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Visão Geral Executiva</span>
        </button>

        <button
          onClick={() => setActiveTab('vendas')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'vendas'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Vendas & Performance Técnica</span>
        </button>

        <button
          onClick={() => setActiveTab('marketing')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'marketing'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Marketing, ROAS & CAC</span>
        </button>

        <button
          onClick={() => setActiveTab('financeiro')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'financeiro'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>DRE & Categorias Financeiras</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: VISÃO GERAL EXECUTIVA                                          */}
      {/* ===================================================================== */}
      {activeTab === 'geral' && (
        <div className="space-y-6">
          {/* Main KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#0b1f3c] p-5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs transition-all">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-300 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Receita Realizada</span>
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 rounded-xl border border-emerald-200/60 dark:border-emerald-700/40">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-display">
                {formatCurrency(receitaTotal)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-1 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>{osConcluidas.length} OS finalizadas</span>
              </p>
            </div>

            <div className="bg-white dark:bg-[#0b1f3c] p-5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs transition-all">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-300 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Despesas Operacionais</span>
                <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 rounded-xl border border-rose-200/60 dark:border-rose-700/40">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 font-display">
                {formatCurrency(despesaTotal)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-1 font-medium">
                {periodTransactions.filter(t => t.tipo === 'despesa').length} saídas de caixa
              </p>
            </div>

            <div className="bg-white dark:bg-[#0b1f3c] p-5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs transition-all">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-300 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Lucro Líquido Real</span>
                <div className={`p-2 rounded-xl border ${lucroLiquido >= 0 ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border-blue-200/60 dark:border-blue-700/40' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 border-rose-200/60 dark:border-rose-700/40'}`}>
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className={`text-2xl sm:text-3xl font-black font-display ${lucroLiquido >= 0 ? 'text-blue-600 dark:text-blue-300' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatCurrency(lucroLiquido)}
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-1">
                Margem líquida: {margemLucro.toFixed(1)}%
              </p>
            </div>

            <div className="bg-white dark:bg-[#0b1f3c] p-5 rounded-2xl border border-slate-200 dark:border-blue-900/50 shadow-xs transition-all">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-300 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Ticket Médio por OS</span>
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 rounded-xl border border-indigo-200/60 dark:border-indigo-700/40">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-display">
                {formatCurrency(ticketMedio)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-1 font-medium">
                {totalNovosClientes} novos clientes no período
              </p>
            </div>
          </div>

          {/* DRE Sintético & Comparativo Visual */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-800 font-display text-base flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                <span>Demonstrativo de Resultado do Exercício (DRE Gerencial)</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                      <th className="pb-3">Linha / Rubrica</th>
                      <th className="pb-3 text-right">Valor</th>
                      <th className="pb-3 text-right">% Receita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr className="font-semibold text-slate-800">
                      <td className="py-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>(+) Faturamento Bruto (Receita Realizada)</span>
                      </td>
                      <td className="py-3 text-right text-emerald-600 font-bold">{formatCurrency(receitaTotal)}</td>
                      <td className="py-3 text-right text-slate-500">100.0%</td>
                    </tr>
                    <tr>
                      <td className="py-3 pl-6 text-slate-600">
                        <span>(-) Despesas Operacionais, Insumos & Custos</span>
                      </td>
                      <td className="py-3 text-right text-rose-600 font-semibold">{formatCurrency(despesaTotal)}</td>
                      <td className="py-3 text-right text-slate-500">
                        {receitaTotal > 0 ? ((despesaTotal / receitaTotal) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                    <tr className="bg-blue-50/50 font-bold text-slate-900">
                      <td className="py-3 pl-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <span>(=) Resultado Operacional Líquido</span>
                      </td>
                      <td className={`py-3 text-right font-extrabold ${lucroLiquido >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                        {formatCurrency(lucroLiquido)}
                      </td>
                      <td className="py-3 text-right font-bold text-blue-700">{margemLucro.toFixed(1)}%</td>
                    </tr>
                    <tr>
                      <td className="py-3 pl-6 text-slate-500">
                        <span>(*) Contas a Receber em Aberto (Pendente)</span>
                      </td>
                      <td className="py-3 text-right text-amber-600 font-semibold">{formatCurrency(aReceberPendente)}</td>
                      <td className="py-3 text-right text-slate-400">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Summary Highlights */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 font-display text-base flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>Destaques do Período</span>
                </h3>

                <div className="space-y-3.5">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-xs text-slate-500">Taxa de Conversão de Orçamentos</div>
                    <div className="text-lg font-bold text-slate-800 mt-0.5">
                      {taxaAprovacaoOrcamentos.toFixed(1)}%
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {orcamentosAprovados} de {totalOrcamentos} orçamentos aprovados
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-xs text-slate-500">Total de Atendimentos</div>
                    <div className="text-lg font-bold text-slate-800 mt-0.5">
                      {osConcluidas.length} OS Concluídas
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {osCanceladas.length} cancelamentos no período
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-xs text-slate-500">Retorno sobre Anúncios (ROAS)</div>
                    <div className="text-lg font-bold text-blue-700 mt-0.5">
                      {roas > 0 ? `${roas.toFixed(1)}x` : 'Sem dados de mídia'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatCurrency(totalMarketingInvestido)} investidos em marketing
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
                <span>Status de fechamento</span>
                <span className="font-semibold text-blue-600">Equilibrado</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: VENDAS & PERFORMANCE TÉCNICA                                   */}
      {/* ===================================================================== */}
      {activeTab === 'vendas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="text-xs font-semibold text-slate-400 uppercase">Orçamentos Criados</div>
              <div className="text-2xl font-black text-slate-800 font-display mt-1">{totalOrcamentos}</div>
              <div className="text-xs text-emerald-600 font-semibold mt-1">{orcamentosAprovados} Aprovados ({taxaAprovacaoOrcamentos.toFixed(1)}%)</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="text-xs font-semibold text-slate-400 uppercase">Ordens de Serviço</div>
              <div className="text-2xl font-black text-slate-800 font-display mt-1">{periodServiceOrders.length}</div>
              <div className="text-xs text-blue-600 font-semibold mt-1">{osConcluidas.length} Finalizadas com Sucesso</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="text-xs font-semibold text-slate-400 uppercase">Faturamento Operacional</div>
              <div className="text-2xl font-black text-emerald-600 font-display mt-1">{formatCurrency(faturamentoOS)}</div>
              <div className="text-xs text-slate-500 mt-1">Ticket Médio: {formatCurrency(ticketMedio)}</div>
            </div>
          </div>

          {/* Performance por Técnico Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="font-bold text-slate-800 font-display text-base flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-amber-500" />
              <span>Produtividade e Faturamento por Técnico</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                    <th className="pb-3">Técnico / Profissional</th>
                    <th className="pb-3 text-center">Atendimentos Concluídos</th>
                    <th className="pb-3 text-right">Faturamento Gerado</th>
                    <th className="pb-3 text-right">Ticket Médio</th>
                    <th className="pb-3 text-right">Participação %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {performanceTecnicos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        Nenhum atendimento finalizado com técnico registrado neste período.
                      </td>
                    </tr>
                  ) : (
                    performanceTecnicos.map(([tec, data]) => {
                      const share = faturamentoOS > 0 ? (data.totalFaturado / faturamentoOS) * 100 : 0;
                      const tecTicket = data.concluidas > 0 ? data.totalFaturado / data.concluidas : 0;
                      return (
                        <tr key={tec} className="hover:bg-slate-50/60 transition">
                          <td className="py-3.5 font-bold text-slate-800 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold">
                              {tec.charAt(0).toUpperCase()}
                            </div>
                            <span>{tec}</span>
                          </td>
                          <td className="py-3.5 text-center font-semibold">{data.concluidas}</td>
                          <td className="py-3.5 text-right font-bold text-emerald-600">{formatCurrency(data.totalFaturado)}</td>
                          <td className="py-3.5 text-right text-slate-600">{formatCurrency(tecTicket)}</td>
                          <td className="py-3.5 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                              {share.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: MARKETING, ROAS & CAC                                          */}
      {/* ===================================================================== */}
      {activeTab === 'marketing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="text-xs font-semibold text-slate-400 uppercase">Investimento em Mídia</div>
              <div className="text-2xl font-black text-rose-600 font-display mt-1">
                {formatCurrency(totalMarketingInvestido)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Anúncios, tráfego e divulgações</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="text-xs font-semibold text-slate-400 uppercase">CAC Total (Custo por Cliente)</div>
              <div className="text-2xl font-black text-slate-800 font-display mt-1">
                {cac > 0 ? formatCurrency(cac) : 'R$ 0,00'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Inclui mkt ({formatCurrency(marketingCacUnitario)}) + custo médio por serviço ({formatCurrency(averageCostPerService)})
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="text-xs font-semibold text-slate-400 uppercase">ROAS (Retorno em Anúncios)</div>
              <div className="text-2xl font-black text-blue-700 font-display mt-1">
                {roas > 0 ? `${roas.toFixed(2)}x` : '—'}
              </div>
              <p className="text-xs text-blue-600 font-semibold mt-1">Multiplicador da receita sobre mídia</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="text-xs font-semibold text-slate-400 uppercase">ROI de Marketing</div>
              <div className="text-2xl font-black text-emerald-600 font-display mt-1">
                {roi > 0 ? `${roi.toFixed(1)}%` : '—'}
              </div>
              <p className="text-xs text-slate-500 mt-1">Retorno líquido percentual</p>
            </div>
          </div>

          {/* Breakdown por Canais de Origem */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="font-bold text-slate-800 font-display text-base flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-blue-600" />
              <span>Desempenho por Canal de Aquisição de Clientes</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                    <th className="pb-3">Canal de Origem</th>
                    <th className="pb-3 text-center">Novos Cadastros</th>
                    <th className="pb-3 text-center">Serviços Executados</th>
                    <th className="pb-3 text-right">Faturamento Total</th>
                    <th className="pb-3 text-right">Taxa de Conversão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {origensStats.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        Nenhuma origem registrada para os clientes neste período.
                      </td>
                    </tr>
                  ) : (
                    origensStats.map(([origem, data]) => {
                      const conv = data.cadastrados > 0 ? (data.atendidos / data.cadastrados) * 100 : 0;
                      return (
                        <tr key={origem} className="hover:bg-slate-50/60 transition">
                          <td className="py-3.5 font-bold text-slate-800">{origem}</td>
                          <td className="py-3.5 text-center">{data.cadastrados}</td>
                          <td className="py-3.5 text-center font-semibold">{data.atendidos}</td>
                          <td className="py-3.5 text-right font-bold text-emerald-600">{formatCurrency(data.receita)}</td>
                          <td className="py-3.5 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                              {conv.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: DRE & CATEGORIAS FINANCEIRAS                                   */}
      {/* ===================================================================== */}
      {activeTab === 'financeiro' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Receitas por Categoria */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
              <h3 className="font-bold text-slate-800 font-display text-base flex items-center gap-2 mb-4 text-emerald-700">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <span>Receitas por Categoria de Serviço</span>
              </h3>

              <div className="space-y-3">
                {receitasPorCategoria.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Nenhuma receita registrada no período.</p>
                ) : (
                  receitasPorCategoria.map(([cat, total]) => {
                    const pct = receitaTotal > 0 ? (total / receitaTotal) * 100 : 0;
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>{cat}</span>
                          <span>{formatCurrency(total)} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full" 
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Despesas por Categoria */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
              <h3 className="font-bold text-slate-800 font-display text-base flex items-center gap-2 mb-4 text-rose-700">
                <TrendingDown className="w-5 h-5 text-rose-600" />
                <span>Despesas por Categoria de Gasto</span>
              </h3>

              <div className="space-y-3">
                {despesasPorCategoria.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Nenhuma despesa registrada no período.</p>
                ) : (
                  despesasPorCategoria.map(([cat, total]) => {
                    const pct = despesaTotal > 0 ? (total / despesaTotal) * 100 : 0;
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>{cat}</span>
                          <span>{formatCurrency(total)} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-rose-500 rounded-full" 
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Formas de Pagamento mais Utilizadas */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="font-bold text-slate-800 font-display text-base flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span>Volume por Método de Pagamento Recebido</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {receitasPorMetodo.map(([metodo, data]) => {
                const pct = receitaTotal > 0 ? (data.total / receitaTotal) * 100 : 0;
                return (
                  <div key={metodo} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-xs font-semibold text-slate-500">{metodo}</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(data.total)}</div>
                    <div className="text-xs text-blue-600 font-semibold mt-0.5">
                      {data.count} pagamentos ({pct.toFixed(1)}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
