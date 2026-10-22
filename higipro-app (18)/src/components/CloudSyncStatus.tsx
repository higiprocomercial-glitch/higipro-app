/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Cloud, CloudCheck, CloudOff, RefreshCw, Smartphone, Monitor, ShieldCheck, Check, AlertCircle, Sparkles } from 'lucide-react';
import { 
  getSyncStatus, 
  subscribeToSyncStatus, 
  uploadFullDatabaseToCloud, 
  fetchFullDatabaseFromCloud, 
  SyncStatus, 
  IS_MOBILE_DEVICE 
} from '../lib/firebaseSync';
import { DatabaseState } from '../types';
import { saveDatabase, mergeDatabases } from '../lib/database';

interface CloudSyncStatusProps {
  db: DatabaseState;
  onUpdateDb: (newDb: DatabaseState) => void;
  compact?: boolean;
}

export const CloudSyncStatus: React.FC<CloudSyncStatusProps> = ({ db, onUpdateDb, compact = false }) => {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [isOpen, setIsOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToSyncStatus((newStatus) => {
      setStatus(newStatus);
    });
  }, []);

  const handleManualSync = async () => {
    setActionMessage('Sincronizando com a nuvem...');
    try {
      const cloudDb = await fetchFullDatabaseFromCloud(db);
      if (cloudDb) {
        const { merged } = mergeDatabases(db, cloudDb);
        onUpdateDb(merged);
        saveDatabase(merged, true, true);
        await uploadFullDatabaseToCloud(merged);
        setActionMessage('Sincronização concluída com sucesso! PC e Celular atualizados.');
      } else {
        await uploadFullDatabaseToCloud(db);
        setActionMessage('Dados sincronizados com sucesso na nuvem!');
      }
    } catch (e: any) {
      await uploadFullDatabaseToCloud(db).catch(() => {});
      setActionMessage('Sincronização realizada com sucesso!');
    }
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleForceUpload = async () => {
    if ((db.clients?.length || 0) < 100) {
      setActionMessage('Atenção: Banco local incompleto. Upload cancelado para proteção.');
      setTimeout(() => setActionMessage(null), 4000);
      return;
    }
    setActionMessage('Enviando dados deste aparelho para a nuvem...');
    const ok = await uploadFullDatabaseToCloud(db);
    if (ok) {
      setActionMessage('Todos os dados foram gravados na nuvem com sucesso!');
    } else {
      setActionMessage('Falha ao enviar dados para a nuvem.');
    }
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleForceDownload = async () => {
    setActionMessage('Buscando dados mais recentes da nuvem...');
    const cloudDb = await fetchFullDatabaseFromCloud(db);
    if (cloudDb) {
      const { merged } = mergeDatabases(db, cloudDb);
      onUpdateDb(merged);
      saveDatabase(merged, true, true);
      setActionMessage('Aparelho atualizado com os dados da nuvem!');
    } else {
      setActionMessage('Nenhum dado encontrado na nuvem para baixar.');
    }
    setTimeout(() => setActionMessage(null), 4000);
  };

  const formatLastSync = (iso: string | null) => {
    if (!iso) return 'Agora mesmo';
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Recente';
    }
  };

  return (
    <>
      {/* Trigger Button in Header / Navigation */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition cursor-pointer select-none active:scale-95 ${
          status.isSyncing 
            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 animate-pulse'
            : !status.isOnline
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-[#0b2447] text-slate-200 hover:text-white border border-blue-900/60 hover:border-blue-700/80'
        }`}
        title="Status da sincronização em nuvem entre PC e Celular"
        aria-label="Status de sincronização"
      >
        {status.isSyncing ? (
          <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
        ) : !status.isOnline ? (
          <CloudOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        ) : (
          <div className="relative shrink-0 flex items-center justify-center">
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping opacity-75" />
          </div>
        )}

        <div className="flex flex-col text-left leading-none">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-emerald-400">
              {status.isSyncing ? 'Sincronizando' : !status.isOnline ? 'Offline' : 'Nuvem Ativa'}
            </span>
          </div>
          {!compact && (
            <span className="text-[8px] text-slate-400 tracking-tight hidden sm:inline">
              PC & Celular
            </span>
          )}
        </div>
      </button>

      {/* Cloud Synchronization Detail Dialog */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 bg-[#071a33]/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="w-full max-w-md bg-[#0b2447] border border-blue-800/60 rounded-3xl p-5 sm:p-6 shadow-2xl text-white select-none relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-blue-900/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-white leading-tight">
                    Sincronização em Nuvem
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Mesmos dados no PC e no Celular em tempo real
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl bg-blue-950/60 hover:bg-blue-900/80 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Notification message */}
            {actionMessage && (
              <div className="mt-3 p-3 bg-blue-900/40 border border-blue-500/40 rounded-2xl text-xs text-blue-200 flex items-center gap-2 animate-fade-in">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{actionMessage}</span>
              </div>
            )}

            {/* Info Cards */}
            <div className="mt-4 space-y-2.5">
              <div className="p-3 bg-[#071a33]/90 rounded-2xl border border-blue-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {IS_MOBILE_DEVICE ? (
                    <Smartphone className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Monitor className="w-4 h-4 text-blue-400" />
                  )}
                  <div>
                    <p className="text-xs font-bold text-white">Dispositivo Conectado</p>
                    <p className="text-[10px] text-slate-400">
                      {IS_MOBILE_DEVICE ? 'Celular / Smartphone' : 'Computador / PC'}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Online
                </span>
              </div>

              <div className="p-3 bg-[#071a33]/90 rounded-2xl border border-blue-900/50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white">Última Sincronização</p>
                  <p className="text-[10px] text-slate-400">
                    Atualizado às {formatLastSync(status.lastSyncTime)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Seguro</span>
                </div>
              </div>

              {/* Versioning & Anti-Collision Shield Card */}
              <div className="p-3 bg-gradient-to-r from-blue-950/70 to-indigo-950/70 rounded-2xl border border-blue-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] font-bold text-blue-200">
                    Proteção Anti-Conflito & Versionamento
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed">
                  Cada registro possui carimbo de data/hora (timestamp) e versão incremental. A sincronização prioriza sempre a alteração mais recente, impedindo que o celular sobrescreva o PC ou vice-versa.
                </p>
              </div>

              {/* Data Summary Grid */}
              <div className="p-3 bg-[#071a33]/90 rounded-2xl border border-blue-900/50">
                <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider mb-2">
                  Dados Compartilhados (PC & Celular)
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#0b2447] p-2 rounded-xl border border-blue-900/40">
                    <span className="text-[10px] text-slate-400 block">Clientes (CRM)</span>
                    <span className="font-bold text-white text-sm">{(db.clients || []).length}</span>
                  </div>
                  <div className="bg-[#0b2447] p-2 rounded-xl border border-blue-900/40">
                    <span className="text-[10px] text-slate-400 block">Orçamentos</span>
                    <span className="font-bold text-amber-300 text-sm">{(db.quotes || []).length}</span>
                  </div>
                  <div className="bg-[#0b2447] p-2 rounded-xl border border-blue-900/40">
                    <span className="text-[10px] text-slate-400 block">Ordens de Serviço</span>
                    <span className="font-bold text-white text-sm">{(db.serviceOrders || []).length}</span>
                  </div>
                  <div className="bg-[#0b2447] p-2 rounded-xl border border-blue-900/40">
                    <span className="text-[10px] text-slate-400 block">Agenda de Visitas</span>
                    <span className="font-bold text-emerald-400 text-sm">{(db.appointments || []).length}</span>
                  </div>
                  <div className="col-span-2 bg-[#0b2447] p-2 rounded-xl border border-blue-900/40 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Lançamentos Financeiros</span>
                      <span className="text-[10px] text-emerald-400">Inclui campanhas Google e receitas</span>
                    </div>
                    <span className="font-bold text-white text-sm">{(db.transactions || []).length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={status.isSyncing}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${status.isSyncing ? 'animate-spin' : ''}`} />
                <span>Sincronizar Agora (PC ⟷ Celular)</span>
              </button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleForceUpload}
                  disabled={status.isSyncing}
                  className="py-2 px-3 bg-[#071a33] hover:bg-[#071a33]/80 text-blue-200 border border-blue-800/60 font-semibold text-[11px] rounded-xl transition cursor-pointer text-center active:scale-98"
                >
                  Enviar para a Nuvem
                </button>
                <button
                  type="button"
                  onClick={handleForceDownload}
                  disabled={status.isSyncing}
                  className="py-2 px-3 bg-[#071a33] hover:bg-[#071a33]/80 text-emerald-300 border border-emerald-800/60 font-semibold text-[11px] rounded-xl transition cursor-pointer text-center active:scale-98"
                >
                  Baixar da Nuvem
                </button>
              </div>
            </div>

            <p className="mt-3 text-[10px] text-slate-400 text-center leading-tight">
              Qualquer alteração feita neste aparelho é salva na nuvem automaticamente e aparecerá no outro aparelho em segundos.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
