'use client';

import { useProjectStore } from '@/features/project/store';
import { Button } from '@/components/ui/button';
import { VideoTypeCard } from './video-type-card';
import { Plus, Sparkles, Clapperboard, Film, Zap, Star } from 'lucide-react';
import { VIDEO_TYPES } from '@/core/config';
import { motion } from 'framer-motion';

export function WelcomeView() {
  const { createProject } = useProjectStore();

  const handleQuickStart = async (type: string) => {
    const typeName = VIDEO_TYPES.find(t => t.id === type)?.name || 'New Video';
    await createProject(`${typeName} — ${new Date().toLocaleDateString()}`, `A ${typeName} video project`);
  };

  const handleCreateBlank = async () => {
    await createProject(`Untitled Project — ${new Date().toLocaleDateString()}`);
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full text-center"
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Clapperboard className="w-8 h-8 text-primary" />
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome to OpenScene</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          AI-powered video production studio. Plan, storyboard, generate, and export stunning videos with intelligent AI agents.
        </p>

        {/* Create Button */}
        <Button onClick={handleCreateBlank} size="lg" className="gap-2 mb-10">
          <Plus className="w-4 h-4" />
          Create New Project
        </Button>

        {/* Quick Start Templates */}
        <div className="text-left">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" />
            Quick Start Templates
          </h3>
          <div className="grid grid-cols-3 gap-3 auto-rows-fr">
            {VIDEO_TYPES.slice(0, 9).map((type, idx) => (
              <motion.div
                key={type.id}
                className="h-full"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <VideoTypeCard
                  icon={type.icon}
                  name={type.name}
                  description={type.description}
                  onClick={() => handleQuickStart(type.id)}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="mt-12 grid grid-cols-3 gap-6 text-left max-w-lg mx-auto">
          {[
            { icon: Sparkles, title: 'AI Planning', desc: 'Chat with AI to plan your video' },
            { icon: Film, title: 'Visual Workflow', desc: 'Node-based scene editor' },
            { icon: Star, title: 'Smart Generation', desc: 'Parallel scene generation' },
          ].map((f) => (
            <div key={f.title} className="flex flex-col gap-1.5">
              <f.icon className="w-4 h-4 text-primary" />
              <div className="text-xs font-medium">{f.title}</div>
              <div className="text-[10px] text-muted-foreground">{f.desc}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}