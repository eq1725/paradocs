-- Add stripe_customer_id to profiles for Stripe integration
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Create index for fast lookup by stripe customer ID
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON public.profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
