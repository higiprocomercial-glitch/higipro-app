/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  LayoutDashboard, Users, BookOpen, FileText, Briefcase, 
  Calendar, DollarSign, RefreshCw, BarChart3, Menu, X, Sparkles,
  Database, FileSpreadsheet, Settings, ArrowLeft, Power, LogOut, Home, ShieldCheck,
  Calculator, Target, Moon, Sun, Maximize, Minimize, Smartphone, QrCode
} from 'lucide-react';
import { DatabaseState, Client, PageId } from './types';
import { parseDateComponents } from './lib/utils';
import { getDatabase, saveDatabase, clearDatabase, reconcileWithIndexedDB, mergeDatabases } from './lib/database';
import { autoStampDatabaseState } from './lib/versioning';
import { Modal } from './components/UIComponents';
import { Trash2 } from 'lucide-react';

// Import all modular page views directly for instant switching and rock-solid reliability
import { Dashboard } from './components/Dashboard';
import { Clientes } from './components/Clientes';
import { Catalogo } from './components/Catalogo';
import { Orcamentos } from './components/Orcamentos';
import { OrdensServico } from './components/OrdensServico';
import { Agendamentos } from './components/Agendamentos';
import { Financeiro } from './components/Financeiro';
import { Recorrencia } from './components/Recorrencia';
import { Metricas } from './components/Metricas';
import { Relatorios } from './components/Relatorios';
import { Configuracoes } from './components/Configuracoes';
import { CalculadoraOrcamento } from './components/CalculadoraOrcamento';
import { MetasInteligentes } from './components/MetasInteligentes';

import { LogoHigiPro } from './components/HigiProLogo';
import { ClientDetailDrawer } from './components/ClientDetailDrawer';
import { BackupModal } from './components/BackupModal';
import { CloudSyncStatus } from './components/CloudSyncStatus';
import { LinkCelularModal } from './components/LinkCelularModal';
import { SectionErrorBoundary } from './components/ErrorBoundary';
import { subscribeToCloudChanges, testFirestoreConnection, fetchFullDatabaseFromCloud } from './lib/firebaseSync';

