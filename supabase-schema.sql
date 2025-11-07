-- PROFIT MATRIX プラン管理テーブル設計
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- 1. プロフィールテーブルに追加カラム
-- すでにprofilesテーブルがある場合は、カラムを追加
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'trial';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial'; -- trial, active, canceled, past_due

-- 2. プロフィールテーブルがない場合は作成
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  plan TEXT DEFAULT 'trial',  -- trial, starter, standard, premium
  plan_expires_at TIMESTAMP WITH TIME ZONE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  subscription_status TEXT DEFAULT 'trial',  -- trial, active, canceled, past_due
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Row Level Security (RLS) を有効化
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLSポリシー: ユーザーは自分のプロフィールのみ閲覧・更新可能
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 5. サインアップ時に自動でプロフィールを作成するトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, plan, plan_expires_at, subscription_status)
  VALUES (
    new.id,
    new.email,
    'trial',
    NOW() + INTERVAL '7 days',  -- 7日間無料トライアル
    'trial'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 既存のトリガーを削除して再作成
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_updated ON profiles;

CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7. プラン制限を確認する関数
CREATE OR REPLACE FUNCTION public.check_plan_limit(user_id UUID, rows_count INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  user_plan TEXT;
  user_status TEXT;
  expires_at TIMESTAMP WITH TIME ZONE;
  is_valid BOOLEAN := FALSE;
BEGIN
  -- ユーザーのプラン情報を取得
  SELECT plan, subscription_status, plan_expires_at
  INTO user_plan, user_status, expires_at
  FROM profiles
  WHERE id = user_id;

  -- オーナーアカウントは無制限
  IF (SELECT email FROM profiles WHERE id = user_id) LIKE '%komedorobouinuzini%' THEN
    RETURN TRUE;
  END IF;

  -- トライアル期間チェック
  IF user_status = 'trial' THEN
    IF NOW() < expires_at THEN
      -- トライアル期間中は300行まで（Standardと同等）
      RETURN rows_count <= 300;
    ELSE
      -- トライアル期限切れ
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
        RETURN FALSE;
    END CASE;
  END IF;

  -- その他のステータス（canceled, past_due）は使用不可
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. インデックスを作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id ON profiles(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- 完了メッセージ
SELECT 'プラン管理テーブルのセットアップが完了しました！' AS message;
