ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS brand_slug text NOT NULL DEFAULT 'skyline',
  ADD COLUMN IF NOT EXISTS bucket text,
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS source_group text,
  ADD COLUMN IF NOT EXISTS hooks text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS style_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS classification_source text;
CREATE INDEX IF NOT EXISTS assets_brand_idx ON public.assets(user_id, brand_slug);

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS active_brand text NOT NULL DEFAULT 'skyline';

CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  slug text NOT NULL,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'nb',
  voice text,
  focus text,
  verified_offers text,
  strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);
GRANT SELECT, INSERT, UPDATE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all" ON public.brands FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  brand_slug text NOT NULL DEFAULT 'skyline',
  source_asset_id uuid NOT NULL REFERENCES public.assets(id),
  hook text NOT NULL,
  brief text NOT NULL,
  caption_draft text,
  objective text,
  bucket text,
  generator text NOT NULL DEFAULT 'template',
  status text NOT NULL DEFAULT 'draft',
  render_job_id uuid REFERENCES public.render_jobs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_drafts TO authenticated;
GRANT ALL ON public.content_drafts TO service_role;
ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all" ON public.content_drafts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  brand_slug text NOT NULL DEFAULT 'skyline',
  platform text NOT NULL CHECK (platform IN ('instagram','facebook')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  hours_since_publish integer,
  reach numeric, views numeric, saves numeric, shares numeric,
  profile_actions numeric, clicks numeric, inquiries numeric,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv','meta_api')),
  unavailable text[] NOT NULL DEFAULT '{}',
  note text
);
CREATE INDEX metric_snapshots_asset_idx ON public.metric_snapshots(user_id, asset_id, platform, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_snapshots TO authenticated;
GRANT ALL ON public.metric_snapshots TO service_role;
ALTER TABLE public.metric_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON public.metric_snapshots FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner manual insert" ON public.metric_snapshots FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND source IN ('manual','csv'));
CREATE POLICY "owner manual update" ON public.metric_snapshots FOR UPDATE TO authenticated USING (user_id = auth.uid() AND source IN ('manual','csv')) WITH CHECK (user_id = auth.uid() AND source IN ('manual','csv'));
CREATE POLICY "owner manual delete" ON public.metric_snapshots FOR DELETE TO authenticated USING (user_id = auth.uid() AND source IN ('manual','csv'));

CREATE TABLE public.strategy_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  brand_slug text NOT NULL,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  reason text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.strategy_changes TO authenticated;
GRANT ALL ON public.strategy_changes TO service_role;
ALTER TABLE public.strategy_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON public.strategy_changes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner insert" ON public.strategy_changes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());