
CREATE TABLE public.note_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES public.company_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  workspace_id UUID,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_attachments TO authenticated;
GRANT ALL ON public.note_attachments TO service_role;

ALTER TABLE public.note_attachments ENABLE ROW LEVEL SECURITY;

-- Trigger to autofill workspace_id from parent note
CREATE OR REPLACE FUNCTION public.set_workspace_id_from_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.company_notes WHERE id = NEW.note_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_note_attachment_workspace
BEFORE INSERT ON public.note_attachments
FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_note();

-- RLS: view if member of the workspace
CREATE POLICY "View attachments in workspace"
ON public.note_attachments FOR SELECT TO authenticated
USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));

CREATE POLICY "Insert own attachments"
ON public.note_attachments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Delete own attachments"
ON public.note_attachments FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Storage policies for note-attachments bucket
CREATE POLICY "Authenticated can read note attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'note-attachments');

CREATE POLICY "Authenticated can upload note attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'note-attachments' AND owner = auth.uid());

CREATE POLICY "Owner can delete note attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'note-attachments' AND owner = auth.uid());
