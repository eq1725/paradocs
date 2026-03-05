/**
 * Bulk Import Media API
 *
 * Imports media items (videos, images) into the phenomena_media table.
 * Supports YouTube video auto-detection with thumbnail extraction.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var ADMIN_EMAIL = 'williamschaseh@gmail.com';

// Valid media types
var VALID_MEDIA_TYPES = ['video', 'image', 'audio', 'document'];

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getAuthenticatedUser(req: NextApiRequest): Promise<{ id: string; email: string } | null> {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;