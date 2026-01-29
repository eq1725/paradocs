-- ParaDocs Storage Setup
-- Storage buckets for report media and user avatars

-- Insert storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('report-media', 'report-media', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav']),
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for report-media bucket
-- Anyone can view public media
CREATE POLICY "Public media is viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'report-media');

-- Authenticated users can upload media
CREATE POLICY "Authenticated users can upload report media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'report-media'
  AND auth.role() = 'authenticated'
);

-- Users can update their own uploads
CREATE POLICY "Users can update own report media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'report-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own uploads
CREATE POLICY "Users can delete own report media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'report-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for avatars bucket
-- Anyone can view avatars
CREATE POLICY "Avatars are viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Authenticated users can upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
