'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const WorkflowViewInner = dynamic(
  () => import('./workflow-view-inner').then(m => ({ default: m.WorkflowViewInner })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading workflow editor...</p>
        </div>
      </div>
    ),
  }
);

export function WorkflowView() {
  return <WorkflowViewInner />;
}

export { AI_ACTIONS } from './workflow-view-inner';