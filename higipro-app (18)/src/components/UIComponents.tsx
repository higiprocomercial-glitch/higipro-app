/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertCircle, Info, ArrowLeft } from 'lucide-react';
import { 
  QuoteStatus, OSStatus, AppointmentStatus, TransactionStatus, TransactionType 
} from '../types';

// ==========================================
// STATUS BADGES
// ==========================================

interface StatusBadgeProps {
  type: 'quote' | 'os' | 'appointment' | 'transaction' | 'transaction_status';
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ type, status }) => {
  let label = status;
  let bgClass = 'bg-slate-100 text-slate-800 border-slate-200';

  if (type === 'quote') {
    switch (status as QuoteStatus) {
      case 'rascunho':
        label = 'Rascunho';
        bgClass = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
      case 'enviado':
        label = 'Enviado';
        bgClass = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'aprovado':
        label = 'Aprovado';
        bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'concluido':
        label = 'Concluído';
        bgClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
        break;
      case 'recusado':
        label = 'Recusado';
        bgClass = 'bg-red-50 text-red-700 border-red-200';
        break;
      case 'expirado':
        label = 'Expirado';
        bgClass = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
    }
  } else if (type === 'os') {
    switch (status as OSStatus) {
      case 'orcamento':
        label = 'Orçamento';
        bgClass = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
      case 'agendado':
        label = 'Agendado';
        bgClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        break;
      case 'em_execucao':
        label = 'Em Execução';
        bgClass = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
      case 'concluido':
        label = 'Concluído';
        bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'cancelado':
        label = 'Cancelado';
        bgClass = 'bg-red-50 text-red-700 border-red-200';
        break;
    }
  } else if (type === 'appointment') {
    switch (status as AppointmentStatus) {
      case 'agendado':
        label = 'Agendado';
        bgClass = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'confirmado':
        label = 'Confirmado';
        bgClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        break;
      case 'concluido':
        label = 'Concluído';
        bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'cancelado':
        label = 'Cancelado';
        bgClass = 'bg-red-50 text-red-700 border-red-200';
        break;
    }
  } else if (type === 'transaction') {
    switch (status as TransactionType) {
      case 'receita':
        label = 'Receita';
        bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'despesa':
        label = 'Despesa';
        bgClass = 'bg-red-50 text-red-700 border-red-200';
        break;
    }
  } else if (type === 'transaction_status') {
    switch (status as TransactionStatus) {
      case 'pago':
        label = 'Pago';
        bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'pendente':
        label = 'Pendente';
        bgClass = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
    }
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${bgClass}`}>
      {label}
    </span>
  );
};

// ==========================================
// EMPTY STATE
// ==========================================

interface EmptyStateProps {
  icon?: React.ReactNode | React.ElementType;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  icon, title, description, actionText, onAction 
}) => {
  const renderedIcon = typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in (icon as any))
    ? React.createElement(icon as any, { className: 'w-8 h-8' })
    : icon;

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 bg-white border border-slate-100 rounded-2xl shadow-xs">
      <div className="p-4 bg-slate-50 text-slate-400 rounded-full mb-4">
        {renderedIcon}
      </div>
      <h3 className="text-lg font-medium text-slate-800 font-display mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition duration-150 shadow-xs cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

// ==========================================
// MODAL
// ==========================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, onClose, onBack, title, children, size = 'md', footer 
}) => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
          />
          
          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 20 }}
            transition={{ type: 'spring', duration: 0.25 }}
            className={`relative w-full ${sizeClasses[size]} bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[92dvh]`}
          >
            {/* Header with Safe Area, Voltar and Fechar buttons */}
            <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] border-b border-slate-100 bg-slate-50/90 gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0 pr-1">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="h-8.5 sm:h-9 px-2.5 flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 rounded-xl transition text-xs font-bold border border-slate-200 shadow-2xs cursor-pointer shrink-0"
                    title="Voltar"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-blue-600" />
                    <span className="hidden xs:inline">Voltar</span>
                  </button>
                )}
                <h2 className="text-sm sm:text-base font-bold text-slate-800 font-display truncate">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8.5 sm:h-9 px-2.5 sm:px-3 flex items-center gap-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-xl transition cursor-pointer shrink-0 text-xs font-bold border border-slate-200/80 hover:border-rose-200 shadow-2xs active:scale-95"
                aria-label="Fechar janela"
                title="Fechar janela"
              >
                <X className="w-3.5 h-3.5 text-rose-500" />
                <span>Fechar</span>
              </button>
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-24 sm:pb-6 text-slate-600 custom-scrollbar overscroll-contain">
              {children}
            </div>
            
            {/* Footer */}
            {footer && (
              <div className="px-4 sm:px-6 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-end gap-2 sm:gap-3 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ==========================================
// CONFIRM DIALOG
// ==========================================

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, onClose, onConfirm, title, description, 
  confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = true
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-white text-sm font-medium rounded-xl transition shadow-xs cursor-pointer ${
              isDanger 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className={`p-3 rounded-full shrink-0 ${isDanger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </Modal>
  );
};
