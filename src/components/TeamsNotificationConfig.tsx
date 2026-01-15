import { useState, useEffect } from 'react';
import { Bell, BellRing, Settings2, Send, Check, AlertCircle, Loader2 } from 'lucide-react';
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

interface TeamsNotificationConfigProps {
  swissTargets?: SwissTarget[];
  stats?: {
    swiss_hosts: number;
    admin_hosts: number;
    total_requests?: number;
  };
}

const STORAGE_KEY = 'swissmon_teams_webhook';
const AUTO_NOTIFY_KEY = 'swissmon_teams_auto_notify';

export function TeamsNotificationConfig({ swissTargets = [], stats }: TeamsNotificationConfigProps) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [autoNotify, setAutoNotify] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const savedUrl = localStorage.getItem(STORAGE_KEY);
    const savedAutoNotify = localStorage.getItem(AUTO_NOTIFY_KEY);
    if (savedUrl) setWebhookUrl(savedUrl);
    if (savedAutoNotify) setAutoNotify(savedAutoNotify === 'true');
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, webhookUrl);
  }, [webhookUrl]);

  useEffect(() => {
    localStorage.setItem(AUTO_NOTIFY_KEY, String(autoNotify));
  }, [autoNotify]);

  const sendNotification = async () => {
    if (!webhookUrl) {
      toast.error('Bitte MS Teams Webhook URL eingeben');
      return;
    }

    if (swissTargets.length === 0) {
      toast.info('Keine Swiss Targets zum Senden');
      return;
    }

    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('notify-teams', {
        body: {
          webhookUrl,
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
        setLastSent(new Date());
      } else {
        toast.info(data?.message || 'Keine Targets gesendet');
      }
    } catch (err) {
      console.error('Teams notification error:', err);
      toast.error('Fehler beim Senden der Benachrichtigung');
    } finally {
      setIsSending(false);
    }
  };

  const isConfigured = webhookUrl.startsWith('https://');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2",
            isConfigured && "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10"
          )}
        >
          {isConfigured ? (
            <BellRing className="h-4 w-4 text-blue-500" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">MS Teams</span>
          {isConfigured && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-blue-500/10 text-blue-600">
              ON
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M19.35 8.07c-.36-1.7-1.31-3.21-2.7-4.27A7.07 7.07 0 0012.03 2c-2.61 0-4.91 1.43-6.14 3.55a5.97 5.97 0 00-4.64 5.4A5.96 5.96 0 003 16.78 5.96 5.96 0 008.96 22h9.18a5.86 5.86 0 005.61-4.15 5.86 5.86 0 00-4.4-9.78z"/>
              </svg>
            </div>
            MS Teams Notifications
          </DialogTitle>
          <DialogDescription>
            Erhalten Sie Benachrichtigungen wenn Swiss (.ch) oder admin.ch Targets gefunden werden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Webhook URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://outlook.office.com/webhook/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
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

          {/* Auto-notify toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Auto-Benachrichtigung</Label>
              <p className="text-xs text-muted-foreground">
                Automatisch benachrichtigen bei neuen Targets
              </p>
            </div>
            <Switch
              checked={autoNotify}
              onCheckedChange={setAutoNotify}
              disabled={!isConfigured}
            />
          </div>

          {/* Status */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              {isConfigured ? (
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
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Swiss Targets</span>
              <span className="font-medium">{swissTargets.length}</span>
            </div>
            {lastSent && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Zuletzt gesendet</span>
                <span className="text-xs">{lastSent.toLocaleTimeString('de-CH')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Schliessen
          </Button>
          <Button
            onClick={sendNotification}
            disabled={!isConfigured || isSending || swissTargets.length === 0}
            className="gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Senden...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Jetzt senden
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
