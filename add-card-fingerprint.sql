-- カード重複チェック用カラム追加
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- 1. card_fingerprintカラムを追加
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS card_fingerprint TEXT;

-- 2. card_fingerprintにインデックスを作成（検索高速化）
CREATE INDEX IF NOT EXISTS idx_profiles_card_fingerprint ON profiles(card_fingerprint);

-- 3. 既に同じカードが登録されているかチェックする関数
CREATE OR REPLACE FUNCTION public.check_card_already_used(fingerprint TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  -- fingerprintがNULLの場合はチェックしない
  IF fingerprint IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 同じフィンガープリントを持つプロフィールの数をカウント
  SELECT COUNT(*)
  INTO existing_count
  FROM profiles
  WHERE card_fingerprint = fingerprint;

  -- 1件以上存在すればTRUE（既に使用済み）
  RETURN existing_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 完了メッセージ
SELECT 'カード重複チェック機能のセットアップが完了しました！' AS message;
