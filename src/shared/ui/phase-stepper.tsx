'use client';

import type { ProjectPhase } from '@/core/types';
import { PROJECT_PHASES } from './phase-config';

const PHASES = PROJECT_PHASES;

interface PhaseStepperProps {
  currentPhase: ProjectPhase;
  onPhaseChange: (phase: ProjectPhase) => void;
}

export function PhaseStepper({ currentPhase, onPhaseChange }: PhaseStepperProps) {
  const normalizedPhase: ProjectPhase =
    currentPhase === 'brief' || currentPhase === 'storyboard'
      ? 'chat'
      : currentPhase === 'generation' || currentPhase === 'export'
        ? 'timeline'
        : currentPhase;
  const currentIndex = PHASES.findIndex(p => p.id === normalizedPhase);

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center px-4 py-2 gap-1 overflow-x-auto">
        {PHASES.map((phase, idx) => {
          const isActive = phase.id === normalizedPhase;
          const isCompleted = idx < currentIndex;

          return (
            <div key={phase.id} className="flex items-center">
              {idx > 0 && (
                <div className={`w-6 h-px mx-1 ${isCompleted ? 'bg-primary' : 'bg-border'}`} />
              )}
              <button
                onClick={() => onPhaseChange(phase.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : isCompleted
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span className="text-sm">
                  {isCompleted ? '✓' : phase.icon}
                </span>
                <span className="hidden sm:inline">{phase.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
