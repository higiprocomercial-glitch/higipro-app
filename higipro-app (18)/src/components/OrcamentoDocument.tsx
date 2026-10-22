import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, ArrowLeft, Check, Smartphone
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { DatabaseState, Quote, QuoteItem, Client } from '../types';
import { formatCurrency, formatDate } from '../lib/utils';
import { LogoHigiPro } from './HigiProLogo';

interface OrcamentoDocumentProps {
  quote: Quote;
  db: DatabaseState;
  items?: QuoteItem[];
  onClose?: () => void;
  initialFitScreen?: boolean;
  onEmitRecibo?: () => void;
}

export const OrcamentoDocument: React.FC<OrcamentoDocumentProps> = ({ 
  quote, 
  db, 
  items: directItems,
  onClose,
  initialFitScreen = true,
  onEmitRecibo
}) => {
  // Company info defaults
  const [empresa] = useState({
    nome: 'HigiPro-Gestão De Estofados (Impermeabilização Premium & Higienização Avançada)',
    proprietario: 'LUCIANO DOS SANTOS NEIMAIER',
    cnpj: '48.173.529/0001-33',
    email: 'higiprocomercial@gmail.com',
    telefone1: '+55 (54) 99140-0553',
    telefone2: '(54) 99140-0553',
    instagram: '@higipro_pf',
    facebook: 'HigiPro',
    youtube: 'HigiPro',
    slogan: 'Seu conforto e saúde em primeiro lugar!',
    pagamento: 'Dinheiro, cartão de crédito, cartão de débito ou pix.',
  });

  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // References for Auto-Fit scaling to fit exactly 1 screen without scrolling
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  const client = db.clients.find(c => c.id === quote.client_id);

  // Resolves quote items with robust fallbacks so items are never blank
  const items: QuoteItem[] = React.useMemo(() => {
    if (Array.isArray(directItems) && directItems.length > 0) {
      return directItems;
    }
    if (Array.isArray(quote?.itens) && quote.itens.length > 0) {
      return quote.itens;
    }
    if (Array.isArray((quote as any)?.items) && (quote as any).items.length > 0) {
      return (quote as any).items;
    }
    if (Array.isArray(db?.quoteItems)) {
      const fromDb = db.quoteItems.filter(item => 
        item.quote_id === quote.id || 
        (quote.numero && item.quote_id === quote.numero) ||
        (item.quote_id && quote.id && String(item.quote_id).trim() === String(quote.id).trim())
      );
      if (fromDb.length > 0) {
        return fromDb;
      }
    }
    if (Array.isArray(db?.serviceOrders)) {
      const linkedOS = db.serviceOrders.find(os => os.quote_id === quote.id || (quote.numero && os.observacoes?.includes(quote.numero)));
      const osServiceText = (linkedOS as any)?.servicos || (linkedOS?.items && linkedOS.items[0]?.descricao);
      if (osServiceText) {
        return [{
          id: 'item-os-' + (linkedOS?.id || '1'),
          quote_id: quote.id,
          service_id: 'srv-from-os',
          descricao: osServiceText,
          qtd: 1,
          preco_unit: quote.subtotal || quote.total || (linkedOS?.total ?? 0),
          subtotal: quote.subtotal || quote.total || (linkedOS?.total ?? 0),
          unidade: 'un'
        }];
      }
    }
    if (quote?.total && quote.total > 0) {
      const fallbackDesc = quote.observacoes?.trim() || 'Serviço de Higienização e Impermeabilização Especializada';
      return [{
        id: 'item-auto-' + (quote.id || '1'),
        quote_id: quote.id,
        service_id: 'srv-auto',
        descricao: fallbackDesc,
        qtd: 1,
        preco_unit: quote.subtotal || quote.total,
        subtotal: quote.subtotal || quote.total,
        unidade: 'un'
      }];
    }
    return [];
  }, [directItems, quote, db.quoteItems, db.serviceOrders]);

  // Formatted date
  const formattedQuoteDate = quote.created_at ? formatDate(quote.created_at) : formatDate(new Date().toISOString().split('T')[0]);

  // Dynamic Auto-Fit scaling to guarantee 100% single screen fit on any device
  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current || !cardRef.current) return;
      const availH = containerRef.current.clientHeight;
      const availW = containerRef.current.clientWidth;
      const cardH = cardRef.current.scrollHeight;
      const cardW = cardRef.current.scrollWidth;

      if (availH > 40 && cardH > 0 && availW > 40 && cardW > 0) {
        const marginPadding = 12;
        const scaleY = (availH - marginPadding) / cardH;
        const scaleX = (availW - marginPadding) / cardW;
        const s = Math.min(1, Math.min(scaleY, scaleX));
        // Keep between 0.45 and 1
        setFitScale(Math.max(0.45, Math.min(1, s)));
      }
    };

    calculateScale();
    const timer = setTimeout(calculateScale, 60);
    window.addEventListener('resize', calculateScale);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateScale);
    };
  }, [quote.id]);

  // Download directly to iPhone/Android photo gallery or local downloads
  const handleDownloadImage = async () => {
    const targetEl = cardRef.current;
    if (!targetEl) return;
    try {
      setIsDownloadingImage(true);
      const fileName = `Orcamento_${quote.numero}_HigiPro.png`;

      // 1. High resolution PNG (pixelRatio 3 for ultra-crisp text on retina screens)
      const dataUrl = await toPng(targetEl, {
        quality: 1,
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        cacheBust: true,
      });

      // 2. Convert DataURL to Blob and File
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: 'image/png' });

      // 3. iPhone / Android native photo gallery sharing (Web Share API)
      // When files are passed to navigator.share on iOS Safari or Android Chrome,
      // it displays the native share sheet with "Salvar Imagem" (Save to Photos/Gallery).
      let savedViaShare = false;
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Orçamento ${quote.numero} - HigiPro`,
            text: `Proposta de Orçamento HigiPro - ${quote.client_name}`,
          });
          savedViaShare = true;
          setSaveToast('Foto salva / compartilhada com sucesso!');
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            // User cancelled share dialog
            return;
          }
        }
      }

      // 4. Download Fallback: Saves directly into user's files/photos
      if (!savedViaShare) {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setSaveToast('Foto salva na sua galeria / fotos com sucesso!');
      }

      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
      alert('Não foi possível salvar automaticamente. Você pode tirar o print da tela do seu celular (já está ajustado em tela cheia)!');
    } finally {
      setIsDownloadingImage(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-between select-none">
      {/* Toast Feedback */}
      {saveToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[150] bg-emerald-600 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 animate-fade-in border border-emerald-400">
          <Check className="w-4 h-4 text-white" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Top Header: Ultra-clean, with only Voltar and Download to Gallery */}
      <div className="no-print w-full max-w-[560px] mb-2 px-2 flex items-center justify-between gap-2 z-50 shrink-0">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 active:bg-slate-950 text-white text-xs font-bold rounded-xl border border-slate-700/80 transition flex items-center gap-1.5 shadow-md cursor-pointer backdrop-blur-md active:scale-95"
            title="Voltar / Fechar"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            <span>Voltar</span>
          </button>
        )}

        {/* Único botão solicitado: Baixar imagem na galeria do fotos do iPhone ou Android */}
        <button
          type="button"
          onClick={handleDownloadImage}
          disabled={isDownloadingImage}
          className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-lg border border-emerald-400/40 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 ml-auto"
          title="Baixar imagem pronta na galeria de fotos do iPhone ou Android"
        >
          <Download className="w-4 h-4 text-emerald-100" />
          <span>{isDownloadingImage ? 'Salvando na Galeria...' : 'Baixar Imagem na Galeria'}</span>
          <span className="hidden xs:inline-block text-[10px] bg-emerald-700/70 px-1.5 py-0.5 rounded text-emerald-100 font-semibold">
            iPhone / Android
          </span>
        </button>
      </div>

      {/* VIEWPORT WRAPPER: Centers and Auto-fits to screen */}
      <div 
        ref={containerRef}
        className="w-full flex-1 h-[calc(100dvh-75px)] max-h-[100dvh] flex items-center justify-center overflow-hidden p-1"
      >
        <div
          style={{
            transform: `scale(${fitScale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
            width: '560px',
            maxWidth: '100%',
          }}
          className="shrink-0"
        >
          <div
            ref={cardRef}
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 sm:p-4 text-slate-800 text-xs flex flex-col justify-between select-none mx-auto w-full"
          >
            {/* Card Header */}
            <div>
              <div className="flex items-center justify-between gap-3 pb-2.5 mb-1.5 border-b border-slate-150">
                {/* Left: Logo & Company */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-10 rounded-xl bg-blue-950 flex items-center justify-center text-amber-400 font-black shadow-xs shrink-0">
                    <LogoHigiPro size="sm" showText={false} className="w-7 h-8" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight leading-tight truncate">
                      HigiPro - Gestão de Estofados
                    </h2>
                    <p className="text-[9px] font-bold text-blue-900 truncate">
                      CNPJ: {empresa.cnpj} • Tel: {empresa.telefone1}
                    </p>
                    <p className="text-[8.5px] font-medium text-slate-500 truncate">
                      Passo Fundo-RS • Impermeabilização & Higienização
                    </p>
                  </div>
                </div>

                {/* Right: Quote Number & Socials */}
                <div className="text-right shrink-0 bg-slate-50 border border-slate-200/80 rounded-xl p-2 shadow-2xs">
                  <div className="bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded text-[9.5px] inline-block tracking-wider uppercase mb-1">
                    ORÇAMENTO {quote.numero}
                  </div>
                  <div className="text-[8.5px] text-slate-600 space-y-0.5">
                    <p className="font-semibold">Data: {formattedQuoteDate}</p>
                    <p className="text-slate-500 truncate">◎ {empresa.instagram} • f {empresa.facebook}</p>
                  </div>
                </div>
              </div>

              {/* Slogan strip */}
              <div className="bg-blue-50/70 border-l-3 border-amber-500 px-2 py-1 rounded-r text-[9px] font-semibold text-blue-950 flex items-center justify-between my-1.5">
                <span>{empresa.slogan}</span>
                <span className="text-[8px] text-blue-700 font-bold">HigiPro Padrão Ouro</span>
              </div>

              {/* Client info strip */}
              <div className="bg-slate-50/90 border border-slate-150 rounded-xl p-2 mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                <div className="font-bold text-slate-800 truncate">
                  <span>Cliente: </span>
                  <strong className="text-blue-900 font-black">{quote.client_name}</strong>
                </div>
                {client?.telefone && (
                  <span className="text-blue-700 font-bold shrink-0">
                    📞 {client.telefone}
                  </span>
                )}
                {client?.endereco && (
                  <div className="w-full text-slate-500 text-[9px] truncate">
                    📍 {client.endereco}{client.cidade ? ` - ${client.cidade}` : ''}
                  </div>
                )}
              </div>

              {/* Services Table */}
              <div className="border border-slate-150 rounded-xl overflow-hidden mb-1.5 bg-white">
                <div className="bg-[#0b2447] text-white px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider flex justify-between items-center">
                  <span>Descrição dos Serviços</span>
                  <span className="text-amber-300">Valores</span>
                </div>
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-150 text-[9px] font-bold uppercase text-slate-500">
                      <th className="px-2 py-1">Item / Serviço</th>
                      <th className="px-1.5 py-1 text-center">Unid.</th>
                      <th className="px-2 py-1 text-right">Unitário</th>
                      <th className="px-1.5 py-1 text-center">Qtd.</th>
                      <th className="px-2 py-1 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => {
                      const isM2 = (item as any).unidade === 'm²' || item.descricao.toLowerCase().includes('tapete');
                      return (
                        <tr key={item.id || idx} className="hover:bg-slate-50/50">
                          <td className="px-2 py-1 font-bold text-slate-800 text-[10px]">
                            {String(idx + 1).padStart(2, '0')}. {item.descricao}
                          </td>
                          <td className="px-1.5 py-1 text-center text-slate-500 text-[9px] font-semibold">
                            {isM2 ? 'm²' : 'un.'}
                          </td>
                          <td className="px-2 py-1 text-right text-slate-600 text-[9px]">
                            {formatCurrency(item.preco_unit)}
                          </td>
                          <td className="px-1.5 py-1 text-center font-black text-slate-700 text-[10px]">
                            {item.qtd}
                          </td>
                          <td className="px-2 py-1 text-right font-black text-slate-900 text-[10px]">
                            {formatCurrency(item.subtotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Discount / Bonus Strip if applied */}
              {quote.desconto && quote.desconto > 0 ? (
                <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl px-2.5 py-1 mb-1.5 flex items-center justify-between text-[9px] shadow-2xs">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-bold truncate">
                    <span>🎁 Desconto / Bônus Concedido</span>
                    {quote.desconto_motivo && (
                      <span className="text-emerald-700 font-normal truncate">({quote.desconto_motivo})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-slate-400 line-through font-mono text-[8px]">
                      {formatCurrency(quote.subtotal || (quote.total + quote.desconto))}
                    </span>
                    <span className="font-mono font-black text-emerald-700">
                      - {formatCurrency(quote.desconto)}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Solid Navy Total Bar */}
              <div className="bg-gradient-to-r from-[#071a33] to-[#0b2447] text-white px-3 py-1.5 rounded-xl flex justify-between items-center font-extrabold shadow-xs border-l-4 border-amber-400 mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-200">
                  {quote.desconto && quote.desconto > 0 ? 'VALOR TOTAL COM DESCONTO' : 'VALOR TOTAL DO ORÇAMENTO'}
                </span>
                <span className="text-sm sm:text-base text-amber-300 font-black font-display">
                  {formatCurrency(quote.total)}
                </span>
              </div>

              {/* Payment & Guarantees */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-1.5 text-[9px]">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-1.5 leading-snug">
                  <span className="font-bold text-slate-800 block mb-0.5">💳 Meios de Pagamento:</span>
                  <span className="text-slate-600">{empresa.pagamento}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-1.5 leading-snug">
                  <span className="font-bold text-slate-800 block mb-0.5">🛡️ Padrão de Qualidade:</span>
                  <span className="text-slate-600">Produtos atóxicos, não inflamáveis e secagem rápida.</span>
                </div>
              </div>

              {/* Informacoes Adicionais */}
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-2 mb-1.5 text-[9px] text-slate-700 space-y-1">
                <p className="font-black text-blue-950 uppercase tracking-wide text-[9.5px]">Informações Adicionais</p>
                <p className="font-semibold text-slate-800">HigiPro – Excelência em Gestão de Estofados</p>
                <p className="text-slate-600">Escolha o cuidado especializado que seu lar merece. Com nosso padrão Premium, você garante:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[8.5px] text-slate-600 pl-1">
                  <li><strong>Tecnologia Avançada:</strong> higienização profunda com extração e secagem rápida.</li>
                  <li><strong>Segurança Total:</strong> produtos não inflamáveis, atóxicos e hipoalergênicos, indicados para ambientes com crianças e pets.</li>
                  <li><strong>Preservação:</strong> cuidado que ajuda a renovar a aparência e prolongar a vida útil do estofado.</li>
                </ul>
                <p className="font-semibold text-blue-900 pt-0.5">HigiPro: investimento em saúde e satisfação para seu ambiente.</p>
              </div>

              {/* Optional Observations */}
              {quote.observacoes && (
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-lg p-1.5 text-[9px] text-amber-950 mb-1.5 leading-snug">
                  <strong className="font-bold">Observações:</strong> {quote.observacoes}
                </div>
              )}
            </div>

            {/* Closing Thank You Banner */}
            <div>
              <div className="bg-[#0b2447] text-amber-300 text-center py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider mb-1.5 shadow-xs">
                Obrigado pela confiança no nosso serviço • HigiPro - Gestão de Estofados
              </div>
              <div className="pt-1 border-t border-slate-200/80 flex items-center justify-between text-[8px] text-slate-400 font-medium">
                <span>HigiPro • Seu conforto e saúde em primeiro lugar!</span>
                <span className="font-bold text-slate-600 uppercase">Garantia & Excelência</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
