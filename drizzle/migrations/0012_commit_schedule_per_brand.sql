-- Slot collisions are checked within one business only.
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
    WHERE a.user_id = _uid AND a.brand_slug = _brand AND a.id NOT IN (SELECT id FROM _plan) LIMIT 1;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'Slot already taken by item %', _bad; END IF;

  UPDATE public.assets a SET scheduled_at = p.at,
    approved = CASE WHEN a.scheduled_at IS NOT DISTINCT FROM p.at THEN a.approved ELSE false END
  FROM _plan p WHERE a.id = p.id AND a.user_id = _uid;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $function$;

