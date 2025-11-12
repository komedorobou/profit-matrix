-- ============================================================================
-- PROFIT MATRIX - 究極のprofilesテーブルセットアップスクリプト
-- ============================================================================
--
-- 機能:
--   ✅ 既存データを完全保護
--   ✅ RLS有効化でセキュリティ強化
--   ✅ トライアル期限バグ完全修正
--   ✅ カード重複検出機能
--   ✅ アフィリエイト機能対応
--   ✅ 詳細なエラーハンドリング
--   ✅ パフォーマンス最適化
--   ✅ データ整合性チェック
--   ✅ トランザクション対応
--
-- 実行方法: Supabase Dashboard > SQL Editor で実行
-- 実行時間: 約5-10秒
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: テーブル構造の確認と修正
-- ============================================================================

-- 1.1 profilesテーブルが存在しない場合は作成
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT DEFAULT 'trial' NOT NULL,
  plan_expires_at TIMESTAMP WITH TIME ZONE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  subscription_status TEXT DEFAULT 'trial' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 1.2 新しいカラムを追加（既存の場合はスキップ）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS card_fingerprint TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- 1.3 NOT NULL制約を追加（安全に）
DO $$
BEGIN
  -- emailにNOT NULL制約がない場合は追加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles'
    AND column_name = 'email'
    AND is_nullable = 'NO'
  ) THEN
    -- まずNULLのemailを修正
    UPDATE public.profiles SET email = 'unknown@example.com' WHERE email IS NULL;
    ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: RLSポリシーの設定（セキュリティ強化）
-- ============================================================================

-- 2.1 RLSを有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2.2 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable all for service role" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.profiles;

-- 2.3 新しいポリシーを作成
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

-- Service Role（API）は全アクセス可能
CREATE POLICY "Enable all for service role"
  ON public.profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 3: トリガー関数の再作成
-- ============================================================================

-- 3.1 既存のトリガーを削除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;

-- 3.2 既存の関数を削除
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

-- 3.3 新規ユーザー作成時のプロフィール自動作成関数（エラーハンドリング付き）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- プロフィールを作成（既存の場合は更新）
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
    COALESCE(NEW.email, 'unknown@example.com'),  -- emailがNULLの場合の対策
    'trial',
    NOW() + INTERVAL '7 days',  -- 7日間無料トライアル
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
    -- エラーが発生してもトリガーは失敗させない（ログのみ）
    RAISE WARNING 'プロフィール作成エラー: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- 3.4 トリガーを作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3.5 updated_at自動更新関数
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 3.6 updated_at自動更新トリガー
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- STEP 4: ビジネスロジック関数
-- ============================================================================

-- 4.1 プラン制限チェック関数（完全版）
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
  -- ユーザー情報を取得
  SELECT plan, subscription_status, plan_expires_at, email
  INTO user_plan, user_status, expires_at, user_email
  FROM public.profiles
  WHERE id = user_id;

  -- ユーザーが見つからない場合
  IF NOT FOUND THEN
    RAISE WARNING 'ユーザーが見つかりません: %', user_id;
    RETURN FALSE;
  END IF;

  -- オーナーアカウントは無制限
  IF user_email LIKE '%komedorobouinuzini%' THEN
    RETURN TRUE;
  END IF;

  -- トライアル期間チェック（trial, trialingに対応）
  IF user_status IN ('trial', 'trialing') THEN
    -- 期限が設定されていない場合はエラー
    IF expires_at IS NULL THEN
      RAISE WARNING 'トライアル期限が設定されていません: %', user_id;
      RETURN FALSE;
    END IF;

    -- 期限内かチェック
    IF NOW() < expires_at THEN
      RETURN rows_count <= 300;  -- トライアルは300行まで
    ELSE
      RAISE NOTICE 'トライアル期限切れ: %', user_id;
      RETURN FALSE;
    END IF;
  END IF;

  -- 有料プランの制限チェック
  IF user_status = 'active' THEN
    CASE user_plan
      WHEN 'starter' THEN
        RETURN rows_count <= 100;
      WHEN 'standard' THEN
        RETURN rows_count <= 300;
      WHEN 'premium' THEN
        RETURN TRUE;  -- 無制限
      ELSE
        RAISE WARNING '不明なプラン: %', user_plan;
        RETURN FALSE;
    END CASE;
  END IF;

  -- その他のステータス（canceled, past_due）は使用不可
  RAISE NOTICE '無効なサブスクリプションステータス: %', user_status;
  RETURN FALSE;
END;
$$;

-- 4.2 カード重複チェック関数
CREATE OR REPLACE FUNCTION public.check_card_already_used(fingerprint TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  -- フィンガープリントがNULLの場合は重複なし
  IF fingerprint IS NULL OR fingerprint = '' THEN
    RETURN FALSE;
  END IF;

  -- 同じフィンガープリントを持つユーザー数をカウント
  SELECT COUNT(*)
  INTO existing_count
  FROM public.profiles
  WHERE card_fingerprint = fingerprint
    AND subscription_status IN ('active', 'trialing');  -- アクティブなユーザーのみ

  RETURN existing_count > 0;
END;
$$;

-- 4.3 トライアル残日数取得関数
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

  -- トライアル中のみ計算
  IF user_status NOT IN ('trial', 'trialing') THEN
    RETURN NULL;
  END IF;

  -- 期限が設定されていない場合
  IF expires_at IS NULL THEN
    RETURN NULL;
  END IF;

  -- 残日数を計算（1日未満は切り上げ）
  days_left := CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())) / 86400);

  -- マイナスの場合は0を返す
  IF days_left < 0 THEN
    RETURN 0;
  END IF;

  RETURN days_left;
