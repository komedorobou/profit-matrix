# 🚀 PROFIT MATRIX - データベースセットアップガイド

## 📋 概要

`ultimate-profiles-setup.sql` は、PROFIT MATRIXの完璧なデータベース環境を構築する究極のSQLスクリプトです。

## ✨ 機能一覧

### セキュリティ
- ✅ **RLS有効化** - Row Level Securityでユーザーデータを完全保護
- ✅ **ポリシー設定** - ユーザーは自分のデータのみアクセス可能
- ✅ **Service Role対応** - APIからの管理者操作をサポート

### データ保護
- ✅ **既存データ完全保護** - データ削除なし、トランザクション対応
- ✅ **エラーハンドリング** - 失敗時は自動ロールバック
- ✅ **データ整合性チェック** - 自動修正機能付き

### バグ修正
- ✅ **トライアル期限バグ修正** - 無限トライアル問題を完全解決
- ✅ **NULL値対策** - すべてのNULLケースをハンドリング
- ✅ **既存ユーザー修正** - 期限未設定ユーザーを自動修正

### 新機能
- ✅ **カード重複検出** - 同一カードの複数登録を防止
- ✅ **アフィリエイト対応** - referred_byカラム追加
- ✅ **トライアル残日数関数** - リアルタイムで残日数を取得

### パフォーマンス
- ✅ **最適化されたインデックス** - 10個のインデックスで高速化
- ✅ **複合インデックス** - 頻繁なクエリを最適化
- ✅ **ビューの作成** - レポート表示を高速化

### 監視とレポート
- ✅ **詳細な統計情報** - ユーザー数、トライアル状況を表示
- ✅ **user_status_report ビュー** - 全ユーザーの状態を一覧表示
- ✅ **警告とログ** - 問題を即座に検出

---

## 🎯 実行方法

### ステップ1: Supabaseにログイン

```
https://supabase.com/dashboard/project/czwwlrrgtmiagujdjxdr
```

### ステップ2: SQL Editorを開く

左メニュー → **SQL Editor** → **New query**

### ステップ3: スクリプトを実行

1. `ultimate-profiles-setup.sql` の内容をコピー
2. SQL Editorに貼り付け
3. **Run** ボタンをクリック（または Ctrl/Cmd + Enter）

### ステップ4: 実行結果を確認

✅ 成功時の出力例：
```
========================================
📊 データベース統計
========================================
auth.users総数: 15
profiles総数: 15
トライアルユーザー: 12
アクティブユーザー: 3
期限切れトライアル: 0
期限未設定: 0
========================================

🎉 究極のセットアップが完了しました！
📊 レポートを確認: SELECT * FROM user_status_report;
```

---

## 📊 実行後の確認

### 1. 全ユーザーの状態を確認

```sql
SELECT * FROM user_status_report;
```

出力例：
```
email                  | status_display                  | plan    | subscription_status
-----------------------|----------------------------------|---------|--------------------
user1@example.com      | ✅ トライアル中 (残り5日)        | trial   | trial
user2@example.com      | 💎 有料プラン                   | premium | active
user3@example.com      | ⏰ トライアル期限切れ           | trial   | trial
```

### 2. トライアル残日数を取得

```sql
-- 特定ユーザーの残日数
SELECT get_trial_days_left('ユーザーID');

-- 全トライアルユーザーの残日数
SELECT
  email,
  get_trial_days_left(id) as days_left
FROM profiles
WHERE subscription_status IN ('trial', 'trialing');
```

### 3. カード重複をチェック

```sql
SELECT check_card_already_used('カードフィンガープリント');
```

### 4. プラン制限をチェック

```sql
SELECT check_plan_limit('ユーザーID', 150);  -- 150行の処理が可能か
```

---

## 🔧 トラブルシューティング

### エラー: "permission denied for table profiles"

**原因**: RLSが有効化されているため、一般ユーザーではアクセスできません。

**解決策**: Service Roleキーを使用してAPIからアクセスするか、Supabase Dashboardから確認してください。

### エラー: "relation profiles already exists"

**原因**: profilesテーブルが既に存在しています（正常）。

**解決策**: スクリプトは既存テーブルを保護するため、そのまま実行を続けてください。

### 警告: "プロフィール作成エラー"

**原因**: auth.usersとprofilesの同期で一時的なエラー。

**解決策**: トリガーは失敗しても続行するため、問題ありません。手動で修正する場合：

```sql
INSERT INTO public.profiles (id, email, plan, plan_expires_at, subscription_status)
SELECT
  id,
  email,
  'trial',
  NOW() + INTERVAL '7 days',
  'trial'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
```

---

## 📈 パフォーマンスチェック

### インデックスの確認

```sql
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
ORDER BY indexname;
```

### クエリ速度のテスト

```sql
EXPLAIN ANALYZE
SELECT * FROM profiles
WHERE subscription_status = 'trial'
  AND plan_expires_at > NOW();
```

---

## 🔐 セキュリティ検証

### RLSポリシーの確認

```sql
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'profiles';
```

期待される出力：
- `Users can view own profile` (SELECT)
- `Users can update own profile` (UPDATE)
- `Enable all for service role` (ALL)

### テストクエリ（ユーザー視点）

```sql
-- 通常ユーザーは自分のプロフィールのみ閲覧可能
SET ROLE authenticated;
SELECT * FROM profiles WHERE id = auth.uid();
```

---

## 🔄 ロールバック方法

万が一問題が発生した場合、以下のコマンドでロールバックできます：

```sql
-- トランザクション中の場合
ROLLBACK;

-- RLSを無効化する場合（非推奨）
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
```

---

## 🎓 関数リファレンス

### `check_plan_limit(user_id, rows_count)`

**説明**: ユーザーが指定行数のCSVを処理できるかチェック

**パラメータ**:
- `user_id` (UUID): ユーザーID
- `rows_count` (INTEGER): 処理する行数

**戻り値**: BOOLEAN (true: 許可, false: 拒否)

**例**:
```sql
SELECT check_plan_limit('550e8400-e29b-41d4-a716-446655440000', 200);
```

---

### `check_card_already_used(fingerprint)`

**説明**: カードフィンガープリントが既に使用されているかチェック

**パラメータ**:
- `fingerprint` (TEXT): カードフィンガープリント

**戻り値**: BOOLEAN (true: 使用済み, false: 未使用)

**例**:
```sql
SELECT check_card_already_used('fp_abc123xyz');
```

---

### `get_trial_days_left(user_id)`

**説明**: トライアル残日数を取得

**パラメータ**:
- `user_id` (UUID): ユーザーID

**戻り値**: INTEGER (残日数、トライアルでない場合はNULL)

**例**:
```sql
SELECT get_trial_days_left('550e8400-e29b-41d4-a716-446655440000');
```

---

## 📞 サポート

問題が発生した場合：

1. **ログを確認**: Supabase Dashboard → Logs
2. **Issueを作成**: GitHub リポジトリ
3. **メールサポート**: support@profit-matrix.com

---

## 📝 変更履歴

### v1.0.0 (2025-11-12)
- 初回リリース
- トライアル期限バグ修正
- カード重複検出機能追加
- 完全なRLS対応
- パフォーマンス最適化

---

## 📄 ライセンス

Proprietary - PROFIT MATRIX Development Team

© 2025 PROFIT MATRIX. All rights reserved.
