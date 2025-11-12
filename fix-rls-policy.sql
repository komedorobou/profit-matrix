-- ============================================================================
-- PROFIT MATRIX - RLS ポリシー修正スクリプト
-- ============================================================================
--
-- 目的: Service Role Key で profiles テーブルにアクセスできるようにする
-- 実行場所: Supabase Dashboard > SQL Editor
-- 実行時間: 約1-2秒
--
-- ============================================================================

-- 既存の誤ったポリシーを削除
DROP POLICY IF EXISTS "Enable all for service role" ON public.profiles;

-- 正しいポリシーを作成
-- IMPORTANT: TO service_role を使用することで、Service Role Key でのアクセスを明示的に許可
CREATE POLICY "Enable all for service role"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 検証クエリ（実行後に確認）
-- ============================================================================

-- 1. ポリシーが正しく作成されたか確認
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
  AND policyname = 'Enable all for service role';

-- 期待される結果:
-- policyname: "Enable all for service role"
-- roles: {service_role}
-- cmd: ALL
-- qual: true
-- with_check: true

-- 2. すべての profiles 用ポリシーを確認
SELECT
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 期待される結果:
-- 1. "Enable all for service role" (roles: {service_role}, cmd: ALL, qual: true)
-- 2. "Users can update own profile" (roles: {public}, cmd: UPDATE, qual: auth.uid() = id)
-- 3. "Users can view own profile" (roles: {public}, cmd: SELECT, qual: auth.uid() = id)

-- ============================================================================
-- トラブルシューティング用クエリ
-- ============================================================================

-- RLS が有効になっているか確認
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'profiles';

-- 期待される結果: rowsecurity = true

-- profiles テーブルの総ユーザー数を確認
SELECT COUNT(*) as total_users FROM public.profiles;

-- ============================================================================
-- 完了メッセージ
-- ============================================================================
SELECT '✅ RLS ポリシー修正完了！Service Role Key でアクセス可能になりました。' as status;
