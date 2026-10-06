ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS reel_audio_mode text NOT NULL DEFAULT 'trending_clean'
  CHECK (reel_audio_mode IN ('trending','trending_clean','no_music','manual'));
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS audio_mode text
  CHECK (audio_mode IS NULL OR audio_mode IN ('trending','trending_clean','no_music','manual'));
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS finish_in_instagram boolean NOT NULL DEFAULT false;