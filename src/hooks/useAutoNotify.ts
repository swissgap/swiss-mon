import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SwissTarget {
  host: string;
  ip?: string;
  type?: string;
  method?: string;
  port?: number;
  use_ssl?: boolean;
  is_admin?: boolean;
}

interface NotificationSettings {
  teams_webhook_url?: string;
  teams_auto_notify?: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  telegram_auto_notify?: boolean;
}

interface Stats {
  swiss_hosts: number;
  admin_hosts: number;
  total_requests?: number;
}

// Track already notified hosts to prevent duplicates
const NOTIFIED_HOSTS_KEY = 'swissmon_notified_hosts';

function getNotifiedHosts(): Set<string> {
  try {
    const stored = localStorage.getItem(NOTIFIED_HOSTS_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // Expire entries older than 24 hours
      const now = Date.now();
      const validHosts = Object.entries(data)
        .filter(([, timestamp]) => now - (timestamp as number) < 24 * 60 * 60 * 1000)
        .map(([host]) => host);
      return new Set(validHosts);
    }
  } catch (e) {
    console.error('Failed to parse notified hosts:', e);
  }
  return new Set();
}

function addNotifiedHosts(hosts: string[]): void {
  try {
    const stored = localStorage.getItem(NOTIFIED_HOSTS_KEY);
    const data = stored ? JSON.parse(stored) : {};
    const now = Date.now();
    
    for (const host of hosts) {
      data[host.toLowerCase()] = now;
    }
    
    // Clean up old entries
    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, timestamp]) => now - (timestamp as number) < 24 * 60 * 60 * 1000)
    );
    
    localStorage.setItem(NOTIFIED_HOSTS_KEY, JSON.stringify(cleaned));
  } catch (e) {
    console.error('Failed to save notified hosts:', e);
  }
}

export function useAutoNotify() {
  const isNotifying = useRef(false);
  const settingsRef = useRef<NotificationSettings | null>(null);

  // Load notification settings from database
  const loadSettings = useCallback(async (): Promise<NotificationSettings> => {
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('setting_key, setting_value, is_enabled');

      if (error) throw error;

      const settings: NotificationSettings = {};
      
      for (const row of data || []) {
        switch (row.setting_key) {
          case 'teams_webhook_url':
            settings.teams_webhook_url = row.setting_value || undefined;
            break;
          case 'teams_auto_notify':
            settings.teams_auto_notify = row.setting_value === 'true' && row.is_enabled;
            break;
          case 'telegram_bot_token':
            settings.telegram_bot_token = row.setting_value || undefined;
            break;
          case 'telegram_chat_id':
            settings.telegram_chat_id = row.setting_value || undefined;
            break;
          case 'telegram_auto_notify':
            settings.telegram_auto_notify = row.setting_value === 'true' && row.is_enabled;
            break;
        }
      }

      settingsRef.current = settings;
      return settings;
    } catch (error) {
      console.error('Error loading notification settings:', error);
      return {};
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Send automatic notifications for new targets
  const notifyNewTargets = useCallback(async (
    swissTargets: SwissTarget[],
    stats: Stats
  ): Promise<{ teamsSent: boolean; telegramSent: boolean }> => {
    if (isNotifying.current || swissTargets.length === 0) {
      return { teamsSent: false, telegramSent: false };
    }

    // Load fresh settings
    const settings = await loadSettings();
    
    // Check if any auto-notify is enabled
    const teamsEnabled = settings.teams_auto_notify && settings.teams_webhook_url?.startsWith('https://');
    const telegramEnabled = settings.telegram_auto_notify && settings.telegram_bot_token && settings.telegram_chat_id;
    
    if (!teamsEnabled && !telegramEnabled) {
      console.log('Auto-notify disabled for both Teams and Telegram');
      return { teamsSent: false, telegramSent: false };
    }

    // Filter to only new hosts we haven't notified about
    const notifiedHosts = getNotifiedHosts();
    const newTargets = swissTargets.filter(t => !notifiedHosts.has(t.host.toLowerCase()));
    
    if (newTargets.length === 0) {
      console.log('No new targets to notify about');
      return { teamsSent: false, telegramSent: false };
    }

    console.log(`Found ${newTargets.length} new targets to notify about`);
    isNotifying.current = true;

    const result = { teamsSent: false, telegramSent: false };

    try {
      // Calculate stats for new targets only
      const newStats = {
        swiss_hosts: new Set(newTargets.map(t => t.host.toLowerCase())).size,
        admin_hosts: new Set(newTargets.filter(t => t.is_admin).map(t => t.host.toLowerCase())).size,
        total_requests: newTargets.length,
      };

      // Send Teams notification
      if (teamsEnabled) {
        try {
          const { data, error } = await supabase.functions.invoke('notify-teams', {
            body: {
              webhookUrl: settings.teams_webhook_url,
              targets: newTargets,
              stats: newStats,
            }
          });

          if (error) throw error;
          
          if (data?.sent) {
            result.teamsSent = true;
            console.log('Auto Teams notification sent successfully');
          }
        } catch (err) {
          console.error('Auto Teams notification failed:', err);
        }
      }

      // Send Telegram notification
      if (telegramEnabled) {
        try {
          const { data, error } = await supabase.functions.invoke('notify-telegram', {
            body: {
              botToken: settings.telegram_bot_token,
              chatId: settings.telegram_chat_id,
              targets: newTargets,
              stats: newStats,
            }
          });

          if (error) throw error;
          
          if (data?.sent) {
            result.telegramSent = true;
            console.log('Auto Telegram notification sent successfully');
            toast.success(`🔔 ${newTargets.length} neue Swiss Targets automatisch gemeldet`);
          }
        } catch (err) {
          console.error('Auto Telegram notification failed:', err);
        }
      }

      // Mark these hosts as notified
      if (result.teamsSent || result.telegramSent) {
        addNotifiedHosts(newTargets.map(t => t.host));
      }

    } finally {
      isNotifying.current = false;
    }

    return result;
  }, [loadSettings]);

  return {
    notifyNewTargets,
    loadSettings,
  };
}
