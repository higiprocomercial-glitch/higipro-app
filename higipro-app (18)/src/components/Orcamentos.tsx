/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { 
  Plus, Search, Filter, Eye, Edit2, CheckCircle, CheckCircle2, XCircle, 
  Trash2, MessageSquare, ArrowRight, Trash, DollarSign, Calendar,
  Trello, List, Clock, User, ChevronDown, ChevronLeft, ChevronRight, X, Phone, MapPin, Check, RefreshCw,
  Ruler, Layers, Maximize2, Camera, Receipt, Smartphone, Send, FileText,
  Tag, Percent, Gift, BellRing, Bell, Archive, ArchiveRestore, Clipboard, Sparkles,
  RotateCcw, ArrowLeft, Upload, FileSpreadsheet, Calculator
} from 'lucide-react';
import { DatabaseState, Quote, QuoteItem, QuoteStatus, Client, Service, ClientOrigin, ClientPhoto, ServiceCategory, SofaType, TECNICOS_HIGIPRO } from '../types';
import { 
  formatCurrency, formatDate, generateNumber, formatPhone, cleanWhatsAppPhone, parseDateComponents,
  extractServiceNumber, formatServiceNumber, parseServiceTitle
} from '../lib/utils';
import { generateId, ORIGINS } from '../lib/database';
import { supabaseSaveQuote, supabaseDeleteQuote } from '../lib/supabase';
import { applySeptember2026Quotes } from '../lib/september2026Quotes';
import { Modal, ConfirmDialog, StatusBadge, EmptyState } from './UIComponents';
import { completeServiceAndSyncAll } from '../lib/serviceCompletion';
import { OrcamentoDocument } from './OrcamentoDocument';
import { ReciboDocument } from './ReciboDocument';
import { PhotoUploader } from './PhotoUploader';
import { PeriodFilter } from './PeriodFilter';
import { GoogleContactsModal } from './GoogleContactsModal';
import { WhatsAppBusinessContactModal } from './WhatsAppBusinessContactModal';
import { downloadVCard } from '../lib/vcard';
import { ImportarOrcamentosModal } from './ImportarOrcamentosModal';
import { CalculadoraOrcamento } from './CalculadoraOrcamento';
import { 
  searchAllCachedContacts, 
  getCachedGoogleContacts, 
  getCachedPhoneContacts,
  savePhoneContacts,
  fetchGoogleContacts,
  convertGoogleContactToClient 
} from '../lib/googleContacts';
import { subscribeToContactsStorage } from '../lib/contactsStorage';
import { getAccessToken, DEFAULT_GOOGLE_ACCOUNT } from '../lib/googleAuth';

interface OrcamentosProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
  initialClientId?: string | null;
  onClearInitialClient?: () => void;
  onGoBack?: () => void;
  onCloseTab?: () => void;
  onNavigateToCalculator?: () => void;
}

