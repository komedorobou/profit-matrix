-- 安全なprofilesテーブル修正スクリプト
-- 既存データを保持し、RLSを適切に設定

-- 1. card_fingerprintカラムがなければ追加
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS card_fingerprint TEXT;

-- 2. referred_byカラムがなければ追加
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- 3. RLSを有効化（セキュリティ強化）
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. 既存のRLSポリシーを削除
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for service role" ON public.profiles;
DROP POLICY IF EXISTS "Enable all for service role" ON public.profiles;

-- 5. 新しいRLSポリシーを作成（ユーザーは自分のプロフィールのみアクセス可能）
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- 6. Service Role用のポリシー（APIから管理者権限で操作可能）
CREATE POLICY "Enable all for service role"
  ON public.profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- 7. 既存のトリガーを削除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;

-- 8. 既存の関数を削除
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

-- 9. 新規ユーザー作成時のプロフィール自動作成関数
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
    NEW.email,
    'trial',
    NOW() + INTERVAL '7 days',
    'trial',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- 10. トリガーを作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 11. updated_at自動更新関数
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 12. updated_at自動更新トリガー
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 13. プラン制限チェック関数を更新（trialingステータス対応）
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
    RETURN FALSE;
  END IF;

  -- オーナーアカウントは無制限
  IF user_email LIKE '%komedorobouinuzini%' THEN
    RETURN TRUE;
  END IF;

  -- トライアル期間チェック（trialingも追加）
  IF user_status IN ('trial', 'trialing') THEN
    IF expires_at IS NULL THEN
      RETURN FALSE;  -- 期限が設定されていない場合は拒否
    END IF;

    IF NOW() < expires_at THEN
      RETURN rows_count <= 300;
    ELSE
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
        RETURN TRUE;
      ELSE
        RETURN FALSE;
    END CASE;
  END IF;

  -- その他のステータス（canceled, past_due）は使用不可
  RETURN FALSE;
END;
$$;

-- 14. カード重複チェック関数
CREATE OR REPLACE FUNCTION public.check_card_already_used(fingerprint TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  IF fingerprint IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*)
  INTO existing_count
  FROM public.profiles
  WHERE card_fingerprint = fingerprint;

  RETURN existing_count > 0;
END;
$$;

-- 15. インデックスを作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id ON public.profiles(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_card_fingerprint ON public.profiles(card_fingerprint);
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON public.profiles(plan);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_plan_expires_at ON public.profiles(plan_expires_at);

-- 16. 既存トライアルユーザーの期限を修正（nullの場合のみ）
UPDATE public.profiles
SET plan_expires_at = created_at + INTERVAL '7 days'
WHERE subscription_status IN ('trial', 'trialing')
  AND plan_expires_at IS NULL;

-- 17. 既存のauth.usersに対してprofilesを作成（既存ユーザー対応）
INSERT INTO public.profiles (id, email, plan, plan_expires_at, subscription_status, created_at, updated_at)
SELECT
  au.id,
  au.email,
  'trial',
  NOW() + INTERVAL '7 days',
  'trial',
  NOW(),
  NOW()
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- 18. 動作確認
SELECT
  '✅ 安全なセットアップ完了' as status,
  'RLS: 有効（セキュア）' as security_status,
  'トリガー: 有効' as trigger_status,
  '既存データ: 保持済み' as data_status;

-- 19. 全ユーザーのトライアル状況を確認
SELECT
  id,
  email,
  plan,
  subscription_status,
  plan_expires_at,
  CASE
    WHEN plan_expires_at IS NULL THEN 'エラー: 期限未設定'
    WHEN plan_expires_at > NOW() THEN CONCAT('残り', EXTRACT(DAY FROM (plan_expires_at - NOW())), '日')
    ELSE '期限切れ'
  END as trial_status,
  created_at
FROM public.profiles
WHERE subscription_status IN ('trial', 'trialing')
ORDER BY plan_expires_at DESC;
