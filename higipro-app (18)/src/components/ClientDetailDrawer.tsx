/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Phone, Mail, MapPin, Tag, Calendar, ShoppingBag, 
  Clock, Plus, FileText, RefreshCw, MessageSquare, Camera,
  CheckCircle2, DollarSign, ArrowUpRight, Trash2, Eye, ExternalLink, User, Sparkles,
  Edit2, ArrowLeft
} from 'lucide-react';
import { Client, DatabaseState, ClientPhoto, Recurrence, ServiceOrder, Quote, ClientOrigin } from '../types';
import { formatDate, formatDateTime, formatPhone, formatCurrency, cleanWhatsAppPhone } from '../lib/utils';
import { StatusBadge, ConfirmDialog, Modal } from './UIComponents';
import { PhotoUploader } from './PhotoUploader';
import { ClientLocationMap } from './ClientLocationMap';
import { OrcamentoDocument } from './OrcamentoDocument';
import { ORIGINS } from '../lib/database';
import { supabaseSaveClient } from '../lib/supabase';
import { GoogleMapsAddressInput } from './GoogleMapsAddressInput';

interface ClientDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  db: DatabaseState;
  onUpdateDb?: (updatedState: DatabaseState) => void;
  onNewQuote?: (client: Client) => void;
  onClientUpdated?: (client: Client) => void;
}

