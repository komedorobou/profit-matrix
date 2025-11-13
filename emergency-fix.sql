-- ============================================================================
-- 🚨 緊急修正スクリプト - 古いスキーマを完全削除して作り直す
-- ============================================================================
-- これを Supabase SQL Editor で実行してください
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: 既存データをバックアップ（念のため）
-- ============================================================================

-- 一時テーブルに既存データを保存
CREATE TEMP TABLE profiles_backup AS
SELECT * FROM public.profiles;

-- ============================================================================
-- STEP 2: 古いポリシーとトリガーを完全削除
-- ============================================================================

-- すべてのポリシーを削除
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable all for service role" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.profiles;

-- すべてのトリガーを削除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;

-- すべての関数を削除
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.check_plan_limit(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.check_card_already_used(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_trial_days_left(UUID) CASCADE;

-- ============================================================================
-- STEP 3: テーブル構造を修正（カラムを追加/変更）
-- ============================================================================

-- 古いカラムを削除（存在する場合）
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trial_ends_at;

-- 新しいカラムを追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS card_fingerprint TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- カラムの型とデフォルト値を修正
ALTER TABLE public.profiles ALTER COLUMN subscription_status SET DEFAULT 'trial';
ALTER TABLE public.profiles ALTER COLUMN subscription_status SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'trial';
ALTER TABLE public.profiles ALTER COLUMN plan DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.profiles ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.profiles ALTER COLUMN updated_at SET NOT NULL;

-- email を NOT NULL に設定（NULLの場合は修正してから）
UPDATE public.profiles SET email = 'unknown@example.com' WHERE email IS NULL;
ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;

-- ============================================================================
-- STEP 4: RLS ポリシーを作成（Service Role Key 対応）
-- ============================================================================

-- RLS を有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のプロフィールのみ閲覧可能
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- ユーザーは自分のプロフィールのみ更新可能
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- 🚨 最重要: Service Role は全アクセス可能
CREATE POLICY "Enable all for service role"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 5: トリガー関数を再作成
-- ============================================================================

-- 新規ユーザー作成時のプロフィール自動作成関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    plan,
    plan_expires_at,
    subscription_status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, 'unknown@example.com'),
    'trial',
    NOW() + INTERVAL '7 days',
    'trial',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'プロフィール作成エラー: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- トリガーを作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- updated_at 自動更新関数
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- updated_at 自動更新トリガー
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- STEP 6: ビジネスロジック関数
-- ============================================================================

-- プラン制限チェック関数
CREATE OR REPLACE FUNCTION public.check_plan_limit(user_id UUID, rows_count INTEGER)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_plan TEXT;
  user_status TEXT;
  expires_at TIMESTAMP WITH TIME ZONE;
  user_email TEXT;
BEGIN
  SELECT plan, subscription_status, plan_expires_at, email
  INTO user_plan, user_status, expires_at, user_email
  FROM public.profiles
  WHERE id = user_id;

  IF NOT FOUND THEN
    RAISE WARNING 'ユーザーが見つかりません: %', user_id;
    RETURN FALSE;
  END IF;

  -- オーナーアカウントは無制限
  IF user_email LIKE '%komedorobouinuzini%' THEN
    RETURN TRUE;
  END IF;

  IF user_status IN ('trial', 'trialing') THEN
    IF expires_at IS NULL THEN
      RAISE WARNING 'トライアル期限が設定されていません: %', user_id;
      RETURN FALSE;
    END IF;

    IF NOW() < expires_at THEN
      RETURN rows_count <= 300;
    ELSE
      RAISE NOTICE 'トライアル期限切れ: %', user_id;
      RETURN FALSE;
    END IF;
  END IF;

  IF user_status = 'active' THEN
    CASE user_plan
      WHEN 'starter' THEN RETURN rows_count <= 100;
      WHEN 'standard' THEN RETURN rows_count <= 300;
      WHEN 'premium' THEN RETURN TRUE;
      ELSE
        RAISE WARNING '不明なプラン: %', user_plan;
        RETURN FALSE;
    END CASE;
  END IF;

  RAISE NOTICE '無効なサブスクリプションステータス: %', user_status;
  RETURN FALSE;
END;
$$;

-- カード重複チェック関数
CREATE OR REPLACE FUNCTION public.check_card_already_used(fingerprint TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  IF fingerprint IS NULL OR fingerprint = '' THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*)
  INTO existing_count
  FROM public.profiles
  WHERE card_fingerprint = fingerprint
    AND subscription_status IN ('active', 'trialing');

  RETURN existing_count > 0;
END;
$$;

-- トライアル残日数取得関数
CREATE OR REPLACE FUNCTION public.get_trial_days_left(user_id UUID)
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  expires_at TIMESTAMP WITH TIME ZONE;
  user_status TEXT;
  days_left INTEGER;
BEGIN
  SELECT plan_expires_at, subscription_status
  INTO expires_at, user_status
  FROM public.profiles
  WHERE id = user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF user_status NOT IN ('trial', 'trialing') THEN
    RETURN NULL;
  END IF;

  IF expires_at IS NULL THEN
    RETURN NULL;
  END IF;

  days_left := CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())) / 86400);

  IF days_left < 0 THEN
    RETURN 0;
  END IF;

  RETURN days_left;
END;
$$;

-- ============================================================================
-- STEP 7: インデックスの作成
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id ON public.profiles(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_card_fingerprint ON public.profiles(card_fingerprint);
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON public.profiles(plan);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_plan_expires_at ON public.profiles(plan_expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_status_expires
  ON public.profiles(subscription_status, plan_expires_at);

CREATE INDEX IF NOT EXISTS idx_profiles_plan_status
  ON public.profiles(plan, subscription_status);

-- ============================================================================
-- STEP 8: 既存データの修正
-- ============================================================================

-- トライアル期限がNULLの場合は設定
UPDATE public.profiles
SET plan_expires_at = created_at + INTERVAL '7 days'
WHERE subscription_status IN ('trial', 'trialing')
  AND plan_expires_at IS NULL;

-- auth.users にあって profiles にないユーザーを追加
INSERT INTO public.profiles (id, email, plan, plan_expires_at, subscription_status, created_at, updated_at)
SELECT
  au.id,
  COALESCE(au.email, 'unknown@example.com'),
  'trial',
  NOW() + INTERVAL '7 days',
  'trial',
  COALESCE(au.created_at, NOW()),
  NOW()
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STEP 9: 検証
-- ============================================================================

-- ポリシー確認
SELECT
  '✅ RLS ポリシー確認' as step,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- ユーザー確認
SELECT
  '✅ ユーザー確認' as step,
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE subscription_status IN ('trial', 'trialing')) as trial_users,
  COUNT(*) FILTER (WHERE subscription_status = 'active') as active_users
FROM public.profiles;

COMMIT;

-- 完了メッセージ
SELECT '🎉 緊急修正完了！ブラウザをリロードしてテストしてください！' as message;
