/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { 
  Search, Plus, Filter, MessageSquare, Edit2, Trash2, 
  Upload, Check, AlertCircle, FileSpreadsheet, Loader2, Info,
  ChevronLeft, ChevronRight, Sparkles, CopyCheck, CheckCircle2, Layers,
  MapPin, Compass, Smartphone, Clipboard
} from 'lucide-react';
import { Client, DatabaseState, ClientOrigin } from '../types';
import { formatPhone, cleanWhatsAppPhone, formatDate, cn, stripCountryCode } from '../lib/utils';
import { ORIGINS, generateId, deduplicateDatabase, DeduplicateResult } from '../lib/database';
import { supabaseSaveClient, supabaseDeleteClient } from '../lib/supabase';
import { parseExcelFile, ImportResult } from '../lib/importXlsx';
import { Modal, ConfirmDialog, EmptyState } from './UIComponents';
import { GoogleContactsModal, ContactModalTab } from './GoogleContactsModal';
import { WhatsAppBusinessContactModal } from './WhatsAppBusinessContactModal';
import { GoogleMapsAddressInput } from './GoogleMapsAddressInput';
import { ClientesGraficos } from './ClientesGraficos';
import { searchAllCachedContacts } from '../lib/googleContacts';
import { subscribeToContactsStorage } from '../lib/contactsStorage';

interface ClientesProps {
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
  onSelectClient: (client: Client) => void;
  onOpenDrawer: () => void;
  onSelectContactForQuote?: (client: Client) => void;
}

