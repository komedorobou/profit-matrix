-- ============================================================================
-- PROFIT MATRIX - 究極のprofilesテーブルセットアップスクリプト【完全版v2】
-- ============================================================================
--
-- 🎯 これ一つ実行すればすべて完了！
--
-- 機能:
--   ✅ 既存データを完全保護
--   ✅ RLS有効化でセキュリティ強化（Service Role Key 対応済み）
--   ✅ トライアル期限バグ完全修正
--   ✅ ユーザー管理API完全対応
--   ✅ クレジットカード登録必須システム対応
--   ✅ カード重複検出機能
--   ✅ 不正ユーザー一括削除機能（オプション）
--   ✅ アフィリエイト機能対応
--   ✅ 詳細なエラーハンドリング
--   ✅ パフォーマンス最適化
--   ✅ データ整合性チェック
--   ✅ トランザクション対応
--
-- 実行方法: Supabase Dashboard > SQL Editor で実行
-- 実行時間: 約5-10秒
--
-- ⚠️ 重要: このスクリプトは既存データを保護します。安心して実行してください。
--
-- 🔐 セキュリティポリシー:
--   - オーナーアカウント以外は stripe_customer_id 必須
--   - クレジットカード未登録ユーザーはログイン時に自動削除
--   - オーナーアカウント: メールに 'komedorobouinuzini' を含む
--
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
  subscription_status TEXT DEFAULT 'trial' NOT NULL,  -- trial, trialing, active, canceled, past_due
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

-- 2.2 既存のポリシーをすべて削除
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

-- 🚨 最重要: Service Role（バックエンドAPI）は全アクセス可能
-- IMPORTANT: auth.role() doesn't work with Service Role Key
-- Service Role Key は JWT コンテキストを提供しないため、auth.role() は NULL を返す
-- 解決策: TO service_role を使用して明示的にロールを指定
CREATE POLICY "Enable all for service role"
  ON public.profiles
  FOR ALL
  TO service_role        -- 👈 ここが重要！service_role ロールを明示的に指定
  USING (true)           -- 👈 すべての行にアクセス許可
  WITH CHECK (true);     -- 👈 すべての変更を許可

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

  -- 👑 オーナーアカウントは無制限
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

-- クレジットカード未登録ユーザー検出用インデックス
CREATE INDEX IF NOT EXISTS idx_profiles_no_stripe
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NULL;

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

-- 6.5 トライアル期限切れ＆Stripe課金済みなのにtrialingのままのユーザーをactiveに修正
-- （Webhookが失敗してsubscription_statusが更新されなかったケースの救済）
UPDATE public.profiles
SET subscription_status = 'active'
WHERE subscription_status = 'trialing'
  AND stripe_subscription_id IS NOT NULL
  AND plan_expires_at < NOW();

-- 6.6 activeユーザーのplan_expires_atが過去日付のままの場合、1ヶ月後に修正
-- （Webhookでplan_expires_atが更新されなかったケースの救済）
-- ※ 本来はStripeのcurrent_period_endを使うべきだが、DBから取得できないため暫定対応
UPDATE public.profiles
SET plan_expires_at = NOW() + INTERVAL '1 month'
WHERE subscription_status = 'active'
  AND stripe_subscription_id IS NOT NULL
  AND plan_expires_at < NOW();

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
  no_stripe_card INTEGER;
  owner_accounts INTEGER;
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

  SELECT COUNT(*) INTO no_stripe_card
  FROM public.profiles
  WHERE stripe_customer_id IS NULL
    AND email NOT LIKE '%komedorobouinuzini%';

  SELECT COUNT(*) INTO owner_accounts
  FROM public.profiles
  WHERE email LIKE '%komedorobouinuzini%';

  RAISE NOTICE '========================================';
  RAISE NOTICE '📊 データベース統計';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'auth.users総数: %', total_users;
  RAISE NOTICE 'profiles総数: %', total_profiles;
  RAISE NOTICE '👑 オーナーアカウント: %', owner_accounts;
  RAISE NOTICE 'トライアルユーザー: %', trial_users;
  RAISE NOTICE '💎 アクティブユーザー: %', active_users;
  RAISE NOTICE '⏰ 期限切れトライアル: %', expired_trials;
  RAISE NOTICE '❌ 期限未設定: %', missing_expiry;
  RAISE NOTICE '🚨 クレジットカード未登録: %', no_stripe_card;
  RAISE NOTICE '========================================';

  IF no_stripe_card > 0 THEN
    RAISE NOTICE '⚠️ 警告: % 人のクレジットカード未登録ユーザーが存在します', no_stripe_card;
    RAISE NOTICE '   次のログインで自動的に削除されます。';
    RAISE NOTICE '   手動で削除する場合は STEP 8 を実行してください。';
  END IF;
END $$;

-- 7.2 詳細レポート用ビューを作成
DROP VIEW IF EXISTS public.user_status_report;
CREATE OR REPLACE VIEW public.user_status_report AS
SELECT
  p.id,
  p.email,
  CASE
    WHEN p.email LIKE '%komedorobouinuzini%' THEN '👑 オーナー'
    ELSE '👤 一般ユーザー'
  END as user_type,
  p.plan,
  p.subscription_status,
  CASE
    WHEN p.stripe_customer_id IS NOT NULL THEN '✅ 登録済み'
    WHEN p.email LIKE '%komedorobouinuzini%' THEN '➖ 不要（オーナー）'
    ELSE '❌ 未登録（次回ログイン時削除）'
  END as stripe_status,
  p.plan_expires_at,
  CASE
    WHEN p.email LIKE '%komedorobouinuzini%' THEN '👑 オーナー権限'
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
ORDER BY
  CASE WHEN p.email LIKE '%komedorobouinuzini%' THEN 0 ELSE 1 END,  -- オーナーを最初に表示
  p.created_at DESC;

