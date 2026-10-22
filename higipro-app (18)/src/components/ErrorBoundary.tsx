/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { LogoHigiPro } from './HigiProLogo';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('HigiPro ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.hash = '';
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    try {
      window.localStorage.removeItem('higipro_transient_search');
    } catch (e) {}
    window.location.href = window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 text-center select-none">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center mb-4 text-amber-400">
              <LogoHigiPro size="md" showText={false} theme="dark" className="w-10 h-12" />
            </div>

            <div className="flex items-center gap-2 text-rose-400 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-bold font-display text-white">Ops, encontramos uma instabilidade</h2>
            </div>

            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Ocorreu uma falha inesperada na visualização. Seus dados cadastrados e alterações permanecem 100% seguros no dispositivo.
            </p>

            {this.state.error && (
              <div className="mt-4 p-3 bg-slate-900/90 rounded-xl border border-slate-700/60 w-full text-left overflow-x-auto max-h-28 custom-scrollbar">
                <p className="text-[11px] font-mono text-rose-300 break-all">
                  {this.state.error.name}: {this.state.error.message}
                </p>
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
              <button
                type="button"
                onClick={this.handleGoHome}
                className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home className="w-4 h-4 text-amber-400" />
                <span>Ir ao Início</span>
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Recarregar Tela</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface SectionProps {
  children: ReactNode;
  title?: string;
  fallbackMessage?: string;
}

interface SectionState {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<SectionProps, SectionState> {
  constructor(props: SectionProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  public static getDerivedStateFromError(error: Error): SectionState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SectionErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 sm:p-6 bg-slate-800/80 border border-slate-700/60 rounded-2xl text-center space-y-2.5 my-3 shadow-sm">
          <p className="text-xs font-bold text-amber-400 flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{this.props.title || 'Instabilidade temporária nesta visualização'}</span>
          </p>
          <p className="text-[11px] text-slate-300 max-w-md mx-auto">
            {this.props.fallbackMessage || 'Seus dados permanecem intactos. Clique abaixo para tentar recarregar esta área.'}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recarregar Área</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
