/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { 
  Client, Service, Quote, ServiceOrder, Transaction, Recurrence, 
  ClientOrigin, ServiceCategory, SofaType, OSStatus, QuoteStatus, AppointmentStatus
} from '../types';
import { formatPhone, stripCountryCode } from './utils';

export interface ImportResult {
  clientsCount: number;
  servicesCount: number;
  quotesCount: number;
  osCount: number;
  transactionsCount: number;
  recurrencesCount: number;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

// Standardize origins
const parseOrigin = (origin?: string): ClientOrigin => {
  if (!origin) return 'Outros';
  const val = origin.trim().toLowerCase();
  if (val.includes('google')) return 'Google';
  if (val.includes('instagram') || val.includes('insta') || val.includes('facebook') || val.includes('face') || val.includes('meta')) return 'Meta Ads';
  if (val.includes('indica') || val.includes('amigo')) return 'Indicação';
  if (val.includes('site') || val.includes('web')) return 'Site';
  return 'Outros';
};

// Standardize categories
const parseCategory = (cat?: string): ServiceCategory => {
  if (!cat) return 'Higienização';
  const val = cat.trim().toLowerCase();
  if (val.includes('tapete')) return 'Tapete';
  if (val.includes('impermeabiliza')) return 'Impermeabilização';
  if (val.includes('limpeza')) return 'Limpeza';
  if (val.includes('sanitiza')) return 'Sanitização';
  if (val.includes('outro')) return 'Outros';
  return 'Higienização';
};

// Standardize sofa types
const parseSofaType = (type?: string): SofaType => {
  if (!type) return 'Sofá';
  const val = type.trim().toLowerCase();
  if (val.includes('sofa') || val.includes('sofá')) return 'Sofá';
  if (val.includes('colchao') || val.includes('colchão')) return 'Colchão';
  if (val.includes('poltrona')) return 'Poltrona';
  if (val.includes('cadeira')) return 'Cadeira';
  if (val.includes('tapete')) return 'Tapete';
  if (val.includes('cortina')) return 'Cortina';
  if (val.includes('carro') || val.includes('auto') || val.includes('veiculo')) return 'Carro';
  return 'Outros';
};

const replacements: [RegExp, string][] = [
  [/Higienizao/g, 'Higienização'],
  [/Impermeabilizao/g, 'Impermeabilização'],
  [/Sanitizao/g, 'Sanitização'],
  [/Administrao/g, 'Administração'],
  [/Decorao/g, 'Decoração'],
  [/Reconstruo/g, 'Reconstrução'],
  [/Associao/g, 'Associação'],
  [/Preveno/g, 'Prevenção'],
  [/Manuteno/g, 'Manutenção'],
  [/Estofados So/g, 'Estofados São'],
  [/Estofado So/g, 'Estofado São'],
  [/So/g, 'São'],
  [/sof/g, 'sofá'],
  [/Sof/g, 'Sofá'],
  [/mdulos/g, 'módulos'],
  [/Mdulos/g, 'Módulos'],
  [/colcho/g, 'colchão'],
  [/Colcho/g, 'Colchão'],
  [/colches/g, 'colchões'],
  [/Colches/g, 'Colchões'],
  [/Vitria/g, 'Vitória'],
  [/vitria/g, 'vitória'],
  [/Antnio/g, 'Antônio'],
  [/antnio/g, 'antônio'],
  [/Jos/g, 'José'],
  [/jos/g, 'josé'],
  [/Brbara/g, 'Bárbara'],
  [/brbara/g, 'bárbara'],
  [/Amlia/g, 'Amélia'],
  [/amlia/g, 'amélia'],
  [/Jlia/g, 'Júlia'],
  [/jlia/g, 'júlia'],
  [/Andr/g, 'André'],
  [/andr/g, 'andré'],
  [/Andria/g, 'Andréia'],
  [/andria/g, 'andréia'],
  [/Valria/g, 'Valéria'],
  [/valria/g, 'valéria'],
  [/Letcia/g, 'Letícia'],
  [/letcia/g, 'letícia'],
  [/Clia/g, 'Célia'],
  [/clia/g, 'célia'],
  [/Clio/g, 'Célio'],
  [/clio/g, 'célio'],
  [/Csar/g, 'César'],
  [/csar/g, 'césar'],
  [/Glria/g, 'Glória'],
  [/glria/g, 'glória'],
  [/Lcia/g, 'Lúcia'],
  [/lcia/g, 'lúcia'],
  [/Mrcia/g, 'Márcia'],
  [/mrcia/g, 'márcia'],
  [/Mrcio/g, 'Márcio'],
  [/mrcio/g, 'márcio'],
  [/Mnica/g, 'Mônica'],
  [/mnica/g, 'mônica'],
  [/Ntaly/g, 'Nátaly'],
  [/ntaly/g, 'nátaly'],
  [/Nlida/g, 'Nélida'],
  [/nlida/g, 'nélida'],
  [/Ncolas/g, 'Nícolas'],
  [/ncolas/g, 'nícolas'],
  [/Tnia/g, 'Tânia'],
  [/tnia/g, 'tânia'],
  [/Tas/g, 'Taís'],
  [/tas/g, 'taís'],
  [/Tasa/g, 'Taísa'],
  [/tasa/g, 'taísa'],
  [/gatha/g, 'Ágatha'],
  [/ngela/g, 'Ângela'],
  [/dina/g, 'Édina'],
  [/lia/g, 'Élia'],
  [/rica/g, 'Érica'],
  [/rika/g, 'Érika'],
  [/velyn/g, 'Évelyn'],
  [/gor/g, 'Ígor'],
  [/Endereo/g, 'Endereço'],
  [/endereo/g, 'endereço'],
  [/Servio/g, 'Serviço'],
  [/servio/g, 'serviço'],
  [/Servios/g, 'Serviços'],
  [/servios/g, 'serviços'],
  [/pequ/g, 'pequeno'],
  [/Pati/g, 'Pati'],
  [/Plndi/g, 'Plondi'],
  [/Lo/g, 'Léo'],
  [/S/g, 'Sú'],
  [/Sndica/g, 'Síndica'],
  [/Sndico/g, 'Síndico'],
  [/Clnica/g, 'Clínica'],
  [/clnica/g, 'clínica'],
  [/Clvis/g, 'Clóvis'],
  [/clvis/g, 'clóvis'],
  [/Cssia/g, 'Cássia'],
  [/cssia/g, 'cássia'],
  [/Cssio/g, 'Cássio'],
  [/cssio/g, 'cássio'],
  [/Ctia/g, 'Cátia'],
  [/ctia/g, 'cátia'],
  [/Emanulli/g, 'Emanuelli'],
  [/Ediclia/g, 'Edicléia'],
  [/lvaro/g, 'Álvaro'],
  [/lvares/g, 'Álvares'],
  [/Cndido/g, 'Cândido'],
  [/Cndida/g, 'Cândida'],
  [/Olvio/g, 'Olívio'],
  [/Floro/g, 'Florão'],
  [/Bigis/g, 'Bigóis'],
  [/Gis/g, 'Góis'],
  [/Ucha/g, 'Uchéa'],
  [/Clia/g, 'Célia'],
  [/Csar/g, 'César'],
  [/Cdia/g, 'Cédia'],
  [/Cntia/g, 'Cíntia'],
  [/Dicica/g, 'Diécica'],
  [/Dbora/g, 'Débora'],
  [/Dby/g, 'Déby'],
  [/Ftima/g, 'Fátima'],
  [/Frnand/g, 'Fernand'],
  [/Glria/g, 'Glória'],
  [/Lusa/g, 'Luísa'],
  [/Lus/g, 'Luís'],
  [/Lcia/g, 'Lúcia'],
  [/mla/g, 'mola'],
  [/beb/g, 'bebê'],
  [/Beb/g, 'Bebê'],
  [/plstico/g, 'plástico'],
  [/Plstico/g, 'Plástico'],
  [/Auditrio/g, 'Auditório'],
  [/auditrio/g, 'auditório'],
  [/Gacho/g, 'Gaúcho'],
  [/gacho/g, 'gaúcho'],
  [/Formao/g, 'Formação'],
  [/Est/g, 'Sté'],
  [/Stfanie/g, 'Stéfanie'],
  [/Srgio/g, 'Sérgio'],
  [/srgio/g, 'sérgio'],
  [/Tas/g, 'Taís'],
  [/Tasa/g, 'Taísa'],
  [/Thaz/g, 'Thaís']
];

const sanitizeString = (str?: string): string => {
  if (!str) return '';
  let cleaned = str.trim();
  for (const [regex, replacement] of replacements) {
    cleaned = cleaned.replace(regex, replacement);
  }
  return cleaned;
};

const parseDateValue = (val: any): string | null => {
  if (!val) return null;
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      return val.toISOString().split('T')[0];
    }
  }
  const str = String(val).trim();
  if (!str) return null;

  // Try parsing DD/MM/YYYY
  const parts = str.split('/');
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    let y = parts[2];
    if (y.length === 2) y = '20' + y;
    if (y.length === 4 && !isNaN(Number(d)) && !isNaN(Number(m)) && !isNaN(Number(y))) {
      return `${y}-${m}-${d}`;
    }
  }

  // Try standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // Check if it's an Excel serial date number
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    try {
      const d = XLSX.SSF.parse_date_code(num);
      const year = d.y;
      const month = String(d.m).padStart(2, '0');
      const day = String(d.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (_) {}
  }

  // Fallback to JS native parser
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (_) {}

  return null;
};

