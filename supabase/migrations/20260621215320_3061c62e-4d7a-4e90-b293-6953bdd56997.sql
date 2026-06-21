CREATE POLICY "Authenticated read training attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'training-attachments');

CREATE POLICY "Authenticated upload training attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'training-attachments');

CREATE POLICY "Authenticated delete training attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'training-attachments');
