/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, CheckCircle2, AlertCircle, X, ArrowUpRight, 
  Users, DollarSign, Calendar, RefreshCw, FileSpreadsheet,
  ClipboardPaste, Check, Clock
} from 'lucide-react';
import { DatabaseState } from '../types';
import { 
  ParsedQuoteRow, 
  QuoteImportStats, 
  parseQuoteFile, 
  parseQuoteText, 
  computeQuoteImportStats, 
  applyImportedQuotesToDb 
} from '../lib/quoteImport';
import { formatCurrency } from '../lib/utils';

interface ImportarOrcamentosModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: DatabaseState;
  onUpdateDb: (updated: DatabaseState) => void;
}

export const ImportarOrcamentosModal: React.FC<ImportarOrcamentosModalProps> = ({
  isOpen,
  onClose,
  db,
  onUpdateDb,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedQuoteRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [successStats, setSuccessStats] = useState<QuoteImportStats | null>(null);
  const [syncFinanceiro, setSyncFinanceiro] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    setError(null);
    setIsProcessing(true);
    setFileName(file.name);
    try {
      const rows = await parseQuoteFile(file);
      if (rows.length === 0) {
        setError('Nenhum orçamento válido foi identificado no arquivo. Verifique se o arquivo possui colunas com data, cliente, serviço, valor e fechou (sim/não).');
        setParsedRows([]);
      } else {
        setParsedRows(rows);
      }
    } catch (err: any) {
      setError(`Erro ao processar o arquivo: ${err.message || 'Formato incompatível'}`);
      setParsedRows([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handlePasteProcess = () => {
    if (!pastedText.trim()) {
      setError('Cole o conteúdo CSV ou texto da planilha de orçamentos.');
      return;
    }
    setError(null);
    setIsProcessing(true);
    setFileName('Dados Colados');
    try {
      const rows = parseQuoteText(pastedText);
      if (rows.length === 0) {
        setError('Não foi possível identificar linhas de orçamentos válidas no texto colado.');
        setParsedRows([]);
      } else {
        setParsedRows(rows);
      }
    } catch (err: any) {
      setError(`Erro ao interpretar texto: ${err.message}`);
      setParsedRows([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (parsedRows.length === 0) return;
    try {
      const stats = computeQuoteImportStats(parsedRows, db.clients || []);
      const updated = applyImportedQuotesToDb(db, parsedRows, syncFinanceiro);
      onUpdateDb(updated);
      setSuccessStats(stats);
    } catch (err: any) {
      setError(`Erro ao salvar orçamentos: ${err.message}`);
    }
  };

  const handleCloseAndReset = () => {
    setParsedRows([]);
    setFileName(null);
    setError(null);
    setPastedText('');
    setSuccessStats(null);
    onClose();
  };

  const stats = parsedRows.length > 0 ? computeQuoteImportStats(parsedRows, db.clients || []) : null;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100/80 text-blue-700 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 font-display">
                Importar Planilha de Orçamentos
              </h2>
              <p className="text-xs text-slate-500">
                Carregue arquivos CSV ou Excel (como Pasta1.csv) e sincronize orçamentos, ordens de serviço, agenda e CRM.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={handleCloseAndReset}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {successStats ? (
            /* Success Feedback View */
            <div className="text-center py-8 px-4 space-y-5">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Orçamentos Importados e Sincronizados com Sucesso!</h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  A base de orçamentos, histórico de clientes no CRM, ordens de serviço e lançamentos financeiros foram atualizados.
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-2">
                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-center">
                  <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">Total Orçamentos</span>
                  <span className="text-xl font-extrabold text-blue-900">{successStats.totalQuotes}</span>
                </div>
                <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl text-center">
                  <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Fechados / Aprovados</span>
                  <span className="text-xl font-extrabold text-emerald-900">{successStats.approvedQuotes}</span>
                </div>
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-center">
                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block">Volume Total</span>
                  <span className="text-base font-extrabold text-indigo-900">{formatCurrency(successStats.totalValor)}</span>
                </div>
                <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl text-center">
                  <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block">Clientes CRM</span>
                  <span className="text-xl font-extrabold text-purple-900">+{successStats.newClientsCount}</span>
                </div>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleCloseAndReset}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Concluir e Ver Orçamentos
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tab Selector */}
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
                    activeTab === 'upload'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Carregar Arquivo (.csv, .xlsx, .xls)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
                    activeTab === 'paste'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <ClipboardPaste className="w-4 h-4" />
                  Colar Texto / CSV
                </button>
              </div>

              {/* Upload Dropzone */}
              {activeTab === 'upload' && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-blue-50/20 transition cursor-pointer group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv, .xlsx, .xls, .tsv, .txt"
                    className="hidden"
                  />
                  <div className="w-12 h-12 bg-white rounded-full shadow-xs border border-slate-200 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition text-blue-600">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">
                    Arraste sua planilha aqui ou clique para selecionar
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Formatos suportados: <strong>Pasta1.csv</strong>, .xlsx, .xls, .tsv
                  </p>
                </div>
              )}

              {/* Paste Text Tab */}
              {activeTab === 'paste' && (
                <div className="space-y-3">
                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Cole aqui o conteúdo de sua planilha com as colunas separadas por ponto-e-vírgula ou tabulação:&#10;Data;Cliente;Serviço;Valor;Fechou?;Agendamento"
                    className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-600 focus:bg-white transition"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handlePasteProcess}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer disabled:opacity-50"
                    >
                      {isProcessing ? 'Processando...' : 'Processar Texto Colado'}
                    </button>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <div>
                    <span className="font-bold">Atenção: </span>
                    {error}
                  </div>
                </div>
              )}

              {/* Preview Table & Stats */}
              {parsedRows.length > 0 && stats && (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Pré-visualização do Arquivo ({parsedRows.length} Orçamentos)
                      </h4>
                      {fileName && <p className="text-xs text-blue-600 font-medium">{fileName}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={syncFinanceiro}
                          onChange={(e) => setSyncFinanceiro(e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>Lançar receitas no Financeiro para orçamentos fechados</span>
                      </label>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                      <span className="text-[10px] font-bold text-blue-600 uppercase block">Total Orçado</span>
                      <span className="text-sm font-extrabold text-blue-900">{formatCurrency(stats.totalValor)}</span>
                    </div>
                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase block">Fechados ({stats.approvedQuotes})</span>
                      <span className="text-sm font-extrabold text-emerald-900">{formatCurrency(stats.approvedValor)}</span>
                    </div>
                    <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                      <span className="text-[10px] font-bold text-amber-600 uppercase block">Pendentes</span>
                      <span className="text-sm font-extrabold text-amber-900">{stats.pendingQuotes}</span>
                    </div>
                    <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100">
                      <span className="text-[10px] font-bold text-purple-600 uppercase block">Novos Clientes CRM</span>
                      <span className="text-sm font-extrabold text-purple-900">+{stats.newClientsCount}</span>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Data</th>
                          <th className="py-2 px-3">Cliente</th>
                          <th className="py-2 px-3">Origem</th>
                          <th className="py-2 px-3">Serviço</th>
                          <th className="py-2 px-3">Fechou?</th>
                          <th className="py-2 px-3">Agendamento</th>
                          <th className="py-2 px-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/80 transition">
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{row.dataOrcamento}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">{row.cliente}</td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                {row.origem}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600 truncate max-w-[140px]">{row.servico}</td>
                            <td className="py-2 px-3">
                              {row.fechou ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <Check className="w-3 h-3" /> Fechou
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                  <Clock className="w-3 h-3" /> Aberto
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                              {row.dataAgendamento || '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-800">
                              {formatCurrency(row.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedRows.length > 50 && (
                    <p className="text-[11px] text-slate-400 text-center">
                      Exibindo as primeiras 50 de {parsedRows.length} linhas identificadas.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!successStats && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseAndReset}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={parsedRows.length === 0 || isProcessing}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Confirmar e Sincronizar ({parsedRows.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
