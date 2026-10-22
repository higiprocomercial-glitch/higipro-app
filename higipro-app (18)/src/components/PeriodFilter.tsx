/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Calendar, RotateCcw } from 'lucide-react';
import { monthName } from '../lib/utils';

export interface PeriodFilterProps {
  selectedMonth: number | 'all';
  selectedYear: number | 'all';
  onMonthChange: (month: number | 'all') => void;
  onYearChange: (year: number | 'all') => void;
  availableYears: number[];
  showAllMonthsOption?: boolean;
  showAllYearsOption?: boolean;
  allMonthsLabel?: string;
  allYearsLabel?: string;
  onResetToCurrent?: () => void;
  compact?: boolean;
  className?: string;
}

export const PeriodFilter: React.FC<PeriodFilterProps> = ({
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
  availableYears,
  showAllMonthsOption = true,
  showAllYearsOption = false,
  allMonthsLabel = 'Ano Completo (Todos os Meses)',
  allYearsLabel = 'Todos os Anos',
  onResetToCurrent,
  compact = false,
  className = '',
}) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const isCurrentMonthActive = selectedMonth === currentMonth && selectedYear === currentYear;

  const handleReset = () => {
    if (onResetToCurrent) {
      onResetToCurrent();
    } else {
      onMonthChange(currentMonth);
      onYearChange(currentYear);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Month Selector */}
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm shadow-2xs hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600 transition">
        <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <select
          value={selectedMonth}
          onChange={(e) => onMonthChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer text-xs sm:text-sm"
          title="Selecione o mês para acompanhamento"
        >
          {showAllMonthsOption && (
            <option value="all">{allMonthsLabel}</option>
          )}
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i}>
              {monthName(i)}
            </option>
          ))}
        </select>
      </div>

      {/* Year Selector */}
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm shadow-2xs hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600 transition">
        <select
          value={selectedYear}
          onChange={(e) => onYearChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer text-xs sm:text-sm"
          title="Selecione o ano para acompanhamento"
        >
          {showAllYearsOption && (
            <option value="all">{allYearsLabel}</option>
          )}
          {availableYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Quick button to return to Current Month & Year if not active */}
      {!isCurrentMonthActive && (
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
          title="Voltar para o Mês e Ano Atual"
        >
          <RotateCcw className="w-3 h-3 text-blue-600" />
          <span>Mês Atual</span>
        </button>
      )}
    </div>
  );
};
