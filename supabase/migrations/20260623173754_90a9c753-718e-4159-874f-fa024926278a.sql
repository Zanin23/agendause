
CREATE TABLE public.billing_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  client TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  week_start DATE NOT NULL DEFAULT date_trunc('week', CURRENT_DATE)::date,
  status TEXT NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_requests TO authenticated;
GRANT ALL ON public.billing_requests TO service_role;
ALTER TABLE public.billing_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages billing_requests" ON public.billing_requests
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_billing_requests_updated
  BEFORE UPDATE ON public.billing_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_billing_requests_user_week ON public.billing_requests(user_id, week_start DESC);

CREATE TABLE public.billing_request_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.billing_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_request_updates TO authenticated;
GRANT ALL ON public.billing_request_updates TO service_role;
ALTER TABLE public.billing_request_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages billing_request_updates" ON public.billing_request_updates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_billing_request_updates_req ON public.billing_request_updates(request_id, created_at DESC);

CREATE TABLE public.billing_notification_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  times TEXT[] NOT NULL DEFAULT ARRAY['09:00','14:00','17:00'],
  weekdays INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_notification_settings TO authenticated;
GRANT ALL ON public.billing_notification_settings TO service_role;
ALTER TABLE public.billing_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages billing_notification_settings" ON public.billing_notification_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_billing_notif_updated
  BEFORE UPDATE ON public.billing_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