export default function App() {
  // Load State
  const [db, setDb] = useState<DatabaseState>(() => getDatabase());
  const [dataRestoredNotice, setDataRestoredNotice] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<PageId>('dashboard');

  // Tema Oficial da Empresa: Preto, Azul, Dourado e Branco (Padrão: Escuro)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('higipro_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    return 'dark';
  });

  useEffect(() => {
    try {
      localStorage.setItem('higipro_theme', theme);
    } catch (e) {}
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark', 'theme-dark');
      root.classList.remove('theme-light');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark', 'theme-dark');
      root.classList.add('theme-light');
      root.setAttribute('data-theme', 'light');
    }
  }, [theme]);

  // Automatic reconciliation on app launch: checks IndexedDB for richer data from prior sessions
  useEffect(() => {
    reconcileWithIndexedDB(db, (recovered, source) => {
      setDb(recovered);
      setDataRestoredNotice(`Dados restaurados com sucesso do armazenamento seguro (${source}).`);
      setTimeout(() => setDataRestoredNotice(null), 6000);
    });
  }, []);

  // Real-time synchronization across devices (PC <-> Mobile)
  const dbRef = React.useRef(db);
  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    let isMounted = true;
    testFirestoreConnection();

    // 1. Blazing-fast initial parallel cloud pull to guarantee phone/new tab immediately gets latest PC data
    fetchFullDatabaseFromCloud(dbRef.current).then(cloudDb => {
      if (!isMounted || !cloudDb) return;
      setDb(prev => {
        const { merged, changesCount } = mergeDatabases(prev, cloudDb);
        dbRef.current = merged;
        saveDatabase(merged, false, true);
        if (changesCount > 0) {
          setDataRestoredNotice(`Sincronizado com a nuvem (${changesCount} registros atualizados).`);
          setTimeout(() => setDataRestoredNotice(null), 4000);
        }
        return merged;
      });
    }).catch(err => {
      console.warn('Initial cloud pull non-fatal error:', err);
    });

    // 2. Real-time stream listener for incoming changes from other devices (PC <-> Mobile)
    const unsubscribe = subscribeToCloudChanges((incomingPartial) => {
      if (!isMounted) return;
      setDb(prev => {
        const fullIncoming: DatabaseState = {
          ...prev,
          ...incomingPartial,
        };
        const { merged, changesCount } = mergeDatabases(prev, fullIncoming);
        if (changesCount > 0) {
          dbRef.current = merged;
          saveDatabase(merged, false, true);
          setDataRestoredNotice('Atualizado em tempo real com alterações da nuvem (PC/Celular).');
          setTimeout(() => setDataRestoredNotice(null), 4000);
          return merged;
        }
        return prev;
      });
    }, () => dbRef.current);

    // 3. Auto-sync on window focus / tab visibility (throttled check when returning to app)
    let lastVisibilityCheck = 0;
    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && isMounted && now - lastVisibilityCheck > 30000) {
        lastVisibilityCheck = now;
        console.log('[Cloud Sync] App em primeiro plano. Verificando estado mais recente da nuvem...');
        fetchFullDatabaseFromCloud(dbRef.current).then(cloudDb => {
          if (!isMounted || !cloudDb) return;
          setDb(prev => {
            const { merged, changesCount } = mergeDatabases(prev, cloudDb);
            if (changesCount > 0) {
              dbRef.current = merged;
              saveDatabase(merged, false, true);
              setDataRestoredNotice(`Sincronizado automaticamente (${changesCount} novos registros).`);
              setTimeout(() => setDataRestoredNotice(null), 4000);
            }
            return merged;
          });
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      isMounted = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);
  const [pageHistory, setPageHistory] = useState<PageId[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isAppClosed, setIsAppClosed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLinkCelularOpen, setIsLinkCelularOpen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      const doc = document as any;
      const docEl = document.documentElement as any;
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
    } catch (e) {
      console.warn('Fullscreen error:', e);
    }
  }, []);

  // Client detail drawer global state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isClientDrawerOpen, setIsClientDrawerOpen] = useState(false);
  const [selectedClientForQuote, setSelectedClientForQuote] = useState<string | null>(null);
  const [recorrenciaTab, setRecorrenciaTab] = useState<'followup' | 'pos_venda' | 'leads' | 'logs'>('followup');

  // Sync / Persist DB Updates
  const handleUpdateDb = useCallback((newState: DatabaseState) => {
    const stamped = autoStampDatabaseState(newState, dbRef.current);
    dbRef.current = stamped;
    setDb(stamped);
    saveDatabase(stamped, true, false);
  }, []);

  // Navigate to new page with history tracking for smooth mobile "Voltar"
  const navigateToPage = useCallback((newPage: PageId) => {
    setActivePage(currentPage => {
      if (currentPage !== newPage) {
        setPageHistory(prev => [...prev, currentPage]);
        try {
          window.history.pushState({ page: newPage }, '', '');
        } catch (e) {
          // ignore history errors in sandboxed iframes
        }
      }
      return newPage;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Stable callbacks for child components to prevent unnecessary re-renders
  const handleOpenClientDrawer = useCallback(() => {
    setIsClientDrawerOpen(true);
  }, []);

  const handleSelectContactForQuote = useCallback((client: Client) => {
    setSelectedClientForQuote(client.id);
    navigateToPage('orcamentos');
  }, [navigateToPage]);

  const handleClearInitialClient = useCallback(() => {
    setSelectedClientForQuote(null);
  }, []);

  const handleCloseOrcamentosTab = useCallback(() => {
    navigateToPage('dashboard');
  }, [navigateToPage]);

  const handleNavigateToConfig = useCallback(() => {
    navigateToPage('configuracoes');
  }, [navigateToPage]);

  const handleNavigateToQuoteFromRecorrencia = useCallback(() => {
    setSelectedClientForQuote(null);
    navigateToPage('orcamentos');
  }, [navigateToPage]);

  const handleNavigateToRecorrenciaTab = useCallback((tab: 'followup' | 'pos_venda' | 'leads' | 'logs') => {
    setRecorrenciaTab(tab);
    navigateToPage('recorrencia');
  }, [navigateToPage]);

  // Back button handler for mobile top bar and hardware back
  const handleGoBack = useCallback(() => {
    setPageHistory(prev => {
      if (prev.length > 0) {
        const lastPage = prev[prev.length - 1];
        setActivePage(lastPage);
        return prev.slice(0, -1);
      } else {
        setActivePage(curr => {
          if (curr !== 'dashboard') {
            return 'dashboard';
          }
          // If already on dashboard, prompt to exit app
          setIsExitModalOpen(true);
          return curr;
        });
        return prev;
      }
    });
  }, []);

  // Listen to browser / phone back gestures
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.page) {
        setActivePage(e.state.page);
      } else {
        handleGoBack();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleGoBack]);

  // Handle closing / exiting the app
  const handleExitApp = () => {
    setIsExitModalOpen(false);
    try {
      window.close();
    } catch (e) {
      // Browser blocked window.close
    }
    // Show the closed session screen
    setIsAppClosed(true);
  };

  const handleResetDatabase = () => {
    const emptyDb = clearDatabase();
    setDb(emptyDb);
    setIsResetModalOpen(false);
    navigateToPage('dashboard');
  };

  const todayDateOnly = new Date().toISOString().split('T')[0];
  const followUpAlertCount = useMemo(() => {
    const now = new Date();
    const currentMonthNum = now.getMonth();
    const currentYearNum = now.getFullYear();
    return db.quotes.filter(q => {
      if (q.status !== 'enviado' || q.arquivado) return false;
      const sentDateStr = q.enviado_em || q.created_at;
      if (!sentDateStr) return false;
      const { year, month } = parseDateComponents(sentDateStr);
      if (year !== currentYearNum || month !== currentMonthNum) return false;
      const sentDate = new Date(sentDateStr);
      const diffDays = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
      const sentDateOnly = (sentDateStr || '').split('T')[0];
      return diffDays >= 1 || (todayDateOnly > sentDateOnly);
    }).length;
  }, [db.quotes, todayDateOnly]);

  interface NavigationItem {
    id: PageId;
    label: string;
    icon: React.ComponentType<any>;
    badge?: number | string;
  }

  interface NavigationGroup {
    title: string;
    items: NavigationItem[];
  }

  // Sidebar Menu Definitions grouped by category (Sleek Theme pattern)
  const navigationGroups: NavigationGroup[] = [
    {
      title: 'Visão Geral',
      items: [
        { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
      ]
    },
    {
      title: 'Cadastros',
      items: [
        { id: 'clientes', label: 'Clientes (CRM)', icon: Users },
        { id: 'catalogo', label: 'Catálogo de Serviços', icon: BookOpen },
      ]
    },
    {
      title: 'Operações',
      items: [
        { id: 'orcamentos', label: 'Orçamentos', icon: FileText },
        { id: 'calculadora', label: 'Calculadora de Orçamento', icon: Calculator },
        { id: 'os', label: 'Ordens de Serviço', icon: Briefcase },
        { id: 'agenda', label: 'Agenda de Visitas', icon: Calendar },
        { 
          id: 'recorrencia', 
          label: 'Recorrência & Follow-up', 
          icon: RefreshCw,
          badge: followUpAlertCount > 0 ? followUpAlertCount : undefined
        },
      ]
    },
    {
      title: 'Gestão e Análise',
      items: [
        { id: 'metas', label: 'Metas Inteligentes', icon: Target },
        { id: 'financeiro', label: 'Controle Financeiro', icon: DollarSign },
        { id: 'metricas', label: 'Desempenho & Métricas', icon: BarChart3 },
        { id: 'relatorios', label: 'Relatórios Executivos', icon: FileSpreadsheet },
      ]
    },
    {
      title: 'Sistema',
      items: [
        { id: 'configuracoes', label: 'Configurações', icon: Settings },
      ]
    }
  ];

  const navigationItems: NavigationItem[] = navigationGroups.flatMap(g => g.items);

  const currentNav = navigationItems.find(item => item.id === activePage);

  // Renders correct modular screen based on activePage state
  const renderActiveScreen = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <Dashboard 
            db={db} 
            onUpdateDb={handleUpdateDb}
            setPage={navigateToPage} 
            setSelectedClient={setSelectedClient} 
            setClientDrawerOpen={setIsClientDrawerOpen} 
          />
        );
      case 'clientes':
        return (
          <Clientes 
            db={db} 
            onUpdateDb={handleUpdateDb} 
            onSelectClient={setSelectedClient}
            onOpenDrawer={handleOpenClientDrawer}
            onSelectContactForQuote={handleSelectContactForQuote}
          />
        );
      case 'catalogo':
        return <Catalogo db={db} onUpdateDb={handleUpdateDb} />;
      case 'orcamentos':
        return (
          <Orcamentos 
            db={db} 
            onUpdateDb={handleUpdateDb} 
            initialClientId={selectedClientForQuote}
            onClearInitialClient={handleClearInitialClient}
            onGoBack={handleGoBack}
            onCloseTab={handleCloseOrcamentosTab}
            onNavigateToCalculator={() => navigateToPage('calculadora')}
          />
        );
      case 'calculadora':
        return (
          <CalculadoraOrcamento 
            db={db} 
            onUpdateDb={handleUpdateDb} 
            setPage={navigateToPage} 
          />
        );
      case 'os':
        return <OrdensServico db={db} onUpdateDb={handleUpdateDb} />;
      case 'agenda':
      case 'agendamentos':
        return <Agendamentos db={db} onUpdateDb={handleUpdateDb} />;
      case 'financeiro':
        return <Financeiro db={db} onUpdateDb={handleUpdateDb} />;
      case 'metas':
        return (
          <MetasInteligentes 
            db={db} 
            onUpdateDb={handleUpdateDb} 
            setPage={navigateToPage} 
          />
        );
      case 'recorrencia':
        return (
          <Recorrencia 
            db={db} 
            onUpdateDb={handleUpdateDb}
            initialTab={recorrenciaTab}
            onNavigateToConfig={handleNavigateToConfig}
            onNavigateToQuote={handleNavigateToQuoteFromRecorrencia}
          />
        );
      case 'metricas':
        return <Metricas db={db} onUpdateDb={handleUpdateDb} setPage={navigateToPage} />;
      case 'relatorios':
        return <Relatorios db={db} />;
      case 'configuracoes':
        return (
          <Configuracoes 
            db={db} 
            onUpdateDb={handleUpdateDb} 
            onResetSystem={handleResetDatabase}
            theme={theme}
            onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            onSetTheme={(t) => setTheme(t)}
            onOpenLinkCelular={() => setIsLinkCelularOpen(true)}
          />
        );
      default:
        return (
          <Dashboard 
            db={db} 
            setPage={navigateToPage} 
            setSelectedClient={setSelectedClient} 
            setClientDrawerOpen={setIsClientDrawerOpen} 
            onNavigateToRecorrenciaTab={handleNavigateToRecorrenciaTab}
          />
        );
    }
  };

  if (isAppClosed) {
    return (
      <div className="min-h-screen bg-[#071a33] text-white flex flex-col items-center justify-center p-4 sm:p-6 text-center select-none animate-fade-in">
        <div className="w-full max-w-sm bg-[#0b2447] border border-blue-900/60 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border-2 border-amber-400/30 flex items-center justify-center mb-4 text-amber-400 shadow-inner">
            <LogoHigiPro size="md" showText={false} theme="dark" className="w-10 h-12" />
          </div>
          <h2 className="text-xl font-bold font-display text-white">Aplicativo Encerrado</h2>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Sua sessão no HigiPro foi encerrada. Todas as alterações e cadastros continuam salvos com segurança no seu dispositivo.
          </p>
          <div className="mt-4 p-3 bg-[#071a33]/90 rounded-2xl border border-blue-900/40 w-full text-left flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-300 leading-snug">
              Você pode fechar esta aba no navegador ou retornar à tela inicial do seu celular.
            </p>
          </div>
          <button
            onClick={() => {
              setIsAppClosed(false);
              navigateToPage('dashboard');
            }}
            className="mt-6 w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold text-sm rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reabrir HigiPro</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-[100dvh] w-full flex flex-col lg:flex-row ${theme === 'dark' ? 'bg-[#030712] text-slate-100 theme-dark' : 'bg-slate-50 text-slate-900 theme-light'}`}>
      
      {/* ==========================================
          DESKTOP SIDEBAR
          ========================================== */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#071a33] text-slate-200 border-r border-[#0b2447] shrink-0 select-none">
        {/* Brand Banner */}
        <div className="h-20 px-5 border-b border-[#0b2447] flex items-center justify-between gap-2">
          <LogoHigiPro size="sm" showText={true} theme="dark" className="w-9 h-10" />
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
            v3.5 Final
          </span>
        </div>

        {/* Cloud Sync Quick Pill */}
        <div className="px-4 pt-3 pb-1">
          <CloudSyncStatus db={db} onUpdateDb={handleUpdateDb} />
        </div>

        {/* Navigation Items grouped by category */}
        <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
          {navigationGroups.map(group => (
            <div key={group.title} className="space-y-1.5">
              <p className="px-3 text-[10px] uppercase font-bold text-blue-200/50 tracking-wider">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigateToPage(item.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-xl transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-[#0b2447] text-white border-l-4 border-amber-400 font-semibold shadow-sm' 
                          : 'text-slate-300 hover:bg-[#0b2447]/60 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 shadow-2xs animate-pulse shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="pt-4 border-t border-[#0b2447] space-y-1.5">
            <button
              onClick={() => setIsBackupModalOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl text-amber-300 hover:bg-amber-400/10 transition-all cursor-pointer"
            >
              <Database className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Backup de Dados</span>
            </button>
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Zerar Sistema</span>
            </button>
          </div>
        </nav>

        {/* Footer info (Sleek Theme Avatar) */}
        <div className="p-4 border-t border-[#0b2447] bg-[#051326]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0b2447] border-2 border-amber-400/60 flex items-center justify-center text-xs font-black text-amber-300">
              AD
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold text-white truncate">Administrador</p>
              <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-tight">Plano Profissional</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ==========================================
          MOBILE DRAWER SIDEBAR
          ========================================== */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-[#071a33]/70 backdrop-blur-xs z-50 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        >
          <aside 
            className="w-72 sm:w-80 max-w-[85vw] bg-[#071a33] text-slate-200 h-full flex flex-col shadow-2xl border-r border-[#0b2447] animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Brand Header */}
            <div className="h-18 px-5 border-b border-[#0b2447] flex items-center justify-between pt-safe">
              <div className="flex items-center gap-2">
                <LogoHigiPro size="sm" showText={true} theme="dark" className="w-9 h-10" />
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  v3.5 Final
                </span>
              </div>
              <button 
                onClick={() => setIsMobileSidebarOpen(false)}
                className="min-w-[42px] min-h-[42px] flex items-center justify-center hover:bg-[#0b2447] rounded-xl text-slate-300 active:text-white cursor-pointer"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cloud Sync Quick Pill */}
            <div className="px-4 pt-3 pb-1">
              <CloudSyncStatus db={db} onUpdateDb={handleUpdateDb} />
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-4 py-5 space-y-5 overflow-y-auto custom-scrollbar">
              {/* Quick Mobile Actions: Voltar ao Início & Fechar & Tela Cheia */}
              <div className="space-y-2 pb-2 border-b border-[#0b2447]">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigateToPage('dashboard');
                      setIsMobileSidebarOpen(false);
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-[#0b2447] hover:bg-[#103362] active:bg-blue-600 text-white rounded-xl text-xs font-semibold border border-blue-900/50 cursor-pointer"
                  >
                    <Home className="w-3.5 h-3.5 text-amber-400" />
                    <span>Ir ao Início</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileSidebarOpen(false);
                      setIsExitModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl text-xs font-bold border border-rose-500/30 cursor-pointer"
                  >
                    <Power className="w-3.5 h-3.5 text-rose-400" />
                    <span>Fechar App</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    toggleFullscreen();
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    isFullscreen
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                      : 'bg-gradient-to-r from-blue-900/60 to-[#0b2447] text-white border-blue-700/50 hover:bg-blue-800/60'
                  }`}
                >
                  {isFullscreen ? <Minimize className="w-4 h-4 text-amber-400" /> : <Maximize className="w-4 h-4 text-amber-400" />}
                  <span>{isFullscreen ? 'Sair do Modo Tela Cheia' : '📱 Ativar Tela Cheia no Celular'}</span>
                </button>
              </div>

              {navigationGroups.map(group => (
                <div key={group.title} className="space-y-1.5">
                  <p className="px-3 text-[10px] uppercase font-bold text-blue-200/50 tracking-wider">
                    {group.title}
                  </p>
                  <div className="space-y-1">
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const isActive = activePage === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            navigateToPage(item.id);
                            setIsMobileSidebarOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-xl transition-all cursor-pointer ${
                            isActive 
                              ? 'bg-[#0b2447] text-white border-l-4 border-amber-400 font-semibold shadow-sm' 
                              : 'text-slate-300 hover:bg-[#0b2447]/60 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge !== undefined && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 shadow-2xs animate-pulse shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="pt-4 border-t border-[#0b2447] space-y-1.5">
                <button
                  onClick={() => {
                    setIsBackupModalOpen(true);
                    setIsMobileSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl text-amber-300 hover:bg-amber-400/10 transition-all cursor-pointer"
                >
                  <Database className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Backup de Dados</span>
                </button>
                <button
                  onClick={() => {
                    setIsResetModalOpen(true);
                    setIsMobileSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Zerar Sistema</span>
                </button>
              </div>
            </nav>

            {/* Mobile Footer with avatar */}
            <div className="p-4 pb-safe border-t border-[#0b2447] bg-[#051326]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0b2447] border-2 border-amber-400/60 flex items-center justify-center text-xs font-black text-amber-300">
                  AD
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-bold text-white truncate">Administrador</p>
                  <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-tight">Plano Profissional</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ==========================================
          MAIN AREA SHELL
          ========================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Mobile Header Bar - 100% Sólido Opaque, Otimizado com Safe Area e Tela Cheia para iPhone/Android */}
        <header className="lg:hidden bg-[#071a33] text-white border-b border-[#0b2447] sticky top-0 z-40 select-none shadow-md">
          {/* Espaçador seguro para o notch / Dynamic Island / Barra de status (08:12 / 5G) */}
          <div className="ios-safe-top w-full" />

          {/* Barra de navegação com altura nítida e responsiva */}
          <div className="h-13 sm:h-14 px-2 sm:px-3 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Menu Drawer Toggle */}
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="w-8.5 h-8.5 flex items-center justify-center bg-[#0b2447] hover:bg-[#103362] active:bg-blue-600 rounded-xl border border-blue-900/60 text-slate-200 cursor-pointer shadow-xs shrink-0"
                aria-label="Abrir menu"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Brand Logo & Name with Version */}
              <button
                type="button"
                onClick={() => navigateToPage('dashboard')}
                className="flex items-center gap-1.5 ml-0.5 text-left cursor-pointer shrink-0"
              >
                <LogoHigiPro size="sm" showText={false} theme="dark" className="w-5.5 h-6.5 shrink-0" />
                <div className="hidden xs:block">
                  <span className="font-black text-white text-xs tracking-tight font-display block leading-none">HigiPro</span>
                  <span className="text-[8.5px] text-emerald-400 font-bold leading-none">v3.5</span>
                </div>
              </button>
            </div>

            {/* Ações Rápidas: Tela Cheia, Tema, Sincronização e Sair */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Botão Tela Cheia no Celular (Garante visão completa de todos os botões) */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className={`h-8 sm:h-8.5 px-2 flex items-center gap-1 rounded-xl border text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 shrink-0 ${
                  isFullscreen 
                    ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow-amber-400/20' 
                    : 'bg-[#0b2447] hover:bg-[#103362] active:bg-blue-600 text-amber-300 border-amber-400/40'
                }`}
                title={isFullscreen ? 'Sair da Tela Cheia' : 'Modo Tela Cheia (Exibir toda a tela do app no celular)'}
                aria-label="Alternar tela cheia"
              >
                {isFullscreen ? (
                  <Minimize className="w-3.5 h-3.5 text-slate-950" />
                ) : (
                  <Maximize className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span className="text-[10px] hidden xs:inline">{isFullscreen ? 'Janela' : 'Tela Cheia'}</span>
              </button>

              {/* Cloud Sync Status */}
              <CloudSyncStatus compact={true} db={db} onUpdateDb={handleUpdateDb} />

              {/* Botão Sair do App */}
              <button
                type="button"
                onClick={() => setIsExitModalOpen(true)}
                className="h-8 sm:h-8.5 px-2 sm:px-2.5 flex items-center gap-1 bg-rose-500/20 hover:bg-rose-500/30 active:bg-rose-600 text-rose-300 active:text-white border border-rose-500/40 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 shrink-0"
                aria-label="Sair do aplicativo"
                title="Sair ou encerrar aplicativo"
              >
                <Power className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="text-[10.5px] font-bold">Sair</span>
              </button>
            </div>
          </div>
        </header>

        {/* Desktop Top Header Bar with Live Sync, Theme Toggle & Version */}
        <header className={`hidden lg:flex items-center justify-between px-8 py-3.5 border-b select-none transition-colors ${
          theme === 'dark' 
            ? 'bg-[#071a33] border-[#0b2447] text-white' 
            : 'bg-white border-slate-200/80 text-slate-800 shadow-2xs'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-extrabold font-display">
              HigiPro Gestão de Estofados
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-2xs">
              Versão 3.5 (Fase Final)
            </span>
            <span className="text-xs opacity-40">|</span>
            <span className="text-xs opacity-75 font-medium">
              Sincronização em Tempo Real (PC & Celular)
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <CloudSyncStatus db={db} onUpdateDb={handleUpdateDb} />
          </div>
        </header>

        {/* Content Body - Espaçamento e rolagem fluida para celular e desktop */}
        <main className="flex-1 p-2.5 sm:p-4 md:p-6 lg:p-8 pb-36 sm:pb-32 lg:pb-8 overflow-y-auto max-w-7xl w-full mx-auto animate-fade-in custom-scrollbar">
          {dataRestoredNotice && (
            <div className="mb-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-semibold shadow-2xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{dataRestoredNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setDataRestoredNotice(null)}
                className="text-emerald-400 hover:text-emerald-200 p-1 rounded-md transition cursor-pointer"
                title="Dispensar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activePage !== 'dashboard' && (
            <div className={`mb-3 flex items-center justify-between gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border shadow-2xs ${
              theme === 'dark'
                ? 'bg-[#071a33] border-[#0b2447] text-white'
                : 'bg-white border-slate-200/90 text-slate-800'
            }`}>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="h-8 sm:h-8.5 px-2.5 sm:px-3 flex items-center gap-1 sm:gap-1.5 bg-[#0b2447] hover:bg-[#103362] active:bg-blue-600 text-white rounded-lg sm:rounded-xl text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 shrink-0 border border-blue-900/50"
                  title="Voltar para a tela anterior"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Voltar</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateToPage('dashboard')}
                  className={`h-8 sm:h-8.5 px-2.5 sm:px-3 flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl text-xs font-bold border transition cursor-pointer active:scale-95 shrink-0 ${
                    theme === 'dark'
                      ? 'bg-[#0b2447]/60 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border-blue-900/40 hover:border-rose-800/50'
                      : 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border-slate-200 hover:border-rose-200'
                  }`}
                  title="Fechar esta aba e retornar ao Painel Geral"
                >
                  <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>Fechar Aba</span>
                </button>
              </div>

              {currentNav && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] opacity-50 hidden sm:inline">Aba:</span>
                  <span className={`text-[11px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl border flex items-center gap-1 sm:gap-1.5 truncate ${
                    theme === 'dark'
                      ? 'text-amber-300 bg-[#0b2447] border-blue-900/60'
                      : 'text-slate-800 bg-slate-50 border-slate-200'
                  }`}>
                    <currentNav.icon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{currentNav.label}</span>
                  </span>
                </div>
              )}
            </div>
          )}
          <SectionErrorBoundary
            title="Instabilidade na visualização da tela"
            fallbackMessage="Ocorreu uma instabilidade pontual nesta visualização. Seus dados estão 100% salvos e seguros."
          >
            {renderActiveScreen()}
          </SectionErrorBoundary>
        </main>

        {/* Mobile Bottom Quick Navigation - Only Menu, Agenda, Orçamento and O.S. with clean visual and larger size */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#071a33] border-t border-[#0b2447] px-2 pt-2 pb-safe flex items-center justify-around shadow-2xl select-none">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition cursor-pointer min-w-[65px] min-h-[48px] text-slate-300 active:text-white hover:text-white active:scale-95"
          >
            <Menu className="w-5 h-5 text-amber-400" />
            <span className="text-[11px] mt-1 tracking-tight font-bold">Menu</span>
            {followUpAlertCount > 0 && (
              <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#071a33] animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => navigateToPage('agendamentos')}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition cursor-pointer min-w-[65px] min-h-[48px] active:scale-95 ${
              activePage === 'agendamentos' 
                ? 'text-amber-400 font-extrabold bg-[#0b2447]' 
                : 'text-slate-300 active:text-white hover:text-white'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight font-bold">Agenda</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToPage('orcamentos')}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition cursor-pointer min-w-[65px] min-h-[48px] active:scale-95 ${
              activePage === 'orcamentos' 
                ? 'text-amber-400 font-extrabold bg-[#0b2447]' 
                : 'text-slate-300 active:text-white hover:text-white'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight font-bold">Orçamento</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToPage('os')}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition cursor-pointer min-w-[65px] min-h-[48px] active:scale-95 ${
              activePage === 'os' 
                ? 'text-amber-400 font-extrabold bg-[#0b2447]' 
                : 'text-slate-300 active:text-white hover:text-white'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight font-bold">O.S.</span>
          </button>
        </nav>
      </div>

      {/* Global Client History Drawer */}
      <ClientDetailDrawer 
        isOpen={isClientDrawerOpen} 
        onClose={() => setIsClientDrawerOpen(false)} 
        client={selectedClient} 
        db={db} 
        onUpdateDb={handleUpdateDb}
        onClientUpdated={(updatedClient) => setSelectedClient(updatedClient)}
        onNewQuote={(client) => {
          setSelectedClientForQuote(client.id);
          setIsClientDrawerOpen(false);
          navigateToPage('orcamentos');
        }}
      />

      {/* Modal: Confirm System Factory Reset */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Zerar Sistema HigiPro"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-sm">
            <p className="font-extrabold flex items-center gap-2 mb-1.5 text-rose-950">
              <Trash2 className="w-5 h-5 text-rose-600 animate-pulse" />
              Ação Crítica e Irreversível!
            </p>
            <p className="text-xs leading-relaxed text-slate-600">
              Esta ação apagará permanentemente todos os registros do aplicativo no seu navegador, incluindo **Clientes (CRM), Orçamentos, Ordens de Serviço (OS), Agenda, Lançamentos Financeiros e Recorrências**.
            </p>
          </div>
          
          <p className="text-xs text-slate-500 leading-normal">
            O aplicativo voltará ao estado original limpo e pronto para você cadastrar seus dados reais de produção.
          </p>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3.5 mt-5">
            <button
              type="button"
              onClick={() => setIsResetModalOpen(false)}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleResetDatabase}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer"
            >
              Sim, Apagar Tudo
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Backup and Restore System */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        db={db}
        onRestore={handleUpdateDb}
      />

      {/* Modal: Link para o Celular / QR Code */}
      <LinkCelularModal
        isOpen={isLinkCelularOpen}
        onClose={() => setIsLinkCelularOpen(false)}
      />

      {/* Modal: Fechar / Encerrar o Aplicativo */}
      <Modal
        isOpen={isExitModalOpen}
        onClose={() => setIsExitModalOpen(false)}
        title="Encerrar Aplicativo"
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                Deseja fechar o HigiPro?
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Todas as alterações, orçamentos e cadastros estão gravados e salvos com segurança na memória local do seu aparelho.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleExitApp}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-sm font-bold rounded-xl transition shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <Power className="w-4 h-4" />
              <span>Sim, Fechar Aplicativo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsExitModalOpen(false);
                navigateToPage('dashboard');
              }}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Home className="w-4 h-4 text-slate-500" />
              <span>Ir para a Tela Inicial</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExitModalOpen(false)}
              className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-xl transition cursor-pointer"
            >
              Continuar Usando
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
