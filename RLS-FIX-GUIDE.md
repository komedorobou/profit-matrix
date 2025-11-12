# PROFIT MATRIX - ユーザー管理機能 RLS エラー修正ガイド

## エラー概要

```
📡 APIレスポンス: 401
❌ APIエラー: Unauthorized: User not found
```

## 根本原因

### 問題の詳細

**Service Role Key が RLS (Row Level Security) ポリシーで阻まれている**

#### 原因箇所

`ultimate-profiles-setup.sql` の RLS ポリシー設定:

```sql
CREATE POLICY "Enable all for service role"
  ON public.profiles
  FOR ALL
  USING (auth.role() = 'service_role');
```

#### なぜ動作しないのか？

1. **`auth.role()` は認証コンテキストが必要**
   - `auth.role()` は認証済みユーザーのJWTトークンから role を取得します
   - Service Role Key を直接使用する場合、認証コンテキストが存在しません
   - 結果として `auth.role()` は `NULL` または `'anon'` を返します

2. **Service Role Key は RLS をバイパスしない**
   - Supabase の Service Role Key は、**デフォルトでは RLS をバイパスしません**
   - RLS ポリシーで明示的に `service_role` ロールを許可する必要があります
   - しかし、`auth.role()` を使った条件では検出できません

3. **結果: API がユーザー情報を取得できない**
   ```javascript
   // api/get-all-users.js (27-36行目)
   const { data: requestUser, error: userError } = await supabase
       .from('profiles')
       .select('email')
       .eq('id', userId)
       .single();

   // userError が発生 → 401 Unauthorized
   ```

---

## 修正手順

### 1. Supabase SQL Editor でポリシーを修正

Supabase Dashboard にアクセス:
1. **Supabase Dashboard** → プロジェクト選択
2. 左メニュー **SQL Editor** をクリック
3. 以下の SQL を実行:

```sql
-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Enable all for service role" ON public.profiles;

-- 新しいポリシーを作成（Service Role専用）
CREATE POLICY "Enable all for service role"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

#### 修正内容の説明

- **`TO service_role`**: このポリシーは `service_role` ロールにのみ適用されます
- **`USING (true)`**: すべての SELECT, UPDATE, DELETE 操作を許可
- **`WITH CHECK (true)`**: すべての INSERT, UPDATE 操作を許可

### 2. 環境変数の確認

Vercel Dashboard で環境変数が正しく設定されているか確認:

1. **Vercel Dashboard** → プロジェクト選択
2. **Settings** → **Environment Variables**
3. 以下の変数を確認:

```
SUPABASE_URL=https://czwwlrrgtmiagujdjxdr.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG... (長いキー)
```

#### Service Role Key の確認方法

Supabase Dashboard:
1. **Settings** → **API**
2. **Project API keys** セクション
3. **`service_role`** キーをコピー（⚠️ 秘密鍵なので注意）

### 3. Vercel の再デプロイ

環境変数を変更した場合、再デプロイが必要:

```bash
# Vercel CLIを使用している場合
vercel --prod

# または Git push で自動デプロイ
git add .
git commit -m "Fix RLS policy for service role"
git push
```

### 4. 動作確認

1. アプリケーションにオーナーアカウントでログイン
2. ユーザー管理モーダルを開く
3. ユーザー一覧が表示されることを確認
4. ブラウザのコンソールで以下のログを確認:

```
📡 APIリクエスト送信中: /api/get-all-users
👤 ユーザー情報: [userId] [email]
📡 APIレスポンス: 200 OK
✅ ユーザー一覧取得成功: X 人
```

---

## 追加の修正内容

### デバッグログの追加

`api/get-all-users.js` と `api/delete-user.js` に詳細なデバッグログを追加しました:

```javascript
console.log('🔑 SUPABASE_URL:', process.env.SUPABASE_URL ? '設定済み' : '未設定');
console.log('🔑 SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '設定済み (長さ: ' + process.env.SUPABASE_SERVICE_KEY.length + ')' : '未設定');
console.error('❌ エラー詳細:', JSON.stringify(userError, null, 2));
```

これにより、Vercel のログで問題を追跡しやすくなります。

---

## トラブルシューティング

### エラー: 401 Unauthorized が継続する場合

1. **RLS ポリシーの確認**
   ```sql
   -- Supabase SQL Editor で実行
   SELECT * FROM pg_policies WHERE tablename = 'profiles';
   ```

   期待される結果:
   - `policyname`: "Enable all for service role"
   - `roles`: `{service_role}`
   - `qual`: `true`

2. **Service Role Key の確認**
   - Vercel のログで環境変数の長さを確認
   - 正しいキーは約 250 文字以上
   - `eyJ...` で始まる JWT 形式

3. **キャッシュのクリア**
   ```bash
   # Vercel でのキャッシュクリア
   vercel --force
   ```

### エラー: Environment variable not found

Vercel の環境変数が設定されていません:

1. Vercel Dashboard → Settings → Environment Variables
2. `SUPABASE_SERVICE_KEY` を追加
3. **All Environments** または **Production** を選択
4. 再デプロイ

### エラー: RLS policy prevents access

RLS ポリシーが誤って設定されています:

```sql
-- すべてのポリシーを確認
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
```

期待される出力:
```
policyname: "Enable all for service role"
roles: {service_role}
cmd: ALL
qual: true
```

---

## 予防策

### 1. RLS ポリシーのベストプラクティス

Service Role Key 用のポリシーは必ず以下の形式を使用:

```sql
CREATE POLICY "service_role_bypass"
  ON [table_name]
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**使ってはいけない形式:**
```sql
-- ❌ これは動作しません
USING (auth.role() = 'service_role')
```

### 2. 環境変数の管理

- `.env.example` ファイルを作成してテンプレートを提供
- Service Role Key は絶対に Git にコミットしない
- Vercel の Environment Variables で管理

### 3. デバッグログの活用

すべての API エンドポイントに以下のログを追加:

```javascript
console.log('🔑 環境変数チェック:', {
    url: process.env.SUPABASE_URL ? '設定済み' : '未設定',
    key: process.env.SUPABASE_SERVICE_KEY ? `設定済み (${process.env.SUPABASE_SERVICE_KEY.length}文字)` : '未設定'
});
```

---

## 参考資料

### Supabase 公式ドキュメント

- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Service Role Key](https://supabase.com/docs/guides/api/api-keys)
- [RLS Policies](https://supabase.com/docs/guides/database/postgres/row-level-security)

### 重要な概念

1. **Service Role Key vs Anon Key**
   - Anon Key: RLS が適用される（ユーザー認証が必要）
   - Service Role Key: RLS をバイパス可能（管理者権限）

2. **`auth.role()` の動作**
   - JWT トークンの `role` クレームを返す
   - Service Role Key では使用できない

3. **RLS ポリシーの優先度**
   - `TO service_role` が最も明示的
   - `USING (true)` ですべての行にアクセス可能

---

## まとめ

### 修正内容
✅ RLS ポリシーを `TO service_role` + `USING (true)` に変更
✅ デバッグログを追加
✅ エラーメッセージを詳細化

### 確認事項
- [ ] Supabase で SQL 実行
- [ ] Vercel の環境変数確認
- [ ] アプリケーションで動作確認
- [ ] ログでエラーがないことを確認

### 期待される結果
- ユーザー管理モーダルでユーザー一覧が表示される
- ユーザー削除機能が正常に動作する
- 401 Unauthorized エラーが発生しない
