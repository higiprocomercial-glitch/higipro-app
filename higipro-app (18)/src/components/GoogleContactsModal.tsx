/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Search, Download, Upload, CheckCircle2, User, Phone, 
  Mail, MapPin, Loader2, AlertCircle, RefreshCw, LogOut,
  ExternalLink, Check, Plus, ArrowRight, Smartphone, FileText, UploadCloud,
  MessageSquare, Sparkles, Zap
} from 'lucide-react';
import { Client, DatabaseState } from '../types';
import { 
  googleSignIn, 
  logoutGoogle, 
  getAccessToken, 
  getCurrentGoogleUser, 
  subscribeToAuth,
  DEFAULT_GOOGLE_ACCOUNT
} from '../lib/googleAuth';
import { 
  fetchGoogleContacts, 
  convertGoogleContactToClient, 
  createGoogleContact, 
  GoogleContactItem,
  getCachedGoogleContacts,
  getCachedPhoneContacts,
  savePhoneContacts,
  INITIAL_PHONE_CONTACTS
} from '../lib/googleContacts';
import { parseVCardFileContent, parseWhatsAppContactText } from '../lib/vcard';
import { formatPhone, cn, stripCountryCode } from '../lib/utils';
import { ConfirmDialog } from './UIComponents';
import {
  subscribeToContactsStorage,
  getContactsStorageSummary,
  normalizeSearchString,
} from '../lib/contactsStorage';

export type ContactModalTab = 'phone_vcf' | 'whatsapp_paste' | 'quick_add' | 'google' | 'export';

interface GoogleContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: DatabaseState;
  onUpdateDb: (updatedState: DatabaseState) => void;
  onSelectContactForQuote?: (client: Client) => void;
  onSelectContactForForm?: (contact: { nome: string; telefone: string; email?: string; endereco?: string; cidade?: string }) => void;
  initialTab?: ContactModalTab;
}

