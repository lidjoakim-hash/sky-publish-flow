-- 1. Repair the posting times broken by migration 0002, then validate future saves.
UPDATE public.settings SET post_times = '{09:00,13:00,18:00}', post_time = '09:00', reel_time = '19:00', timezone = 'Europe/Oslo'
WHERE user_id = 'f36c6644-6dad-4b18-9992-2727274e6d9c';

CREATE OR REPLACE FUNCTION public.validate_settings_times()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _t text; _prev text := ''; _reel text := left(NEW.reel_time::text, 5);
BEGIN
  IF NEW.post_times IS NULL OR cardinality(NEW.post_times) = 0 THEN RAISE EXCEPTION 'Add at least one post time'; END IF;
  FOREACH _t IN ARRAY NEW.post_times LOOP
    IF _t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Post time "%" must be HH:MM', _t; END IF;
    IF _t <= _prev THEN RAISE EXCEPTION 'Post times must be different and in order (earliest first)'; END IF;
    IF _t = _reel THEN RAISE EXCEPTION 'Post time % is the same as the Reel time', _t; END IF;
    _prev := _t;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER settings_validate_times BEFORE INSERT OR UPDATE OF post_times, reel_time ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.validate_settings_times();

-- 2. Publication rows follow the schedule (Skyline only), server-side.
CREATE OR REPLACE FUNCTION public.sync_publications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.brand_slug = 'skyline' AND NEW.scheduled_at IS NOT NULL AND NOT NEW.skipped THEN
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
END $$;
REVOKE ALL ON FUNCTION public.sync_publications() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER assets_sync_publications AFTER INSERT OR UPDATE OF scheduled_at, skipped, brand_slug ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.sync_publications();

INSERT INTO public.publications (user_id, asset_id, platform)
  SELECT a.user_id, a.id, pl FROM public.assets a CROSS JOIN unnest(ARRAY['instagram','facebook']) pl
  WHERE a.brand_slug = 'skyline' AND a.scheduled_at IS NOT NULL AND NOT a.skipped
  ON CONFLICT (asset_id, platform) DO NOTHING;

-- Claims never send another brand with Skyline's accounts.
CREATE OR REPLACE FUNCTION public.claim_publications(_owner text, _limit integer)
 RETURNS SETOF publications LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  return query
  update public.publications p set lease_owner = _owner, lease_until = now() + interval '4 minutes', updated_at = now()
  where p.id in (
    select p2.id from public.publications p2
    join public.assets a on a.id = p2.asset_id
    join public.settings s on s.user_id = p2.user_id
    where s.publishing_active and not a.skipped and a.approved and a.brand_slug = 'skyline'
      and p2.status in ('pending','processing','retry')
      and a.scheduled_at <= now()
      and a.scheduled_at > now() - interval '3 hours'
      and (p2.next_attempt_at is null or p2.next_attempt_at <= now())
      and (p2.lease_until is null or p2.lease_until < now())
    order by a.scheduled_at limit _limit
    for update of p2 skip locked)
  returning p.*;
end $function$;

-- 3. Missed slots become visible instead of staying pending forever.
CREATE OR REPLACE FUNCTION public.mark_missed_publications()
RETURNS TABLE (user_id uuid, asset_id uuid, file_name text, scheduled_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.publications p SET status = 'missed', lease_owner = NULL, lease_until = NULL,
    last_error = 'Not posted within 3 hours of its slot; never sent late', updated_at = now()
  FROM public.assets a
  WHERE a.id = p.asset_id AND p.status IN ('pending','retry') AND p.remote_id IS NULL
    AND a.scheduled_at < now() - interval '3 hours'
    AND (p.lease_until IS NULL OR p.lease_until < now())
  RETURNING p.user_id, p.asset_id, a.file_name, a.scheduled_at;
END $$;
REVOKE ALL ON FUNCTION public.mark_missed_publications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_missed_publications() TO service_role;

-- Commit: missed items may be rescheduled; unchanged slots keep their approval.
CREATE OR REPLACE FUNCTION public.commit_schedule(_brand text, _items jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _uid uuid := auth.uid();
  _n integer;
  _bad text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF jsonb_typeof(_items) <> 'array' THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('commit_schedule:' || _uid::text));

  CREATE TEMP TABLE _plan ON COMMIT DROP AS
    SELECT (e->>'id')::uuid AS id, (e->>'at')::timestamptz AS at FROM jsonb_array_elements(_items) e;
  SELECT count(*) INTO _n FROM _plan;
  IF _n = 0 THEN RETURN 0; END IF;
  IF _n > 2000 THEN RAISE EXCEPTION 'Too many items'; END IF;
  IF (SELECT count(DISTINCT id) FROM _plan) <> _n THEN RAISE EXCEPTION 'Duplicate item in plan'; END IF;
  IF (SELECT count(DISTINCT at) FROM _plan) <> _n THEN RAISE EXCEPTION 'Two items share one slot'; END IF;
  IF EXISTS (SELECT 1 FROM _plan WHERE id IS NULL OR at IS NULL OR at <= now()) THEN RAISE EXCEPTION 'Slot in the past or invalid'; END IF;

  PERFORM 1 FROM public.assets a JOIN _plan p ON p.id = a.id WHERE a.user_id = _uid FOR UPDATE OF a;
  PERFORM 1 FROM public.publications pb JOIN _plan p ON p.id = pb.asset_id WHERE pb.user_id = _uid FOR UPDATE OF pb;

  SELECT p.id::text INTO _bad FROM _plan p LEFT JOIN public.assets a ON a.id = p.id AND a.user_id = _uid
    WHERE a.id IS NULL OR a.brand_slug <> _brand OR a.skipped OR a.upload_state <> 'done' OR a.review_status IN ('reject','needs_work') LIMIT 1;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'Item % is not plannable (brand, skipped, upload or review)', _bad; END IF;

  SELECT pb.asset_id::text INTO _bad FROM public.publications pb JOIN _plan p ON p.id = pb.asset_id
    WHERE pb.user_id = _uid AND (pb.status NOT IN ('pending','retry','skipped','missed') OR pb.lease_until > now()) LIMIT 1;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'Item % is already publishing or published', _bad; END IF;

  SELECT a.id::text INTO _bad FROM public.assets a JOIN _plan p ON p.at = a.scheduled_at
    WHERE a.user_id = _uid AND a.id NOT IN (SELECT id FROM _plan) LIMIT 1;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'Slot already taken by item %', _bad; END IF;

  UPDATE public.assets a SET scheduled_at = p.at,
    approved = CASE WHEN a.scheduled_at IS NOT DISTINCT FROM p.at THEN a.approved ELSE false END
  FROM _plan p WHERE a.id = p.id AND a.user_id = _uid;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $function$;