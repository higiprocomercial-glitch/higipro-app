/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Search, MessageSquare, Smartphone, Clipboard, 
  Check, ArrowRight, User, Phone, MapPin, Upload, 
  Sparkles, CheckCircle2, AlertCircle, FileText
} from 'lucide-react';
import { 
  CachedContact, 
  searchStoredContacts, 
  saveContactsBatch,
  subscribeToContactsStorage 
} from '../lib/contactsStorage';
import { parseWhatsAppContactText, parseVCardFileContent } from '../lib/vcard';
import { formatPhone, cleanWhatsAppPhone, stripCountryCode, cn } from '../lib/utils';
import { savePhoneContacts } from '../lib/googleContacts';
import { Client } from '../types';

interface WhatsAppBusinessContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectContact: (contact: {
    nome: string;
    telefone: string;
    endereco?: string;
    cidade?: string;
    origem?: string;
  }) => void;
  title?: string;
  initialTab?: 'device' | 'search' | 'paste' | 'vcf';
  existingClients?: Client[];
}

export const WhatsAppBusinessContactModal: React.FC<WhatsAppBusinessContactModalProps> = ({
  isOpen,
  onClose,
  onSelectContact,
  title = 'Buscar Contatos do WhatsApp Business',
  initialTab = 'search',
  existingClients = [],
}) => {
  const [activeTab, setActiveTab] = useState<'device' | 'search' | 'paste' | 'vcf'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [storageCount, setStorageCount] = useState(0);

  // Paste Tab States
  const [rawText, setRawText] = useState('');
  const [parsedNome, setParsedNome] = useState('');
  const [parsedTelefone, setParsedTelefone] = useState('');
  const [parsedEndereco, setParsedEndereco] = useState('');
  const [parsedCidade, setParsedCidade] = useState('Passo Fundo');

  // VCF Import States
  const [vcfFileName, setVcfFileName] = useState<string | null>(null);
  const [vcfImportCount, setVcfImportCount] = useState<number | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Focus textarea when paste tab is selected
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect Contact Picker API support (Chrome on Android, etc.)
  const isContactPickerSupported = typeof window !== 'undefined' && 
    'contacts' in navigator && 
    typeof (navigator as any).contacts?.select === 'function';

  useEffect(() => {
    if (isOpen) {
      // If Contact Picker is available and initialTab is device, keep it; else fallback to search or paste
      setActiveTab(initialTab);
      setSearchQuery('');
      setDeviceError(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const unsub = subscribeToContactsStorage((count) => {
      setStorageCount(count);
    });
    return unsub;
  }, []);

  // Filtered contacts from fast IndexedDB / memory storage + existing clients
  const filteredContacts = useMemo(() => {
    const stored = searchStoredContacts(searchQuery, 2000);
    const seen = new Set<string>();
    const list: Array<{
      id: string;
      nome: string;
      telefone: string;
      endereco?: string;
      cidade?: string;
      source: string;
    }> = [];

    // 1. Add stored contacts (IndexedDB / memory)
    for (const s of stored) {
      const clean = stripCountryCode(s.cleanPhone || s.telefone);
      const key = clean || s.nome.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          id: s.id,
          nome: s.nome,
          telefone: formatPhone(clean || s.telefone),
          endereco: s.endereco,
          cidade: s.cidade,
          source: s.source,
        });
      }
    }

    // 2. Add existing clients from system database
    if (existingClients && existingClients.length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const qDigits = stripCountryCode(searchQuery);
      for (const client of existingClients) {
        const cleanPhone = stripCountryCode(client.telefone);
        const nameMatch = !q || client.nome.toLowerCase().includes(q);
        const phoneMatch = qDigits && cleanPhone.includes(qDigits);
        const addrMatch = client.endereco && q && client.endereco.toLowerCase().includes(q);

        if (nameMatch || phoneMatch || addrMatch) {
          const key = cleanPhone || client.nome.toLowerCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              id: client.id,
              nome: client.nome,
              telefone: formatPhone(cleanPhone || client.telefone),
              endereco: client.endereco,
              cidade: client.cidade || 'Passo Fundo',
              source: 'cliente',
            });
          }
        }
      }
    }

    return list.slice(0, 2000);
  }, [searchQuery, storageCount, existingClients]);

  // Handle parsing WhatsApp copied text (automatically strips Brazil country code 55)
  const handleRawTextChange = (text: string) => {
    setRawText(text);
    const parsed = parseWhatsAppContactText(text);
    if (parsed.nome) setParsedNome(parsed.nome);
    if (parsed.telefone) {
      const clean = stripCountryCode(parsed.telefone);
      setParsedTelefone(formatPhone(clean || parsed.telefone));
    }
    if (parsed.endereco) setParsedEndereco(parsed.endereco);
    if (parsed.cidade) setParsedCidade(parsed.cidade);
  };

  // Select contact and fill in form
  const handleApplyContact = (contact: {
    nome: string;
    telefone: string;
    endereco?: string;
    cidade?: string;
  }) => {
    const cleanDigits = stripCountryCode(contact.telefone);
    const cleanFormatted = formatPhone(cleanDigits || contact.telefone);

    onSelectContact({
      nome: contact.nome.trim(),
      telefone: cleanFormatted,
      endereco: contact.endereco?.trim() || '',
      cidade: contact.cidade?.trim() || 'Passo Fundo',
      origem: 'WhatsApp',
    });

    // Also ensure this contact is cached in memory for future fast search without 55
    saveContactsBatch([{
      nome: contact.nome.trim(),
      telefone: cleanFormatted,
      endereco: contact.endereco?.trim() || '',
      cidade: contact.cidade?.trim() || 'Passo Fundo',
      source: 'whatsapp',
    }]);

    onClose();
  };

  // Device native contact picker handler
  const handlePickDevice = async () => {
    setDeviceError(null);
    try {
      const nav = navigator as any;
      if (nav.contacts && typeof nav.contacts.select === 'function') {
        const props = ['name', 'tel', 'address'];
        const list = await nav.contacts.select(props, { multiple: false });
        if (list && list.length > 0) {
          const item = list[0];
          const rawName = item.name?.[0] || item.name || '';
          const rawTel = item.tel?.[0] || item.telephone?.[0] || item.tel || '';
          const rawAddress = item.address?.[0]?.addressLine?.[0] || item.address?.[0] || '';
          const rawCity = item.address?.[0]?.city || 'Passo Fundo';

          if (rawName || rawTel) {
            handleApplyContact({
              nome: rawName || 'Cliente WhatsApp',
              telefone: rawTel,
              endereco: rawAddress,
              cidade: rawCity,
            });
            return;
          }
        }
      } else {
        setDeviceError('A seleção direta da agenda do aparelho só está disponível em navegadores mobile (Google Chrome / Edge no Android). Utilize a busca ou cole a conversa.');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setDeviceError('Não foi possível acessar os contatos do aparelho. Você pode buscar pelos contatos salvos ou colar a conversa do WhatsApp.');
      }
    }
  };

  // Handle .VCF File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVcfFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const parsed = parseVCardFileContent(content);
        if (parsed.length > 0) {
          savePhoneContacts(parsed);
          saveContactsBatch(parsed.map(c => ({
            nome: c.nome,
            telefone: c.telefone,
            endereco: c.endereco,
            cidade: c.cidade,
            source: 'whatsapp' as const,
          })));
          setVcfImportCount(parsed.length);
          setActiveTab('search');
        }
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center shrink-0 shadow-inner">
              <MessageSquare className="w-6 h-6 fill-white text-emerald-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  {title}
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-400 text-emerald-950">
                  WhatsApp
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                Puxe da agenda do aparelho, pesquise contatos salvos ou cole o chat.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-3 pt-2 gap-1.5 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={cn(
              "px-3 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'search'
                ? "bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <Search className="w-3.5 h-3.5 text-emerald-600" />
            <span>Pesquisar Salvos</span>
            {filteredContacts.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                {filteredContacts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('paste');
              setTimeout(() => textareaRef.current?.focus(), 50);
            }}
            className={cn(
              "px-3 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'paste'
                ? "bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <Clipboard className="w-3.5 h-3.5 text-emerald-600" />
            <span>Colar Conversa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('device')}
            className={cn(
              "px-3 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'device'
                ? "bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span>Agenda do Aparelho</span>
            {isContactPickerSupported && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vcf')}
            className={cn(
              "px-3 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'vcf'
                ? "bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            <span>Arquivo .VCF</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: SEARCH SAVED CONTACTS */}
          {activeTab === 'search' && (
            <div className="space-y-3.5">
              <div className="relative">
                <Search className="w-4 h-4 text-emerald-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquise por nome, telefone com DDD ou rua..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                  autoFocus
                />
              </div>

              {filteredContacts.length === 0 ? (
                <div className="py-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200/60 p-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-700">
                      {searchQuery ? `Nenhum contato encontrado para "${searchQuery}"` : 'Nenhum contato salvo ainda na memória'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Você pode buscar direto na agenda do seu celular ou colar a mensagem/conversa do WhatsApp com 1 clique.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('paste')}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                      <span>Colar Conversa do WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('device')}
                      className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Puxar da Agenda</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-3 bg-white hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-2xl transition flex items-center justify-between gap-3 shadow-2xs group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200">
                          {contact.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                            <span>{contact.nome}</span>
                            <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-medium">
                              WhatsApp
                            </span>
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                            <span className="font-mono text-slate-700 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-emerald-600" />
                              {formatPhone(contact.telefone)}
                            </span>
                            {contact.endereco && (
                              <span className="truncate max-w-[180px] text-slate-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {contact.endereco}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApplyContact(contact)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer shrink-0 inline-flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Preencher</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PASTE CHAT / CONTACT CARD */}
          {activeTab === 'paste' && (
            <div className="space-y-3.5">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 space-y-1">
                  <p>
                    Copie a conversa ou mensagem do cliente no WhatsApp e cole na caixa abaixo. O identificador extrai automaticamente o <strong>Nome</strong>, <strong>Telefone (sem 55)</strong> e <strong>Endereço</strong>.
                  </p>
                  <p className="text-[11px] text-emerald-700 font-medium">
                    ✓ O prefixo +55 do Brasil é removido automaticamente ao colar ou digitar.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Cole o texto ou conversa do WhatsApp aqui:
                </label>
                <textarea
                  ref={textareaRef}
                  rows={4}
                  value={rawText}
                  onChange={(e) => handleRawTextChange(e.target.value)}
                  placeholder="Ex: Olá, meu nome é Maria Silva, moro na Rua Fagundes dos Reis 1020, meu whats é 54 99988-7766, gostaria de um orçamento para higienizar um sofá retrátil."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono"
                />
              </div>

              {/* Parsed Fields Preview */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <span>✨ Dados Reconhecidos</span>
                  </p>
                  {(parsedNome || parsedTelefone) && (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full">
                      Pronto para preencher
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Nome Completo</label>
                    <input
                      type="text"
                      value={parsedNome}
                      onChange={(e) => setParsedNome(e.target.value)}
                      placeholder="Nome do cliente"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-500">Telefone / WhatsApp</label>
                      <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                        Sem 55
                      </span>
                    </div>
                    <input
                      type="text"
                      value={parsedTelefone}
                      onChange={(e) => setParsedTelefone(formatPhone(stripCountryCode(e.target.value)))}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text');
                        const clean = stripCountryCode(pasted);
                        setParsedTelefone(formatPhone(clean || pasted));
                      }}
                      placeholder="(54) 99999-9999"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Endereço de Atendimento</label>
                    <input
                      type="text"
                      value={parsedEndereco}
                      onChange={(e) => setParsedEndereco(e.target.value)}
                      placeholder="Rua, número, bairro"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Cidade</label>
                    <input
                      type="text"
                      value={parsedCidade}
                      onChange={(e) => setParsedCidade(e.target.value)}
                      placeholder="Passo Fundo"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!parsedNome.trim() && !parsedTelefone.trim()}
                  onClick={() => handleApplyContact({
                    nome: parsedNome,
                    telefone: parsedTelefone,
                    endereco: parsedEndereco,
                    cidade: parsedCidade,
                  })}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Preencher no Formulário de Cadastro</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DEVICE CONTACT PICKER */}
          {activeTab === 'device' && (
            <div className="space-y-4 py-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950">
                    Buscar da Agenda do Aparelho (1 Toque)
                  </h4>
                  <p className="text-xs text-emerald-800/90 mt-1 max-w-sm mx-auto leading-relaxed">
                    No seu celular, os contatos do <strong>WhatsApp Business</strong> ficam sincronizados com a agenda do aparelho. Clique no botão abaixo para abrir sua lista de contatos nativa.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handlePickDevice}
                    className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold rounded-xl shadow-md transition cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Abrir Lista de Contatos do Celular</span>
                  </button>
                </div>
              </div>

              {deviceError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p>{deviceError}</p>
                </div>
              )}

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  💡 Como funciona no celular?
                </p>
                <p className="text-[11px] leading-relaxed">
                  Ao clicar, o navegador abre a tela de seleção segura do telefone. Você escolhe o contato do WhatsApp Business e ele já preenche o nome e telefone imediatamente no orçamento.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: VCF FILE IMPORT */}
          {activeTab === 'vcf' && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-slate-50 border-2 border-dashed border-emerald-300 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Importar Arquivo de Contatos (.vcf)
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Exportou contatos do WhatsApp ou Google Contatos? Suba o arquivo para carregar centenas de clientes na hora.
                  </p>
                </div>

                <div className="pt-2">
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Selecionar Arquivo .VCF</span>
                    <input
                      type="file"
                      accept=".vcf,text/vcard"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {vcfFileName && (
                  <p className="text-xs text-emerald-700 font-medium">
                    Arquivo selecionado: {vcfFileName} ({vcfImportCount} contatos carregados)
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 px-4">
          <span>{filteredContacts.length} contatos disponíveis para busca</span>
        </div>
      </div>
    </div>
  );
};
