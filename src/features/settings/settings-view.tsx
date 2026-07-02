'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Download, KeyRound, FileText, Shield, Sun } from 'lucide-react';
import { ApiKeysSection } from '@/features/settings/api-keys-section';
import { PromptsTab } from '@/features/settings/prompts-tab';
import { AgentsTab } from '@/features/settings/agents-tab';
import { ExportTab } from '@/features/settings/export-tab';
import { ControlsTab } from '@/features/settings/controls-tab';
import { AppearanceTab } from '@/features/settings/appearance-tab';

export function SettingsView() {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div>
          <h2 className="text-xl font-bold">Settings</h2>
          <p className="text-sm text-muted-foreground">Configure your OpenScene experience</p>
        </div>

        <Tabs defaultValue="api-keys" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-6">
            <TabsTrigger value="api-keys" className="gap-1.5 text-xs">
              <KeyRound className="w-3.5 h-3.5" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" /> Prompts
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-1.5 text-xs">
              <Bot className="w-3.5 h-3.5" /> Agents
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> Export
            </TabsTrigger>
            <TabsTrigger value="limits" className="gap-1.5 text-xs">
              <Shield className="w-3.5 h-3.5" /> Controls
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5 text-xs">
              <Sun className="w-3.5 h-3.5" /> Appearance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys">
            <ApiKeysSection />
          </TabsContent>

          <TabsContent value="prompts" className="space-y-3">
            <PromptsTab />
          </TabsContent>

          <TabsContent value="agents" className="space-y-3">
            <AgentsTab />
          </TabsContent>

          <TabsContent value="export" className="space-y-3">
            <ExportTab />
          </TabsContent>

          <TabsContent value="limits" className="space-y-4">
            <ControlsTab />
          </TabsContent>

          <TabsContent value="appearance" className="space-y-4">
            <AppearanceTab />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
