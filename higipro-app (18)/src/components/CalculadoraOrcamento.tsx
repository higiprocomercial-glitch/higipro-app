/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Calculator, 
  Clock, 
  Fuel, 
  Sparkles, 
  TrendingUp, 
  DollarSign, 
  Percent, 
  CheckCircle2, 
  Copy, 
  FileText, 
  ArrowRight, 
  RotateCcw, 
  ShieldCheck, 
  Car, 
  Package, 
  Info,
  HelpCircle,
  Zap,
  Check,
  ChevronDown,
  ExternalLink,
  Plus,
  Edit2,
  Trash2,
  Search,
  X
} from 'lucide-react';
import { DatabaseState, Service, Product, PageId, ProductCategory, PRODUCT_CATEGORIES } from '../types';
import { formatCurrency } from '../lib/utils';
import { DEFAULT_PRODUCTS, generateId } from '../lib/database';
import { Modal, ConfirmDialog } from './UIComponents';

interface CalculadoraOrcamentoProps {
  db: DatabaseState;
  onUpdateDb: (newDb: DatabaseState) => void;
  setPage?: (page: PageId) => void;
  onApplyToQuote?: (calculatedTotal: number, details: string) => void;
  isEmbedded?: boolean;
}

interface ProductItemCost {
  id: string;
  nome: string;
  custoPorServico: number;
  unidade?: string;
  selected: boolean;
  quantidadeDoses: number;
}

