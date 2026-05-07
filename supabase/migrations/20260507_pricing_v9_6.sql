-- =====================================================================
-- V9.6 T1.2 — pricing tier update.
--
-- Free:  $0/mo
-- Basic: $5.99/mo
-- Pro:   $14.99/mo
-- Enterprise: kept in the table but admin-only, never shown to users.
--   The API at /api/subscription/tiers and the /account/subscription
--   page both filter `name = 'enterprise'` out of the visible tier
--   list, so this row exists only for internal tier overrides via
--   the admin tools.
-- =====================================================================

UPDATE subscription_tiers
SET price_monthly = 0,
    price_yearly  = 0,
    sort_order    = 1
WHERE name = 'free';

UPDATE subscription_tiers
SET price_monthly = 5.99,
    -- ~17% off vs monthly × 12 ($5.99 × 12 = $71.88, rounded down)
    price_yearly  = 59.99,
    sort_order    = 2
WHERE name = 'basic';

UPDATE subscription_tiers
SET price_monthly = 14.99,
    -- ~17% off vs monthly × 12 ($14.99 × 12 = $179.88, rounded down)
    price_yearly  = 149.99,
    sort_order    = 3
WHERE name = 'pro';

-- Enterprise stays at whatever it was; not shown publicly.
UPDATE subscription_tiers
SET sort_order = 99
WHERE name = 'enterprise';
