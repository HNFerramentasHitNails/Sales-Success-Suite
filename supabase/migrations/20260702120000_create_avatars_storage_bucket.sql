-- O bucket "avatars" nunca tinha sido criado apesar das políticas de RLS em
-- storage.objects (avatars_public_read/avatars_user_insert/update/delete) já
-- existirem — por isso o upload de foto de perfil falhava com "Bucket not found".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 5242880, ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;