export const ClientDetailDrawer: React.FC<ClientDetailDrawerProps> = ({
  isOpen, onClose, client, db, onUpdateDb, onNewQuote, onClientUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'photos' | 'history'>('info');
  const [recurrenceToDelete, setRecurrenceToDelete] = useState<Recurrence | null>(null);
  const [isDeleteRecurrenceOpen, setIsDeleteRecurrenceOpen] = useState(false);
  const [selectedOS, setSelectedOS] = useState<ServiceOrder | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  // Edit Client Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
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

  const handleConfirmDeleteRecurrence = () => {
    if (!recurrenceToDelete || !onUpdateDb) return;
    onUpdateDb({
      ...db,
      recurrences: db.recurrences.filter(r => r.id !== recurrenceToDelete.id),
    });
    setRecurrenceToDelete(null);
    setIsDeleteRecurrenceOpen(false);
  };

  if (!client) return null;

  // Always resolve latest client state from db
  const currentClient = db.clients.find(c => c.id === client.id) || client;

  const handleOpenEditClient = () => {
    setEditFormData({
      nome: currentClient.nome || '',
      telefone: currentClient.telefone || '',
      email: currentClient.email || '',
      endereco: currentClient.endereco || '',
      bairro: currentClient.bairro || '',
      regiao: currentClient.regiao || currentClient.bairro || '',
      cidade: currentClient.cidade || db.companySettings?.cidade || 'Passo Fundo',
      estado: currentClient.estado || db.companySettings?.estado || 'RS',
      CEP: currentClient.CEP || '',
      lat: currentClient.lat,
      lng: currentClient.lng,
      observacoes: currentClient.observacoes || '',
      tags: (currentClient.tags || []).join(', '),
      origem: currentClient.origem || 'Google',
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEditedClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFormData.nome.trim()) return;

    const tagsArray = editFormData.tags
      ? editFormData.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const updatedClient: Client = {
      ...currentClient,
      nome: editFormData.nome.trim(),
      telefone: editFormData.telefone.replace(/\D/g, ''),
      email: editFormData.email.trim(),
      endereco: editFormData.endereco.trim(),
      bairro: editFormData.bairro?.trim() || undefined,
      regiao: editFormData.regiao?.trim() || editFormData.bairro?.trim() || undefined,
      cidade: editFormData.cidade.trim(),
      estado: editFormData.estado,
      CEP: editFormData.CEP.trim(),
      lat: editFormData.lat,
      lng: editFormData.lng,
      observacoes: editFormData.observacoes.trim(),
      tags: tagsArray,
      origem: editFormData.origem,
    };

    if (onUpdateDb) {
      const updatedClients = db.clients.map(c => c.id === currentClient.id ? updatedClient : c);
      onUpdateDb({ ...db, clients: updatedClients });
    }

    supabaseSaveClient(updatedClient);
    onClientUpdated?.(updatedClient);
    setIsEditModalOpen(false);
  };

  // Filter linked data for this client
  const clientNormName = currentClient.nome ? currentClient.nome.toLowerCase().trim() : '';
  const clientQuotes = db.quotes.filter(q => q.client_id === currentClient.id || (clientNormName && q.client_name && q.client_name.toLowerCase().trim() === clientNormName));
  const clientOS = db.serviceOrders.filter(os => os.client_id === currentClient.id || (clientNormName && os.client_name && os.client_name.toLowerCase().trim() === clientNormName));
  const clientRecurrences = db.recurrences.filter(r => r.client_id === currentClient.id || (clientNormName && r.client_name && r.client_name.toLowerCase().trim() === clientNormName));
  const clientAppointments = db.appointments.filter(a => a.client_id === currentClient.id || (clientNormName && a.client_name && a.client_name.toLowerCase().trim() === clientNormName));
  const clientPhotos = (db.clientPhotos || []).filter(p => p.client_id === currentClient.id);

  const historicalExecuted = (currentClient.historico_servicos || []).filter((s: any) => s.tipo === 'servico' || s.status === 'concluido');
  const historicalSpent = (currentClient as any).total_gasto ?? historicalExecuted.reduce((sum: number, s: any) => sum + (Number(s.valor) || 0), 0);

  const totalSpent = clientOS
    .filter(os => os.status === 'concluido')
    .reduce((sum, os) => sum + os.total, 0) + historicalSpent;

  const totalCompletedServices = clientOS.filter(os => os.status === 'concluido').length + historicalExecuted.length;

  // Resolved entities for selectedOS modal
  const linkedQuoteForSelectedOS = selectedOS
    ? (selectedOS.quote_id 
        ? db.quotes.find(q => q.id === selectedOS.quote_id) 
        : db.quotes.find(q => q.client_id === selectedOS.client_id || (clientNormName && q.client_name && q.client_name.toLowerCase().trim() === clientNormName)))
    : null;

  const quoteItemsForSelectedOS = linkedQuoteForSelectedOS
    ? db.quoteItems.filter(item => item.quote_id === linkedQuoteForSelectedOS.id)
    : [];

  const appointmentForSelectedOS = selectedOS
    ? db.appointments.find(a => a.os_id === selectedOS.id)
    : null;

  const photosForSelectedOS = selectedOS
    ? (db.osPhotos || []).filter(p => p.os_id === selectedOS.id)
    : [];

  const transactionsForSelectedOS = selectedOS
    ? db.transactions.filter(t => t.os_id === selectedOS.id)
    : [];

  // Avatar Initial
  const initial = currentClient.nome ? currentClient.nome.charAt(0).toUpperCase() : '?';

  // Origins custom colors
  const originColors: Record<string, string> = {
    Google: 'bg-blue-50 text-blue-700 border-blue-200',
    'Meta Ads': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    Meta: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    Facebook: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    Instagram: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    Indicação: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Site: 'bg-amber-50 text-amber-700 border-amber-200',
    Outros: 'bg-slate-50 text-slate-700 border-slate-200',
  };

  const handlePhotosChange = (updatedClientPhotos: ClientPhoto[]) => {
    if (!onUpdateDb) return;
    const otherPhotos = (db.clientPhotos || []).filter(p => p.client_id !== currentClient.id);
    onUpdateDb({
      ...db,
      clientPhotos: [...otherPhotos, ...updatedClientPhotos],
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
          />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-0 sm:pl-6 md:pl-10">
            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-screen max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-100"
            >
              {/* Header with Safe Area and prominent Voltar & Fechar buttons */}
              <div className="pt-safe border-b border-slate-100 bg-slate-50">
                <div className="ios-safe-top w-full" />
                <div className="px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="h-9 px-2.5 sm:px-3 flex items-center gap-1.5 bg-white hover:bg-slate-100 active:bg-blue-600 active:text-white text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer shrink-0"
                      title="Voltar para a tela anterior"
                    >
                      <ArrowLeft className="w-4 h-4 text-blue-600" />
                      <span>Voltar</span>
                    </button>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-semibold font-display text-sm sm:text-base shadow-sm shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 font-display text-xs sm:text-base leading-tight truncate">
                        {currentClient.nome}
                      </h3>
                      <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                        Cadastrado em {formatDate(currentClient.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenEditClient}
                      className="px-2 sm:px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1 border border-slate-200 shadow-2xs hover:border-slate-300"
                      title="Editar dados cadastrais do cliente"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden md:inline">Editar</span>
                    </button>

                    {onNewQuote && (
                      <button
                        type="button"
                        onClick={() => onNewQuote(currentClient)}
                        className="px-2 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Novo Orçamento</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="h-9 px-2.5 sm:px-3 flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition cursor-pointer text-xs font-bold border border-rose-200 shadow-2xs"
                      aria-label="Fechar gaveta"
                      title="Fechar detalhes do cliente"
                    >
                      <X className="w-4 h-4 text-rose-500" />
                      <span>Fechar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs inside Drawer */}
              <div className="flex border-b border-slate-200 px-4 sm:px-6 bg-white gap-3 sm:gap-4 overflow-x-auto scrollbar-none whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'info'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Visão Geral & Cadastro
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('photos')}
                  className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'photos'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Fotos dos Itens ({clientPhotos.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'history'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Histórico ({clientOS.length + clientQuotes.length + (client.historico_servicos?.length || 0)})</span>
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* TAB 1: INFO & CRM */}
                {activeTab === 'info' && (
                  <>
                    {/* Visual Overview Metric */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50/50 border border-blue-100/50 rounded-2xl">
                      <div>
                        <p className="text-xs text-blue-700 font-medium">Total Investido</p>
                        <p className="text-xl font-bold text-blue-900 font-display mt-0.5">
                          {formatCurrency(totalSpent)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 font-medium">Serviços Concluídos</p>
                        <p className="text-xl font-bold text-slate-800 font-display mt-0.5">
                          {totalCompletedServices}
                        </p>
                      </div>
                    </div>

                    {/* Contact Information */}
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Informações de Contato
                        </h4>
                        <button
                          type="button"
                          onClick={handleOpenEditClient}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 transition cursor-pointer"
                          title="Alterar dados cadastrais deste cliente"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Editar Dados</span>
                        </button>
                      </div>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-3">
                            <Phone className="w-4 h-4 text-slate-400" />
                            <a href={`tel:${currentClient.telefone}`} className="hover:underline font-medium">
                              {formatPhone(currentClient.telefone)}
                            </a>
                          </div>
                          {cleanWhatsAppPhone(currentClient.telefone) && (
                            <button
                              type="button"
                              onClick={() => {
                                const waNumber = cleanWhatsAppPhone(currentClient.telefone);
                                window.open(`https://wa.me/${waNumber}`, '_blank');
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 rounded-lg transition cursor-pointer"
                              title="Conversar no WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                              WhatsApp
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <Mail className="w-4 h-4 text-slate-400" />
                          {currentClient.email ? (
                            <a href={`mailto:${currentClient.email}`} className="hover:underline break-all">
                              {currentClient.email}
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">Sem e-mail cadastrado</span>
                          )}
                        </div>
                        <div className="pt-1">
                          <ClientLocationMap
                            endereco={currentClient.endereco}
                            bairro={currentClient.bairro}
                            regiao={currentClient.regiao}
                            cidade={currentClient.cidade}
                            estado={currentClient.estado}
                            cep={currentClient.CEP}
                            lat={currentClient.lat}
                            lng={currentClient.lng}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Origin and Tags */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                          Origem do Lead
                        </h4>
                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium border ${originColors[currentClient.origem] || originColors['Outros']}`}>
                          {currentClient.origem}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                          Tags / Marcadores
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {currentClient.tags && currentClient.tags.length > 0 ? (
                            currentClient.tags.map(tag => (
                              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <Tag className="w-3 h-3 text-slate-400" />
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">Nenhuma tag</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Observations */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Observações Internas
                      </h4>
                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl text-sm text-slate-600">
                        {currentClient.observacoes ? (
                          <p className="whitespace-pre-wrap leading-relaxed">{currentClient.observacoes}</p>
                        ) : (
                          <p className="italic text-slate-400">Nenhuma observação registrada.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* TAB 2: PHOTOS */}
                {activeTab === 'photos' && (
                  <div className="space-y-4">
                    <PhotoUploader
                      clientId={currentClient.id}
                      photos={clientPhotos}
                      onChange={handlePhotosChange}
                      readOnly={!onUpdateDb}
                    />
                  </div>
                )}

                {/* TAB 3: COMPLETE HISTORY */}
                {activeTab === 'history' && (
                  <div className="space-y-6">
                    {/* Historical services & quotes */}
                    {currentClient.historico_servicos && currentClient.historico_servicos.length > 0 && (() => {
                      const executedList = currentClient.historico_servicos.filter(s => (s as any).tipo === 'servico' || s.status === 'concluido');
                      const quotesList = currentClient.historico_servicos.filter(s => (s as any).tipo === 'orcamento' || s.status === 'orcado');

                      return (
                        <div className="space-y-5">
                          {/* Executed Services */}
                          {executedList.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  <span>Serviços Executados ({executedList.length})</span>
                                </p>
                                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                                  Total: {formatCurrency(executedList.reduce((sum, item) => sum + (Number(item.valor) || 0), 0))}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {executedList.map((serv) => (
                                  <div key={serv.id} className="text-xs border border-emerald-100/80 bg-emerald-50/20 hover:bg-emerald-50/40 p-3 rounded-xl flex justify-between items-center transition">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2">
                                        <p className="font-bold text-slate-800 text-sm">{serv.nome_servico || (serv as any).servico}</p>
                                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-md">
                                          Executado
                                        </span>
                                      </div>
                                      <p className="text-slate-500 text-[11px]">
                                        Data do Serviço: <span className="font-semibold text-slate-700">{formatDate(serv.data)}</span>
                                        {serv.tipo_estofado && ` • Item: ${serv.tipo_estofado}`}
                                        {serv.categoria && ` • Categoria: ${serv.categoria}`}
                                      </p>
                                      {serv.observacoes && (
                                        <p className="text-slate-400 text-[10px] italic">{serv.observacoes}</p>
                                      )}
                                    </div>
                                    <span className="font-bold text-emerald-700 text-sm bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 whitespace-nowrap ml-2">
                                      {formatCurrency(serv.valor)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Quotes Made */}
                          {quotesList.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <FileText className="w-4 h-4 text-amber-600" />
                                  <span>Orçamentos Feitos ({quotesList.length})</span>
                                </p>
                                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                                  Total Propostas: {formatCurrency(quotesList.reduce((sum, item) => sum + (Number(item.valor) || 0), 0))}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {quotesList.map((serv) => (
                                  <div key={serv.id} className="text-xs border border-amber-100/80 bg-amber-50/20 hover:bg-amber-50/40 p-3 rounded-xl flex justify-between items-center transition">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2">
                                        <p className="font-bold text-slate-800 text-sm">{serv.nome_servico || (serv as any).servico}</p>
                                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-md">
                                          Orçamento
                                        </span>
                                      </div>
                                      <p className="text-slate-500 text-[11px]">
                                        {serv.data && <span>Referência: <span className="font-semibold text-slate-700">{formatDate(serv.data)}</span></span>}
                                        {serv.tipo_estofado && ` • Item: ${serv.tipo_estofado}`}
                                        {serv.categoria && ` • Categoria: ${serv.categoria}`}
                                      </p>
                                      {serv.observacoes && (
                                        <p className="text-slate-400 text-[10px] italic">{serv.observacoes}</p>
                                      )}
                                    </div>
                                    <span className="font-bold text-amber-700 text-sm bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 whitespace-nowrap ml-2">
                                      {formatCurrency(serv.valor)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Service Orders (OS) list */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                        <span>Ordens de Serviço ({clientOS.length})</span>
                        <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
                      </p>
                      {clientOS.length > 0 ? (
                        <div className="space-y-3">
                          {clientOS.map(os => {
                            const linkedQuote = os.quote_id 
                              ? db.quotes.find(q => q.id === os.quote_id)
                              : db.quotes.find(q => q.client_id === os.client_id || (clientNormName && q.client_name && q.client_name.toLowerCase().trim() === clientNormName));
                            const quoteItems = linkedQuote ? db.quoteItems.filter(item => item.quote_id === linkedQuote.id) : [];
                            const linkedApp = db.appointments.find(a => a.os_id === os.id);
                            const osPhotos = (db.osPhotos || []).filter(p => p.os_id === os.id);

                            return (
                              <div 
                                key={os.id} 
                                className="text-xs border border-slate-200 bg-white p-3.5 rounded-xl transition shadow-xs hover:border-blue-300 space-y-2.5"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                                      <span>{os.numero}</span>
                                      <span className="text-slate-300">•</span>
                                      <span className="text-emerald-600 font-extrabold">{formatCurrency(os.total)}</span>
                                    </div>
                                    <p className="text-slate-500 text-[11px] mt-0.5">
                                      Criado em {formatDate(os.created_at)}
                                      {os.data_agendada && ` | Agendado: ${formatDate(os.data_agendada)}`}
                                      {os.tecnico && ` • Técnico: ${os.tecnico}`}
                                    </p>
                                  </div>
                                  <StatusBadge type="os" status={os.status} />
                                </div>

                                {/* O que foi feito */}
                                <div className="pt-2 border-t border-slate-100 space-y-1">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                    <span>O que foi feito:</span>
                                  </p>
                                  {quoteItems.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {quoteItems.map(item => (
                                        <span 
                                          key={item.id} 
                                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-700 border border-slate-200 rounded text-[11px] font-medium"
                                        >
                                          <span>{item.qtd}x {item.descricao}</span>
                                        </span>
                                      ))}
                                    </div>
                                  ) : linkedApp?.servicos ? (
                                    <p className="text-xs text-slate-700 font-medium bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                      {linkedApp.servicos}
                                    </p>
                                  ) : os.observacoes ? (
                                    <p className="text-xs text-slate-600 italic bg-slate-50 px-2 py-1 rounded border border-slate-100 line-clamp-2">
                                      {os.observacoes}
                                    </p>
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic">
                                      Higienização e Tratamento Têxtil conforme contrato da O.S.
                                    </p>
                                  )}
                                </div>

                                {/* Badges and Actions */}
                                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {osPhotos.length > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md font-medium">
                                        <Camera className="w-3 h-3 text-indigo-600" />
                                        {osPhotos.length} {osPhotos.length === 1 ? 'foto' : 'fotos'}
                                      </span>
                                    )}
                                    {linkedQuote && (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md font-mono">
                                        <FileText className="w-3 h-3 text-slate-400" />
                                        {linkedQuote.numero}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 ml-auto">
                                    {linkedQuote && (
                                      <button
                                        type="button"
                                        onClick={() => setSelectedQuote(linkedQuote)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/70 rounded-lg transition cursor-pointer"
                                        title="Abrir Orçamento Vinculado"
                                      >
                                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                                        Abrir Orçamento
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedOS(os)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-2xs cursor-pointer"
                                      title="Ver O.S. e o que foi feito"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Ver O.S.
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic bg-slate-50/50 p-3 rounded-xl">
                          Nenhuma ordem de serviço recente emitida no app.
                        </p>
                      )}
                    </div>

                    {/* Quotes (Orçamentos) list */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                        <span>Orçamentos ({clientQuotes.length})</span>
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                      </p>
                      {clientQuotes.length > 0 ? (
                        <div className="space-y-2.5">
                          {clientQuotes.map(q => {
                            const qItems = db.quoteItems.filter(item => item.quote_id === q.id);
                            return (
                              <div 
                                key={q.id} 
                                className="text-xs border border-slate-200 bg-white p-3.5 rounded-xl transition shadow-xs hover:border-blue-300 space-y-2"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                                      <span>{q.numero}</span>
                                      <span className="text-slate-300">•</span>
                                      <span className="text-blue-600 font-extrabold">{formatCurrency(q.total)}</span>
                                    </div>
                                    <p className="text-slate-500 text-[11px] mt-0.5">
                                      Criado em {formatDate(q.created_at)} | Válido até {formatDate(q.validade)}
                                    </p>
                                  </div>
                                  <StatusBadge type="quote" status={q.status} />
                                </div>

                                {qItems.length > 0 && (
                                  <div className="pt-2 border-t border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                      Itens orçados:
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {qItems.map(item => (
                                        <span 
                                          key={item.id} 
                                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-700 border border-slate-200 rounded text-[11px] font-medium"
                                        >
                                          <span>{item.qtd}x {item.descricao}</span>
                                          <span className="text-slate-400 font-mono">({formatCurrency(item.subtotal)})</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="pt-2 border-t border-slate-100 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedQuote(q)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition cursor-pointer"
                                    title="Abrir Orçamento Completo"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                                    Abrir Orçamento
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic bg-slate-50/50 p-3 rounded-xl">
                          Nenhum orçamento emitido no app.
                        </p>
                      )}
                    </div>

                    {/* Agendamentos list */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                        <span>Agendamentos ({clientAppointments.length})</span>
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      </p>
                      {clientAppointments.length > 0 ? (
                        <div className="space-y-2.5">
                          {clientAppointments.map(app => (
                            <div 
                              key={app.id} 
                              className="text-xs border border-slate-200 bg-white p-3 rounded-xl transition shadow-xs space-y-1.5"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <p className="font-bold text-slate-800">
                                    {formatDateTime(app.data_hora)}
                                  </p>
                                  <p className="text-blue-700 font-medium text-[11px] mt-0.5">
                                    {app.servicos}
                                  </p>
                                </div>
                                <StatusBadge type="appointment" status={app.status} />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                                <span>Técnico: <strong className="text-slate-700 font-medium">{app.tecnico}</strong></span>
                                {typeof app.valor === 'number' && app.valor > 0 && (
                                  <span className="font-bold text-emerald-700 font-mono">
                                    {formatCurrency(app.valor)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic bg-slate-50/50 p-3 rounded-xl">
                          Nenhum agendamento registrado.
                        </p>
                      )}
                    </div>

                    {/* Recurrences (Recorrências) list */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                        <span>Recorrência e Retorno ({clientRecurrences.length})</span>
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                      </p>
                      {clientRecurrences.length > 0 ? (
                        <div className="space-y-2">
                          {clientRecurrences.map(r => (
                            <div key={r.id} className="text-xs border border-slate-200 bg-white p-3 rounded-xl flex justify-between items-center shadow-xs">
                              <div>
                                <p className="font-bold text-slate-800 leading-tight">
                                  {r.service_name || r.servico_origem || 'Higienização e Impermeabilização'}
                                </p>
                                <p className="text-slate-500 text-[11px] mt-1 uppercase tracking-wide">
                                  Retorno {r.frequencia || (r.intervalo_meses ? `${r.intervalo_meses} meses` : 'Periódico')} • Próximo sugerido: {formatDate(r.proxima_data || r.proxima_data_sugerida)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                                  r.ativo ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'
                                }`}>
                                  {r.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                                {onUpdateDb && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRecurrenceToDelete(r);
                                      setIsDeleteRecurrenceOpen(true);
                                    }}
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                    title="Excluir recorrência"
                                    aria-label="Excluir recorrência"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic bg-slate-50/50 p-3 rounded-xl">
                          Nenhum cronograma de retorno configurado.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-3 sm:p-4 pb-safe border-t border-slate-100 bg-slate-50 flex flex-col gap-2">
                <div className="flex gap-2">
                  <a
                    href={`https://wa.me/${cleanWhatsAppPhone(client.telefone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span className="truncate">WhatsApp</span>
                  </a>
                  {onNewQuote && (
                    <button
                      type="button"
                      onClick={() => onNewQuote(client)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="truncate">Criar Orçamento</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Confirm Dialog: Delete Recurrence from Drawer */}
      <ConfirmDialog
        isOpen={isDeleteRecurrenceOpen && recurrenceToDelete !== null}
        onClose={() => {
          setIsDeleteRecurrenceOpen(false);
          setRecurrenceToDelete(null);
        }}
        onConfirm={handleConfirmDeleteRecurrence}
        title="Excluir Recorrência"
        description={
          recurrenceToDelete
            ? `Deseja realmente excluir a recorrência (${
                recurrenceToDelete.service_name || recurrenceToDelete.servico_origem || 'Higienização'
              }) deste cliente?`
            : ''
        }
        confirmText="Sim, Excluir"
        cancelText="Cancelar"
        isDanger={true}
      />

      {/* Modal: View OS Details & What was done */}
      {selectedOS && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/80 gap-2">
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <button
                  type="button"
                  onClick={() => setSelectedOS(null)}
                  className="h-8.5 px-2.5 sm:px-3 flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 shadow-2xs transition cursor-pointer shrink-0"
                  title="Voltar ao cliente"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-blue-600" />
                  <span>Voltar</span>
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 font-display text-sm sm:text-base truncate">
                      O.S. {selectedOS.numero}
                    </h3>
                    <StatusBadge type="os" status={selectedOS.status} />
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                    Criada em {formatDate(selectedOS.created_at)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOS(null)}
                className="h-8.5 px-2.5 sm:px-3 flex items-center gap-1 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-xl text-xs font-bold border border-slate-200/80 hover:border-rose-200 transition cursor-pointer shrink-0"
                title="Fechar Ordem de Serviço"
              >
                <X className="w-3.5 h-3.5 text-rose-500" />
                <span>Fechar</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-sm">
              {/* Linked Quote Banner */}
              {linkedQuoteForSelectedOS && (
                <div className="p-3.5 bg-blue-50 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-900">
                        Orçamento Vinculado: {linkedQuoteForSelectedOS.numero}
                      </p>
                      <p className="text-[11px] text-blue-700">
                        Total da proposta: <strong className="font-extrabold">{formatCurrency(linkedQuoteForSelectedOS.total)}</strong> • Status: {linkedQuoteForSelectedOS.status}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedQuote(linkedQuoteForSelectedOS)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Abrir Orçamento Completo
                  </button>
                </div>
              )}

              {/* Section: O Que Foi Feito */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    <span>O Que Foi Feito (Serviços e Itens Realizados)</span>
                  </h4>
                  {linkedQuoteForSelectedOS && (
                    <span className="text-[11px] text-slate-400">
                      Itens da proposta #{linkedQuoteForSelectedOS.numero}
                    </span>
                  )}
                </div>

                {quoteItemsForSelectedOS.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                          <th className="py-2.5 px-3">Item / Serviço Realizado</th>
                          <th className="py-2.5 px-3 text-center">Qtd</th>
                          <th className="py-2.5 px-3 text-right">Preço Unit.</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {quoteItemsForSelectedOS.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/60 transition">
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              {item.descricao}
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                              {item.qtd} {item.unidade || 'un'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {formatCurrency(item.preco_unit)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(item.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                          <td colSpan={3} className="py-2.5 px-3 text-right uppercase text-[11px]">Total da O.S.:</td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-600 text-sm">
                            {formatCurrency(selectedOS.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : appointmentForSelectedOS?.servicos ? (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Serviço Cadastrado na Agenda:
                    </p>
                    <p className="text-sm font-bold text-slate-800">{appointmentForSelectedOS.servicos}</p>
                  </div>
                ) : (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-sm font-semibold text-slate-800">
                      Higienização Profunda e Tratamento Têxtil
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Serviço executado conforme especificações técnicas e protocolo da empresa.
                    </p>
                  </div>
                )}

                {/* Technical notes */}
                {selectedOS.observacoes && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-900">
                    <span className="font-bold block mb-0.5 uppercase tracking-wide text-[10px]">
                      Anotações Técnicas / Observações:
                    </span>
                    <p className="leading-relaxed whitespace-pre-wrap">{selectedOS.observacoes}</p>
                  </div>
                )}

                {/* Historical spreadsheet services if present */}
                {!linkedQuoteForSelectedOS && client.historico_servicos && (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600">
                    <span className="font-bold block mb-0.5 text-slate-700 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      Histórico Geral Registrado na Ficha do Cliente:
                    </span>
                    <p>
                      {Array.isArray(client.historico_servicos)
                        ? client.historico_servicos.map(h => `${h.nome_servico || h.servico || 'Serviço'} (${h.data})`).join(' • ')
                        : String(client.historico_servicos)}
                    </p>
                  </div>
                )}
              </div>

              {/* Execution & Route Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                  <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Execução e Agendamento
                  </h5>
                  <div className="space-y-1.5 text-xs text-slate-700">
                    <p className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Técnico Responsável:</span>
                      <strong className="text-slate-900">{selectedOS.tecnico || 'Não informado'}</strong>
                    </p>
                    <p className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Data Agendada:</span>
                      <strong className="text-slate-900">
                        {selectedOS.data_agendada ? formatDateTime(selectedOS.data_agendada) : 'Não agendado'}
                      </strong>
                    </p>
                    {selectedOS.data_conclusao && (
                      <p className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Concluído em:</span>
                        <strong className="text-emerald-700">{formatDate(selectedOS.data_conclusao)}</strong>
                      </p>
                    )}
                    <p className="flex items-start gap-2 pt-1 border-t border-slate-200/50">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-slate-600">{selectedOS.endereco || client.endereco}</span>
                    </p>
                  </div>
                </div>

                {/* Financial & Payments */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                  <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    Controle Financeiro
                  </h5>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Valor Total Fechado:</span>
                      <strong className="text-slate-900 font-mono">{formatCurrency(selectedOS.total)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Valor Pago:</span>
                      <strong className="text-emerald-600 font-mono">{formatCurrency(selectedOS.pago)}</strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/50 pt-1.5 font-bold">
                      <span className="text-slate-700">Saldo Restante:</span>
                      <span className={selectedOS.total - selectedOS.pago > 0 ? 'text-amber-600 font-mono' : 'text-emerald-600 font-mono'}>
                        {selectedOS.total - selectedOS.pago > 0 ? formatCurrency(selectedOS.total - selectedOS.pago) : 'Quitada'}
                      </span>
                    </div>
                  </div>

                  {/* List of transactions for this OS */}
                  {transactionsForSelectedOS.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/50 space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Recebimentos Registrados:</p>
                      {transactionsForSelectedOS.map(tx => (
                        <div key={tx.id} className="flex justify-between items-center text-[11px] bg-white p-1.5 rounded border border-slate-100">
                          <span className="text-slate-600 font-medium">{formatDate(tx.data)} • {tx.metodo_pagamento}</span>
                          <span className="font-mono font-bold text-emerald-600">+{formatCurrency(tx.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Photo Gallery (Before and After) */}
              <div className="space-y-3 pt-1">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-slate-500" />
                  <span>Relatório Fotográfico do Atendimento</span>
                  <span className="text-[11px] font-normal text-slate-400">({photosForSelectedOS.length})</span>
                </h4>

                {photosForSelectedOS.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photosForSelectedOS.map(photo => (
                      <div key={photo.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100 relative group shadow-2xs">
                        <img
                          src={photo.url}
                          alt={photo.label}
                          className="w-full h-32 sm:h-36 object-cover transition duration-200 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 p-2 text-white flex justify-between items-center text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${photo.label === 'antes' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
                            {photo.label}
                          </span>
                          <span className="text-slate-300">{formatDate(photo.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-5 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 italic">
                    Nenhuma fotografia anexada a este atendimento.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <div>
                {linkedQuoteForSelectedOS && (
                  <button
                    type="button"
                    onClick={() => setSelectedQuote(linkedQuoteForSelectedOS)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    Abrir Orçamento #{linkedQuoteForSelectedOS.numero}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Quote Document */}
      {selectedQuote && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-2 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[94vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-slate-100 bg-slate-50 gap-2">
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <button
                  type="button"
                  onClick={() => setSelectedQuote(null)}
                  className="h-8.5 px-2.5 sm:px-3 flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 shadow-2xs transition cursor-pointer shrink-0"
                  title="Voltar para a ficha do cliente"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-blue-600" />
                  <span>Voltar</span>
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <h3 className="font-bold text-slate-900 font-display text-xs sm:text-base truncate">
                    Proposta • Orçamento #{selectedQuote.numero}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuote(null)}
                className="h-8.5 px-2.5 sm:px-3 flex items-center gap-1 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-xl text-xs font-bold border border-slate-200/80 hover:border-rose-200 transition cursor-pointer shrink-0"
                title="Fechar Proposta"
              >
                <X className="w-3.5 h-3.5 text-rose-500" />
                <span>Fechar</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              <OrcamentoDocument
                quote={selectedQuote}
                db={db}
                items={selectedQuote.itens}
              />
            </div>
          </div>
        </div>
      )}
      {/* Modal: Editar Cadastro do Cliente */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar Cadastro do Cliente"
        size="md"
      >
        <form onSubmit={handleSaveEditedClient} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Nome */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nome Completo *</label>
              <input
                type="text"
                required
                value={editFormData.nome}
                onChange={(e) => setEditFormData({ ...editFormData, nome: e.target.value })}
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
                value={editFormData.telefone}
                onChange={(e) => setEditFormData({ ...editFormData, telefone: e.target.value })}
                placeholder="Ex: 11987654321"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Origem */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Origem do Cliente</label>
              <select
                value={editFormData.origem}
                onChange={(e) => setEditFormData({ ...editFormData, origem: e.target.value as ClientOrigin })}
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
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                placeholder="mariana@gmail.com"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Endereço, Bairro e Região (Google Maps) */}
            <div className="sm:col-span-2">
              <GoogleMapsAddressInput
                initialAddress={editFormData.endereco}
                initialBairro={editFormData.bairro}
                initialCidade={editFormData.cidade}
                initialEstado={editFormData.estado}
                initialCep={editFormData.CEP}
                initialLat={editFormData.lat}
                initialLng={editFormData.lng}
                onLocationChange={(loc) => {
                  setEditFormData(prev => ({
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
                value={editFormData.tags}
                onChange={(e) => setEditFormData({ ...editFormData, tags: e.target.value })}
                placeholder="Ex: VIP, Pet Friendly, Sofa Delicado"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>

            {/* Observações */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Observações Internas</label>
              <textarea
                value={editFormData.observacoes}
                onChange={(e) => setEditFormData({ ...editFormData, observacoes: e.target.value })}
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
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition shadow-xs cursor-pointer"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </Modal>
    </AnimatePresence>
  );
};
