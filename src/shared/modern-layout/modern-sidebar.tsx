'use client';

import { Clapperboard, Home, Palette, LayoutGrid, Folder, Undo2, Settings, Gauge } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ModernSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onToggleClassic: () => void;
}

export function ModernSidebar({ activeTab, onTabChange, onToggleClassic }: ModernSidebarProps) {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'avatar', icon: Gauge, label: 'Usage' },
    { id: 'brand', icon: Palette, label: 'Brand' },
    { id: 'apps', icon: LayoutGrid, label: 'Assets' },
    { id: 'projects', icon: Folder, label: 'Projects' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-16 h-full flex flex-col items-center py-4 bg-white border-r border-slate-200 shadow-sm z-20 shrink-0">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-500 flex items-center justify-center mb-8 shadow-sm">
        <Clapperboard className="w-5 h-5 text-white" />
      </div>

      {/* Main Nav */}
      <div className="flex flex-col gap-3 w-full px-2 flex-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Tooltip key={tab.id} delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onTabChange(tab.id)}
                  className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    isActive
                      ? 'bg-cyan-50 text-cyan-700 font-medium'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                  <span className="text-[10px]">{tab.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {tab.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col gap-2 w-full px-2 mt-auto">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleClassic}
              className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all"
            >
              <Undo2 className="w-5 h-5" />
              <span className="text-[10px]">Classic</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            Switch to Classic View
          </TooltipContent>
        </Tooltip>
        
        {/* User Profile placeholder */}
        <button className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 text-white font-semibold text-sm flex items-center justify-center mx-auto mt-2">
          A
        </button>
      </div>
    </div>
  );
}