export const Clientes = React.memo<ClientesProps>(({ 
  db, onUpdateDb, onSelectClient, onOpenDrawer, onSelectContactForQuote 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [originFilter, setOriginFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;
  
  // Google Contacts modal state
  const [isGoogleContactsOpen, setIsGoogleContactsOpen] = useState(false);
  const [googleContactsInitialTab, setGoogleContactsInitialTab] = useState<ContactModalTab>('google');
  const [contactsStorageVersion, setContactsStorageVersion] = useState(0);

  useEffect(() => {
    return subscribeToContactsStorage(() => {
      setContactsStorageVersion(v => v + 1);
    });
  }, []);

  // WhatsApp Business modal state
  const [isWhatsAppBusinessModalOpen, setIsWhatsAppBusinessModalOpen] = useState(false);
  const [whatsAppModalInitialTab, setWhatsAppModalInitialTab] = useState<'search' | 'paste' | 'device' | 'vcf'>('search');

  const handleApplyWhatsAppContactToForm = (contact: { nome: string; telefone: string; email?: string; endereco?: string }) => {
    setFormData(prev => ({
      ...prev,
      nome: contact.nome || prev.nome,
      telefone: formatPhone(contact.telefone || prev.telefone),
      email: contact.email || prev.email,
      endereco: contact.endereco || prev.endereco
    }));
    setIsCrudOpen(true);
  };

  const handleQuickPickWhatsAppDevice = async () => {
    if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'select' in (navigator as any).contacts) {
      try {
        const contacts = await (navigator as any).contacts.select(['name', 'tel', 'email', 'address'], { multiple: false });
        if (contacts && contacts.length > 0) {
          const c = contacts[0];
          const nome = Array.isArray(c.name) ? c.name[0] : (c.name || '');
          const tel = Array.isArray(c.tel) ? c.tel[0] : (c.tel || '');
          const email = Array.isArray(c.email) ? c.email[0] : (c.email || '');
          const addrObj = Array.isArray(c.address) ? c.address[0] : c.address;
          const endereco = typeof addrObj === 'string' ? addrObj : (addrObj?.addressLine?.join(', ') || addrObj?.street || '');
          
          setFormData(prev => ({
            ...prev,
            nome: nome || prev.nome,
            telefone: formatPhone(tel || prev.telefone),
            email: email || prev.email,
            endereco: endereco || prev.endereco
          }));
          return;
        }
      } catch {
        // User cancelled or not supported
      }
    }
    setWhatsAppModalInitialTab('device');
    setIsWhatsAppBusinessModalOpen(true);
  };

  // Deduplication state
  const [isDedupModalOpen, setIsDedupModalOpen] = useState(false);
  const [isDeduping, setIsDeduping] = useState(false);
  const [dedupSuccessMsg, setDedupSuccessMsg] = useState<string | null>(null);

  // Pre-calculate deduplication preview
  const dedupPreview = useMemo(() => {
    return deduplicateDatabase(db);
  }, [db]);

  const potentialDupsCount = dedupPreview.mergedClients + dedupPreview.removedOrders + dedupPreview.removedQuotes;

  const handleExecuteDeduplication = () => {
    setIsDeduping(true);
    setTimeout(() => {
      const result = deduplicateDatabase(db);
      onUpdateDb(result.cleanDb);
      setIsDeduping(false);
      setDedupSuccessMsg(
        `Limpeza concluída com sucesso! ${result.mergedClients} clientes mesclados e ${result.removedOrders} pedidos duplicados removidos.`
      );
    }, 250);
  };

  // CRUD state
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  // Reset page when search or origin changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, originFilter]);

  // Excel import state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] = useState<ImportResult | null>(null);
  const [importedData, setImportedData] = useState<any | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields State
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    email: '',
    endereco: '',
    bairro: '',
    regiao: '',
    cidade: db.companySettings?.cidade || 'Passo Fundo',
    estado: db.companySettings?.estado || 'RS',
    CEP: '',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    observacoes: '',
    tags: '',
    origem: 'Google' as ClientOrigin,
  });

  // Client origins color scheme
  const originColors: Record<string, string> = {
    Google: 'bg-blue-50 text-blue-700 border-blue-100',
    'Meta Ads': 'bg-indigo-50 text-indigo-700 border-indigo-100',
    Meta: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    Facebook: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    Instagram: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    Indicação: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    Site: 'bg-amber-50 text-amber-700 border-amber-100',
    Outros: 'bg-slate-50 text-slate-700 border-slate-100',
  };

  // Filter and sort clients alphabetically with ultra-fast search and sorting
  const filteredClients = useMemo(() => {
    if (!Array.isArray(db?.clients)) return [];
    const term = (deferredSearchTerm || '').toLowerCase().trim();

    let list = db.clients;
    if (originFilter) {
      list = list.filter(c => c && c.origem === originFilter);
    }

    if (term) {
      const digitsTerm = term.replace(/\D/g, '');
      list = list.filter(client => {
        if (!client) return false;
        const normName = (client.nome || '').toLowerCase();
        if (normName.includes(term)) return true;

        const rawPhone = client.telefone || '';
        if (rawPhone.includes(term)) return true;
        if (digitsTerm.length >= 2 && rawPhone.replace(/\D/g, '').includes(digitsTerm)) return true;

        if ((client.cidade || '').toLowerCase().includes(term)) return true;
        if ((client.bairro || '').toLowerCase().includes(term)) return true;
        if ((client.endereco || '').toLowerCase().includes(term)) return true;
        if ((client.email || '').toLowerCase().includes(term)) return true;

        if (Array.isArray(client.historico_servicos)) {
          for (let i = 0; i < client.historico_servicos.length; i++) {
            const h = client.historico_servicos[i];
            if ((h?.nome_servico || h?.servico || '').toLowerCase().includes(term)) return true;
          }
        }
        return false;
      });
    }

    // Fast alphabetic sort without slow localeCompare overhead
    return [...list].sort((a, b) => {
      const na = (a?.nome || '').toLowerCase();
      const nb = (b?.nome || '').toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  }, [db?.clients, deferredSearchTerm, originFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const paginatedClients = filteredClients.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Cached phone and name sets for fast exclusion in Agenda lookup
  const { clientPhoneLast8, clientNames } = useMemo(() => {
    const phoneSet = new Set<string>();
    const nameSet = new Set<string>();
    (db?.clients || []).forEach(c => {
      if (c?.telefone) {
        const last8 = stripCountryCode(c.telefone).slice(-8);
        if (last8.length >= 8) phoneSet.add(last8);
      }
      if (c?.nome) {
        nameSet.add(c.nome.toLowerCase().trim());
      }
    });
    return { clientPhoneLast8: phoneSet, clientNames: nameSet };
  }, [db?.clients]);

  // Matching contacts from Phone & Google Contacts cache (for instant lookup in Clientes CRM)
  const matchingAgendaContacts = useMemo(() => {
    const term = (deferredSearchTerm || '').trim();
    if (term.length < 2) return [];

    let results: any[] = [];
    try {
      results = searchAllCachedContacts(term);
    } catch (err) {
      console.warn('Erro ao buscar contatos da agenda:', err);
      return [];
    }
    if (!Array.isArray(results) || !results.length) return [];

    return results.filter(r => {
      if (!r) return false;
      const cleanPhone = stripCountryCode(r.phone);
      const cleanName = String(r.name || '').toLowerCase().trim();
      const matchesPhone = cleanPhone.length >= 8 && clientPhoneLast8.has(cleanPhone.slice(-8));
      const matchesName = cleanName && clientNames.has(cleanName);
      return !matchesPhone && !matchesName;
    });
  }, [deferredSearchTerm, clientPhoneLast8, clientNames, contactsStorageVersion]);

  const handleQuickAddAgendaContact = (contact: any): Client => {
    const cleanPhone = stripCountryCode(contact.phone || '');
    const newClient: Client = {
      id: generateId(),
      nome: contact.name.trim() || 'Novo Cliente',
      telefone: cleanPhone,
      email: contact.email || '',
      endereco: contact.address || '',
      cidade: contact.city || db.companySettings?.cidade || 'Passo Fundo',
      estado: db.companySettings?.estado || 'RS',
      CEP: '',
      observacoes: `Cadastrado direto da busca rápida da ${contact.source === 'google' ? 'Agenda Google' : 'Agenda do Celular'}.`,
      tags: ['Agenda'],
      origem: 'Google' as ClientOrigin,
      created_at: new Date().toISOString(),
    };
    onUpdateDb({
      ...db,
      clients: [newClient, ...db.clients],
    });
    supabaseSaveClient(newClient).catch(() => {});
    return newClient;
  };

  // Open CRUD Modal for Create
  const handleCreateOpen = () => {
    setEditingClient(null);
    setFormData({
      nome: '',
      telefone: '',
      email: '',
      endereco: '',
      bairro: '',
      regiao: '',
      cidade: db.companySettings?.cidade || 'Passo Fundo',
      estado: db.companySettings?.estado || 'RS',
      CEP: '',
      lat: undefined,
      lng: undefined,
      observacoes: '',
      tags: '',
      origem: 'Google',
    });
    setIsCrudOpen(true);
  };

  // Open CRUD Modal for Edit
  const handleEditOpen = (client: Client) => {
    setEditingClient(client);
    setFormData({
      nome: client.nome,
      telefone: client.telefone,
      email: client.email,
      endereco: client.endereco,
      bairro: client.bairro || '',
      regiao: client.regiao || client.bairro || '',
      cidade: client.cidade || db.companySettings?.cidade || 'Passo Fundo',
      estado: client.estado || db.companySettings?.estado || 'RS',
      CEP: client.CEP || '',
      lat: client.lat,
      lng: client.lng,
      observacoes: client.observacoes,
      tags: client.tags.join(', '),
      origem: client.origem,
    });
    setIsCrudOpen(true);
  };

  // Handle Save
  const handleSaveClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim()) return;

    const tagsArray = formData.tags
      ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    if (editingClient) {
      // Update
      const savedClient: Client = {
        ...editingClient,
        nome: formData.nome.trim(),
        telefone: stripCountryCode(formData.telefone),
        email: formData.email.trim(),
        endereco: formData.endereco.trim(),
        bairro: formData.bairro?.trim() || undefined,
        regiao: formData.regiao?.trim() || formData.bairro?.trim() || undefined,
        cidade: formData.cidade.trim(),
        estado: formData.estado,
        CEP: formData.CEP.trim(),
        lat: formData.lat,
        lng: formData.lng,
        observacoes: formData.observacoes.trim(),
        tags: tagsArray,
        origem: formData.origem,
      };

      const updatedClients = db.clients.map(c => c.id === editingClient.id ? savedClient : c);
      onUpdateDb({ ...db, clients: updatedClients });
      supabaseSaveClient(savedClient);
    } else {
      // Create
      const newClient: Client = {
        id: generateId(),
        nome: formData.nome.trim(),
        telefone: stripCountryCode(formData.telefone),
        email: formData.email.trim(),
        endereco: formData.endereco.trim(),
        bairro: formData.bairro?.trim() || undefined,
        regiao: formData.regiao?.trim() || formData.bairro?.trim() || undefined,
        cidade: formData.cidade.trim(),
        estado: formData.estado,
        CEP: formData.CEP.trim(),
        lat: formData.lat,
        lng: formData.lng,
        observacoes: formData.observacoes.trim(),
        tags: tagsArray,
        origem: formData.origem,
        created_at: new Date().toISOString().split('T')[0],
      };
      onUpdateDb({ ...db, clients: [newClient, ...db.clients] });
      supabaseSaveClient(newClient);
    }

    setIsCrudOpen(false);
  };

  // Handle Delete
  const handleDeleteConfirm = () => {
    if (!clientToDelete) return;
    const clientId = clientToDelete.id;
    const updatedClients = db.clients.filter(c => c.id !== clientId);
    onUpdateDb({ ...db, clients: updatedClients });
    supabaseDeleteClient(clientId);
    setClientToDelete(null);
  };

  // WhatsApp helper
  const handleWhatsAppClick = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const cleanPhone = cleanWhatsAppPhone(phone);
    if (!cleanPhone) return;
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  // ==========================================
  // EXCEL IMPORT CONTROLS
  // ==========================================
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const processFile = async (file: File) => {
    const fileName = file.name.toLowerCase();
    const isExcelOrCsv = 
      fileName.endsWith('.xlsx') || 
      fileName.endsWith('.xls') || 
      fileName.endsWith('.csv') || 
      file.type.includes('spreadsheet') || 
      file.type.includes('excel') || 
      file.type.includes('csv');

    if (!isExcelOrCsv) {
      alert('Por favor, envie um arquivo nos formatos Excel (.xlsx, .xls) ou CSV (.csv)');
      return;
    }

    setIsImporting(true);
    setImportProgress(10);

    try {
      const result = await parseExcelFile(file, (percent) => {
        setImportProgress(percent);
      });

      setImportedData(result);
      setImportSummary(result.summary);
    } catch (err: any) {
      console.error('Error parsing excel file', err);
      alert(`Falha ao ler o arquivo Excel: ${err?.message || 'Verifique se o arquivo não está corrompido ou protegido por senha.'}`);
      setIsImporting(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const applyImportedData = () => {
    if (!importedData) return;

    // Merge logic: matching on name
    const existingClients = [...db.clients];
    const newClients = importedData.clients.filter(
      (newC: Client) => !existingClients.some(ext => ext.nome.toLowerCase() === newC.nome.toLowerCase())
    );
    const mergedClients = [...newClients, ...existingClients];

    // Merge services
    const existingServices = [...db.services];
    const newServices = importedData.services.filter(
      (newS: any) => !existingServices.some(ext => ext.nome.toLowerCase() === newS.nome.toLowerCase())
    );
    const mergedServices = [...newServices, ...existingServices];

    // Append quotes, orders, transactions, recurrences
    const mergedQuotes = [...importedData.quotes, ...db.quotes];
    const mergedOS = [...importedData.os, ...db.serviceOrders];
    const mergedTransactions = [...importedData.transactions, ...db.transactions];
    const mergedRecurrences = [...importedData.recurrences, ...db.recurrences];

    // Clean and deduplicate automatically to prevent repeated imports from creating duplicates
    const cleanResult = deduplicateDatabase({
      ...db,
      clients: mergedClients,
      services: mergedServices,
      quotes: mergedQuotes,
      serviceOrders: mergedOS,
      transactions: mergedTransactions,
      recurrences: mergedRecurrences
    });

    onUpdateDb(cleanResult.cleanDb);

    // Reset import states
    setImportedData(null);
    setImportSummary(null);
    setIsImporting(false);
    setImportProgress(0);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cancelImport = () => {
    setImportedData(null);
    setImportSummary(null);
    setIsImporting(false);
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 font-display">Clientes (CRM)</h1>
          <p className="text-sm text-slate-500">Cadastre, gerencie, filtre e visualize o histórico comercial de seus clientes.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => {
              setDedupSuccessMsg(null);
              setIsDedupModalOpen(true);
            }}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-semibold rounded-xl transition shadow-2xs cursor-pointer"
            title="Revisar e remover clientes e pedidos duplicados"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            Revisar Duplicados
            {potentialDupsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[11px] bg-amber-100 text-amber-800 font-bold rounded-full">
                {potentialDupsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setWhatsAppModalInitialTab('search');
              setIsWhatsAppBusinessModalOpen(true);
            }}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
            title="Buscar e importar contatos do WhatsApp Business"
          >
            <MessageSquare className="w-4 h-4 fill-white" />
            WhatsApp
          </button>
          <button
            onClick={() => {
              setGoogleContactsInitialTab('google');
              setIsGoogleContactsOpen(true);
            }}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-semibold rounded-xl transition shadow-2xs cursor-pointer"
            title="Sincronizar com Google Contatos"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Google Contatos
          </button>
          <button
            onClick={() => {
              setGoogleContactsInitialTab('phone_vcf');
              setIsGoogleContactsOpen(true);
            }}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-sm font-semibold rounded-xl transition shadow-2xs cursor-pointer"
            title="Importar contatos da agenda do celular ou arquivo .vcf"
          >
            <Smartphone className="w-4 h-4 text-indigo-600" />
            Agenda Celular
          </button>
          <button
            onClick={handleCreateOpen}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Cliente
          </button>
        </div>
      </div>

      {/* Gráficos de Inteligência da Base de Clientes (CRM) */}
      <ClientesGraficos db={db} />

      {/* Search and Filters & Excel Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Client Filters & Lists */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone, bairro, região ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Origin Filter */}
            <div className="relative w-full sm:w-48">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <select
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-sm bg-slate-50 border border-slate-100 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
              >
                <option value="">Todas Origens</option>
                {ORIGINS.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Matching Agenda / Google Contacts found for search query */}
          {matchingAgendaContacts.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200/90 rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold text-blue-900">
                    Encontrado na sua Agenda ({matchingAgendaContacts.length})
                  </h4>
                </div>
                <span className="text-[11px] text-blue-700 font-medium">Toque para cadastrar em 1 clique</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {matchingAgendaContacts.slice(0, 4).map((c) => (
                  <div key={c.id} className="bg-white p-3 rounded-xl border border-blue-100 flex items-center justify-between gap-2 shadow-2xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-xs truncate">{c.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-slate-100 text-slate-600 font-medium rounded-md">
                          {c.source === 'google' ? 'Google' : 'Celular'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono truncate">{formatPhone(c.phone)}</p>
                      {c.city && <p className="text-[10px] text-slate-400 truncate">{c.city}</p>}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleQuickAddAgendaContact(c)}
                        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition shadow-2xs cursor-pointer flex items-center gap-1"
                        title="Cadastrar cliente no HigiPro"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cadastrar</span>
                      </button>
                      {onSelectContactForQuote && (
                        <button
                          type="button"
                          onClick={() => {
                            const newClient = handleQuickAddAgendaContact(c);
                            onSelectContactForQuote(newClient);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition shadow-2xs cursor-pointer"
                          title="Cadastrar e usar no orçamento"
                        >
                          Orçar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Client Cards Grid */}
          {filteredClients.length > 0 ? (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>
                  Exibindo <strong>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                  <strong>{Math.min(currentPage * pageSize, filteredClients.length)}</strong> de{' '}
                  <strong>{filteredClients.length}</strong> clientes
                </span>
                {totalPages > 1 && (
                  <span>Página {currentPage} de {totalPages}</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {paginatedClients.map(client => {
                  const initial = client.nome ? client.nome.charAt(0).toUpperCase() : '?';
                  return (
                    <div
                      key={client.id}
                      onClick={() => {
                        onSelectClient(client);
                        onOpenDrawer();
                      }}
                      className="p-5 bg-white border border-slate-100 hover:border-slate-200 hover:shadow-md rounded-2xl transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        {/* Top Header Card */}
                        <div className="flex justify-between items-start gap-2 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 font-semibold text-base font-display flex items-center justify-center">
                              {initial}
                            </div>
                            <div className="truncate">
                              <h3 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition truncate max-w-[150px] sm:max-w-[180px]">
                                {client.nome}
                              </h3>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {client.cidade || 'Passo Fundo'} - {client.estado || 'RS'}
                                {(client.bairro || client.regiao) ? ` • ${client.bairro || client.regiao}` : ''}
                              </p>
                            </div>
                          </div>
                          <span className={`px-2.5 py-0.5 text-[10px] font-semibold border rounded-lg ${originColors[client.origem]}`}>
                            {client.origem}
                          </span>
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-1 text-xs text-slate-500 mt-2">
                          <p className="font-mono">{formatPhone(client.telefone)}</p>
                          {client.email && <p className="truncate">{client.email}</p>}
                          <p className="truncate text-slate-400">{client.endereco || 'Endereço não informado'}</p>
                          {(client.bairro || client.regiao) && (
                            <div className="pt-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                                <MapPin className="w-2.5 h-2.5 text-blue-600" />
                                Região: {client.bairro || client.regiao}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* History badges (executed services & quotes) */}
                        {client.historico_servicos && client.historico_servicos.length > 0 && (() => {
                          const execCount = client.historico_servicos.filter(s => (s as any).tipo === 'servico' || s.status === 'concluido').length;
                          const quoteCount = client.historico_servicos.filter(s => (s as any).tipo === 'orcamento' || s.status === 'orcado').length;
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                              {execCount > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  {execCount} {execCount === 1 ? 'serviço' : 'serviços'}
                                </span>
                              )}
                              {quoteCount > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 rounded-md">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  {quoteCount} {quoteCount === 1 ? 'orçamento' : 'orçamentos'}
                                </span>
                              )}
                              {(client as any).ultimo_servico && (
                                <span className="text-[10px] text-slate-400 ml-auto">
                                  Último: {formatDate((client as any).ultimo_servico)}
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        {/* Tags */}
                        {client.tags && client.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {client.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-2 py-0.5 text-[9px] bg-slate-50 text-slate-500 border border-slate-100 rounded-md">
                                {tag}
                              </span>
                            ))}
                            {client.tags.length > 3 && (
                              <span className="px-2 py-0.5 text-[9px] bg-slate-50 text-slate-400 border border-slate-100 rounded-md">
                                +{client.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bottom Actions */}
                      <div className="border-t border-slate-50/80 pt-3 mt-4 flex items-center justify-between">
                        <span className="text-[10px] text-blue-600 font-semibold hover:underline">
                          Visualizar ficha
                        </span>
                        <div className="flex items-center gap-1">
                          {onSelectContactForQuote && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectContactForQuote(client);
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition flex items-center gap-1 text-[11px] font-semibold"
                              title="Gerar Orçamento para este cliente"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Orçar</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditOpen(client);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition"
                            title="Editar cadastro"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setClientToDelete(client);
                            }}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Excluir cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleWhatsAppClick(client.telefone, e)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition flex items-center gap-0.5 ml-1"
                            title="Enviar WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold">ZAP</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                      let pageNum = idx + 1;
                      if (totalPages > 5 && currentPage > 3) {
                        pageNum = Math.min(totalPages - 4, currentPage - 2) + idx;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
                  >
                    Próxima
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-xs text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <Search className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-800">
                  {searchTerm ? `Nenhum cliente com "${searchTerm}"` : 'Nenhum cliente cadastrado'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {searchTerm 
                    ? 'Não encontramos nenhum cliente com esses dados no banco do HigiPro.'
                    : 'Cadastre seus clientes manualmente ou importe diretamente dos seus contatos.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCreateOpen}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cadastrar Novo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGoogleContactsInitialTab('google');
                    setIsGoogleContactsOpen(true);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Procurar no Google</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGoogleContactsInitialTab('phone_vcf');
                    setIsGoogleContactsOpen(true);
                  }}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Procurar na Agenda Celular</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Google Contacts Sync & Drag-and-drop Excel Import */}
        <div className="space-y-4">
          {/* Google Contacts Integration Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 font-display text-sm">Google Contatos</h3>
                <p className="text-xs text-slate-500">Sincronize com sua conta Google</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              Importe seus contatos da agenda do Google diretamente para a base do HigiPro ou envie os clientes cadastrados para a sua conta Google com 1 clique.
            </p>

            <button
              type="button"
              onClick={() => setIsGoogleContactsOpen(true)}
              className="w-full mt-4 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Gerenciar Google Contatos</span>
            </button>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-800 font-display text-base flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                Importar Planilha Excel
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Importe planilhas .xlsx geradas por outros sistemas. O HigiPro mapeará automaticamente os clientes, orçamentos, ordens de serviço pendentes, transações financeiras e agendas de recorrência.
              </p>
            </div>

            {/* Drop Zone Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl p-6 mt-5 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-3",
                isDragOver 
                  ? "border-blue-600 bg-blue-50/20" 
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
              )}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
                className="hidden"
              />
              
              {isImporting ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-xs font-semibold text-slate-700">Lendo planilha...</p>
                  <div className="w-32 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${importProgress}%` }} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-white rounded-xl shadow-xs text-slate-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Arraste a planilha aqui</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">ou clique para selecionar do computador</p>
                  </div>
                </>
              )}
            </div>

            {/* Alert of Requirements */}
            <div className="mt-5 p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-500 leading-normal">
                <span className="font-semibold text-slate-700">Dica de Layout:</span> Aceita colunas como "Cliente", "Telefone", "Serviço", "Valor", "Data", "Status" e "Origem" em uma única aba ou abas separadas.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Import Summary Dialog */}
      <Modal
        isOpen={importSummary !== null}
        onClose={cancelImport}
        title="Resumo da Importação Excel"
        footer={
          <>
            <button
              onClick={cancelImport}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={applyImportedData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              Sincronizar e Confirmar
            </button>
          </>
        }
      >
        {importSummary && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2.5">
              <Check className="w-4 h-4 text-blue-600 mt-0.5" />
              <p className="text-xs text-blue-800 leading-normal">
                Planilha processada com sucesso! O sistema identificou os seguintes dados que serão integrados ao banco de dados existente:
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 border border-slate-100 rounded-xl">
                <p className="text-xs text-slate-400">Clientes Identificados</p>
                <p className="text-lg font-bold text-slate-800 font-display mt-0.5">{importSummary.clientsCount}</p>
              </div>
              <div className="p-3.5 border border-slate-100 rounded-xl">
                <p className="text-xs text-slate-400">Serviços Catalogados</p>
                <p className="text-lg font-bold text-slate-800 font-display mt-0.5">{importSummary.servicesCount}</p>
              </div>
              <div className="p-3.5 border border-slate-100 rounded-xl">
                <p className="text-xs text-slate-400">Orçamentos Propostos</p>
                <p className="text-lg font-bold text-slate-800 font-display mt-0.5">{importSummary.quotesCount}</p>
              </div>
              <div className="p-3.5 border border-slate-100 rounded-xl">
                <p className="text-xs text-slate-400">Ordens de Serviço (OS)</p>
                <p className="text-lg font-bold text-slate-800 font-display mt-0.5">{importSummary.osCount}</p>
              </div>
              <div className="p-3.5 border border-slate-100 rounded-xl col-span-2">
                <p className="text-xs text-slate-400">Transações e Retornos Agendados</p>
                <p className="text-xs font-semibold text-slate-700 mt-1">
                  • {importSummary.transactionsCount} lançamentos financeiros de receita vinculada. <br />
                  • {importSummary.recurrencesCount} cronogramas recomendados de retorno automático.
                </p>
              </div>
            </div>
            
            <p className="text-[10px] text-slate-400 text-center italic">
              Clientes duplicados (com o mesmo nome de cadastro) serão mesclados automaticamente.
            </p>
          </div>
        )}
      </Modal>

      {/* CRUD Modal for Add/Edit Client */}
      <Modal
        isOpen={isCrudOpen}
        onClose={() => setIsCrudOpen(false)}
        title={editingClient ? "Editar Cadastro de Cliente" : "Cadastrar Novo Cliente"}
      >
        <form onSubmit={handleSaveClient} className="space-y-4">
          {!editingClient && (
            <div className="bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-transparent border border-emerald-300 rounded-2xl p-3 sm:p-3.5 space-y-2 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <MessageSquare className="w-4.5 h-4.5 fill-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-emerald-950">
                        Puxar do WhatsApp Business
                      </p>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-200/90 text-emerald-900 font-bold">
                        1 Toque
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-900/80">
                      Puxe da agenda do aparelho ou cole a conversa copiada do WhatsApp.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuickPickWhatsAppDevice}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                    title="Puxar contato da agenda do celular"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Buscar no Celular</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGoogleContactsInitialTab('google');
                      setIsGoogleContactsOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
                    title="Preencher com Google Contatos"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Google Contatos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGoogleContactsInitialTab('phone_vcf');
                      setIsGoogleContactsOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
                    title="Preencher com Agenda Celular ou VCF"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Agenda Celular</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWhatsAppModalInitialTab('paste');
                      setIsWhatsAppBusinessModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
                    title="Colar mensagem ou contato do WhatsApp"
                  >
                    <Clipboard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Colar Conversa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWhatsAppModalInitialTab('search');
                      setIsWhatsAppBusinessModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium rounded-xl transition shadow-2xs cursor-pointer"
                    title="Pesquisar contatos salvos no app"
                  >
                    <Search className="w-3.5 h-3.5 text-slate-500" />
                    <span>Pesquisar Salvos</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Nome */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nome Completo *</label>
              <input
                type="text"
                required
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Mariana Silva de Souza"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Telefone */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Telefone / WhatsApp *</label>
              <input
                type="text"
                required
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: formatPhone(stripCountryCode(e.target.value)) })}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData('text');
                  setFormData({ ...formData, telefone: formatPhone(stripCountryCode(pasted)) });
                }}
                placeholder="Ex: (54) 99876-5432"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Origem */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Origem do Cliente</label>
              <select
                value={formData.origem}
                onChange={(e) => setFormData({ ...formData, origem: e.target.value as ClientOrigin })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition cursor-pointer"
              >
                {ORIGINS.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>
            </div>

            {/* Email */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">E-mail</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="mariana@gmail.com"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Endereço, Bairro e Região (Google Maps) */}
            <div className="sm:col-span-2">
              <GoogleMapsAddressInput
                initialAddress={formData.endereco}
                initialBairro={formData.bairro}
                initialCidade={formData.cidade}
                initialEstado={formData.estado}
                initialCep={formData.CEP}
                initialLat={formData.lat}
                initialLng={formData.lng}
                onLocationChange={(loc) => {
                  setFormData(prev => ({
                    ...prev,
                    endereco: loc.endereco,
                    bairro: loc.bairro,
                    regiao: loc.regiao,
                    cidade: loc.cidade,
                    estado: loc.estado,
                    CEP: loc.cep,
                    lat: loc.lat,
                    lng: loc.lng,
                  }));
                }}
              />
            </div>

            {/* Tags */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Tags / Marcadores (separados por vírgula)</label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="Ex: VIP, Pet Friendly, Sofa Delicado"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Observações */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Observações Internas</label>
              <textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Detalhes sobre animais de estimação, tecidos sensíveis ou horários preferidos..."
                rows={3}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>
          </div>

          {/* Modal Actions */}
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
              Salvar Cliente
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={clientToDelete !== null}
        onClose={() => setClientToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Excluir Cadastro do Cliente"
        description={`Tem certeza absoluta que deseja excluir o cadastro do cliente ${clientToDelete?.nome}? Todos os registros vinculados de orçamentos e ordens de serviço podem ficar sem o vínculo original.`}
      />

      {/* Google Contacts Management Modal */}
      <GoogleContactsModal
        isOpen={isGoogleContactsOpen}
        onClose={() => setIsGoogleContactsOpen(false)}
        db={db}
        onUpdateDb={onUpdateDb}
        onSelectContactForQuote={onSelectContactForQuote}
        onSelectContactForForm={(contact) => {
          setFormData(prev => ({
            ...prev,
            nome: contact.nome || prev.nome,
            telefone: formatPhone(contact.telefone || prev.telefone),
            email: contact.email || prev.email,
            endereco: contact.endereco || prev.endereco,
            cidade: contact.cidade || prev.cidade,
          }));
          setIsCrudOpen(true);
        }}
        initialTab={googleContactsInitialTab}
      />

      {/* WhatsApp Business Contacts Modal */}
      <WhatsAppBusinessContactModal
        isOpen={isWhatsAppBusinessModalOpen}
        onClose={() => setIsWhatsAppBusinessModalOpen(false)}
        onSelectContact={handleApplyWhatsAppContactToForm}
        initialTab={whatsAppModalInitialTab}
        existingClients={db.clients}
      />

      {/* Deduplication & Cleanup Modal */}
      <Modal
        isOpen={isDedupModalOpen}
        onClose={() => setIsDedupModalOpen(false)}
        title="Revisão e Limpeza de Duplicados"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 bg-amber-50/70 border border-amber-200/80 p-3.5 rounded-xl">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-semibold text-sm text-amber-950">
                Auditoria e Unificação de Dados
              </p>
              <p>
                O sistema analisa nomes, telefones e endereços para agrupar clientes repetidos
                (preservando todo o histórico de ordens de serviço) e remove pedidos idênticos duplicados.
              </p>
            </div>
          </div>

          {dedupSuccessMsg && (
            <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-900">Sucesso!</p>
                <p>{dedupSuccessMsg}</p>
              </div>
            </div>
          )}

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-xl text-center">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Clientes</span>
              <span className="text-lg font-bold text-slate-800">{db.clients.length}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-xl text-center">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Pedidos / OS</span>
              <span className="text-lg font-bold text-slate-800">{db.serviceOrders.length}</span>
            </div>
            <div className={cn(
              "border p-3 rounded-xl text-center",
              dedupPreview.mergedClients > 0 
                ? "bg-amber-50/50 border-amber-200 text-amber-900" 
                : "bg-slate-50 border-slate-200/60 text-slate-800"
            )}>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Clientes Duplos</span>
              <span className="text-lg font-bold">{dedupPreview.mergedClients}</span>
            </div>
            <div className={cn(
              "border p-3 rounded-xl text-center",
              dedupPreview.removedOrders > 0 
                ? "bg-amber-50/50 border-amber-200 text-amber-900" 
                : "bg-slate-50 border-slate-200/60 text-slate-800"
            )}>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Pedidos Duplos</span>
              <span className="text-lg font-bold">{dedupPreview.removedOrders}</span>
            </div>
          </div>

          {/* Detailed analysis status */}
          {potentialDupsCount === 0 ? (
            <div className="text-center py-6 px-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-5 h-5" />
              </div>
              <p className="font-semibold text-slate-800 text-sm">
                Base 100% Limpa e Unificada
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Nenhuma duplicidade de cliente ou pedido foi detectada. Seu cadastro está consistente e organizado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Grupos de Clientes Identificados para Mesclagem ({dedupPreview.duplicateClientGroups.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  {dedupPreview.mergedClients} cadastros secundários
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100 border border-slate-200/70 rounded-xl p-2 bg-slate-50/50">
                {dedupPreview.duplicateClientGroups.slice(0, 10).map((grp, idx) => (
                  <div key={idx} className="pt-2 first:pt-0 text-xs">
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      <span>{grp.canonical.nome}</span>
                      {grp.canonical.telefone && (
                        <span className="text-slate-400 font-normal">({formatPhone(grp.canonical.telefone)})</span>
                      )}
                    </div>
                    <div className="ml-3.5 mt-1 text-[11px] text-slate-500 space-y-0.5">
                      <p>
                        <span className="font-medium text-slate-600">Mesclará: </span>
                        {grp.merged.map(m => m.nome).join(', ')}
                      </p>
                    </div>
                  </div>
                ))}
                {dedupPreview.duplicateClientGroups.length > 10 && (
                  <p className="text-[11px] text-slate-500 text-center pt-2 italic">
                    ... e mais {dedupPreview.duplicateClientGroups.length - 10} grupos de clientes semelhantes.
                  </p>
                )}
              </div>

              {dedupPreview.removedOrders > 0 && (
                <div className="bg-amber-50/60 border border-amber-200/60 p-2.5 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Serão eliminados <strong>{dedupPreview.removedOrders}</strong> pedidos e ordens de serviço idênticas duplicadas.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
            <button
              type="button"
              onClick={() => setIsDedupModalOpen(false)}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            {potentialDupsCount > 0 && (
              <button
                type="button"
                onClick={handleExecuteDeduplication}
                disabled={isDeduping}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeduping ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mesclando...
                  </>
                ) : (
                  <>
                    <CopyCheck className="w-4 h-4" />
                    Executar Limpeza e Mesclagem
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
});
