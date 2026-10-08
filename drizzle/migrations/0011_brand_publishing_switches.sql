CREATE TABLE IF NOT EXISTS public.brand_publishing (
  user_id uuid NOT NULL,
  brand_slug text NOT NULL,
  platforms text[] NOT NULL DEFAULT '{}'::text[],
  enabled boolean NOT NULL DEFAULT false,
  test_confirmed_at timestamptz,
  enabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, brand_slug),
  CONSTRAINT brand_publishing_platforms_valid CHECK (platforms <@ ARRAY['instagram','facebook']::text[])
);
GRANT SELECT ON public.brand_publishing TO authenticated;
GRANT ALL ON public.brand_publishing TO service_role;
ALTER TABLE public.brand_publishing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON public.brand_publishing FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.brand_publishing (user_id, brand_slug, platforms, enabled, enabled_at)
SELECT s.user_id, 'skyline', ARRAY['instagram','facebook'], true, now() FROM public.settings s
ON CONFLICT DO NOTHING;
INSERT INTO public.brand_publishing (user_id, brand_slug, platforms, enabled)
SELECT s.user_id, 'lidverk', ARRAY['facebook'], false FROM public.settings s
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.brand_platform_enabled(_user uuid, _brand text, _platform text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.brand_publishing bp
    WHERE bp.user_id = _user AND bp.brand_slug = _brand AND bp.enabled AND _platform = ANY (bp.platforms)
      AND (_brand = 'skyline' OR EXISTS (
        SELECT 1 FROM public.meta_connection m WHERE m.user_id = _user AND m.brand_slug = _brand AND m.status = 'connected')));
$$;
REVOKE EXECUTE ON FUNCTION public.brand_platform_enabled(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_publications()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND NOT NEW.skipped THEN
    INSERT INTO public.publications (user_id, asset_id, platform)
      SELECT NEW.user_id, NEW.id, pl FROM unnest(ARRAY['instagram','facebook']) pl
      WHERE public.brand_platform_enabled(NEW.user_id, NEW.brand_slug, pl)
      ON CONFLICT (asset_id, platform) DO NOTHING;
    IF TG_OP = 'UPDATE' AND NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
      UPDATE public.publications SET status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = NULL,
        container_id = NULL, intent_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = now()
      WHERE asset_id = NEW.id AND status IN ('pending','retry','skipped','missed') AND remote_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_publications(_owner text, _limit integer)
 RETURNS SETOF publications LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  return query
  update public.publications p set lease_owner = _owner, lease_until = now() + interval '4 minutes', updated_at = now()
  where p.id in (
    select p2.id from public.publications p2
    join public.assets a on a.id = p2.asset_id
    join public.settings s on s.user_id = p2.user_id
    where s.publishing_active and not a.skipped and a.approved
      and public.brand_platform_enabled(a.user_id, a.brand_slug, p2.platform)
      and p2.status in ('pending','processing','retry')
      and a.scheduled_at <= now()
      and a.scheduled_at > now() - interval '3 hours'
      and (p2.next_attempt_at is null or p2.next_attempt_at <= now())
      and (p2.lease_until is null or p2.lease_until < now())
    order by a.scheduled_at limit _limit
    for update of p2 skip locked)
  returning p.*;
end $function$;

CREATE OR REPLACE FUNCTION public.mark_missed_publications()
 RETURNS TABLE(user_id uuid, asset_id uuid, file_name text, scheduled_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.publications p SET status = 'missed', lease_owner = NULL, lease_until = NULL,
    last_error = 'Not posted within 3 hours of its slot; never sent late', updated_at = now()
  FROM public.assets a
  WHERE a.id = p.asset_id AND p.status IN ('pending','retry') AND p.remote_id IS NULL
    AND a.scheduled_at < now() - interval '3 hours'
    AND (p.lease_until IS NULL OR p.lease_until < now())
    AND public.brand_platform_enabled(a.user_id, a.brand_slug, p.platform)
  RETURNING p.user_id, p.asset_id, a.file_name, a.scheduled_at;
END $function$;

DROP FUNCTION IF EXISTS public.brand_can_publish(uuid, text);