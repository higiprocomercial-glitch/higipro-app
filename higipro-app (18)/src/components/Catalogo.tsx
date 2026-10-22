/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Search, Plus, Filter, Edit2, Trash2, Clock, 
  DollarSign, Check, HelpCircle, Ruler,
  Calculator, Copy, ChevronDown, ChevronUp, Sparkles, ArrowRight
} from 'lucide-react';
import { Service, DatabaseState, ServiceCategory, SofaType } from '../types';
import { formatCurrency, extractServiceNumber, formatServiceNumber, parseServiceTitle } from '../lib/utils';
import { CATEGORIES, ESTOFADO_TYPES, generateId } from '../lib/database';
import { Modal, ConfirmDialog, EmptyState } from './UIComponents';
import { CatalogoGraficos } from './CatalogoGraficos';

interface CatalogoProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
}

export const Catalogo = React.memo<CatalogoProps>(({ db, onUpdateDb }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [estofadoFilter, setEstofadoFilter] = useState<string>('');

  // Top banner quick calculator state
  const [isTopCalcOpen, setIsTopCalcOpen] = useState(false);
  const [topCalcServiceId, setTopCalcServiceId] = useState<string>('');
  const [topCalcCustomPreco, setTopCalcCustomPreco] = useState('55.00');
  const [topCalcLargura, setTopCalcLargura] = useState('2.00');
  const [topCalcComprimento, setTopCalcComprimento] = useState('2.50');
  const [topCalcCopied, setTopCalcCopied] = useState(false);

  // Per-card simulator state
  const [simulators, setSimulators] = useState<Record<string, {
    isOpen: boolean;
    largura: string;
    comprimento: string;
    copied: boolean;
  }>>({});

  // CRUD state
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);

  // Form Field State
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    categoria: 'Higienização' as ServiceCategory,
    tipo_estofado: 'Sofá' as SofaType,
    preco: '',
    duracao: '120',
    ativo: true,
    unidade: 'un' as 'un' | 'm²',
    // Rug size calculator fields
    tapeteLargura: '2.00',
    tapeteComprimento: '2.50',
    tapeteArea: '5.00',
  });

  // Sorted and filtered services strictly enumerated from 01 to the last
  const filteredServices = React.useMemo(() => {
    const list = db.services.filter(s => {
      const matchesSearch = 
        s.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.descricao.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter ? s.categoria === categoryFilter : true;
      const matchesEstofado = estofadoFilter ? s.tipo_estofado === estofadoFilter : true;

      return matchesSearch && matchesCategory && matchesEstofado;
    });

    return [...list].sort((a, b) => {
      const numA = extractServiceNumber(a.nome);
      const numB = extractServiceNumber(b.nome);
      if (numA !== numB) return numA - numB;
      return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });
  }, [db.services, searchTerm, categoryFilter, estofadoFilter]);

  // Tapete services for quick calculator
  const tapeteServices = React.useMemo(() => {
    return db.services.filter(s => 
      s.categoria === 'Tapete' || s.tipo_estofado === 'Tapete' || s.unidade === 'm²' || s.nome.toLowerCase().includes('tapete')
    );
  }, [db.services]);

  const handleCreateOpen = (defaultCategory?: ServiceCategory) => {
    setEditingService(null);
    const cat = defaultCategory || 'Higienização';
    const isTapete = cat === 'Tapete';

    // Calculate next sequential number for clean enumeration (e.g., 23)
    const highestNum = db.services.reduce((max, s) => {
      const n = extractServiceNumber(s.nome);
      return (n > max && n < 900) ? n : max;
    }, 0);
    const nextNumStr = formatServiceNumber(highestNum + 1);

    setFormData({
      nome: isTapete ? `${nextNumStr}-Higienização e Limpeza de Tapete` : `${nextNumStr}-`,
      descricao: '',
      categoria: cat,
      tipo_estofado: isTapete ? 'Tapete' : 'Sofá',
      preco: isTapete ? '55.00' : '',
      duracao: '120',
      ativo: true,
      unidade: isTapete ? 'm²' : 'un',
      tapeteLargura: '2.00',
      tapeteComprimento: '2.50',
      tapeteArea: '5.00',
    });
    setIsCrudOpen(true);
  };

  const handleEditOpen = (service: Service) => {
    setEditingService(service);
    const isTapete = service.categoria === 'Tapete' || service.tipo_estofado === 'Tapete' || service.unidade === 'm²' || service.nome.toLowerCase().includes('tapete');
    const larg = service.tamanho_largura ? service.tamanho_largura.toString() : '2.00';
    const comp = service.tamanho_comprimento ? service.tamanho_comprimento.toString() : '2.50';
    const area = service.tamanho_m2 
      ? service.tamanho_m2.toString() 
      : (service.tamanho_largura && service.tamanho_comprimento 
          ? (service.tamanho_largura * service.tamanho_comprimento).toFixed(2) 
          : '5.00');

    setFormData({
      nome: service.nome,
      descricao: service.descricao,
      categoria: service.categoria,
      tipo_estofado: service.tipo_estofado,
      preco: service.preco.toString(),
      duracao: service.duracao.toString(),
      ativo: service.ativo,
      unidade: service.unidade || (isTapete ? 'm²' : 'un'),
      tapeteLargura: larg,
      tapeteComprimento: comp,
      tapeteArea: area,
    });
    setIsCrudOpen(true);
  };

  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim()) return;

    const precoNum = parseFloat(formData.preco.replace(',', '.')) || 0;
    const duracaoNum = parseInt(formData.duracao) || 60;
    const isTapete = formData.categoria === 'Tapete' || formData.tipo_estofado === 'Tapete' || formData.nome.toLowerCase().includes('tapete');
    const finalUnidade: 'un' | 'm²' = isTapete ? 'm²' : (formData.unidade || 'un');

    const largNum = isTapete ? (parseFloat(formData.tapeteLargura.replace(',', '.')) || undefined) : undefined;
    const compNum = isTapete ? (parseFloat(formData.tapeteComprimento.replace(',', '.')) || undefined) : undefined;
    const areaNum = isTapete ? (parseFloat(formData.tapeteArea.replace(',', '.')) || undefined) : undefined;

    let finalName = formData.nome.trim();

    if (editingService) {
      const updatedServices = db.services.map(s => {
        if (s.id === editingService.id) {
          return {
            ...s,
            nome: finalName,
            descricao: formData.descricao.trim(),
            categoria: formData.categoria,
            tipo_estofado: formData.tipo_estofado,
            preco: precoNum,
            custo: editingService.custo || 0,
            duracao: duracaoNum,
            ativo: formData.ativo,
            unidade: finalUnidade,
            tamanho_largura: largNum,
            tamanho_comprimento: compNum,
            tamanho_m2: areaNum,
          };
        }
        return s;
      });

      // Maintain catalog order
      updatedServices.sort((a, b) => extractServiceNumber(a.nome) - extractServiceNumber(b.nome));
      onUpdateDb({ ...db, services: updatedServices });
    } else {
      // If new service lacks a number prefix, prepend the next number
      if (!finalName.match(/^\d+/)) {
        const highestNum = db.services.reduce((max, s) => {
          const n = extractServiceNumber(s.nome);
          return (n > max && n < 900) ? n : max;
        }, 0);
        finalName = `${formatServiceNumber(highestNum + 1)}-${finalName}`;
      }

      const newService: Service = {
        id: generateId(),
        nome: finalName,
        descricao: formData.descricao.trim(),
        categoria: formData.categoria,
        tipo_estofado: formData.tipo_estofado,
        preco: precoNum,
        custo: 0,
        duracao: duracaoNum,
        ativo: formData.ativo,
        unidade: finalUnidade,
        tamanho_largura: largNum,
        tamanho_comprimento: compNum,
        tamanho_m2: areaNum,
      };

      const updatedServices = [...db.services, newService].sort((a, b) => 
        extractServiceNumber(a.nome) - extractServiceNumber(b.nome)
      );
      onUpdateDb({ ...db, services: updatedServices });
    }

    setIsCrudOpen(false);
  };

  const handleDeleteConfirm = () => {
    if (!serviceToDelete) return;
    const updatedServices = db.services.filter(s => s.id !== serviceToDelete.id);
    onUpdateDb({ ...db, services: updatedServices });
    setServiceToDelete(null);
  };

  // Card simulator toggles and updates
  const toggleCardSimulator = (serviceId: string) => {
    setSimulators(prev => {
      const current = prev[serviceId];
      return {
        ...prev,
        [serviceId]: {
          isOpen: !current?.isOpen,
          largura: current?.largura ?? '2.00',
          comprimento: current?.comprimento ?? '2.50',
          copied: false,
        }
      };
    });
  };

  const updateCardSimulator = (serviceId: string, field: 'largura' | 'comprimento', val: string) => {
    setSimulators(prev => ({
      ...prev,
      [serviceId]: {
        isOpen: true,
        largura: prev[serviceId]?.largura ?? '2.00',
        comprimento: prev[serviceId]?.comprimento ?? '2.50',
        copied: false,
        [field]: val,
      }
    }));
  };

  const copyCardQuote = (service: Service, l: number, c: number, area: number, total: number) => {
    const text = `*${service.nome}*\n` +
      `📐 Dimensões: ${l.toFixed(2)}m x ${c.toFixed(2)}m (${area.toFixed(2)} m²)\n` +
      `💵 Preço/m²: ${formatCurrency(service.preco)}/m²\n` +
      `💰 *Valor Total: ${formatCurrency(total)}*\n` +
      `✨ HigiPro - Excelência em Higienização de Estofados e Tapetes`;

    navigator.clipboard.writeText(text);

    setSimulators(prev => ({
      ...prev,
      [service.id]: {
        ...(prev[service.id] || { isOpen: true, largura: '2.00', comprimento: '2.50' }),
        copied: true,
      }
    }));

    setTimeout(() => {
      setSimulators(prev => ({
        ...prev,
        [service.id]: {
          ...(prev[service.id] || { isOpen: true, largura: '2.00', comprimento: '2.50' }),
          copied: false,
        }
      }));
    }, 2500);
  };

  // Copy quote from top calculator
  const copyTopCalcQuote = (nomeServico: string, precoM2: number, l: number, c: number, area: number, total: number) => {
    const text = `*Orçamento de Tapete - HigiPro*\n` +
      `🛋️ Serviço: ${nomeServico}\n` +
      `📐 Dimensões: ${l.toFixed(2)}m x ${c.toFixed(2)}m (${area.toFixed(2)} m²)\n` +
      `💵 Valor por m²: ${formatCurrency(precoM2)}/m²\n` +
      `💰 *Valor Total do Serviço: ${formatCurrency(total)}*\n` +
      `✨ Atendimento e higienização especializada com garantia.`;

    navigator.clipboard.writeText(text);
    setTopCalcCopied(true);
    setTimeout(() => setTopCalcCopied(false), 2500);
  };

  const isFormTapete = formData.categoria === 'Tapete' || formData.tipo_estofado === 'Tapete' || formData.unidade === 'm²' || formData.nome.toLowerCase().includes('tapete');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 font-display">Catálogo de Serviços</h1>
          <p className="text-sm text-slate-500">Defina os tipos de estofados, categorias, tapetes com cálculo por tamanho/m² e preços de venda.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsTopCalcOpen(!isTopCalcOpen)}
            className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-xl transition cursor-pointer border shadow-2xs ${
              isTopCalcOpen
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 hover:border-blue-300'
            }`}
          >
            <Calculator className="w-4 h-4 text-blue-600" />
            <span>Calculadora de Tapetes</span>
            {isTopCalcOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => handleCreateOpen()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Serviço
          </button>
        </div>
      </div>

      {/* Top Banner: Quick Rug Size Calculator */}
      {isTopCalcOpen && (
        <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50/60 p-5 rounded-2xl border-2 border-blue-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Ruler className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 font-display">
                  Calculadora Rápida de Medidas para Tapetes
                </h3>
                <p className="text-xs text-slate-500">
                  Calcule instantaneamente a área (m²) e o valor final para orçamentos a clientes.
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto px-2.5 py-1 text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 rounded-lg">
              Cálculo Comercial Automático
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Escolha do Serviço de Tapete */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Serviço de Referência
              </label>
              <select
                value={topCalcServiceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTopCalcServiceId(id);
                  if (id) {
                    const svc = tapeteServices.find(s => s.id === id);
                    if (svc) {
                      setTopCalcCustomPreco(svc.preco.toString());
                    }
                  }
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 cursor-pointer"
              >
                <option value="">Personalizado (R$/m²)</option>
                {tapeteServices.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nome} ({formatCurrency(s.preco)}/m²)
                  </option>
                ))}
              </select>
            </div>

            {/* Largura */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Largura (metros)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={topCalcLargura}
                  onChange={(e) => setTopCalcLargura(e.target.value)}
                  placeholder="Ex: 2.00"
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">m</span>
              </div>
            </div>

            {/* Comprimento */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Comprimento (metros)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={topCalcComprimento}
                  onChange={(e) => setTopCalcComprimento(e.target.value)}
                  placeholder="Ex: 2.50"
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">m</span>
              </div>
            </div>
          </div>

          {/* Preço Base configurável */}
          <div className="max-w-xs">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Preço Base por m² (R$)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={topCalcCustomPreco}
                onChange={(e) => setTopCalcCustomPreco(e.target.value)}
                placeholder="Ex: 55.00"
                className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">/m²</span>
            </div>
          </div>

          {/* Resultado do Cálculo */}
          {(() => {
            const l = parseFloat(topCalcLargura.replace(',', '.')) || 0;
            const c = parseFloat(topCalcComprimento.replace(',', '.')) || 0;
            const area = l * c;
            const precoM2 = parseFloat(topCalcCustomPreco.replace(',', '.')) || 0;
            const total = area * precoM2;

            const selectedSvc = tapeteServices.find(s => s.id === topCalcServiceId);
            const nomeExibicao = selectedSvc ? selectedSvc.nome : 'Higienização de Tapete';

            return (
              <div className="bg-white p-4 rounded-xl border border-blue-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>Fórmula:</span>
                    <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                      {l.toFixed(2)}m × {c.toFixed(2)}m = {area.toFixed(2)} m²
                    </span>
                    <span className="text-slate-400">×</span>
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                      {formatCurrency(precoM2)}/m²
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs font-bold text-slate-500">Valor Final Calculado:</span>
                    <span className="text-2xl font-black text-blue-700 font-display">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={() => copyTopCalcQuote(nomeExibicao, precoM2, l, c, area, total)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition shadow-2xs cursor-pointer flex-1 md:flex-initial"
                  >
                    {topCalcCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-300" />
                        Copiado para WhatsApp!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copiar Texto p/ WhatsApp
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleCreateOpen('Tapete');
                      setFormData(prev => ({
                        ...prev,
                        nome: `${nomeExibicao} ${l.toFixed(2)}m x ${c.toFixed(2)}m`,
                        categoria: 'Tapete',
                        tipo_estofado: 'Tapete',
                        unidade: 'm²',
                        preco: precoM2.toFixed(2),
                        tapeteLargura: l.toFixed(2),
                        tapeteComprimento: c.toFixed(2),
                        tapeteArea: area.toFixed(2),
                        descricao: `Higienização especializada para tapete de ${l.toFixed(2)}m x ${c.toFixed(2)}m (${area.toFixed(2)} m²).`
                      }));
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer flex-1 md:flex-initial"
                  >
                    <Plus className="w-4 h-4 text-blue-600" />
                    Cadastrar como Serviço
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Gráficos de Inteligência do Catálogo e Serviços Mais Vendidos */}
      <CatalogoGraficos db={db} />

      {/* Filter and Control Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou descrição do serviço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
          />
        </div>

        <div className="flex gap-2">
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm bg-slate-50 border border-slate-100 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
          >
            <option value="">Todas Categorias</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* SofaType Filter */}
          <select
            value={estofadoFilter}
            onChange={(e) => setEstofadoFilter(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm bg-slate-50 border border-slate-100 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
          >
            <option value="">Todos Estofados</option>
            {ESTOFADO_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Services Grid */}
      {filteredServices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map(service => {
            const isTapeteService = service.categoria === 'Tapete' || service.tipo_estofado === 'Tapete' || service.unidade === 'm²' || service.nome.toLowerCase().includes('tapete');
            const sim = simulators[service.id];
            
            return (
              <div 
                key={service.id} 
                className={`bg-white border p-5 rounded-2xl shadow-xs transition-all flex flex-col justify-between ${
                  service.ativo 
                    ? 'border-slate-100 hover:border-slate-200 hover:shadow-md' 
                    : 'border-slate-100 opacity-60 bg-slate-50/20'
                }`}
              >
                <div>
                  {/* Card Header */}
                  {(() => {
                    const { numberStr, cleanName } = parseServiceTitle(service.nome);
                    return (
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span 
                              className="text-[10px] font-black text-white bg-blue-700 px-2 py-0.5 rounded-md font-mono shadow-2xs tracking-wider shrink-0"
                              title={`Item número ${numberStr} do catálogo comercial`}
                            >
                              #{numberStr}
                            </span>
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                              isTapeteService 
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 font-extrabold' 
                                : 'text-blue-600 bg-slate-100'
                            }`}>
                              {service.categoria}
                            </span>
                            {isTapeteService && (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-100/60 px-1.5 py-0.5 rounded-sm">
                                m²
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-800 text-sm leading-tight pt-0.5 flex items-start gap-1">
                            <span className="text-blue-700 font-mono font-black shrink-0">{numberStr} -</span>
                            <span>{cleanName}</span>
                          </h3>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-semibold border shrink-0 ${
                          service.ativo 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}>
                          {service.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Description */}
                  <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-2">
                    {service.descricao || 'Nenhuma descrição detalhada cadastrada para este serviço.'}
                  </p>

                  {/* Service Price Display */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100/50">
                    <span className="text-xs font-semibold text-slate-500">
                      {isTapeteService ? 'Preço por m²' : 'Preço de Venda'}
                    </span>
                    <div className="text-right">
                      <span className="text-base font-extrabold text-slate-800 font-display">
                        {formatCurrency(service.preco)}
                      </span>
                      {isTapeteService ? (
                        <span className="text-xs text-blue-700 font-semibold ml-1">/m²</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Interactive Tapete Size Calculator for this specific rug */}
                  {isTapeteService && (
                    <div className="mt-3 mb-2">
                      <button
                        type="button"
                        onClick={() => toggleCardSimulator(service.id)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer border ${
                          sim?.isOpen 
                            ? 'bg-blue-100 text-blue-800 border-blue-300' 
                            : 'bg-blue-50/70 hover:bg-blue-100 text-blue-700 border-blue-200'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Ruler className="w-3.5 h-3.5 text-blue-600" />
                          Calcular Preço por Tamanho
                        </span>
                        {sim?.isOpen ? (
                          <ChevronUp className="w-3.5 h-3.5 text-blue-700" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-blue-700" />
                        )}
                      </button>

                      {sim?.isOpen && (
                        <div className="mt-2 p-3 bg-blue-50/40 rounded-xl border border-blue-200 space-y-2.5 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Largura (m)
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={sim.largura}
                                onChange={(e) => updateCardSimulator(service.id, 'largura', e.target.value)}
                                className="w-full px-2 py-1 text-xs font-semibold border border-slate-200 bg-white rounded-lg focus:outline-none focus:border-blue-600"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Comprimento (m)
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={sim.comprimento}
                                onChange={(e) => updateCardSimulator(service.id, 'comprimento', e.target.value)}
                                className="w-full px-2 py-1 text-xs font-semibold border border-slate-200 bg-white rounded-lg focus:outline-none focus:border-blue-600"
                              />
                            </div>
                          </div>

                          {/* Calculation Output */}
                          {(() => {
                            const l = parseFloat(sim.largura.replace(',', '.')) || 0;
                            const c = parseFloat(sim.comprimento.replace(',', '.')) || 0;
                            const area = l * c;
                            const totalVal = area * service.preco;

                            return (
                              <div className="bg-white p-2.5 rounded-lg border border-blue-200/80 space-y-1.5">
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-slate-500">Área:</span>
                                  <span className="font-mono font-bold text-slate-800">
                                    {l.toFixed(2)}m × {c.toFixed(2)}m = {area.toFixed(2)} m²
                                  </span>
                                </div>
                                <div className="flex justify-between items-baseline pt-0.5 border-t border-slate-100">
                                  <span className="text-xs font-bold text-slate-700">Valor Calculado:</span>
                                  <span className="text-sm font-black text-blue-700 font-display">
                                    {formatCurrency(totalVal)}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => copyCardQuote(service, l, c, area, totalVal)}
                                  className="w-full mt-1.5 py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                                >
                                  {sim.copied ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                                      Copiado p/ WhatsApp!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copiar Orçamento do Tapete
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="border-t border-slate-50/80 pt-3 mt-1 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{service.duracao} min</span>
                    <span className="text-slate-300">•</span>
                    <span className="bg-slate-100 px-1.5 py-0.2 rounded-md font-medium text-[10px]">
                      {service.tipo_estofado}
                    </span>
                    {isTapeteService && (
                      <span className="bg-blue-50 text-blue-700 font-bold px-1.5 py-0.2 rounded-md text-[10px] border border-blue-200">
                        m²
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditOpen(service)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                      title="Editar serviço"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setServiceToDelete(service)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      title="Excluir serviço"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Filter className="w-10 h-10" />}
          title="Nenhum serviço catalogado"
          description="Nenhum item do catálogo atende aos critérios de busca ou filtros selecionados."
          actionText="Cadastrar Serviço"
          onAction={() => handleCreateOpen()}
        />
      )}

      {/* CRUD Modal for Add/Edit Service */}
      <Modal
        isOpen={isCrudOpen}
        onClose={() => setIsCrudOpen(false)}
        title={editingService ? "Editar Item do Catálogo" : "Cadastrar Novo Serviço"}
      >
        <form onSubmit={handleSaveService} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Nome */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nome do Serviço *</label>
              <input
                type="text"
                required
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder={isFormTapete ? "Ex: Higienização e Limpeza de Tapete" : "Ex: Higienização de Colchão Casal"}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Categoria *</label>
              <select
                value={formData.categoria}
                onChange={(e) => {
                  const cat = e.target.value as ServiceCategory;
                  const isTapeteCat = cat === 'Tapete';
                  setFormData({
                    ...formData,
                    categoria: cat,
                    tipo_estofado: isTapeteCat ? 'Tapete' : formData.tipo_estofado,
                    unidade: isTapeteCat ? 'm²' : formData.unidade,
                    preco: isTapeteCat && !formData.preco ? '55.00' : formData.preco,
                    nome: isTapeteCat && !formData.nome ? 'Higienização e Limpeza de Tapete' : formData.nome
                  });
                }}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Tipo Estofado */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de Estofado</label>
              <select
                value={formData.tipo_estofado}
                onChange={(e) => {
                  const val = e.target.value as SofaType;
                  const isTapeteVal = val === 'Tapete';
                  setFormData({
                    ...formData,
                    tipo_estofado: val,
                    categoria: isTapeteVal ? 'Tapete' : formData.categoria,
                    unidade: isTapeteVal ? 'm²' : formData.unidade,
                    preco: isTapeteVal && !formData.preco ? '55.00' : formData.preco,
                  });
                }}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
              >
                {ESTOFADO_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Unidade de Cobrança */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Unidade de Cobrança</label>
              <select
                value={isFormTapete ? 'm²' : formData.unidade}
                disabled={isFormTapete}
                onChange={(e) => setFormData({ ...formData, unidade: e.target.value as 'un' | 'm²' })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer disabled:bg-slate-50 disabled:text-blue-700 disabled:font-medium"
              >
                <option value="un">Por Unidade (un)</option>
                <option value="m²">Por Metro Quadrado (m²)</option>
              </select>
              {isFormTapete && (
                <span className="text-[11px] text-blue-600 mt-1 block font-medium">
                  ✓ Tapetes são cobrados por metro quadrado (m²).
                </span>
              )}
            </div>

            {/* Preço de Venda */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {isFormTapete ? 'Preço Base por m² (R$)' : 'Preço de Venda (R$)'}
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.preco}
                onChange={(e) => setFormData({ ...formData, preco: e.target.value })}
                placeholder={isFormTapete ? "Ex: 55.00" : "Ex: 250.00"}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition font-semibold text-slate-800"
              />
            </div>

            {/* Duração Estimada */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Duração (Minutos)</label>
              <input
                type="number"
                required
                value={formData.duracao}
                onChange={(e) => setFormData({ ...formData, duracao: e.target.value })}
                placeholder="Ex: 120"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Status Ativo */}
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="ativo-chk"
                checked={formData.ativo}
                onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                className="w-4 h-4 text-blue-600 focus:ring-blue-600 border-slate-300 rounded-sm cursor-pointer"
              />
              <label htmlFor="ativo-chk" className="text-xs font-semibold text-slate-600 cursor-pointer select-none">
                Disponível para venda (Ativo)
              </label>
            </div>

            {/* Seção Exclusiva: Calculadora de Tamanho & Medidas para Tapete */}
            {isFormTapete && (
              <div className="sm:col-span-2 bg-gradient-to-br from-blue-50/70 via-white to-blue-50/50 p-4 rounded-2xl border-2 border-blue-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <Ruler className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 font-display">
                        Tamanho do Tapete & Cálculo Automático do Valor
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Informe o tamanho para calcular a área em m² e obter o valor correto em tempo real.
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    Cálculo Inteligente
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Largura (metros)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        value={formData.tapeteLargura}
                        onChange={(e) => {
                          const larg = e.target.value;
                          const l = parseFloat(larg.replace(',', '.')) || 0;
                          const c = parseFloat(formData.tapeteComprimento.replace(',', '.')) || 0;
                          const area = l > 0 && c > 0 ? (l * c).toFixed(2) : formData.tapeteArea;
                          setFormData({
                            ...formData,
                            tapeteLargura: larg,
                            tapeteArea: area
                          });
                        }}
                        placeholder="Ex: 2.00"
                        className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">m</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Comprimento (metros)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        value={formData.tapeteComprimento}
                        onChange={(e) => {
                          const comp = e.target.value;
                          const l = parseFloat(formData.tapeteLargura.replace(',', '.')) || 0;
                          const c = parseFloat(comp.replace(',', '.')) || 0;
                          const area = l > 0 && c > 0 ? (l * c).toFixed(2) : formData.tapeteArea;
                          setFormData({
                            ...formData,
                            tapeteComprimento: comp,
                            tapeteArea: area
                          });
                        }}
                        placeholder="Ex: 2.50"
                        className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">m</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Área Resultante (m²)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.tapeteArea}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            tapeteArea: e.target.value
                          });
                        }}
                        placeholder="Ex: 5.00"
                        className="w-full px-3 py-2 text-xs font-bold text-blue-800 bg-blue-50/70 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-600 font-bold">m²</span>
                    </div>
                  </div>
                </div>

                {/* Exibição do Cálculo em Tempo Real */}
                {(() => {
                  const areaVal = parseFloat(formData.tapeteArea.replace(',', '.')) || 0;
                  const precoM2Val = parseFloat(formData.preco.replace(',', '.')) || 0;
                  const totalCalculado = areaVal * precoM2Val;

                  return (
                    <div className="bg-white p-3.5 rounded-xl border border-blue-200 space-y-2">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Cálculo:</span>
                            <span className="font-mono font-bold text-slate-700">
                              {formData.tapeteLargura}m × {formData.tapeteComprimento}m = {areaVal.toFixed(2)} m²
                            </span>
                            <span className="text-slate-400">×</span>
                            <span className="font-mono text-blue-700 font-bold">
                              {formatCurrency(precoM2Val)}/m²
                            </span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs text-slate-600 font-semibold">Valor Total Calculado:</span>
                            <span className="text-lg font-black text-blue-700 font-display">
                              {formatCurrency(totalCalculado)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const medidasStr = `Dimensões: ${formData.tapeteLargura}m x ${formData.tapeteComprimento}m (${areaVal.toFixed(2)} m²)`;
                              setFormData(prev => ({
                                ...prev,
                                descricao: prev.descricao ? `${prev.descricao}\n${medidasStr}` : medidasStr
                              }));
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                          >
                            + Incluir Medidas na Descrição
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Descrição Comercial</label>
              <textarea
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Insira detalhes comerciais sobre o método, produtos aplicados e garantia..."
                rows={3}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <button
              type="button"
              onClick={() => setIsCrudOpen(false)}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition shadow-xs cursor-pointer"
            >
              Salvar Serviço
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={serviceToDelete !== null}
        onClose={() => setServiceToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Excluir Serviço do Catálogo"
        description={`Tem certeza absoluta que deseja excluir o serviço "${serviceToDelete?.nome}" do catálogo? Ele não aparecerá mais ao lançar novos orçamentos.`}
      />
    </div>
  );
});
