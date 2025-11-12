-- 既存ユーザーのトライアル期限を修正
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- plan_expires_atがnullの既存トライアルユーザーに、created_at + 7日を設定
UPDATE profiles
SET plan_expires_at = created_at + INTERVAL '7 days'
WHERE subscription_status = 'trial'
  AND plan_expires_at IS NULL;

-- 確認クエリ（修正されたユーザー数を表示）
SELECT
  COUNT(*) as updated_users,
  'トライアル期限を設定しました' as message
FROM profiles
WHERE subscription_status = 'trial'
  AND plan_expires_at IS NOT NULL;

-- 全トライアルユーザーの期限を確認
SELECT
  id,
  email,
  plan,
  subscription_status,
  plan_expires_at,
  EXTRACT(DAY FROM (plan_expires_at - NOW())) as days_left,
  created_at
FROM profiles
WHERE subscription_status = 'trial'
ORDER BY plan_expires_at DESC;