export const CalculadoraOrcamento: React.FC<CalculadoraOrcamentoProps> = ({
  db,
  onUpdateDb,
  setPage,
  onApplyToQuote,
  isEmbedded = false
}) => {
  const companySettings = db.companySettings;
  const smartGoals = companySettings?.smart_goals;
  const savedCalcDefaults = companySettings?.budget_calculator;

  // Valor hora sugerido pela Meta Inteligente se configurada
  const metaValorHora = useMemo(() => {
    if (!smartGoals || !smartGoals.metaFaturamentoMensal || !smartGoals.diasTrabalhadosMes || !smartGoals.horasProdutivasDia) {
      return 85.00; // padrão recomendado do setor
    }
    const totalHoras = smartGoals.diasTrabalhadosMes * smartGoals.horasProdutivasDia;
    return totalHoras > 0 ? Math.round((smartGoals.metaFaturamentoMensal / totalHoras) * 100) / 100 : 85.00;
  }, [smartGoals]);

  // 1. Mão de Obra e Tempo
  const [tempoHoras, setTempoHoras] = useState<number>(2.0); // 2 horas padrão
  const [valorHoraMaoDeObra, setValorHoraMaoDeObra] = useState<number>(
    savedCalcDefaults?.valorHoraMaoDeObra ?? metaValorHora
  );

  // 2. Deslocamento / Combustível
  const [distanciaKm, setDistanciaKm] = useState<number>(15); // 15 km ida e volta
  const [custoKm, setCustoKm] = useState<number>(savedCalcDefaults?.custoKmDeslocamento ?? 1.80);
  const [taxasAdicionaisDeslocamento, setTaxasAdicionaisDeslocamento] = useState<number>(0); // pedágio/estacionamento

  // 3. Produtos Químicos e Insumos
  const availableProducts = useMemo(() => {
    const prods = (db.products && db.products.length > 0) ? db.products : DEFAULT_PRODUCTS;
    return prods.filter(p => p.ativo !== false);
  }, [db.products]);

  const [selectedProductsState, setSelectedProductsState] = useState<Record<string, { selected: boolean; doses: number }>>(() => {
    // Produtos padrão para higienização comum
    const init: Record<string, { selected: boolean; doses: number }> = {};
    availableProducts.forEach(p => {
      const isCommon = p.nome.toLowerCase().includes('flotador') || 
                       p.nome.toLowerCase().includes('tira manchas') ||
                       p.nome.toLowerCase().includes('alvejante');
      init[p.id] = { selected: isCommon, doses: 1 };
    });
    return init;
  });

  const [custoInsumosExtras, setCustoInsumosExtras] = useState<number>(5.00); // luvas, sacos plásticos, flanelas

  // 4. Custos Fixos Rateados e Margens
  const [custoFixoRateado, setCustoFixoRateado] = useState<number>(savedCalcDefaults?.custosFixosRateio ?? 15.00);
  const [margemLucroDesejada, setMargemLucroDesejada] = useState<number>(savedCalcDefaults?.margemLucroPadrao ?? 40); // 40%
  const [impostosTaxasCartao, setImpostosTaxasCartao] = useState<number>(savedCalcDefaults?.impostoTaxasPadrao ?? 6); // 6%

  // Tipo de Estofado / Serviço selecionado (opcional para preenchimento rápido de tempo)
  const [servicoPreset, setServicoPreset] = useState<string>('sofa_retratil_3l');

  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Product Management (Cadastro de Produtos & Insumos Químicos)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');

  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState<ProductCategory>('Detergentes');
  const [productCost, setProductCost] = useState('48.00');
  const [productCostPerService, setProductCostPerService] = useState('5.50');
  const [productUnit, setProductUnit] = useState<string>('Galão 5L');
  const [productYield, setProductYield] = useState<string>('Rende ~20 sofás');
  const [productSupplier, setProductSupplier] = useState<string>('');
  const [productNotes, setProductNotes] = useState<string>('');
  const [productActive, setProductActive] = useState(true);

  const productsList: Product[] = useMemo(() => {
    if (db.products && Array.isArray(db.products) && db.products.length > 0) {
      return db.products;
    }
    return DEFAULT_PRODUCTS;
  }, [db.products]);

  const filteredProducts = useMemo(() => {
    return productsList.filter(p => {
      const q = productSearch.toLowerCase();
      const matchesSearch = !productSearch || 
        p.nome.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q) ||
        (p.fornecedor && p.fornecedor.toLowerCase().includes(q)) ||
        (p.rendimento && p.rendimento.toLowerCase().includes(q));
      const matchesCat = !productCategoryFilter || p.categoria === productCategoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [productsList, productSearch, productCategoryFilter]);

  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setProductName('');
    setProductCategory('Detergentes');
    setProductCost('48.00');
    setProductCostPerService('5.50');
    setProductUnit('Galão 5L');
    setProductYield('Rende ~20 sofás');
    setProductSupplier('');
    setProductNotes('');
    setProductActive(true);
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProductName(prod.nome);
    setProductCategory(prod.categoria as ProductCategory);
    setProductCost(String(prod.preco_custo || 0));
    setProductCostPerService(String(prod.custo_por_servico || 0));
    setProductUnit(prod.unidade || 'Galão 5L');
    setProductYield(prod.rendimento || '');
    setProductSupplier(prod.fornecedor || '');
    setProductNotes(prod.observacoes || '');
    setProductActive(prod.ativo !== false);
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) return;
    const custoNum = parseFloat(String(productCost).replace(',', '.')) || 0;
    const custoServicoNum = parseFloat(String(productCostPerService).replace(',', '.')) || 0;

    let updatedProducts: Product[];
    if (editingProduct) {
      updatedProducts = productsList.map(p => {
        if (p.id === editingProduct.id) {
          return {
            ...p,
            nome: productName.trim(),
            categoria: productCategory,
            preco_custo: custoNum,
            preco_venda: editingProduct.preco_venda,
            custo_por_servico: custoServicoNum,
            unidade: productUnit,
            rendimento: productYield.trim(),
            fornecedor: productSupplier.trim(),
            observacoes: productNotes.trim(),
            ativo: productActive,
          };
        }
        return p;
      });
    } else {
      const newProduct: Product = {
        id: 'prod-' + generateId(),
        nome: productName.trim(),
        categoria: productCategory,
        preco_custo: custoNum,
        custo_por_servico: custoServicoNum,
        unidade: productUnit,
        rendimento: productYield.trim(),
        fornecedor: productSupplier.trim(),
        observacoes: productNotes.trim(),
        ativo: productActive,
        created_at: new Date().toISOString(),
      };
      updatedProducts = [newProduct, ...productsList];
    }

    onUpdateDb({
      ...db,
      products: updatedProducts,
    });

    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleDeleteProduct = (prodId: string) => {
    const updated = productsList.filter(p => p.id !== prodId);
    onUpdateDb({
      ...db,
      products: updated,
    });
    setProductToDelete(null);
  };

  // Manipular presets de serviço
  const handleSelectPreset = (preset: string) => {
    setServicoPreset(preset);
    switch (preset) {
      case 'colchao_casal':
        setTempoHoras(1.2);
        break;
      case 'sofa_2l':
        setTempoHoras(1.5);
        break;
      case 'sofa_retratil_3l':
        setTempoHoras(2.0);
        break;
      case 'sofa_l_grande':
        setTempoHoras(3.0);
        break;
      case 'poltrona':
        setTempoHoras(0.8);
        break;
      case 'impermeabilizacao':
        setTempoHoras(2.5);
        // Ativar resina impermeabilizante
        const resinaProd = availableProducts.find(p => p.nome.toLowerCase().includes('impermeabiliz'));
        if (resinaProd) {
          setSelectedProductsState(prev => ({
            ...prev,
            [resinaProd.id]: { selected: true, doses: 1 }
          }));
        }
        break;
      default:
        break;
    }
  };

  // Cálculo de Custos
  const custoMaoDeObra = useMemo(() => {
    return Math.max(0, tempoHoras * valorHoraMaoDeObra);
  }, [tempoHoras, valorHoraMaoDeObra]);

  const custoDeslocamento = useMemo(() => {
    return Math.max(0, (distanciaKm * custoKm) + taxasAdicionaisDeslocamento);
  }, [distanciaKm, custoKm, taxasAdicionaisDeslocamento]);

  const custoProdutosQuimicos = useMemo(() => {
    let total = 0;
    availableProducts.forEach(p => {
      const state = selectedProductsState[p.id];
      if (state && state.selected) {
        const unitCost = p.custo_por_servico || (p.preco_custo ? p.preco_custo / 15 : 6);
        total += unitCost * (state.doses || 1);
      }
    });
    return total + Math.max(0, custoInsumosExtras);
  }, [availableProducts, selectedProductsState, custoInsumosExtras]);

  // Custo Direto (Mão de Obra + Insumos + Deslocamento)
  const custoOperacionalDireto = useMemo(() => {
    return custoMaoDeObra + custoDeslocamento + custoProdutosQuimicos;
  }, [custoMaoDeObra, custoDeslocamento, custoProdutosQuimicos]);

  // Custo Total com Rateio Fixo (Breakeven / Custo Mínimo Absoluto)
  const custoTotalBreakeven = useMemo(() => {
    return custoOperacionalDireto + Math.max(0, custoFixoRateado);
  }, [custoOperacionalDireto, custoFixoRateado]);

  // Preço Ideal Recomendado: Custo / (1 - (margem + taxas)/100)
  const precoIdealRecomendado = useMemo(() => {
    const somaMargemTaxas = Math.min(85, Math.max(0, margemLucroDesejada + impostosTaxasCartao));
    const divisor = 1 - (somaMargemTaxas / 100);
    if (divisor <= 0) return custoTotalBreakeven * 1.5;
    const valor = custoTotalBreakeven / divisor;
    // Arredondar para o múltiplo de 5 mais próximo para preço comercial limpo (ex: 385, 390)
    return Math.ceil(valor / 5) * 5;
  }, [custoTotalBreakeven, margemLucroDesejada, impostosTaxasCartao]);

  // Preço Promocional À Vista (5% de desconto no Pix)
  const precoAVistaPix = useMemo(() => {
    const comDesconto = precoIdealRecomendado * 0.95;
    return Math.floor(comDesconto / 5) * 5;
  }, [precoIdealRecomendado]);

  // Preço Parcelado no Cartão em até 3x ou 6x
  const precoParcelado3x = useMemo(() => {
    return precoIdealRecomendado / 3;
  }, [precoIdealRecomendado]);

  // Lucro Líquido Real Projetado
  const lucroLiquidoReal = useMemo(() => {
    const impostoEstimado = precoIdealRecomendado * (impostosTaxasCartao / 100);
    return Math.max(0, precoIdealRecomendado - custoTotalBreakeven - impostoEstimado);
  }, [precoIdealRecomendado, custoTotalBreakeven, impostosTaxasCartao]);

  const margemLiquidaRealPercent = useMemo(() => {
    if (precoIdealRecomendado <= 0) return 0;
    return Math.round((lucroLiquidoReal / precoIdealRecomendado) * 100);
  }, [lucroLiquidoReal, precoIdealRecomendado]);

  // Salvar padrões na configuração
  const handleSalvarComoPadrao = () => {
    const updatedSettings = {
      ...(companySettings || ({} as any)),
      budget_calculator: {
        valorHoraMaoDeObra,
        custoKmDeslocamento: custoKm,
        margemLucroPadrao: margemLucroDesejada,
        impostoTaxasPadrao: impostosTaxasCartao,
        custosFixosRateio: custoFixoRateado,
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

  // Copiar proposta formatada para WhatsApp
  const handleCopiarPropostaWhatsApp = () => {
    const texto = `✨ *ORÇAMENTO & PROPOSTA TÉCNICA - HIGIPRO* ✨\n\n` +
      `🛋️ *Serviço:* Higienização Especializada de Estofados\n` +
      `⏱️ *Tempo Estimado:* ~${tempoHoras} horas de atendimento técnico\n` +
      `🧪 *Insumos:* Produtos biodegradáveis homologados e bactericida sanitizante antialérgico\n\n` +
      `💰 *VALOR PROMOCIONAL À VISTA (PIX):* ${formatCurrency(precoAVistaPix)}\n` +
      `💳 *Ou no Cartão de Crédito:* 3x de ${formatCurrency(precoParcelado3x)} (Total: ${formatCurrency(precoIdealRecomendado)})\n\n` +
      `🛡️ *Garantia:* ${companySettings?.garantia_padrao_higienizacao || 'Garantia técnica e satisfação total.'}\n\n` +
      `Deseja confirmar e escolher o melhor dia e horário na nossa agenda? 😊`;

    navigator.clipboard.writeText(texto).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    });
  };

  // Aplicar ao orçamento ou redirecionar para novo orçamento
  const handleGerarOuAplicarOrcamento = () => {
    const resumo = `Cálculo Ideal: ${tempoHoras}h técnico + ${distanciaKm}km deslocamento + insumos homologados.`;
    if (onApplyToQuote) {
      onApplyToQuote(precoIdealRecomendado, resumo);
    } else if (setPage) {
      // Armazena valor temporário para novo orçamento
      try {
        sessionStorage.setItem('higipro_calc_price', String(precoIdealRecomendado));
        sessionStorage.setItem('higipro_calc_notes', resumo);
      } catch {}
      setPage('orcamentos');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header Card */}
      <div className="bg-gradient-to-br from-[#07172c] via-[#0b2447] to-[#12396e] rounded-2xl p-5 md:p-7 text-white shadow-lg border border-blue-900/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold mb-2">
              <Calculator className="w-3.5 h-3.5" />
              <span>Precificação Inteligente & Margem Real</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white font-display">
              Calculadora de Orçamento
            </h1>
            <p className="text-blue-100/80 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
              Descubra o <strong>valor ideal mínimo</strong> para cobrar em cada serviço considerando horas de execução técnica, insumos químicos e deslocamento, garantindo lucro real sem prejuízo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {setPage && (
              <button
                type="button"
                onClick={() => setPage('metas')}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/15 cursor-pointer"
                title="Configurar objetivo mensal de faturamento"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Ver Metas do Mês</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSalvarComoPadrao}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/40'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Padrões Salvos!</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Salvar como Padrão</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Presets Bar */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-blue-200/70 uppercase tracking-wider mr-1">
            Presets Rápidos:
          </span>
          {[
            { id: 'sofa_retratil_3l', label: 'Sofá Retrátil 3L (2h)' },
            { id: 'sofa_2l', label: 'Sofá 2 Lugares (1.5h)' },
            { id: 'sofa_l_grande', label: 'Sofá em L Grande (3h)' },
            { id: 'colchao_casal', label: 'Colchão Casal (1.2h)' },
            { id: 'poltrona', label: 'Poltrona (0.8h)' },
            { id: 'impermeabilizacao', label: 'Impermeabilização (2.5h)' },
          ].map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                servicoPreset === preset.id
                  ? 'bg-blue-500 text-white font-bold shadow-xs'
                  : 'bg-white/5 hover:bg-white/15 text-blue-100/90 border border-white/10'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Inputs vs Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Cost Drivers (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Mão de Obra e Tempo */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">1. Mão de Obra & Tempo de Execução</h2>
                  <p className="text-[11px] text-slate-500">Horas técnicas necessárias para execução do serviço</p>
                </div>
              </div>
              <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                Subtotal: {formatCurrency(custoMaoDeObra)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tempo Estimado (Horas)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.5"
                    max="6.0"
                    step="0.5"
                    value={tempoHoras}
                    onChange={(e) => setTempoHoras(parseFloat(e.target.value))}
                    className="flex-1 accent-blue-600"
                  />
                  <div className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold text-sm bg-slate-50 text-slate-800">
                    {tempoHoras}h
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Ex: 1h30 = 1.5 | 2h = 2.0</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Valor/Hora Técnico (R$)
                  </label>
                  {smartGoals?.metaFaturamentoMensal && (
                    <button
                      type="button"
                      onClick={() => setValorHoraMaoDeObra(metaValorHora)}
                      className="text-[10px] text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      title="Usar valor/hora calculado pela Meta do Mês"
                    >
                      <Zap className="w-2.5 h-2.5 text-amber-500" />
                      <span>Meta: {formatCurrency(metaValorHora)}/h</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    step="5"
                    value={valorHoraMaoDeObra}
                    onChange={(e) => setValorHoraMaoDeObra(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                    placeholder="85.00"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Sua remuneração por hora trabalhada em campo</p>
              </div>
            </div>
          </div>

          {/* 2. Insumos Químicos e Produtos */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">2. Produtos Químicos & Insumos</h2>
                  <p className="text-[11px] text-slate-500">Detergentes, tira manchas, alvejante e protetores</p>
                </div>
              </div>
              <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                Subtotal: {formatCurrency(custoProdutosQuimicos)}
              </span>
            </div>

            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto pr-1">
              {availableProducts.map(prod => {
                const isSelected = selectedProductsState[prod.id]?.selected ?? false;
                const doses = selectedProductsState[prod.id]?.doses ?? 1;
                const unitCost = prod.custo_por_servico || (prod.preco_custo ? prod.preco_custo / 15 : 6);

                return (
                  <div
                    key={prod.id}
                    onClick={() => {
                      setSelectedProductsState(prev => ({
                        ...prev,
                        [prod.id]: { selected: !isSelected, doses: isSelected ? 1 : doses }
                      }));
                    }}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                      isSelected
                        ? 'border-emerald-300 bg-emerald-50/60 text-slate-900'
                        : 'border-slate-100 hover:border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition ${
                        isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{prod.nome}</p>
                        <p className="text-[10px] text-slate-400">
                          {prod.categoria} • Custo unitário: {formatCurrency(unitCost)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      {isSelected && (
                        <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                          <span className="text-[10px] text-slate-400 font-semibold">Doses:</span>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={doses}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setSelectedProductsState(prev => ({
                                ...prev,
                                [prod.id]: { selected: true, doses: val }
                              }));
                            }}
                            className="w-8 text-center text-xs font-bold text-slate-800 outline-none"
                          />
                        </div>
                      )}
                      <span className="text-xs font-extrabold text-slate-800">
                        {formatCurrency(unitCost * (isSelected ? doses : 1))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
              <label className="text-xs font-bold text-slate-700">
                Insumos descartáveis extras (luvas, sacos, flanelas):
              </label>
              <div className="relative w-28">
                <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-bold">R$</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={custoInsumosExtras}
                  onChange={(e) => setCustoInsumosExtras(parseFloat(e.target.value) || 0)}
                  className="w-full pl-7 pr-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-right text-slate-800 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. Deslocamento e Logística */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Car className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">3. Deslocamento & Logística</h2>
                  <p className="text-[11px] text-slate-500">Combustível, desgaste do veículo e pedágios</p>
                </div>
              </div>
              <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md">
                Subtotal: {formatCurrency(custoDeslocamento)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Distância Total (Ida + Volta)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="300"
                    step="1"
                    value={distanciaKm}
                    onChange={(e) => setDistanciaKm(parseFloat(e.target.value) || 0)}
                    className="w-full pr-8 pl-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
                    placeholder="15"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">km</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custo por km rodado
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                  <input
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.1"
                    value={custoKm}
                    onChange={(e) => setCustoKm(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
                    placeholder="1.80"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Gasolina + manutenção</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Taxas / Pedágio / Estac.
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    value={taxasAdicionaisDeslocamento}
                    onChange={(e) => setTaxasAdicionaisDeslocamento(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Custos Fixos e Margem de Lucro */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">4. Margem de Lucro & Custos Fixos</h2>
                  <p className="text-[11px] text-slate-500">Rateio para cobrir empresa e garantir rentabilidade</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rateio Custos Fixos (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    value={custoFixoRateado}
                    onChange={(e) => setCustoFixoRateado(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Aluguel, luz, marketing</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Margem de Lucro Líquido
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="10"
                    max="80"
                    step="5"
                    value={margemLucroDesejada}
                    onChange={(e) => setMargemLucroDesejada(parseFloat(e.target.value) || 0)}
                    className="w-full pr-8 pl-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Recomendado: 35% a 50%</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Taxas Cartão / Impostos
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="25"
                    step="1"
                    value={impostosTaxasCartao}
                    onChange={(e) => setImpostosTaxasCartao(parseFloat(e.target.value) || 0)}
                    className="w-full pr-8 pl-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Taxa média da máquina</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Result Cards & Pricing Proposals (5 Cols) */}
        <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-6">
          {/* Main Recommended Price Card */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-blue-900/60 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-400 bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-500/30">
                Valor Ideal Mínimo
              </span>
              <span className="text-xs font-bold text-blue-200/80">
                Margem: ~{margemLiquidaRealPercent}%
              </span>
            </div>

            <div className="my-3">
              <p className="text-xs text-blue-200/70 font-medium">Preço Base Recomendado</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl md:text-4xl font-black text-white font-display tracking-tight">
                  {formatCurrency(precoIdealRecomendado)}
                </span>
                <span className="text-xs text-emerald-300 font-semibold">no Cartão em até 3x</span>
              </div>
            </div>

            {/* Promoção À Vista Pix */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 my-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-black text-emerald-300 tracking-wider">
                    ⚡ Oferta à Vista no Pix
                  </span>
                  <p className="text-xl font-black text-emerald-400 mt-0.5">
                    {formatCurrency(precoAVistaPix)}
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-300 bg-emerald-900/40 px-2.5 py-1 rounded-lg">
                  Economia de {formatCurrency(precoIdealRecomendado - precoAVistaPix)}
                </span>
              </div>
            </div>

            {/* Cost Breakdown Accordion/List */}
            <div className="pt-3 border-t border-white/10 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Custo Direto Operacional:</span>
                <span className="font-bold text-white">{formatCurrency(custoOperacionalDireto)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Custo Breakeven (Zero a Zero):</span>
                <span className="font-bold text-amber-300">{formatCurrency(custoTotalBreakeven)}</span>
              </div>
              <div className="flex justify-between text-emerald-300 font-bold pt-1 border-t border-white/5">
                <span>Lucro Líquido Real Projetado:</span>
                <span>+{formatCurrency(lucroLiquidoReal)} ({margemLiquidaRealPercent}%)</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={handleGerarOuAplicarOrcamento}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-[0.98]"
              >
                <FileText className="w-4 h-4" />
                <span>{onApplyToQuote ? 'Aplicar este Valor ao Orçamento' : 'Gerar Novo Orçamento com este Valor'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleCopiarPropostaWhatsApp}
                className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition flex items-center justify-center gap-2 border border-white/15 cursor-pointer"
              >
                {copySuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-black">Proposta Copiada para o WhatsApp!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Texto Pronto para WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Breakeven Safety Warning Card */}
          <div className="bg-amber-50/80 rounded-2xl p-4 border border-amber-200 text-amber-900 text-xs">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950">Aviso de Segurança Financeira (Ponto de Equilíbrio)</p>
                <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                  Cobrar abaixo de <strong>{formatCurrency(custoTotalBreakeven)}</strong> significa prejuízo líquido, pois não cobre mão de obra, deslocamento e químicos. Mantenha seu preço em pelo menos <strong>{formatCurrency(precoAVistaPix)}</strong> para garantir saúde financeira!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          CADASTRO DE PRODUTOS & INSUMOS PARA REALIZAÇÃO DOS SERVIÇOS
          ======================================================== */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-7 shadow-xs space-y-6 mt-8">
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-150">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 font-display">
                  Cadastro de Produtos para Realização dos Serviços
                </h3>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                  Sincronizado com a Calculadora
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Cadastre os produtos químicos e insumos utilizados para executar os serviços (detergente, tira manchas, alvejante, impermeabilizante...). Gerencie valores de compra, rendimento e custo operacional por serviço para cálculos automáticos de lucratividade.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenAddProduct}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Produto / Insumo</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Buscar produto (ex: detergente, tira manchas, alvejante, impermeabilizante...)"
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-800 transition"
            />
            {productSearch && (
              <button
                type="button"
                onClick={() => setProductSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setProductCategoryFilter('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                !productCategoryFilter 
                  ? 'bg-blue-600 text-white shadow-2xs' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({productsList.length})
            </button>
            {PRODUCT_CATEGORIES.map(cat => {
              const countInCat = productsList.filter(p => p.categoria === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setProductCategoryFilter(productCategoryFilter === cat ? '' : cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    productCategoryFilter === cat 
                      ? 'bg-blue-600 text-white shadow-2xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat} {countInCat > 0 ? `(${countInCat})` : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Cards & Table */}
        {filteredProducts.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3 sm:px-4">Produto / Insumo Químico</th>
                  <th className="py-2.5 px-3">Categoria</th>
                  <th className="py-2.5 px-3 text-right">Custo de Compra</th>
                  <th className="py-2.5 px-3 text-right">Custo por Serviço</th>
                  <th className="py-2.5 px-3 text-center hidden md:table-cell">Status</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.map((prod) => {
                  const custoCompra = prod.preco_custo || 0;
                  const custoServico = prod.custo_por_servico || 0;

                  let catColor = 'bg-blue-50 text-blue-700 border-blue-200';
                  if (prod.categoria === 'Tira Manchas') catColor = 'bg-amber-50 text-amber-700 border-amber-200';
                  else if (prod.categoria === 'Alvejantes') catColor = 'bg-purple-50 text-purple-700 border-purple-200';
                  else if (prod.categoria === 'Impermeabilizantes') catColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  else if (prod.categoria === 'Sanitizantes & Neutralizadores') catColor = 'bg-cyan-50 text-cyan-700 border-cyan-200';
                  else if (prod.categoria === 'Finalizadores') catColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';

                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 sm:px-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 block truncate">{prod.nome}</span>
                          <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {prod.unidade || 'un'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          {prod.fornecedor && <span>{prod.fornecedor}</span>}
                          {prod.rendimento && <span>• {prod.rendimento}</span>}
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${catColor}`}>
                          {prod.categoria}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(custoCompra)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-bold">
                        {formatCurrency(custoServico)}
                      </td>

                      <td className="py-2.5 px-3 text-center hidden md:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          prod.ativo !== false 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {prod.ativo !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditProduct(prod)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Editar produto e valores"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductToDelete(prod)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Excluir produto"
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
        ) : (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
            Nenhum produto encontrado com os filtros selecionados.{' '}
            <button
              type="button"
              onClick={handleOpenAddProduct}
              className="font-bold text-blue-600 hover:underline cursor-pointer ml-1"
            >
              Cadastrar um novo produto
            </button>
          </div>
        )}
      </div>

      {/* Modal: Cadastrar / Editar Produto */}
      {isProductModalOpen && (
        <Modal
          isOpen={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          title={editingProduct ? "Editar Produto / Insumo Químico" : "Cadastrar Novo Produto ou Insumo"}
        >
          <form onSubmit={handleSaveProduct} className="space-y-4">
            <p className="text-xs text-slate-500">
              Cadastre os produtos químicos e insumos utilizados para executar os serviços (<strong>detergente, tira manchas, alvejante, impermeabilizante...</strong>).
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Produto / Insumo *</label>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Ex: Detergente Flotador Concentrado, Tira Manchas Enzimático..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Categoria do Produto</label>
                <select
                  value={productCategory}
                  onChange={(e) => setProductCategory(e.target.value as ProductCategory)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  {PRODUCT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fornecedor / Marca</label>
                <input
                  type="text"
                  value={productSupplier}
                  onChange={(e) => setProductSupplier(e.target.value)}
                  placeholder="Ex: Spartan, Quimiart, Vonixx, Easytech..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Custo de Compra (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={productCost}
                  onChange={(e) => setProductCost(e.target.value)}
                  placeholder="Ex: 48,00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Custo por Serviço (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={productCostPerService}
                  onChange={(e) => setProductCostPerService(e.target.value)}
                  placeholder="Ex: 5,50"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Embalagem / Unidade</label>
                <select
                  value={productUnit}
                  onChange={(e) => setProductUnit(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  <option value="Galão 5L">Galão 5 Litros (5L)</option>
                  <option value="Frasco 1L">Frasco 1 Litro (1L)</option>
                  <option value="Litro (L)">Litro (L)</option>
                  <option value="Frasco 500ml">Frasco 500ml</option>
                  <option value="Galão 20L">Galão 20 Litros (20L)</option>
                  <option value="Kg">Quilograma (Kg)</option>
                  <option value="un">Unidade (peça)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rendimento Estimado</label>
                <input
                  type="text"
                  value={productYield}
                  onChange={(e) => setProductYield(e.target.value)}
                  placeholder="Ex: Rende ~20 sofás, ou 15 colchões"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Observações Técnicas / Diluição</label>
              <input
                type="text"
                value={productNotes}
                onChange={(e) => setProductNotes(e.target.value)}
                placeholder="Ex: Diluição 1:50 na extratora, neutralizar com enxágue..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Produto Ativo</span>
                <span className="text-[10px] text-slate-400 block">Considerado para cálculos da calculadora</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={productActive}
                  onChange={(e) => setProductActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                {editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Product Confirmation Dialog */}
      {productToDelete && (
        <ConfirmDialog
          isOpen={Boolean(productToDelete)}
          title="Excluir Produto / Insumo"
          description={`Tem certeza que deseja remover "${productToDelete.nome}" da lista de produtos e insumos?`}
          confirmText="Sim, excluir"
          cancelText="Cancelar"
          isDanger
          onConfirm={() => handleDeleteProduct(productToDelete.id)}
          onClose={() => setProductToDelete(null)}
        />
      )}
    </div>
  );
};
