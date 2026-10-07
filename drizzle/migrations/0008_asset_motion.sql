ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS motion_score numeric,
  ADD COLUMN IF NOT EXISTS motion_label text,
  ADD COLUMN IF NOT EXISTS motion_confidence numeric,
  ADD COLUMN IF NOT EXISTS motion_stats jsonb;