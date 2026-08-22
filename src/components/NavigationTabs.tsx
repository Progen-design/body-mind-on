import React from 'react';
import {
  LayoutDashboard,
  User,
  Scale,
  Utensils,
  Dumbbell,
  Activity
} from 'lucide-react';
import { motion } from 'motion/react';

// 'naviky' odstraneno spolu se sekci Navyky & Streaky.
// 'nakup' odstraneno — nakupni seznam ted zije v zalozce jidelnicku, pod jidly,
// ze kterych vznika. Jako vlastni zalozka sedel hned pod kartou TED a vypadal
// jako doporuceni trenera.
export type ActiveTab = 'dnes' | 'profil' | 'vaha' | 'jidelnicek' | 'trenink' | 'regenerace';

interface NavigationTabsProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onSelectTab
}) => {
  const tabs: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
  }[] = [
    { id: 'dnes', label: 'Přehled', icon: LayoutDashboard },
    { id: 'profil', label: 'Můj Profil', icon: User },
    { id: 'vaha', label: 'Tělo & Váha', icon: Scale },
    { id: 'jidelnicek', label: 'Jídelníček & Makra', icon: Utensils },
    { id: 'trenink', label: 'Tréninkový plán', icon: Dumbbell },
    // Odznak u regenerace byl natvrdo '70'. Skóre regenerace často vůbec
    // nemáme (backend hlásí „nedostatek dat"), takže tu žádné číslo nesvítí.
    { id: 'regenerace', label: 'Apple Watch & Regenerace', icon: Activity }
  ];

  return (
    <nav className="relative z-20 mb-5 overflow-x-auto no-scrollbar scroll-smooth">
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#0c1017]/95 border border-slate-800/90 backdrop-blur-xl min-w-max shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`relative flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 select-none ${
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabPill"
                  className="absolute inset-0 bg-gradient-to-r from-cyan-950/90 to-emerald-950/90 border border-cyan-500/50 rounded-xl shadow-[0_0_15px_rgba(0,242,254,0.3)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-[#00f2fe]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-[#39ff14]/20 text-[#39ff14] border border-[#39ff14]/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
