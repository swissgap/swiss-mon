import { useState, useEffect, useCallback } from 'react';
import { Bell, BellRing, Check, AlertCircle, Loader2, TestTube2, MessageCircle, Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Status {
  teams_configured: boolean;
  teams_webhook_hint: string;
  teams_auto_notify: boolean;
  telegram_configured: boolean;
  telegram_token_hint: string;
  telegram_bot_name: string;
  telegram_chat_hint: string;
  telegram_auto_notify: boolean;
  password_set: boolean;
}

// Props kept for backwards compatibility; alerts are now sent by the server only.
export function NotificationConfig(_props: { swissTargets?: unknown[]; stats?: unknown }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Editable fields — empty means "keep the stored value"
  const [webhook, setWebhook] = useState('');
  const [token, setToken] = useState('');
  const [botName, setBotName] = useState('');
  const [chatId, setChatId] = useState('');
  const [teamsAuto, setTeamsAuto] = useState(false);
  const [tgAuto, setTgAuto] = useState(false);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-settings', { body });
    if (error) {
      let msg = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = (await call({ action: 'get' })) as Status;
      setStatus(s);
      setTeamsAuto(s.teams_auto_notify);
      setTgAuto(s.telegram_auto_notify);
      setBotName(s.telegram_bot_name);
    } catch (e) {
      toast.error(`Einstellungen konnten nicht geladen werden: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { load(); }, [load]);

  const requirePw = () => {
    if (!password) { toast.error('Bitte Admin-Passwort eingeben'); return false; }
    return true;
  };

  const save = async () => {
    if (!requirePw()) return;
    const updates: Record<string, string | boolean> = {
      teams_auto_notify: teamsAuto,
      telegram_auto_notify: tgAuto,
      telegram_bot_name: botName,
    };
    if (webhook) updates.teams_webhook_url = webhook;
    if (token) updates.telegram_bot_token = token;
    if (chatId) updates.telegram_chat_id = chatId;
    setBusy('save');
    try {
      await call({ action: 'save', password, updates });
      toast.success('Einstellungen gespeichert');
      setWebhook(''); setToken(''); setChatId('');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  };

  const test = async (kind: 'teams' | 'telegram') => {
    if (!requirePw()) return;
    setBusy(kind);
    try {
      const r = await call({ action: `test-${kind}`, password });
      if (r?.sent) toast.success(`Testmeldung an ${kind === 'teams' ? 'MS Teams' : 'Telegram'} gesendet`);
      else toast.error(r?.error || 'Test fehlgeschlagen');
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  };

  const teamsOk = !!status?.teams_configured;
  const tgOk = !!status?.telegram_configured;
  const any = teamsOk || tgOk;

  const StatusBadge = ({ ok }: { ok: boolean }) => ok ? (
    <Badge variant="outline" className="bg-status-online/10 text-status-online border-status-online/30"><Check className="h-3 w-3 mr-1" />Konfiguriert</Badge>
  ) : (
    <Badge variant="outline" className="bg-status-warning/10 text-status-warning border-status-warning/30"><AlertCircle className="h-3 w-3 mr-1" />Nicht konfiguriert</Badge>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-2', any && 'border-primary/30 bg-primary/5 hover:bg-primary/10')}>
          {any ? <BellRing className="h-4 w-4 text-primary" /> : <Bell className="h-4 w-4" />}
          <span className="hidden sm:inline">Benachrichtigungen</span>
          {any && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-primary/10 text-primary">
              {[teamsOk && 'Teams', tgOk && 'TG'].filter(Boolean).join(' + ')}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="w-5 h-5 text-primary" />Benachrichtigungen</DialogTitle>
          <DialogDescription>
            Der Server meldet neue .ch- und admin.ch-Targets automatisch. Zugangsdaten werden nur maskiert angezeigt.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Lade…</div>
        ) : (
          <>
            {status && !status.password_set && (
              <p className="text-xs rounded-md border border-status-warning/30 bg-status-warning/10 p-2 text-status-warning">
                Es ist noch kein Admin-Passwort hinterlegt. Speichern ist erst danach möglich.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="admin-pw" className="flex items-center gap-1"><Lock className="h-3 w-3" />Admin-Passwort</Label>
              <Input id="admin-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>

            <Tabs defaultValue="teams" className="mt-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="teams">MS Teams {teamsOk && <Check className="w-3 h-3 ml-1 text-status-online" />}</TabsTrigger>
                <TabsTrigger value="telegram"><MessageCircle className="w-4 h-4 mr-1" />Telegram {tgOk && <Check className="w-3 h-3 ml-1 text-status-online" />}</TabsTrigger>
              </TabsList>

              <TabsContent value="teams" className="space-y-4 mt-4">
                <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Status</span><StatusBadge ok={teamsOk} /></div>
                <div className="space-y-2">
                  <Label htmlFor="wh">Webhook URL {status?.teams_webhook_hint && <span className="text-muted-foreground font-mono">({status.teams_webhook_hint})</span>}</Label>
                  <Input id="wh" type="url" placeholder={teamsOk ? 'Leer lassen = unverändert' : 'https://…'} value={webhook} onChange={(e) => setWebhook(e.target.value)} className="font-mono text-sm" />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label>Auto-Benachrichtigung</Label>
                  <Switch checked={teamsAuto} onCheckedChange={setTeamsAuto} />
                </div>
                <Button variant="outline" onClick={() => test('teams')} disabled={!teamsOk || busy !== null} className="w-full gap-2 border-dashed">
                  {busy === 'teams' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}Webhook testen
                </Button>
              </TabsContent>

              <TabsContent value="telegram" className="space-y-4 mt-4">
                <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Status</span><StatusBadge ok={tgOk} /></div>
                <div className="space-y-2">
                  <Label htmlFor="tk">Bot Token {status?.telegram_token_hint && <span className="text-muted-foreground font-mono">({status.telegram_token_hint})</span>}</Label>
                  <Input id="tk" type="password" placeholder={tgOk ? 'Leer lassen = unverändert' : 'Token vom BotFather'} value={token} onChange={(e) => setToken(e.target.value)} className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bn">Bot Name (optional)</Label>
                  <Input id="bn" value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="@mein_bot" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci">Chat ID {status?.telegram_chat_hint && <span className="text-muted-foreground font-mono">({status.telegram_chat_hint})</span>}</Label>
                  <Input id="ci" placeholder={tgOk ? 'Leer lassen = unverändert' : 'z.B. 123456789'} value={chatId} onChange={(e) => setChatId(e.target.value)} className="font-mono text-sm" />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label>Auto-Benachrichtigung</Label>
                  <Switch checked={tgAuto} onCheckedChange={setTgAuto} />
                </div>
                <Button variant="outline" onClick={() => test('telegram')} disabled={!tgOk || busy !== null} className="w-full gap-2 border-dashed">
                  {busy === 'telegram' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}Testmeldung senden
                </Button>
              </TabsContent>
            </Tabs>

            <Button onClick={save} disabled={busy !== null} className="w-full gap-2">
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Speichern
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
