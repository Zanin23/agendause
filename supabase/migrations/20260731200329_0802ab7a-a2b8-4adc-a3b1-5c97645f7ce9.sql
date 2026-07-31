DROP POLICY IF EXISTS "Authenticated can read note attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read training attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload training attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete training attachments" ON storage.objects;

CREATE POLICY "ws note attachments read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'note-attachments'
  AND EXISTS (
    SELECT 1 FROM public.note_attachments na
    WHERE na.storage_path = storage.objects.name
      AND na.workspace_id = current_workspace()
  )
);

CREATE POLICY "ws training attachments read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'training-attachments'
  AND EXISTS (
    SELECT 1 FROM public.training_attachments ta
    WHERE ta.storage_path = storage.objects.name
      AND ta.workspace_id = current_workspace()
  )
);

CREATE POLICY "ws training attachments upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'training-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "ws training attachments delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'training-attachments'
  AND EXISTS (
    SELECT 1 FROM public.training_attachments ta
    WHERE ta.storage_path = storage.objects.name
      AND ta.workspace_id = current_workspace()
  )
);