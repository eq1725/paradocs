-- Cleanup Script: Remove Low-Quality and Inappropriate Reports
-- Run this manually in Supabase SQL Editor after reviewing the identified reports
-- Created: Phase 1 of Quality Enhancement

-- ============================================================================
-- STEP 1: PREVIEW - Identify reports to be deleted (DO NOT DELETE YET)
-- ============================================================================

-- Create a temp view to see what will be deleted
-- Run each query separately to review before deletion

-- 1A. Self-promotion posts (YouTube channels, podcasts, etc.)
SELECT id, title, description, source_type, created_at
FROM reports
WHERE (
  -- YouTube/channel self-promotion
  title ~* '\b(i started a|check out my|subscribe to my|my new|just started a|just launched) (youtube|channel|podcast|blog|website|series)\b'
  OR title ~* '\b(new (youtube )?channel|my (youtube )?channel|started a (youtube )?channel)\b'
  OR title ~* '\b(please subscribe|hit subscribe|smash.{0,10}subscribe|like and subscribe)\b'
  OR description ~* '\b(i started a|check out my|subscribe to my|my new|just started a|just launched) (youtube|channel|podcast|blog|website|series)\b'
  OR description ~* '\b(please subscribe|hit subscribe|smash.{0,10}subscribe|like and subscribe)\b'
  -- YouTube URLs
  OR description ~* 'youtube\.com/(channel|c|user|@)'
  OR description ~* 'youtu\.be'
);

-- 1B. Poll/hypothetical posts (not real experiences)
SELECT id, title, description, source_type, created_at
FROM reports
WHERE (
  title ~* '\b(which (one )?would you|would you rather|if you could|would you want to be)\b'
  OR title ~* '\b(vote|poll|survey|choose one|pick one)\b'
  OR title ~* '\b(reincarnated as|come back as|be turned into)\b'
  OR title ~* '\b(favorite|best|worst|scariest|creepiest) (cryptid|creature|ghost|ufo|alien)\?'
  OR title ~* '\b(unpopular opinion|hot take|change my mind)\b'
);

-- 1C. Art/merchandise posts
SELECT id, title, description, source_type, created_at
FROM reports
WHERE (
  title ~* '\b(i (made|drew|painted|created|designed|crafted|stitched|knitted|crocheted))\b'
  OR title ~* '\b(my (art|artwork|drawing|painting|sketch|illustration|design|craft|creation))\b'
  OR title ~* '\b(for sale|buy now|shop|store|etsy|redbubble|teepublic)\b'
  OR title ~* '\b(merch|merchandise|t-shirt|shirt|poster|sticker|mug|print)\b'
  OR description ~* 'etsy\.com|redbubble\.com|teepublic\.com'
);

-- 1D. Meta posts (asking for stories, not sharing experiences)
SELECT id, title, description, source_type, created_at
FROM reports
WHERE (
  title ~* '\b(share your|tell me about|tell us about|what''s your|what are your)\b'
  OR title ~* '\b(looking for|searching for|collecting) (stories|experiences|accounts)\b'
  OR title ~* '\b(anyone have|does anyone have|has anyone had|who has had)\b'
  OR title ~* '\b(for my (book|podcast|channel|video|documentary|research|project))\b'
);

-- 1E. Fiction/creative writing
SELECT id, title, description, source_type, created_at
FROM reports
WHERE (
  title ~* '\b(creative writing|fiction|short story|writing prompt)\b'
  OR title ~* '\b(nosleep|creepypasta)\b'
  OR title ~* '\b(part \d+|chapter \d+|continued from)\b'
  OR description ~* '\bnosleep\b'
);

-- 1F. Spam URL content
SELECT id, title, description, source_type, created_at
FROM reports
WHERE (
  description ~* 'patreon\.com|ko-fi\.com|buymeacoffee\.com|gumroad\.com'
  OR description ~* 'linktr\.ee|onlyfans\.com'
  OR description ~* 'discord\.gg|t\.me/'
  OR description ~* 'kickstarter\.com|indiegogo\.com|gofundme\.com'
  OR description ~* 'tiktok\.com/@'
);

-- 1G. Extremely short content that slipped through
SELECT id, title, description, source_type, created_at
FROM reports
WHERE LENGTH(description) < 100
AND source_type = 'reddit';

-- ============================================================================
-- STEP 2: COUNT - See how many reports will be affected
-- ============================================================================

SELECT 'Self-promotion' as type, COUNT(*) as count FROM reports
WHERE title ~* '\b(i started a|check out my|subscribe to my) (youtube|channel|podcast|blog|website|series)\b'
   OR description ~* 'youtube\.com/(channel|c|user|@)'
UNION ALL
SELECT 'Polls/Hypotheticals' as type, COUNT(*) as count FROM reports
WHERE title ~* '\b(which (one )?would you|would you rather|vote|poll|survey|choose one|reincarnated as)\b'
UNION ALL
SELECT 'Art/Merchandise' as type, COUNT(*) as count FROM reports
WHERE title ~* '\b(i (made|drew|painted|created))\b'
   OR title ~* '\b(my (art|artwork|drawing|painting))\b'
   OR description ~* 'etsy\.com|redbubble\.com'
