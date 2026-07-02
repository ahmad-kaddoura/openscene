'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ModernSidebar } from './modern-sidebar';
import { ModernSubSidebar } from './modern-sub-sidebar';
import { ModernMainContent } from './modern-main-content';
import { useProjectStore } from '@/features/project/store';
import { useChatStore } from '@/features/chat';
import { useWorkflowStore } from '@/features/workflow';
import { SettingsView } from '@/features/settings/settings-view';
import { BrandKitView } from '@/features/brand-kit/brand-kit-view';
import { AssetLibraryView } from '@/features/assets/asset-library-view';
import { UsageView } from '@/features/usage/usage-view';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';

interface ModernDashboardProps {
  onToggleClassic: () => void;
}

export function ModernDashboard({ onToggleClassic }: ModernDashboardProps) {
  const [activeTab, setActiveTab] = useState('home');
  const [projectRailOpen, setProjectRailOpen] = useState(true);
  const { currentProjectId, loadProjects, getCurrentProject } = useProjectStore();
  const { loadMessages } = useChatStore();

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!currentProjectId) return;
    loadMessages(currentProjectId);
    const project = getCurrentProject();
    void useWorkflowStore
      .getState()
      .hydrateFromProject(currentProjectId, project?.storyboard?.scenes ?? []);
  }, [currentProjectId, getCurrentProject, loadMessages]);

  const renderContent = () => {
    if (activeTab === 'brand') return <FullWidthView><BrandKitView /></FullWidthView>;
    if (activeTab === 'projects' || activeTab === 'apps') return <FullWidthView><AssetLibraryView /></FullWidthView>;
    if (activeTab === 'avatar') return <FullWidthView><UsageView /></FullWidthView>;
    if (activeTab === 'settings') return <FullWidthView><SettingsView /></FullWidthView>;
    return null;
  };

  const renderHome = () => (
    <ResizablePanelGroup direction="horizontal" className="min-w-0 flex-1">
      {projectRailOpen && (
        <>
          <ResizablePanel
            defaultSize={20}
            minSize={14}
            maxSize={32}
            className="min-w-[224px] max-w-[420px]"
          >
            <ModernSubSidebar onClose={() => setProjectRailOpen(false)} />
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-slate-200 hover:bg-cyan-300" />
        </>
      )}
      <ResizablePanel defaultSize={projectRailOpen ? 80 : 100} minSize={50}>
        <ModernMainContent
          projectRailOpen={projectRailOpen}
          onToggleProjectRail={() => setProjectRailOpen((value) => !value)}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex">
      <ModernSidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onToggleClassic={onToggleClassic} 
      />
      {activeTab === 'home' ? renderHome() : renderContent()}
    </div>
  );
}

function FullWidthView({ children }: { children: ReactNode }) {
  return (
    <main className="min-w-0 flex-1 overflow-hidden bg-slate-50">
      {children}
    </main>
  );
}
