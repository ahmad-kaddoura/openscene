'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_QWEN_BASE_URL, ENV_KEY_GROUPS } from '@/core/config/env-keys';
import type { EnvSettingsResponse } from '@/app/api/settings/env/route';
import { useToast } from '@/hooks/use-toast';
import { Copy, ExternalLink, Info, KeyRound, Loader2, Save, Zap } from 'lucide-react';

type KeyFormState = Record<string, { apiKey: string; baseUrl: string }>;

function QwenKeyInstructions() {
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      <p className="font-medium text-sm">How to get your Qwen API key</p>
      <p className="text-muted-foreground">
        Qwen Cloud gives you <strong className="text-foreground">one key for everything</strong> — chat, image, video, and TTS.
        The description field is just a label so you remember what the key is for.
      </p>
      <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
        <li>
          Go to{' '}
          <a
            href="https://home.qwencloud.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Qwen Cloud → API Keys
            <ExternalLink className="w-3 h-3" />
          </a>{' '}
          and sign in.
        </li>
        <li>
          Click <strong className="text-foreground">Create API Key</strong>, enter a description (e.g. &quot;VideoForge&quot;), then click{' '}
          <strong className="text-foreground">Generate Key</strong>.
        </li>
        <li>
          Copy the key immediately — it starts with <code className="text-[10px] bg-muted px-1 py-0.5 rounded">sk-</code> and is
          shown only once. After closing the dialog you only see a masked version.
        </li>
        <li>
          Under <strong className="text-foreground">Pay-As-You-Go</strong>, copy the <strong className="text-foreground">OpenAI Compatible</strong> Base URL — or leave the default below (same value).
        </li>
        <li>Paste the key here, click &quot;Apply to all services&quot;, then save.</li>
      </ol>
      <div className="rounded-md bg-muted/50 p-2.5 space-y-1 font-mono text-[10px] text-muted-foreground break-all">
        Default Base URL: {DEFAULT_QWEN_BASE_URL}
      </div>
      <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
        <p className="font-medium text-foreground text-[11px]">Already created a key?</p>
        <p className="text-[10px] text-muted-foreground">
          Find it on the API Keys table — you can copy the masked key won&apos;t work; if you lost it, delete the old key and create a new one.
        </p>
      </div>
      <a
        href="https://docs.qwencloud.com/developer-guides/administration/api-keys"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1 text-[11px]"
      >
        Qwen Cloud API key docs
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

function ServiceKeyInstructions({ label }: { label: string }) {
  return (
    <div className="space-y-2 text-xs leading-relaxed">
      <p className="font-medium text-sm">{label}</p>
      <p className="text-muted-foreground">
        No separate key needed on Qwen Cloud — use the same{' '}
        <code className="text-[10px] bg-muted px-1 py-0.5 rounded">sk-</code> key from your Qwen Cloud account.
        Click <strong className="text-foreground">Apply to all services</strong> on the Qwen Cloud card to fill this automatically.
      </p>
      <p className="text-muted-foreground">
        Only use a different key here if you route {label.toLowerCase()} through another provider.
      </p>
    </div>
  );
}

function InfoButton({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          aria-label="How to get this API key"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function ApiKeysSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [status, setStatus] = useState<EnvSettingsResponse['keys']>({});
  const [form, setForm] = useState<KeyFormState>({});

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/env');
      if (!res.ok) throw new Error('Failed to load');
      const data: EnvSettingsResponse = await res.json();
      setStatus(data.keys);
      setForm(
        Object.fromEntries(
          ENV_KEY_GROUPS.map((g) => [
            g.id,
            { apiKey: '', baseUrl: data.keys[g.id]?.baseUrl || g.defaultBaseUrl },
          ])
        )
      );
    } catch {
      toast({
        title: 'Could not load API keys',
        description: 'Check that the server can read your .env file.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: form }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }

      const data: EnvSettingsResponse = await res.json();
      setStatus(data.keys);
      setForm((prev) =>
        Object.fromEntries(
          ENV_KEY_GROUPS.map((g) => [
            g.id,
            { apiKey: '', baseUrl: prev[g.id]?.baseUrl || data.keys[g.id]?.baseUrl || g.defaultBaseUrl },
          ])
        )
      );

      toast({
        title: 'API keys saved',
        description: 'Your .env file has been updated. Restart the dev server if keys were changed for the first time.',
      });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Could not write to .env',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading API keys…</span>
      </div>
    );
  }

  const configuredCount = ENV_KEY_GROUPS.filter((g) => status[g.id]?.apiKey.isSet).length;

  const applyQwenKeyToAll = () => {
    const qwen = form.qwen;
    if (!qwen?.apiKey && !status.qwen?.apiKey.isSet) {
      toast({
        title: 'Enter your Qwen API key first',
        description: 'Paste the sk- key from home.qwencloud.com/api-keys into the Qwen Cloud field.',
        variant: 'destructive',
      });
      return;
    }

    setForm((prev) => {
      const apiKey = prev.qwen?.apiKey || '';
      const baseUrl = prev.qwen?.baseUrl || status.qwen?.baseUrl || ENV_KEY_GROUPS[0].defaultBaseUrl;
      return Object.fromEntries(
        ENV_KEY_GROUPS.map((g) => [g.id, { apiKey, baseUrl }])
      );
    });

    toast({
      title: 'Applied to all services',
      description: 'Same Qwen Cloud key copied to image, video, and TTS. Click Save Keys to write to .env.',
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/env/test');
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.message });
      if (data.ok) {
        toast({ title: 'Qwen Cloud connected', description: data.message });
      } else {
        toast({ title: 'Connection failed', description: data.message, variant: 'destructive' });
      }
    } catch {
      setTestResult({ ok: false, message: 'Could not run connection test' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          One key from{' '}
          <a href="https://home.qwencloud.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Qwen Cloud
          </a>{' '}
          covers all services. Values are saved to your local{' '}
          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">.env</code> file.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleTestConnection} disabled={testing || configuredCount === 0}>
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Test
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Keys
          </Button>
        </div>
      </div>

      {testResult && (
        <div className={`rounded-lg border px-4 py-3 text-xs ${testResult.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200/90' : 'border-red-500/30 bg-red-500/5 text-red-200/90'}`}>
          {testResult.message}
        </div>
      )}

      {configuredCount === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90 space-y-1">
          <p>Create one API key at Qwen Cloud — the description is just a label (e.g. &quot;VideoForge&quot;).</p>
          <p>After Generate Key, copy the <code className="text-[10px] bg-muted px-1 rounded">sk-</code> value and the Base URL from the bottom of that page.</p>
        </div>
      )}

      <div className="grid gap-3">
        {ENV_KEY_GROUPS.map((group) => {
          const groupStatus = status[group.id];
          const isSet = groupStatus?.apiKey.isSet ?? false;

          return (
            <Card key={group.id} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                    {group.label}
                    <InfoButton>
                      {group.id === 'qwen' ? (
                        <QwenKeyInstructions />
                      ) : (
                        <ServiceKeyInstructions label={group.label} />
                      )}
                    </InfoButton>
                  </CardTitle>
                  <Badge
                    variant={isSet ? 'default' : 'outline'}
                    className={`text-[10px] ${isSet ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' : ''}`}
                  >
                    {isSet ? 'Configured' : 'Not set'}
                  </Badge>
                </div>
                <CardDescription className="text-xs">{group.description}</CardDescription>
                {group.id === 'qwen' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs gap-1.5"
                    onClick={applyQwenKeyToAll}
                  >
                    <Copy className="w-3 h-3" />
                    Apply to all services
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    API Key
                  </Label>
                  <Input
                    type="password"
                    className="mt-1 h-8 text-xs font-mono"
                    placeholder={isSet ? `Configured (${groupStatus?.apiKey.masked}) — enter to replace` : 'sk-...'}
                    value={form[group.id]?.apiKey ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        [group.id]: { ...prev[group.id], apiKey: e.target.value },
                      }))
                    }
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Base URL
                  </Label>
                  <Input
                    type="url"
                    className="mt-1 h-8 text-xs font-mono"
                    placeholder={DEFAULT_QWEN_BASE_URL}
                    value={form[group.id]?.baseUrl ?? group.defaultBaseUrl}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        [group.id]: { ...prev[group.id], baseUrl: e.target.value },
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
