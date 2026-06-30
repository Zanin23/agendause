
-- =========================================================
-- 1. Workspaces + membership + profile preference
-- =========================================================
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

INSERT INTO public.workspaces (slug, name) VALUES
  ('implantacao', 'Implantação'),
  ('waldemar', 'Waldemar');

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see their memberships"
  ON public.workspace_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Members see workspaces they belong to"
  ON public.workspaces FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspaces.id AND m.user_id = auth.uid()));

ALTER TABLE public.profiles ADD COLUMN active_workspace_id uuid REFERENCES public.workspaces(id);

-- Backfill: every existing user gets membership to both workspaces; active = Implantação
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, p.id, 'member' FROM public.profiles p CROSS JOIN public.workspaces w
ON CONFLICT DO NOTHING;

UPDATE public.profiles
SET active_workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'implantacao')
WHERE active_workspace_id IS NULL;

-- New users: auto-add to both workspaces and default to Implantação
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _impl uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, active_workspace_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    (SELECT id FROM public.workspaces WHERE slug = 'implantacao')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT id, NEW.id, 'member' FROM public.workspaces
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- =========================================================
-- 2. Helper: current_workspace()
-- =========================================================
CREATE OR REPLACE FUNCTION public.current_workspace()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT active_workspace_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = auth.uid() AND workspace_id = _workspace_id);
$$;

-- =========================================================
-- 3. Add workspace_id to all module tables + backfill
-- =========================================================
DO $$
DECLARE
  _impl uuid := (SELECT id FROM public.workspaces WHERE slug = 'implantacao');
BEGIN
  -- Top-level tables
  ALTER TABLE public.trainings                     ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.implementation_schedules      ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.implementation_templates      ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.billing_requests              ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.billing_notification_settings ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.company_notes                 ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);

  -- Child tables
  ALTER TABLE public.training_attachments  ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.training_acceptances  ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.training_reschedules  ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.schedule_phases       ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.schedule_items        ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.schedule_comments     ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.billing_request_updates ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
  ALTER TABLE public.guest_acceptances     ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);

  -- Backfill: everything to Implantação. Keep global templates without a workspace.
  UPDATE public.trainings                     SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.implementation_schedules      SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.implementation_templates      SET workspace_id = _impl WHERE workspace_id IS NULL AND is_global = false;
  UPDATE public.billing_requests              SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.billing_notification_settings SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.company_notes                 SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.training_attachments          SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.training_acceptances          SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.training_reschedules          SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.schedule_phases               SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.schedule_items                SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.schedule_comments             SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.billing_request_updates       SET workspace_id = _impl WHERE workspace_id IS NULL;
  UPDATE public.guest_acceptances             SET workspace_id = _impl WHERE workspace_id IS NULL;

  -- NOT NULL on every table that received a workspace
  ALTER TABLE public.trainings                     ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.implementation_schedules      ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.billing_requests              ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.billing_notification_settings ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.company_notes                 ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.training_attachments          ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.training_acceptances          ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.training_reschedules          ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.schedule_phases               ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.schedule_items                ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.schedule_comments             ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.billing_request_updates       ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE public.guest_acceptances             ALTER COLUMN workspace_id SET NOT NULL;
  -- implementation_templates stays nullable to allow global templates
END $$;

-- =========================================================
-- 4. Triggers to auto-fill workspace_id
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_workspace_id_from_current()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := public.current_workspace();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_from_training()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.trainings WHERE id = NEW.training_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_from_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.implementation_schedules WHERE id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_from_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.schedule_phases WHERE id = NEW.phase_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_from_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.schedule_items WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_from_billing_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.billing_requests WHERE id = NEW.request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Top-level
CREATE TRIGGER set_ws_trainings                     BEFORE INSERT ON public.trainings                     FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_current();
CREATE TRIGGER set_ws_implementation_schedules      BEFORE INSERT ON public.implementation_schedules      FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_current();
CREATE TRIGGER set_ws_implementation_templates      BEFORE INSERT ON public.implementation_templates      FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_current();
CREATE TRIGGER set_ws_billing_requests              BEFORE INSERT ON public.billing_requests              FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_current();
CREATE TRIGGER set_ws_billing_notification_settings BEFORE INSERT ON public.billing_notification_settings FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_current();
CREATE TRIGGER set_ws_company_notes                 BEFORE INSERT ON public.company_notes                 FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_current();

-- Children
CREATE TRIGGER set_ws_training_attachments    BEFORE INSERT ON public.training_attachments    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_training();
CREATE TRIGGER set_ws_training_acceptances    BEFORE INSERT ON public.training_acceptances    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_training();
CREATE TRIGGER set_ws_training_reschedules    BEFORE INSERT ON public.training_reschedules    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_training();
CREATE TRIGGER set_ws_guest_acceptances       BEFORE INSERT ON public.guest_acceptances       FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_training();
CREATE TRIGGER set_ws_schedule_phases         BEFORE INSERT ON public.schedule_phases         FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_schedule();
CREATE TRIGGER set_ws_schedule_items          BEFORE INSERT ON public.schedule_items          FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_phase();
CREATE TRIGGER set_ws_schedule_comments       BEFORE INSERT ON public.schedule_comments       FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_item();
CREATE TRIGGER set_ws_billing_request_updates BEFORE INSERT ON public.billing_request_updates FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_billing_request();

-- =========================================================
-- 5. Restrictive RLS policies enforcing workspace isolation
-- =========================================================
-- For authenticated users, every row access (SELECT/INSERT/UPDATE/DELETE) must match current_workspace().
-- RESTRICTIVE policies AND with existing permissive policies.
-- anon access (guest_acceptances insert via public link) is unaffected.

CREATE POLICY ws_isolation ON public.trainings                     AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.implementation_schedules      AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
-- Templates: allow global (workspace_id IS NULL) to be visible across workspaces.
CREATE POLICY ws_isolation ON public.implementation_templates      AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id IS NULL OR workspace_id = public.current_workspace()) WITH CHECK (workspace_id IS NULL OR workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.billing_requests              AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.billing_notification_settings AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.company_notes                 AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.training_attachments          AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.training_acceptances          AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.training_reschedules          AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.schedule_phases               AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.schedule_items                AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.schedule_comments             AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.billing_request_updates       AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY ws_isolation ON public.guest_acceptances             AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace());

-- Allow users to switch their own active workspace via profiles UPDATE (existing policy already permits it; restrict to memberships)
CREATE OR REPLACE FUNCTION public.validate_active_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.active_workspace_id IS NOT NULL AND NOT public.is_workspace_member(NEW.active_workspace_id) THEN
    RAISE EXCEPTION 'User is not a member of this workspace';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_profile_active_workspace BEFORE UPDATE OF active_workspace_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_active_workspace();
