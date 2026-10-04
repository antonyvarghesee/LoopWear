-- Keep profile identity and trust fields under database control. Only the
-- authenticated owner's editable profile columns are writable through PostgREST.
REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT UPDATE (username, full_name, bio, location)
  ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update editable fields on own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- A fixed search path prevents object shadowing inside this privileged trigger.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate TEXT;
  suffix TEXT;
  username_seed TEXT := SUBSTRING(REPLACE(NEW.id::TEXT, '-', '') FROM 1 FOR 15);
  attempt INTEGER := 0;
  inserted_id UUID;
BEGIN
  candidate := NEW.raw_user_meta_data ->> 'username';

  IF candidate IS NOT NULL AND candidate ~ '^[A-Za-z0-9_]{3,20}$' THEN
    INSERT INTO public.profiles (id, username, full_name, avatar_url)
    VALUES (NEW.id, candidate, LEFT(NEW.raw_user_meta_data ->> 'full_name', 50), NULL)
    ON CONFLICT (username) DO NOTHING
    RETURNING id INTO inserted_id;

    IF inserted_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Retry deterministic, valid fallback names if another signup takes the
  -- same short UUID prefix (or a supplied username races with this insert).
  LOOP
    attempt := attempt + 1;
    suffix := CASE WHEN attempt = 1 THEN '' ELSE attempt::TEXT END;
    candidate := 'user_' || LEFT(username_seed, 15 - LENGTH(suffix)) || suffix;

    INSERT INTO public.profiles (id, username, full_name, avatar_url)
    VALUES (NEW.id, candidate, LEFT(NEW.raw_user_meta_data ->> 'full_name', 50), NULL)
    ON CONFLICT (username) DO NOTHING
    RETURNING id INTO inserted_id;

    IF inserted_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END LOOP;
END;
$$;

-- Repair legacy values accepted by the original metadata-based trigger before
-- validating the durable username constraint. Retry if a generated name is used.
DO $$
DECLARE
  legacy_profile RECORD;
  seed TEXT;
  candidate TEXT;
  suffix TEXT;
  attempt INTEGER;
  affected INTEGER;
BEGIN
  FOR legacy_profile IN
    SELECT id FROM public.profiles WHERE username !~ '^[A-Za-z0-9_]{3,20}$'
  LOOP
    seed := SUBSTRING(REPLACE(legacy_profile.id::TEXT, '-', '') FROM 1 FOR 15);
    attempt := 0;
    LOOP
      attempt := attempt + 1;
      suffix := CASE WHEN attempt = 1 THEN '' ELSE attempt::TEXT END;
      candidate := 'user_' || LEFT(seed, 15 - LENGTH(suffix)) || suffix;
      BEGIN
        UPDATE public.profiles SET username = candidate WHERE id = legacy_profile.id;
        GET DIAGNOSTICS affected = ROW_COUNT;
      EXCEPTION WHEN unique_violation THEN
        affected := 0;
      END;
      EXIT WHEN affected = 1;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username ~ '^[A-Za-z0-9_]{3,20}$');

-- Backfill profiles for users that predate this migration. The trigger above
-- supplies a safe unique username when old metadata is invalid or duplicated.
DO $$
DECLARE
  auth_user RECORD;
  candidate TEXT;
  seed TEXT;
  suffix TEXT;
  attempt INTEGER;
BEGIN
  FOR auth_user IN
    SELECT u.id, u.raw_user_meta_data
    FROM auth.users AS u
    LEFT JOIN public.profiles AS p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    seed := SUBSTRING(REPLACE(auth_user.id::TEXT, '-', '') FROM 1 FOR 15);
    candidate := auth_user.raw_user_meta_data ->> 'username';
    attempt := 0;
    IF candidate IS NULL OR candidate !~ '^[A-Za-z0-9_]{3,20}$' THEN
      candidate := NULL;
    END IF;

    LOOP
      attempt := attempt + 1;
      IF attempt > 1 OR candidate IS NULL THEN
        suffix := CASE WHEN attempt = 1 THEN '' ELSE attempt::TEXT END;
        candidate := 'user_' || LEFT(seed, 15 - LENGTH(suffix)) || suffix;
      END IF;

      INSERT INTO public.profiles (id, username, full_name, avatar_url)
      VALUES (auth_user.id, candidate, LEFT(auth_user.raw_user_meta_data ->> 'full_name', 50), NULL)
      ON CONFLICT (username) DO NOTHING;

      EXIT WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth_user.id);
    END LOOP;
  END LOOP;
END;
$$;
