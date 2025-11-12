# 緊急修正: ユーザー管理機能 401 エラー

## 問題
```
401 Unauthorized: User not found
```

## 原因
**RLS ポリシーが Service Role Key をブロック**

`ultimate-profiles-setup.sql` の以下のポリシーが間違っています:
```sql
USING (auth.role() = 'service_role')  -- ❌ 動作しない
```

`auth.role()` は Service Role Key では `NULL` を返すため、ポリシーが適用されません。

---

## 修正手順（3分で完了）

### 1. Supabase でSQL実行（必須）

**Supabase Dashboard** → **SQL Editor** → 以下を実行:

```sql
DROP POLICY IF EXISTS "Enable all for service role" ON public.profiles;

CREATE POLICY "Enable all for service role"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### 2. 環境変数確認（必要に応じて）

**Vercel Dashboard** → **Settings** → **Environment Variables**

以下が設定されているか確認:
```
SUPABASE_URL=https://czwwlrrgtmiagujdjxdr.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (約250文字)
```

もし未設定なら:
1. Supabase Dashboard → Settings → API → service_role key をコピー
2. Vercel で環境変数に追加
3. 再デプロイ

### 3. 動作確認

1. アプリにオーナーアカウントでログイン
2. ユーザー管理ボタンをクリック
3. ユーザー一覧が表示されればOK ✅

---

## トラブルシューティング

**まだ 401 エラーが出る場合:**

1. **Vercel のログを確認**
   ```
   🔑 SUPABASE_SERVICE_KEY: 設定済み (長さ: 250+)
   ```
   長さが 250 文字以上でなければキーが間違っています

2. **再デプロイ**
   ```bash
   vercel --prod --force
   ```

3. **ブラウザキャッシュをクリア**
   - Ctrl+Shift+R (Windows/Linux)
   - Cmd+Shift+R (Mac)

---

## 詳細情報

詳しい説明は `RLS-FIX-GUIDE.md` を参照してください。
