-- Storage bucket público para logos das organizações
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas: leitura pública, upload/update/delete só para admins da org dona do logo.
-- O ficheiro é armazenado em: {organization_id}/logo.{ext}
CREATE POLICY "org_logos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'org-logos');

CREATE POLICY "org_logos_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'org-logos'
  AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "org_logos_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'org-logos'
  AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "org_logos_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'org-logos'
  AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
);