const addMonthsToDateStr = (dateStr: string, months: number): string => {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    d.setMonth(d.getMonth() + months);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (_) {
    return dateStr;
  }
};

/**
 * Parses an Excel or CSV file and returns synchronized entities.
 */
export async function parseExcelFile(
  file: File, 
  onProgress: (percent: number) => void
): Promise<{
  clients: Client[];
  services: Service[];
  quotes: Quote[];
  os: ServiceOrder[];
  transactions: Transaction[];
  recurrences: Recurrence[];
  summary: ImportResult;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        onProgress(20);
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        onProgress(40);
        
        let clients: Client[] = [];
        let services: Service[] = [];
        let quotes: Quote[] = [];
        let os: ServiceOrder[] = [];
        let transactions: Transaction[] = [];
        let recurrences: Recurrence[] = [];

        // Track services for each client to establish recurrences later
        const clientServicesMap = new Map<string, {
          name: string;
          catalogId: string;
          category: ServiceCategory;
          estofadoType: SofaType;
          value: number;
          date: string;
        }[]>();
        
        // Let's inspect the sheets
        const sheetNames = workbook.SheetNames.map(n => n.toLowerCase().trim());
        
        const clientsIdx = sheetNames.findIndex(n => n.includes('client'));
        const servicesIdx = sheetNames.findIndex(n => n.includes('serviço') || n.includes('servic'));

        const nowStr = new Date().toISOString().split('T')[0];

        onProgress(60);

        // 1. DEDICATED TABS MODE
        if (clientsIdx >= 0) {
          const clientsSheet = workbook.Sheets[workbook.SheetNames[clientsIdx]];
          const clientsData = XLSX.utils.sheet_to_json<any>(clientsSheet);
          clientsData.forEach(row => {
            const id = row.id?.toString() || generateId();
            const rawNome = row.nome || row.Nome || row.cliente || row.Cliente || 'Sem Nome';
            const nome = sanitizeString(String(rawNome));
            const rawTel = String(row.telefone || row.Telefone || row.fone || row.celular || '').trim();
            clients.push({
              id,
              nome,
              telefone: formatPhone(stripCountryCode(rawTel)),
              email: row.email || row.Email || '',
              endereco: sanitizeString(row.endereco || row.Endereço || row.logradouro || ''),
              cidade: sanitizeString(row.cidade || row.Cidade || 'Passo Fundo'),
              estado: row.estado || row.Estado || 'RS',
              CEP: row.cep || row.CEP || '',
              observacoes: row.observacoes || row.Observações || '',
              tags: row.tags ? String(row.tags).split(',').map((t: string) => t.trim()) : [],
              origem: parseOrigin(row.origem || row.Origem),
              created_at: parseDateValue(row.created_at || row.data_cadastro) || nowStr,
            });
          });

          if (servicesIdx >= 0) {
            const servicesSheet = workbook.Sheets[workbook.SheetNames[servicesIdx]];
            const servicesData = XLSX.utils.sheet_to_json<any>(servicesSheet);
            servicesData.forEach(row => {
              const rawServiceName = row.nome || row.Nome || 'Serviço Sem Nome';
              const sName = sanitizeString(String(rawServiceName));
              services.push({
                id: row.id?.toString() || generateId(),
                nome: sName,
                descricao: row.descricao || row.Descrição || '',
                categoria: parseCategory(row.categoria || row.Categoria),
                tipo_estofado: parseSofaType(row.tipo_estofado || row.tipo_estofado_estofado || row.estofado),
                preco: parseFloat(row.preco || row.preço || row.valor || 0),
                custo: parseFloat(row.custo || 0),
                duracao: parseInt(row.duracao || row.duração || 60),
                ativo: row.ativo !== undefined ? (row.ativo === true || row.ativo === 'sim' || row.ativo === 1) : true,
              });
            });
          }
        }

        // 2. MASTER SHEET/LEDGER MODE (SINGLE TAB OR CSV)
        if (clients.length === 0) {
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          // Get raw rows as array of arrays to preserve column ordering and handle duplicates
          const rows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });

          // Detect multi-service-column layout
          const isMultiServiceSpreadsheet = rows.length > 0 && rows[0] && rows[0].length >= 7 && (
            rows[0].some((cell: any) => String(cell).toLowerCase().includes('serviço') || String(cell).toLowerCase().includes('servico'))
          );

          if (isMultiServiceSpreadsheet) {
            // MULTI-SERVICE COLUMNS FORMAT
            rows.forEach((cols: any[], rIdx: number) => {
              if (rIdx === 0) return; // skip header
              if (!cols || cols.length < 1) return;

              const rawNome = cols[0];
              const nome = sanitizeString(String(rawNome || ''));
              if (!nome || nome === 'Nome' || nome === 'Cliente' || nome.toLowerCase() === 'nome') return;

              const rawTelefone = cols[1];
              const telefone = formatPhone(stripCountryCode(String(rawTelefone || '')));
              const rawEndereco = cols[2];
              const endereco = sanitizeString(String(rawEndereco || ''));
              const rawCidade = cols[3];
              const cidade = sanitizeString(String(rawCidade || '')) || 'Passo Fundo';

              let client = clients.find(c => c.nome.toLowerCase() === nome.toLowerCase());
              if (!client) {
                client = {
                  id: generateId(),
                  nome,
                  telefone,
                  email: '',
                  endereco: (endereco === ',' || endereco === ', ') ? '' : endereco,
                  cidade,
                  estado: 'RS',
                  CEP: '',
                  observacoes: '',
                  tags: [],
                  origem: 'Google',
                  created_at: '2024-01-01'
                };
                clients.push(client);
              }

              const clientServicesList: any[] = [];

              // Loop up to 8 services
              for (let sIdx = 0; sIdx < 8; sIdx++) {
                const baseCol = 4 + sIdx * 3;
                if (baseCol >= cols.length) break;

                const rawServiceName = cols[baseCol];
                const sName = sanitizeString(String(rawServiceName || ''));
                if (!sName) continue;

                const rawServiceValue = cols[baseCol + 1];
                let value = 0;
                if (rawServiceValue !== undefined && rawServiceValue !== null) {
                  if (typeof rawServiceValue === 'number') {
                    value = rawServiceValue;
                  } else {
                    const cleanedVal = String(rawServiceValue).replace(/[R$\s\.]/g, '').replace(',', '.');
                    value = parseFloat(cleanedVal) || 0;
                  }
                }

                const rawServiceDate = cols[baseCol + 2];
                const dateStr = parseDateValue(rawServiceDate);

                const category = parseCategory(sName);
                const estofadoType = parseSofaType(sName);

                let serviceInCatalog = services.find(s => s.nome.toLowerCase() === sName.toLowerCase());
                if (!serviceInCatalog) {
                  serviceInCatalog = {
                    id: generateId(),
                    nome: sName,
                    descricao: `Serviço especializado de ${category.toLowerCase()} para ${estofadoType.toLowerCase()}.`,
                    categoria: category,
                    tipo_estofado: estofadoType,
                    preco: value || 250,
                    custo: (value || 250) * 0.15,
                    duracao: category === 'Impermeabilização' ? 90 : 120,
                    ativo: true
                  };
                  services.push(serviceInCatalog);
                }

                clientServicesList.push({
                  name: sName,
                  catalogId: serviceInCatalog.id,
                  category,
                  estofadoType,
                  value,
                  date: dateStr
                });
              }

              // Create OS and Transactions for services with dates
              let earliestDate: string | null = null;
              clientServicesList.forEach(s => {
                if (s.date) {
                  if (!earliestDate || s.date < earliestDate) {
                    earliestDate = s.date;
                  }

                  const osId = generateId();
                  const osNum = `OS-${s.date.split('-')[0] || '2026'}-${String(os.length + 1).padStart(4, '0')}`;

                  os.push({
                    id: osId,
                    numero: osNum,
                    client_id: client!.id,
                    client_name: client!.nome,
                    client_phone: client!.telefone,
                    status: 'concluido',
                    total: s.value,
                    pago: s.value,
                    data_agendada: `${s.date}T09:00`,
                    data_conclusao: s.date,
                    tecnico: 'Equipe Higipro 01',
                    endereco: client!.endereco || 'Atendimento em domicílio',
                    observacoes: 'Importado da planilha de histórico.',
                    created_at: s.date
                  });

                  transactions.push({
                    id: generateId(),
                    tipo: 'receita',
                    categoria: s.category,
                    descricao: `${s.name} - ${client!.nome}`,
                    valor: s.value,
                    data: s.date,
                    metodo_pagamento: 'Pix',
                    status: 'pago',
                    os_id: osId,
                    created_at: s.date
                  });
                }
              });

              if (earliestDate) {
                client.created_at = earliestDate;
              }

              if (clientServicesList.length > 0) {
                clientServicesMap.set(client.id, clientServicesList);
              }
            });
          } else {
            // STANDARD FLAT ROWS FORMAT
            const headers = (rows[0] || []).map((h: any) => String(h).trim().toLowerCase());
            const clientColIdx = headers.findIndex((h: string) => h.includes('client') || h.includes('nome'));
            const phoneColIdx = headers.findIndex((h: string) => h.includes('tel') || h.includes('fone') || h.includes('cel') || h.includes('contat'));
            const addressColIdx = headers.findIndex((h: string) => h.includes('end') || h.includes('logr'));
            const cityColIdx = headers.findIndex((h: string) => h.includes('cid'));
            const serviceColIdx = headers.findIndex((h: string) => h.includes('servi') || h.includes('servic'));
            const priceColIdx = headers.findIndex((h: string) => h.includes('pre') || h.includes('val') || h.includes('cust'));
            const dateColIdx = headers.findIndex((h: string) => h.includes('dat') || h.includes('dia') || h.includes('agend'));
            const statusColIdx = headers.findIndex((h: string) => h.includes('stat'));

            rows.forEach((cols: any[], rIdx: number) => {
              if (rIdx === 0) return;
              if (!cols || cols.length < 1) return;

              const clientNameCell = clientColIdx >= 0 ? cols[clientColIdx] : null;
              const clientName = sanitizeString(String(clientNameCell || ''));
              if (!clientName || clientName === 'Nome' || clientName === 'Cliente' || clientName.toLowerCase() === 'nome') return;

              const rawTelefone = phoneColIdx >= 0 ? cols[phoneColIdx] : '';
              const telefone = formatPhone(stripCountryCode(String(rawTelefone || '')));
              const rawEndereco = addressColIdx >= 0 ? cols[addressColIdx] : '';
              const endereco = sanitizeString(String(rawEndereco || ''));
              const rawCidade = cityColIdx >= 0 ? cols[cityColIdx] : '';
              const cidade = sanitizeString(String(rawCidade || '')) || 'Passo Fundo';

              let client = clients.find(c => c.nome.toLowerCase() === clientName.toLowerCase());
              if (!client) {
                client = {
                  id: generateId(),
                  nome: clientName,
                  telefone,
                  email: '',
                  endereco: (endereco === ',' || endereco === ', ') ? '' : endereco,
                  cidade,
                  estado: 'RS',
                  CEP: '',
                  observacoes: '',
                  tags: [],
                  origem: 'Google',
                  created_at: nowStr
                };
                clients.push(client);
              }

              const serviceNameCell = serviceColIdx >= 0 ? cols[serviceColIdx] : null;
              const sName = sanitizeString(String(serviceNameCell || ''));
              if (!sName) return;

              let value = 150;
              if (priceColIdx >= 0) {
                const rawPrice = cols[priceColIdx];
                if (rawPrice !== undefined && rawPrice !== null) {
                  if (typeof rawPrice === 'number') {
                    value = rawPrice;
                  } else {
                    const cleanedVal = String(rawPrice).replace(/[R$\s\.]/g, '').replace(',', '.');
                    value = parseFloat(cleanedVal) || 150;
                  }
                }
              }

              const dateCell = dateColIdx >= 0 ? cols[dateColIdx] : null;
              const dateStr = parseDateValue(dateCell);

              const category = parseCategory(sName);
              const estofadoType = parseSofaType(sName);

              let serviceInCatalog = services.find(s => s.nome.toLowerCase() === sName.toLowerCase());
              if (!serviceInCatalog) {
                serviceInCatalog = {
                  id: generateId(),
                  nome: sName,
                  descricao: `Serviço especializado de ${category.toLowerCase()} para ${estofadoType.toLowerCase()}.`,
                  categoria: category,
                  tipo_estofado: estofadoType,
                  preco: value || 250,
                  custo: (value || 250) * 0.15,
                  duracao: category === 'Impermeabilização' ? 90 : 120,
                  ativo: true
                };
                services.push(serviceInCatalog);
              }

              if (dateStr) {
                const rawStatus = statusColIdx >= 0 ? cols[statusColIdx] : '';
                const statusStr = String(rawStatus || '').toLowerCase();
                let osStatus: OSStatus = 'concluido';
                if (statusStr.includes('cancel')) {
                  osStatus = 'cancelado';
                } else if (statusStr.includes('agend') || statusStr.includes('pend')) {
                  osStatus = 'agendado';
                }

                // Add to client's organized historical service records
                if (!client.historico_servicos) {
                  client.historico_servicos = [];
                }
                client.historico_servicos.push({
                  id: generateId(),
                  data: dateStr,
                  nome_servico: sName,
                  tipo_estofado: estofadoType,
                  valor: value,
                  observacoes: `Importado de planilha (${osStatus})`,
                  status: osStatus === 'concluido' ? 'concluido' : 'pendente'
                });

                const osId = generateId();
                const osNum = `OS-${dateStr.split('-')[0] || '2026'}-${String(os.length + 1).padStart(4, '0')}`;

                os.push({
                  id: osId,
                  numero: osNum,
                  client_id: client.id,
                  client_name: client.nome,
                  client_phone: client.telefone,
                  status: osStatus,
                  total: value,
                  pago: osStatus === 'concluido' ? value : 0,
                  data_agendada: `${dateStr}T09:00`,
                  data_conclusao: osStatus === 'concluido' ? dateStr : undefined,
                  tecnico: 'Equipe Higipro 01',
                  endereco: client.endereco || 'Atendimento em domicílio',
                  observacoes: 'Importado de planilha.',
                  created_at: dateStr
                });

                // Note: user explicitly requested not to inject historical spreadsheet rows into transactions/metrics yet.
                // Metrics and Dashboard faturamento use the official 2022-2026 dataset.

                // Collect service details for recurrence grouping
                let clientServicesList = clientServicesMap.get(client.id);
                if (!clientServicesList) {
                  clientServicesList = [];
                  clientServicesMap.set(client.id, clientServicesList);
                }
                clientServicesList.push({
                  name: sName,
                  catalogId: serviceInCatalog.id,
                  category,
                  estofadoType,
                  value,
                  date: dateStr
                });
              }
            });
          }

          // Compute Recurrence schedules for both spreadsheet types:
          // Filter services with dates from January 1st, 2024 to today (2026-07-15) and schedule recurrence alerts
          clientServicesMap.forEach((servicesList, clientId) => {
            const client = clients.find(c => c.id === clientId);
            if (!client) return;

            const datedServices = servicesList.filter(s => s.date && s.date >= '2024-01-01' && s.date <= '2026-07-15');
            if (datedServices.length > 0) {
              const categoriesSeen = new Set<ServiceCategory>(datedServices.map(s => s.category));
              categoriesSeen.forEach(cat => {
                const catServices = datedServices.filter(s => s.category === cat);
                catServices.sort((a, b) => b.date.localeCompare(a.date));
                const latestService = catServices[0];

                const intervalMonths = cat === 'Impermeabilização' ? 12 : 6;
                const proximaData = addMonthsToDateStr(latestService.date, intervalMonths);

                recurrences.push({
                  id: generateId(),
                  client_id: client.id,
                  client_name: client.nome,
                  service_id: latestService.catalogId,
                  service_name: latestService.name,
                  frequencia: intervalMonths === 12 ? 'anual' : 'semestral',
                  intervalo: intervalMonths,
                  proxima_data: proximaData,
                  data_inicio: latestService.date,
                  ativo: true,
                  lembrete: 15,
                  observacoes: `Importado de histórico (${cat}). Próximo contato previsto para ${proximaData.split('-').reverse().join('/')}.`,
                  // Backward compatibility
                  servico_origem: cat,
                  ultimo_servico_at: latestService.date,
                  intervalo_meses: intervalMonths,
                  proxima_data_sugerida: proximaData
                });
              });
            }
          });
        }

        onProgress(90);

        if (services.length === 0) {
          services = [
            { id: generateId(), nome: 'Higienização de Sofá 3 Lugares', descricao: 'Higienização profunda com extração e sanitização', categoria: 'Higienização', tipo_estofado: 'Sofá', preco: 250, custo: 35, duracao: 120, ativo: true },
            { id: generateId(), nome: 'Impermeabilização de Sofá', descricao: 'Aplicação de protetor de tecidos contra líquidos', categoria: 'Impermeabilização', tipo_estofado: 'Sofá', preco: 350, custo: 80, duracao: 90, ativo: true },
            { id: generateId(), nome: 'Higienização de Colchão Casal', descricao: 'Combate a ácaros e mofos com extração a vácuo', categoria: 'Higienização', tipo_estofado: 'Colchão', preco: 200, custo: 25, duracao: 90, ativo: true },
          ];
        }

        onProgress(100);

        const summary: ImportResult = {
          clientsCount: clients.length,
          servicesCount: services.length,
          quotesCount: quotes.length,
          osCount: os.length,
          transactionsCount: transactions.length,
          recurrencesCount: recurrences.length,
        };

        resolve({
          clients,
          services,
          quotes,
          os,
          transactions,
          recurrences,
          summary
        });

      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
