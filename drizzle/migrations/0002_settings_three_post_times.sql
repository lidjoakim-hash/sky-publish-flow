ALTER TABLE public.settings ADD COLUMN post_times text[] NOT NULL DEFAULT '{09:00,13:00,18:00}';
UPDATE public.settings SET post_times = ARRAY[post_time::text, '13:00', '18:00'] WHERE post_times IS NULL;
UPDATE public.settings SET post_times = ARRAY[substring(post_time::text from 1 for 5), '13:00', '18:00'];