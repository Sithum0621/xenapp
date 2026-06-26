ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status text;

UPDATE public.profiles
SET
  trial_ends_at = COALESCE(trial_ends_at, now() + interval '30 days'),
  subscription_status = COALESCE(subscription_status, 'trial');

ALTER TABLE public.profiles
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '30 days'),
  ALTER COLUMN trial_ends_at SET NOT NULL,
  ALTER COLUMN subscription_status SET DEFAULT 'trial',
  ALTER COLUMN subscription_status SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled'));