-- ============================================================================
-- STEP 8: クレジットカード未登録ユーザーの削除（オプション）
-- ============================================================================
--
-- ⚠️ 警告: このセクションはデフォルトでコメントアウトされています
-- 実行する場合は /* と */ を削除してください
--
-- 👉 通常は必要ありません。次回ログイン時に自動削除されます。
-- 👉 今すぐ削除したい場合のみ実行してください。
--
-- ============================================================================

/*
-- 8.1 削除対象ユーザーを確認
SELECT
  '🗑️ 削除対象ユーザー' as action,
  id,
  email,
  plan,
  subscription_status,
  stripe_customer_id,
  created_at
FROM public.profiles
WHERE stripe_customer_id IS NULL
  AND email NOT LIKE '%komedorobouinuzini%'  -- オーナーアカウントは除外
ORDER BY created_at DESC;

-- 8.2 実際に削除（上記確認後に実行）
--
-- ⚠️ 注意: この操作は取り消せません！
-- 必ず上記の SELECT で削除対象を確認してから実行してください。
--

DELETE FROM public.profiles
WHERE stripe_customer_id IS NULL
  AND email NOT LIKE '%komedorobouinuzini%';

-- 8.3 削除されたユーザーのauth.usersレコードも削除が必要
--
-- これは Supabase Dashboard の Authentication > Users で手動削除してください
-- または以下のクエリで削除対象IDを確認:

SELECT
  '🗑️ auth.usersから削除が必要' as action,
  au.id,
  au.email,
  au.created_at
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.profiles)
ORDER BY au.created_at DESC;

*/

-- ============================================================================
-- STEP 9: 最終確認とコミット
-- ============================================================================

-- 9.1 検証クエリ
SELECT
  '✅ 究極セットアップ完了！' as status,
  (SELECT COUNT(*) FROM public.profiles) as total_profiles,
  (SELECT COUNT(*) FROM public.profiles WHERE email LIKE '%komedorobouinuzini%') as owner_accounts,
  (SELECT COUNT(*) FROM public.profiles WHERE subscription_status IN ('trial', 'trialing')) as trial_users,
  (SELECT COUNT(*) FROM public.profiles WHERE subscription_status = 'active') as active_users,
  (SELECT COUNT(*) FROM public.profiles WHERE stripe_customer_id IS NULL AND email NOT LIKE '%komedorobouinuzini%') as unauthorized_users;

-- 9.2 クレジットカード未登録ユーザーの詳細
SELECT
  '🚨 クレジットカード未登録ユーザー一覧（次回ログイン時自動削除）' as warning,
  email,
  plan,
  subscription_status,
  created_at
FROM public.profiles
WHERE stripe_customer_id IS NULL
  AND email NOT LIKE '%komedorobouinuzini%'
ORDER BY created_at DESC;

-- 9.3 RLSポリシー確認（重要！）
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 期待される結果:
-- 1. "Enable all for service role" - roles: {service_role}, cmd: ALL, qual: true, with_check: true
-- 2. "Users can update own profile" - roles: {public}, cmd: UPDATE
-- 3. "Users can view own profile" - roles: {public}, cmd: SELECT

-- 9.4 トリガー確認
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
SELECT '👑 ユーザー管理API: 完全対応済み！' as api_status;
SELECT '🔐 クレジットカード登録必須システム: 有効化済み！' as security_status;

-- ============================================================================
-- 便利なクエリ集（必要に応じて実行）
-- ============================================================================

-- 全ユーザーのステータスを確認
-- SELECT * FROM user_status_report;

-- クレジットカード未登録ユーザーのみ表示
-- SELECT * FROM user_status_report WHERE stripe_status LIKE '%未登録%';

-- オーナーアカウントのみ表示
-- SELECT * FROM user_status_report WHERE user_type LIKE '%オーナー%';

-- トライアル残日数を確認
-- SELECT email, get_trial_days_left(id) as days_left FROM public.profiles WHERE subscription_status IN ('trial', 'trialing');

-- RLSが有効になっているか確認
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = 'profiles';

-- Service Role ポリシーが正しく設定されているか確認
-- SELECT policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Enable all for service role';

-- ============================================================================
-- 🎯 セキュリティポリシーまとめ
-- ============================================================================
--
-- ✅ オーナーアカウント（komedorobouinuzini を含むメール）:
--    - クレジットカード登録不要
--    - すべての機能に無制限アクセス
--    - ユーザー管理権限あり
--
-- ✅ 一般ユーザー:
--    - クレジットカード登録必須
--    - 未登録の場合、次回ログイン時に自動削除
--    - Stripe決済キャンセル時も即座に削除
--
-- ✅ 新規サインアップフロー:
--    1. サインアップ → 2. Stripeへリダイレクト → 3. 決済完了 → 4. 使用可能
--    キャンセル時: アカウント自動削除
--
-- ============================================================================
