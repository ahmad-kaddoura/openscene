"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  History,
  ListChecks,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectStore } from "@/features/project/store";

export function ModernSubSidebar() {
  const { projects, currentProjectId, createProject, openProject, getCurrentProject } = useProjectStore();
  const currentProject = getCurrentProject();
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  const getStartedSteps = [
    {
      id: 1,
      label: "Approve identity",
      completed: Boolean(currentProject?.creativePlan?.reusableAssets.some((asset) => asset.generatedImageUrl)),
    },
    {
      id: 2,
      label: "Lock script & voice",
      completed: currentProject?.videoScript?.approvalStatus === "approved",
    },
    {
      id: 3,
      label: "Build storyboard",
      completed: Boolean(currentProject?.storyboard?.scenes.length || currentProject?.workflowGraph),
    },
  ];

  const completedCount = getStartedSteps.filter((step) => step.completed).length;
  const sortedProjects = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="z-10 flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between p-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Workspace</h2>
          <p className="text-xs text-slate-500">Projects and review flow</p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <Button
          className="w-full gap-2 rounded-full border-0 bg-cyan-100 font-medium text-cyan-800 hover:bg-cyan-200"
          variant="outline"
          onClick={() => createProject("Untitled video workspace", "New AI video production workspace")}
        >
          <Plus className="h-4 w-4" />
          New video
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4">
        <section className="mb-5 rounded-[8px] border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setChecklistOpen((value) => !value)}
            className="flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-cyan-600" />
              Review checklist
            </span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                {completedCount}/{getStartedSteps.length}
              </span>
              {checklistOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              )}
            </span>
          </button>

          {checklistOpen && (
            <div className="mt-1 flex flex-col gap-1">
              {getStartedSteps.map((step) => (
                <div
                  key={step.id}
                  className="flex cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                >
                  {step.completed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className={step.completed ? "text-slate-500" : "text-slate-900"}>{step.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="mb-2 flex w-full items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            <span className="flex items-center gap-2">
              <History className="h-3.5 w-3.5" />
              Recent projects
            </span>
            {historyOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {historyOpen && (
            <div className="flex flex-col gap-2 pb-5">
              {sortedProjects.slice(0, 8).map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => openProject(project.id)}
                  className={`group w-full rounded-[8px] p-3 text-left transition-colors ${
                    currentProjectId === project.id
                      ? "bg-cyan-50 text-cyan-950 ring-1 ring-cyan-100"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium">{project.name}</div>
                    {currentProjectId === project.id && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-600" />}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {project.currentPhase} · {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              ))}

              {sortedProjects.length === 0 && (
                <div className="rounded-[8px] border border-dashed border-slate-200 p-3 text-xs leading-5 text-slate-500">
                  New projects will appear here once you create your first workspace.
                </div>
              )}
            </div>
          )}
        </section>
      </ScrollArea>
    </div>
  );
}
