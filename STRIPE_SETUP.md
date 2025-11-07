# Stripe連携セットアップガイド

## 🎯 完了した作業

✅ Stripe Checkout API作成
✅ Stripe Webhook API作成
✅ selectPlan関数をStripe連携に更新
✅ 支払い成功/キャンセル処理実装
✅ package.jsonにStripe SDK追加

---

## ⚙️ 次のステップ: 環境変数設定

### 1. Vercelにログイン
https://vercel.com にアクセスして、profit-matrixプロジェクトを開く

### 2. 環境変数を設定
**Settings** → **Environment Variables** から以下を追加：

#### Stripe設定

```
STRIPE_SECRET_KEY
値: sk_live_xxxxx（先ほど作成したシークレットキー）
環境: Production, Preview, Development
```

```
STRIPE_WEBHOOK_SECRET
値: (後で取得します - 手順3で)
環境: Production, Preview, Development
```

#### Supabase設定（既にあれば不要）

```
SUPABASE_URL
値: https://xxxxx.supabase.co
環境: Production, Preview, Development
```

```
SUPABASE_SERVICE_KEY
値: (Supabaseの Service Role Key)
環境: Production, Preview, Development
```

#### アプリケーション設定

```
NEXT_PUBLIC_BASE_URL
値: https://profit-matrix.jp
環境: Production, Preview, Development
```

---

### 3. Stripe WebhookのSecretを取得

#### 3-1. Webhookエンドポイントを登録

1. **Stripe Dashboard** にログイン
   https://dashboard.stripe.com/webhooks

2. 本番モードに切り替え（右上のトグルをOFF）

3. **「エンドポイントを追加」**をクリック

4. エンドポイントURLを入力:
   ```
   https://profit-matrix.jp/api/stripe-webhook
   ```

5. **リッスンするイベント**を選択:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

6. **「エンドポイントを追加」**をクリック

#### 3-2. Webhook Secretをコピー

1. 作成したエンドポイントをクリック

2. **「署名シークレット」**セクションで **「表示」**をクリック

3. `whsec_` で始まるキーをコピー

4. **Vercelの環境変数**に追加:
   ```
   STRIPE_WEBHOOK_SECRET = whsec_xxxxx
   ```

---

### 4. Supabase SQLを実行

1. **Supabase Dashboard** にログイン
   https://app.supabase.com

2. 左メニュー → **SQL Editor**

3. `supabase-schema.sql` の内容をコピー＆ペースト

4. **Run** をクリック

これで以下が設定されます：
- プロフィールテーブルにプラン情報追加
- 新規ユーザーに7日間トライアル自動付与
- プランチェック関数作成

---

### 5. デプロイ

環境変数を設定したら、自動的に再デプロイされます。

または、手動でデプロイ:
```bash
cd /mnt/c/Users/komed/Desktop/profit-matrix
git add -A
git commit -m "Stripe連携実装完了"
git push origin main
```

---

## 🧪 テスト方法

### 1. ローカルテスト（オプション）

```bash
# 依存関係をインストール
npm install

# .env.localファイルを作成
cp .env.example .env.local

# 環境変数を設定（.env.local）

# Vercel Devサーバー起動
npm run dev
```

### 2. 本番環境でテスト

1. https://profit-matrix.jp にアクセス

2. 新規登録（テスト用メールアドレス）

3. プラン選択ボタンをクリック

4. Stripeのテストカードで決済:
   ```
   カード番号: 4242 4242 4242 4242
   有効期限: 任意の未来の日付
   CVC: 任意の3桁
   郵便番号: 任意
   ```

5. 決済完了 → profit-matrix.jpにリダイレクト

6. プランが有効化されているか確認

---

## ⚠️ 重要な注意事項

### セキュリティ

- **シークレットキーは絶対に公開しない**
- GitHubにコミットしない（.gitignoreに追加済み）
- 環境変数はVercelのみに保存

### Webhook

- WebhookのURLは公開されているので、署名検証が必須
- `STRIPE_WEBHOOK_SECRET` がないとWebhookが動作しない

### トライアル期限

- 新規ユーザーは7日間無料トライアル
- 期限切れ後は検索機能がブロックされる
- プラン購入で即座に解除

---

## 📋 チェックリスト

- [ ] Vercelに環境変数を設定
  - [ ] STRIPE_SECRET_KEY
  - [ ] STRIPE_WEBHOOK_SECRET
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_SERVICE_KEY
  - [ ] NEXT_PUBLIC_BASE_URL

- [ ] Stripe Webhookエンドポイントを登録
  - [ ] https://profit-matrix.jp/api/stripe-webhook
  - [ ] 6つのイベントをリッスン

- [ ] Supabase SQLを実行
  - [ ] profiles テーブル更新
  - [ ] トリガー作成

- [ ] デプロイ完了

- [ ] テスト決済実行

---

## 🎉 完了後

全て完了したら、以下が使えるようになります：

✅ 7日間無料トライアル（自動付与）
✅ プラン選択 → Stripe決済
✅ 自動プラン有効化
✅ 行数制限の適用
✅ トライアル期限管理

お疲れ様でした！🎊
