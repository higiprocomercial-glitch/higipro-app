/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Printer, MessageSquare, Shield, CheckCircle2, Calendar, 
  Mail, Phone, MapPin, DollarSign, X, Camera, Eye, EyeOff, FileText, Check
} from 'lucide-react';
import { DatabaseState, ServiceOrder, Quote, Client } from '../types';
import { formatCurrency, formatDate, cleanWhatsAppPhone, formatPhone } from '../lib/utils';
import { LogoHigiPro } from './HigiProLogo';

interface ReciboDocumentProps {
  os?: ServiceOrder | null;
  quote?: Quote | null;
  client?: Client | null;
  db: DatabaseState;
  onClose?: () => void;
}

export const ReciboDocument: React.FC<ReciboDocumentProps> = ({ 
  os, 
  quote, 
  client: directClient, 
  db, 
  onClose 
}) => {
  // Resolve client
  const clientId = os?.client_id || quote?.client_id;
  const client = directClient || db.clients.find(c => c.id === clientId);

  // Resolve items
  const quoteItems = React.useMemo(() => {
    if (quote?.itens && Array.isArray(quote.itens) && quote.itens.length > 0) {
      return quote.itens;
    }
    if ((quote as any)?.items && Array.isArray((quote as any).items) && (quote as any).items.length > 0) {
      return (quote as any).items;
    }
    if (quote) {
      const fromDb = db.quoteItems.filter(item => item.quote_id === quote.id || item.quote_id === quote.numero);
      if (fromDb.length > 0) return fromDb;
    }
    if (os?.quote_id) {
      const fromDb = db.quoteItems.filter(item => item.quote_id === os.quote_id);
      if (fromDb.length > 0) return fromDb;
    }
    if (os?.items && Array.isArray(os.items) && os.items.length > 0) {
      return os.items;
    }
    const osServiceDesc = (os as any)?.servicos || (os?.items && os.items[0]?.descricao);
    if (osServiceDesc) {
      return [{
        id: 'recibo-item-' + (os?.id || '1'),
        quote_id: os?.quote_id || os?.id || '1',
        service_id: 'srv-os',
        descricao: osServiceDesc,
        qtd: 1,
        preco_unit: os?.total ?? 0,
        subtotal: os?.total ?? 0,
        unidade: 'un'
      }];
    }
    return [];
  }, [quote, os, db.quoteItems]);

  // Recipient details
  const clientName = client?.nome || os?.client_name || quote?.client_name || 'Cliente';
  const clientPhone = client?.telefone || os?.client_phone || '';
  const clientAddress = client?.endereco || os?.endereco || '';
  const clientCity = client?.cidade || 'Passo Fundo';
  const clientState = client?.estado || 'RS';

  // Amount details
  const totalValue = os ? os.total : (quote?.total || 0);
  const paidValue = os ? (os.pago > 0 ? os.pago : os.total) : totalValue;
  const osNumber = os?.numero || (quote ? `ORC-${quote.numero}` : '001');
  const reciboNumber = `REC-${osNumber.replace(/\D/g, '') || '01'}/${new Date().getFullYear()}`;

  // Default execution date
  const rawDate = os?.data_conclusao || os?.data_agendada || quote?.created_at || new Date().toISOString();
  const executionDate = formatDate(rawDate);
  const todayFormatted = formatDate(new Date().toISOString());

  // Company info state
  const [empresa] = useState({
    nome: 'HigiPro - Gestão De Estofados',
    subtitulo: 'Impermeabilização Premium & Higienização Avançada',
    proprietario: 'LUCIANO DOS SANTOS NEIMAIER',
    cnpj: '48.173.529/0001-33',
    email: 'higiprocomercial@gmail.com',
    telefone: '(54) 99140-0553',
    cidade: 'Passo Fundo - RS',
    slogan: 'Seu conforto e saúde em primeiro lugar!',
  });

  // Payment method selection
  const [metodoPagamento, setMetodoPagamento] = useState<string>('Pix');
  const [documentoCliente, setDocumentoCliente] = useState<string>('');
  const [hideToolbarForPrint, setHideToolbarForPrint] = useState(false);

  // Trigger browser print
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const itemsRows = quoteItems.length > 0 
      ? quoteItems.map((item, idx) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">
            ${String(idx + 1).padStart(2, '0')}. ${item.descricao}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #475569;">
            ${item.qtd} ${(item as any).unidade || 'un'}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #475569;">
            ${formatCurrency(item.preco_unit)}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0f172a;">
            ${formatCurrency(item.subtotal)}
          </td>
        </tr>
      `).join('')
      : `
        <tr>
          <td colspan="4" style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">
            Serviço especializado de higienização e impermeabilização profissional de estofados.
          </td>
        </tr>
      `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Recibo de Serviço - ${reciboNumber} - ${clientName}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 0;
              font-size: 12px;
              line-height: 1.5;
            }
            .recibo-card {
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 24px;
              max-width: 780px;
              margin: 0 auto;
            }
            .header-table { width: 100%; border-bottom: 2px solid #0b2447; padding-bottom: 12px; margin-bottom: 16px; }
            .badge-pago {
              background-color: #dcfce7;
              color: #15803d;
              border: 1px solid #86efac;
              padding: 4px 10px;
              border-radius: 6px;
              font-weight: 800;
              font-size: 11px;
              display: inline-block;
            }
            .title-bar {
              background-color: #0b2447;
              color: white;
              padding: 8px 12px;
              border-radius: 6px;
              font-weight: bold;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin: 16px 0;
            }
            .section-bar {
              background-color: #f1f5f9;
              border-left: 4px solid #0b2447;
              padding: 6px 10px;
              font-weight: bold;
              font-size: 12px;
              margin: 14px 0 8px 0;
            }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            .items-table th { background-color: #f8fafc; padding: 6px 12px; text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; }
            .declaracao-box {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 12px;
              font-size: 12px;
              margin: 16px 0;
              line-height: 1.6;
            }
            .stamp-box {
              border: 2px dashed #16a34a;
              color: #16a34a;
              border-radius: 8px;
              padding: 8px 14px;
              display: inline-block;
              font-weight: 900;
              text-align: center;
              transform: rotate(-3deg);
            }
            .signature-area {
              margin-top: 36px;
              text-align: center;
              border-top: 1px solid #94a3b8;
              width: 320px;
              margin-left: auto;
              margin-right: auto;
              padding-top: 6px;
              font-size: 11px;
            }
          </style>
        </head>
        <body>
          <div class="recibo-card">
            <table class="header-table">
              <tr>
                <td>
                  <h2 style="margin: 0; color: #0b2447; font-size: 18px; font-weight: 900;">${empresa.nome}</h2>
                  <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b; font-weight: 600;">${empresa.subtitulo}</p>
                  <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">CNPJ: ${empresa.cnpj} • ${empresa.proprietario}</p>
                  <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">📞 ${empresa.telefone} • ✉️ ${empresa.email}</p>
                </td>
                <td style="text-align: right; vertical-align: top;">
                  <div style="font-size: 14px; font-weight: 900; color: #0b2447;">${reciboNumber}</div>
                  <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Emissão: ${todayFormatted}</div>
                  <div style="margin-top: 6px;">
                    <span class="badge-pago">✔ PAGO / QUITADO</span>
                  </div>
                </td>
              </tr>
            </table>

            <div class="title-bar">
              RECIBO DE PRESTAÇÃO DE SERVIÇOS
            </div>

            <div class="section-bar">DADOS DO CLIENTE / TOMADOR</div>
            <table style="width: 100%; font-size: 11px; margin-bottom: 12px;">
              <tr>
                <td style="width: 60%;"><strong>Cliente:</strong> ${clientName}</td>
                <td><strong>Telefone:</strong> ${clientPhone ? formatPhone(clientPhone) : 'Não informado'}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top: 4px;"><strong>Endereço:</strong> ${clientAddress ? `${clientAddress}, ${clientCity} - ${clientState}` : `${clientCity} - ${clientState}`}</td>
              </tr>
              ${documentoCliente ? `
              <tr>
                <td colspan="2" style="padding-top: 4px;"><strong>CPF / CNPJ:</strong> ${documentoCliente}</td>
              </tr>` : ''}
            </table>

            <div class="section-bar">SERVIÇOS EXECUTADOS</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 55%;">Descrição do Serviço</th>
                  <th style="text-align: center; width: 10%;">Qtd</th>
                  <th style="text-align: right; width: 15%;">Unitário</th>
                  <th style="text-align: right; width: 20%;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>

            <table style="width: 100%; margin-bottom: 16px;">
              <tr>
                <td style="vertical-align: top; width: 60%;">
                  <div class="stamp-box">
                    ★ QUITADO - HIGIPRO ★<br/>
                    <span style="font-size: 9px; font-weight: normal; color: #15803d;">Forma: ${metodoPagamento} • ${todayFormatted}</span>
                  </div>
                </td>
                <td style="text-align: right; vertical-align: top;">
                  <div style="font-size: 11px; color: #64748b;">Valor Total dos Serviços:</div>
                  <div style="font-size: 20px; font-weight: 900; color: #0b2447; margin: 2px 0;">${formatCurrency(paidValue)}</div>
                  <div style="font-size: 11px; color: #16a34a; font-weight: 700;">Forma de Pagamento: ${metodoPagamento}</div>
                </td>
              </tr>
            </table>

            <div class="declaracao-box">
              <strong>DECLARAÇÃO DE QUITAÇÃO:</strong><br/>
              Declaramos para os devidos fins de direito que recebemos de <strong>${clientName}</strong> a quantia de <strong>${formatCurrency(paidValue)}</strong>, referente à prestação dos serviços especializados descritos acima, dando pelo presente recibo a mais ampla, geral e irrevogável quitação de pagamento pela execução dos mesmos.
            </div>

            <div style="font-size: 10px; color: #64748b; line-height: 1.4; margin-top: 12px; background-color: #f8fafc; padding: 8px; border-radius: 4px;">
              <strong>Garantia e Recomendações HigiPro:</strong><br/>
              • Manter o ambiente arejado e ventilado para acelerar o processo natural de secagem.<br/>
              • Não aplicar produtos químicos ou água sobre o tecido nas primeiras 48 horas.<br/>
              • Para estofados impermeabilizados, líquidos devem ser absorvidos imediatamente com papel toalha sem esfregar.
            </div>

            <div style="margin-top: 30px; text-align: center; font-size: 11px;">
              ${clientCity} - ${clientState}, ${todayFormatted}
            </div>

            <div class="signature-area">
              <strong>${empresa.nome}</strong><br/>
              ${empresa.proprietario} • CNPJ: ${empresa.cnpj}
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 600);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // WhatsApp share
  const handleSendWhatsApp = () => {
    if (!clientPhone) {
      alert('Telefone do cliente não encontrado para envio de WhatsApp.');
      return;
    }
    const cleanPhone = cleanWhatsAppPhone(clientPhone);
    let msg = `Olá, *${clientName}*! Tudo bem?\n\n`;
    msg += `Aqui é da *${empresa.nome}*. Segue abaixo o seu *RECIBO DE SERVIÇO QUITADO*:\n\n`;
    msg += `📄 *Recibo:* ${reciboNumber}\n`;
    msg += `🗓️ *Data do Serviço:* ${executionDate}\n`;
    msg += `💵 *Valor Quitado:* *${formatCurrency(paidValue)}*\n`;
    msg += `💳 *Forma de Pagamento:* ${metodoPagamento}\n\n`;
    msg += `*SERVIÇOS REALIZADOS:*\n`;
    if (quoteItems.length > 0) {
      quoteItems.forEach((item, idx) => {
        msg += `• ${item.descricao} (${item.qtd} ${(item as any).unidade || 'un'}) - ${formatCurrency(item.subtotal)}\n`;
      });
    } else {
      msg += `• Higienização e Impermeabilização Especializada de Estofados\n`;
    }
    msg += `\n✅ *Status:* QUITADO E CONCLUÍDO COM SUCESSO!\n\n`;
    msg += `_Agradecemos imensamente pela confiança em nosso trabalho! Se precisar de algo ou tiver dúvidas sobre os cuidados com seu estofado, estamos sempre à disposição._\n\n`;
    msg += `*${empresa.nome}*\n_${empresa.slogan}_`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto space-y-4">
      {/* Floating Action Bar (Hidden when toggled for clean screenshot) */}
      {!hideToolbarForPrint && (
        <div className="no-print bg-slate-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 border border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold font-display">Recibo de Serviço</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30">
                  {reciboNumber}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400">
                Pronto para print no celular, impressão ou envio via WhatsApp.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle clean print mode */}
            <button
              type="button"
              onClick={() => setHideToolbarForPrint(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl transition flex items-center gap-1.5 border border-amber-500/30 cursor-pointer"
              title="Oculta as barras para você tirar um print limpo da tela"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Modo Print / Foto</span>
            </button>

            {/* WhatsApp */}
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            {/* Print / PDF */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>

            {/* Close */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* When toolbar is hidden for screenshot, show a floating button to restore */}
      {hideToolbarForPrint && (
        <button
          type="button"
          onClick={() => setHideToolbarForPrint(false)}
          className="fixed top-4 right-4 z-50 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-bold rounded-full shadow-2xl border border-slate-700 flex items-center gap-2 cursor-pointer animate-pulse"
        >
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          <span>Voltar Barras de Ação</span>
        </button>
      )}

      {/* Quick Config Row (Metodo de Pagamento & CPF do Cliente) */}
      {!hideToolbarForPrint && (
        <div className="no-print bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Forma de Pagamento:</span>
            <select
              value={metodoPagamento}
              onChange={(e) => setMetodoPagamento(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 text-xs focus:ring-1 focus:ring-blue-600"
            >
              <option value="Pix">Pix</option>
              <option value="Cartão de Crédito">Cartão de Crédito</option>
              <option value="Cartão de Débito">Cartão de Débito</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Transferência Bancária">Transferência Bancária</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="font-semibold text-slate-600 shrink-0">CPF / CNPJ (Opcional):</span>
            <input
              type="text"
              placeholder="Digite o documento se necessário..."
              value={documentoCliente}
              onChange={(e) => setDocumentoCliente(e.target.value)}
              className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs"
            />
          </div>
        </div>
      )}

      {/* ============================================================
          THE ACTUAL RECEIPT DOCUMENT (Clean, printable, screenshot-ready)
          ============================================================ */}
      <div 
        id="higi-recibo-print-area"
        className="bg-white border-2 border-slate-200 rounded-2xl p-5 sm:p-8 shadow-sm text-slate-800 text-xs select-none relative overflow-hidden"
      >
        {/* Subtle Watermark Stamp */}
        <div className="absolute top-24 right-6 sm:right-12 pointer-events-none opacity-85 select-none transform -rotate-12 border-4 border-emerald-600/80 rounded-2xl p-2 sm:p-3 text-center bg-emerald-50/70 shadow-sm">
          <div className="text-emerald-700 font-black text-xs sm:text-sm tracking-widest uppercase">
            ✔ QUITADO & PAGO
          </div>
          <div className="text-emerald-600 text-[9px] font-bold">
            HIGIPRO • {todayFormatted}
          </div>
        </div>

        {/* Company Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-5 border-b-2 border-slate-100">
          <div className="flex gap-3.5 items-start">
            <LogoHigiPro size="md" showText={false} className="w-14 h-16 shrink-0" />
            <div>
              <h1 className="text-base sm:text-lg font-black text-[#0b2447] leading-tight font-display">
                {empresa.nome}
              </h1>
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                {empresa.subtitulo}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                PROPRIETÁRIO: {empresa.proprietario} • CNPJ: {empresa.cnpj}
              </p>
              <p className="text-[10px] text-slate-500 flex items-center gap-2 mt-1 flex-wrap">
                <span>📞 {empresa.telefone}</span>
                <span>•</span>
                <span>✉️ {empresa.email}</span>
                <span>•</span>
                <span>📍 {empresa.cidade}</span>
              </p>
            </div>
          </div>

          <div className="sm:text-right w-full sm:w-auto flex sm:flex-col justify-between items-end">
            <div>
              <span className="text-xs sm:text-sm font-black text-[#0b2447] font-mono block">
                {reciboNumber}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Emissão: {todayFormatted}
              </span>
            </div>
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[10px] font-extrabold">
                <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                PAGO / QUITADO
              </span>
            </div>
          </div>
        </div>

        {/* Document Title Ribbon */}
        <div className="my-4 bg-gradient-to-r from-[#071a33] to-[#0b2447] text-white py-2.5 px-4 rounded-xl flex items-center justify-between border-b-2 border-amber-400 shadow-2xs">
          <span className="font-extrabold text-xs sm:text-sm uppercase tracking-wider font-display">
            Recibo de Prestação de Serviços
          </span>
          <span className="text-amber-300 text-[11px] font-bold">
            Comprovante Oficial de Quitação
          </span>
        </div>

        {/* Client & Service Info Box */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5 text-xs mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Tomador / Cliente:</span>
              <span className="text-sm font-bold text-slate-800 font-display">{clientName}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Contato Telefônico:</span>
              <span className="font-mono font-semibold text-slate-700">
                {clientPhone ? formatPhone(clientPhone) : 'Não informado'}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-200/60 pt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
            <div>
              <span className="font-medium text-slate-400">Endereço do Atendimento:</span>{' '}
              <span className="font-semibold text-slate-700">
                {clientAddress ? `${clientAddress}, ${clientCity} - ${clientState}` : `${clientCity} - ${clientState}`}
              </span>
            </div>
            {documentoCliente && (
              <div>
                <span className="font-medium text-slate-400">CPF / CNPJ:</span>{' '}
                <span className="font-mono font-semibold text-slate-700">{documentoCliente}</span>
              </div>
            )}
            <div>
              <span className="font-medium text-slate-400">Data de Execução do Serviço:</span>{' '}
              <span className="font-bold text-slate-800">{executionDate}</span>
            </div>
          </div>
        </div>

        {/* Services Table */}
        <div className="mb-4">
          <div className="bg-blue-50/80 border-l-4 border-blue-700 px-3 py-1.5 text-blue-950 font-bold text-xs rounded-r-lg mb-2">
            Serviços Realizados
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <th className="px-3 py-2">Item / Descrição</th>
                  <th className="px-3 py-2 text-center">Qtd</th>
                  <th className="px-3 py-2 text-right">Unitário</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {quoteItems.length > 0 ? (
                  quoteItems.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/40">
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {String(idx + 1).padStart(2, '0')}. {item.descricao}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-500">
                        {item.qtd} {(item as any).unidade || 'un'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500 font-mono">
                        {formatCurrency(item.preco_unit)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-800 font-mono">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 font-medium text-slate-700">
                      Higienização e/ou impermeabilização profissional especializada de estofados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Subtotal & Quittance Bar */}
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Forma de Quitação:</span>
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-extrabold text-blue-900 shadow-2xs">
                {metodoPagamento}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase text-slate-500">Total Pago:</span>
              <span className="text-lg sm:text-xl font-black text-[#0b2447] font-display">
                {formatCurrency(paidValue)}
              </span>
            </div>
          </div>
        </div>

        {/* Formal Quittance Declaration Box */}
        <div className="p-3.5 bg-blue-50/40 border border-blue-100 rounded-xl text-xs text-slate-700 leading-relaxed space-y-1 mb-5">
          <p className="font-extrabold text-[#0b2447] text-[11px] uppercase tracking-wide flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Declaração de Quitação Plena
          </p>
          <p className="text-[11px] text-slate-600">
            Declaramos para os devidos fins de direito que recebemos de <strong className="text-slate-900">{clientName}</strong> a quantia total de <strong className="text-slate-900">{formatCurrency(paidValue)}</strong> ({metodoPagamento}), referente à prestação dos serviços especializados descritos neste comprovante, dando por este termo plena, rasa, geral e irrevogável quitação de pagamento.
          </p>
        </div>

        {/* Technical Care & Guarantee Guidelines */}
        <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-500 space-y-1">
          <p className="font-bold text-slate-700">Recomendações e Cuidados Pós-Serviço HigiPro:</p>
          <ul className="list-disc list-inside space-y-0.5 text-slate-500">
            <li>Mantenha o ambiente arejado e com janelas abertas para assegurar uma secagem perfeita.</li>
            <li>Não utilize produtos químicos domésticos ou esponjas abrasivas sobre o tecido.</li>
            <li>Em caso de impermeabilização, líquidos derramados devem ser recolhidos de imediato com papel toalha sem friccionar.</li>
          </ul>
        </div>

        {/* Signature & City Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
          <div className="text-[10px] text-slate-400">
            {clientCity} - {clientState}, {todayFormatted}
          </div>

          <div className="text-center sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0">
            <div className="inline-block border-t border-slate-400 px-6 pt-1 text-center">
              <p className="text-[11px] font-extrabold text-slate-800 uppercase leading-snug">
                {empresa.nome}
              </p>
              <p className="text-[9px] text-slate-400 font-semibold">
                {empresa.proprietario} • CNPJ: {empresa.cnpj}
              </p>
            </div>
          </div>
        </div>

        {/* Screenshot Guide Hint (Hidden during print) */}
        {!hideToolbarForPrint && (
          <div className="no-print mt-4 pt-3 border-t border-dashed border-slate-200 text-center text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <Camera className="w-3 h-3 text-amber-500" />
            <span>Dica: Use o botão <strong>Modo Print / Foto</strong> acima para tirar um print da tela limpo e enviar pelo WhatsApp.</span>
          </div>
        )}
      </div>
    </div>
  );
};
