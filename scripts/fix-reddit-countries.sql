-- Fix country field for Reddit imports
-- Run this in Supabase SQL Editor when maintenance is complete

-- First, clear the hardcoded 'United States' from all Reddit posts
-- that don't have explicit location data supporting it
UPDATE reports
SET country = NULL
WHERE source_type = 'reddit'
  AND country = 'United States'
  AND location_name IS NULL;

-- Set country based on text patterns in description
-- United States
UPDATE reports
SET country = 'United States'
WHERE source_type = 'reddit'
  AND country IS NULL
  AND (
    description ~* '\b(USA|US|United States|America)\b'
    OR description ~* '\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY),?\s'
  );

-- Canada
UPDATE reports
SET country = 'Canada'
WHERE source_type = 'reddit'
  AND country IS NULL
  AND description ~* '\bCanada\b';

-- United Kingdom
UPDATE reports
SET country = 'United Kingdom'
WHERE source_type = 'reddit'
  AND country IS NULL
  AND description ~* '\b(UK|United Kingdom|Britain|England|Scotland|Wales)\b';

-- Australia
UPDATE reports
SET country = 'Australia'
WHERE source_type = 'reddit'
  AND country IS NULL
  AND description ~* '\bAustralia\b';

-- Verify the fix
SELECT country, COUNT(*) as count
FROM reports
WHERE source_type = 'reddit'
GROUP BY country
ORDER BY count DESC;
