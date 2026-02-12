import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'williamschaseh@gmail.com';
const MEDIA_BUCKET = 'report-media';

async function getAuthenticatedUser(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

// Accepts base64 image data from browser and uploads to Supabase Storage
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { imageData, storageName, contentType } = req.body;
  if (!imageData || !storageName) {
    return res.status(400).json({ error: 'Missing imageData or storageName' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some(b => b.name === MEDIA_BUCKET)) {
      await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
    }

    // Decode base64 and upload
    const buffer = Buffer.from(imageData, 'base64');
    const storagePath = `showcase/${storageName}`;

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, buffer, {
        contentType: contentType || 'image/jpeg',
        upsert: true,
        cacheControl: '31536000',
      });

    if (error) {
      return res.status(500).json({ error: 'Upload failed', details: error.message });
    }

    const { data: { publicUrl } } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(storagePath);

    return res.status(200).json({ success: true, publicUrl, storageName });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
