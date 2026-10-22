/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Target, 
  TrendingUp, 
  Clock, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles, 
  Zap, 
  Award, 
  AlertCircle,
  HelpCircle,
  Calculator,
  RefreshCw,
  ShieldCheck,
  Check,
  Percent
} from 'lucide-react';
import { DatabaseState, SmartGoalsConfig, PageId } from '../types';
import { formatCurrency, parseDateComponents } from '../lib/utils';
import { isExcludedServiceOrder, isExcludedTransaction } from '../lib/database';

interface MetasInteligentesProps {
  db: DatabaseState;
  onUpdateDb: (newDb: DatabaseState) => void;
  setPage?: (page: PageId) => void;
}

export const MetasInteligentes: React.FC<MetasInteligentesProps> = ({
  db,
  onUpdateDb,
  setPage
}) => {
  const companySettings = db.companySettings;
  const currentSavedGoals = companySettings?.smart_goals;

  const now = new Date();
  const currentMonthIdx = now.getMonth();
  const currentYear = now.getFullYear();

  // Mês selecionado para visualização do progresso
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Parâmetros de Metas
  const [metaFaturamento, setMetaFaturamento] = useState<number>(
    currentSavedGoals?.metaFaturamentoMensal ?? 15000
  );
  const [diasTrabalhados, setDiasTrabalhados] = useState<number>(
    currentSavedGoals?.diasTrabalhadosMes ?? 22
  );
  const [horasDia, setHorasDia] = useState<number>(
    currentSavedGoals?.horasProdutivasDia ?? 6.5
  );
  const [custosFixos, setCustosFixos] = useState<number>(
    currentSavedGoals?.custosFixosMensal ?? 3500
  );
  const [margemLucroDesejada, setMargemLucroDesejada] = useState<number>(
    currentSavedGoals?.margemLucroDesejadaPercentual ?? 40
  );
  const [ticketMedioInput, setTicketMedioInput] = useState<number>(
    currentSavedGoals?.ticketMedioEstimado ?? 380
  );

  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Cálculos Básicos
  const totalHorasMes = useMemo(() => {
    return Math.max(1, diasTrabalhados * horasDia);
  }, [diasTrabalhados, horasDia]);

  // VALOR / HORA IDEAL CALCULADO
  const valorHoraIdeal = useMemo(() => {
    if (totalHorasMes <= 0) return 0;
    return Math.round((metaFaturamento / totalHorasMes) * 100) / 100;
  }, [metaFaturamento, totalHorasMes]);

  // Meta diária de faturamento
  const metaDiaria = useMemo(() => {
    if (diasTrabalhados <= 0) return 0;
    return Math.round(metaFaturamento / diasTrabalhados);
  }, [metaFaturamento, diasTrabalhados]);

  // Quantidade de clientes/serviços necessários no mês baseado no ticket médio
  const servicosNecessariosMes = useMemo(() => {
    const tm = ticketMedioInput > 0 ? ticketMedioInput : 380;
    return Math.ceil(metaFaturamento / tm);
  }, [metaFaturamento, ticketMedioInput]);

  const servicosNecessariosDia = useMemo(() => {
    if (diasTrabalhados <= 0) return 0;
    return Math.round((servicosNecessariosMes / diasTrabalhados) * 10) / 10;
  }, [servicosNecessariosMes, diasTrabalhados]);

  // Lucro líquido projetado no mês
  const lucroLiquidoProjetado = useMemo(() => {
    // Faturamento - Custos Fixos - Estimativa de Custos Variáveis (químicos/combustível ~18%)
    const custosVariaveisEstimados = metaFaturamento * 0.18;
    return Math.max(0, metaFaturamento - custosFixos - custosVariaveisEstimados);
  }, [metaFaturamento, custosFixos]);

  // =========================================================================
  // ACOMPANHAMENTO REAL: Faturamento Realizado do Mês Selecionado no DB
  // =========================================================================
  const { faturamentoRealizado, servicosRealizadosCount } = useMemo(() => {
    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    let total = 0;
    let count = 0;
    const seenOS = new Set<string>();

    // 1. Concluded OS in selected month
    (db.serviceOrders || []).forEach(os => {
      if (isExcludedServiceOrder(os)) return;
      if (os.status !== 'concluido') return;
      const d = os.data_conclusao || os.data_agendada || os.created_at;
      if (d && d.startsWith(monthPrefix)) {
        total += Number(os.total || 0);
        count++;
        seenOS.add(os.id);
        if (os.numero) seenOS.add(os.numero.replace('#', '').trim());
      }
    });

    // 2. Paid Transactions in selected month not tied to counted OS
    (db.transactions || []).forEach(t => {
      if (isExcludedTransaction(t)) return;
      if (t.tipo === 'receita' && t.status === 'pago' && t.data && t.data.startsWith(monthPrefix)) {
        if (t.os_id && seenOS.has(t.os_id)) return;
        const desc = (t.descricao || '').toLowerCase();
        if (desc.includes('recebimento os') || desc.includes('recebimento serviço concluído')) return;
        total += Number(t.valor || 0);
        count++;
      }
    });

    return { faturamentoRealizado: total, servicosRealizadosCount: count };
  }, [db.serviceOrders, db.transactions, selectedMonth, selectedYear]);

  // Progresso em relação à meta
  const percentualAtingido = useMemo(() => {
    if (metaFaturamento <= 0) return 0;
    return Math.min(100, Math.round((faturamentoRealizado / metaFaturamento) * 100));
  }, [faturamentoRealizado, metaFaturamento]);

  const valorRestante = useMemo(() => {
    return Math.max(0, metaFaturamento - faturamentoRealizado);
  }, [metaFaturamento, faturamentoRealizado]);

  // Dias restantes no mês para bater a meta
  const diasRestantesNoMes = useMemo(() => {
    const totalDiasNoMes = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const diaAtual = (selectedMonth === currentMonthIdx && selectedYear === currentYear) ? now.getDate() : totalDiasNoMes;
    return Math.max(1, totalDiasNoMes - diaAtual);
  }, [selectedMonth, selectedYear, currentMonthIdx, currentYear, now]);

  const metaDiariaRestante = useMemo(() => {
    if (valorRestante <= 0) return 0;
    return Math.round(valorRestante / diasRestantesNoMes);
  }, [valorRestante, diasRestantesNoMes]);

  // Salvar Metas Inteligentes na Configuração da Empresa
  const handleSalvarMetas = () => {
    const updatedSettings = {
      ...(companySettings || ({} as any)),
      smart_goals: {
        metaFaturamentoMensal: metaFaturamento,
        diasTrabalhadosMes: diasTrabalhados,
        horasProdutivasDia: horasDia,
        custosFixosMensal: custosFixos,
        margemLucroDesejadaPercentual: margemLucroDesejada,
        ticketMedioEstimado: ticketMedioInput,
        updated_at: new Date().toISOString(),
      }
    };

    onUpdateDb({
      ...db,
      companySettings: updatedSettings
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleIrParaCalculadora = () => {
    // Atualiza o valor hora da calculadora com a meta atual
    const updatedSettings = {
      ...(companySettings || ({} as any)),
      budget_calculator: {
        ...(companySettings?.budget_calculator || {}),
        valorHoraMaoDeObra: valorHoraIdeal,
        updated_at: new Date().toISOString(),
      }
    };
    onUpdateDb({
      ...db,
      companySettings: updatedSettings
    });

    if (setPage) {
      setPage('calculadora');
    }
  };

  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Banner Card */}
      <div className="bg-gradient-to-br from-[#07172c] via-[#0d2a54] to-[#144272] rounded-3xl p-6 md:p-8 text-white shadow-xl border border-blue-900/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold mb-2">
              <Target className="w-3.5 h-3.5" />
              <span>Planejamento Financeiro & Produtividade</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white font-display">
              Metas Inteligentes
            </h1>
            <p className="text-blue-100/80 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
              Defina seu objetivo financeiro mensal e descubra instantaneamente o <strong>valor/hora ideal</strong> que sua empresa precisa cobrar para bater a meta sem sobrecarregar sua rotina.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleIrParaCalculadora}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-2 border border-white/15 cursor-pointer"
            >
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span>Ir para Calculadora de Orçamento</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleSalvarMetas}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/40'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Metas Salvas!</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Salvar Metas do Negócio</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Highlight Result Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-white/10">
          <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs">
            <span className="text-xs uppercase font-extrabold text-blue-100 tracking-wider">
              Valor/Hora Ideal Necessário
            </span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl md:text-3xl font-black text-amber-300 font-display">
                {formatCurrency(valorHoraIdeal)}
              </span>
              <span className="text-xs text-blue-100 font-bold">/hora</span>
            </div>
            <p className="text-xs text-blue-100/90 mt-1 font-medium">
              Para faturar {formatCurrency(metaFaturamento)} no mês
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs">
            <span className="text-xs uppercase font-extrabold text-blue-100 tracking-wider">
              Meta Diária de Faturamento
            </span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl md:text-3xl font-black text-emerald-400 font-display">
                {formatCurrency(metaDiaria)}
              </span>
              <span className="text-xs text-blue-100 font-bold">/dia</span>
            </div>
            <p className="text-xs text-blue-100/90 mt-1 font-medium">
              Em {diasTrabalhados} dias úteis de trabalho
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs">
            <span className="text-xs uppercase font-extrabold text-blue-100 tracking-wider">
              Serviços Necessários
            </span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl md:text-3xl font-black text-white font-display">
                {servicosNecessariosMes}
              </span>
              <span className="text-xs text-blue-100 font-bold">atendimentos</span>
            </div>
            <p className="text-xs text-blue-100/90 mt-1 font-medium">
              Média de ~{servicosNecessariosDia} serviços/dia útil
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs">
            <span className="text-xs uppercase font-extrabold text-blue-100 tracking-wider">
              Lucro Líquido Projetado
            </span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl md:text-3xl font-black text-teal-300 font-display">
                {formatCurrency(lucroLiquidoProjetado)}
              </span>
            </div>
            <p className="text-xs text-blue-100/90 mt-1 font-medium">
              Livre após custos fixos e insumos
            </p>
          </div>
        </div>
      </div>

      {/* Real-time Progress Tracking Thermometer */}
      <div className="bg-white dark:bg-[#0b1f3c] rounded-3xl p-6 border border-slate-200 dark:border-blue-900/50 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-blue-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 flex items-center justify-center font-bold border border-amber-200 dark:border-amber-700/50">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white">
                Termômetro de Realização do Mês
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                Comparativo em tempo real do faturamento realizado no sistema vs meta
              </p>
            </div>
          </div>

          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-blue-800 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#07172e] outline-none cursor-pointer"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name} {selectedYear}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs font-bold mb-2">
            <span className="text-slate-700 dark:text-slate-200">
              Realizado: <strong className="text-slate-900 dark:text-white font-black">{formatCurrency(faturamentoRealizado)}</strong> ({servicosRealizadosCount} serviços)
            </span>
            <span className="text-indigo-600 dark:text-indigo-300 font-black">
              {percentualAtingido}% da Meta ({formatCurrency(metaFaturamento)})
            </span>
          </div>

          <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/80 dark:border-blue-900/50">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full transition-all duration-700 relative"
              style={{ width: `${percentualAtingido}%` }}
            />
          </div>
        </div>

        {/* Remaining breakdown stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#07172e] border border-slate-200 dark:border-blue-900/50 text-xs">
            <span className="text-slate-500 dark:text-slate-300 font-bold block">Falta para atingir:</span>
            <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block font-mono">
              {valorRestante > 0 ? formatCurrency(valorRestante) : '🎉 Meta Batida!'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#07172e] border border-slate-200 dark:border-blue-900/50 text-xs">
            <span className="text-slate-500 dark:text-slate-300 font-bold block">Dias restantes no mês:</span>
            <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block font-mono">
              {diasRestantesNoMes} dias
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#07172e] border border-slate-200 dark:border-blue-900/50 text-xs">
            <span className="text-slate-500 dark:text-slate-300 font-bold block">Meta diária necessária restante:</span>
            <span className="text-base font-black text-amber-600 dark:text-amber-300 mt-0.5 block font-mono">
              {valorRestante > 0 ? `${formatCurrency(metaDiariaRestante)}/dia` : 'Objetivo Concluído!'}
            </span>
          </div>
        </div>
      </div>

      {/* Goal Parameters Form (Interactive Inputs) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>Configuração dos Parâmetros do seu Negócio</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1. Meta Faturamento */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Meta de Faturamento Mensal (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
              <input
                type="number"
                min="1000"
                max="200000"
                step="500"
                value={metaFaturamento}
                onChange={(e) => setMetaFaturamento(parseFloat(e.target.value) || 0)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Quanto você deseja faturar bruto no mês</p>
          </div>

          {/* 2. Dias Trabalhados */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Dias Trabalhados no Mês
            </label>
            <div className="relative">
              <input
                type="number"
                min="5"
                max="31"
                step="1"
                value={diasTrabalhados}
                onChange={(e) => setDiasTrabalhados(parseInt(e.target.value, 10) || 1)}
                className="w-full pr-12 pl-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">dias</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Padrão: 22 dias úteis (segunda a sexta)</p>
          </div>

          {/* 3. Horas Produtivas Dia */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Horas de Execução em Campo / Dia
            </label>
            <div className="relative">
              <input
                type="number"
                min="2"
                max="14"
                step="0.5"
                value={horasDia}
                onChange={(e) => setHorasDia(parseFloat(e.target.value) || 1)}
                className="w-full pr-14 pl-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">horas</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Horas efetivas na casa dos clientes</p>
          </div>

          {/* 4. Custos Fixos Mensal */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Custos Fixos da Empresa no Mês
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
              <input
                type="number"
                min="0"
                max="50000"
                step="100"
                value={custosFixos}
                onChange={(e) => setCustosFixos(parseFloat(e.target.value) || 0)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Aluguel, marketing, contador, internet, pró-labore</p>
          </div>

          {/* 5. Ticket Médio Estimado */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ticket Médio por Serviço (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
              <input
                type="number"
                min="50"
                max="3000"
                step="10"
                value={ticketMedioInput}
                onChange={(e) => setTicketMedioInput(parseFloat(e.target.value) || 100)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Valor médio que cada cliente paga (ex: R$ 380,00)</p>
          </div>

          {/* 6. Botão Sincronizar com Calculadora */}
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={handleIrParaCalculadora}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Usar R$ {valorHoraIdeal}/h na Calculadora</span>
            </button>
            <p className="text-[10px] text-slate-400 mt-1 text-center">
              Transfere automaticamente seu valor/hora ideal
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