export const GoogleContactsModal: React.FC<GoogleContactsModalProps> = ({
  isOpen,
  onClose,
  db,
  onUpdateDb,
  onSelectContactForQuote,
  onSelectContactForForm,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<ContactModalTab>(initialTab || 'phone_vcf');
  
  // Storage & progress states
  const [storageSummary, setStorageSummary] = useState(() => getContactsStorageSummary());
  const [syncProgress, setSyncProgress] = useState<{ loaded: number; total?: number } | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);

  // Auth state
  const [user, setUser] = useState(getCurrentGoogleUser());
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Google contacts state (loads cached contacts instantly for zero-wait UI on mobile)
  const [contacts, setContacts] = useState<GoogleContactItem[]>(() => getCachedGoogleContacts());
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // Phone .VCF contacts state (loads persisted phone agenda)
  const [vcfContacts, setVcfContacts] = useState<Array<{
    nome: string;
    telefone: string;
    email?: string;
    endereco?: string;
    cidade?: string;
  }>>(() => getCachedPhoneContacts());
  const [vcfSearchFilter, setVcfSearchFilter] = useState('');
  const [vcfFileName, setVcfFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Subscribe to contact storage updates
  useEffect(() => {
    return subscribeToContactsStorage(() => {
      setStorageSummary(getContactsStorageSummary());
      setVcfContacts(getCachedPhoneContacts());
      setContacts(getCachedGoogleContacts());
    });
  }, []);

  // Reset pagination when searching or changing tab
  useEffect(() => {
    setVisibleCount(60);
  }, [searchFilter, vcfSearchFilter, activeTab]);

  // WhatsApp Fast Paste state
  const [whatsappRawText, setWhatsappRawText] = useState('');
  const [whatsappParsedNome, setWhatsappParsedNome] = useState('');
  const [whatsappParsedTelefone, setWhatsappParsedTelefone] = useState('');
  const [whatsappParsedEndereco, setWhatsappParsedEndereco] = useState('');
  const [whatsappParsedCidade, setWhatsappParsedCidade] = useState('Passo Fundo');

  // Quick Add state
  const [quickNome, setQuickNome] = useState('');
  const [quickTelefone, setQuickTelefone] = useState('');
  const [quickEndereco, setQuickEndereco] = useState('');

  const handleWhatsappTextChange = (text: string) => {
    setWhatsappRawText(text);
    const parsed = parseWhatsAppContactText(text);
    if (parsed.nome) setWhatsappParsedNome(parsed.nome);
    if (parsed.telefone) {
      const clean = stripCountryCode(parsed.telefone);
      setWhatsappParsedTelefone(formatPhone(clean || parsed.telefone));
    }
    if (parsed.endereco) setWhatsappParsedEndereco(parsed.endereco);
    if (parsed.cidade) setWhatsappParsedCidade(parsed.cidade || 'Passo Fundo');
  };

  const handleSeedContacts = () => {
    const seeded = savePhoneContacts(INITIAL_PHONE_CONTACTS);
    setVcfContacts(seeded);
    setSuccessMessage(`${INITIAL_PHONE_CONTACTS.length} contatos carregados na agenda!`);
  };

  // Native phone contacts support
  const [isNativeContactPickerSupported, setIsNativeContactPickerSupported] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'contacts' in navigator && typeof (navigator as any).contacts?.select === 'function') {
      setIsNativeContactPickerSupported(true);
    }
  }, []);

  // Export state
  const [selectedClientIdsToExport, setSelectedClientIdsToExport] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [confirmExportModalOpen, setConfirmExportModalOpen] = useState(false);

  // Status feedback
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Subscribe to auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser, currentToken) => {
      setUser(currentUser);
      setToken(currentToken);
    });
    return unsubscribe;
  }, []);

  // When modal opens, refresh phone contacts and check Google auth if needed
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      } else if (onSelectContactForQuote) {
        setActiveTab('phone_vcf');
      }
      setVcfContacts(getCachedPhoneContacts());

      // 1. Immediately load all cached contacts in 0ms so the user NEVER waits
      const cached = getCachedGoogleContacts();
      if (cached.length > 0) {
        const mapped = cached.map(c => {
          const cleanPhone = c.phone.replace(/\D/g, '');
          const matched = db.clients.find(ext => {
            const extClean = ext.telefone.replace(/\D/g, '');
            return (
              (cleanPhone && (extClean === cleanPhone || (cleanPhone.length >= 8 && extClean.endsWith(cleanPhone.slice(-8))))) ||
              (c.email && ext.email && ext.email.toLowerCase() === c.email.toLowerCase()) ||
              (c.name && ext.nome.trim().toLowerCase() === c.name.trim().toLowerCase())
            );
          });
          return {
            ...c,
            isExistingInHigiPro: !!matched,
            matchedClientId: matched?.id,
          };
        });
        setContacts(mapped);
      }

      // 2. Check token in background without blocking UI
      getAccessToken().then(tok => {
        if (tok) {
          setToken(tok);
          if (cached.length === 0) {
            loadGoogleContacts(tok, false);
          }
        }
      });
    }
  }, [isOpen, initialTab, onSelectContactForQuote]);

  const loadGoogleContacts = async (accessToken: string, forceRefresh = false) => {
    setIsLoadingContacts(true);
    setFetchError(null);
    setSyncProgress(null);
    try {
      const items = await fetchGoogleContacts(accessToken, forceRefresh, (loaded, total) => {
        setSyncProgress({ loaded, total });
      });
      // Re-evaluate existing matches with latest db.clients
      const mapped = items.map(c => {
        const cleanPhone = c.phone.replace(/\D/g, '');
        const matched = db.clients.find(ext => {
          const extClean = ext.telefone.replace(/\D/g, '');
          return (
            (cleanPhone && (extClean === cleanPhone || (cleanPhone.length >= 8 && extClean.endsWith(cleanPhone.slice(-8))))) ||
            (c.email && ext.email && ext.email.toLowerCase() === c.email.toLowerCase()) ||
            (c.name && ext.nome.trim().toLowerCase() === c.name.trim().toLowerCase())
          );
        });
        return {
          ...c,
          isExistingInHigiPro: !!matched,
          matchedClientId: matched?.id,
        };
      });
      setContacts(mapped);
      if (items.length > 0) {
        setSuccessMessage(`${items.length} contatos sincronizados com sucesso e salvos no aplicativo!`);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Erro ao carregar contatos da conta Google.');
    } finally {
      setIsLoadingContacts(false);
      setSyncProgress(null);
    }
  };

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res?.accessToken) {
        setToken(res.accessToken);
        setUser(res.user);
        await loadGoogleContacts(res.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      setAuthError('Não foi possível autenticar com o Google. Verifique a permissão do navegador.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = async () => {
    await logoutGoogle();
    setContacts([]);
    setSelectedContactIds(new Set());
    setSuccessMessage(null);
  };

  // Toggle selection for import
  const toggleContactSelection = (id: string) => {
    const next = new Set(selectedContactIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedContactIds(next);
  };

  const selectAllNewContacts = () => {
    const newIds = contacts
      .filter(c => !c.isExistingInHigiPro)
      .map(c => c.id);
    setSelectedContactIds(new Set(newIds));
  };

  const clearSelection = () => {
    setSelectedContactIds(new Set());
  };

  // Import selected contacts into HigiPro
  const handleImportSelected = () => {
    const toImport = contacts.filter(c => selectedContactIds.has(c.id));
    if (toImport.length === 0) return;

    const newClients: Client[] = [];
    toImport.forEach(contact => {
      const newClient = convertGoogleContactToClient(contact);
      newClients.push(newClient);
    });

    onUpdateDb({
      ...db,
      clients: [...newClients, ...db.clients],
    });

    setSuccessMessage(`${newClients.length} contato(s) importado(s) com sucesso para o HigiPro CRM!`);
    setSelectedContactIds(new Set());

    // Update isExistingInHigiPro flags
    const updatedContacts = contacts.map(c => {
      if (selectedContactIds.has(c.id)) {
        return { ...c, isExistingInHigiPro: true };
      }
      return c;
    });
    setContacts(updatedContacts);

    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  // Quick Pick contact to create Quote or select
  const handlePickContactForQuote = (contact: GoogleContactItem) => {
    if (onSelectContactForForm) {
      onSelectContactForForm({
        nome: contact.name,
        telefone: contact.phone,
        email: contact.email,
        endereco: contact.address,
        cidade: contact.city,
      });
      onClose();
      return;
    }

    let targetClient: Client | undefined;
    if (contact.matchedClientId) {
      targetClient = db.clients.find(c => c.id === contact.matchedClientId);
    }

    if (!targetClient) {
      // Create client on the fly
      targetClient = convertGoogleContactToClient(contact);
      onUpdateDb({
        ...db,
        clients: [targetClient, ...db.clients],
      });
    }

    if (onSelectContactForQuote && targetClient) {
      onSelectContactForQuote(targetClient);
      onClose();
    }
  };

  // Export HigiPro clients to Google Contacts (Requires mandatory confirmation)
  const handleTriggerExport = () => {
    if (selectedClientIdsToExport.size === 0) return;
    setConfirmExportModalOpen(true);
  };

  const executeExportToGoogle = async () => {
    setConfirmExportModalOpen(false);
    if (!token) return;

    setIsExporting(true);
    const clientsToExport = db.clients.filter(c => selectedClientIdsToExport.has(c.id));
    setExportProgress({ current: 0, total: clientsToExport.length });

    let successCount = 0;
    for (let i = 0; i < clientsToExport.length; i++) {
      const client = clientsToExport[i];
      try {
        await createGoogleContact(client, token);
        successCount++;
      } catch (e) {
        console.error('Failed to export client to Google:', client.nome, e);
      }
      setExportProgress({ current: i + 1, total: clientsToExport.length });
    }

    setIsExporting(false);
    setExportProgress(null);
    setSelectedClientIdsToExport(new Set());
    setSuccessMessage(`${successCount} cliente(s) exportado(s) e salvos com sucesso no seu Google Contatos!`);

    // Reload contacts from Google
    await loadGoogleContacts(token);

    setTimeout(() => {
      setSuccessMessage(null);
    }, 4500);
  };

  // Filtered Google contacts list (optimized for 2,000+ items with accent-insensitivity)
  const filteredContacts = React.useMemo(() => {
    const q = normalizeSearchString(searchFilter);
    const digits = stripCountryCode(searchFilter);
    if (!q && !digits) return contacts;
    return contacts.filter(c => {
      const normName = normalizeSearchString(c.name);
      const cleanPhone = stripCountryCode(c.phone);
      const email = (c.email || '').toLowerCase();
      const city = normalizeSearchString(c.city || '');
      const org = normalizeSearchString(c.organization || '');
      return (
        normName.includes(q) ||
        (digits && cleanPhone.includes(digits)) ||
        email.includes(q) ||
        city.includes(q) ||
        org.includes(q)
      );
    });
  }, [contacts, searchFilter]);

  // Native phone picker handler (supports single or multiple selection)
  const handlePickNativePhone = async () => {
    try {
      const nav = navigator as any;
      if (nav.contacts && typeof nav.contacts.select === 'function') {
        const props = ['name', 'tel', 'email'];
        const selectedList = await nav.contacts.select(props, { multiple: true });
        if (selectedList && selectedList.length > 0) {
          const imported: Array<{ nome: string; telefone: string; email?: string }> = [];
          for (const item of selectedList) {
            const rawName = item.name?.[0] || item.name || '';
            const rawTel = item.tel?.[0] || item.telephone?.[0] || item.tel || '';
            const rawEmail = item.email?.[0] || item.email || '';
            if (rawName || rawTel) {
              const cleanTel = stripCountryCode(rawTel);
              imported.push({
                nome: rawName || 'Contato do Celular',
                telefone: formatPhone(cleanTel || rawTel),
                email: rawEmail || undefined,
              });
            }
          }

          if (imported.length > 0) {
            savePhoneContacts(imported);
            setVcfContacts(getCachedPhoneContacts());

            if (imported.length === 1 && onSelectContactForQuote) {
              handleSelectVcfContact(imported[0]);
              return;
            }

            setSuccessMessage(`${imported.length} contato(s) importado(s) da agenda do aparelho com sucesso!`);
          }
        }
      }
    } catch (err) {
      console.warn('Native contact select cancelled or not supported:', err);
    }
  };

  // VCF file upload handler (handles 2,000+ vCard records seamlessly)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVcfFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const parsed = parseVCardFileContent(content);
        setVcfContacts(parsed);
        savePhoneContacts(parsed);
        if (parsed.length > 0) {
          setSuccessMessage(`${parsed.length} contatos salvos da agenda (${file.name})!`);
        }
      }
    };
    reader.readAsText(file);
  };

  // Pick VCF contact for quote or import
  const handleSelectVcfContact = (vcfItem: { nome: string; telefone: string; email?: string; endereco?: string; cidade?: string }) => {
    // Also ensure contact is saved to cached phone contacts
    savePhoneContacts([{
      nome: vcfItem.nome,
      telefone: vcfItem.telefone,
      email: vcfItem.email,
      endereco: vcfItem.endereco,
      cidade: vcfItem.cidade
    }]);

    if (onSelectContactForForm) {
      onSelectContactForForm({
        nome: vcfItem.nome,
        telefone: vcfItem.telefone,
        email: vcfItem.email,
        endereco: vcfItem.endereco,
        cidade: vcfItem.cidade,
      });
      onClose();
      return;
    }

    let client = db.clients.find(c => {
      const cleanTel = stripCountryCode(vcfItem.telefone);
      const cClean = stripCountryCode(c.telefone);
      return (cleanTel && (cClean === cleanTel || (cleanTel.length >= 8 && cClean.endsWith(cleanTel.slice(-8))))) ||
             (vcfItem.nome && c.nome.toLowerCase() === vcfItem.nome.toLowerCase());
    });

    if (!client) {
      client = {
        id: `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        nome: vcfItem.nome,
        telefone: stripCountryCode(vcfItem.telefone),
        email: vcfItem.email || '',
        endereco: vcfItem.endereco || '',
        cidade: vcfItem.cidade || 'Passo Fundo',
        estado: 'RS',
        CEP: '',
        observacoes: 'Cadastrado da Agenda',
        tags: ['Agenda'],
        origem: 'Outros',
        created_at: new Date().toISOString(),
      };
      onUpdateDb({
        ...db,
        clients: [client, ...db.clients],
      });
    }

    if (onSelectContactForQuote && client) {
      onSelectContactForQuote(client);
      onClose();
    } else {
      setSuccessMessage(`Cliente ${client.nome} adicionado aos contatos do HigiPro!`);
    }
  };

  // Filtered VCF contacts list (optimized for 2,000+ items with accent-insensitivity)
  const filteredVcfContacts = React.useMemo(() => {
    const q = normalizeSearchString(vcfSearchFilter);
    const digits = stripCountryCode(vcfSearchFilter);
    if (!q && !digits) return vcfContacts;
    return vcfContacts.filter(c => {
      const normName = normalizeSearchString(c.nome);
      const cleanPhone = stripCountryCode(c.telefone);
      const email = (c.email || '').toLowerCase();
      const city = normalizeSearchString(c.cidade || '');
      return (
        normName.includes(q) ||
        (digits && cleanPhone.includes(digits)) ||
        email.includes(q) ||
        city.includes(q)
      );
    });
  }, [vcfContacts, vcfSearchFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-100 overflow-hidden"
      >
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-blue-600">
              <Smartphone className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 font-display text-base">
                  Agenda do Telefone & Google Contatos
                </h3>
                {storageSummary.total > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    <Smartphone className="w-3 h-3 text-indigo-600" />
                    {storageSummary.total} contatos disponíveis
                  </span>
                )}
                {token && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Google Conectado
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Importe contatos salvos no telefone ou conta Google para preencher o orçamento instantaneamente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isNativeContactPickerSupported && (
              <button
                type="button"
                onClick={handlePickNativePhone}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition cursor-pointer border border-indigo-200 shadow-2xs"
                title="Abrir contatos salvos no aparelho"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Agenda do Aparelho</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Unified Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white gap-2 sm:gap-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('phone_vcf')}
            className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'phone_vcf'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
            <span>Agenda do Celular {vcfContacts.length > 0 ? `(${vcfContacts.length})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whatsapp_paste')}
            className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'whatsapp_paste'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>Colar do WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('quick_add')}
            className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'quick_add'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>Cadastro Rápido</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('google')}
            className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'google'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Google Contatos {contacts.length > 0 ? `(${contacts.length})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'export'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Exportar para o Google</span>
          </button>
        </div>

        {/* Feedback message */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {/* TAB 1: GOOGLE CONTACTS */}
          {activeTab === 'google' && (
            <div>
              {contacts.length === 0 && !token ? (
                <div className="space-y-6">
                  <div className="py-8 flex flex-col items-center justify-center text-center space-y-5 bg-gradient-to-b from-white to-slate-50 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                    <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shadow-inner">
                      <User className="w-8 h-8" />
                    </div>
                    <div className="max-w-md space-y-1">
                      <h4 className="text-lg font-bold text-slate-800 font-display">
                        Conectar com a Agenda Google
                      </h4>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-800 rounded-full text-xs font-semibold border border-blue-200">
                        <span>{DEFAULT_GOOGLE_ACCOUNT}</span>
                      </div>
                      <p className="text-xs text-slate-600 pt-1 leading-relaxed">
                        Conecte a conta do Google para carregar e sincronizar automaticamente todos os contatos da sua agenda no celular.
                      </p>
                    </div>

                    {authError && (
                      <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2.5 max-w-md text-left">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Aviso de conexão</p>
                          <p className="mt-0.5">{authError}</p>
                          <p className="text-[11px] text-rose-500 mt-1">
                            Dica: No iPhone (Safari/Chrome) ou Android, certifique-se de permitir janelas pop-up temporárias caso solicitado.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Official Google Sign-In Button */}
                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={isAuthenticating}
                      className="inline-flex items-center gap-3 px-6 py-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 hover:border-slate-400 font-bold text-sm rounded-xl shadow-xs transition duration-150 cursor-pointer disabled:opacity-50 active:scale-95"
                    >
                      {isAuthenticating ? (
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 48 48">
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                          <path fill="none" d="M0 0h48v48H0z" />
                        </svg>
                      )}
                      <span>Conectar com {DEFAULT_GOOGLE_ACCOUNT}</span>
                    </button>

                    <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
                      {isNativeContactPickerSupported && (
                        <button
                          type="button"
                          onClick={handlePickNativePhone}
                          className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                        >
                          Ou abrir agenda nativa do aparelho
                        </button>
                      )}
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('phone_vcf')}
                        className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                      >
                        Ou carregar arquivo (.vcf) do celular
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Account strip */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {user?.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || 'Google User'}
                          className="w-8 h-8 rounded-full border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                          {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'G'}
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-slate-800 leading-none">
                          {user?.displayName || (token ? 'Conta Google Conectada' : `${contacts.length} Contatos Salvos no Aparelho`)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {user?.email || (token ? DEFAULT_GOOGLE_ACCOUNT : 'Disponíveis offline para novos cadastros e orçamentos')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (token) {
                            loadGoogleContacts(token, true);
                          } else {
                            handleSignIn();
                          }
                        }}
                        disabled={isLoadingContacts || isAuthenticating}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                        title="Recarregar Contatos"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingContacts || isAuthenticating ? 'animate-spin' : ''}`} />
                        <span>{token ? 'Atualizar' : 'Sincronizar'}</span>
                      </button>
                      {token && (
                        <button
                          type="button"
                          onClick={handleDisconnect}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Desconectar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Search and Action Bar */}
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar por nome, telefone ou e-mail..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                      />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={selectAllNewContacts}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer"
                      >
                        Selecionar Novos
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer"
                      >
                        Desmarcar
                      </button>
                      <button
                        type="button"
                        onClick={handleImportSelected}
                        disabled={selectedContactIds.size === 0}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Importar ({selectedContactIds.size})</span>
                      </button>
                    </div>
                  </div>

                  {/* Contacts List */}
                  {isLoadingContacts ? (
                    <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                      <p className="text-sm font-bold text-slate-700">Sincronizando contatos do Google...</p>
                      {syncProgress ? (
                        <p className="text-xs text-blue-600 mt-1 font-semibold">
                          {syncProgress.loaded} contatos baixados{syncProgress.total ? ` de ${syncProgress.total}` : ''}...
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1">Carregando lista completa da sua conta...</p>
                      )}
                    </div>
                  ) : fetchError ? (
                    <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex items-center gap-3">
                      <AlertCircle className="w-6 h-6 shrink-0" />
                      <div>
                        <p className="font-bold">Erro ao carregar contatos</p>
                        <p className="text-xs mt-0.5">{fetchError}</p>
                      </div>
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
                      <User className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="text-sm font-medium text-slate-600">Nenhum contato encontrado no Google</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {searchFilter ? 'Tente outros termos de busca.' : 'Verifique se há contatos salvos em contacts.google.com.'}
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                      {filteredContacts.slice(0, visibleCount).map((c) => {
                        const isSelected = selectedContactIds.has(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              if (onSelectContactForQuote) {
                                handlePickContactForQuote(c);
                              } else {
                                toggleContactSelection(c.id);
                              }
                            }}
                            className={`p-3.5 flex items-center justify-between gap-4 transition cursor-pointer hover:bg-slate-50/80 ${
                              isSelected ? 'bg-blue-50/40' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {!onSelectContactForQuote && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-600 cursor-pointer"
                                />
                              )}

                              {c.photoUrl ? (
                                <img
                                  src={c.photoUrl}
                                  alt={c.name}
                                  className="w-9 h-9 rounded-xl object-cover shrink-0 border border-slate-200"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                              )}

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-slate-800 text-sm truncate">{c.name}</p>
                                  {c.isExistingInHigiPro ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                      Cadastrado
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                      Novo
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                                  {c.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="w-3 h-3 text-slate-400" />
                                      {formatPhone(c.phone)}
                                    </span>
                                  )}
                                  {c.email && (
                                    <span className="flex items-center gap-1 truncate max-w-[200px]">
                                      <Mail className="w-3 h-3 text-slate-400" />
                                      {c.email}
                                    </span>
                                  )}
                                  {c.city && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-slate-400" />
                                      {c.city}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {onSelectContactForForm ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePickContactForQuote(c);
                                }}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Preencher Cadastro</span>
                              </button>
                            ) : onSelectContactForQuote ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePickContactForQuote(c);
                                }}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
                              >
                                <span>Usar no Orçamento</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : !c.isExistingInHigiPro ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newClient = convertGoogleContactToClient(c);
                                  onUpdateDb({
                                    ...db,
                                    clients: [newClient, ...db.clients],
                                  });
                                  setSuccessMessage(`Cliente ${c.name} cadastrado com sucesso!`);
                                  setContacts(prev => prev.map(item => item.id === c.id ? { ...item, isExistingInHigiPro: true } : item));
                                  setTimeout(() => setSuccessMessage(null), 3500);
                                }}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
                                title="Cadastrar cliente no HigiPro agora"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Cadastrar</span>
                              </button>
                            ) : null}
                          </div>
                        );
                      })}

                      {filteredContacts.length > visibleCount && (
                        <div className="p-3.5 text-center bg-slate-50 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => setVisibleCount(cnt => cnt + 60)}
                            className="px-4 py-2 bg-white hover:bg-slate-100 text-blue-600 border border-slate-200 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                          >
                            Carregar mais (+60) • Exibindo {Math.min(visibleCount, filteredContacts.length)} de {filteredContacts.length} contatos
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 1: PHONE AGENDA (.VCF FILE, CACHED CONTACTS & NATIVE PICKER) */}
          {activeTab === 'phone_vcf' && (
            <div className="space-y-4">
              {/* Quick Actions Ribbon */}
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 border border-indigo-200/80 shadow-2xs"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Carregar Arquivo .vcf</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('whatsapp_paste')}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 border border-emerald-200/80 shadow-2xs"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Colar do WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('quick_add')}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 border border-amber-200/80 shadow-2xs"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  <span>Cadastro Rápido</span>
                </button>

                {isNativeContactPickerSupported && (
                  <button
                    type="button"
                    onClick={handlePickNativePhone}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Agenda do Aparelho</span>
                  </button>
                )}

                {vcfContacts.length < 5 && (
                  <button
                    type="button"
                    onClick={handleSeedContacts}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer flex items-center gap-1.5 ml-auto"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Carregar Exemplos</span>
                  </button>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".vcf,text/vcard"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Search & Counter */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-1">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou fone na agenda..."
                    value={vcfSearchFilter}
                    onChange={(e) => setVcfSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition"
                    autoFocus
                  />
                  {vcfSearchFilter && (
                    <button
                      type="button"
                      onClick={() => setVcfSearchFilter('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {filteredVcfContacts.length} contato(s) na agenda
                </span>
              </div>

              {/* Contacts List */}
              {filteredVcfContacts.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <Smartphone className="w-10 h-10 text-slate-300 mx-auto" />
                  <div>
                    <p className="text-sm font-bold text-slate-700">Nenhum contato encontrado</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      {vcfSearchFilter 
                        ? 'Tente buscar por outro termo ou cadastre um novo cliente rápido.' 
                        : 'Você pode importar seu arquivo .vcf do celular, colar um contato do WhatsApp ou carregar a agenda demonstrativa.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleSeedContacts}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Carregar Agenda Demonstrativa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('whatsapp_paste')}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Colar do WhatsApp</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white max-h-[380px] overflow-y-auto">
                  {filteredVcfContacts.slice(0, visibleCount).map((contact, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectVcfContact(contact)}
                      className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-100 group-hover:scale-105 transition-transform">
                          {contact.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{contact.nome}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-0.5">
                            {contact.telefone && (
                              <span className="flex items-center gap-1 font-medium text-slate-700">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {formatPhone(contact.telefone)}
                              </span>
                            )}
                            {contact.email && (
                              <span className="flex items-center gap-1 truncate max-w-[200px]">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {contact.email}
                              </span>
                            )}
                            {contact.cidade && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {contact.cidade}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectVcfContact(contact);
                        }}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
                      >
                        <span>
                          {onSelectContactForForm
                            ? 'Preencher Cadastro'
                            : onSelectContactForQuote
                            ? 'Usar no Orçamento'
                            : 'Salvar no HigiPro'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {filteredVcfContacts.length > visibleCount && (
                    <div className="p-3 text-center bg-slate-50 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setVisibleCount(cnt => cnt + 60)}
                        className="px-4 py-2 bg-white hover:bg-slate-100 text-indigo-700 border border-slate-200 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                      >
                        Carregar mais (+60) • Exibindo {Math.min(visibleCount, filteredVcfContacts.length)} de {filteredVcfContacts.length} contatos
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WHATSAPP DIRECT PASTE */}
          {activeTab === 'whatsapp_paste' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-950">
                    Colar Mensagem ou Contato do WhatsApp
                  </p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Copie a conversa ou contato do WhatsApp e cole abaixo. O identificador extrai automaticamente o Nome, Telefone e Endereço para agendar em 1 clique!
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Cole o texto aqui:
                </label>
                <textarea
                  rows={4}
                  value={whatsappRawText}
                  onChange={(e) => handleWhatsappTextChange(e.target.value)}
                  placeholder="Ex: Olá, sou a Juliana da Silva, telefone (54) 99988-7766, moro na Rua Fagundes dos Reis 1020 em Passo Fundo"
                  className="w-full p-3.5 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono"
                  autoFocus
                />
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Dados Identificados
                  </p>
                  {(whatsappParsedNome || whatsappParsedTelefone) && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                      Pronto para agendar
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Nome do Cliente:
                    </label>
                    <input
                      type="text"
                      value={whatsappParsedNome}
                      onChange={(e) => setWhatsappParsedNome(e.target.value)}
                      placeholder="Nome do cliente"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Telefone / WhatsApp:
                    </label>
                    <input
                      type="text"
                      value={whatsappParsedTelefone}
                      onChange={(e) => setWhatsappParsedTelefone(formatPhone(stripCountryCode(e.target.value)))}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text');
                        setWhatsappParsedTelefone(formatPhone(stripCountryCode(pasted)));
                      }}
                      placeholder="(54) 99999-9999"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Endereço:
                    </label>
                    <input
                      type="text"
                      value={whatsappParsedEndereco}
                      onChange={(e) => setWhatsappParsedEndereco(e.target.value)}
                      placeholder="Rua, número, complemento"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Cidade:
                    </label>
                    <input
                      type="text"
                      value={whatsappParsedCidade}
                      onChange={(e) => setWhatsappParsedCidade(e.target.value)}
                      placeholder="Passo Fundo"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={!whatsappParsedNome.trim() && !whatsappParsedTelefone.trim()}
                    onClick={() => {
                      handleSelectVcfContact({
                        nome: whatsappParsedNome.trim() || 'Cliente WhatsApp',
                        telefone: whatsappParsedTelefone.trim(),
                        endereco: whatsappParsedEndereco.trim(),
                        cidade: whatsappParsedCidade.trim() || 'Passo Fundo',
                      });
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>Usar no Orçamento Imediatamente</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: QUICK ADD */}
          {activeTab === 'quick_add' && (
            <div className="space-y-4 max-w-lg mx-auto py-2">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <Zap className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-950">
                    Cadastro Rápido de Contato
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Preencha apenas o Nome e WhatsApp. O contato entra no orçamento na hora e fica salvo na agenda.
                  </p>
                </div>
              </div>

              <div className="space-y-3 bg-white p-5 border border-slate-200 rounded-2xl shadow-2xs">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome do Cliente *
                  </label>
                  <input
                    type="text"
                    value={quickNome}
                    onChange={(e) => setQuickNome(e.target.value)}
                    placeholder="Ex: Amanda Silva"
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    WhatsApp / Telefone *
                  </label>
                  <input
                    type="tel"
                    value={quickTelefone}
                    onChange={(e) => setQuickTelefone(formatPhone(stripCountryCode(e.target.value)))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text');
                      setQuickTelefone(formatPhone(stripCountryCode(pasted)));
                    }}
                    placeholder="(54) 99999-9999"
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Endereço (opcional)
                  </label>
                  <input
                    type="text"
                    value={quickEndereco}
                    onChange={(e) => setQuickEndereco(e.target.value)}
                    placeholder="Rua, número ou bairro"
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={!quickNome.trim() && !quickTelefone.trim()}
                  onClick={() => {
                    handleSelectVcfContact({
                      nome: quickNome.trim() || 'Cliente Novo',
                      telefone: quickTelefone.trim(),
                      endereco: quickEndereco.trim(),
                      cidade: 'Passo Fundo',
                    });
                  }}
                  className="w-full mt-2 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Salvar e Usar no Orçamento Agora</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: EXPORT CRM CLIENTS TO GOOGLE */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-start gap-3">
                <Upload className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-blue-900">
                    Exportar e Salvar Clientes no Google Contatos
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                    Selecione clientes cadastrados no HigiPro para salvá-los automaticamente na sua agenda de contatos da conta Google (<span className="font-semibold">{user?.email || 'sua conta'}</span>), com telefone, e-mail e endereço.
                  </p>
                </div>
              </div>

              {/* Actions bar */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = db.clients.map(c => c.id);
                      setSelectedClientIdsToExport(new Set(allIds));
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer"
                  >
                    Selecionar Todos ({db.clients.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedClientIdsToExport(new Set())}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTriggerExport}
                  disabled={selectedClientIdsToExport.size === 0 || isExporting || !token}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Exportar Selecionados ({selectedClientIdsToExport.size})</span>
                </button>
              </div>

              {isExporting && exportProgress && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-blue-800">
                    <span>Enviando para o Google Contatos...</span>
                    <span>{exportProgress.current} / {exportProgress.total}</span>
                  </div>
                  <div className="w-full bg-blue-200/50 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-2 transition-all duration-200"
                      style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* List of HigiPro clients */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white max-h-[380px] overflow-y-auto">
                {db.clients.map((client) => {
                  const isSelected = selectedClientIdsToExport.has(client.id);
                  return (
                    <div
                      key={client.id}
                      onClick={() => {
                        const next = new Set(selectedClientIdsToExport);
                        if (next.has(client.id)) next.delete(client.id);
                        else next.add(client.id);
                        setSelectedClientIdsToExport(next);
                      }}
                      className={`p-3.5 flex items-center justify-between gap-4 transition cursor-pointer hover:bg-slate-50/80 ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-600 cursor-pointer"
                        />
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{client.nome}</p>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            <span>{formatPhone(client.telefone)}</span>
                            {client.email && <span>• {client.email}</span>}
                            <span>• {client.cidade || 'Passo Fundo'}</span>
                          </div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-100">
                        Origem: {client.origem}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span>Google People & Contacts API v1</span>
          </div>
        </div>
      </motion.div>

      {/* Mandatory User Confirmation Dialog before creating/updating records in Google Contacts */}
      <ConfirmDialog
        isOpen={confirmExportModalOpen}
        onClose={() => setConfirmExportModalOpen(false)}
        onConfirm={executeExportToGoogle}
        title="Confirmar exportação para Google Contatos?"
        description={`Você tem certeza que deseja salvar ${selectedClientIdsToExport.size} cliente(s) diretamente na sua conta Google (${user?.email})? Novos contatos serão criados com os números de telefone, e-mails e endereços cadastrados.`}
        confirmText="Confirmar e Salvar no Google"
        cancelText="Cancelar"
      />
    </div>
  );
};
