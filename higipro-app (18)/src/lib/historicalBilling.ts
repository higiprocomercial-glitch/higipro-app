/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction } from '../types';

export interface MonthlyBillingRecord {
  year: number;
  month: string; // '01' - '12'
  monthName: string;
  valor: number;
  status: 'concluido' | 'em_andamento';
}

export const HISTORICAL_BILLING_RECORDS: MonthlyBillingRecord[] = [
  // 2022
  { year: 2022, month: '11', monthName: 'Novembro', valor: 175, status: 'concluido' },
  { year: 2022, month: '12', monthName: 'Dezembro', valor: 2880, status: 'concluido' },

  // 2023
  { year: 2023, month: '01', monthName: 'Janeiro', valor: 1375, status: 'concluido' },
  { year: 2023, month: '02', monthName: 'Fevereiro', valor: 2315, status: 'concluido' },
  { year: 2023, month: '03', monthName: 'Março', valor: 2880, status: 'concluido' },
  { year: 2023, month: '04', monthName: 'Abril', valor: 9647, status: 'concluido' },
  { year: 2023, month: '05', monthName: 'Maio', valor: 6623, status: 'concluido' },
  { year: 2023, month: '06', monthName: 'Junho', valor: 7830, status: 'concluido' },
  { year: 2023, month: '07', monthName: 'Julho', valor: 7106, status: 'concluido' },
  { year: 2023, month: '08', monthName: 'Agosto', valor: 8278, status: 'concluido' },
  { year: 2023, month: '09', monthName: 'Setembro', valor: 8614, status: 'concluido' },
  { year: 2023, month: '10', monthName: 'Outubro', valor: 8666, status: 'concluido' },
  { year: 2023, month: '11', monthName: 'Novembro', valor: 10202, status: 'concluido' },
  { year: 2023, month: '12', monthName: 'Dezembro', valor: 13499, status: 'concluido' },

  // 2024
  { year: 2024, month: '01', monthName: 'Janeiro', valor: 15789, status: 'concluido' },
  { year: 2024, month: '02', monthName: 'Fevereiro', valor: 8999, status: 'concluido' },
  { year: 2024, month: '03', monthName: 'Março', valor: 13957, status: 'concluido' },
  { year: 2024, month: '04', monthName: 'Abril', valor: 18427, status: 'concluido' },
  { year: 2024, month: '05', monthName: 'Maio', valor: 11339, status: 'concluido' },
  { year: 2024, month: '06', monthName: 'Junho', valor: 7344, status: 'concluido' },
  { year: 2024, month: '07', monthName: 'Julho', valor: 8976, status: 'concluido' },
  { year: 2024, month: '08', monthName: 'Agosto', valor: 12754, status: 'concluido' },
  { year: 2024, month: '09', monthName: 'Setembro', valor: 10030, status: 'concluido' },
  { year: 2024, month: '10', monthName: 'Outubro', valor: 12267, status: 'concluido' },
  { year: 2024, month: '11', monthName: 'Novembro', valor: 17529, status: 'concluido' },
  { year: 2024, month: '12', monthName: 'Dezembro', valor: 14937, status: 'concluido' },

  // 2025
  { year: 2025, month: '01', monthName: 'Janeiro', valor: 12116, status: 'concluido' },
  { year: 2025, month: '02', monthName: 'Fevereiro', valor: 7630, status: 'concluido' },
  { year: 2025, month: '03', monthName: 'Março', valor: 11196, status: 'concluido' },
  { year: 2025, month: '04', monthName: 'Abril', valor: 8353, status: 'concluido' },
  { year: 2025, month: '05', monthName: 'Maio', valor: 8687, status: 'concluido' },
  { year: 2025, month: '06', monthName: 'Junho', valor: 6128, status: 'concluido' },
  { year: 2025, month: '07', monthName: 'Julho', valor: 3447, status: 'concluido' },
  { year: 2025, month: '08', monthName: 'Agosto', valor: 11818, status: 'concluido' },
  { year: 2025, month: '09', monthName: 'Setembro', valor: 12107, status: 'concluido' },
  { year: 2025, month: '10', monthName: 'Outubro', valor: 14296, status: 'concluido' },
  { year: 2025, month: '11', monthName: 'Novembro', valor: 17529, status: 'concluido' },
  { year: 2025, month: '12', monthName: 'Dezembro', valor: 14937, status: 'concluido' },

  // 2026
  { year: 2026, month: '01', monthName: 'Janeiro', valor: 20859, status: 'concluido' },
  { year: 2026, month: '02', monthName: 'Fevereiro', valor: 18232, status: 'concluido' },
  { year: 2026, month: '03', monthName: 'Março', valor: 22483, status: 'concluido' },
  { year: 2026, month: '04', monthName: 'Abril', valor: 23379, status: 'concluido' },
  { year: 2026, month: '05', monthName: 'Maio', valor: 14468, status: 'concluido' },
  { year: 2026, month: '06', monthName: 'Junho', valor: 11056, status: 'concluido' },
  { year: 2026, month: '07', monthName: 'Julho', valor: 15472, status: 'concluido' },
  { year: 2026, month: '08', monthName: 'Agosto', valor: 21313, status: 'concluido' },
  { year: 2026, month: '09', monthName: 'Setembro', valor: 13317, status: 'em_andamento' },
];

export const getHistoricalTransactions = (): Transaction[] => {
  return HISTORICAL_BILLING_RECORDS.map(r => ({
    id: `tx-faturamento-${r.year}-${r.month}`,
    tipo: 'receita' as const,
    categoria: 'Faturamento Oficial',
    descricao: `Faturamento Mensal ${r.monthName}/${r.year}${r.status === 'em_andamento' ? ' (Em andamento)' : ''}`,
    valor: r.valor,
    data: `${r.year}-${r.month}-28`,
    metodo_pagamento: 'Pix' as const,
    status: 'pago' as const,
    created_at: `${r.year}-${r.month}-01`,
  }));
};
