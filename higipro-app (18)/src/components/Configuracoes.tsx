/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  Settings, Building2, MessageSquare, ShieldCheck, Database, 
  Save, Download, Upload, RefreshCw, AlertTriangle, CheckCircle2, 
  Copy, Phone, Mail, MapPin, CreditCard, Sparkles, FileSpreadsheet, Trash2,
  Star, ExternalLink, Cloud, Smartphone, Monitor, Moon, Sun, QrCode, Share2, Check
} from 'lucide-react';
import { DatabaseState, CompanySettings } from '../types';
import { DEFAULT_COMPANY_SETTINGS, clearDatabase, saveDatabase } from '../lib/database';
import { uploadFullDatabaseToCloud, fetchFullDatabaseFromCloud, CURRENT_DEVICE_ID, IS_MOBILE_DEVICE } from '../lib/firebaseSync';
import { Modal, ConfirmDialog } from './UIComponents';

interface ConfiguracoesProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
  onResetSystem?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onSetTheme?: (theme: 'dark' | 'light') => void;
  onOpenLinkCelular?: () => void;
}

type TabType = 'empresa' | 'aparencia' | 'mensagens' | 'garantias' | 'backup' | 'nuvem';

export const Configuracoes = React.memo<ConfiguracoesProps>(({ 
  db, onUpdateDb, onResetSystem,
  theme = 'dark', onToggleTheme, onSetTheme, onOpenLinkCelular
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('empresa');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&format=svg&data=${encodeURIComponent(currentUrl)}`;

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    }
  };

  const handleShareWhatsApp = () => {
    const text = `Acesse o HigiPro Gestão de Estofados no celular:\n${currentUrl}\n\nAbra o link no navegador do seu smartphone para sincronizar orçamentos, ordens de serviço e clientes em tempo real!`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<CompanySettings>(() => {
    return db.companySettings || { ...DEFAULT_COMPANY_SETTINGS };
  });

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updatedDb = {
      ...db,
      companySettings: { ...formData }
    };
    onUpdateDb(updatedDb);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Export full system JSON backup
  const handleExportJSON = () => {
    const backupData = {
      exportedAt: new Date().toISOString(),
      version: '2.0',
      system: 'HigiPro — Gestão de Estofados',
      data: db
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `higipro-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export full unified CSV spreadsheet for Excel
  const handleExportCSV = () => {
    const lines: string[] = [];
    
    // 1. Clientes
    lines.push('\uFEFF=== CLIENTES ===');
    lines.push('ID;Nome;Telefone;E-mail;Cidade;Estado;Origem;Criado Em');
    db.clients.forEach(c => {
      lines.push(`"${c.id}";"${c.nome}";"${c.telefone}";"${c.email}";"${c.cidade}";"${c.estado}";"${c.origem}";"${c.created_at}"`);
    });

    lines.push('');
    // 2. Transações Financeiras
    lines.push('=== TRANSAÇÕES FINANCEIRAS ===');
    lines.push('Data;Tipo;Categoria;Descrição;Valor;Método de Pagamento;Status');
    db.transactions.forEach(t => {
      lines.push(`"${t.data}";"${t.tipo}";"${t.categoria}";"${t.descricao}";"${t.valor.toFixed(2)}";"${t.metodo_pagamento}";"${t.status}"`);
    });

    lines.push('');
    // 3. Ordens de Serviço
    lines.push('=== ORDENS DE SERVIÇO ===');
    lines.push('Número;Cliente;Status;Total;Pago;Data Agendada;Técnico;Endereço');
    db.serviceOrders.forEach(os => {
      lines.push(`"${os.numero}";"${os.client_name}";"${os.status}";"${os.total.toFixed(2)}";"${os.pago.toFixed(2)}";"${os.data_agendada || ''}";"${os.tecnico}";"${os.endereco}"`);
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `higipro-dados-completos-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON backup file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const importedData: DatabaseState = parsed.data || parsed;

        if (!importedData.clients || !Array.isArray(importedData.clients)) {
          throw new Error('Arquivo de backup inválido ou incompatível.');
        }

        onUpdateDb(importedData);
        setImportStatus('success');
        setImportMessage(`Backup restaurado com sucesso! (${importedData.clients.length} clientes, ${importedData.serviceOrders?.length || 0} OS)`);
      } catch (err: any) {
        setImportStatus('error');
        setImportMessage(`Erro ao restaurar arquivo: ${err.message || 'Formato JSON inválido.'}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-[#0b2447] p-5 md:p-6 rounded-2xl border border-slate-100 dark:border-blue-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl">
              <Settings className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white font-display">
              Configurações do Sistema & Empresa
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">
            Personalize os dados da HigiPro, tema claro/escuro, conexão com celular, mensagens e backups.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className={`h-9 px-3 flex items-center gap-2 rounded-xl border text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 ${
                theme === 'dark'
                  ? 'bg-[#071a33] hover:bg-[#103362] text-amber-300 border-amber-400/40 shadow-inner'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Alternar entre tema escuro e claro"
            >
              {theme === 'dark' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tema Escuro</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Tema Claro</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('aparencia')}
            className={`h-9 px-3 flex items-center gap-1.5 rounded-xl border text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 ${
              activeTab === 'aparencia'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
            }`}
            title="Abrir opções de QR Code e conexão com celular"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
            <span>Link Celular</span>
          </button>

          {savedSuccess && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold animate-fade-in">
              <CheckCircle2 className="w-4 h-4" />
              <span>Configurações salvas com sucesso!</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('empresa')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'empresa'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Dados da Empresa & PIX</span>
        </button>

        <button
          onClick={() => setActiveTab('aparencia')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'aparencia'
              ? 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-500/10 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Smartphone className="w-4 h-4 text-emerald-500" />
          <span>Tema & Link Celular</span>
        </button>

        <button
          onClick={() => setActiveTab('mensagens')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'mensagens'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Modelos de WhatsApp</span>
        </button>

        <button
          onClick={() => setActiveTab('garantias')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'garantias'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Termos de Garantia & Pós-Venda</span>
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'backup'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Backup & Gestão de Dados</span>
        </button>

        <button
          onClick={() => setActiveTab('nuvem')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'nuvem'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Cloud className="w-4 h-4 text-emerald-500" />
          <span>Nuvem & Multi-Aparelhos (v3.5)</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: DADOS DA EMPRESA & PIX                                         */}
      {/* ===================================================================== */}
      {activeTab === 'empresa' && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base font-display">Identificação da Empresa</h3>
              <p className="text-xs text-slate-500">Estes dados aparecem no cabeçalho dos Orçamentos, OS e Relatórios impressos.</p>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Alterações</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome Fantasia</label>
              <input
                type="text"
                value={formData.nome_fantasia}
                onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Razão Social</label>
              <input
                type="text"
                value={formData.razao_social}
                onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">CNPJ ou CPF</label>
              <input
                type="text"
                value={formData.cnpj_cpf}
                onChange={(e) => setFormData({ ...formData, cnpj_cpf: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp Comercial</label>
              <input
                type="text"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">E-mail Comercial</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Endereço Comercial Completo</label>
              <input
                type="text"
                value={formData.endereco}
                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cidade / UF</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Cidade"
                  value={formData.cidade}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  className="col-span-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
                />
                <input
                  type="text"
                  placeholder="UF"
                  maxLength={2}
                  value={formData.estado}
                  onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition text-center uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">CEP</label>
              <input
                type="text"
                value={formData.cep}
                onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>Dados para Pagamento PIX & Banco</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Chave PIX</label>
                <select
                  value={formData.tipo_chave_pix}
                  onChange={(e) => setFormData({ ...formData, tipo_chave_pix: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
                >
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                  <option value="Celular">Celular</option>
                  <option value="E-mail">E-mail</option>
                  <option value="Aleatória">Chave Aleatória</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chave PIX Principal</label>
                <input
                  type="text"
                  value={formData.chave_pix}
                  onChange={(e) => setFormData({ ...formData, chave_pix: e.target.value })}
                  placeholder="Ex: higiprocomercial@gmail.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Instituição Financeira / Banco</label>
                <input
                  type="text"
                  value={formData.banco}
                  onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                  placeholder="Ex: Banco Inter / Nubank"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: MODELOS DE MENSAGENS WHATSAPP                                  */}
      {/* ===================================================================== */}
      {activeTab === 'mensagens' && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base font-display">Modelos de Mensagens para WhatsApp</h3>
              <p className="text-xs text-slate-500">Configure as mensagens automáticas disparadas nos botões de WhatsApp.</p>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Modelos</span>
            </button>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-xs text-blue-800">
            <span className="font-bold block mb-1">Tags dinâmicas disponíveis:</span>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono">
              <span className="px-2 py-0.5 bg-white rounded border border-blue-200">{"{cliente}"}</span>
              <span className="px-2 py-0.5 bg-white rounded border border-blue-200">{"{numero_orcamento}"}</span>
              <span className="px-2 py-0.5 bg-white rounded border border-blue-200">{"{total}"}</span>
              <span className="px-2 py-0.5 bg-white rounded border border-blue-200">{"{validade}"}</span>
              <span className="px-2 py-0.5 bg-white rounded border border-blue-200">{"{data}"}</span>
              <span className="px-2 py-0.5 bg-white rounded border border-blue-200">{"{horario}"}</span>
              <span className="px-2 py-0.5 bg-white rounded border border-blue-200">{"{tecnico}"}</span>
              <span className="px-2 py-0.5 bg-white rounded border border-blue-200">{"{servico}"}</span>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-900 rounded border border-amber-300 font-bold">{"{link_google}"}</span>
            </div>
          </div>

          {/* Google Review Link Configuration Highlight */}
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                Link Direto para Avaliação 5 Estrelas no Google Meu Negócio
              </span>
              {formData.link_avaliacao_google && (
                <a
                  href={formData.link_avaliacao_google}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 hover:underline"
                >
                  <span>Testar link</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <p className="text-[11px] text-amber-900/80 leading-relaxed">
              Cole abaixo o link curto da sua ficha do Google (ex: <code>https://g.page/r/.../review</code>). Este link será injetado automaticamente na tag <code>{"{link_google}"}</code> da mensagem de pós-venda.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="url"
                  placeholder="https://g.page/r/higipro/review"
                  value={formData.link_avaliacao_google || ''}
                  onChange={(e) => setFormData({ ...formData, link_avaliacao_google: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-blue-600 shadow-2xs"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-medium whitespace-nowrap">Disparar após:</span>
                  <select
                    value={formData.dias_pos_venda || 2}
                    onChange={(e) => setFormData({ ...formData, dias_pos_venda: Number(e.target.value) })}
                    className="w-full px-2.5 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-blue-600 shadow-2xs"
                  >
                    <option value={1}>1 dia após término</option>
                    <option value={2}>2 dias (Recomendado)</option>
                    <option value={3}>3 dias após término</option>
                    <option value={5}>5 dias após término</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Mensagem de Envio de Orçamento
              </label>
              <textarea
                rows={2}
                value={formData.mensagem_padrao_orcamento}
                onChange={(e) => setFormData({ ...formData, mensagem_padrao_orcamento: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Mensagem de Follow-up de Orçamento (Pré-Venda WhatsApp)
              </label>
              <textarea
                rows={2}
                value={formData.mensagem_follow_up_orcamento || ''}
                onChange={(e) => setFormData({ ...formData, mensagem_follow_up_orcamento: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                3. Mensagem de Confirmação de Agendamento
              </label>
              <textarea
                rows={2}
                value={formData.mensagem_agendamento}
                onChange={(e) => setFormData({ ...formData, mensagem_agendamento: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                4. Mensagem de Pós-Venda e Pesquisa de Satisfação (Google 5★)
              </label>
              <textarea
                rows={2}
                value={formData.mensagem_pos_venda}
                onChange={(e) => setFormData({ ...formData, mensagem_pos_venda: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                5. Mensagem de Recorrência & Manutenção Preventiva Anual (12 Meses)
              </label>
              <textarea
                rows={2}
                value={formData.mensagem_recorrencia}
                onChange={(e) => setFormData({ ...formData, mensagem_recorrencia: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: TERMOS DE GARANTIA & PÓS-VENDA                                 */}
      {/* ===================================================================== */}
      {activeTab === 'garantias' && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base font-display">Termos Técnicos e Certificados</h3>
              <p className="text-xs text-slate-500">Cláusulas de garantia inclusas nas propostas comerciais e recibos.</p>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Termos</span>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Garantia Padrão de Higienização
              </label>
              <textarea
                rows={3}
                value={formData.garantia_padrao_higienizacao}
                onChange={(e) => setFormData({ ...formData, garantia_padrao_higienizacao: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Garantia Padrão de Impermeabilização e Proteção de Tecidos
              </label>
              <textarea
                rows={3}
                value={formData.garantia_padrao_impermeabilizacao}
                onChange={(e) => setFormData({ ...formData, garantia_padrao_impermeabilizacao: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-blue-600 focus:bg-white transition"
              />
            </div>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: BACKUP & GESTÃO DE DADOS                                       */}
      {/* ===================================================================== */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Export & Import Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-base">Exportar Dados & Backup</h4>
                  <p className="text-xs text-slate-500">Salve uma cópia segura de todo o seu banco de dados.</p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={handleExportJSON}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition cursor-pointer shadow-xs"
                >
                  <Database className="w-4 h-4" />
                  <span>Baixar Backup Completo (.JSON)</span>
                </button>

                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-sm transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Exportar Planilha Excel (.CSV)</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-400 text-center">
                Inclui clientes, orçamentos, fotos, OS, faturamento histórico e configurações.
              </p>
            </div>

            {/* Import Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-base">Restaurar Backup</h4>
                  <p className="text-xs text-slate-500">Carregue um arquivo JSON gerado anteriormente.</p>
                </div>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-sm transition cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Selecionar Arquivo de Backup (.JSON)</span>
              </button>

              {importStatus === 'success' && (
                <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{importMessage}</span>
                </div>
              )}

              {importStatus === 'error' && (
                <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{importMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Factory Reset / Wipe Card */}
          <div className="bg-white p-6 rounded-2xl border border-rose-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-rose-700 text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Zona de Perigo: Redefinição de Sistema</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Limpa todos os dados locais e reinicia o banco para o estado original de fábrica.
              </p>
            </div>

            <button
              onClick={() => setIsResetConfirmOpen(true)}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar / Resetar Banco</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: SINCRONIZAÇÃO EM NUVEM (PC & CELULAR MULTI-APARELHOS)          */}
      {/* ===================================================================== */}
      {activeTab === 'nuvem' && (
        <div className="space-y-6 animate-fade-in">
          {/* Main Status Hero */}
          <div className="bg-gradient-to-br from-[#071a33] to-[#0b2447] text-white p-6 sm:p-7 rounded-3xl border border-blue-900 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold font-display text-white">Sincronização em Nuvem Ativa</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950">
                      v3.5 Final
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Os dados do PC e do Celular são sincronizados em tempo real através do Firebase Firestore.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Conectado</span>
                </span>
              </div>
            </div>

            {/* Quick explanation banner */}
            <div className="p-3.5 bg-blue-950/70 border border-blue-800/40 rounded-2xl text-xs text-slate-200 leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong>Como funciona a sincronização entre PC e Celular:</strong> Quando você cria ou altera qualquer informação no PC (como lançamentos no financeiro, agendamentos ou orçamentos), ela é enviada imediatamente para a nuvem. Ao abrir o aplicativo no celular, ele se conecta e carrega os mesmos dados automaticamente, mantendo tudo idêntico nos dois aparelhos.
              </div>
            </div>
          </div>

          {/* Sync Stats Grid */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <span>Resumo de Dados Sincronizados Entre Aparelhos</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <span className="text-[11px] text-slate-500 font-medium block">Clientes (CRM)</span>
                <span className="text-xl font-black text-slate-800">{(db.clients || []).length}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <span className="text-[11px] text-slate-500 font-medium block">Orçamentos</span>
                <span className="text-xl font-black text-amber-600">{(db.quotes || []).length}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <span className="text-[11px] text-slate-500 font-medium block">Ordens de Serviço</span>
                <span className="text-xl font-black text-blue-600">{(db.serviceOrders || []).length}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <span className="text-[11px] text-slate-500 font-medium block">Agenda de Visitas</span>
                <span className="text-xl font-black text-emerald-600">{(db.appointments || []).length}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl col-span-2 sm:col-span-1">
                <span className="text-[11px] text-slate-500 font-medium block">Transações Financeiras</span>
                <span className="text-xl font-black text-indigo-600">{(db.transactions || []).length}</span>
              </div>
            </div>
          </div>

          {/* Device & Manual Controls */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-600" />
              <span>Ações de Sincronização Manual</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={async () => {
                  setImportStatus('idle');
                  try {
                    const cloudDb = await fetchFullDatabaseFromCloud(db);
                    if (cloudDb) {
                      onUpdateDb(cloudDb);
                      saveDatabase(cloudDb, true);
                      setImportStatus('success');
                      setImportMessage('Sincronização bidirecional realizada com sucesso! Todos os dados estão atualizados.');
                    } else {
                      await uploadFullDatabaseToCloud(db);
                      setImportStatus('success');
                      setImportMessage('Dados enviados com sucesso para a nuvem!');
                    }
                  } catch (e: any) {
                    setImportStatus('error');
                    setImportMessage('Erro ao sincronizar: ' + (e?.message || 'Tente novamente.'));
                  }
                  setTimeout(() => setImportStatus('idle'), 5000);
                }}
                className="py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Sincronizar Agora (PC ⟷ Celular)</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    const ok = await uploadFullDatabaseToCloud(db);
                    if (ok) {
                      setImportStatus('success');
                      setImportMessage('Todos os dados locais foram enviados com sucesso para a nuvem.');
                    } else {
                      setImportStatus('error');
                      setImportMessage('Não foi possível gravar na nuvem.');
                    }
                  } catch (e: any) {
                    setImportStatus('error');
                    setImportMessage('Erro: ' + e?.message);
                  }
                  setTimeout(() => setImportStatus('idle'), 5000);
                }}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 border border-slate-200"
              >
                <Upload className="w-4 h-4 text-blue-600" />
                <span>Enviar Deste Aparelho para a Nuvem</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    const cloudDb = await fetchFullDatabaseFromCloud(db);
                    if (cloudDb) {
                      onUpdateDb(cloudDb);
                      saveDatabase(cloudDb, true);
                      setImportStatus('success');
                      setImportMessage('Versão da nuvem aplicada com sucesso neste aparelho.');
                    } else {
                      setImportStatus('error');
                      setImportMessage('Nenhum dado encontrado na nuvem.');
                    }
                  } catch (e: any) {
                    setImportStatus('error');
                    setImportMessage('Erro: ' + e?.message);
                  }
                  setTimeout(() => setImportStatus('idle'), 5000);
                }}
                className="py-3 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 border border-emerald-200"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Baixar Dados Mais Recentes da Nuvem</span>
              </button>
            </div>

            {importStatus === 'success' && (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{importMessage}</span>
              </div>
            )}

            {importStatus === 'error' && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{importMessage}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB: TEMA CLARO / ESCURO & LINK PARA CELULAR                          */}
      {/* ===================================================================== */}
      {activeTab === 'aparencia' && (
        <div className="space-y-6 animate-fade-in">
          {/* Card 1: Tema Claro ou Escuro */}
          <div className="bg-white dark:bg-[#0b2447] p-6 rounded-2xl border border-slate-100 dark:border-blue-900 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-blue-900/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                  {theme === 'dark' ? <Moon className="w-5 h-5 text-amber-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white text-base font-display">
                    Tema Visual (Claro / Escuro)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    Alterne entre o tema escuro oficial e o tema claro. Sua escolha é memorizada automaticamente.
                  </p>
                </div>
              </div>

              {/* Botão de Alternância Rápida */}
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 border ${
                    theme === 'dark'
                      ? 'bg-[#071a33] hover:bg-[#103362] text-amber-300 border-amber-400/50 shadow-inner'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-4 h-4 text-amber-400" />
                      <span>Ativar Tema Claro</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4 text-slate-700" />
                      <span>Ativar Tema Escuro</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Grid dos dois temas visuais com seleção interativa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tema Escuro */}
              <div
                onClick={() => onSetTheme ? onSetTheme('dark') : (theme !== 'dark' && onToggleTheme && onToggleTheme())}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                  theme === 'dark'
                    ? 'bg-[#071a33] border-amber-400 shadow-md text-white ring-2 ring-amber-400/20'
                    : 'bg-slate-900/90 border-slate-700 text-slate-200 hover:border-slate-500'
                }`}
              >
                {theme === 'dark' && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 flex items-center gap-1 shadow-2xs">
                    <CheckCircle2 className="w-3 h-3" />
                    Ativo Agora
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-2">
                  <Moon className="w-5 h-5 text-amber-400" />
                  <h4 className="font-bold text-sm text-white">Tema Escuro Oficial HigiPro</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  Visual noturno premium com fundo azul marinho (#071a33), detalhes em dourado e alto contraste. Reduz o cansaço visual e economiza bateria em smartphones OLED.
                </p>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
                  <span className="w-4 h-4 rounded-full bg-[#071a33] border border-amber-400 inline-block" />
                  <span className="w-4 h-4 rounded-full bg-[#0b2447] inline-block" />
                  <span className="w-4 h-4 rounded-full bg-amber-400 inline-block" />
                  <span className="text-[11px] text-slate-400 font-medium ml-1">Padrão da Marca</span>
                </div>
              </div>

              {/* Tema Claro */}
              <div
                onClick={() => onSetTheme ? onSetTheme('light') : (theme !== 'light' && onToggleTheme && onToggleTheme())}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                  theme === 'light'
                    ? 'bg-blue-50/70 border-blue-600 shadow-md text-slate-900 ring-2 ring-blue-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {theme === 'light' && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white flex items-center gap-1 shadow-2xs">
                    <CheckCircle2 className="w-3 h-3" />
                    Ativo Agora
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-2">
                  <Sun className="w-5 h-5 text-amber-500" />
                  <h4 className="font-bold text-sm text-slate-900">Tema Claro Clean</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  Visual tradicional com fundo claro e tipografia nítida. Excelente para ambientes com luz natural intensa e para visualização prévia de impressões.
                </p>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <span className="w-4 h-4 rounded-full bg-white border border-slate-300 inline-block" />
                  <span className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 inline-block" />
                  <span className="w-4 h-4 rounded-full bg-blue-600 inline-block" />
                  <span className="text-[11px] text-slate-500 font-medium ml-1">Clássico</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Link para o Celular / Conectar Smartphone & QR Code */}
          <div className="bg-white dark:bg-[#0b2447] p-6 rounded-2xl border border-slate-100 dark:border-blue-900 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-blue-900/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                  <Smartphone className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white text-base font-display">
                    Link para Celular / Conectar Smartphone
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    Acesse o HigiPro em qualquer celular (Android ou iPhone) com sincronização em tempo real.
                  </p>
                </div>
              </div>

              {onOpenLinkCelular && (
                <button
                  type="button"
                  onClick={onOpenLinkCelular}
                  className="px-3.5 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 self-start sm:self-auto"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir em Janela Flutuante</span>
                </button>
              )}
            </div>

            {/* Container do QR Code e Ações */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Coluna QR Code */}
              <div className="md:col-span-5 flex flex-col items-center justify-center p-5 bg-slate-50 dark:bg-[#071a33] rounded-2xl border border-slate-200 dark:border-blue-900/60 text-center">
                <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 dark:border-blue-900 shadow-sm inline-block">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code para Celular"
                    className="w-44 h-44 sm:w-48 sm:h-48 rounded-lg object-contain"
                    loading="lazy"
                  />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-3 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-amber-500" />
                  <span>Aponte a câmera do seu celular para escanear</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Não requer download na Google Play ou Apple Store
                </p>
              </div>

              {/* Coluna Link, Compartilhamento e Guia */}
              <div className="md:col-span-7 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Link de Acesso Direto do Celular:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={currentUrl}
                      className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-[#071a33] text-slate-800 dark:text-white border border-slate-300 dark:border-blue-900 rounded-xl font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs active:scale-95"
                    >
                      {linkCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="flex-1 min-w-[200px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Enviar Link para Meu WhatsApp</span>
                  </button>
                </div>

                {/* Guia de Tela Cheia no Smartphone */}
                <div className="p-4 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-2xl space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  <h5 className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Como usar em Tela Cheia no Celular (Sem barra do navegador):</span>
                  </h5>
                  <ul className="space-y-1.5 pl-1 text-[11.5px] leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">📱 iPhone (Safari):</span>
                      <span>Toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta para cima) e escolha <strong>"Adicionar à Tela de Início"</strong>.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-blue-600 dark:text-blue-400">🤖 Android (Chrome):</span>
                      <span>Toque no menu <strong>(⋮ três pontinhos)</strong> no canto superior e selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-amber-600 dark:text-amber-400">⚡ Sincronização em Nuvem:</span>
                      <span>Qualquer orçamento, OS ou cliente salvo no celular é atualizado instantaneamente no computador via Nuvem Firebase.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Reset Dialog */}
      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={() => {
          setIsResetConfirmOpen(false);
          if (onResetSystem) {
            onResetSystem();
          } else {
            const empty = clearDatabase();
            onUpdateDb(empty);
          }
        }}
        title="Restaurar Padrões de Fábrica?"
        description="Tem certeza que deseja apagar todos os clientes, orçamentos e dados salvos no navegador? Certifique-se de ter baixado uma cópia de backup antes."
        confirmText="Sim, Redefinir Tudo"
        cancelText="Cancelar"
      />
    </div>
  );
});
