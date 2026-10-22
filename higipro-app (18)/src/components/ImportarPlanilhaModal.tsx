/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, CheckCircle2, AlertCircle, X, ArrowUpRight, 
  ArrowDownLeft, Users, DollarSign, Calendar, RefreshCw, FileSpreadsheet,
  ClipboardPaste
} from 'lucide-react';
import { DatabaseState } from '../types';
import { 
  ParsedFinancialRow, 
  FinancialImportStats, 
  parseFinancialFile, 
  parseFinancialText, 
  applyImportedFinancialTransactions 
} from '../lib/financialImport';
import { formatCurrency } from '../lib/utils';

interface ImportarPlanilhaModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: DatabaseState;
  onUpdateDb: (updated: DatabaseState) => void;
  onSuccessNavigate?: (year: number, month: number) => void;
}

export const ImportarPlanilhaModal: React.FC<ImportarPlanilhaModalProps> = ({
  isOpen,
  onClose,
  db,
  onUpdateDb,
  onSuccessNavigate
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedFinancialRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [successStats, setSuccessStats] = useState<FinancialImportStats | null>(null);

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
      const rows = await parseFinancialFile(file);
      if (rows.length === 0) {
        setError('Nenhum lançamento válido foi identificado no arquivo. Verifique se o arquivo possui colunas com data, tipo (Entrada/Saída), categoria e valor.');
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

  const handleProcessPastedText = () => {
    setError(null);
    if (!pastedText.trim()) {
      setError('Por favor, cole os dados da planilha ou CSV antes de continuar.');
      return;
    }

    try {
      const rows = parseFinancialText(pastedText);
      if (rows.length === 0) {
        setError('Não foi possível identificar lançamentos no texto colado. Verifique se as linhas contêm colunas separadas por ponto e vírgula (;), tabulação ou vírgula.');
      } else {
        setParsedRows(rows);
        setFileName('Dados colados manualmente');
      }
    } catch (err: any) {
      setError(`Erro ao interpretar o texto: ${err.message}`);
    }
  };

  const handleConfirmSync = () => {
    if (parsedRows.length === 0) return;

    try {
      const { updatedDb, stats } = applyImportedFinancialTransactions(db, parsedRows);
      onUpdateDb(updatedDb);
      setSuccessStats(stats);

      if (stats.affectedMonthYear && onSuccessNavigate) {
        onSuccessNavigate(stats.affectedMonthYear.year, stats.affectedMonthYear.month);
      }

      setTimeout(() => {
        handleReset();
        onClose();
      }, 2500);
    } catch (err: any) {
      setError(`Erro ao salvar no banco de dados: ${err.message}`);
    }
  };

  const handleReset = () => {
    setParsedRows([]);
    setFileName(null);
    setPastedText('');
    setError(null);
    setSuccessStats(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Preview totals
  const totalReceitas = parsedRows
    .filter(r => r.tipo === 'ENTRADA')
    .reduce((sum, r) => sum + r.valor, 0);

  const totalDespesas = parsedRows
    .filter(r => r.tipo === 'SAIDA')
    .reduce((sum, r) => sum + r.valor, 0);

  const saldo = totalReceitas - totalDespesas;
  const entradasCount = parsedRows.filter(r => r.tipo === 'ENTRADA').length;
  const saidasCount = parsedRows.filter(r => r.tipo === 'SAIDA').length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 font-display">
                Importar & Sincronizar Lançamentos Financeiros
              </h2>
              <p className="text-xs text-slate-500">
                Adicione lançamentos de arquivos CSV, Excel (como Pasta1.csv) e sincronize com o Fluxo de Caixa e CRM.
              </p>
            </div>
          </div>
          <button
            onClick={() => { handleReset(); onClose(); }}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* Success Banner */}
          {successStats && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                Lançamentos Sincronizados com Sucesso no Sistema!
              </div>
              <p className="text-xs text-emerald-700">
                Foram processados {successStats.totalRows} registros ({successStats.newTxCount} novos lançamentos e {successStats.updatedTxCount} atualizados). 
                {successStats.newClientsCount > 0 && ` ${successStats.newClientsCount} novos clientes cadastrados no CRM.`}
              </p>
              <div className="flex gap-4 text-xs font-semibold pt-1">
                <span>Receitas: {formatCurrency(successStats.totalReceitas)}</span>
                <span>Despesas: {formatCurrency(successStats.totalDespesas)}</span>
                <span>Saldo: {formatCurrency(successStats.saldo)}</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Input selection (tabs) if no preview rows yet */}
          {parsedRows.length === 0 && !successStats && (
            <div className="space-y-4">
              <div className="flex border-b border-slate-200 gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`pb-2.5 text-xs sm:text-sm font-semibold transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'upload'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Upload de Arquivo (CSV ou Excel)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  className={`pb-2.5 text-xs sm:text-sm font-semibold transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'paste'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ClipboardPaste className="w-4 h-4" />
                  Colar Texto da Planilha
                </button>
              </div>

              {activeTab === 'upload' ? (
                <div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/40 hover:bg-blue-50/80 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
                  >
                    <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        Clique para selecionar ou arraste o arquivo aqui
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Formatos suportados: <strong>Pasta1.csv</strong>, .xlsx, .xls, .tsv
                      </p>
                    </div>
                    <span className="inline-block px-3 py-1 bg-white border border-blue-200 rounded-full text-[11px] font-semibold text-blue-700 shadow-2xs">
                      Reconhece Entradas, Saídas, Categorias, Clientes e Valores
                    </span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, .xlsx, .xls, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Cole as linhas da planilha abaixo:
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Ex: 26/09/2026;ENTRADA;Higienização;Cliente;350,00
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`Exemplo:\n26/09/2026;ENTRADA;Higienização;Ana Silva;350,00\n26/09/2026;SAIDA;Combustível;;100,00\n26/09/2026;ENTRADA;Impermeabilização;Carlos Rossi;780,00`}
                    className="w-full text-xs font-mono p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50/50"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleProcessPastedText}
                      disabled={!pastedText.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
                    >
                      Interpretar Lançamentos
                    </button>
                  </div>
                </div>
              )}

              {/* Informative note */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Sincronização Inteligente & Sem Duplicidades:
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Os lançamentos serão associados ao mês correspondente no Fluxo de Caixa. Clientes das entradas serão vinculados ou cadastrados automaticamente no CRM, e itens repetidos não serão duplicados.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Preview & Confirmation */}
          {parsedRows.length > 0 && !successStats && (
            <div className="space-y-4">
              
              {/* File / source bar */}
              <div className="flex items-center justify-between p-3 bg-blue-50/80 border border-blue-200/70 rounded-xl">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-blue-900">{fileName || 'Arquivo Carregado'}</span>
                  <span className="text-[11px] px-2 py-0.5 bg-blue-200/60 text-blue-800 rounded-full font-semibold">
                    {parsedRows.length} lançamentos detectados
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer"
                >
                  Trocar arquivo
                </button>
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Lançamentos</span>
                  <span className="text-base sm:text-lg font-bold text-slate-800">{parsedRows.length}</span>
                  <span className="text-[10px] text-slate-400 block">{entradasCount} ent. / {saidasCount} saí.</span>
                </div>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">Receitas</span>
                  <span className="text-base sm:text-lg font-bold text-emerald-700">{formatCurrency(totalReceitas)}</span>
                  <span className="text-[10px] text-emerald-600 block">{entradasCount} entradas</span>
                </div>
                <div className="p-3 bg-red-50/60 rounded-xl border border-red-100">
                  <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider block">Despesas</span>
                  <span className="text-base sm:text-lg font-bold text-red-700">{formatCurrency(totalDespesas)}</span>
                  <span className="text-[10px] text-red-600 block">{saidasCount} saídas</span>
                </div>
                <div className={`p-3 rounded-xl border ${saldo >= 0 ? 'bg-blue-50/60 border-blue-100 text-blue-700' : 'bg-amber-50/60 border-amber-100 text-amber-700'}`}>
                  <span className="text-[11px] font-semibold uppercase tracking-wider block">Saldo Previsto</span>
                  <span className="text-base sm:text-lg font-bold">{formatCurrency(saldo)}</span>
                  <span className="text-[10px] block opacity-80">{saldo >= 0 ? 'Superávit' : 'Déficit'}</span>
                </div>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="px-3.5 py-2 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Prévia dos Lançamentos Identificados</span>
                  <span className="text-[11px] text-slate-500 font-normal">Mostrando até 50 itens</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 text-[11px]">
                      <tr>
                        <th className="p-2.5 font-semibold">Data</th>
                        <th className="p-2.5 font-semibold">Tipo</th>
                        <th className="p-2.5 font-semibold">Categoria</th>
                        <th className="p-2.5 font-semibold">Cliente / Descrição</th>
                        <th className="p-2.5 font-semibold text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {parsedRows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/80 transition">
                          <td className="p-2.5 font-mono text-[11px] text-slate-600">
                            {row.data}
                          </td>
                          <td className="p-2.5">
                            {row.tipo === 'ENTRADA' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                <ArrowUpRight className="w-3 h-3" />
                                Entrada
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                                <ArrowDownLeft className="w-3 h-3" />
                                Saída
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-medium">{row.categoria}</td>
                          <td className="p-2.5 max-w-[200px] truncate" title={row.clienteOuDescricao}>
                            {row.clienteOuDescricao}
                          </td>
                          <td className={`p-2.5 font-bold text-right font-mono ${row.tipo === 'ENTRADA' ? 'text-emerald-700' : 'text-red-700'}`}>
                            {row.tipo === 'SAIDA' ? '-' : '+'}{formatCurrency(row.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => { handleReset(); onClose(); }}
            className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-white text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            {successStats ? 'Concluído' : 'Cancelar'}
          </button>

          {parsedRows.length > 0 && !successStats && (
            <button
              type="button"
              onClick={handleConfirmSync}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Confirmar e Sincronizar Tudo ({parsedRows.length} itens)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