UNION ALL
SELECT 'Meta posts' as type, COUNT(*) as count FROM reports
WHERE title ~* '\b(share your|tell me about|tell us about)\b'
   OR title ~* '\b(for my (book|podcast|channel|video))\b'
UNION ALL
SELECT 'Fiction' as type, COUNT(*) as count FROM reports
WHERE title ~* '\b(nosleep|creepypasta|creative writing)\b'
UNION ALL
SELECT 'Spam URLs' as type, COUNT(*) as count FROM reports
WHERE description ~* 'patreon\.com|ko-fi\.com|discord\.gg|linktr\.ee'
UNION ALL
SELECT 'Very short (<100 chars)' as type, COUNT(*) as count FROM reports
WHERE LENGTH(description) < 100 AND source_type = 'reddit';

-- ============================================================================
-- STEP 3: DELETE - Execute deletions (RUN ONLY AFTER REVIEWING STEP 1 & 2!)
-- ============================================================================

-- UNCOMMENT AND RUN THESE ONE AT A TIME AFTER REVIEWING

/*
-- Delete self-promotion posts
DELETE FROM reports
WHERE (
  title ~* '\b(i started a|check out my|subscribe to my|my new|just started a|just launched) (youtube|channel|podcast|blog|website|series)\b'
  OR title ~* '\b(new (youtube )?channel|my (youtube )?channel|started a (youtube )?channel)\b'
  OR title ~* '\b(please subscribe|hit subscribe|smash.{0,10}subscribe|like and subscribe)\b'
  OR description ~* '\b(i started a|check out my|subscribe to my|my new|just started a|just launched) (youtube|channel|podcast|blog|website|series)\b'
  OR description ~* '\b(please subscribe|hit subscribe|smash.{0,10}subscribe|like and subscribe)\b'
  OR description ~* 'youtube\.com/(channel|c|user|@)'
  OR description ~* 'youtu\.be'
);

-- Delete poll/hypothetical posts
DELETE FROM reports
WHERE (
  title ~* '\b(which (one )?would you|would you rather|if you could|would you want to be)\b'
  OR title ~* '\b(vote|poll|survey|choose one|pick one)\b'
  OR title ~* '\b(reincarnated as|come back as|be turned into)\b'
  OR title ~* '\b(favorite|best|worst|scariest|creepiest) (cryptid|creature|ghost|ufo|alien)\?'
  OR title ~* '\b(unpopular opinion|hot take|change my mind)\b'
);

-- Delete art/merchandise posts
DELETE FROM reports
WHERE (
  title ~* '\b(i (made|drew|painted|created|designed|crafted|stitched|knitted|crocheted))\b'
  OR title ~* '\b(my (art|artwork|drawing|painting|sketch|illustration|design|craft|creation))\b'
  OR title ~* '\b(for sale|buy now|shop|store|etsy|redbubble|teepublic)\b'
  OR title ~* '\b(merch|merchandise|t-shirt|shirt|poster|sticker|mug|print)\b'
  OR description ~* 'etsy\.com|redbubble\.com|teepublic\.com'
);

-- Delete meta posts
DELETE FROM reports
WHERE (
  title ~* '\b(share your|tell me about|tell us about|what''s your|what are your)\b'
  OR title ~* '\b(looking for|searching for|collecting) (stories|experiences|accounts)\b'
  OR title ~* '\b(anyone have|does anyone have|has anyone had|who has had)\b'
  OR title ~* '\b(for my (book|podcast|channel|video|documentary|research|project))\b'
);

-- Delete fiction/creative writing
DELETE FROM reports
WHERE (
  title ~* '\b(creative writing|fiction|short story|writing prompt)\b'
  OR title ~* '\b(nosleep|creepypasta)\b'
  OR title ~* '\b(part \d+|chapter \d+|continued from)\b'
  OR description ~* '\bnosleep\b'
);

-- Delete spam URL posts
DELETE FROM reports
WHERE (
  description ~* 'patreon\.com|ko-fi\.com|buymeacoffee\.com|gumroad\.com'
  OR description ~* 'linktr\.ee|onlyfans\.com'
  OR description ~* 'discord\.gg|t\.me/'
  OR description ~* 'kickstarter\.com|indiegogo\.com|gofundme\.com'
  OR description ~* 'tiktok\.com/@'
);

-- Delete very short Reddit posts
DELETE FROM reports
WHERE LENGTH(description) < 100
AND source_type = 'reddit';
*/

-- ============================================================================
-- STEP 4: VERIFY - Confirm cleanup was successful
-- ============================================================================

-- After running deletes, verify counts
SELECT source_type, COUNT(*) as count
FROM reports
GROUP BY source_type
ORDER BY count DESC;

-- Check that no bad patterns remain
SELECT COUNT(*) as remaining_bad_posts
FROM reports
WHERE (
  title ~* '\b(subscribe|youtube channel|poll|vote|reincarnated)\b'
  OR description ~* 'youtube\.com/(channel|c|user|@)|patreon\.com|etsy\.com'
);
