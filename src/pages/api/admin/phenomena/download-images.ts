/**
 * Download and Self-Host Phenomena Images API
 *
 * Downloads images from Wikimedia Commons and stores them in Supabase Storage.
 * This ensures images won't break if external URLs change.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'williamschaseh@gmail.com';
const BUCKET_NAME = 'phenomena-images';

// Verified working Wikimedia Commons image URLs with their phenomena mappings
const WIKIMEDIA_IMAGES: Record<string, { url: string; credit: string; searchTerms?: string[] }> = {
  // Cryptids
  'bigfoot': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Sasquatch.svg/500px-Sasquatch.svg.png',
    credit: 'Sasquatch silhouette - CC BY-SA 4.0'
  },
  'sasquatch': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Sasquatch.svg/500px-Sasquatch.svg.png',
    credit: 'Sasquatch silhouette - CC BY-SA 4.0'
  },
  'mothman': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Mothman_Artist%27s_impression.png/440px-Mothman_Artist%27s_impression.png',
    credit: "Mothman artist's impression - CC BY-SA 4.0",
    searchTerms: ['mothman']
  },
  'loch-ness-monster': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Plesiosaur_2_%28PSF%29.png/640px-Plesiosaur_2_%28PSF%29.png',
    credit: 'Plesiosaur illustration - Public Domain'
  },
  'chupacabra': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Chupacabra_%28Roswell%2C_NM%29.jpg/440px-Chupacabra_%28Roswell%2C_NM%29.jpg',
    credit: 'Chupacabra statue, Roswell - CC BY-SA 4.0'
  },
  'jersey-devil': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Jersey_Devil.svg/350px-Jersey_Devil.svg.png',
    credit: 'Jersey Devil illustration - Public Domain'
  },
  'yeti': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Sasquatch.svg/500px-Sasquatch.svg.png',
    credit: 'Yeti silhouette - CC BY-SA 4.0'
  },
  'wendigo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Wendigo_1.svg/360px-Wendigo_1.svg.png',
    credit: 'Wendigo illustration - CC BY-SA 4.0'
  },
  'dogman': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Werewolf by Lucas Cranach - Public Domain'
  },
  'skinwalker': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Shape-shifter illustration - Public Domain'
  },

  // UFOs & Aliens
  'flying-saucer': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Above_Black_-_UFO_illustration.jpg/640px-Above_Black_-_UFO_illustration.jpg',
    credit: 'UFO illustration - Public Domain'
  },
  'black-triangle-ufo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/TR-3B_render_illustration.jpg/640px-TR-3B_render_illustration.jpg',
    credit: 'Triangle UFO render - CC BY-SA 4.0'
  },
  'grey-alien': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Iconic_Grey_Alien.svg/400px-Iconic_Grey_Alien.svg.png',
    credit: 'Grey alien icon - CC BY-SA 4.0'
  },
  'alien-abduction': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Iconic_Grey_Alien.svg/400px-Iconic_Grey_Alien.svg.png',
    credit: 'Alien illustration - CC BY-SA 4.0'
  },
  'ufo-lights': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Above_Black_-_UFO_illustration.jpg/640px-Above_Black_-_UFO_illustration.jpg',
    credit: 'UFO lights illustration - Public Domain'
  },
  'orb-ufo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Foo_fighter.jpg/440px-Foo_fighter.jpg',
    credit: 'Orb UFO - Public Domain'
  },
  'cigar-shaped-ufo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Above_Black_-_UFO_illustration.jpg/640px-Above_Black_-_UFO_illustration.jpg',
    credit: 'UFO illustration - Public Domain'
  },

  // Ghosts & Hauntings
  'apparition': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Ghost-159356.svg/400px-Ghost-159356.svg.png',
    credit: 'Ghost silhouette - Public Domain'
  },
  'poltergeist': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Ghost-159356.svg/400px-Ghost-159356.svg.png',
    credit: 'Poltergeist illustration - Public Domain'
  },
  'shadow-person': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Shadow_person.svg/320px-Shadow_person.svg.png',
    credit: 'Shadow person - Public Domain'
  },
  'residual-haunting': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Ghost-159356.svg/400px-Ghost-159356.svg.png',
    credit: 'Ghost illustration - Public Domain'
  },
  'intelligent-haunting': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Ghost-159356.svg/400px-Ghost-159356.svg.png',
    credit: 'Ghost illustration - Public Domain'
  },
  'demonic-haunting': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Buer.jpg/440px-Buer.jpg',
    credit: 'Demon illustration - Public Domain'
  },
  'banshee': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Ghost-159356.svg/400px-Ghost-159356.svg.png',
    credit: 'Banshee illustration - Public Domain'
  },

  // Psychic Phenomena
  'telepathy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Brain_icon_%28the_Noun_Project_6616%29.svg/480px-Brain_icon_%28the_Noun_Project_6616%29.svg.png',
    credit: 'Brain icon - CC BY 3.0'
  },
  'precognition': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Brain_icon_%28the_Noun_Project_6616%29.svg/480px-Brain_icon_%28the_Noun_Project_6616%29.svg.png',
    credit: 'Brain icon - CC BY 3.0'
  },
  'clairvoyance': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Eye_of_Providence.svg/480px-Eye_of_Providence.svg.png',
    credit: 'Eye of Providence - Public Domain'
  },
  'psychokinesis': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Brain_icon_%28the_Noun_Project_6616%29.svg/480px-Brain_icon_%28the_Noun_Project_6616%29.svg.png',
    credit: 'Brain icon - CC BY 3.0'
  },
  'remote-viewing': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Eye_of_Providence.svg/480px-Eye_of_Providence.svg.png',
    credit: 'Eye of Providence - Public Domain'
  },
  'automatic-writing': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Writing.svg/480px-Writing.svg.png',
    credit: 'Writing icon - Public Domain'
  },

  // Psychological Experiences
  'sleep-paralysis': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli - Public Domain'
  },
  'out-of-body-experience': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Brain_icon_%28the_Noun_Project_6616%29.svg/480px-Brain_icon_%28the_Noun_Project_6616%29.svg.png',
    credit: 'Brain icon - CC BY 3.0'
  },
  'near-death-experience': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Ascent of the Blessed by Bosch - Public Domain'
  },
  'lucid-dreaming': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli - Public Domain'
  },

  // Other phenomena
  'ball-lightning': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Ball_lightning.png/440px-Ball_lightning.png',
    credit: 'Ball lightning illustration - CC BY-SA 3.0'
  },
  'crop-circles': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Crop_circles_Swirl.jpg/640px-Crop_circles_Swirl.jpg',
    credit: 'Crop circle - CC BY 2.0'
  },
  'men-in-black': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Iconic_Grey_Alien.svg/400px-Iconic_Grey_Alien.svg.png',
    credit: 'MIB illustration - CC BY-SA 4.0'
  },
  'time-slip': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Pocket_watch.svg/400px-Pocket_watch.svg.png',
    credit: 'Time illustration - Public Domain'
  },
};

// Category default images - verified working full-resolution URLs
const CATEGORY_DEFAULTS: Record<string, { url: string; credit: string }> = {
  'cryptids': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/18/Sasquatch.svg',
    credit: 'Cryptid silhouette - CC BY-SA 4.0'
  },
  'ufos_aliens': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Passaic UFO photo, 1952 - Public Domain'
  },
  'ghosts_hauntings': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli, 1781 - Public Domain'
  },
  'psychic_phenomena': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli, 1781 - Public Domain'
  },
  'psychological_experiences': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli, 1781 - Public Domain'
  }
};

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

async function downloadAndUploadImage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  imageUrl: string,
  slug: string
): Promise<string | null> {
  try {
    // Fetch the image from Wikimedia
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Paradocs/1.0 (https://discoverparadocs.com; contact@discoverparadocs.com)'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch image for ${slug}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine file extension
    let ext = 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (contentType.includes('svg')) ext = 'svg';
    else if (contentType.includes('gif')) ext = 'gif';
    else if (contentType.includes('webp')) ext = 'webp';

    const fileName = `${slug}.${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType,
        upsert: true, // Overwrite if exists
        cacheControl: '31536000' // Cache for 1 year
      });

    if (error) {
      console.error(`Failed to upload image for ${slug}:`, error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error(`Error processing image for ${slug}:`, error);
    return null;
  }
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
  const { dryRun = false, slugs = [], limit = 5 } = req.body; // Default limit of 5 to avoid timeout

  try {
    // Get phenomena that need images (no supabase URL yet)
    const { data: phenomena, error: fetchError } = await supabase
      .from('phenomena')
      .select('id, slug, name, category, primary_image_url')
      .eq('status', 'active');

    if (fetchError || !phenomena) {
      return res.status(500).json({ error: 'Failed to fetch phenomena', details: fetchError?.message });
    }

    // Filter by slugs if provided, otherwise get those without self-hosted images
    let toProcess = slugs.length > 0
      ? phenomena.filter(p => slugs.includes(p.slug))
      : phenomena.filter(p => !p.primary_image_url?.includes('supabase'));

    // Apply limit to avoid timeout
    const totalNeedingImages = toProcess.length;
    toProcess = toProcess.slice(0, limit);

    const results = {
      totalNeedingImages,
      batchSize: toProcess.length,
      processed: 0,
      uploaded: 0,
      skipped: 0,
      failed: 0,
      details: [] as { slug: string; status: string; url?: string; error?: string }[]
    };

    for (const phenomenon of toProcess) {
      results.processed++;

      // Find image URL - first check specific, then category default
      let imageData = WIKIMEDIA_IMAGES[phenomenon.slug];
      if (!imageData) {
        imageData = CATEGORY_DEFAULTS[phenomenon.category];
      }

      if (!imageData) {
        results.skipped++;
        results.details.push({ slug: phenomenon.slug, status: 'no_image_mapping' });
        continue;
      }

      if (dryRun) {
        results.uploaded++;
        results.details.push({
          slug: phenomenon.slug,
          status: 'would_upload',
          url: imageData.url
        });
        continue;
      }

      // Download and upload the image
      const selfHostedUrl = await downloadAndUploadImage(supabase, imageData.url, phenomenon.slug);

      if (selfHostedUrl) {
        // Update the database
        const { error: updateError } = await supabase
          .from('phenomena')
          .update({
            primary_image_url: selfHostedUrl
          })
          .eq('id', phenomenon.id);

        if (updateError) {
          results.failed++;
          results.details.push({
            slug: phenomenon.slug,
            status: 'db_update_failed',
            error: updateError.message
          });
        } else {
          results.uploaded++;
          results.details.push({
            slug: phenomenon.slug,
            status: 'uploaded',
            url: selfHostedUrl
          });
        }
      } else {
        results.failed++;
        results.details.push({
          slug: phenomenon.slug,
          status: 'download_failed',
          url: imageData.url
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return res.status(200).json({
      success: true,
      dryRun,
      results
    });

  } catch (error) {
    console.error('[DownloadImages] Error:', error);
    return res.status(500).json({
      error: 'Failed to process images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