const normalizeSearchText = (text?: string) => {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

interface ServiceSearchSelectProps {
  value: string;
  services: Service[];
  usageCounts?: Record<string, number>;
  onSelect: (service: Service) => void;
  onRequestCreate: (query: string) => void;
}

const ServiceSearchSelect: React.FC<ServiceSearchSelectProps> = ({
  value,
  services,
  usageCounts,
  onSelect,
  onRequestCreate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('Todos');
  const [sortMode, setSortMode] = useState<'number' | 'frequent'>('number');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedService = (services || []).find(s => s.id === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeServices = useMemo(() => {
    return (services || []).filter(s => s.ativo !== false);
  }, [services]);

  const categories = useMemo(() => {
    return ['Todos', 'Higienização', 'Impermeabilização', 'Sofá', 'Tapete', 'Colchão', 'Poltrona'];
  }, []);

  const filteredServices = useMemo(() => {
    let list = activeServices;
    if (selectedCat !== 'Todos') {
      const normCat = normalizeSearchText(selectedCat);
      list = list.filter(s =>
        normalizeSearchText(s.categoria) === normCat ||
        normalizeSearchText(s.tipo_estofado) === normCat ||
        normalizeSearchText(s.nome).includes(normCat)
      );
    }
    if (search.trim()) {
      const q = normalizeSearchText(search);
      list = list.filter(s =>
        normalizeSearchText(s.nome).includes(q) ||
        normalizeSearchText(s.categoria).includes(q) ||
        normalizeSearchText(s.tipo_estofado).includes(q) ||
        normalizeSearchText(s.descricao).includes(q)
      );
    }

    // Sort strictly by numbering (01 a 22...) or by most frequently quoted items
    return [...list].sort((a, b) => {
      if (sortMode === 'frequent' && usageCounts) {
        const countA = usageCounts[a.id] || 0;
        const countB = usageCounts[b.id] || 0;
        if (countA !== countB) return countB - countA;
      }
      const numA = extractServiceNumber(a.nome);
      const numB = extractServiceNumber(b.nome);
      if (numA !== numB) return numA - numB;
      return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });
  }, [activeServices, search, selectedCat, sortMode, usageCounts]);

  const handleOpen = () => {
    setIsOpen(true);
    setSearch('');
    setSelectedCat('Todos');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const isSelectedTapete = selectedService && (
    selectedService.unidade === 'm²' || 
    selectedService.tipo_estofado === 'Tapete' || 
    selectedService.categoria === 'Tapete'
  );

  const selectedTooltip = selectedService 
    ? `${selectedService.nome} • Categoria: ${selectedService.categoria}${selectedService.tipo_estofado ? ` (${selectedService.tipo_estofado})` : ''} • Preço base: ${formatCurrency(selectedService.preco)}${isSelectedTapete ? '/m²' : ''}${selectedService.descricao ? `\nDescrição: ${selectedService.descricao}` : ''}`
    : 'Clique para buscar ou escolher o serviço...';

  const selectedInfo = selectedService ? parseServiceTitle(selectedService.nome) : null;

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {!isOpen ? (
        <button
          type="button"
          onClick={handleOpen}
          title={selectedTooltip}
          className="w-full min-h-[46px] px-3.5 py-2.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-400 rounded-xl text-left flex items-center justify-between gap-3 transition focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 cursor-pointer shadow-2xs group"
        >
          {selectedService ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                {selectedInfo && (
                  <span className="text-[10px] font-mono font-black px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded shrink-0">
                    #{selectedInfo.numberStr}
                  </span>
                )}
                <span 
                  className="font-bold text-slate-800 text-xs sm:text-sm break-words leading-tight" 
                  title={selectedService.nome}
                >
                  {selectedInfo ? selectedInfo.cleanName : selectedService.nome}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  isSelectedTapete
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {isSelectedTapete ? 'm²' : (selectedService.unidade || 'un')}
                </span>
                <span className="text-[10px] text-slate-400 font-medium shrink-0">
                  ({selectedService.categoria})
                </span>
              </div>
              <span className="text-blue-700 font-mono text-xs font-bold shrink-0 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                {formatCurrency(selectedService.preco)}{isSelectedTapete ? '/m²' : ''}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic flex items-center gap-2 text-xs sm:text-sm">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              Clique para buscar ou escolher o serviço...
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition shrink-0" />
        </button>
      ) : (
        <div className="relative z-50">
          <div className="relative">
            <Search className="w-4 h-4 text-blue-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Digite o número (ex: 01, 19) ou nome do serviço..."
              className="w-full pl-9 pr-8 py-2.5 text-xs sm:text-sm border-2 border-blue-600 bg-white rounded-xl focus:outline-none shadow-lg text-slate-800 font-medium"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsOpen(false);
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort selector bar: Numeração 01-22 vs Mais Orçados */}
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-50 border-x border-b border-slate-200 mt-1 rounded-t-xl text-[11px] flex-wrap">
            <span className="font-bold text-slate-600">Classificação da Lista:</span>
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setSortMode('number')}
                className={`px-2 py-0.5 font-bold rounded-md transition cursor-pointer flex items-center gap-1 text-[10px] ${
                  sortMode === 'number'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Lista por ordem da numeração (01 até o último)"
              >
                <span>🔢 Ordem 01-22</span>
              </button>
              <button
                type="button"
                onClick={() => setSortMode('frequent')}
                className={`px-2 py-0.5 font-bold rounded-md transition cursor-pointer flex items-center gap-1 text-[10px] ${
                  sortMode === 'frequent'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Lista pelos itens que mais são feitos orçamentos"
              >
                <span>🔥 Mais Orçados</span>
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 px-0.5 bg-white border-x border-slate-200 no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCat(cat)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition shrink-0 cursor-pointer ${
                  selectedCat === cat
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Dropdown Results - Spacious and Wide */}
          <div className="absolute left-0 w-full min-w-[320px] sm:min-w-[480px] md:min-w-[560px] max-w-[95vw] mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-80 overflow-y-auto divide-y divide-slate-100 z-[70]">
            <div className="p-2 bg-slate-50 text-[11px] font-semibold text-slate-500 flex justify-between items-center border-b border-slate-100">
              <span>
                {filteredServices.length} serviço(s) {sortMode === 'frequent' ? '• ordenados por mais orçados' : '• ordenados do 01 ao último'}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer px-1.5 py-0.5 hover:bg-slate-200 rounded"
              >
                Fechar [×]
              </button>
            </div>

            {filteredServices.map(service => {
              const isSelected = service.id === value;
              const isTapete = service.unidade === 'm²' || service.tipo_estofado === 'Tapete' || service.categoria === 'Tapete';
              const { numberStr, cleanName } = parseServiceTitle(service.nome);
              const quotesCount = usageCounts?.[service.id] || 0;
              const fullTooltip = `#${numberStr} - ${cleanName} • Categoria: ${service.categoria}${service.tipo_estofado ? ` • Tipo: ${service.tipo_estofado}` : ''} • Preço: ${formatCurrency(service.preco)}${isTapete ? '/m²' : ''}${service.descricao ? `\nDescrição: ${service.descricao}` : ''}`;

              return (
                <div
                  key={service.id}
                  onClick={() => {
                    onSelect(service);
                    setIsOpen(false);
                  }}
                  title={fullTooltip}
                  className={`p-2.5 hover:bg-blue-50/90 transition cursor-pointer flex items-start justify-between gap-3 text-xs sm:text-sm group ${
                    isSelected ? 'bg-blue-50/80 text-blue-900' : 'text-slate-700'
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded shrink-0">
                        #{numberStr}
                      </span>
                      <span 
                        className="font-bold text-slate-900 group-hover:text-blue-700 transition break-words leading-snug"
                        title={service.nome}
                      >
                        {cleanName}
                      </span>
                      {quotesCount > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                          🔥 {quotesCount} {quotesCount === 1 ? 'orçado' : 'orçados'}
                        </span>
                      )}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        isTapete
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {isTapete ? 'm²' : (service.unidade || 'un')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium shrink-0 bg-slate-50 px-1.5 py-0.5 rounded">
                        {service.categoria}
                      </span>
                    </div>
                    {service.descricao && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {service.descricao}
                      </p>
                    )}
                  </div>
                  <div className="font-mono font-bold text-blue-700 text-xs sm:text-sm text-right shrink-0 whitespace-nowrap bg-white px-2 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
                    {formatCurrency(service.preco)}{isTapete ? '/m²' : ''}
                  </div>
                </div>
              );
            })}

            {filteredServices.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500 space-y-1.5">
                <p>Nenhum serviço encontrado para "{search}".</p>
                {selectedCat !== 'Todos' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCat('Todos')}
                    className="text-[11px] text-blue-600 underline font-semibold cursor-pointer"
                  >
                    Ver todas as categorias
                  </button>
                )}
              </div>
            )}

            {/* Quick create option directly in dropdown */}
            <div
              onClick={() => {
                setIsOpen(false);
                onRequestCreate(search);
              }}
              className="p-3 bg-blue-50 hover:bg-blue-100 transition cursor-pointer flex items-center gap-2 text-xs font-bold text-blue-700 border-t border-slate-100"
              title="Cadastrar um novo serviço customizado diretamente no catálogo"
            >
              <Plus className="w-4 h-4 shrink-0 text-blue-600" />
              <span>
                + Cadastrar novo serviço {search.trim() ? `"${search.trim()}"` : ''} no catálogo
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface QuickServiceSearchBarProps {
  services: Service[];
  onSelectService: (service: Service) => void;
  onRequestCreate?: (query: string) => void;
}

const QuickServiceSearchBar: React.FC<QuickServiceSearchBarProps> = ({
  services,
  onSelectService,
  onRequestCreate,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeServices = useMemo(() => {
    return (services || []).filter(s => s.ativo !== false);
  }, [services]);

  const filtered = useMemo(() => {
    if (!query.trim()) return activeServices;
    const q = normalizeSearchText(query);
    return activeServices.filter(s => 
      normalizeSearchText(s.nome).includes(q) ||
      normalizeSearchText(s.categoria || '').includes(q) ||
      normalizeSearchText(s.tipo_estofado || '').includes(q)
    );
  }, [activeServices, query]);

  const handleSelect = (service: Service) => {
    onSelectService(service);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="🔍 Digite para pesquisar serviço no catálogo e adicionar ao orçamento..."
          className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-white border-2 border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 rounded-xl transition shadow-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
          {filtered.length > 0 ? (
            filtered.map(svc => (
              <button
                key={svc.id}
                type="button"
                onClick={() => handleSelect(svc)}
                className="w-full px-3.5 py-2.5 text-left hover:bg-blue-50/80 transition flex items-center justify-between gap-2 cursor-pointer group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs sm:text-sm text-slate-800 group-hover:text-blue-700 truncate">
                      {svc.nome}
                    </span>
                    {svc.categoria && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-800">
                        {svc.categoria}
                      </span>
                    )}
                  </div>
                  {svc.descricao && (
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {svc.descricao}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className="font-mono text-xs sm:text-sm font-bold text-emerald-600">
                    {formatCurrency(svc.preco)}
                  </span>
                  <span className="px-2 py-1 bg-blue-600 group-hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1">
                    <Plus className="w-3 h-3" />
                    <span>Adicionar</span>
                  </span>
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-slate-500 mb-2">Nenhum serviço encontrado para "{query}".</p>
              {onRequestCreate && (
                <button
                  type="button"
                  onClick={() => {
                    onRequestCreate(query);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Cadastrar "{query}" no Catálogo
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface QuoteStatusMenuProps {
  quote: Quote;
  onUpdateStatus: (quote: Quote, newStatus: QuoteStatus, bypassScheduleModal?: boolean) => void;
  onStartApproval: (quote: Quote) => void;
  isCompact?: boolean;
}

const QuoteStatusMenu: React.FC<QuoteStatusMenuProps> = ({
  quote,
  onUpdateStatus,
  onStartApproval,
  isCompact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (status: QuoteStatus, bypassModal: boolean = false) => {
    setIsOpen(false);
    if (status === 'aprovado' && !bypassModal) {
      onStartApproval(quote);
    } else {
      onUpdateStatus(quote, status, bypassModal);
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={menuRef}>
      {/* Clickable Status Badge with Dropdown Trigger */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="group inline-flex items-center gap-1 hover:opacity-90 transition cursor-pointer p-0.5 rounded-lg hover:bg-slate-100"
        title="Clique para mudar o status deste orçamento"
      >
        <StatusBadge type="quote" status={quote.status} />
        <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition shrink-0" />
      </button>

      {/* Direct 1-Click Action Shortcut in Table/Cards */}
      {!isCompact && quote.status === 'rascunho' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSelect('enviado');
          }}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-2 py-1 rounded-lg transition cursor-pointer shadow-2xs whitespace-nowrap"
          title="Marcar que o orçamento já foi enviado ao cliente"
        >
          <Send className="w-3 h-3 text-blue-600" />
          <span>Já enviei</span>
        </button>
      )}

      {!isCompact && (quote.status === 'enviado' || quote.status === 'aprovado') && (
        <div className="flex items-center gap-1">
          {quote.status === 'enviado' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartApproval(quote);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2.5 py-1 rounded-lg transition cursor-pointer shadow-2xs whitespace-nowrap"
              title="Cliente aprovou! Clique para aprovar e agendar o atendimento"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Cliente Aprovou</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSelect('concluido');
            }}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2 py-1 rounded-lg transition cursor-pointer shadow-2xs"
            title="Concluir serviço e registrar receita no financeiro"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Concluir</span>
          </button>

          {quote.status === 'enviado' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect('recusado');
              }}
              className="text-[10px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-transparent hover:border-rose-200 px-1.5 py-1 rounded-lg transition cursor-pointer"
              title="Cliente não aprovou o orçamento"
            >
              Recusou
            </button>
          )}
        </div>
      )}

      {!isCompact && quote.status === 'recusado' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSelect('enviado');
          }}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-0.5 rounded-lg transition cursor-pointer"
          title="Reenviar proposta para renegociação"
        >
          <RefreshCw className="w-2.5 h-2.5 text-slate-500" />
          <span>Reenviar</span>
        </button>
      )}

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 animate-fade-in text-left divide-y divide-slate-100"
        >
          <div className="px-2.5 py-1.5 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Alterar Status</p>
            <p className="text-xs font-bold text-slate-800 truncate">{quote.numero} • {quote.client_name}</p>
          </div>

          <div className="py-1 space-y-0.5">
            {/* Rascunho */}
            <button
              type="button"
              onClick={() => handleSelect('rascunho')}
              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                quote.status === 'rascunho' ? 'bg-slate-100 font-bold text-slate-800' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <div>
                  <p className="font-semibold text-xs text-slate-800">Rascunho</p>
                  <p className="text-[10px] text-slate-400">Em elaboração interna</p>
                </div>
              </div>
              {quote.status === 'rascunho' && <Check className="w-3.5 h-3.5 text-slate-700" />}
            </button>

            {/* Enviado */}
            <button
              type="button"
              onClick={() => handleSelect('enviado')}
              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                quote.status === 'enviado' ? 'bg-blue-50 font-bold text-blue-900' : 'hover:bg-blue-50/60 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Send className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <div>
                  <p className="font-semibold text-xs text-blue-700">Já enviei ao cliente</p>
                  <p className="text-[10px] text-slate-400">Aguardando resposta / aprovação</p>
                </div>
              </div>
              {quote.status === 'enviado' && <Check className="w-3.5 h-3.5 text-blue-600" />}
            </button>

            {/* Aprovado & Agendar */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onStartApproval(quote);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                quote.status === 'aprovado' ? 'bg-emerald-50 font-bold text-emerald-900' : 'hover:bg-emerald-50/80 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-xs text-emerald-700">Cliente Aprovou (Criar O.S.)</p>
                  <p className="text-[10px] text-emerald-600/80">Aprova e abre agendamento técnico</p>
                </div>
              </div>
              {quote.status === 'aprovado' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
            </button>

            {/* Aprovado direto sem agendamento */}
            <button
              type="button"
              onClick={() => handleSelect('aprovado', true)}
              className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer hover:bg-slate-50 text-slate-600"
            >
              <div className="flex items-center gap-2 pl-5">
                <div>
                  <p className="text-xs text-slate-700">Apenas marcar Aprovado</p>
                  <p className="text-[10px] text-slate-400">Sem agendar na agenda agora</p>
                </div>
              </div>
            </button>

            {/* Concluído (Realizado e Pago) */}
            <button
              type="button"
              onClick={() => handleSelect('concluido')}
              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                quote.status === 'concluido' ? 'bg-emerald-100 font-bold text-emerald-950' : 'hover:bg-emerald-50 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-xs text-emerald-800">✅ Concluído (Entra no Financeiro)</p>
                  <p className="text-[10px] text-emerald-600/80">Gera receita quitada e atualiza métricas</p>
                </div>
              </div>
              {quote.status === 'concluido' && <Check className="w-3.5 h-3.5 text-emerald-700" />}
            </button>

            {/* Recusado */}
            <button
              type="button"
              onClick={() => handleSelect('recusado')}
              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                quote.status === 'recusado' ? 'bg-rose-50 font-bold text-rose-900' : 'hover:bg-rose-50/60 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <div>
                  <p className="font-semibold text-xs text-rose-700">Cliente Recusou</p>
                  <p className="text-[10px] text-slate-400">Achou caro ou não respondeu</p>
                </div>
              </div>
              {quote.status === 'recusado' && <Check className="w-3.5 h-3.5 text-rose-600" />}
            </button>

            {/* Expirado */}
            <button
              type="button"
              onClick={() => handleSelect('expirado')}
              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                quote.status === 'expirado' ? 'bg-amber-50 font-bold text-amber-900' : 'hover:bg-amber-50/60 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-semibold text-xs text-amber-700">Expirado</p>
                  <p className="text-[10px] text-slate-400">Passou da data de validade</p>
                </div>
              </div>
              {quote.status === 'expirado' && <Check className="w-3.5 h-3.5 text-amber-600" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const Orcamentos = React.memo<OrcamentosProps>(({ 
  db, onUpdateDb, initialClientId, onClearInitialClient, onGoBack, onCloseTab, onNavigateToCalculator 
}) => {
  const [isCalculatorModalOpen, setIsCalculatorModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [originFilter, setOriginFilter] = useState<string>('');
  const [concludedNotice, setConcludedNotice] = useState<string | null>(null);

  // Month and Year filter for quotes (0-indexed: 9 = Outubro)
  const now = useMemo(() => new Date(), []);
  const currentMonthNum = now.getMonth();
  const currentYearNum = now.getFullYear();
  const monthNames = useMemo(() => [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ], []);
  const currentMonthName = monthNames[currentMonthNum] || 'Atual';
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(currentYearNum);

  // Quick count metrics for period pills
  const periodCounts = useMemo(() => {
    let octCount = 0;
    let sepCount = 0;
    (db?.quotes || []).forEach(q => {
      if (q.created_at) {
        const { year, month } = parseDateComponents(q.created_at);
        if (year === currentYearNum && month === currentMonthNum) octCount++;
        if (year === currentYearNum && month === 8) sepCount++;
      }
    });
    return {
      all: (db?.quotes || []).length,
      current: octCount,
      september: sepCount
    };
  }, [db?.quotes, currentMonthNum, currentYearNum]);

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]);
    (db?.quotes || []).forEach(q => {
      if (q.created_at) {
        const { year } = parseDateComponents(q.created_at);
        if (year && year >= 2020 && year <= 2035) yearsSet.add(year);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [db?.quotes, now]);

  // Pagination for quotes table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Modals state
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [showAllClientsList, setShowAllClientsList] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);
  const [viewTab, setViewTab] = useState<'details' | 'document'>('document');

  // Kanban and Automated Scheduling Approval States
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [isApprovalScheduleOpen, setIsApprovalScheduleOpen] = useState(false);
  const [quoteToApprove, setQuoteToApprove] = useState<Quote | null>(null);
  const [approvalTech, setApprovalTech] = useState<string>(TECNICOS_HIGIPRO[0]);
  const [approvalDateTime, setApprovalDateTime] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 16));
  const [approvalNotes, setApprovalNotes] = useState('');

  // Fullscreen Proposal State (for taking screenshots on mobile/desktop)
  const [isFullscreenProposalOpen, setIsFullscreenProposalOpen] = useState(false);
  const [fullscreenProposalQuote, setFullscreenProposalQuote] = useState<Quote | null>(null);
  const [hideToolbarForQuotePrint, setHideToolbarForQuotePrint] = useState(false);

  // Recibo State
  const [isReciboOpen, setIsReciboOpen] = useState(false);
  const [reciboQuote, setReciboQuote] = useState<Quote | null>(null);

  // Helper to ensure quote has all its items attached
  const resolveQuoteWithItems = (quote: Quote): Quote => {
    const resolvedItems = (quote.itens && quote.itens.length > 0)
      ? quote.itens
      : (quote as any).items && (quote as any).items.length > 0
        ? (quote as any).items
        : (db.quoteItems || []).filter(item => 
            item.quote_id === quote.id || 
            (quote.numero && item.quote_id === quote.numero) ||
            (item.quote_id && quote.id && String(item.quote_id).trim() === String(quote.id).trim())
          );
    return {
      ...quote,
      itens: resolvedItems,
    };
  };

  // Open proposal directly in dedicated Full Screen for print and gallery download
  const handleViewQuote = (quote: Quote) => {
    handleOpenFullscreenProposal(quote);
  };

  // Open proposal in dedicated Full Screen for screenshots
  const handleOpenFullscreenProposal = (quote: Quote) => {
    const fullQuote = resolveQuoteWithItems(quote);
    setSelectedQuote(fullQuote);
    setFullscreenProposalQuote(fullQuote);
    setHideToolbarForQuotePrint(false);
    setIsFullscreenProposalOpen(true);
  };

  // Open receipt for quote
  const handleOpenRecibo = (quote: Quote) => {
    setReciboQuote(quote);
    setIsReciboOpen(true);
  };

  // Form Fields State
  const [clientId, setClientId] = useState('');
  const [validade, setValidade] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [quoteItems, setQuoteItems] = useState<{
    id?: string;
    service_id: string;
    descricao: string;
    qtd: number;
    preco_unit: number;
    unidade?: 'un' | 'm²';
    largura?: number;
    comprimento?: number;
    tamanho_m2?: number;
    showDimensions?: boolean;
  }[]>([]);
  const [quotePhotos, setQuotePhotos] = useState<ClientPhoto[]>([]);

  // Desconto / Bônus State (posicionado logo acima do valor do orçamento)
  const [descontoValor, setDescontoValor] = useState<number | string>('');
  const [tipoDesconto, setTipoDesconto] = useState<'valor' | 'porcentagem'>('valor');
  const [descontoPercentual, setDescontoPercentual] = useState<number | string>('');
  const [descontoMotivo, setDescontoMotivo] = useState('');

  // Real-time calculation of quote subtotal as items are added/updated
  const currentQuoteSubtotal = useMemo(() => {
    return quoteItems.reduce((acc, item) => {
      const q = typeof item.qtd === 'number' ? item.qtd : parseFloat(item.qtd as any);
      const safeQtd = !isNaN(q) && q > 0 ? q : 0;
      const p = typeof item.preco_unit === 'number' ? item.preco_unit : parseFloat(item.preco_unit as any);
      const safePreco = !isNaN(p) && p >= 0 ? p : 0;
      return acc + (safeQtd * safePreco);
    }, 0);
  }, [quoteItems]);

  // Real-time calculated discount value in R$
  const calculatedDiscountValue = useMemo(() => {
    if (tipoDesconto === 'porcentagem') {
      const pct = typeof descontoPercentual === 'number' ? descontoPercentual : parseFloat(descontoPercentual as any);
      if (isNaN(pct) || pct <= 0) return 0;
      return Math.min(currentQuoteSubtotal, (currentQuoteSubtotal * pct) / 100);
    } else {
      const val = typeof descontoValor === 'number' ? descontoValor : parseFloat(descontoValor as any);
      if (isNaN(val) || val <= 0) return 0;
      return Math.min(currentQuoteSubtotal, val);
    }
  }, [tipoDesconto, descontoPercentual, descontoValor, currentQuoteSubtotal]);

  // Real-time final total after discount / bonus
  const currentQuoteTotal = useMemo(() => {
    return Math.max(0, currentQuoteSubtotal - calculatedDiscountValue);
  }, [currentQuoteSubtotal, calculatedDiscountValue]);

  // Current editing quote id (null for create)
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);

  // Status selection within Novo Orçamento / Editar Orçamento
  const [formStatus, setFormStatus] = useState<QuoteStatus>('rascunho');
  const [isFormStatusDropdownOpen, setIsFormStatusDropdownOpen] = useState(false);
  const formStatusDropdownRef = useRef<HTMLDivElement>(null);

  // Estados de Agendamento Automático de Data e Horário (quando o status é 'aprovado')
  const [agendamentoAutomatico, setAgendamentoAutomatico] = useState(true);
  const [agendamentoDataHora, setAgendamentoDataHora] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [agendamentoTecnico, setAgendamentoTecnico] = useState(TECNICOS_HIGIPRO[0] || 'Alexandre');
  const [agendamentoObservacoes, setAgendamentoObservacoes] = useState('');

  // Lembrete no orçamento (ex: cliente pediu orçamento para impermeabilizar porém o sofá só chega daqui a 30 dias)
  const [temLembrete, setTemLembrete] = useState(false);
  const [lembreteData, setLembreteData] = useState('');
  const [lembreteMotivo, setLembreteMotivo] = useState('');

  // Auto-refresh when IndexedDB contacts are updated or synced
  const [contactsStorageVersion, setContactsStorageVersion] = useState(0);

  useEffect(() => {
    return subscribeToContactsStorage(() => {
      setContactsStorageVersion(v => v + 1);
    });
  }, []);
  const [lembreteConcluido, setLembreteConcluido] = useState(false);

  // Filters for Main Quotes List (Archived & Reminders)
  const [showArchived, setShowArchived] = useState(false);
  const [reminderFilter, setReminderFilter] = useState<'all' | 'with_reminder' | 'today_reminder'>('all');

  // Quick reminder modal state (permite adicionar/editar lembrete direto na lista)
  const [quickReminderQuote, setQuickReminderQuote] = useState<Quote | null>(null);
  const [quickReminderData, setQuickReminderData] = useState('');
  const [quickReminderMotivo, setQuickReminderMotivo] = useState('');
  const [quickReminderConcluido, setQuickReminderConcluido] = useState(false);

  // Client search within Novo Orçamento
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Close client and status dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
      if (formStatusDropdownRef.current && !formStatusDropdownRef.current.contains(event.target as Node)) {
        setIsFormStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Trigger auto-open when initialClientId is provided
  useEffect(() => {
    if (initialClientId) {
      setEditingQuoteId(null);
      setClientId(initialClientId);
      setFormStatus('rascunho');
      setIsFormStatusDropdownOpen(false);
      setClientSearchQuery('');
      setIsClientDropdownOpen(false);
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 15);
      setValidade(defaultDate.toISOString().split('T')[0]);
      setObservacoes('');
      setQuoteItems([]);
      setQuotePhotos([]);
      setIsRegisteringClient(false);
      setIsCrudOpen(true);
      onClearInitialClient?.();
    }
  }, [initialClientId]);

  // New Client Creation inline state
  const [isRegisteringClient, setIsRegisteringClient] = useState(false);
  const [newClientNome, setNewClientNome] = useState('');
  const [newClientTelefone, setNewClientTelefone] = useState('');
  const [newClientEndereco, setNewClientEndereco] = useState('');
  const [newClientCidade, setNewClientCidade] = useState('Passo Fundo');
  const [newClientEstado, setNewClientEstado] = useState('RS');
  const [newClientOrigem, setNewClientOrigem] = useState<ClientOrigin>('WhatsApp');
  const [newClientSaveToPhone, setNewClientSaveToPhone] = useState(false);

  // Google & Phone Contacts modal state
  const [isGoogleContactsOpen, setIsGoogleContactsOpen] = useState(false);
  const [contactsModalTab, setContactsModalTab] = useState<'phone_vcf' | 'whatsapp_paste' | 'quick_add' | 'google' | 'export'>('phone_vcf');

  // WhatsApp Business Contacts modal state
  const [isWhatsAppBusinessModalOpen, setIsWhatsAppBusinessModalOpen] = useState(false);
  const [whatsAppModalInitialTab, setWhatsAppModalInitialTab] = useState<'device' | 'search' | 'paste' | 'vcf'>('search');

  // Handle contact applied to new client form
  const handleApplyWhatsAppContactToNewClient = (contact: {
    nome: string;
    telefone: string;
    endereco?: string;
    cidade?: string;
    origem?: string;
  }) => {
    setNewClientNome(contact.nome);
    setNewClientTelefone(formatPhone(contact.telefone));
    if (contact.endereco) setNewClientEndereco(contact.endereco);
    if (contact.cidade) setNewClientCidade(contact.cidade);
    setNewClientOrigem('WhatsApp');
    setIsRegisteringClient(true);
  };

  // Quick 1-touch direct device pick for WhatsApp Business
  const handleQuickPickWhatsAppDevice = async () => {
    const nav = navigator as any;
    if (nav.contacts && typeof nav.contacts.select === 'function') {
      try {
        const props = ['name', 'tel', 'address'];
        const list = await nav.contacts.select(props, { multiple: false });
        if (list && list.length > 0) {
          const item = list[0];
          const rawName = item.name?.[0] || item.name || '';
          const rawTel = item.tel?.[0] || item.telephone?.[0] || item.tel || '';
          const rawAddress = item.address?.[0]?.addressLine?.[0] || item.address?.[0] || '';
          const rawCity = item.address?.[0]?.city || 'Passo Fundo';

          if (rawName || rawTel) {
            handleApplyWhatsAppContactToNewClient({
              nome: rawName,
              telefone: rawTel,
              endereco: rawAddress,
              cidade: rawCity,
            });
            return;
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    // Fallback to modal with device tab or search
    setWhatsAppModalInitialTab('device');
    setIsWhatsAppBusinessModalOpen(true);
  };

  // Quick Service Creation state
  const [isQuickServiceModalOpen, setIsQuickServiceModalOpen] = useState(false);
  const [quickServiceTargetItemIndex, setQuickServiceTargetItemIndex] = useState<number | null>(null);
  const [quickServiceName, setQuickServiceName] = useState('');
  const [quickServiceCategory, setQuickServiceCategory] = useState<ServiceCategory>('Higienização');
  const [quickServiceType, setQuickServiceType] = useState<SofaType>('Sofá');
  const [quickServicePrice, setQuickServicePrice] = useState<number>(150);
  const [quickServiceUnit, setQuickServiceUnit] = useState<'un' | 'm²'>('un');

  // Contact list selection state
  const [showContactPickerFallback, setShowContactPickerFallback] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  // Handle contact selected from Google Contacts modal
  const handleSelectGoogleContact = (client: Client) => {
    setClientId(client.id);
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    setIsRegisteringClient(false);
    setIsGoogleContactsOpen(false);
  };

  // Auto-sync Google Contacts on mount if user is already authenticated
  useEffect(() => {
    getAccessToken().then(tok => {
      if (tok) {
        fetchGoogleContacts(tok).catch(() => {});
      }
    });
  }, []);

  // Handle phone & Google contacts selection: native phone picker or opens unified modal
  const handlePhoneContactsSelect = async () => {
    try {
      const nav = navigator as any;
      if (nav.contacts && typeof nav.contacts.select === 'function') {
        const props = ['name', 'tel', 'email', 'address'];
        const contacts = await nav.contacts.select(props, { multiple: true });
        if (contacts && contacts.length > 0) {
          const parsed = contacts.map((selected: any) => {
            const name = selected.name?.[0] || selected.name || '';
            const tel = selected.tel?.[0] || selected.telephone?.[0] || selected.tel || selected.telephone || '';
            const email = selected.email?.[0] || selected.email || '';
            const address = selected.address?.[0] || selected.address || '';
            return {
              nome: name,
              telefone: tel,
              email: email,
              endereco: address,
            };
          }).filter((c: any) => c.nome || c.telefone);

          if (parsed.length > 0) {
            // Save to cached phone contacts so it's instantly available in autocomplete search
            savePhoneContacts(parsed);
          }

          if (parsed.length === 1) {
            const selected = parsed[0];
            const name = selected.nome;
            const tel = selected.telefone;
            
            if (name || tel) {
              // Check if client exists in db
              const cleanPhone = cleanWhatsAppPhone(tel);
              const existing = db.clients.find(c => 
                (cleanPhone && cleanWhatsAppPhone(c.telefone) === cleanPhone) ||
                (name && (c.nome || '').toLowerCase() === name.toLowerCase())
              );
              if (existing) {
                setClientId(existing.id);
                setClientSearchQuery('');
                setIsClientDropdownOpen(false);
                setIsRegisteringClient(false);
                return;
              }

              // Create new client directly and attach to quote
              const newId = generateId();
              const newClient: Client = {
                id: newId,
                nome: name || 'Cliente Agenda',
                telefone: tel || '',
                email: selected.email || '',
                endereco: selected.endereco || '',
                cidade: 'Passo Fundo',
                estado: 'RS',
                CEP: '',
                observacoes: 'Importado da agenda do aparelho.',
                tags: ['Agenda'],
                origem: 'Indicação',
                created_at: new Date().toISOString().split('T')[0]
              };
              onUpdateDb({
                ...db,
                clients: [newClient, ...db.clients]
              });
              setClientId(newId);
              setClientSearchQuery('');
              setIsClientDropdownOpen(false);
              setIsRegisteringClient(false);
              return;
            }
          } else if (parsed.length > 1) {
            // If multiple contacts imported, open modal to let user pick or inspect
            setIsGoogleContactsOpen(true);
            return;
          }
        }
      }
    } catch (err) {
      console.warn("Contact Picker notice:", err);
    }
    
    // Open unified Phone Agenda & Google Contacts modal
    setIsGoogleContactsOpen(true);
  };

  const handleSaveNewClient = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!newClientNome.trim()) {
      alert('Por favor, informe o nome do cliente.');
      return;
    }
    if (!newClientTelefone.trim()) {
      alert('Por favor, informe o telefone do cliente.');
      return;
    }

    const newId = generateId();
    const newClient: Client = {
      id: newId,
      nome: newClientNome.trim(),
      telefone: newClientTelefone.trim(),
      email: '',
      endereco: newClientEndereco.trim(),
      cidade: newClientCidade.trim(),
      estado: newClientEstado,
      CEP: '',
      observacoes: 'Cadastrado direto pela tela de orçamentos.',
      tags: [newClientOrigem],
      origem: newClientOrigem,
      created_at: new Date().toISOString().split('T')[0]
    };

    onUpdateDb({
      ...db,
      clients: [newClient, ...db.clients]
    });

    if (newClientSaveToPhone) {
      downloadVCard({
        nome: newClient.nome,
        telefone: newClient.telefone,
        endereco: newClient.endereco,
        cidade: newClient.cidade,
        estado: newClient.estado,
        observacoes: 'Cliente HigiPro (Orçamento)',
      });
    }

    setClientId(newId);
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    setIsRegisteringClient(false);
    
    // Reset state fields
    setNewClientNome('');
    setNewClientTelefone('');
    setNewClientEndereco('');
    setNewClientCidade('Passo Fundo');
    setNewClientEstado('RS');
    setNewClientOrigem('WhatsApp');
    setNewClientSaveToPhone(false);
  };

  const handleCancelNewClient = () => {
    setIsRegisteringClient(false);
    setNewClientNome('');
    setNewClientTelefone('');
    setNewClientEndereco('');
    setNewClientCidade('Passo Fundo');
    setNewClientEstado('RS');
    setNewClientOrigem('Google');
  };

  // Helper to normalize strings for accent-insensitive search
  const normalizeText = (text?: string) => 
    (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Selected client object
  const selectedClient = useMemo(() => {
    return db.clients.find(c => c.id === clientId);
  }, [db.clients, clientId]);

  // Matching clients for Novo Orçamento search bar
  const matchingClients = useMemo(() => {
    const query = normalizeText(clientSearchQuery);
    const digitsQuery = (clientSearchQuery || '').replace(/\D/g, '');

    if (!query && !digitsQuery) {
      if (!showAllClientsList) return [];
      // Return top 25 clients sorted alphabetically only when user explicitly toggled showAllClientsList
      return [...(db?.clients || [])]
        .sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' }))
        .slice(0, 25);
    }

    const filtered = (db?.clients || []).filter(c => {
      if (!c) return false;
      const normName = normalizeText(c.nome);
      const rawPhone = String(c.telefone || '');
      const normCity = normalizeText(c.cidade);
      const normAddr = normalizeText(c.endereco);
      const normEmail = normalizeText(c.email);

      const matchesName = normName.includes(query);
      const matchesPhone = digitsQuery ? rawPhone.replace(/\D/g, '').includes(digitsQuery) : false;
      const matchesCity = normCity.includes(query);
      const matchesAddr = normAddr.includes(query);
      const matchesEmail = normEmail.includes(query);

      return matchesName || matchesPhone || matchesCity || matchesAddr || matchesEmail;
    });

    // Sort matching: starts with name first, then contains name, then alphabetical
    filtered.sort((a, b) => {
      const normA = normalizeText(a?.nome);
      const normB = normalizeText(b?.nome);
      const aStarts = normA.startsWith(query);
      const bStarts = normB.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' });
    });

    // Limit to top 35 results for silky-smooth 60fps typing without DOM overload
    return filtered.slice(0, 35);
  }, [db?.clients, clientSearchQuery, showAllClientsList]);

  // Count how many times each service has been included in quotes for "Mais Orçados" ordering
  const serviceUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (db?.quoteItems || []).forEach(item => {
      if (item.service_id) {
        counts[item.service_id] = (counts[item.service_id] || 0) + 1;
      }
    });
    return counts;
  }, [db?.quoteItems]);

  // Cached client lookup map for O(1) instantaneous access
  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    (db?.clients || []).forEach(c => {
      if (c?.id) map.set(c.id, c);
    });
    return map;
  }, [db?.clients]);

  // Cached phone and name sets for fast exclusion in Agenda lookup (computed only when db.clients changes)
  const { clientPhoneLast8, clientNames } = useMemo(() => {
    const phoneSet = new Set<string>();
    const nameSet = new Set<string>();
    (db?.clients || []).forEach(c => {
      const p = String(c?.telefone || '').replace(/\D/g, '').slice(-8);
      if (p && p.length >= 8) phoneSet.add(p);
      const n = normalizeText(c?.nome);
      if (n) nameSet.add(n);
    });
    return { clientPhoneLast8: phoneSet, clientNames: nameSet };
  }, [db?.clients]);

  // Matching contacts from Phone & Google Contacts cache (for instant lookup in Novo Orçamento)
  const matchingAgendaContacts = useMemo(() => {
    if (!clientSearchQuery || clientSearchQuery.trim().length < 2) return [];
    let results: any[] = [];
    try {
      results = searchAllCachedContacts(clientSearchQuery);
    } catch (err) {
      console.warn('Erro ao buscar contatos na agenda:', err);
      return [];
    }
    if (!Array.isArray(results) || !results.length) return [];

    return results.filter(r => {
      if (!r) return false;
      const cleanPhone = String(r.phone || '').replace(/\D/g, '');
      const cleanName = normalizeText(r.name);
      const matchesPhone = cleanPhone.length >= 8 && clientPhoneLast8.has(cleanPhone.slice(-8));
      const matchesName = cleanName && clientNames.has(cleanName);
      return !matchesPhone && !matchesName;
    });
  }, [clientSearchQuery, clientPhoneLast8, clientNames, contactsStorageVersion]);

  const handleSelectAgendaContact = (contact: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    city?: string;
    source: 'google' | 'phone';
    googleItem?: any;
  }) => {
    const newId = generateId();
    const newClient: Client = {
      id: newId,
      nome: contact.name.trim() || 'Cliente Agenda',
      telefone: formatPhone(contact.phone || ''),
      email: contact.email || '',
      endereco: contact.address || '',
      cidade: contact.city || 'Passo Fundo',
      estado: 'RS',
      CEP: '',
      observacoes: `Importado da ${contact.source === 'google' ? `Agenda Google (${DEFAULT_GOOGLE_ACCOUNT})` : 'Agenda do Telefone'}.`,
      tags: ['Agenda'],
      origem: 'Google',
      created_at: new Date().toISOString().split('T')[0],
    };

    onUpdateDb({
      ...db,
      clients: [newClient, ...db.clients],
    });

    setClientId(newId);
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    setIsRegisteringClient(false);
  };

  // Today date reference for reminders
  const todayDateOnly = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Concluded OS Quote IDs (to show completion badges)
  const concludedOSQuoteIds = useMemo(() => {
    return new Set(
      db.serviceOrders
        .filter(os => os.status === 'concluido' && (os.quote_id || os.quote_numero))
        .flatMap(os => [os.quote_id, os.quote_numero].filter(Boolean) as string[])
    );
  }, [db.serviceOrders]);

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, statusFilter, originFilter, showArchived, reminderFilter, selectedMonth, selectedYear]);

  // Filters for Main Quotes List
  const filteredQuotes = useMemo(() => {
    const lowerSearch = (deferredSearchTerm || '').toLowerCase();
    const digitsSearch = (deferredSearchTerm || '').replace(/\D/g, '');

    return (db?.quotes || []).filter(q => {
      if (!q) return false;
      const qClient = clientMap.get(q.client_id);
      const clientPhone = qClient?.telefone ? String(qClient.telefone).replace(/\D/g, '') : '';
      const matchesSearch = !deferredSearchTerm || (
        String(q.numero || '').toLowerCase().includes(lowerSearch) ||
        String(q.client_name || '').toLowerCase().includes(lowerSearch) ||
        (digitsSearch && clientPhone.includes(digitsSearch)) ||
        (q.observacoes && String(q.observacoes).toLowerCase().includes(lowerSearch)) ||
        (q.lembrete_motivo && String(q.lembrete_motivo).toLowerCase().includes(lowerSearch))
      );
      
      const matchesStatus = statusFilter ? q.status === statusFilter : true;
      const matchesOrigin = originFilter ? (qClient?.origem === originFilter) : true;

      // Filter by archived: only if explicitly marked as archived
      const isArchived = Boolean(q.arquivado);
      const matchesArchived = showArchived ? isArchived : !isArchived;

      // Filter by reminder
      let matchesReminder = true;
      if (reminderFilter === 'with_reminder') {
        matchesReminder = Boolean(q.tem_lembrete && !q.lembrete_concluido);
      } else if (reminderFilter === 'today_reminder') {
        matchesReminder = Boolean(q.tem_lembrete && !q.lembrete_concluido && q.lembrete_data && q.lembrete_data <= todayDateOnly);
      }

      // Filter by Month and Year
      let matchesPeriod = true;
      if (selectedYear !== 'all') {
        const { year, month } = parseDateComponents(q.created_at);
        if (year !== selectedYear) matchesPeriod = false;
        if (selectedMonth !== 'all' && month !== selectedMonth) matchesPeriod = false;
      } else if (selectedMonth !== 'all') {
        const { month } = parseDateComponents(q.created_at);
        if (month !== selectedMonth) matchesPeriod = false;
      }

      return matchesSearch && matchesStatus && matchesOrigin && matchesArchived && matchesReminder && matchesPeriod;
    });
  }, [db?.quotes, clientMap, deferredSearchTerm, statusFilter, originFilter, showArchived, reminderFilter, todayDateOnly, selectedMonth, selectedYear]);

  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / pageSize));
  const paginatedQuotes = useMemo(() => {
    return filteredQuotes.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredQuotes, currentPage, pageSize]);

  // Counts for Header / Tab Badges
  const totalActiveQuotesCount = useMemo(() => {
    return db.quotes.filter(q => !q.arquivado).length;
  }, [db.quotes]);

  const quotesWithRemindersCount = useMemo(() => {
    return db.quotes.filter(q => q.tem_lembrete && !q.lembrete_concluido && !q.arquivado).length;
  }, [db.quotes]);

  const quotesRemindersDueTodayCount = useMemo(() => {
    return db.quotes.filter(q => 
      q.tem_lembrete && 
      !q.lembrete_concluido && 
      !q.arquivado && 
      q.lembrete_data && 
      q.lembrete_data <= todayDateOnly
    ).length;
  }, [db.quotes, todayDateOnly]);

  const totalArchivedQuotesCount = useMemo(() => {
    return db.quotes.filter(q => q.arquivado).length;
  }, [db.quotes]);

  // Open Create Form
  const handleCreateOpen = () => {
    setFormStep(1);
    setShowAllClientsList(false);
    setEditingQuoteId(null);
    setClientId('');
    setFormStatus('rascunho');
    setIsFormStatusDropdownOpen(false);
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    setValidade(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // 15 days default
    setObservacoes('');
    setQuoteItems([]);
    setQuotePhotos([]);
    setDescontoValor('');
    setTipoDesconto('valor');
    setDescontoPercentual('');
    setDescontoMotivo('');
    setTemLembrete(false);
    setLembreteData('');
    setLembreteMotivo('');
    setLembreteConcluido(false);
    setIsRegisteringClient(false);

    // Inicializar agendamento para novo orçamento
    setAgendamentoAutomatico(true);
    const defaultD = new Date(Date.now() + 24 * 60 * 60 * 1000);
    defaultD.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    setAgendamentoDataHora(`${defaultD.getFullYear()}-${pad(defaultD.getMonth() + 1)}-${pad(defaultD.getDate())}T${pad(defaultD.getHours())}:${pad(defaultD.getMinutes())}`);
    setAgendamentoTecnico(TECNICOS_HIGIPRO[0] || 'Alexandre');
    setAgendamentoObservacoes('');

    setIsCrudOpen(true);
  };

  // Open Edit Form
  const handleEditOpen = (quote: Quote) => {
    setFormStep(1);
    setShowAllClientsList(false);
    setEditingQuoteId(quote.id);
    setClientId(quote.client_id);
    setFormStatus(quote.status || 'rascunho');
    setIsFormStatusDropdownOpen(false);
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    setValidade(quote.validade);
    setObservacoes(quote.observacoes);
    setIsRegisteringClient(false);

    // Carregar agendamento de OS existente ou sugerir padrão
    const existingOS = db.serviceOrders.find(os => os.quote_id === quote.id);
    if (existingOS) {
      setAgendamentoDataHora(existingOS.data_agendada || '');
      setAgendamentoTecnico(existingOS.tecnico || TECNICOS_HIGIPRO[0]);
      setAgendamentoObservacoes(existingOS.observacoes || '');
      setAgendamentoAutomatico(false);
    } else {
      const defaultD = new Date(Date.now() + 24 * 60 * 60 * 1000);
      defaultD.setHours(9, 0, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      setAgendamentoDataHora(`${defaultD.getFullYear()}-${pad(defaultD.getMonth() + 1)}-${pad(defaultD.getDate())}T${pad(defaultD.getHours())}:${pad(defaultD.getMinutes())}`);
      setAgendamentoTecnico(TECNICOS_HIGIPRO[0] || 'Alexandre');
      setAgendamentoObservacoes('');
      setAgendamentoAutomatico(true);
    }

    // Load reminder values
    setTemLembrete(Boolean(quote.tem_lembrete));
    setLembreteData(quote.lembrete_data || '');
    setLembreteMotivo(quote.lembrete_motivo || '');
    setLembreteConcluido(Boolean(quote.lembrete_concluido));

    // Load discount values
    if (quote.tipo_desconto === 'porcentagem') {
      setTipoDesconto('porcentagem');
      setDescontoPercentual(quote.desconto_percentual !== undefined ? quote.desconto_percentual : '');
      setDescontoValor(quote.desconto && quote.desconto > 0 ? quote.desconto : '');
    } else {
      setTipoDesconto('valor');
      setDescontoValor(quote.desconto && quote.desconto > 0 ? quote.desconto : '');
      setDescontoPercentual('');
    }
    setDescontoMotivo(quote.desconto_motivo || '');
    
    // Load existing photos
    const existingPhotos = (db.clientPhotos || []).filter(
      p => p.quote_id === quote.id || (p.client_id === quote.client_id && p.created_at === quote.created_at)
    );
    setQuotePhotos(existingPhotos);

    // Load associated items
    const items = db.quoteItems
      .filter(item => item.quote_id === quote.id)
      .map(item => {
        const svc = db.services.find(s => s.id === item.service_id);
        const isTapete = item.unidade === 'm²' || 
          svc?.unidade === 'm²' || 
          svc?.tipo_estofado === 'Tapete' || 
          svc?.categoria === 'Tapete' || 
          (svc?.nome && normalizeSearchText(svc.nome).includes('tapete')) || 
          normalizeSearchText(item.descricao).includes('tapete');

        return {
          id: item.id || ('item-' + generateId()),
          service_id: item.service_id,
          descricao: item.descricao,
          qtd: item.qtd,
          preco_unit: item.preco_unit,
          unidade: item.unidade || svc?.unidade || (isTapete ? 'm²' : 'un'),
          largura: item.tamanho_largura,
          comprimento: item.tamanho_comprimento,
          tamanho_m2: item.tamanho_m2 || (isTapete ? item.qtd : undefined),
          showDimensions: isTapete,
        };
      });
    
    setQuoteItems(items);
    setIsCrudOpen(true);
  };

  // Add Item to Form (supports adding normal service or Tapete with size calculator)
  const handleAddItem = (isTapeteOnly: boolean = false) => {
    let defaultService = isTapeteOnly
      ? db.services.find(s => (s.tipo_estofado === 'Tapete' || s.categoria === 'Tapete' || s.unidade === 'm²' || normalizeSearchText(s.nome).includes('tapete')) && s.ativo !== false)
      : db.services.find(s => s.ativo !== false);

    if (!defaultService) {
      defaultService = db.services[0];
    }
    if (!defaultService) {
      alert('Nenhum serviço encontrado no catálogo para adicionar.');
      return;
    }

    const isTapete = isTapeteOnly || 
      defaultService.tipo_estofado === 'Tapete' || 
      defaultService.categoria === 'Tapete' || 
      defaultService.unidade === 'm²' || 
      normalizeSearchText(defaultService.nome).includes('tapete');

    const defLargura = isTapete ? (defaultService.tamanho_largura || 2.0) : undefined;
    const defComprimento = isTapete ? (defaultService.tamanho_comprimento || 2.5) : undefined;
    const defArea = isTapete && defLargura && defComprimento 
      ? parseFloat((defLargura * defComprimento).toFixed(2)) 
      : 1;

    const desc = isTapete && defLargura && defComprimento
      ? `${defaultService.nome} (${defLargura.toFixed(2)}m × ${defComprimento.toFixed(2)}m = ${defArea.toFixed(2)} m²)`
      : defaultService.nome;

    const newItem = {
      id: 'item-' + generateId(),
      service_id: defaultService.id,
      descricao: desc,
      qtd: isTapete ? (defArea || 1) : 1,
      preco_unit: defaultService.preco || 0,
      unidade: defaultService.unidade || (isTapete ? 'm²' : 'un'),
      largura: defLargura,
      comprimento: defComprimento,
      tamanho_m2: isTapete ? defArea : undefined,
      showDimensions: isTapete,
    };

    // Append new item so items flow downwards below the search bar
    setQuoteItems(prev => [
      ...prev,
      newItem,
    ]);
  };

  // Quick Add Service selected from persistent search bar
  const handleQuickAddService = (svc: Service) => {
    const isTapete = svc.tipo_estofado === 'Tapete' || 
      svc.categoria === 'Tapete' || 
      svc.unidade === 'm²' || 
      normalizeSearchText(svc.nome).includes('tapete');

    const defLargura = isTapete ? (svc.tamanho_largura || 2.0) : undefined;
    const defComprimento = isTapete ? (svc.tamanho_comprimento || 2.5) : undefined;
    const defArea = isTapete && defLargura && defComprimento 
      ? parseFloat((defLargura * defComprimento).toFixed(2)) 
      : 1;

    const desc = isTapete && defLargura && defComprimento
      ? `${svc.nome} (${defLargura.toFixed(2)}m × ${defComprimento.toFixed(2)}m = ${defArea.toFixed(2)} m²)`
      : svc.nome;

    const newItem = {
      id: 'item-' + generateId(),
      service_id: svc.id,
      descricao: desc,
      qtd: isTapete ? (defArea || 1) : 1,
      preco_unit: svc.preco || 0,
      unidade: svc.unidade || (isTapete ? 'm²' : 'un'),
      largura: defLargura,
      comprimento: defComprimento,
      tamanho_m2: isTapete ? defArea : undefined,
      showDimensions: isTapete,
    };

    // Append to quoteItems so items go downwards below the search bar
    setQuoteItems(prev => [...prev, newItem]);
  };

  // Remove Item from Form
  const handleRemoveItem = (index: number) => {
    setQuoteItems(quoteItems.filter((_, idx) => idx !== index));
  };

  // Update Item in Form
  const handleUpdateItem = (index: number, field: string, value: any) => {
    const updated = quoteItems.map((item, idx) => {
      if (idx === index) {
        let newItem = { ...item, [field]: value };
        // If service changed, auto-update price, description and detect Tapete
        if (field === 'service_id') {
          const service = db.services.find(s => s.id === value);
          if (service) {
            const isTapete = service.unidade === 'm²' || 
              service.tipo_estofado === 'Tapete' || 
              service.categoria === 'Tapete' || 
              normalizeSearchText(service.nome).includes('tapete');

            newItem.preco_unit = service.preco || 0;
            newItem.unidade = service.unidade || (isTapete ? 'm²' : 'un');

            if (isTapete) {
              const defL = newItem.largura || service.tamanho_largura || 2.0;
              const defC = newItem.comprimento || service.tamanho_comprimento || 2.5;
              const area = parseFloat((defL * defC).toFixed(2));
              newItem.largura = defL;
              newItem.comprimento = defC;
              newItem.tamanho_m2 = area;
              newItem.qtd = area;
              newItem.showDimensions = true;
              newItem.descricao = `${service.nome} (${defL.toFixed(2)}m × ${defC.toFixed(2)}m = ${area.toFixed(2)} m²)`;
            } else {
              newItem.descricao = service.nome;
              newItem.showDimensions = false;
              newItem.largura = undefined;
              newItem.comprimento = undefined;
              newItem.tamanho_m2 = undefined;
              newItem.unidade = service.unidade || 'un';
              const currentQtd = Number(item.qtd);
              if (item.unidade === 'm²' || isNaN(currentQtd) || currentQtd <= 0) {
                newItem.qtd = 1;
              } else {
                newItem.qtd = currentQtd;
              }
            }
          }
        }
        return newItem;
      }
      return item;
    });
    setQuoteItems(updated);
  };

  // Update Tapete Dimensions (Width & Length -> auto calculate Area/m² and Subtotal)
  const handleUpdateTapeteDimensions = (index: number, largura: number, comprimento: number) => {
    const updated = quoteItems.map((item, idx) => {
      if (idx === index) {
        const l = Math.max(0, largura);
        const c = Math.max(0, comprimento);
        const area = (l > 0 && c > 0) ? parseFloat((l * c).toFixed(2)) : (item.qtd || 1);

        const svc = db.services.find(s => s.id === item.service_id);
        const rawName = svc?.nome || item.descricao.replace(/\s*\(\d+.*m²\)/i, '').trim();

        const newDesc = (l > 0 && c > 0)
          ? `${rawName} (${l.toFixed(2)}m × ${c.toFixed(2)}m = ${area.toFixed(2)} m²)`
          : rawName;

        return {
          ...item,
          largura: l > 0 ? l : undefined,
          comprimento: c > 0 ? c : undefined,
          tamanho_m2: area,
          qtd: area,
          descricao: newDesc,
          unidade: 'm²' as const,
          showDimensions: true,
        };
      }
      return item;
    });
    setQuoteItems(updated);
  };

  // Toggle Dimensions Panel on any Item
  const handleToggleDimensions = (index: number) => {
    setQuoteItems(quoteItems.map((item, idx) => {
      if (idx === index) {
        const nextShow = !item.showDimensions;
        const svc = db.services.find(s => s.id === item.service_id);
        if (nextShow && (!item.largura || !item.comprimento)) {
          const l = 2.0;
          const c = 2.5;
          const area = 5.0;
          const rawName = svc?.nome || item.descricao.replace(/\s*\(\d+.*m²\)/i, '').trim();
          return {
            ...item,
            showDimensions: true,
            largura: l,
            comprimento: c,
            tamanho_m2: area,
            qtd: area,
            unidade: 'm²' as const,
            descricao: `${rawName} (${l.toFixed(2)}m × ${c.toFixed(2)}m = ${area.toFixed(2)} m²)`,
          };
        }
        return { ...item, showDimensions: nextShow };
      }
      return item;
    }));
  };

  // Quick Service Creation Handlers
  const handleOpenQuickNewService = (itemIndex: number | null, initialName: string = '') => {
    setQuickServiceTargetItemIndex(itemIndex);
    setQuickServiceName(initialName);
    setQuickServiceCategory('Higienização');
    setQuickServiceType('Sofá');
    setQuickServicePrice(150);
    setQuickServiceUnit('un');
    setIsQuickServiceModalOpen(true);
  };

  const handleSaveQuickService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickServiceName.trim()) {
      alert('Por favor, informe o nome do serviço.');
      return;
    }

    const newService: Service = {
      id: generateId(),
      nome: quickServiceName.trim(),
      descricao: quickServiceName.trim(),
      categoria: quickServiceCategory,
      tipo_estofado: quickServiceType,
      preco: Number(quickServicePrice) || 0,
      custo: Math.round((Number(quickServicePrice) || 0) * 0.2),
      duracao: 90,
      ativo: true,
      unidade: quickServiceUnit
    };

    onUpdateDb({
      ...db,
      services: [...db.services, newService]
    });

    if (quickServiceTargetItemIndex !== null && quoteItems[quickServiceTargetItemIndex]) {
      handleUpdateItem(quickServiceTargetItemIndex, 'service_id', newService.id);
    } else {
      const newItem = {
        id: 'item-' + generateId(),
        service_id: newService.id,
        descricao: newService.nome,
        qtd: 1,
        preco_unit: newService.preco,
        unidade: newService.unidade || 'un',
      };
      setQuoteItems([
        newItem,
        ...quoteItems,
      ]);
    }

    setIsQuickServiceModalOpen(false);
    setQuickServiceTargetItemIndex(null);
  };

  // Save Quote
  const handleSaveQuote = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let currentClientId = clientId;
      let newCreatedClient: Client | null = null;

      // If user was creating a new client inline and filled in the name and phone
      if (isRegisteringClient && newClientNome.trim() && newClientTelefone.trim()) {
        const newId = generateId();
        newCreatedClient = {
          id: newId,
          nome: newClientNome.trim(),
          telefone: newClientTelefone.trim(),
          email: '',
          endereco: newClientEndereco.trim(),
          cidade: newClientCidade.trim() || 'Passo Fundo',
          estado: newClientEstado,
          CEP: '',
          observacoes: 'Cadastrado direto pela tela de orçamentos.',
          tags: [],
          origem: newClientOrigem,
          created_at: new Date().toISOString().split('T')[0],
        };
        currentClientId = newId;
        setClientId(newId);
        setIsRegisteringClient(false);
      }

      if (!currentClientId) {
        alert('Por favor, selecione um cliente para o orçamento.');
        return;
      }
      if (quoteItems.length === 0) {
        alert('Adicione pelo menos um item ao orçamento.');
        return;
      }

      const client = newCreatedClient || db.clients.find(c => c.id === currentClientId);
      const clientName = client ? client.nome : 'Cliente';

      // Define quoteId and dates BEFORE mapping items
      const quoteId = editingQuoteId || generateId();
      const nowStr = new Date().toISOString().split('T')[0];
      const safeValidade = validade || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Normalize and sanitize quote items
      const newItems: QuoteItem[] = quoteItems.map(item => {
        const svc = db.services.find(s => s.id === item.service_id) || db.services[0];
        const parsedQtd = typeof item.qtd === 'number' ? item.qtd : parseFloat(item.qtd as any);
        const safeQtd = !isNaN(parsedQtd) && parsedQtd > 0 ? parsedQtd : 1;
        const parsedPreco = typeof item.preco_unit === 'number' ? item.preco_unit : parseFloat(item.preco_unit as any);
        const safePreco = !isNaN(parsedPreco) && parsedPreco >= 0 ? parsedPreco : (svc?.preco || 0);

        return {
          id: generateId(),
          quote_id: quoteId,
          service_id: item.service_id || svc?.id || generateId(),
          descricao: item.descricao || svc?.nome || 'Serviço',
          qtd: safeQtd,
          preco_unit: safePreco,
          subtotal: safeQtd * safePreco,
          unidade: item.unidade || svc?.unidade || (svc?.tipo_estofado === 'Tapete' ? 'm²' : 'un'),
          tamanho_largura: item.largura,
          tamanho_comprimento: item.comprimento,
          tamanho_m2: item.tamanho_m2,
        };
      });

      const subtotalQuote = newItems.reduce((sum, item) => sum + item.subtotal, 0);

      // Calculate discount / bonus value
      let finalDiscount = 0;
      let finalPct: number | undefined = undefined;

      if (tipoDesconto === 'porcentagem') {
        const pct = typeof descontoPercentual === 'number' ? descontoPercentual : parseFloat(descontoPercentual as any);
        if (!isNaN(pct) && pct > 0) {
          finalPct = pct;
          finalDiscount = Math.min(subtotalQuote, (subtotalQuote * pct) / 100);
        }
      } else {
        const val = typeof descontoValor === 'number' ? descontoValor : parseFloat(descontoValor as any);
        if (!isNaN(val) && val > 0) {
          finalDiscount = Math.min(subtotalQuote, val);
        }
      }

      const totalQuote = Math.max(0, subtotalQuote - finalDiscount);

      let updatedQuotes = [...db.quotes];
      let updatedItems = db.quoteItems.filter(item => item.quote_id !== quoteId);

      if (editingQuoteId) {
        // Edit mode
        updatedQuotes = db.quotes.map(q => {
          if (q.id === editingQuoteId) {
            return {
              ...q,
              client_id: currentClientId,
              client_name: clientName,
              status: formStatus,
              subtotal: subtotalQuote,
              desconto: finalDiscount > 0 ? finalDiscount : undefined,
              tipo_desconto: finalDiscount > 0 ? tipoDesconto : undefined,
              desconto_percentual: finalDiscount > 0 && tipoDesconto === 'porcentagem' ? finalPct : undefined,
              desconto_motivo: finalDiscount > 0 ? (descontoMotivo.trim() || undefined) : undefined,
              total: totalQuote,
              observacoes: observacoes.trim(),
              validade: safeValidade,
              tem_lembrete: temLembrete,
              lembrete_data: temLembrete ? lembreteData : undefined,
              lembrete_motivo: temLembrete ? (lembreteMotivo.trim() || undefined) : undefined,
              lembrete_concluido: temLembrete ? lembreteConcluido : false,
              lembrete_concluido_em: temLembrete && lembreteConcluido ? (q.lembrete_concluido_em || nowStr) : undefined,
              itens: newItems,
            };
          }
          return q;
        });
      } else {
        // Create mode
        const count = db.quotes.length;
        const numero = generateNumber('ORC', count);
        const newQuote: Quote = {
          id: quoteId,
          numero,
          client_id: currentClientId,
          client_name: clientName,
          status: formStatus,
          subtotal: subtotalQuote,
          desconto: finalDiscount > 0 ? finalDiscount : undefined,
          tipo_desconto: finalDiscount > 0 ? tipoDesconto : undefined,
          desconto_percentual: finalDiscount > 0 && tipoDesconto === 'porcentagem' ? finalPct : undefined,
          desconto_motivo: finalDiscount > 0 ? (descontoMotivo.trim() || undefined) : undefined,
          total: totalQuote,
          observacoes: observacoes.trim(),
          validade: safeValidade,
          created_at: nowStr,
          tem_lembrete: temLembrete,
          lembrete_data: temLembrete ? lembreteData : undefined,
          lembrete_motivo: temLembrete ? (lembreteMotivo.trim() || undefined) : undefined,
          lembrete_concluido: temLembrete ? lembreteConcluido : false,
          lembrete_concluido_em: temLembrete && lembreteConcluido ? nowStr : undefined,
          itens: newItems,
        };
        updatedQuotes = [newQuote, ...db.quotes];
      }

      // Save Linked Photos into db.clientPhotos
      const otherPhotos = (db.clientPhotos || []).filter(p => p.quote_id !== quoteId);
      const syncedPhotos = quotePhotos.map(p => ({
        ...p,
        client_id: currentClientId,
        quote_id: quoteId,
      }));

      const updatedDb: DatabaseState = {
        ...db,
        ...(newCreatedClient ? { clients: [newCreatedClient, ...db.clients] } : {}),
        quotes: updatedQuotes,
        quoteItems: [...newItems, ...updatedItems],
        clientPhotos: [...otherPhotos, ...syncedPhotos],
      };

      let finalDb = updatedDb;

      if (formStatus === 'concluido') {
        const result = completeServiceAndSyncAll(updatedDb, {
          source: 'orcamento',
          id: quoteId,
          valor: totalQuote,
          observacoes: observacoes.trim(),
        });
        finalDb = result.updatedDb;
        const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
        setConcludedNotice(`Orçamento de ${result.clienteNome} gravado e concluído! O.S. ${result.osNumero || ''} gerada e valor${valStr} lançado no financeiro com sucesso.`);
        setTimeout(() => setConcludedNotice(null), 7000);
      } else if (formStatus === 'aprovado' && agendamentoAutomatico) {
        // Automatically create Service Order (OS), Financial Receivable and Appointment!
        const existingOS = db.serviceOrders.find(os => os.quote_id === quoteId);
        const countOS = db.serviceOrders.length;
        const osId = existingOS ? existingOS.id : generateId();
        const osNum = existingOS ? existingOS.numero : generateNumber('OS', countOS);
        const assignedTech = agendamentoTecnico.trim() || 'A definir';
        const targetDateTime = agendamentoDataHora || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 16);

        const newOS = {
          id: osId,
          numero: osNum,
          quote_id: quoteId,
          client_id: currentClientId,
          client_name: clientName,
          client_phone: client?.telefone || '',
          status: 'agendado' as const,
          total: totalQuote,
          pago: existingOS ? existingOS.pago : 0,
          data_agendada: targetDateTime,
          tecnico: assignedTech,
          endereco: client?.endereco || 'A ser confirmado',
          observacoes: `Origem: Orçamento ${editingQuoteId ? 'Editado' : 'Novo'} (${quoteId.slice(0, 8)}). ${agendamentoObservacoes.trim()}`.trim(),
          created_at: existingOS ? existingOS.created_at : nowStr,
        };

        // Determine category for transaction
        let mappedCategory = 'higienização estofados';
        const descLower = newItems.map(i => i.descricao.toLowerCase()).join(' ');
        if (descLower.includes('colchão') || descLower.includes('colchao')) {
          mappedCategory = 'higienização colchoes';
        } else if (descLower.includes('impermeabilização') || descLower.includes('impermeabilizacao')) {
          mappedCategory = 'impermeabilização';
        } else if (descLower.includes('tapete')) {
          mappedCategory = 'limpeza de tapetes';
        }

        const existingTx = db.transactions.find(t => t.os_id === osId);
        const newTx = {
          id: existingTx ? existingTx.id : generateId(),
          tipo: 'receita' as const,
          categoria: mappedCategory,
          descricao: `Serviço O.S. ${osNum} (${clientName})`,
          valor: totalQuote,
          data: targetDateTime.split('T')[0],
          metodo_pagamento: 'Pix' as const,
          status: 'pendente' as const,
          os_id: osId,
          created_at: existingTx ? existingTx.created_at : nowStr,
        };

        const existingAppt = db.appointments.find(a => a.os_id === osId);
        const newAppt = {
          id: existingAppt ? existingAppt.id : generateId(),
          os_id: osId,
          client_id: currentClientId,
          client_name: clientName,
          servicos: newItems.map(item => item.descricao).join(', ') || `Serviço O.S. ${osNum}`,
          data_hora: targetDateTime,
          duracao: 120,
          status: 'agendado' as const,
          tecnico: assignedTech,
          endereco: client?.endereco || 'A ser confirmado',
          observacoes: agendamentoObservacoes.trim(),
          valor: totalQuote,
        };

        const otherOS = updatedDb.serviceOrders.filter(os => os.id !== osId);
        const otherTx = updatedDb.transactions.filter(t => t.os_id !== osId);
        const otherAppt = updatedDb.appointments.filter(a => a.os_id !== osId);

        finalDb = {
          ...updatedDb,
          serviceOrders: [newOS, ...otherOS],
          transactions: [newTx, ...otherTx],
          appointments: [newAppt, ...otherAppt],
        };

        setConcludedNotice(`🎉 Orçamento aprovado com sucesso! Ordem de Serviço ${osNum} criada e agendada para ${formatDate(targetDateTime)}${assignedTech !== 'A definir' ? ` com ${assignedTech}` : ''}!`);
        setTimeout(() => setConcludedNotice(null), 8000);
      }

      onUpdateDb(finalDb);

      const itemsForQuote = [...newItems, ...updatedItems].filter(it => it.quote_id === quoteId);
      const rawSavedQuote = finalDb.quotes.find(q => q.id === quoteId) || updatedQuotes.find(q => q.id === quoteId);
      const savedQuote = rawSavedQuote ? { ...rawSavedQuote, itens: itemsForQuote } : null;

      if (savedQuote) {
        supabaseSaveQuote(savedQuote, itemsForQuote);
      }

      setIsCrudOpen(false);

      // Instantly open the quote in FULL SCREEN mode with items guaranteed
      if (savedQuote) {
        handleOpenFullscreenProposal(savedQuote);
      }
    } catch (error) {
      console.error('Erro ao salvar proposta:', error);
      alert('Ocorreu um erro ao gravar a proposta. Por favor, tente novamente.');
    }
  };

  // Toggle Quote Archive
  const handleToggleArchive = (quote: Quote) => {
    const isArchived = Boolean(quote.arquivado);
    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quote.id) {
        return {
          ...q,
          arquivado: !isArchived,
          arquivado_em: !isArchived ? new Date().toISOString() : undefined,
          arquivado_motivo: !isArchived ? 'Arquivado manualmente pelo usuário' : undefined,
        };
      }
      return q;
    });
    onUpdateDb({ ...db, quotes: updatedQuotes });
    const targetQ = updatedQuotes.find(q => q.id === quote.id);
    if (targetQ) {
      const itms = db.quoteItems.filter(i => i.quote_id === quote.id);
      supabaseSaveQuote(targetQ, itms);
    }
  };

  // Toggle Reminder Complete
  const handleToggleReminderComplete = (quote: Quote) => {
    const isDone = Boolean(quote.lembrete_concluido);
    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quote.id) {
        return {
          ...q,
          lembrete_concluido: !isDone,
          lembrete_concluido_em: !isDone ? new Date().toISOString().split('T')[0] : undefined,
        };
      }
      return q;
    });
    onUpdateDb({ ...db, quotes: updatedQuotes });
    const targetQ = updatedQuotes.find(q => q.id === quote.id);
    if (targetQ) {
      const itms = db.quoteItems.filter(i => i.quote_id === quote.id);
      supabaseSaveQuote(targetQ, itms);
    }
  };

  // Open Quick Reminder Modal
  const handleOpenQuickReminder = (quote: Quote) => {
    setQuickReminderQuote(quote);
    setQuickReminderData(quote.lembrete_data || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setQuickReminderMotivo(quote.lembrete_motivo || 'Sofá novo chegando da loja (impermeabilizar)');
    setQuickReminderConcluido(Boolean(quote.lembrete_concluido));
  };

  // Save Quick Reminder
  const handleSaveQuickReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReminderQuote) return;

    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quickReminderQuote.id) {
        return {
          ...q,
          tem_lembrete: true,
          lembrete_data: quickReminderData,
          lembrete_motivo: quickReminderMotivo.trim() || undefined,
          lembrete_concluido: quickReminderConcluido,
          lembrete_concluido_em: quickReminderConcluido ? (q.lembrete_concluido_em || new Date().toISOString().split('T')[0]) : undefined,
        };
      }
      return q;
    });

    onUpdateDb({ ...db, quotes: updatedQuotes });
    const targetQ = updatedQuotes.find(q => q.id === quickReminderQuote.id);
    if (targetQ) {
      const itms = db.quoteItems.filter(i => i.quote_id === quickReminderQuote.id);
      supabaseSaveQuote(targetQ, itms);
    }

    setQuickReminderQuote(null);
  };

  // Remove Quick Reminder
  const handleRemoveQuickReminder = () => {
    if (!quickReminderQuote) return;
    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quickReminderQuote.id) {
        return {
          ...q,
          tem_lembrete: false,
          lembrete_data: undefined,
          lembrete_motivo: undefined,
          lembrete_concluido: false,
          lembrete_concluido_em: undefined,
        };
      }
      return q;
    });

    onUpdateDb({ ...db, quotes: updatedQuotes });
    const targetQ = updatedQuotes.find(q => q.id === quickReminderQuote.id);
    if (targetQ) {
      const itms = db.quoteItems.filter(i => i.quote_id === quickReminderQuote.id);
      supabaseSaveQuote(targetQ, itms);
    }

    setQuickReminderQuote(null);
  };

  // WhatsApp Reminder Direct Contact
  const handleWhatsAppReminderCall = (quote: Quote) => {
    const client = db.clients.find(c => c.id === quote.client_id);
    if (!client) return;
    const cleanPhone = cleanWhatsAppPhone(client.telefone);
    if (!cleanPhone) {
      alert('Telefone do cliente não encontrado.');
      return;
    }

    const items = db.quoteItems.filter(item => item.quote_id === quote.id);
    const itemsDesc = items.map(i => i.descricao).join(', ') || 'serviços de estofados';

    let msg = `Olá, *${client.nome}*! Tudo bem? 🌸\n\n`;
    msg += `Passando para dar um alô referente ao seu orçamento *${quote.numero}* (${itemsDesc}).\n\n`;
    if (quote.lembrete_motivo) {
      msg += `Você havia nos pedido um lembrete: _"${quote.lembrete_motivo}"_.\n\n`;
    }
    msg += `Seu estofado já chegou / ficou pronto da loja? Gostaria de agendar o atendimento para esta semana? Estamos com horários especiais disponíveis! 😊`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Delete Quote
  const handleDeleteConfirm = () => {
    if (!quoteToDelete) return;
    const updatedQuotes = db.quotes.filter(q => q.id !== quoteToDelete.id);
    const updatedItems = db.quoteItems.filter(item => item.quote_id !== quoteToDelete.id);
    onUpdateDb({ ...db, quotes: updatedQuotes, quoteItems: updatedItems });
    supabaseDeleteQuote(quoteToDelete.id);
    setQuoteToDelete(null);
  };

  // Quick Change Status
  // Start automated Quote Approval and Scheduling
  const handleStartApproval = (quote: Quote) => {
    setQuoteToApprove(quote);
    setApprovalTech(TECNICOS_HIGIPRO[0]);
    setApprovalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 16));
    setApprovalNotes(quote.observacoes || '');
    setIsApprovalScheduleOpen(true);
  };

  // Quick Change Status
  const handleUpdateStatus = (quote: Quote, newStatus: QuoteStatus, bypassScheduleModal = false) => {
    if (newStatus === 'concluido') {
      const result = completeServiceAndSyncAll(db, {
        source: 'orcamento',
        id: quote.id,
        valor: quote.total,
      });
      onUpdateDb(result.updatedDb);
      if (selectedQuote && selectedQuote.id === quote.id) {
        setSelectedQuote({ ...selectedQuote, status: 'concluido', arquivado: true });
      }
      const valStr = result.valorRegistrado > 0 ? ` (R$ ${result.valorRegistrado.toFixed(2).replace('.', ',')})` : '';
      setConcludedNotice(`Orçamento ${quote.numero} de ${result.clienteNome} concluído com sucesso! Valor${valStr} registrado no financeiro e salvo no histórico.`);
      setTimeout(() => setConcludedNotice(null), 6000);
      return;
    }

    if (newStatus === 'aprovado' && !bypassScheduleModal) {
      handleStartApproval(quote);
      return;
    }
    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quote.id) {
        return { ...q, status: newStatus };
      }
      return q;
    });
    onUpdateDb({ ...db, quotes: updatedQuotes });
    if (selectedQuote && selectedQuote.id === quote.id) {
      setSelectedQuote({ ...selectedQuote, status: newStatus });
    }
  };

  // Direct approve without immediate scheduling
  const handleApproveWithoutSchedule = () => {
    if (!quoteToApprove) return;
    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quoteToApprove.id) {
        return { ...q, status: 'aprovado' as const };
      }
      return q;
    });
    onUpdateDb({ ...db, quotes: updatedQuotes });
    if (selectedQuote && selectedQuote.id === quoteToApprove.id) {
      setSelectedQuote({ ...selectedQuote, status: 'aprovado' });
    }
    setIsApprovalScheduleOpen(false);
    setQuoteToApprove(null);
  };

  // Convert Quote to Service Order (OS) with full automated schedule setup
  const handleConfirmApproval = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteToApprove) return;

    const client = db.clients.find(c => c.id === quoteToApprove.client_id);
    if (!client) {
      alert('Não foi possível carregar o cliente do orçamento.');
      return;
    }

    const countOS = db.serviceOrders.length;
    const osId = generateId();
    const osNum = generateNumber('OS', countOS);
    const assignedTech = approvalTech.trim() || 'A definir';

    // Create Service Order
    const newOS = {
      id: osId,
      numero: osNum,
      quote_id: quoteToApprove.id,
      client_id: quoteToApprove.client_id,
      client_name: quoteToApprove.client_name,
      client_phone: client.telefone,
      status: 'agendado' as const, // Automatically scheduled
      total: quoteToApprove.total,
      pago: 0,
      data_agendada: approvalDateTime,
      tecnico: assignedTech,
      endereco: client.endereco || 'A ser confirmado',
      observacoes: `Orçamento de origem: ${quoteToApprove.numero}. ${approvalNotes}`,
      created_at: new Date().toISOString().split('T')[0],
    };

    // Determine category for transaction
    const items = db.quoteItems.filter(item => item.quote_id === quoteToApprove.id);
    let mappedCategory = 'higienização estofados';
    const descLower = items.map(i => i.descricao.toLowerCase()).join(' ');
    
    if (descLower.includes('colchão') || descLower.includes('colchao')) {
      mappedCategory = 'higienização colchoes';
    } else if (descLower.includes('impermeabilização') || descLower.includes('impermeabilizacao')) {
      mappedCategory = 'impermeabilização';
    } else if (descLower.includes('tapete')) {
      mappedCategory = 'limpeza de tapetes';
    }

    // Create Transaction (A Receber - Receita, Status Pendente)
    const newTx = {
      id: generateId(),
      tipo: 'receita' as const,
      categoria: mappedCategory,
      descricao: `Serviço O.S. ${osNum} (${quoteToApprove.client_name})`,
      valor: quoteToApprove.total,
      data: approvalDateTime.split('T')[0],
      metodo_pagamento: 'Pix' as const,
      status: 'pendente' as const, // Accounts Receivable = pendente
      os_id: osId,
      created_at: new Date().toISOString().split('T')[0],
    };

    // Create Appointment (Agenda)
    const newAppt = {
      id: generateId(),
      os_id: osId,
      client_id: quoteToApprove.client_id,
      client_name: quoteToApprove.client_name,
      servicos: items.map(item => item.descricao).join(', ') || `Serviço O.S. ${osNum}`,
      data_hora: approvalDateTime,
      duracao: 120, // default 2 hours
      status: 'agendado' as const,
      tecnico: assignedTech,
      endereco: client.endereco || 'A ser confirmado',
      observacoes: approvalNotes,
      valor: quoteToApprove.total,
    };

    // Update Quote Status to Approved
    const updatedQuotes = db.quotes.map(q => {
      if (q.id === quoteToApprove.id) {
        return { ...q, status: 'aprovado' as const };
      }
      return q;
    });

    onUpdateDb({
      ...db,
      quotes: updatedQuotes,
      serviceOrders: [newOS, ...db.serviceOrders],
      transactions: [newTx, ...db.transactions],
      appointments: [newAppt, ...db.appointments]
    });

    setIsApprovalScheduleOpen(false);
    setQuoteToApprove(null);
    setIsViewOpen(false);

    alert(`Sucesso! Orçamento ${quoteToApprove.numero} foi Aprovado. A Ordem de Serviço ${osNum} foi gerada, agendada para ${formatDate(approvalDateTime)}${assignedTech !== 'A definir' ? ` com ${assignedTech}` : ''}, lançada em "Contas a Receber" no financeiro, e projetada na Agenda!`);
  };

  const handleConvertToOS = (quote: Quote) => {
    handleStartApproval(quote);
  };

  const handleMoveQuote = (quoteId: string, newStatus: QuoteStatus) => {
    const quote = db.quotes.find(q => q.id === quoteId);
    if (!quote) return;
    handleUpdateStatus(quote, newStatus);
  };

  // Share via WhatsApp
  const handleWhatsAppShare = (quote: Quote) => {
    const client = db.clients.find(c => c.id === quote.client_id);
    if (!client) return;

    const items = db.quoteItems.filter(item => item.quote_id === quote.id);
    const cleanPhone = cleanWhatsAppPhone(client.telefone);

    let msg = `Olá, *${client.nome}*! Segue abaixo a proposta da *HigiPro Gestão de Estofados* referente ao seu orçamento:\n\n`;
    msg += `📄 *Orçamento:* ${quote.numero}\n`;
    msg += `📅 *Válido até:* ${formatDate(quote.validade)}\n\n`;
    msg += `*SERVIÇOS SOLICITADOS:*\n`;
    
    items.forEach(item => {
      msg += `• _${item.descricao}_ (Qtd: ${item.qtd}) - *${formatCurrency(item.subtotal)}*\n`;
    });

    if (quote.desconto && quote.desconto > 0) {
      const subtotal = quote.subtotal || (quote.total + quote.desconto);
      msg += `\nSubtotal: ${formatCurrency(subtotal)}\n`;
      msg += `🎁 *Desconto / Bônus Concedido:* - ${formatCurrency(quote.desconto)}${quote.desconto_motivo ? ` (${quote.desconto_motivo})` : ''}\n`;
      msg += `💵 *VALOR TOTAL COM DESCONTO:* *${formatCurrency(quote.total)}*\n\n`;
    } else {
      msg += `\n💵 *VALOR TOTAL:* *${formatCurrency(quote.total)}*\n\n`;
    }
    if (quote.observacoes) {
      msg += `📝 *Observações:* _${quote.observacoes}_\n\n`;
    }
    msg += `Gostaria de agendar um horário para realização do serviço? Estamos à disposição!`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
  };

  const [syncFeedback, setSyncFeedback] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleSyncSeptemberQuotes = () => {
    const updated = applySeptember2026Quotes(db);
    onUpdateDb(updated);
    setSyncFeedback(true);
    setTimeout(() => setSyncFeedback(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 font-display">Orçamentos Comercial</h1>
          <p className="text-sm text-slate-500">Crie cotações customizadas de serviços, envie via WhatsApp, aprove e converta em ordens de serviço operacionais.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => onNavigateToCalculator ? onNavigateToCalculator() : setIsCalculatorModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-bold rounded-xl transition border border-emerald-200 cursor-pointer shadow-2xs"
            title="Calcular valor ideal mínimo considerando horas, produtos e deslocamento"
          >
            <Calculator className="w-4 h-4 text-emerald-700" />
            <span>Calculadora de Orçamento</span>
          </button>
          <button
            onClick={handleCreateOpen}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Orçamento
          </button>
        </div>
      </div>

      {/* Concluded Toast / Notice */}
      {concludedNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-semibold shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{concludedNotice}</span>
          </div>
          <button 
            type="button"
            onClick={() => setConcludedNotice(null)} 
            className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Sub-Filter Tabs: Ativos, Lembretes, Chamar Hoje, Arquivados */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 select-none">
        <button
          type="button"
          onClick={() => {
            setShowArchived(false);
            setReminderFilter('all');
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
            !showArchived && reminderFilter === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span>Todos Ativos</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
            !showArchived && reminderFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {totalActiveQuotesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowArchived(false);
            setReminderFilter('with_reminder');
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
            !showArchived && reminderFilter === 'with_reminder'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-amber-900 hover:bg-amber-50/60 border border-amber-200'
          }`}
        >
          <Bell className="w-3.5 h-3.5 text-amber-500" />
          <span>Com Lembrete</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
            !showArchived && reminderFilter === 'with_reminder' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
          }`}>
            {quotesWithRemindersCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowArchived(false);
            setReminderFilter('today_reminder');
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer relative ${
            !showArchived && reminderFilter === 'today_reminder'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white text-rose-900 hover:bg-rose-50/60 border border-rose-200'
          }`}
        >
          <BellRing className={`w-3.5 h-3.5 text-rose-500 ${quotesRemindersDueTodayCount > 0 ? 'animate-bounce' : ''}`} />
          <span>Chamar Hoje / Atrasados</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
            !showArchived && reminderFilter === 'today_reminder' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
          }`}>
            {quotesRemindersDueTodayCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowArchived(true);
            setReminderFilter('all');
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
            showArchived
              ? 'bg-slate-800 text-white shadow-xs'
              : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Arquivados</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
            showArchived ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {totalArchivedQuotesCount}
          </span>
        </button>
      </div>

      {/* Toolbar Controls - Barra de pesquisa ampliada e controles limpos */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3.5 items-center flex-wrap">
        <div className="relative flex-1 w-full min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500 sm:text-slate-400" />
          <input
            type="text"
            placeholder="Buscar orçamento por cliente, número (#ORC), telefone ou serviço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-12 py-3.5 text-base bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-500 transition shadow-xs text-slate-900 placeholder:text-slate-400 font-medium"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-auto pl-3.5 pr-8 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-500 transition cursor-pointer font-medium text-slate-700"
        >
          <option value="">Todos Status</option>
          <option value="rascunho">Rascunho</option>
          <option value="enviado">Enviado</option>
          <option value="aprovado">Aprovado</option>
          <option value="recusado">Recusado</option>
          <option value="expirado">Expirado</option>
        </select>

        <select
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value)}
          className="w-full sm:w-auto pl-3.5 pr-8 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-500 transition cursor-pointer font-medium text-slate-700"
        >
          <option value="">Todas Origens</option>
          {ORIGINS.map(org => (
            <option key={org} value={org}>{org}</option>
          ))}
        </select>

        {/* Quick Period Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto p-0.5 bg-slate-50 border border-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => { setSelectedMonth('all'); setSelectedYear('all'); }}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
              selectedMonth === 'all'
                ? 'bg-white text-blue-700 shadow-2xs border border-slate-200/80 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({periodCounts.all})
          </button>
          <button
            type="button"
            onClick={() => { setSelectedMonth(currentMonthNum); setSelectedYear(currentYearNum); }}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
              selectedMonth === currentMonthNum && selectedYear === currentYearNum
                ? 'bg-blue-600 text-white shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mês Atual: {currentMonthName} ({periodCounts.current})
          </button>
          <button
            type="button"
            onClick={() => { setSelectedMonth(8); setSelectedYear(currentYearNum); }}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
              selectedMonth === 8 && selectedYear === currentYearNum
                ? 'bg-blue-600 text-white shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Setembro ({periodCounts.september})
          </button>
        </div>

        {/* Month and Year Period Selector */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <PeriodFilter
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthChange={setSelectedMonth}
            onYearChange={setSelectedYear}
            availableYears={availableYears}
            showAllMonthsOption={true}
            showAllYearsOption={true}
            allMonthsLabel="Todos os Meses"
            allYearsLabel="Todos os Anos"
            compact={true}
          />
        </div>

        {/* View Mode Toggle Button Group */}
        <div className="flex border border-slate-150 rounded-xl overflow-hidden self-stretch sm:self-auto shrink-0 bg-slate-50 p-1 w-full sm:w-auto">
          <button
            onClick={() => setViewMode('table')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'table' 
                ? 'bg-white text-blue-600 shadow-xs border border-slate-100 font-black' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Tabela
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'kanban' 
                ? 'bg-white text-blue-600 shadow-xs border border-slate-100 font-black' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Trello className="w-3.5 h-3.5" />
            Kanban
          </button>
        </div>
      </div>

      {/* Quotes Listing - Conditional View */}
      {viewMode === 'table' ? (
        filteredQuotes.length > 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-display border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3.5">Número</th>
                    <th className="px-6 py-3.5">Cliente</th>
                    <th className="px-6 py-3.5">Data Emissão</th>
                    <th className="px-6 py-3.5">Validade</th>
                    <th className="px-6 py-3.5">Total</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedQuotes.map(quote => (
                    <tr key={quote.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-mono font-bold text-slate-700">{quote.numero}</td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{quote.client_name}</span>
                          {(() => {
                            const qClient = clientMap.get(quote.client_id);
                            if (!qClient?.origem) return null;
                            return (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                qClient.origem === 'Google' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                qClient.origem === 'Meta Ads' || qClient.origem === 'Meta' || qClient.origem === 'Instagram' || qClient.origem === 'Facebook' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                qClient.origem === 'Indicação' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                Origem: {qClient.origem}
                              </span>
                            );
                          })()}
                        </div>
                        {quote.tem_lembrete && (
                          <div className={`mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                            quote.lembrete_concluido
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : quote.lembrete_data && quote.lembrete_data <= todayDateOnly
                                ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            <BellRing className="w-3 h-3 shrink-0" />
                            <span>
                              {quote.lembrete_concluido 
                                ? 'Lembrete Concluído' 
                                : quote.lembrete_data && quote.lembrete_data <= todayDateOnly 
                                  ? `Chamar Hoje (${formatDate(quote.lembrete_data)})` 
                                  : `Lembrete: ${formatDate(quote.lembrete_data || '')}`}
                            </span>
                            {quote.lembrete_motivo && (
                              <span className="max-w-[200px] truncate text-slate-600 font-normal">
                                • {quote.lembrete_motivo}
                              </span>
                            )}
                          </div>
                        )}
                        {quote.arquivado ? (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              <Archive className="w-2.5 h-2.5 text-slate-500" />
                              Arquivado
                            </span>
                          </div>
                        ) : (concludedOSQuoteIds.has(quote.id) || concludedOSQuoteIds.has(quote.numero)) ? (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              OS Concluída
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-slate-500">{formatDate(quote.created_at)}</td>
                      <td className="px-6 py-4 text-slate-500">{formatDate(quote.validade)}</td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-700">{formatCurrency(quote.total)}</div>
                        {quote.desconto && quote.desconto > 0 ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 mt-0.5">
                            <Tag className="w-2.5 h-2.5 text-emerald-600" />
                            Desc: -{formatCurrency(quote.desconto)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <QuoteStatusMenu 
                          quote={quote}
                          onUpdateStatus={handleUpdateStatus}
                          onStartApproval={handleStartApproval}
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenQuickReminder(quote)}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              quote.tem_lembrete 
                                ? (quote.lembrete_concluido 
                                    ? 'text-emerald-600 hover:bg-emerald-50' 
                                    : quote.lembrete_data && quote.lembrete_data <= todayDateOnly 
                                      ? 'text-rose-600 hover:bg-rose-50 animate-bounce' 
                                      : 'text-amber-600 hover:bg-amber-50')
                                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={quote.tem_lembrete ? "Ver / Editar Lembrete de Aviso" : "Programar Lembrete / Aviso"}
                          >
                            <Bell className="w-4 h-4" />
                          </button>
                          {quote.tem_lembrete && !quote.lembrete_concluido && (
                            <button
                              onClick={() => handleWhatsAppReminderCall(quote)}
                              className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Chamar cliente no WhatsApp sobre o lembrete"
                            >
                              <Phone className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenFullscreenProposal(quote)}
                            className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title="Ver em Tela Cheia (Tirar Print)"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenRecibo(quote)}
                            className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                            title="Emitir Recibo do Serviço"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewQuote(quote)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Visualizar orçamento"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditOpen(quote)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Editar orçamento"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setQuoteToDelete(quote)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Excluir orçamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleWhatsAppShare(quote)}
                            className="p-1.5 text-green-600 hover:bg-green-50 hover:text-green-700 rounded-lg transition cursor-pointer"
                            title="Compartilhar no WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleArchive(quote)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title={quote.arquivado ? "Desarquivar Orçamento" : "Arquivar Orçamento"}
                          >
                            {quote.arquivado ? <ArchiveRestore className="w-4 h-4 text-indigo-600" /> : <Archive className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/50">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>

                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 mr-2">
                    Exibindo <strong>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                    <strong>{Math.min(currentPage * pageSize, filteredQuotes.length)}</strong> de{' '}
                    <strong>{filteredQuotes.length}</strong> orçamentos
                  </span>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                    let pageNum = idx + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = Math.min(totalPages - 4, currentPage - 2) + idx;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<Filter className="w-10 h-10" />}
            title="Nenhum orçamento encontrado"
            description="Nenhuma cotação foi registrada com os filtros aplicados."
            actionText="Novo Orçamento"
            onAction={handleCreateOpen}
          />
        )
      ) : (
        /* Kanban View Block */
        <div className="flex lg:grid lg:grid-cols-5 gap-4 overflow-x-auto pb-4 select-none snap-x">
          {[
            { id: 'rascunho' as QuoteStatus, label: 'Rascunho', bg: 'bg-slate-50 border-slate-100', dot: 'bg-slate-400' },
            { id: 'enviado' as QuoteStatus, label: 'Enviado', bg: 'bg-blue-50/40 border-blue-100/60', dot: 'bg-blue-500' },
            { id: 'aprovado' as QuoteStatus, label: 'Aprovado', bg: 'bg-blue-50/30 border-blue-100/50', dot: 'bg-blue-600' },
            { id: 'recusado' as QuoteStatus, label: 'Recusado', bg: 'bg-rose-50/30 border-rose-100/50', dot: 'bg-rose-500' },
            { id: 'expirado' as QuoteStatus, label: 'Expirado', bg: 'bg-amber-50/30 border-amber-100/50', dot: 'bg-amber-500' }
          ].map(col => {
            const quotesInCol = filteredQuotes.filter(q => q.status === col.id);
            return (
              <div 
                key={col.id} 
                className={`flex flex-col w-[280px] sm:w-[320px] lg:w-auto shrink-0 lg:shrink rounded-2xl border ${col.bg} p-4 min-h-[500px] transition duration-200 snap-center`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('text');
                  if (id) handleMoveQuote(id, col.id);
                }}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3.5 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">{col.label}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-200/50 text-[10px] font-black rounded-full text-slate-600">
                    {quotesInCol.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
                  {quotesInCol.length > 0 ? (
                    quotesInCol.map(quote => (
                      <div
                        key={quote.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text', quote.id)}
                        className="bg-white border border-slate-150 hover:border-blue-600/50 hover:shadow-lg hover:shadow-blue-600/5 rounded-xl p-4 transition-all duration-200 cursor-grab active:cursor-grabbing group relative"
                      >
                        {/* Number & Actions */}
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <span className="text-[10px] font-mono font-bold text-slate-500">{quote.numero}</span>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition duration-150">
                            <button
                              onClick={() => handleViewQuote(quote)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer"
                              title="Visualizar Proposta"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleEditOpen(quote)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer"
                              title="Editar Orçamento"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setQuoteToDelete(quote)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Excluir Orçamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleWhatsAppShare(quote)}
                              className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg cursor-pointer"
                              title="WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Client name & Origin */}
                        <div className="mb-1">
                          <h4 className="font-bold text-slate-800 text-sm leading-snug truncate">
                            {quote.client_name}
                          </h4>
                          {(() => {
                            const qClient = db.clients.find(c => c.id === quote.client_id);
                            if (!qClient?.origem) return null;
                            return (
                              <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                qClient.origem === 'Google' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                qClient.origem === 'Meta Ads' || qClient.origem === 'Meta' || qClient.origem === 'Instagram' || qClient.origem === 'Facebook' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                qClient.origem === 'Indicação' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                Origem: {qClient.origem}
                              </span>
                            );
                          })()}

                          {/* Reminder & Archive Badges in Kanban */}
                          {quote.tem_lembrete && (
                            <div className={`mt-1.5 flex items-center justify-between gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              quote.lembrete_concluido
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : quote.lembrete_data && quote.lembrete_data <= todayDateOnly
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                              <span className="flex items-center gap-1 truncate">
                                <BellRing className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">
                                  {quote.lembrete_concluido 
                                    ? 'Atendido' 
                                    : quote.lembrete_data && quote.lembrete_data <= todayDateOnly 
                                      ? 'Chamar Hoje' 
                                      : formatDate(quote.lembrete_data || '')}
                                </span>
                              </span>
                              {quote.lembrete_motivo && (
                                <span className="truncate text-[9px] font-normal text-slate-600 max-w-[110px]" title={quote.lembrete_motivo}>
                                  {quote.lembrete_motivo}
                                </span>
                              )}
                            </div>
                          )}
                          {quote.arquivado ? (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">
                                <Archive className="w-2 h-2" />
                                Arquivado
                              </span>
                            </div>
                          ) : (concludedOSQuoteIds.has(quote.id) || concludedOSQuoteIds.has(quote.numero)) ? (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                                <CheckCircle2 className="w-2 h-2 text-emerald-600" />
                                OS Concluída
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {/* Value & Info */}
                        <div className="flex justify-between items-center mt-3 border-t border-slate-50 pt-2 text-xs">
                          <div>
                            <span className="font-black text-slate-800 font-display block">
                              {formatCurrency(quote.total)}
                            </span>
                            {quote.desconto && quote.desconto > 0 && (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded inline-flex items-center gap-0.5 mt-0.5">
                                <Tag className="w-2 h-2 text-emerald-600" />
                                -{formatCurrency(quote.desconto)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                            <Clock className="w-3 h-3" />
                            <span>{quote.validade.substring(8, 10)}/{quote.validade.substring(5, 7)}</span>
                          </div>
                        </div>

                        {/* Card Quick Actions */}
                        <div className="mt-3 pt-2 border-t border-slate-50/50 flex items-center justify-between gap-1 flex-wrap">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenQuickReminder(quote)}
                              className={`p-1 rounded-lg transition cursor-pointer ${
                                quote.tem_lembrete 
                                  ? (quote.lembrete_concluido ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50')
                                  : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                              }`}
                              title={quote.tem_lembrete ? "Ver / Editar Lembrete" : "Programar Lembrete"}
                            >
                              <Bell className="w-3.5 h-3.5" />
                            </button>
                            {quote.tem_lembrete && !quote.lembrete_concluido && (
                              <button
                                type="button"
                                onClick={() => handleWhatsAppReminderCall(quote)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                title="Chamar cliente no WhatsApp sobre lembrete"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenFullscreenProposal(quote)}
                              className="p-1 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title="Ver em Tela Cheia (Tirar Print)"
                            >
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenRecibo(quote)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                              title="Emitir Recibo"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleArchive(quote)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              title={quote.arquivado ? "Desarquivar" : "Arquivar"}
                            >
                              {quote.arquivado ? <ArchiveRestore className="w-3.5 h-3.5 text-indigo-600" /> : <Archive className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          <QuoteStatusMenu 
                            quote={quote}
                            onUpdateStatus={handleUpdateStatus}
                            onStartApproval={handleStartApproval}
                            isCompact
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100/60 rounded-2xl p-4 text-center">
                      <p className="text-[10px] font-medium text-slate-400/80 italic leading-snug">
                        Arrastar aqui para mudar o status
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: View Quote Detail */}
      <Modal
        isOpen={isViewOpen && selectedQuote !== null}
        onClose={() => setIsViewOpen(false)}
        title={`Gerador de Proposta — Orçamento ${selectedQuote?.numero}`}
        size="lg"
      >
        {selectedQuote && (
          <div className="space-y-6">
            {/* Tabs Selector + Actions */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 gap-2 no-print">
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setViewTab('document')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
                    viewTab === 'document' 
                      ? 'border-blue-600 text-blue-600 font-extrabold' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  📄 Proposta Oficial (Design Cliente)
                </button>
                <button
                  type="button"
                  onClick={() => setViewTab('details')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
                    viewTab === 'details' 
                      ? 'border-blue-600 text-blue-600 font-extrabold' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  ⚙️ Ficha do Sistema (Gestão Interna)
                </button>
              </div>

              <div className="flex items-center gap-2 pb-2 sm:pb-0">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedQuote) {
                      setIsViewOpen(false);
                      handleOpenFullscreenProposal(selectedQuote);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="Abrir proposta em tela cheia para tirar print"
                >
                  <Camera className="w-3.5 h-3.5 text-amber-600" />
                  <span>Ver em Tela Cheia (Print)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedQuote) {
                      setIsViewOpen(false);
                      handleOpenRecibo(selectedQuote);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="Emitir recibo para este orçamento"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Emitir Recibo</span>
                </button>
              </div>
            </div>

            {viewTab === 'document' ? (
              <OrcamentoDocument quote={selectedQuote} db={db} items={selectedQuote.itens} onClose={() => setIsViewOpen(false)} />
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-start gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Cliente</p>
                    <p className="text-base font-bold text-slate-800 font-display mt-0.5">{selectedQuote.client_name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Criado em: {formatDate(selectedQuote.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-medium">Status Comercial</p>
                    <div className="mt-1">
                      <QuoteStatusMenu 
                        quote={selectedQuote}
                        onUpdateStatus={handleUpdateStatus}
                        onStartApproval={handleStartApproval}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Validade: {formatDate(selectedQuote.validade)}</p>
                  </div>
                </div>

                {/* List of Items */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Itens e Serviços Cotados</h3>
                  <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-2">Descrição</th>
                          <th className="px-4 py-2 text-center">Qtd</th>
                          <th className="px-4 py-2 text-right">Unitário</th>
                          <th className="px-4 py-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {db.quoteItems
                          .filter(item => item.quote_id === selectedQuote.id)
                          .map(item => (
                            <tr key={item.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-medium text-slate-700">{item.descricao}</td>
                              <td className="px-4 py-2.5 text-center text-slate-500 font-medium">{item.qtd}</td>
                              <td className="px-4 py-2.5 text-right text-slate-500">{formatCurrency(item.preco_unit)}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{formatCurrency(item.subtotal)}</td>
                            </tr>
                          ))}
                        <tr className="bg-slate-50/50 font-bold border-t border-slate-100">
                          <td colSpan={3} className="px-4 py-3 text-right text-slate-600">Total do Orçamento</td>
                          <td className="px-4 py-3 text-right text-blue-700 text-sm font-display">{formatCurrency(selectedQuote.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Observações */}
                {selectedQuote.observacoes && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Observações da Proposta</h3>
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 leading-normal">
                      {selectedQuote.observacoes}
                    </div>
                  </div>
                )}

                {/* Quick Actions Footer inside modal */}
                <div className="border-t border-slate-100 pt-4 flex flex-wrap justify-between items-center gap-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {selectedQuote.status !== 'concluido' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedQuote, 'concluido')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-xs"
                        title="Marca como concluído e lança a receita quitada no financeiro"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Concluir (Lança no Financeiro)
                      </button>
                    )}
                    {selectedQuote.status !== 'aprovado' && selectedQuote.status !== 'concluido' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedQuote, 'aprovado')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 text-xs font-semibold rounded-lg transition cursor-pointer"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Marcar Aprovado
                      </button>
                    )}
                    {selectedQuote.status !== 'recusado' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedQuote, 'recusado')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 text-xs font-semibold rounded-lg transition cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Recusar
                      </button>
                    )}
                    {selectedQuote.status === 'rascunho' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedQuote, 'enviado')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 text-xs font-semibold rounded-lg transition cursor-pointer"
                      >
                        Marcar como Enviado
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleWhatsAppShare(selectedQuote)}
                      className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Enviar WhatsApp
                    </button>
                    
                    {selectedQuote.status === 'aprovado' && (
                      <button
                        onClick={() => handleConvertToOS(selectedQuote)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        Gerar O.S.
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal CRUD: Add / Edit Quote */}
      <Modal
        isOpen={isCrudOpen}
        onClose={() => setIsCrudOpen(false)}
        title={editingQuoteId ? "Editar Orçamento" : "Novo Orçamento Comercial"}
        size="lg"
      >
        <form onSubmit={handleSaveQuote} noValidate className="space-y-4">
          {/* Step Progress Navigation for Mobile and Desktop */}
          <div className="border-b border-slate-200/80 pb-3 -mt-1 mb-4">
            <div className="flex items-center gap-1.5 sm:gap-2 w-full">
              <button
                type="button"
                onClick={() => setFormStep(1)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  formStep === 1
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${formStep === 1 ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>1</span>
                <span className="truncate">1. Cliente</span>
              </button>
              <button
                type="button"
                onClick={() => setFormStep(2)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  formStep === 2
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${formStep === 2 ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>2</span>
                <span className="truncate">2. Serviços ({quoteItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFormStep(3)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  formStep === 3
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${formStep === 3 ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>3</span>
                <span className="truncate">3. Fechamento</span>
              </button>
            </div>
          </div>

          {/* PASSO 1: CLIENTE E VALIDADE */}
          <div className={formStep === 1 ? 'space-y-4 animate-fade-in' : 'hidden'}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Client Select & Searchable Combobox */}
            {!isRegisteringClient ? (
              <div 
                ref={clientDropdownRef}
                className="col-span-1 sm:col-span-2 space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 relative"
              >
                {/* Hidden input for HTML5 required form validation */}
                <input
                  type="text"
                  required={!isRegisteringClient}
                  value={clientId}
                  onChange={() => {}}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />

                {selectedClient ? (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700">Cliente Solicitante *</label>
                      <button
                        type="button"
                        onClick={() => {
                          setClientId('');
                          setClientSearchQuery('');
                          setIsClientDropdownOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs transition cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3 text-blue-600" />
                        Trocar Cliente
                      </button>
                    </div>

                    <div className="p-3 bg-white border border-blue-300 rounded-xl flex items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-base shadow-xs">
                          {selectedClient.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 truncate">{selectedClient.nome}</span>
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                              {selectedClient.origem}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="font-mono text-slate-700 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {formatPhone(selectedClient.telefone)}
                            </span>
                            {selectedClient.cidade && (
                              <span className="text-slate-500 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {selectedClient.cidade}{selectedClient.estado ? ` - ${selectedClient.estado}` : ''}
                              </span>
                            )}
                          </div>
                          {selectedClient.endereco && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {selectedClient.endereco}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setClientId('');
                          setClientSearchQuery('');
                          setIsClientDropdownOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg transition cursor-pointer shrink-0"
                        title="Remover seleção"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Cliente Solicitante *
                      </label>
                      <span className="text-[11px] font-medium text-slate-400">
                        {db.clients.length} clientes na base
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={clientSearchQuery}
                        onChange={(e) => {
                          const val = e.target.value;
                          setClientSearchQuery(val);
                          setIsClientDropdownOpen(val.trim().length > 0);
                        }}
                        onFocus={() => {
                          if (clientSearchQuery.trim().length > 0) {
                            setIsClientDropdownOpen(true);
                          }
                        }}
                        placeholder="Buscar cliente cadastrado por nome, telefone ou cidade..."
                        className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition shadow-2xs font-medium"
                        autoComplete="off"
                      />
                      {clientSearchQuery ? (
                        <button
                          type="button"
                          onClick={() => {
                            setClientSearchQuery('');
                            setIsClientDropdownOpen(false);
                            setShowAllClientsList(false);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                          title="Limpar pesquisa"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const next = !isClientDropdownOpen;
                            setShowAllClientsList(next);
                            setIsClientDropdownOpen(next);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                          title={isClientDropdownOpen ? "Ocultar clientes" : "Ver clientes cadastrados"}
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {/* Autocomplete Dropdown */}
                    {isClientDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-80 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                          <span>
                            {clientSearchQuery.trim()
                              ? `${matchingClients.length} cadastrado(s) ${matchingAgendaContacts.length > 0 ? `+ ${matchingAgendaContacts.length} na agenda` : ''}`
                              : 'Clientes cadastrados (digite para filtrar):'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsClientDropdownOpen(false)}
                            className="text-slate-400 hover:text-slate-600 text-[10px] cursor-pointer"
                          >
                            Fechar [x]
                          </button>
                        </div>

                        <div className="overflow-y-auto divide-y divide-slate-50 flex-1">
                          {/* 1. Existing DB Clients */}
                          {matchingClients.map(c => (
                            <div
                              key={c.id}
                              onClick={() => {
                                setClientId(c.id);
                                setClientSearchQuery('');
                                setIsClientDropdownOpen(false);
                              }}
                              className="p-3 hover:bg-blue-50/70 transition cursor-pointer flex items-center justify-between gap-3 group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 text-slate-600 group-hover:text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 transition">
                                  {c.nome.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition truncate">
                                    {c.nome}
                                  </p>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                                    <span className="text-slate-600">{formatPhone(c.telefone)}</span>
                                    {c.cidade && <span className="font-sans text-slate-400 truncate">· {c.cidade}</span>}
                                  </div>
                                  {c.endereco && (
                                    <p className="text-[10px] text-slate-400 truncate max-w-sm mt-0.5">{c.endereco}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="px-2 py-0.5 text-[9px] font-semibold rounded bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700">
                                  {c.origem}
                                </span>
                                <span className="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                                  Selecionar <ArrowRight className="w-3 h-3" />
                                </span>
                              </div>
                            </div>
                          ))}

                          {matchingClients.length === 0 && (
                            <div className="p-6 text-center space-y-3">
                              <p className="text-xs text-slate-500">
                                Nenhum cliente encontrado para <strong className="text-slate-700">"{clientSearchQuery}"</strong>
                              </p>
                              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewClientNome(clientSearchQuery.trim());
                                    setIsRegisteringClient(true);
                                    setIsClientDropdownOpen(false);
                                  }}
                                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Cadastrar "{clientSearchQuery.trim()}"
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setWhatsAppModalInitialTab('search');
                                    setIsWhatsAppBusinessModalOpen(true);
                                    setIsClientDropdownOpen(false);
                                  }}
                                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 fill-white" />
                                  Buscar no WhatsApp Business
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      setNewClientNome('');
                      setNewClientTelefone('');
                      setIsRegisteringClient(true);
                      setIsClientDropdownOpen(false);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-4 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
                    title="Cadastrar um novo cliente diretamente"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Novo Cliente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWhatsAppModalInitialTab('search');
                      setIsWhatsAppBusinessModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 px-4 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
                    title="Buscar contatos do WhatsApp Business no aparelho ou salvos"
                  >
                    <MessageSquare className="w-4 h-4 fill-white" />
                    <span>WhatsApp Business</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="col-span-1 sm:col-span-2 bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-4 animate-fade-in shadow-xs">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    👤 Novo Cadastro de Cliente
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancelNewClient}
                      className="text-slate-400 hover:text-slate-600 text-xs font-semibold transition cursor-pointer"
                    >
                      Voltar para lista
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      value={newClientNome}
                      onChange={(e) => setNewClientNome(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Telefone (DDD + WhatsApp) *</label>
                    <input
                      type="text"
                      value={newClientTelefone}
                      onChange={(e) => setNewClientTelefone(formatPhone(e.target.value))}
                      placeholder="Ex: (54) 99999-9999"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Endereço de Atendimento</label>
                    <input
                      type="text"
                      value={newClientEndereco}
                      onChange={(e) => setNewClientEndereco(e.target.value)}
                      placeholder="Ex: Rua Morom, 1200 - Apto 302"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Cidade</label>
                    <input
                      type="text"
                      value={newClientCidade}
                      onChange={(e) => setNewClientCidade(e.target.value)}
                      placeholder="Passo Fundo"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Origem do Contato</label>
                    <select
                      value={newClientOrigem}
                      onChange={(e) => setNewClientOrigem(e.target.value as ClientOrigin)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
                    >
                      {ORIGINS.map(org => (
                        <option key={org} value={org}>{org}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer font-medium">
                      <input
                        type="checkbox"
                        checked={newClientSaveToPhone}
                        onChange={(e) => setNewClientSaveToPhone(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                      />
                      <span>📱 <strong>Salvar também na Agenda do Celular</strong> (baixa contato para gravar com 1 toque no telefone)</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCancelNewClient}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 text-[11px] font-bold rounded-lg transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveNewClient()}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition cursor-pointer shadow-xs"
                  >
                    Gravar e Selecionar Cliente
                  </button>
                </div>
              </div>
            )}

            {/* Validade */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Validade da Proposta *</label>
              <input
                type="date"
                required
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>
          </div>
        </div>

        {/* PASSO 2: ITENS E SERVIÇOS */}
        <div className={formStep === 2 ? 'space-y-4 animate-fade-in' : 'hidden'}>
          {/* Quote Items Section */}
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Itens do Orçamento
                  </h3>
                  {quoteItems.length > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full border border-blue-200 shadow-2xs font-mono">
                      Prévia Total: {formatCurrency(currentQuoteTotal)} ({quoteItems.length} {quoteItems.length === 1 ? 'item' : 'itens'})
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Selecione serviços do catálogo ou informe as medidas para tapetes (m²). Novos itens adicionados aparecem no topo para rápida visualização.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenQuickNewService(null, '')}
                  className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1"
                  title="Cadastrar serviço que ainda não existe no catálogo"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  Novo Serviço
                </button>
                <button
                  type="button"
                  onClick={() => handleAddItem(true)}
                  className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Adicionar tapete com cálculo de medidas (Largura × Comprimento)"
                >
                  <Ruler className="w-3.5 h-3.5 text-blue-600" />
                  + Tapete por Medida (m²)
                </button>
                <button
                  type="button"
                  onClick={() => handleAddItem(false)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Item
                </button>
              </div>
            </div>

            {/* Persistent Catalog Search Bar: opens empty by default, keeps search bar at top while added items go downwards */}
            <div className="bg-gradient-to-r from-blue-50/90 to-sky-50/90 p-3 sm:p-3.5 rounded-2xl border-2 border-blue-200/90 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-blue-600" />
                  <span>Pesquisar e Adicionar Serviço do Catálogo:</span>
                </label>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">
                  {quoteItems.length} {quoteItems.length === 1 ? 'item adicionado' : 'itens adicionados'}
                </span>
              </div>
              <QuickServiceSearchBar 
                services={db.services}
                onSelectService={handleQuickAddService}
                onRequestCreate={(query) => handleOpenQuickNewService(null, query)}
              />
            </div>

            {quoteItems.length > 0 ? (
              <div className="space-y-3">
                {quoteItems.map((item, index) => {
                  const svc = db.services.find(s => s.id === item.service_id);
                  const isTapete = item.unidade === 'm²' || 
                    item.showDimensions || 
                    svc?.unidade === 'm²' || 
                    svc?.tipo_estofado === 'Tapete' || 
                    svc?.categoria === 'Tapete' || 
                    (svc?.nome && normalizeSearchText(svc.nome).includes('tapete')) || 
                    normalizeSearchText(item.descricao).includes('tapete');

                  const itemSubtotal = (Number(item.qtd) || 0) * (Number(item.preco_unit) || 0);

                  return (
                    <div key={item.id || index} className="bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/90 space-y-3 shadow-2xs">
                      {/* Top Header of Item */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-black text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md flex items-center gap-1.5">
                            <span>Item #{index + 1}</span>
                            {index === 0 && quoteItems.length > 1 && (
                              <span className="text-[9px] font-bold text-blue-700 bg-blue-100/90 border border-blue-200 px-1.5 py-0.5 rounded">
                                Mais recente (topo)
                              </span>
                            )}
                          </span>
                          {svc?.categoria && (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                              {svc.categoria}
                            </span>
                          )}
                          {svc?.tipo_estofado && svc.tipo_estofado !== svc.categoria && (
                            <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                              {svc.tipo_estofado}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-medium">Subtotal deste item:</span>
                          <span className="text-xs font-black text-blue-700 font-mono bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                            {formatCurrency(itemSubtotal)}
                          </span>
                        </div>
                      </div>

                      {/* Service Selection with 100% Full Width and full mouseover title */}
                      <div className="w-full">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[11px] font-bold text-slate-600">
                            Serviço do Catálogo
                          </label>
                          {svc?.nome && (
                            <span 
                              className="text-[11px] text-slate-500 font-medium truncate max-w-[280px]"
                              title={svc.nome}
                            >
                              Valor cadastrado: <strong>{formatCurrency(svc.preco)}{isTapete ? '/m²' : ''}</strong>
                            </span>
                          )}
                        </div>
                        <ServiceSearchSelect
                          value={item.service_id}
                          services={db.services}
                          usageCounts={serviceUsageCounts}
                          onSelect={(selectedSvc) => handleUpdateItem(index, 'service_id', selectedSvc.id)}
                          onRequestCreate={(query) => handleOpenQuickNewService(index, query)}
                        />
                      </div>

                      {/* Values, Calculations and Action Buttons */}
                      <div className="flex flex-wrap items-end justify-between gap-3 pt-1 border-t border-slate-100">
                        {/* Quantity / Area */}
                        <div className="flex-1 min-w-[110px]">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {item.unidade === 'm²' ? 'Área Total (m²)' : 'Quantidade'}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={item.qtd === undefined || item.qtd === null ? '' : item.qtd}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                handleUpdateItem(index, 'qtd', val);
                              }}
                              placeholder="Qtd"
                              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-bold bg-white text-slate-800 shadow-2xs"
                            />
                            {item.unidade === 'm²' && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded pointer-events-none">
                                m²
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Preço Unitário */}
                        <div className="flex-1 min-w-[130px]">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {item.unidade === 'm²' ? 'Preço por m² (R$)' : 'Preço Unitário (R$)'}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.preco_unit === undefined || item.preco_unit === null ? '' : item.preco_unit}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                handleUpdateItem(index, 'preco_unit', val);
                              }}
                              placeholder="0,00"
                              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white font-bold text-slate-800 shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* Subtotal preview block */}
                        <div className="min-w-[120px] text-right bg-blue-50/50 border border-blue-100 px-3 py-1.5 rounded-xl">
                          <span className="block text-[10px] font-bold text-blue-800 uppercase tracking-wider">
                            Subtotal do Item
                          </span>
                          <span className="text-sm sm:text-base font-black text-blue-900 font-mono block">
                            {formatCurrency(itemSubtotal)}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleDimensions(index)}
                            className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                              isTapete
                                ? 'bg-blue-100 text-blue-800 border-blue-300 shadow-2xs'
                                : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                            title="Ajustar medidas de largura e comprimento do tapete para calcular m²"
                          >
                            <Ruler className="w-3.5 h-3.5 text-blue-600" />
                            <span className="hidden sm:inline">Medidas m²</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xl transition shrink-0 cursor-pointer"
                            title="Remover este item do orçamento"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Tapete Dimension Calculator Card */}
                      {isTapete && (
                        <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                              <Ruler className="w-3.5 h-3.5 text-blue-600" />
                              <span>Medidas do Tapete (Cálculo automático de m²)</span>
                            </div>
                            <span className="text-[11px] font-bold text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded-md font-mono">
                              {item.qtd ? `${item.qtd} m²` : '0 m²'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Largura (metros)
                              </label>
                              <input
                                type="number"
                                step="0.05"
                                min="0.1"
                                placeholder="Ex: 2.00"
                                value={item.largura || ''}
                                onChange={(e) => handleUpdateTapeteDimensions(index, parseFloat(e.target.value) || 0, item.comprimento || 0)}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-slate-800"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Comprimento (metros)
                              </label>
                              <input
                                type="number"
                                step="0.05"
                                min="0.1"
                                placeholder="Ex: 2.50"
                                value={item.comprimento || ''}
                                onChange={(e) => handleUpdateTapeteDimensions(index, item.largura || 0, parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-slate-800"
                              />
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-blue-200 flex flex-col justify-center">
                              <span className="text-[10px] text-slate-500 font-medium">Área total calculada</span>
                              <span className="text-xs font-black text-blue-700 font-mono">
                                {item.largura && item.comprimento
                                  ? `${item.largura.toFixed(2)}m × ${item.comprimento.toFixed(2)}m = ${(item.largura * item.comprimento).toFixed(2)} m²`
                                  : `${item.qtd || 1} m²`}
                              </span>
                            </div>
                          </div>

                          {/* Quick size presets */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-blue-200/60">
                            <span className="text-[10px] text-slate-500 font-medium">Tamanhos padrão:</span>
                            {[
                              { l: 1.5, c: 2.0, label: '1.50 × 2.00 (3 m²)' },
                              { l: 2.0, c: 2.5, label: '2.00 × 2.50 (5 m²)' },
                              { l: 2.0, c: 3.0, label: '2.00 × 3.00 (6 m²)' },
                              { l: 2.5, c: 3.5, label: '2.50 × 3.50 (8.75 m²)' },
                              { l: 3.0, c: 4.0, label: '3.00 × 4.00 (12 m²)' },
                            ].map((preset, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => handleUpdateTapeteDimensions(index, preset.l, preset.c)}
                                className="text-[10px] font-semibold px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md transition cursor-pointer"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Espaço para Desconto ou Bônus (logo acima do valor do orçamento) */}
                <div className="p-4 bg-gradient-to-r from-amber-50/80 via-amber-50/40 to-amber-50/80 border-2 border-amber-200/90 rounded-2xl space-y-3.5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-amber-500 text-white rounded-lg shadow-2xs">
                        <Tag className="w-4 h-4" />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                          Desconto ou Bônus Comercial
                          <span className="text-[10px] text-amber-800 font-semibold bg-amber-200/70 px-1.5 py-0.5 rounded-md border border-amber-300/60">
                            Opcional
                          </span>
                        </h4>
                        <p className="text-[11px] text-amber-800/80">
                          Conceda um desconto no valor em Reais (R$) ou percentual (%) para fechar a negociação
                        </p>
                      </div>
                    </div>

                    {/* Toggle Tipo: R$ ou % */}
                    <div className="flex items-center bg-white border border-amber-200 rounded-xl p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setTipoDesconto('valor')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                          tipoDesconto === 'valor'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-amber-900 hover:text-amber-950 hover:bg-amber-50'
                        }`}
                      >
                        <span>R$ Reais</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoDesconto('porcentagem')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                          tipoDesconto === 'porcentagem'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-amber-900 hover:text-amber-950 hover:bg-amber-50'
                        }`}
                      >
                        <Percent className="w-3 h-3" />
                        <span>% Porcentagem</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Input Valor ou Porcentagem */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-bold text-amber-950 mb-1">
                        {tipoDesconto === 'porcentagem' ? 'Porcentagem de Desconto (%)' : 'Valor do Desconto ou Bônus (R$)'}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={tipoDesconto === 'porcentagem' ? 100 : currentQuoteSubtotal}
                          value={tipoDesconto === 'porcentagem' ? descontoPercentual : descontoValor}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (tipoDesconto === 'porcentagem') {
                              setDescontoPercentual(val === '' ? '' : parseFloat(val));
                            } else {
                              setDescontoValor(val === '' ? '' : parseFloat(val));
                            }
                          }}
                          placeholder={tipoDesconto === 'porcentagem' ? 'Ex: 10' : '0,00'}
                          className="w-full pl-3 pr-12 py-2 text-sm border border-amber-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-slate-800 shadow-2xs"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded pointer-events-none">
                          {tipoDesconto === 'porcentagem' ? '%' : 'R$'}
                        </span>
                      </div>
                    </div>

                    {/* Motivo do Desconto ou Bônus */}
                    <div className="sm:col-span-8">
                      <label className="block text-[11px] font-bold text-amber-950 mb-1">
                        Motivo / Descrição do Bônus ou Desconto (opcional)
                      </label>
                      <input
                        type="text"
                        value={descontoMotivo}
                        onChange={(e) => setDescontoMotivo(e.target.value)}
                        placeholder="Ex: Desconto à vista no Pix, Bônus cliente VIP, Promoção do mês..."
                        className="w-full px-3 py-2 text-xs sm:text-sm border border-amber-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-slate-800 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Atalhos Rápidos de Desconto / Bônus */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-amber-200/60 text-xs">
                    <span className="text-[11px] font-bold text-amber-900 mr-1">Atalhos rápidos:</span>
                    {tipoDesconto === 'porcentagem' ? (
                      <>
                        {[5, 10, 15, 20].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setDescontoPercentual(p)}
                            className={`px-2.5 py-1 rounded-lg border font-bold text-xs transition cursor-pointer ${
                              Number(descontoPercentual) === p
                                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-200 shadow-2xs'
                            }`}
                          >
                            {p}%
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        {[20, 30, 50, 100].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setDescontoValor(v)}
                            className={`px-2.5 py-1 rounded-lg border font-bold text-xs transition cursor-pointer ${
                              Number(descontoValor) === v
                                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-200 shadow-2xs'
                            }`}
                          >
                            R$ {v}
                          </button>
                        ))}
                      </>
                    )}
                    {calculatedDiscountValue > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setDescontoValor('');
                          setDescontoPercentual('');
                        }}
                        className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition cursor-pointer ml-auto"
                      >
                        Zerar Desconto
                      </button>
                    )}
                  </div>
                </div>

                {/* Card de Prévia do Valor Total em Tempo Real */}
                <div className="p-4 bg-gradient-to-r from-blue-50 via-slate-50 to-blue-50/80 border-2 border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-blue-600 text-white rounded-lg shadow-2xs">
                        <DollarSign className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-black text-blue-950 uppercase tracking-wider">
                        Prévia do Valor Total do Orçamento
                      </span>
                    </div>
                    <div className="pl-8 space-y-0.5 text-xs text-slate-600">
                      <p>
                        {quoteItems.length} {quoteItems.length === 1 ? 'serviço adicionado' : 'serviços adicionados'} • Cálculo automático em tempo real
                      </p>
                      {calculatedDiscountValue > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          <span className="text-slate-500">
                            Subtotal: <strong className="font-mono text-slate-700">{formatCurrency(currentQuoteSubtotal)}</strong>
                          </span>
                          <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px] flex items-center gap-1">
                            <Tag className="w-3 h-3 text-emerald-600" />
                            Desconto: - {formatCurrency(calculatedDiscountValue)}
                            {tipoDesconto === 'porcentagem' && ` (${descontoPercentual}%)`}
                            {descontoMotivo && ` • ${descontoMotivo}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-blue-100">
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {calculatedDiscountValue > 0 ? 'Valor Final com Desconto' : 'Valor Total Previsto'}
                      </span>
                      <div className="flex items-baseline justify-end gap-2">
                        {calculatedDiscountValue > 0 && (
                          <span className="text-sm font-bold text-slate-400 line-through font-mono">
                            {formatCurrency(currentQuoteSubtotal)}
                          </span>
                        )}
                        <span className="text-2xl sm:text-3xl font-black text-blue-900 font-mono tracking-tight">
                          {formatCurrency(currentQuoteTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 italic">
                Nenhum serviço adicionado ainda. Clique em "Adicionar Item" ou "+ Tapete por Medida" para cotar.
              </div>
            )}
          </div>
        </div>

        {/* PASSO 3: FECHAMENTO, FOTOS, OBSERVAÇÕES & LEMBRETE */}
        <div className={formStep === 3 ? 'space-y-4 animate-fade-in' : 'hidden'}>
          {/* Summary Banner of chosen items */}
          <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-blue-950">Resumo da Proposta</p>
              <p className="text-[11px] text-blue-800">
                {quoteItems.length} {quoteItems.length === 1 ? 'serviço adicionado' : 'serviços adicionados'} • Total: <strong className="font-mono text-sm">{formatCurrency(currentQuoteTotal)}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormStep(2)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-white px-2.5 py-1 rounded-lg border border-blue-300 shadow-2xs transition cursor-pointer"
            >
              Editar Serviços
            </button>
          </div>

          {/* Photos of upholstered furniture, mattress, chairs, armchairs, rugs */}
          <div className="border-t border-slate-100 pt-4">
            <PhotoUploader
              clientId={clientId || 'novo'}
              photos={quotePhotos}
              onChange={(updatedPhotos) => setQuotePhotos(updatedPhotos)}
            />
          </div>

          {/* Observações */}
          <div className="border-t border-slate-100 pt-4">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notas / Observações da Proposta</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Descreva as condições de pagamento, tempo de secagem recomendado, ou descontos especiais inclusos..."
              rows={2}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
            />
          </div>

          {/* Lembrete & Aviso de Retorno do Orçamento */}
          <div className="border-t border-slate-100 pt-4">
            <div className={`p-4 rounded-2xl border transition-all ${
              temLembrete 
                ? 'bg-gradient-to-br from-amber-50/80 via-blue-50/30 to-amber-50/50 border-amber-300 shadow-xs' 
                : 'bg-slate-50 border-slate-200/80'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                    temLembrete ? 'bg-amber-500 text-white shadow-2xs' : 'bg-slate-200 text-slate-500'
                  }`}>
                    <BellRing className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-slate-800 block">
                      Programar Lembrete / Aviso para Chamar o Cliente
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Ex: Cliente pediu orçamento para impermeabilizar, porém o sofá só chega daqui a 30 dias (aviso automático para chamar no dia)
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={temLembrete}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setTemLembrete(enabled);
                      if (enabled && !lembreteData) {
                        const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        setLembreteData(in30Days);
                        if (!lembreteMotivo) {
                          setLembreteMotivo('Sofá novo chegando da loja (impermeabilizar)');
                        }
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {temLembrete && (
                <div className="mt-4 pt-3 border-t border-amber-200/60 space-y-3 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-bold text-amber-950 mb-1">
                        Data Programada para Chamar *
                      </label>
                      <input
                        type="date"
                        value={lembreteData}
                        onChange={(e) => setLembreteData(e.target.value)}
                        className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-slate-800 shadow-2xs"
                        required={temLembrete}
                      />
                    </div>

                    <div className="sm:col-span-7">
                      <label className="block text-[11px] font-bold text-amber-950 mb-1">
                        Motivo / Descrição do Aviso
                      </label>
                      <input
                        type="text"
                        value={lembreteMotivo}
                        onChange={(e) => setLembreteMotivo(e.target.value)}
                        placeholder="Ex: Sofá novo chega daqui a 30 dias (impermeabilizar)..."
                        className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-slate-800 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Quick Preset Buttons for Reminder Date */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                    <span className="text-[10px] font-bold text-amber-900 mr-1">Atalhos de data:</span>
                    {[
                      { label: '+7 dias', days: 7 },
                      { label: '+15 dias', days: 15 },
                      { label: '+30 dias (Sofá chegando)', days: 30 },
                      { label: '+45 dias', days: 45 },
                      { label: '+60 dias', days: 60 },
                    ].map(preset => {
                      const targetDate = new Date(Date.now() + preset.days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                      const isSelected = lembreteData === targetDate;
                      return (
                        <button
                          key={preset.days}
                          type="button"
                          onClick={() => setLembreteData(targetDate)}
                          className={`px-2 py-1 rounded-lg border font-bold text-[11px] transition cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                              : 'bg-white hover:bg-amber-100 text-amber-950 border-amber-200 shadow-2xs'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Suggested Quick Reasons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                    <span className="text-[10px] font-bold text-amber-900 mr-1">Sugestões rápidas de motivo:</span>
                    {[
                      'Sofá novo chega da loja (impermeabilizar)',
                      'Aguardando entrega do estofado novo',
                      'Reforma / Pintura da casa finalizando',
                      'Aguardando virada do cartão de crédito',
                      'Pediu para ligar para fechar data',
                    ].map(sug => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setLembreteMotivo(sug)}
                        className={`px-2 py-0.5 rounded-md border text-[10px] transition cursor-pointer ${
                          lembreteMotivo === sug
                            ? 'bg-amber-200/90 text-amber-950 border-amber-400 font-bold'
                            : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>

                  {editingQuoteId && (
                    <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={lembreteConcluido}
                          onChange={(e) => setLembreteConcluido(e.target.checked)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                        />
                        <span>Marcar lembrete como CONCLUÍDO (cliente já contatado)</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status do Orçamento (Antes de Terminar) */}
          <div className="border-t border-slate-100 pt-4">
            <div className="p-4 bg-gradient-to-r from-slate-50 via-blue-50/20 to-slate-50 border-2 border-slate-200/90 rounded-2xl space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
                      Status da Proposta Comercial *
                      <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">
                        (Defina o status antes de gravar)
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Escolha a situação deste orçamento ao finalizar o cadastro
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-400 font-medium">Status selecionado:</span>
                  <StatusBadge type="quote" status={formStatus} />
                </div>
              </div>

              {/* Status Buttons Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                {[
                  {
                    id: 'rascunho' as QuoteStatus,
                    label: 'Rascunho',
                    sub: 'Em elaboração',
                    icon: FileText,
                    activeClass: 'bg-slate-800 text-white border-slate-900 shadow-xs ring-2 ring-slate-400/40',
                    inactiveClass: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100/80',
                    iconColor: 'text-slate-500',
                  },
                  {
                    id: 'enviado' as QuoteStatus,
                    label: 'Enviado',
                    sub: 'Aguardando cliente',
                    icon: Send,
                    activeClass: 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-400/40',
                    inactiveClass: 'bg-white text-blue-900 border-blue-200 hover:bg-blue-50/80',
                    iconColor: 'text-blue-500',
                  },
                  {
                    id: 'aprovado' as QuoteStatus,
                    label: 'Aprovado',
                    sub: 'Cliente aceitou',
                    icon: CheckCircle,
                    activeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-400/40',
                    inactiveClass: 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50/80',
                    iconColor: 'text-emerald-500',
                  },
                  {
                    id: 'concluido' as QuoteStatus,
                    label: 'Concluído',
                    sub: 'Realizado & Quitado',
                    icon: CheckCircle2,
                    activeClass: 'bg-emerald-700 text-white border-emerald-800 shadow-xs ring-2 ring-emerald-500/40',
                    inactiveClass: 'bg-emerald-50/60 text-emerald-900 border-emerald-300 hover:bg-emerald-100/80',
                    iconColor: 'text-emerald-600',
                  },
                  {
                    id: 'recusado' as QuoteStatus,
                    label: 'Recusado',
                    sub: 'Cliente recusou',
                    icon: XCircle,
                    activeClass: 'bg-rose-600 text-white border-rose-700 shadow-xs ring-2 ring-rose-400/40',
                    inactiveClass: 'bg-white text-rose-900 border-rose-200 hover:bg-rose-50/80',
                    iconColor: 'text-rose-500',
                  },
                  {
                    id: 'expirado' as QuoteStatus,
                    label: 'Expirado',
                    sub: 'Prazo vencido',
                    icon: Clock,
                    activeClass: 'bg-amber-600 text-white border-amber-700 shadow-xs ring-2 ring-amber-400/40',
                    inactiveClass: 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50/80',
                    iconColor: 'text-amber-500',
                  },
                ].map((st) => {
                  const isSelected = formStatus === st.id;
                  const Icon = st.icon;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setFormStatus(st.id);
                        if (st.id === 'aprovado') {
                          setAgendamentoAutomatico(true);
                          setTimeout(() => {
                            const el = document.getElementById('card-agendamento-orcamento');
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              // Focus the datetime input for convenience
                              const input = el.querySelector('input[type="datetime-local"]') as HTMLInputElement | null;
                              input?.focus();
                            }
                          }, 100);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                        isSelected ? st.activeClass : st.inactiveClass
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : st.iconColor}`} />
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div>
                        <span className="text-xs font-bold block leading-tight">{st.label}</span>
                        <span className={`text-[10px] block leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                          {st.sub}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {formStatus === 'aprovado' && (
                <div id="card-agendamento-orcamento" className="p-4 sm:p-5 bg-gradient-to-br from-emerald-50/90 to-blue-50/60 dark:from-[#08281d] dark:to-[#071e3d] border-2 border-emerald-500 rounded-2xl text-slate-800 dark:text-slate-100 shadow-sm space-y-4 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/80 dark:border-emerald-800/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-xs shrink-0">
                        <Calendar className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-emerald-950 dark:text-emerald-100 font-display">
                          📅 Agendamento de Data e Horário (O.S.)
                        </h4>
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                          Orçamento aprovado! Defina a data, horário e equipe para criar a Ordem de Serviço automaticamente.
                        </p>
                      </div>
                    </div>
                    <span className="self-start sm:self-center px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-2xs tracking-tight">
                      Aprovado & Agendado
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Data e Horário do Atendimento *</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={agendamentoDataHora}
                        onChange={(e) => setAgendamentoDataHora(e.target.value)}
                        required={agendamentoAutomatico}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold border-2 border-emerald-300 dark:border-emerald-700/80 bg-white dark:bg-[#071a33] text-slate-800 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Técnico Responsável / Equipe</span>
                      </label>
                      <input
                        type="text"
                        list="tech-suggestions-orcamento"
                        value={agendamentoTecnico}
                        onChange={(e) => setAgendamentoTecnico(e.target.value)}
                        placeholder="Nome do técnico responsável..."
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold border border-slate-200 dark:border-blue-900/60 bg-white dark:bg-[#071a33] text-slate-800 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-2xs"
                      />
                      <datalist id="tech-suggestions-orcamento">
                        {TECNICOS_HIGIPRO.map((tec) => (
                          <option key={tec} value={tec} />
                        ))}
                      </datalist>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Observações para a Execução Técnica (O.S.)</span>
                      </label>
                      <input
                        type="text"
                        value={agendamentoObservacoes}
                        onChange={(e) => setAgendamentoObservacoes(e.target.value)}
                        placeholder="Ex: Apartamento 402, interfone 42, cliente prefere início pontual às 09h..."
                        className="w-full px-3.5 py-2 text-xs border border-slate-200 dark:border-blue-900/60 bg-white dark:bg-[#071a33] text-slate-800 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 dark:text-slate-300 font-semibold">
                      <input
                        type="checkbox"
                        checked={agendamentoAutomatico}
                        onChange={(e) => setAgendamentoAutomatico(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                      />
                      <span>
                        ⚡ Criar <strong>Ordem de Serviço (O.S.)</strong> e agendar automaticamente na <strong>Agenda de Visitas</strong> ao gravar proposta.
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile & Desktop Step Navigation Bar (Sticky Bottom on small screens) */}
        <div className="sticky bottom-0 -mx-3.5 sm:-mx-6 -mb-3.5 sm:-mb-6 p-3 sm:p-4 bg-white/95 dark:bg-[#071a33]/95 backdrop-blur-md border-t border-slate-200 dark:border-blue-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-lg z-20 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          {/* Left: Voltar button & Total preview */}
          <div className="flex items-center justify-between sm:justify-start gap-3">
            {formStep > 1 ? (
              <button
                type="button"
                onClick={() => setFormStep((prev) => (prev === 3 ? 2 : 1))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Voltar à tela anterior</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCrudOpen(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs sm:text-sm rounded-xl transition cursor-pointer"
              >
                <span>Cancelar</span>
              </button>
            )}

            {/* Live price badge */}
            <div className="flex items-center gap-1.5 text-right sm:text-left">
              <span className="text-[10px] text-slate-400 uppercase font-semibold hidden sm:inline">Total:</span>
              <span className="font-mono text-base sm:text-lg font-black text-blue-700">
                {formatCurrency(currentQuoteTotal)}
              </span>
              {calculatedDiscountValue > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md hidden xs:inline">
                  Desc: -{formatCurrency(calculatedDiscountValue)}
                </span>
              )}
              {quoteItems.length > 0 && (
                <span className="text-[11px] text-slate-400 font-medium hidden md:inline">
                  ({quoteItems.length} {quoteItems.length === 1 ? 'item' : 'itens'})
                </span>
              )}
            </div>
          </div>

          {/* Right: Seguir para o próximo passo or Gravar Proposta */}
          <div className="flex items-center gap-2">
            {formStep < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (formStep === 1) {
                    if (!clientId && !isRegisteringClient) {
                      alert('Por favor, selecione ou cadastre um cliente para continuar.');
                      return;
                    }
                    if (isRegisteringClient) {
                      if (!newClientNome.trim() || !newClientTelefone.trim()) {
                        alert('Informe pelo menos o Nome e Telefone do cliente.');
                        return;
                      }
                      handleSaveNewClient();
                    }
                    setFormStep(2);
                  } else if (formStep === 2) {
                    if (quoteItems.length === 0) {
                      if (!window.confirm('Nenhum serviço foi adicionado ainda. Deseja avançar para o fechamento mesmo assim?')) {
                        return;
                      }
                    }
                    setFormStep(3);
                  }
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition cursor-pointer"
              >
                <span>
                  {formStep === 1 ? 'Seguir para o próximo passo: Serviços' : 'Seguir para o próximo passo: Fechamento'}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* Botão de Status antes de terminar */}
                <div className="relative" ref={formStatusDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsFormStatusDropdownOpen(!isFormStatusDropdownOpen)}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl border border-slate-200 transition cursor-pointer shadow-2xs"
                    title="Clique para alterar o status antes de gravar"
                  >
                    <span className="text-[10px] text-slate-400 font-semibold uppercase hidden xs:inline">Status:</span>
                    <StatusBadge type="quote" status={formStatus} />
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {isFormStatusDropdownOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 animate-fade-in space-y-0.5">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        Alterar Status da Proposta
                      </div>
                      {[
                        { id: 'rascunho' as QuoteStatus, label: 'Rascunho', icon: FileText, color: 'text-slate-600' },
                        { id: 'enviado' as QuoteStatus, label: 'Enviado ao Cliente', icon: Send, color: 'text-blue-600' },
                        { id: 'aprovado' as QuoteStatus, label: 'Aprovado pelo Cliente', icon: CheckCircle, color: 'text-emerald-600' },
                        { id: 'recusado' as QuoteStatus, label: 'Recusado', icon: XCircle, color: 'text-rose-600' },
                        { id: 'expirado' as QuoteStatus, label: 'Expirado', icon: Clock, color: 'text-amber-600' },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isCurrent = formStatus === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setFormStatus(item.id);
                              setIsFormStatusDropdownOpen(false);
                              if (item.id === 'aprovado') {
                                setFormStep(3);
                              }
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl transition cursor-pointer ${
                              isCurrent ? 'bg-slate-100 font-bold text-slate-900' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                              <span>{item.label}</span>
                            </div>
                            {isCurrent && <Check className="w-3.5 h-3.5 text-slate-700" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Gravar Proposta ({formatCurrency(currentQuoteTotal)})</span>
                </button>
              </div>
            )}
          </div>
        </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={quoteToDelete !== null}
        onClose={() => setQuoteToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Excluir Orçamento Comercial"
        description={`Tem certeza absoluta que deseja excluir o orçamento ${quoteToDelete?.numero}? Essa operação apagará os itens orçados associados e é irreversível.`}
      />

      {/* Modal: Quick Reminder / Aviso para Chamar */}
      <Modal
        isOpen={quickReminderQuote !== null}
        onClose={() => setQuickReminderQuote(null)}
        title="Programar Lembrete / Aviso para Chamar"
        size="md"
      >
        {quickReminderQuote && (
          <div className="space-y-4">
            <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-950 flex items-center gap-1.5 text-sm">
                  <BellRing className="w-4 h-4 text-amber-600" />
                  {quickReminderQuote.client_name}
                </span>
                <span className="font-mono text-xs text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded">
                  {quickReminderQuote.numero}
                </span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed pt-1">
                Defina uma data e motivo para avisar quando chamar o cliente (ex: cliente cotou impermeabilização, mas o sofá só chega daqui a 30 dias).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Data para Chamar o Cliente *
              </label>
              <input
                type="date"
                value={quickReminderData}
                onChange={(e) => setQuickReminderData(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-slate-800 shadow-2xs"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-slate-500 mr-1">Atalhos rápidos:</span>
              {[
                { label: '+7 dias', days: 7 },
                { label: '+15 dias', days: 15 },
                { label: '+30 dias (Sofá chegando)', days: 30 },
                { label: '+45 dias', days: 45 },
                { label: '+60 dias', days: 60 },
              ].map(preset => {
                const targetDate = new Date(Date.now() + preset.days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const isSelected = quickReminderData === targetDate;
                return (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setQuickReminderData(targetDate)}
                    className={`px-2.5 py-1 rounded-lg border font-bold text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                        : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200 shadow-2xs'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo / Descrição do Aviso
              </label>
              <input
                type="text"
                value={quickReminderMotivo}
                onChange={(e) => setQuickReminderMotivo(e.target.value)}
                placeholder="Ex: Sofá novo chega daqui a 30 dias (impermeabilizar)..."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-slate-800 shadow-2xs"
              />
            </div>

            {/* Quick Reason Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-slate-500 mr-1">Sugestões:</span>
              {[
                'Sofá novo chega da loja (impermeabilizar)',
                'Aguardando entrega do estofado novo',
                'Reforma da casa finalizando',
                'Aguardando virada do cartão',
                'Ligar para fechar agendamento',
              ].map(sug => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setQuickReminderMotivo(sug)}
                  className={`px-2 py-0.5 rounded-md border text-[11px] transition cursor-pointer ${
                    quickReminderMotivo === sug
                      ? 'bg-amber-200 text-amber-950 border-amber-400 font-bold'
                      : 'bg-white hover:bg-amber-50 text-slate-600 border-slate-200'
                  }`}
                >
                  {sug}
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={quickReminderConcluido}
                  onChange={(e) => setQuickReminderConcluido(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span>Marcar lembrete como CONCLUÍDO</span>
              </label>

              <button
                type="button"
                onClick={() => handleWhatsAppReminderCall(quickReminderQuote)}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Chamar no WhatsApp</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100">
              {quickReminderQuote.tem_lembrete ? (
                <button
                  type="button"
                  onClick={handleRemoveQuickReminder}
                  className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition cursor-pointer"
                >
                  Remover Lembrete
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickReminderQuote(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickReminder}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Bell className="w-4 h-4" />
                  <span>Salvar Lembrete</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Automate Scheduling on Approval */}
      <Modal
        isOpen={isApprovalScheduleOpen}
        onClose={() => setIsApprovalScheduleOpen(false)}
        title={`Aprovação & Agendamento — Orçamento ${quoteToApprove?.numero}`}
        size="md"
      >
        <form onSubmit={handleConfirmApproval} className="space-y-4">
          <div className="bg-blue-50/50 border border-blue-100 p-3.5 rounded-xl text-xs text-blue-800 space-y-1">
            <p className="font-extrabold flex items-center gap-1.5 text-blue-900">
              <CheckCircle className="w-4 h-4 text-blue-600 animate-pulse" />
              Parabéns! Orçamento aprovado!
            </p>
            <p className="font-medium text-slate-600 leading-relaxed">
              O sistema irá criar automaticamente uma <strong>Ordem de Serviço (OS)</strong>, lançar a receita em <strong>Contas a Receber (A Receber)</strong> no financeiro, e projetar o atendimento na sua <strong>Agenda de Visitas</strong>. Por favor, confirme os detalhes do agendamento abaixo:
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Técnico Responsável
            </label>
            <div className="relative">
              <input
                type="text"
                list="tech-suggestions-list"
                value={approvalTech}
                onChange={(e) => setApprovalTech(e.target.value)}
                placeholder="Digite o nome do técnico responsável..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition text-slate-800 placeholder:text-slate-400 font-medium"
                autoFocus
              />
              <datalist id="tech-suggestions-list">
                {TECNICOS_HIGIPRO.map((tec) => (
                  <option key={tec} value={tec} />
                ))}
              </datalist>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Campo em branco para digitar livremente quem executará o serviço (ou deixe em branco caso a definir).
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Data e Hora da Execução *
            </label>
            <input
              type="datetime-local"
              required
              value={approvalDateTime}
              onChange={(e) => setApprovalDateTime(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Observações Adicionais para a O.S.
            </label>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Ex: Cliente solicita ligar 30 min antes de chegar, levar protetor de sapato..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 mt-4">
            <button
              type="button"
              onClick={() => setIsApprovalScheduleOpen(false)}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition cursor-pointer"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleApproveWithoutSchedule}
              className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-sm font-semibold rounded-xl transition cursor-pointer"
              title="Apenas marcar como aprovado sem gerar agendamento na agenda agora"
            >
              Apenas Marcar Aprovado
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
            >
              Aprovar & Agendar Agora
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Phone Contact Selector Fallback */}
      <Modal
        isOpen={showContactPickerFallback}
        onClose={() => setShowContactPickerFallback(false)}
        title="📱 Agenda de Contatos do Telefone"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Selecione uma das opções abaixo para importar ou buscar contatos do cliente com facilidade:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setShowContactPickerFallback(false);
                setIsGoogleContactsOpen(true);
              }}
              className="p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-left transition cursor-pointer flex items-center gap-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-900">Agenda do Telefone & Google</p>
                <p className="text-[10px] text-indigo-700">Importar contatos salvos</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowContactPickerFallback(false);
                setIsRegisteringClient(true);
              }}
              className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-left transition cursor-pointer flex items-center gap-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-900">Novo Cadastro Manual</p>
                <p className="text-[10px] text-blue-700">Digitar dados do cliente</p>
              </div>
            </button>
          </div>
          
          {/* Contact Search Input */}
          <div className="relative pt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar clientes cadastrados..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
            />
          </div>

          {/* Contact List */}
          <div className="max-h-[260px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
            {/* Registered clients matching search */}
            {(db?.clients || []).filter(c => {
              if (!c) return false;
              if (!contactSearch.trim()) return true;
              const q = normalizeText(c.nome);
              const searchQ = normalizeText(contactSearch);
              const d = contactSearch.replace(/\D/g, '');
              const phoneClean = String(c.telefone || '').replace(/\D/g, '');
              return q.includes(searchQ) || (d && phoneClean.includes(d));
            }).slice(0, 15).map(client => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  setClientId(client.id);
                  setClientSearchQuery('');
                  setIsClientDropdownOpen(false);
                  setIsRegisteringClient(false);
                  setShowContactPickerFallback(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-blue-50/70 transition flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition">
                      {client.nome}
                    </p>
                    <span className="text-[9px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded">
                      {client.origem || 'Cliente'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                    {formatPhone(client.telefone)} {client.cidade ? `· ${client.cidade}` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                  Selecionar
                </span>
              </button>
            ))}

            {db.clients.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400 italic">
                Nenhum contato encontrado.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal: Quick Register New Service into Catalog */}
      <Modal
        isOpen={isQuickServiceModalOpen}
        onClose={() => {
          setIsQuickServiceModalOpen(false);
          setQuickServiceTargetItemIndex(null);
        }}
        title="Cadastrar Novo Serviço no Catálogo"
      >
        <form onSubmit={handleSaveQuickService} className="space-y-4">
          <p className="text-xs text-slate-500">
            Cadastre este serviço rapidamente. Ele ficará salvo no catálogo oficial de serviços da HigiPro e selecionado neste orçamento.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nome do Serviço *
            </label>
            <input
              type="text"
              required
              value={quickServiceName}
              onChange={(e) => setQuickServiceName(e.target.value)}
              placeholder="Ex: Higienização Sofá 3 Lugares com Chaise"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Categoria *
              </label>
              <select
                value={quickServiceCategory}
                onChange={(e) => {
                  const cat = e.target.value as ServiceCategory;
                  setQuickServiceCategory(cat);
                  if (cat === 'Tapete') {
                    setQuickServiceType('Tapete');
                    setQuickServiceUnit('m²');
                  }
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
              >
                <option value="Higienização">Higienização</option>
                <option value="Impermeabilização">Impermeabilização</option>
                <option value="Limpeza">Limpeza</option>
                <option value="Sanitização">Sanitização</option>
                <option value="Tapete">Tapete</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tipo de Estofado *
              </label>
              <select
                value={quickServiceType}
                onChange={(e) => {
                  const val = e.target.value as SofaType;
                  setQuickServiceType(val);
                  if (val === 'Tapete') {
                    setQuickServiceUnit('m²');
                  }
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
              >
                <option value="Sofá">Sofá</option>
                <option value="Poltrona">Poltrona</option>
                <option value="Colchão">Colchão</option>
                <option value="Cadeira">Cadeira</option>
                <option value="Tapete">Tapete</option>
                <option value="Carro">Carro</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Unidade de Cobrança
              </label>
              <select
                value={quickServiceUnit}
                onChange={(e) => setQuickServiceUnit(e.target.value as 'un' | 'm²')}
                className="w-full px-3 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
              >
                <option value="un">Por Unidade (un)</option>
                <option value="m²">Por Metro Quadrado (m²)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Preço de Venda (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={quickServicePrice}
                onChange={(e) => setQuickServicePrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsQuickServiceModalOpen(false);
                setQuickServiceTargetItemIndex(null);
              }}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Salvar e Adicionar ao Orçamento
            </button>
          </div>
        </form>
      </Modal>

      {/* Google Contacts Management Modal */}
      <GoogleContactsModal
        isOpen={isGoogleContactsOpen}
        onClose={() => setIsGoogleContactsOpen(false)}
        db={db}
        onUpdateDb={onUpdateDb}
        onSelectContactForQuote={handleSelectGoogleContact}
        initialTab={contactsModalTab}
      />

      {/* WhatsApp Business Contacts Modal */}
      <WhatsAppBusinessContactModal
        isOpen={isWhatsAppBusinessModalOpen}
        onClose={() => setIsWhatsAppBusinessModalOpen(false)}
        onSelectContact={handleApplyWhatsAppContactToNewClient}
        initialTab={whatsAppModalInitialTab}
        existingClients={db.clients}
      />

      {/* FULL SCREEN VIEW FOR QUOTES (Perfeito para tirar print no celular e desktop) */}
      {isFullscreenProposalOpen && fullscreenProposalQuote && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md overflow-hidden p-1 sm:p-2 flex flex-col items-center justify-center select-none animate-fade-in">
          {/* Safe Area for iPhone notch / Dynamic Island */}
          <div className="ios-safe-top w-full shrink-0" />

          <div className="w-full max-w-[850px] h-full flex-1 flex flex-col items-center justify-center overflow-hidden">
            <OrcamentoDocument 
              quote={fullscreenProposalQuote} 
              db={db} 
              items={fullscreenProposalQuote.itens}
              initialFitScreen={true}
              onEmitRecibo={() => {
                setReciboQuote(fullscreenProposalQuote);
                setIsReciboOpen(true);
              }}
              onClose={() => {
                setIsFullscreenProposalOpen(false);
                setFullscreenProposalQuote(null);
              }} 
            />
          </div>
        </div>
      )}

      {/* Recibo de Serviço Modal / Fullscreen */}
      {isReciboOpen && reciboQuote && (
        <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-md overflow-y-auto p-2 sm:p-6 pb-16 flex flex-col items-center select-none animate-fade-in">
          {/* Safe Area */}
          <div className="ios-safe-top w-full" />

          {/* Quick Header Bar */}
          <div className="w-full max-w-[750px] mb-2 flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => {
                setIsReciboOpen(false);
                setReciboQuote(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 shadow-md cursor-pointer active:scale-95"
              title="Voltar ao orçamento"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>Voltar ao Orçamento</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsReciboOpen(false);
                setReciboQuote(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer active:scale-95"
              title="Fechar recibo"
            >
              <X className="w-3.5 h-3.5" />
              <span>Fechar</span>
            </button>
          </div>

          <ReciboDocument
            quote={reciboQuote}
            db={db}
          />
        </div>
      )}

      {/* Import Quotes Spreadsheet Modal */}
      <ImportarOrcamentosModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        db={db}
        onUpdateDb={onUpdateDb}
      />

      {/* Modal: Calculadora de Orçamento */}
      <Modal
        isOpen={isCalculatorModalOpen}
        onClose={() => setIsCalculatorModalOpen(false)}
        title="Calculadora de Orçamento Ideal"
        size="xl"
      >
        <div className="py-2">
          <CalculadoraOrcamento
            db={db}
            onUpdateDb={onUpdateDb}
            isEmbedded={true}
            onApplyToQuote={(price, details) => {
              setIsCalculatorModalOpen(false);
              if (isCrudOpen) {
                setQuoteItems(prev => {
                  if (prev.length > 0) {
                    return prev.map((item, idx) => idx === 0 ? { ...item, preco_unit: price } : item);
                  }
                  return [{
                    id: generateId(),
                    service_id: 'calc-ideal',
                    descricao: 'Higienização Especializada de Estofados',
                    qtd: 1,
                    preco_unit: price,
                    unidade: 'un'
                  }];
                });
                setObservacoes(prev => prev ? `${prev}\n${details}` : details);
              } else {
                handleCreateOpen();
                setTimeout(() => {
                  setQuoteItems([{
                    id: generateId(),
                    service_id: 'calc-ideal',
                    descricao: 'Higienização Especializada de Estofados',
                    qtd: 1,
                    preco_unit: price,
                    unidade: 'un'
                  }]);
                  setObservacoes(details);
                }, 50);
              }
            }}
          />
        </div>
      </Modal>
    </div>
  );
});
