import React, { useState } from 'react';
import { Smartphone, Copy, Check, Share2, QrCode, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Modal } from './UIComponents';

interface LinkCelularModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LinkCelularModal: React.FC<LinkCelularModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&format=svg&data=${encodeURIComponent(currentUrl)}`;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleShareWhatsApp = () => {
    const text = `Acesse o HigiPro Gestão de Estofados no celular:\n${currentUrl}\n\nAbra o link no navegador do seu smartphone para sincronizar orçamentos, ordens de serviço e clientes em tempo real!`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📱 Link para o Celular / Conectar Smartphone"
      size="md"
    >
      <div className="space-y-4">
        {/* Top Banner */}
        <div className="p-3.5 bg-gradient-to-r from-blue-900/40 via-[#0b2447] to-indigo-900/40 border border-blue-500/40 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shrink-0 shadow-xs">
            <Smartphone className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white">
              Acesse em qualquer Celular (Android ou iPhone)
            </h4>
            <p className="text-[11px] text-slate-300">
              Todos os seus dados (clientes, orçamentos e financeiro) sincronizam automaticamente em tempo real!
            </p>
          </div>
        </div>

        {/* QR Code and Quick Action */}
        <div className="bg-slate-50 dark:bg-[#071a33]/80 border border-slate-200 dark:border-blue-900/50 rounded-2xl p-4 text-center space-y-3">
          <div className="flex flex-col items-center justify-center">
            <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 dark:border-blue-900 shadow-sm inline-block">
              <img
                src={qrCodeUrl}
                alt="QR Code para Celular"
                className="w-44 h-44 sm:w-48 sm:h-48 rounded-lg object-contain"
                loading="lazy"
              />
            </div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-2 flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-amber-500" />
              <span>Aponte a câmera do seu celular para escanear</span>
            </p>
          </div>

          {/* URL Box & Copy */}
          <div className="space-y-2 pt-1 text-left">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Link de Acesso Direto:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={currentUrl}
                className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#0b2447] text-slate-800 dark:text-white border border-slate-300 dark:border-blue-900 rounded-xl font-mono select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs active:scale-95 ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* WhatsApp Share Button */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <Share2 className="w-4 h-4" />
            <span>Enviar Link para o meu WhatsApp</span>
          </button>
        </div>

        {/* Fullscreen & Installation Tips */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-2 text-left">
          <h5 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Dica de Ouro: Como usar em Tela Cheia no Celular</span>
          </h5>
          <ul className="text-[11px] text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
            <li>
              <strong className="text-white">No Android (Google Chrome):</strong> Toque nos 3 pontos no canto superior direito e selecione <strong className="text-amber-300">"Instalar aplicativo"</strong> ou <strong className="text-amber-300">"Adicionar à tela inicial"</strong>. O app abrirá como aplicativo nativo em tela 100% cheia.
            </li>
            <li>
              <strong className="text-white">No iPhone (Safari):</strong> Toque no botão Compartilhar (quadrado com seta para cima) e escolha <strong className="text-amber-300">"Adicionar à Tela de Início"</strong>.
            </li>
            <li>
              Você também pode tocar no botão <strong className="text-amber-300">"Tela Cheia"</strong> no topo do app para ocultar as barras de navegação do navegador instantaneamente.
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
