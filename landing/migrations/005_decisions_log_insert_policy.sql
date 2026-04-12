-- MP-18 PEÇA 2: Verify INSERT policy on decisions_log
-- The table was created in MP-13 (003). This ensures the INSERT policy exists.
-- Execute manually in Supabase SQL Editor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decisions_log'
      AND policyname = 'Users insert own decisions_log'
  ) THEN
    CREATE POLICY "Users insert own decisions_log"
      ON decisions_log FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
