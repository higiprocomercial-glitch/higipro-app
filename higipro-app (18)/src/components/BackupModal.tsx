import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, Upload, Mail, CheckCircle2, AlertTriangle, Copy, Check, FileJson,
  History, Clock, RotateCcw, PlusCircle, ShieldCheck
} from 'lucide-react';
import { DatabaseState } from '../types';
import { Modal } from './UIComponents';
import { hasPreviousBackup, restorePreviousBackup, saveDatabase } from '../lib/database';
import { 
  listIndexedDBSnapshots, 
  restoreIndexedDBSnapshot, 
  createIndexedDBSnapshot, 
} from '../lib/idbDatabase';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: DatabaseState;
  onRestore: (restoredDb: DatabaseState) => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose, db, onRestore }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [pastedJson, setPastedJson] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formattedDate = new Date().toISOString().split('T')[0];
  const backupFileName = `backup_higipro_${formattedDate}.json`;
  const backupDataString = JSON.stringify(db, null, 2);

  // Load available snapshots whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      loadSnapshotsList();
    }
  }, [isOpen]);

  const loadSnapshotsList = async () => {
    setIsLoadingSnapshots(true);
    try {
      const list = await listIndexedDBSnapshots();
      setSnapshots(list);
    } catch (e) {
      console.warn('Could not load snapshots list', e);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  const handleCreateManualSnapshot = async () => {
    setCreatingSnapshot(true);
    try {
      await createIndexedDBSnapshot(db, `Ponto Manual (${new Date().toLocaleTimeString('pt-BR')})`);
      await loadSnapshotsList();
      setRestoreSuccess('Novo ponto de restauração criado com sucesso!');
      setTimeout(() => setRestoreSuccess(null), 3000);
    } catch (e: any) {
      setRestoreError('Erro ao criar ponto de restauração: ' + e?.message);
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (snapId: string) => {
    try {
      const restored = await restoreIndexedDBSnapshot(snapId);
      if (restored) {
        onRestore(restored);
        saveDatabase(restored, true);
        setRestoreSuccess('Ponto de restauração aplicado com sucesso!');
        setRestoreError(null);
        setTimeout(() => {
          setRestoreSuccess(null);
          onClose();
        }, 2000);
      } else {
        setRestoreError('Não foi possível ler os dados do ponto de restauração selecionado.');
      }
    } catch (err: any) {
      setRestoreError('Erro ao restaurar: ' + (err.message || 'Falha desconhecida'));
    }
  };

  // Trigger JSON download
  const handleDownloadBackup = () => {
    const blob = new Blob([backupDataString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy json string to clipboard
  const handleCopyClipboard = () => {
    navigator.clipboard.writeText(backupDataString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  // Get prefilled mailto link
  const getMailtoLink = () => {
    const toEmail = 'higiprocomercial@gmail.com';
    const subject = `Backup de Segurança HigiPro - ${new Date().toLocaleDateString('pt-BR')}`;
    
    const body = `Olá Luciano,

Segue o backup de segurança gerado pelo aplicativo HigiPro em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}.

INSTRUÇÕES:
1. Faça o download e salve o arquivo "${backupFileName}" em local seguro.
2. Para restaurar, abra a aba "Backup de Dados" e carregue o arquivo .json.

Atenciosamente,
Sistema HigiPro`;

    return `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Parse and validate restore file
  const validateAndRestore = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
      
      const hasClients = Array.isArray(parsed.clients);
      const hasQuotes = Array.isArray(parsed.quotes);
      const hasTransactions = Array.isArray(parsed.transactions);
      
      if (!hasClients || !hasQuotes || !hasTransactions) {
        throw new Error('O arquivo de backup não possui o formato correto do HigiPro (campos obrigatórios ausentes).');
      }

      onRestore(parsed);
      saveDatabase(parsed, true);
      setRestoreSuccess('Dados restaurados com sucesso a partir do arquivo importado!');
      setRestoreError(null);
      setPastedJson('');
      setTimeout(() => {
        setRestoreSuccess(null);
        onClose();
      }, 2500);
    } catch (err: any) {
      setRestoreError(err.message || 'Código de backup inválido. Certifique-se de que é um JSON válido exportado pelo HigiPro.');
      setRestoreSuccess(null);
    }
  };

  const handleRollback = () => {
    const previous = restorePreviousBackup();
    if (previous) {
      onRestore(previous);
      saveDatabase(previous, true);
      setRestoreSuccess('Versão anterior restaurada com sucesso!');
      setRestoreError(null);
      setShowRollbackConfirm(false);
      setTimeout(() => {
        setRestoreSuccess(null);
        onClose();
      }, 2500);
    } else {
      setRestoreError('Nenhum backup de versão anterior encontrado.');
      setShowRollbackConfirm(false);
    }
  };

  // Handle file select restore
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      validateAndRestore(text);
    };
    reader.readAsText(file);
  };

  // Handle drop zone
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      validateAndRestore(text);
    };
    reader.readAsText(file);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Backup e Pontos de Restauração HigiPro"
      size="lg"
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
        
        {/* Intro Alert */}
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900 leading-normal">
            <p className="font-extrabold mb-1">Armazenamento Persistente Duplo Ativo</p>
            <p className="text-slate-600">
              Seus dados (Clientes, Orçamentos, Agenda de Atendimentos, OS e Financeiro) são gravados automaticamente tanto no <strong>IndexedDB (alta capacidade sem limite de 5MB)</strong> quanto na nuvem. Pontos de restauração automáticos são criados periodicamente para prevenir qualquer perda.
            </p>
          </div>
        </div>

        {/* Status Messages */}
        {restoreError && (
          <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="leading-tight">{restoreError}</p>
          </div>
        )}

        {restoreSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold">{restoreSuccess}</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">O sistema foi atualizado com todas as informações recuperadas.</p>
            </div>
          </div>
        )}

        {/* Automatic Snapshots Section (IndexedDB timeline) */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Pontos de Restauração no Navegador
              </h3>
            </div>
            <button
              type="button"
              onClick={handleCreateManualSnapshot}
              disabled={creatingSnapshot}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg transition cursor-pointer disabled:opacity-50"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {creatingSnapshot ? 'Criando...' : 'Salvar Ponto Agora'}
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Cópias automáticas salvas no IndexedDB deste dispositivo. Se você notar divergência ou quiser voltar para uma gravação anterior, restaure um dos pontos abaixo:
          </p>

          {isLoadingSnapshots ? (
            <div className="p-4 text-center text-xs text-slate-400">Carregando pontos de restauração...</div>
          ) : snapshots.length === 0 ? (
            <div className="p-4 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-500">
              Nenhum ponto de restauração anterior registrado ainda. Clique em "Salvar Ponto Agora" para registrar o estado atual.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-700">{snap.dateString}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                        {snap.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 flex flex-wrap gap-2">
                      <span><strong>{snap.stats.quotes}</strong> orçamentos</span>
                      <span>•</span>
                      <span><strong>{snap.stats.appointments}</strong> agendamentos</span>
                      <span>•</span>
                      <span><strong>{snap.stats.clients}</strong> clientes</span>
                      <span>•</span>
                      <span><strong>{snap.stats.orders}</strong> OS</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRestoreSnapshot(snap.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 font-semibold text-[11px] rounded-lg transition border border-slate-200 hover:border-emerald-200 cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar Este Ponto
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export & Email Section */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Exportar Cópia Externa (Download e E-mail)
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Baixe o arquivo completo (.json) para o seu computador/celular ou envie por e-mail para <strong className="text-slate-700">higiprocomercial@gmail.com</strong> para guardar como arquivo físico de segurança.
          </p>
          
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadBackup}
              className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              Baixar Arquivo JSON
            </button>
            
            <a
              href={getMailtoLink()}
              onClick={() => {
                handleDownloadBackup();
              }}
              className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
            >
              <Mail className="w-4 h-4" />
              Enviar para o E-mail
            </a>

            <button
              onClick={handleCopyClipboard}
              className="px-3 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer"
              title="Copiar dados para área de transferência"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {isCopied ? 'Copiado!' : 'Copiar Texto'}
            </button>
          </div>
        </div>

        {/* Import Section */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Importar Arquivo de Backup (.json)
          </h3>
          
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
              isDragOver 
                ? 'border-blue-600 bg-blue-50/20 text-blue-700' 
                : 'border-slate-200 hover:border-slate-300 text-slate-500 bg-white'
            }`}
          >
            <Upload className="w-8 h-8 text-slate-400" />
            <p className="text-xs font-bold">Arraste o arquivo de backup (.json) aqui</p>
            <p className="text-[10px] text-slate-400">ou clique para selecionar no seu dispositivo</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".json" 
              className="hidden" 
            />
          </div>

          <details className="text-xs text-slate-500 cursor-pointer select-none">
            <summary className="font-semibold hover:text-slate-700 transition">
              Restaurar colando o código de texto
            </summary>
            <div className="mt-3 space-y-2">
              <textarea
                value={pastedJson}
                onChange={e => setPastedJson(e.target.value)}
                placeholder="Cole aqui o texto do seu backup de segurança..."
                className="w-full h-24 p-3 border border-slate-200 rounded-xl font-mono text-[10px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => validateAndRestore(pastedJson)}
                disabled={!pastedJson.trim()}
                className="w-full py-2 bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 text-xs rounded-lg transition disabled:opacity-50 cursor-pointer"
              >
                Confirmar Importação de Texto
              </button>
            </div>
          </details>
        </div>

        {/* Rollback Section with clean inline confirmation */}
        {hasPreviousBackup() && (
          <div className="p-4 bg-rose-50 border border-rose-100/70 rounded-2xl flex flex-col gap-3">
            <div className="flex gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-xs text-rose-900 uppercase tracking-wider">Reverter para Versão de Backup Anterior</p>
                <p className="text-[11px] text-rose-700/80 leading-normal mt-0.5">
                  Existe uma cópia de segurança arquivada no navegador. Se você deseja restaurá-la para desfazer alterações recentes, use a opção abaixo.
                </p>
              </div>
            </div>

            {showRollbackConfirm ? (
              <div className="p-3 bg-white border border-rose-200 rounded-xl space-y-2">
                <p className="text-xs text-rose-800 font-bold">Confirma a restauração da versão anterior salva?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleRollback}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Sim, Restaurar Versão Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRollbackConfirm(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowRollbackConfirm(true)}
                className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
              >
                Restaurar Versão Anterior Arquivada
              </button>
            )}
          </div>
        )}

        {/* Export Requested Reports Section (01, 02, 03) */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <p className="font-extrabold text-xs text-emerald-950 uppercase tracking-wider">Exportações Solicitadas (Clientes, Catálogo e Financeiro)</p>
              <p className="text-[11px] text-emerald-800/80 leading-normal mt-0.5">
                Baixe relatórios detalhados formatados contendo todos os dados solicitados pelo sistema:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                let content = "=== 01 - LISTA DE CLIENTES, ORÇAMENTOS E ORDENS DE SERVIÇO ===\n\n";
                (db.clients || []).forEach(client => {
                  content += `Cliente: ${client.nome} | Tel: ${client.telefone} | Endereço: ${client.endereco || ''} (${client.cidade || 'Passo Fundo'})\n`;
                  
                  const clientQuotes = (db.quotes || []).filter(q => q.client_id === client.id || q.cliente_nome?.toLowerCase() === client.nome.toLowerCase());
                  content += `  [Orçamentos (${clientQuotes.length})]:\n`;
                  clientQuotes.forEach(q => {
                    content += `    - Data: ${q.created_at || q.data || 'N/D'} | Valor: R$ ${q.valor_total || q.valor || 0} | Status: ${q.status || 'pendente'} | Serviços: ${JSON.stringify(q.servicos || q.itens || [])}\n`;
                  });

                  const clientOS = (db.serviceOrders || []).filter(os => os.client_id === client.id || os.cliente_nome?.toLowerCase() === client.nome.toLowerCase());
                  content += `  [Ordens de Serviço (${clientOS.length})]:\n`;
                  clientOS.forEach(os => {
                    content += `    - OS: ${os.id} | Data: ${os.created_at || os.data || 'N/D'} | Valor: R$ ${os.valor_total || os.valor || 0} | Status: ${os.status || 'concluido'} | Serviços: ${JSON.stringify(os.servicos || [])}\n`;
                  });
                  content += "------------------------------------------------------------\n\n";
                });

                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `01_clientes_orcamentos_os_${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer text-center flex flex-col items-center justify-center gap-1"
            >
              <Download className="w-4 h-4" />
              <span>01. Clientes, Orçamentos & OS</span>
            </button>

            <button
              type="button"
              onClick={() => {
                let content = "=== 02 - CATÁLOGO DE SERVIÇOS HIGIPRO ===\n\n";
                (db.services || []).forEach((s, idx) => {
                  content += `${idx + 1}. ${s.nome} | Categoria: ${s.categoria || 'Geral'} | Valor Sugerido: R$ ${s.valor_sugerido || s.valor || 0} | Tempo Estimado: ${s.tempo_estimado_horas || 2}h\n`;
                  content += `   Descrição: ${s.descricao || 'Higienização e limpeza profissional'}\n\n`;
                });

                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `02_catalogo_servicos_${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer text-center flex flex-col items-center justify-center gap-1"
            >
              <Download className="w-4 h-4" />
              <span>02. Catálogo de Serviços</span>
            </button>

            <button
              type="button"
              onClick={() => {
                let content = "=== 03 - RELATÓRIO FINANCEIRO DESDE 2022 (Meses, Clientes, Despesas e Receitas) ===\n\n";
                const sortedTx = [...(db.transactions || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
                
                const grouped: Record<string, typeof sortedTx> = {};
                sortedTx.forEach(t => {
                  const ym = (t.data || '2022-01').substring(0, 7);
                  if (!grouped[ym]) grouped[ym] = [];
                  grouped[ym].push(t);
                });

                Object.keys(grouped).sort().forEach(ym => {
                  content += `\n================ MÊS: ${ym} ================\n`;
                  let totalRec = 0;
                  let totalDesp = 0;
                  grouped[ym].forEach(t => {
                    const val = t.valor || 0;
                    if (t.tipo === 'receita') totalRec += val;
                    else totalDesp += val;
                    content += `[${t.data || 'Data N/D'}] ${t.tipo.toUpperCase()} | Cliente/Origem: ${t.client_name || t.descricao || 'Geral'} | Categoria: ${t.categoria || 'Geral'} | R$ ${val.toFixed(2)} (${t.status || 'pago'})\n`;
                  });
                  content += `--> Resumo ${ym}: Receitas: R$ ${totalRec.toFixed(2)} | Despesas: R$ ${totalDesp.toFixed(2)} | Saldo: R$ ${(totalRec - totalDesp).toFixed(2)}\n`;
                });

                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `03_financeiro_desde_2022_${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer text-center flex flex-col items-center justify-center gap-1"
            >
              <Download className="w-4 h-4" />
              <span>03. Financeiro Desde 2022</span>
            </button>
          </div>
        </div>

        {/* Download Código-Fonte ZIP para Vercel / GitHub */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <p className="font-extrabold text-xs text-blue-950 uppercase tracking-wider">Código Completo do App (ZIP para Vercel)</p>
              <p className="text-[11px] text-blue-800/80 leading-normal mt-0.5">
                Baixe o pacote ZIP completo com todas as correções e configurações do Firebase para implantar no Vercel.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href="/higipro-app.zip"
              download="higipro-app.zip"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer text-center"
            >
              <Download className="w-4 h-4" />
              <span>Baixar ZIP Oficial (higipro-app.zip)</span>
            </a>

            <a
              href="/higipro-atualizado.zip"
              download="higipro-atualizado.zip"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer text-center"
            >
              <Download className="w-4 h-4" />
              <span>Link Alternativo (.zip)</span>
            </a>
          </div>
        </div>

      </div>
    </Modal>
  );
};
