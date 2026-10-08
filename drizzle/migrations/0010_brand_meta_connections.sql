-- Per-business Meta connections. Existing row stays Skyline's.
ALTER TABLE public.meta_connection ADD COLUMN IF NOT EXISTS brand_slug text NOT NULL DEFAULT 'skyline';
ALTER TABLE public.meta_connection DROP CONSTRAINT IF EXISTS meta_connection_pkey;
ALTER TABLE public.meta_connection ADD CONSTRAINT meta_connection_pkey PRIMARY KEY (user_id, brand_slug);

-- A business posts only once its own Meta accounts are checked and connected (Skyline keeps its existing behaviour).
CREATE OR REPLACE FUNCTION public.brand_can_publish(_user uuid, _brand text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _brand = 'skyline' OR EXISTS (
    SELECT 1 FROM public.meta_connection m WHERE m.user_id = _user AND m.brand_slug = _brand AND m.status = 'connected');
$$;
REVOKE EXECUTE ON FUNCTION public.brand_can_publish(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_publications()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND NOT NEW.skipped AND public.brand_can_publish(NEW.user_id, NEW.brand_slug) THEN
    INSERT INTO public.publications (user_id, asset_id, platform)
      SELECT NEW.user_id, NEW.id, pl FROM unnest(ARRAY['instagram','facebook']) pl
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
      and public.brand_can_publish(a.user_id, a.brand_slug)
      and p2.status in ('pending','processing','retry')
      and a.scheduled_at <= now()
      and a.scheduled_at > now() - interval '3 hours'
      and (p2.next_attempt_at is null or p2.next_attempt_at <= now())
      and (p2.lease_until is null or p2.lease_until < now())
    order by a.scheduled_at limit _limit
    for update of p2 skip locked)
  returning p.*;
end $function$;
