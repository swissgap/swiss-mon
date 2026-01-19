-- Create notification_settings table for persistent storage
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  is_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for public read/write (since this is a single-user monitoring app)
CREATE POLICY "Allow public read access" 
ON public.notification_settings 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert access" 
ON public.notification_settings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update access" 
ON public.notification_settings 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete access" 
ON public.notification_settings 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION public.update_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_notification_settings_updated_at();

-- Insert default settings
INSERT INTO public.notification_settings (setting_key, setting_value, is_enabled) VALUES
  ('teams_webhook_url', '', false),
  ('teams_auto_notify', 'false', false),
  ('telegram_bot_token', '', false),
  ('telegram_bot_name', '', false),
  ('telegram_chat_id', '', false),
  ('telegram_auto_notify', 'false', false);