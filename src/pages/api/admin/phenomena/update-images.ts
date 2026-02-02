/**
 * Update Phenomena Images API
 *
 * Updates phenomena with public domain image URLs.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import phenomenaImages from '@/data/phenomena-images.json';

const ADMIN_EMAIL = 'williamschaseh@gmail.com';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getAuthenticatedUser(req: NextApiRequest): Promise<{ id: string; email: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email || '' };
    }
  }

  const cookies = req.headers.cookie || '';
  const accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (accessTokenMatch) {
    try {
      const tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
      if (tokenData?.access_token) {
        const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
        });
        const { data: { user } } = await supabaseWithToken.auth.getUser();
        if (user) {
          return { id: user.id, email: user.email || '' };
        }
      }
    } catch (e) { /* ignore */ }
  }

  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const { dryRun = false } = req.body;

  try {
    const results = {
      updated: 0,
      skipped: 0,
      categoryDefaults: 0,
      details: [] as { slug: string; status: string; image?: string }[]
    };

    // Get all phenomena
    const { data: phenomena } = await supabase
      .from('phenomena')
      .select('id, slug, category, primary_image_url')
      .eq('status', 'active');

    if (!phenomena) {
      return res.status(200).json({ success: true, results });
    }

    // Create lookup map from image data
    const imageMap = new Map(
      phenomenaImages.images.map(img => [img.slug, img])
    );
    const categoryDefaults = phenomenaImages.category_defaults as Record<string, string>;

    for (const phenomenon of phenomena) {
      // Check if already has an image
      if (phenomenon.primary_image_url) {
        results.skipped++;
        results.details.push({ slug: phenomenon.slug, status: 'already_has_image' });
        continue;
      }

      // Try to find specific image
      const specificImage = imageMap.get(phenomenon.slug);
      if (specificImage) {
        if (!dryRun) {
          await supabase
            .from('phenomena')
            .update({ primary_image_url: specificImage.image_url })
            .eq('id', phenomenon.id);
        }
        results.updated++;
        results.details.push({
          slug: phenomenon.slug,
          status: 'updated_specific',
          image: specificImage.image_url
        });
        continue;
      }

      // Use category default
      const defaultImage = categoryDefaults[phenomenon.category];
      if (defaultImage) {
        if (!dryRun) {
          await supabase
            .from('phenomena')
            .update({ primary_image_url: defaultImage })
            .eq('id', phenomenon.id);
        }
        results.categoryDefaults++;
        results.details.push({
          slug: phenomenon.slug,
          status: 'updated_category_default',
          image: defaultImage
        });
      } else {
        results.skipped++;
        results.details.push({ slug: phenomenon.slug, status: 'no_image_available' });
      }
    }

    return res.status(200).json({
      success: true,
      dryRun,
      results
    });

  } catch (error) {
    console.error('[UpdateImages] Error:', error);
    return res.status(500).json({
      error: 'Failed to update images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