END;
$$;

-- ============================================================================
-- STEP 5: インデックスの作成（パフォーマンス最適化）
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

-- 複合インデックス（よく使われるクエリの高速化）
CREATE INDEX IF NOT EXISTS idx_profiles_status_expires
  ON public.profiles(subscription_status, plan_expires_at);

CREATE INDEX IF NOT EXISTS idx_profiles_plan_status
  ON public.profiles(plan, subscription_status);

-- ============================================================================
-- STEP 6: 既存データの修正とクリーンアップ
-- ============================================================================

-- 6.1 トライアル期限がNULLの既存ユーザーを修正
UPDATE public.profiles
SET plan_expires_at = created_at + INTERVAL '7 days'
WHERE subscription_status IN ('trial', 'trialing')
  AND plan_expires_at IS NULL;

-- 6.2 auth.usersにあってprofilesにないユーザーを追加
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

-- 6.3 subscription_statusがNULLの場合は'trial'に設定
UPDATE public.profiles
SET subscription_status = 'trial'
WHERE subscription_status IS NULL;

-- 6.4 planがNULLの場合は'trial'に設定
UPDATE public.profiles
SET plan = 'trial'
WHERE plan IS NULL;

-- ============================================================================
-- STEP 7: データ整合性チェックとレポート
-- ============================================================================

-- 7.1 基本統計
DO $$
DECLARE
  total_users INTEGER;
  total_profiles INTEGER;
  trial_users INTEGER;
  active_users INTEGER;
  expired_trials INTEGER;
  missing_expiry INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_users FROM auth.users;
  SELECT COUNT(*) INTO total_profiles FROM public.profiles;

  SELECT COUNT(*) INTO trial_users
  FROM public.profiles
  WHERE subscription_status IN ('trial', 'trialing');

  SELECT COUNT(*) INTO active_users
  FROM public.profiles
  WHERE subscription_status = 'active';

  SELECT COUNT(*) INTO expired_trials
  FROM public.profiles
  WHERE subscription_status IN ('trial', 'trialing')
    AND plan_expires_at < NOW();

  SELECT COUNT(*) INTO missing_expiry
  FROM public.profiles
  WHERE subscription_status IN ('trial', 'trialing')
    AND plan_expires_at IS NULL;

  RAISE NOTICE '========================================';
  RAISE NOTICE '📊 データベース統計';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'auth.users総数: %', total_users;
  RAISE NOTICE 'profiles総数: %', total_profiles;
  RAISE NOTICE 'トライアルユーザー: %', trial_users;
  RAISE NOTICE 'アクティブユーザー: %', active_users;
  RAISE NOTICE '期限切れトライアル: %', expired_trials;
  RAISE NOTICE '期限未設定: %', missing_expiry;
  RAISE NOTICE '========================================';
END $$;

-- 7.2 詳細レポート用ビューを作成
CREATE OR REPLACE VIEW public.user_status_report AS
SELECT
  p.id,
  p.email,
  p.plan,
  p.subscription_status,
  p.plan_expires_at,
  CASE
    WHEN p.plan_expires_at IS NULL THEN '❌ 期限未設定'
    WHEN p.subscription_status IN ('trial', 'trialing') AND p.plan_expires_at > NOW() THEN
      '✅ トライアル中 (残り' || CEIL(EXTRACT(EPOCH FROM (p.plan_expires_at - NOW())) / 86400) || '日)'
    WHEN p.subscription_status IN ('trial', 'trialing') AND p.plan_expires_at <= NOW() THEN
      '⏰ トライアル期限切れ'
    WHEN p.subscription_status = 'active' THEN
      '💎 有料プラン'
    ELSE
      '⚠️ ' || p.subscription_status
  END as status_display,
  p.stripe_customer_id,
  p.stripe_subscription_id,
  p.card_fingerprint,
  p.referred_by,
  p.created_at,
  p.updated_at
FROM public.profiles p
ORDER BY p.created_at DESC;

-- ============================================================================
-- STEP 8: 最終確認とコミット
-- ============================================================================

-- 8.1 検証クエリ
SELECT
  '✅ 究極セットアップ完了！' as status,
  (SELECT COUNT(*) FROM public.profiles) as total_profiles,
  (SELECT COUNT(*) FROM public.profiles WHERE subscription_status IN ('trial', 'trialing')) as trial_users,
  (SELECT COUNT(*) FROM public.profiles WHERE subscription_status = 'active') as active_users;

-- 8.2 トライアルユーザーの詳細
SELECT
  email,
  subscription_status,
  CASE
    WHEN plan_expires_at IS NULL THEN 'エラー: 期限未設定'
    WHEN plan_expires_at > NOW() THEN '残り' || CEIL(EXTRACT(EPOCH FROM (plan_expires_at - NOW())) / 86400) || '日'
    ELSE '期限切れ'
  END as trial_status,
  plan_expires_at,
  created_at
FROM public.profiles
WHERE subscription_status IN ('trial', 'trialing')
ORDER BY plan_expires_at DESC
LIMIT 10;

-- 8.3 RLSポリシー確認
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'profiles';

-- 8.4 トリガー確認
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'profiles' OR event_object_table = 'users'
ORDER BY trigger_name;

COMMIT;

-- ============================================================================
-- 完了メッセージ
-- ============================================================================
SELECT '🎉 究極のセットアップが完了しました！' as message;
SELECT '📊 レポートを確認: SELECT * FROM user_status_report;' as next_step;
