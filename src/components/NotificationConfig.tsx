import { useState, useEffect } from 'react';
import { Bell, BellRing, Send, Check, AlertCircle, Loader2, TestTube2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SwissTarget {
  host: string;
  ip?: string;
  type?: string;
  method?: string;
  port?: number;
  use_ssl?: boolean;
  is_admin?: boolean;
}

interface NotificationConfigProps {
  swissTargets?: SwissTarget[];
  stats?: {
    swiss_hosts: number;
    admin_hosts: number;
    total_requests?: number;
  };
}

const TEAMS_WEBHOOK_KEY = 'swissmon_teams_webhook';
const TEAMS_AUTO_NOTIFY_KEY = 'swissmon_teams_auto_notify';
const TELEGRAM_BOT_TOKEN_KEY = 'swissmon_telegram_bot_token';
const TELEGRAM_BOT_NAME_KEY = 'swissmon_telegram_bot_name';
const TELEGRAM_CHAT_ID_KEY = 'swissmon_telegram_chat_id';
const TELEGRAM_AUTO_NOTIFY_KEY = 'swissmon_telegram_auto_notify';

export function NotificationConfig({ swissTargets = [], stats }: NotificationConfigProps) {
  // Teams state
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState('');
  const [teamsAutoNotify, setTeamsAutoNotify] = useState(false);
  const [isTeamsSending, setIsTeamsSending] = useState(false);
  const [isTeamsTesting, setIsTeamsTesting] = useState(false);
  const [teamsLastSent, setTeamsLastSent] = useState<Date | null>(null);

  // Telegram state
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramBotName, setTelegramBotName] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramAutoNotify, setTelegramAutoNotify] = useState(false);
  const [isTelegramSending, setIsTelegramSending] = useState(false);
  const [isTelegramTesting, setIsTelegramTesting] = useState(false);
  const [telegramLastSent, setTelegramLastSent] = useState<Date | null>(null);

  const [isOpen, setIsOpen] = useState(false);

  // Load saved settings
  useEffect(() => {
    const savedTeamsUrl = localStorage.getItem(TEAMS_WEBHOOK_KEY);
    const savedTeamsAutoNotify = localStorage.getItem(TEAMS_AUTO_NOTIFY_KEY);
    const savedTelegramBotToken = localStorage.getItem(TELEGRAM_BOT_TOKEN_KEY);
    const savedTelegramBotName = localStorage.getItem(TELEGRAM_BOT_NAME_KEY);
    const savedTelegramChatId = localStorage.getItem(TELEGRAM_CHAT_ID_KEY);
    const savedTelegramAutoNotify = localStorage.getItem(TELEGRAM_AUTO_NOTIFY_KEY);
    
    if (savedTeamsUrl) setTeamsWebhookUrl(savedTeamsUrl);
    if (savedTeamsAutoNotify) setTeamsAutoNotify(savedTeamsAutoNotify === 'true');
    if (savedTelegramBotToken) setTelegramBotToken(savedTelegramBotToken);
    if (savedTelegramBotName) setTelegramBotName(savedTelegramBotName);
    if (savedTelegramChatId) setTelegramChatId(savedTelegramChatId);
    if (savedTelegramAutoNotify) setTelegramAutoNotify(savedTelegramAutoNotify === 'true');
  }, []);

  // Save settings
  useEffect(() => {
    localStorage.setItem(TEAMS_WEBHOOK_KEY, teamsWebhookUrl);
  }, [teamsWebhookUrl]);

  useEffect(() => {
    localStorage.setItem(TEAMS_AUTO_NOTIFY_KEY, String(teamsAutoNotify));
  }, [teamsAutoNotify]);

  useEffect(() => {
    localStorage.setItem(TELEGRAM_BOT_TOKEN_KEY, telegramBotToken);
  }, [telegramBotToken]);

  useEffect(() => {
    localStorage.setItem(TELEGRAM_BOT_NAME_KEY, telegramBotName);
  }, [telegramBotName]);

  useEffect(() => {
    localStorage.setItem(TELEGRAM_CHAT_ID_KEY, telegramChatId);
  }, [telegramChatId]);

  useEffect(() => {
    localStorage.setItem(TELEGRAM_AUTO_NOTIFY_KEY, String(telegramAutoNotify));
  }, [telegramAutoNotify]);

  // Teams functions
  const testTeamsWebhook = async () => {
    if (!teamsWebhookUrl) {
      toast.error('Bitte MS Teams Webhook URL eingeben');
      return;
    }

    setIsTeamsTesting(true);

    try {
      const testTargets: SwissTarget[] = [
        { host: 'test.example.ch', ip: '192.168.1.1', type: 'TEST', method: 'GET', port: 443, use_ssl: true, is_admin: false },
        { host: 'admin.ch', ip: '10.0.0.1', type: 'TEST', method: 'GET', port: 443, use_ssl: true, is_admin: true },
      ];

      const { data, error } = await supabase.functions.invoke('notify-teams', {
        body: {
          webhookUrl: teamsWebhookUrl,
          targets: testTargets,
          stats: { swiss_hosts: 2, admin_hosts: 1, total_requests: 2 },
          isTest: true,
        }
      });

      if (error) throw error;

      if (data?.sent) {
        toast.success('✅ Teams Test erfolgreich! Prüfen Sie Ihren Channel.');
      } else {
        toast.error(data?.error || 'Test fehlgeschlagen');
      }
    } catch (err) {
      console.error('Teams test error:', err);
      toast.error('Teams Webhook-Test fehlgeschlagen');
    } finally {
      setIsTeamsTesting(false);
    }
  };

  const sendTeamsNotification = async () => {
    if (!teamsWebhookUrl || swissTargets.length === 0) return;

    setIsTeamsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('notify-teams', {
        body: {
          webhookUrl: teamsWebhookUrl,
          targets: swissTargets,
          stats: {
            swiss_hosts: stats?.swiss_hosts || swissTargets.length,
            admin_hosts: stats?.admin_hosts || swissTargets.filter(t => t.is_admin).length,
            total_requests: stats?.total_requests || swissTargets.length,
          }
        }
      });

      if (error) throw error;

      if (data?.sent) {
        toast.success(`${swissTargets.length} Targets an MS Teams gesendet`);
        setTeamsLastSent(new Date());
      }
    } catch (err) {
      console.error('Teams notification error:', err);
      toast.error('Fehler beim Senden der Teams Benachrichtigung');
    } finally {
      setIsTeamsSending(false);
    }
  };

  // Telegram functions
  const testTelegramWebhook = async () => {
    if (!telegramBotToken) {
      toast.error('Bitte Bot Token eingeben');
      return;
    }
    if (!telegramChatId) {
      toast.error('Bitte Chat ID eingeben');
      return;
    }

    setIsTelegramTesting(true);

    try {
      const testTargets: SwissTarget[] = [
        { host: 'test.example.ch', ip: '192.168.1.1', type: 'TEST', method: 'GET', port: 443, use_ssl: true, is_admin: false },
        { host: 'admin.ch', ip: '10.0.0.1', type: 'TEST', method: 'GET', port: 443, use_ssl: true, is_admin: true },
      ];

      const { data, error } = await supabase.functions.invoke('notify-telegram', {
        body: {
          botToken: telegramBotToken,
          chatId: telegramChatId,
          targets: testTargets,
          stats: { swiss_hosts: 2, admin_hosts: 1, total_requests: 2 },
          isTest: true,
        }
      });

      if (error) throw error;

      if (data?.sent) {
        toast.success('✅ Telegram Test erfolgreich! Prüfen Sie Ihren Chat.');
      } else {
        toast.error(data?.error || 'Test fehlgeschlagen');
      }
    } catch (err) {
      console.error('Telegram test error:', err);
      toast.error('Telegram Test fehlgeschlagen');
    } finally {
      setIsTelegramTesting(false);
    }
  };

  const sendTelegramNotification = async () => {
    if (!telegramChatId || swissTargets.length === 0) return;

    setIsTelegramSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('notify-telegram', {
        body: {
          botToken: telegramBotToken,
          chatId: telegramChatId,
          targets: swissTargets,
          stats: {
            swiss_hosts: stats?.swiss_hosts || swissTargets.length,
            admin_hosts: stats?.admin_hosts || swissTargets.filter(t => t.is_admin).length,
            total_requests: stats?.total_requests || swissTargets.length,
          }
        }
      });

      if (error) throw error;

      if (data?.sent) {
        toast.success(`${swissTargets.length} Targets an Telegram gesendet`);
        setTelegramLastSent(new Date());
      }
    } catch (err) {
      console.error('Telegram notification error:', err);
      toast.error('Fehler beim Senden der Telegram Benachrichtigung');
    } finally {
      setIsTelegramSending(false);
    }
  };

  const isTeamsConfigured = teamsWebhookUrl.startsWith('https://');
  const isTelegramConfigured = telegramBotToken.length > 0 && telegramChatId.length > 0;
  const isAnyConfigured = isTeamsConfigured || isTelegramConfigured;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2",
            isAnyConfigured && "border-primary/30 bg-primary/5 hover:bg-primary/10"
          )}
        >
          {isAnyConfigured ? (
            <BellRing className="h-4 w-4 text-primary" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Benachrichtigungen</span>
          {isAnyConfigured && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-primary/10 text-primary">
              {[isTeamsConfigured && 'Teams', isTelegramConfigured && 'TG'].filter(Boolean).join(' + ')}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary-foreground" />
            </div>
            Benachrichtigungen
          </DialogTitle>
          <DialogDescription>
            Erhalten Sie Alerts wenn Swiss (.ch) oder admin.ch Targets gefunden werden.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="teams" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="teams" className="gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M19.35 8.07c-.36-1.7-1.31-3.21-2.7-4.27A7.07 7.07 0 0012.03 2c-2.61 0-4.91 1.43-6.14 3.55a5.97 5.97 0 00-4.64 5.4A5.96 5.96 0 003 16.78 5.96 5.96 0 008.96 22h9.18a5.86 5.86 0 005.61-4.15 5.86 5.86 0 00-4.4-9.78z"/>
              </svg>
              MS Teams
              {isTeamsConfigured && <Check className="w-3 h-3 text-green-500" />}
            </TabsTrigger>
            <TabsTrigger value="telegram" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              Telegram
              {isTelegramConfigured && <Check className="w-3 h-3 text-green-500" />}
            </TabsTrigger>
          </TabsList>

          {/* MS Teams Tab */}
          <TabsContent value="teams" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="teams-webhook-url">Webhook URL</Label>
              <Input
                id="teams-webhook-url"
                type="url"
                placeholder="https://outlook.office.com/webhook/..."
                value={teamsWebhookUrl}
                onChange={(e) => setTeamsWebhookUrl(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Erstellen Sie einen Incoming Webhook in Ihrem MS Teams Channel.
                <a 
                  href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-primary hover:underline"
                >
                  Anleitung →
                </a>
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-Benachrichtigung</Label>
                <p className="text-xs text-muted-foreground">
                  Automatisch benachrichtigen bei neuen Targets
                </p>
              </div>
              <Switch
                checked={teamsAutoNotify}
                onCheckedChange={setTeamsAutoNotify}
                disabled={!isTeamsConfigured}
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                {isTeamsConfigured ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                    <Check className="h-3 w-3 mr-1" />
                    Konfiguriert
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Nicht konfiguriert
                  </Badge>
                )}
              </div>
              {teamsLastSent && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Zuletzt gesendet</span>
                  <span className="text-xs">{teamsLastSent.toLocaleTimeString('de-CH')}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={testTeamsWebhook}
                disabled={!isTeamsConfigured || isTeamsTesting}
                className="w-full gap-2 border-dashed"
              >
                {isTeamsTesting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Teste Webhook...</>
                ) : (
                  <><TestTube2 className="h-4 w-4" />Webhook testen</>
                )}
              </Button>
              <Button
                onClick={sendTeamsNotification}
                disabled={!isTeamsConfigured || isTeamsSending || swissTargets.length === 0}
                className="gap-2"
              >
                {isTeamsSending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Senden...</>
                ) : (
                  <><Send className="h-4 w-4" />Jetzt senden ({swissTargets.length} Targets)</>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* Telegram Tab */}
          <TabsContent value="telegram" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="telegram-bot-token">Bot Token</Label>
              <Input
                id="telegram-bot-token"
                type="password"
                placeholder="z.B. 8502308757:AAFTrGz..."
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                API Token vom BotFather
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegram-bot-name">Bot Name (optional)</Label>
              <Input
                id="telegram-bot-name"
                type="text"
                placeholder="z.B. @gapMon_bot"
                value={telegramBotName}
                onChange={(e) => setTelegramBotName(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Name des Bots zur Referenz
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegram-chat-id">Chat ID</Label>
              <Input
                id="telegram-chat-id"
                type="text"
                placeholder="z.B. 7745296423"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Ihre Telegram Chat ID{telegramBotName && ` • Bot: ${telegramBotName}`}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-Benachrichtigung</Label>
                <p className="text-xs text-muted-foreground">
                  Automatisch benachrichtigen bei neuen Targets
                </p>
              </div>
              <Switch
                checked={telegramAutoNotify}
                onCheckedChange={setTelegramAutoNotify}
                disabled={!isTelegramConfigured}
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                {isTelegramConfigured ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                    <Check className="h-3 w-3 mr-1" />
                    Konfiguriert
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Nicht konfiguriert
                  </Badge>
                )}
              </div>
              {telegramLastSent && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Zuletzt gesendet</span>
                  <span className="text-xs">{telegramLastSent.toLocaleTimeString('de-CH')}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={testTelegramWebhook}
                disabled={!isTelegramConfigured || isTelegramTesting}
                className="w-full gap-2 border-dashed"
              >
                {isTelegramTesting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Teste Telegram...</>
                ) : (
                  <><TestTube2 className="h-4 w-4" />Telegram testen</>
                )}
              </Button>
              <Button
                onClick={sendTelegramNotification}
                disabled={!isTelegramConfigured || isTelegramSending || swissTargets.length === 0}
                className="gap-2"
              >
                {isTelegramSending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Senden...</>
                ) : (
                  <><Send className="h-4 w-4" />Jetzt senden ({swissTargets.length} Targets)</>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Schliessen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
