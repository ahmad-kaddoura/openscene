"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useProjectStore } from "@/features/project/store";
import { useChatStore, ChatView } from "@/features/chat";
import { useWorkflowStore, WorkflowView } from "@/features/workflow";
import { useSettingsStore } from "@/features/settings/store";
import { AppSidebar } from "@/shared/ui/app-sidebar";
import { PhaseStepper } from "@/shared/ui/phase-stepper";
import { WelcomeView } from "@/shared/ui/welcome-view";
import { TimelineView } from "@/features/timeline/timeline-view";
import { SettingsView } from "@/features/settings/settings-view";
import { BrandKitView } from "@/features/brand-kit/brand-kit-view";
import { AssetLibraryView } from "@/features/assets/asset-library-view";
import { UsageView } from "@/features/usage/usage-view";
import { ModernDashboard } from "@/shared/modern-layout/modern-dashboard";
import { Sparkles } from "lucide-react";
import type { ProjectPhase } from "@/core/types";

type AppView = "project" | "settings" | "brandkit" | "assets" | "usage";

function normalizePhase(phase: ProjectPhase): ProjectPhase {
  if (phase === "brief" || phase === "storyboard") return "chat";
  if (phase === "generation" || phase === "export") return "timeline";
  return phase;
}

function ClassicDashboard({ onToggleModern }: { onToggleModern: () => void }) {
  const { currentProjectId, loadProjects, getCurrentProject } =
    useProjectStore();
  const { loadMessages } = useChatStore();
  const currentProject = getCurrentProject();
  const [activeView, setActiveView] = useState<AppView>(() =>
    currentProjectId ? "project" : "project",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Load project data when switching projects
  useEffect(() => {
    if (currentProjectId) {
      loadMessages(currentProjectId);
      const project = getCurrentProject();
      void useWorkflowStore
        .getState()
        .hydrateFromProject(
          currentProjectId,
          project?.storyboard?.scenes ?? [],
        );
    }
  }, [currentProjectId, loadMessages, getCurrentProject]);

  const handleViewChange = useCallback((view: AppView) => {
    setActiveView(view);
  }, []);

  const renderMainContent = () => {
    if (activeView === "settings") {
      return <SettingsView />;
    }
    if (activeView === "brandkit") {
      return <BrandKitView />;
    }
    if (activeView === "assets") {
      return <AssetLibraryView />;
    }
    if (activeView === "usage") {
      return <UsageView />;
    }

    if (!currentProject) {
      return <WelcomeView />;
    }

    const phase = normalizePhase(currentProject.currentPhase);

    return (
      <div className="flex flex-col h-full relative">
        <PhaseStepper
          currentPhase={phase}
          onPhaseChange={(p) => useProjectStore.getState().setPhase(p)}
        />
        <div className="flex-1 overflow-hidden">
          {phase === "chat" && <ChatView />}
          {phase === "workflow" && <WorkflowView />}
          {phase === "timeline" && <TimelineView />}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex relative">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel
          defaultSize={sidebarCollapsed ? 3 : 18}
          minSize={sidebarCollapsed ? 3 : 14}
          maxSize={sidebarCollapsed ? 5 : 22}
          collapsible
          collapsedSize={3}
          onCollapse={() => setSidebarCollapsed(true)}
          onExpand={() => setSidebarCollapsed(false)}
          className="relative"
        >
          <AppSidebar
            collapsed={sidebarCollapsed}
            onNavigate={handleViewChange}
            activeView={activeView}
          />
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="w-1 bg-border hover:bg-primary/30 transition-colors"
        />
        <ResizablePanel defaultSize={82} minSize={50}>
          {renderMainContent()}
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Floating button to return to Modern UI */}
      <button
        onClick={onToggleModern}
        className="absolute bottom-6 right-6 flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all text-sm font-medium z-50"
      >
        <Sparkles className="w-4 h-4" />
        Modern UI
      </button>
    </div>
  );
}

export default function Home() {
  const [isModernTheme, setIsModernTheme] = useState(true);

  if (isModernTheme) {
    return <ModernDashboard onToggleClassic={() => setIsModernTheme(false)} />;
  }

  return <ClassicDashboard onToggleModern={() => setIsModernTheme(true)} />;
}
