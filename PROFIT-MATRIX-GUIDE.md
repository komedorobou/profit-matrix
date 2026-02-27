# PROFIT MATRIX — 完全ガイド

> **次世代AI利益計算SaaS — メルカリ仕入れ × Yahoo!ショッピング販売の利益率40%以上を自動抽出**

---

## 目次

1. [プロダクト概要](#1-プロダクト概要)
2. [解決する課題](#2-解決する課題)
3. [コアコンセプト](#3-コアコンセプト)
4. [機能一覧](#4-機能一覧)
5. [テクノロジースタック](#5-テクノロジースタック)
6. [システムアーキテクチャ](#6-システムアーキテクチャ)
7. [ディレクトリ構成](#7-ディレクトリ構成)
8. [データベース設計](#8-データベース設計)
9. [API エンドポイント一覧](#9-api-エンドポイント一覧)
10. [認証・ユーザーフロー](#10-認証ユーザーフロー)
11. [料金プラン・Stripe連携](#11-料金プランstripe連携)
12. [パートナー管理（オーナー機能）](#12-パートナー管理オーナー機能)
13. [LINE / メール通知](#13-line--メール通知)
14. [フロントエンド詳細](#14-フロントエンド詳細)
15. [セキュリティ・コンプライアンス](#15-セキュリティコンプライアンス)
16. [CI/CD・デプロイ](#16-cicdデプロイ)
17. [環境変数一覧](#17-環境変数一覧)
18. [パフォーマンス・制限事項](#18-パフォーマンス制限事項)
19. [アフィリエイトシステム](#19-アフィリエイトシステム)
20. [別PCでのセットアップ](#20-別pcでのセットアップ)

---

## 1. プロダクト概要

**PROFIT MATRIX** は、せどり（転売ビジネス）の利益計算を自動化するSaaS（Software as a Service）です。

### 一言で言うと

「メルカリで売れた商品のCSVをアップロードするだけで、Yahoo!ショッピングで利益率40%以上の商品を自動的に見つけてくれるツール」

### ビジネスモデル

| 項目 | 内容 |
|------|------|
| **ターゲット** | せどらー（メルカリ仕入れ → Yahoo販売） |
| **価値提案** | リサーチ3時間 → 15分に短縮 |
| **収益モデル** | 月額サブスクリプション（¥4,980〜¥19,800） |
| **ドメイン** | https://profit-matrix.jp |
| **運営者** | 北又淳（komedorobouinuzini@gmail.com） |

### なぜこのツールが必要なのか

従来のせどりリサーチは以下のような問題を抱えていました：

1. **膨大な手作業** — 1商品ずつ手動で価格比較、1日3時間以上かかる
2. **低利益率の罠** — 利益率10〜20%の商品ばかり掴んでしまう
3. **アカウントBANリスク** — スクレイピングツールを使うとアカウント凍結のリスク

PROFIT MATRIXはこれらを全て解決します。

---

## 2. 解決する課題

### Before（従来のリサーチ）

```
❌ メルカリの売れ筋商品を1つずつチェック
❌ Yahoo!ショッピングで手動価格検索
❌ Excelに1行ずつ転記して利益計算
❌ 1日3〜5時間かかる
❌ 利益率の高い商品を見逃す
❌ スクレイピングツールでBAN
```

### After（PROFIT MATRIXを使った場合）

```
✅ メルカリCSVをドラッグ&ドロップ
✅ Yahoo Shopping APIで自動一括検索
✅ 利益率40%以上の商品だけ自動フィルタ
✅ わずか15分で完了
✅ 取りこぼしゼロ
✅ 完全合法（公式API使用、スクレイピングなし）
```

---

## 3. コアコンセプト

### 処理の流れ

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  メルカリ     │     │ PROFIT MATRIX │     │ Yahoo Shopping  │
│  CSV/XLSX    │ ──→ │  (ブラウザ)    │ ──→ │  API V3         │
│  アップロード │     │  解析・検索    │     │  価格取得        │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                    ┌──────▼───────┐
                    │  利益計算     │
                    │  40%以上抽出  │
                    │  結果表示     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        カード表示    JSON保存     パートナー送信
        （ソート可）  （復元可）    （Email/LINE）
```

### 利益計算ロジック

```
仕入れ値 = メルカリ販売価格（CSVから取得）
販売価格 = Yahoo!ショッピング最安値（API検索）
利益額   = 販売価格 − 仕入れ値
利益率   = (利益額 ÷ 販売価格) × 100

→ 利益率40%以上の商品のみ表示
```

### 合法性について

- **メルカリ側**: ユーザーが自分でダウンロードしたCSVを使用。スクレイピング一切なし
- **Yahoo側**: Yahoo! Shopping API V3（公式提供）を使用。1日50,000リクエスト無料枠内
- **検索間隔**: APIリクエスト間に1秒のインターバルを設けてレートリミット遵守

---

## 4. 機能一覧

### 4.1 メイン機能：Yahoo検索モード

| 機能 | 詳細 |
|------|------|
| **CSVアップロード** | ドラッグ&ドロップ or クリック選択。CSV / XLSX / XLS対応 |
| **自動バッチ検索** | Yahoo Shopping API V3で1商品ずつ自動検索（1秒間隔） |
| **利益率フィルタ** | 40%以上の商品のみ抽出（設定変更可能） |
| **在庫フィルタ** | 「在庫不明」の商品を含める/除外する切り替え |
| **結果カード表示** | Yahoo価格、メルカリ平均、利益額、利益率%をカード形式で表示 |
| **直リンク** | Yahoo商品ページ / メルカリ売切れ検索への直リンク |
| **ソート** | 利益額順 / 利益率順 / 価格順 |
| **結果保存** | JSON形式で検索結果をエクスポート（Premium以上） |
| **結果復元** | 保存したJSONを読み込んで再表示 |
| **商品選択** | チェックボックスで複数商品を選択 → パートナーへ一括送信 |

### 4.2 認証機能

| 機能 | 詳細 |
|------|------|
| **新規登録** | メール + パスワード（8文字以上） |
| **ログイン** | メール + パスワード |
| **ログアウト** | セッション破棄 + localStorage クリア |
| **パスワードリセット** | メールでリセットリンク送信 |
| **パスワード変更** | 新パスワード確認入力 |

### 4.3 プラン管理

| 機能 | 詳細 |
|------|------|
| **トライアル** | 登録時に7日間の無料体験を自動付与 |
| **プラン選択** | Stripeチェックアウトで決済 |
| **プラン変更** | アップグレード / ダウングレード |
| **解約** | トライアル中は即時、有料プランは期間終了時 |
| **プラン表示** | 現在のプラン名、残日数、ステータスをUI上に表示 |
| **トライアルバナー** | 残り日数のカウントダウン表示 |

### 4.4 オーナー専用機能

| 機能 | 詳細 |
|------|------|
| **パートナー管理** | メール / LINE パートナーの追加・編集・削除 |
| **ユーザー管理** | 全ユーザー一覧表示、削除（ERASERアニメーション付き） |
| **商品送信** | 選択した商品をパートナーにメール / LINE で送信 |
| **設定モーダル** | パートナーボタン / ユーザーメール / 選択UIの表示切替 |
| **一斉送信** | 複数パートナーへの同時配信 |

### 4.5 通知機能

| 機能 | 詳細 |
|------|------|
| **ウェルカムメール** | 新規登録時の案内メール（Resend経由） |
| **カード登録完了メール** | トライアル開始確認 + API利用ガイド |
| **商品メール送信** | HTML形式の商品カード付きメール |
| **LINE通知** | Flex Messageカルーセル形式で商品送信 |
| **LINE自動追加** | LINEフォロー時にpending_partnersテーブルへ自動登録 |

---

## 5. テクノロジースタック

### フロントエンド

| 技術 | 用途 | 選定理由 |
|------|------|----------|
| **バニラJS (ES6)** | メインロジック（3,483行） | フレームワーク依存なし、軽量 |
| **HTML5** | ページ構造 | セマンティックHTML |
| **CSS3** | サイバーパンク風UI（42KB） | カスタムアニメーション、Glass-morphism |
| **SheetJS (xlsx)** | CSV / XLSX パース | クライアントサイドでのファイル解析 |
| **Inter / Space Grotesk** | Webフォント | サイバーパンクの近未来感 |

### バックエンド

| 技術 | 用途 | 選定理由 |
|------|------|----------|
| **Vercel Serverless Functions** | API エンドポイント | コールドスタート最小、自動スケール |
| **Node.js** | ランタイム | JavaScript統一 |

### データベース・認証

| 技術 | 用途 | 選定理由 |
|------|------|----------|
| **Supabase** | PostgreSQL + Auth + RLS | BaaS、無料枠あり、リアルタイム対応 |
| **Row Level Security** | データ保護 | ユーザーごとのアクセス制御 |

### 決済

| 技術 | 用途 | 選定理由 |
|------|------|----------|
| **Stripe** | サブスクリプション管理 | 日本対応、Webhook連携、7日トライアル |

### 通知

| 技術 | 用途 | 選定理由 |
|------|------|----------|
| **Resend** | メール送信 | モダンなEmail API、HTML対応 |
| **LINE Messaging API** | LINE通知 | 日本ユーザーへの最適なリーチ手段 |

### デプロイ・インフラ

| 技術 | 用途 | 選定理由 |
|------|------|----------|
| **Vercel** | ホスティング + CDN | mainブランチへのpushで自動デプロイ |
| **GitHub Actions** | CI/CD | 自動マージ + DBマイグレーション |

---

## 6. システムアーキテクチャ

```
                          ┌──────────────────────────────────┐
                          │         profit-matrix.jp          │
                          │         (Vercel CDN)              │
                          └──────────┬───────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
              ┌─────▼─────┐  ┌──────▼──────┐  ┌─────▼─────┐
              │ index.html │  │  lp/        │  │  法的ページ │
              │ app.js     │  │  index.html │  │  terms     │
              │ style.css  │  │  LP         │  │  privacy   │
              │ メインアプリ │  │  ランディング│  │  commerce  │
              └─────┬──────┘  └─────────────┘  └───────────┘
                    │
         ┌──────────┼──────────┬──────────────┐
         ▼          ▼          ▼              ▼
   ┌──────────┐ ┌────────┐ ┌────────┐  ┌──────────┐
   │ api/     │ │Supabase│ │ Stripe │  │   LINE   │
   │ search   │ │  Auth  │ │Checkout│  │Messaging │
   │ signup   │ │  DB    │ │Webhook │  │   API    │
   │ webhook  │ │  RLS   │ │  決済   │  │  通知    │
   │ email    │ │        │ │        │  │          │
   │ line     │ │        │ │        │  │          │
   └────┬─────┘ └────────┘ └────────┘  └──────────┘
        │
        ▼
  ┌───────────┐     ┌─────────┐
  │Yahoo API  │     │ Resend  │
  │Shopping   │     │ Email   │
  │V3 検索     │     │ 送信    │
  └───────────┘     └─────────┘
```

### リクエストフロー

**検索リクエスト:**
```
ブラウザ(app.js) → /api/search → Yahoo Shopping API V3 → JSON応答 → ブラウザで利益計算・表示
```

**決済フロー:**
```
プラン選択 → /api/create-checkout-session → Stripe Checkout画面
→ 決済完了 → Stripe Webhook → /api/stripe-webhook → Supabase profiles更新
```

**通知フロー:**
```
商品選択 → パートナー選択 → /api/send-email or /api/send-line → Resend or LINE API → 配信完了
```

---

## 7. ディレクトリ構成

```
profit-matrix/
│
├── index.html                    # メインアプリケーション（45KB）
│                                 # 認証画面、検索画面、結果表示、モーダル全て含む
│
├── app.js                        # コアロジック（3,483行 / 137KB）
│                                 # 認証、検索、結果処理、パートナー管理、
│                                 # プラン管理、オーナー機能、全てのUIロジック
│
├── style.css                     # サイバーパンクUI（42KB）
│                                 # ネオン、グロー、3Dアニメーション、
│                                 # Glass-morphism、レスポンシブ対応
│
├── commerce.html                 # 特定商取引法に基づく表記
├── privacy.html                  # プライバシーポリシー
├── terms.html                    # 利用規約
│
├── vercel.json                   # Vercel設定（cleanUrls、メモリ、キャッシュ）
├── package.json                  # 依存関係（Supabase SDK、Stripe SDK）
├── package-lock.json             # ロックファイル
├── CLAUDE.md                     # Claude Code用プロジェクト指示書
│
├── supabase-schema.sql           # DBスキーマ & トリガー定義
├── ultimate-profiles-setup.sql   # profiles テーブル完全セットアップ
│
├── api/                          # Vercel Serverless Functions
│   ├── search.js                 # Yahoo Shopping API プロキシ（CORS対応）
│   ├── create-checkout-session.js # Stripe チェックアウトセッション作成
│   ├── stripe-webhook.js         # Stripe Webhook処理（1,200行以上）
│   │                             # checkout完了、サブスク更新、請求書処理、
│   │                             # 重複カード検出、トライアル管理
│   ├── cancel-subscription.js    # サブスクリプション解約処理
│   ├── signup.js                 # ユーザー新規作成
│   ├── send-email.js             # パートナーへのHTML商品メール送信（Resend）
│   ├── send-line.js              # パートナーへのLINE Flex Message送信
│   ├── send-welcome-email.js     # ウェルカムメール / カード登録完了メール
│   ├── line-webhook.js           # LINEフォローイベント受信・自動登録
│   ├── get-all-users.js          # 全ユーザー取得（オーナー専用）
│   ├── delete-user.js            # ユーザー削除（オーナー専用）
│   └── delete-pending-user.js    # 未確認アカウント削除
│
├── lp/                           # ランディングページ
│   └── index.html                # ヒーロー / 機能紹介 / 料金 / FAQ / CTA
│
├── supabase/                     # Supabase設定
│   ├── config.toml               # ローカル開発設定
│   └── migrations/               # DBマイグレーションファイル
│
└── .github/
    └── workflows/
        ├── auto-merge-to-main.yml    # claude/*ブランチの自動マージ
        └── supabase-migrate.yml      # DBマイグレーション自動実行
```

---

## 8. データベース設計

### profiles テーブル

`auth.users` と1対1で連携。新規ユーザー作成時にトリガーで自動生成。

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | UUID (PK, FK) | auth.usersのidと連携 |
| `email` | TEXT | ユーザーのメールアドレス |
| `plan` | TEXT | `trial` / `starter` / `standard` / `premium` |
| `plan_expires_at` | TIMESTAMP | プランの有効期限 |
| `stripe_customer_id` | TEXT | StripeのカスタマーID |
| `stripe_subscription_id` | TEXT | StripeのサブスクリプションID |
| `subscription_status` | TEXT | `trial` / `trialing` / `active` / `canceled` / `past_due` |
| `card_fingerprint` | TEXT | クレジットカードのフィンガープリント（重複検出用） |
| `referred_by` | TEXT | アフィリエイトID（紹介元） |
| `created_at` | TIMESTAMP | 作成日時 |
| `updated_at` | TIMESTAMP | 更新日時 |

### pending_partners テーブル

LINE公式アカウントをフォローしたユーザーを一時保管。

| カラム | 型 | 説明 |
|--------|-----|------|
| `line_id` | TEXT | LINEのユーザーID |
| `display_name` | TEXT | LINEの表示名 |
| `status` | TEXT | `pending` / `approved` |

### RLS（Row Level Security）

- `profiles` テーブルでRLS有効
- ユーザーは自分自身のレコードのみ読み書き可能
- サービスロールキー経由のAPI呼び出しはRLSをバイパス

### 自動トリガー

```sql
-- auth.usersに新規レコード挿入時、profilesに自動作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- handle_new_user()の処理:
--   plan = 'trial'
--   subscription_status = 'trial'
--   plan_expires_at = NOW() + 7 days
```

---

## 9. API エンドポイント一覧

### GET `/api/search` — Yahoo検索プロキシ

Yahoo Shopping API V3へのプロキシ。CORSヘッダーを付与してブラウザから直接呼び出し可能にする。

```
パラメータ:
  appid   : Yahoo APIのアプリケーションID（必須）
  query   : 検索キーワード（必須）
  price_to: 上限価格（任意）
  results : 取得件数（デフォルト30）
  sort    : ソート順（任意）

レスポンス: Yahoo Shopping API V3のJSONレスポンスをそのまま返却
CORS: Access-Control-Allow-Origin: *
メモリ: 1024MB / タイムアウト: 10秒
```

### POST `/api/create-checkout-session` — Stripe決済セッション作成

```
リクエストボディ:
  {
    "plan": "starter" | "standard" | "premium",
    "userId": "UUID",
    "customerEmail": "user@example.com",
    "trial": true | false
  }

レスポンス:
  {
    "sessionId": "cs_xxxx",
    "url": "https://checkout.stripe.com/..."
  }

処理内容:
  - Stripeチェックアウトセッション作成
  - 7日間トライアルオプション
  - アフィリエイトIDをmetadataに保存
  - success_url / cancel_url の設定
```

### POST `/api/stripe-webhook` — Stripe Webhook処理

最も複雑なエンドポイント（1,200行以上）。Stripeからの各種イベントを処理。

```
処理するイベント:

1. checkout.session.completed
   → プラン有効化
   → stripe_customer_id / subscription_id 保存
   → カードフィンガープリント取得・重複検出
   → 重複カードの場合は自動キャンセル

2. customer.subscription.created
   → サブスクリプション記録

3. customer.subscription.updated
   → ステータス同期（active / trialing / past_due / canceled）

4. customer.subscription.deleted
   → trialプランにダウングレード

5. invoice.payment_succeeded
   → subscription_status = 'active'

6. invoice.payment_failed
   → subscription_status = 'past_due'

セキュリティ: Webhook署名検証（STRIPE_WEBHOOK_SECRET）
```

### POST `/api/cancel-subscription` — 解約処理

```
リクエストボディ: { "userId": "UUID" }

処理ロジック:
  - trialing中 → 即時キャンセル
  - active → 期間終了時にキャンセル（cancel_at_period_end）

レスポンス: { "message": "キャンセル完了メッセージ" }
```

### POST `/api/signup` — ユーザー新規作成

```
リクエストボディ: { "email": "...", "password": "..." }

処理:
  1. Supabase Auth でユーザー作成
  2. 自動トリガーで profiles レコード生成
     (plan='trial', 7日間有効)
  3. ユーザーデータ返却
```

### POST `/api/send-email` — 商品メール送信

```
リクエストボディ:
  {
    "to": "partner@example.com",
    "partnerName": "パートナー名",
    "products": [
      {
        "name": "商品名",
        "yahooPrice": 5000,
        "mercariAvg": 2000,
        "profit": 3000,
        "profitRate": 60,
        "yahooUrl": "https://..."
      }
    ]
  }

処理: Resend API経由でHTML形式の商品カードメール送信
各商品にYahoo価格、メルカリ平均、利益額、利益率%を表示
```

### POST `/api/send-line` — LINE通知送信

```
リクエストボディ:
  {
    "userId": "LINE_USER_ID",
    "partnerName": "パートナー名",
    "products": [商品配列]
  }

処理:
  - Flex Messageカルーセル形式で送信
  - 1メッセージあたり最大10商品
  - 10商品超は複数メッセージに分割
  - 各カードにYahoo商品ページへのボタン付き
```

### POST `/api/send-welcome-email` — ウェルカムメール

```
リクエストボディ:
  {
    "to": "user@example.com",
    "type": "signup" | "credit_registered"
  }

タイプ別内容:
  - signup: オンボーディングメール
  - credit_registered: トライアル開始確認 + API利用ガイド
```

### POST `/api/line-webhook` — LINE Webhook受信

```
処理するイベント:
  - follow: pending_partnersテーブルに自動保存
  - message: ログ記録（将来のチャットボット用）
```

### GET `/api/get-all-users` — 全ユーザー取得（オーナー専用）

```
パラメータ: userId, userEmail
認証: userEmailに 'komedorobouinuzini' が含まれること
レスポンス: 全ユーザーのプラン・ステータス情報
```

### DELETE `/api/delete-user` — ユーザー削除（オーナー専用）

```
リクエストボディ:
  {
    "requestUserId": "オーナーのUUID",
    "requestUserEmail": "オーナーのメール",
    "userId": "削除対象のUUID"
  }

処理: profiles + auth.users の両方を削除
安全措置: オーナーアカウント自身の削除は不可
```

---

## 10. 認証・ユーザーフロー

### 新規登録フロー（詳細）

```
Step 1: ユーザーがメール + パスワードを入力
         ↓
Step 2: /api/signup → Supabase Auth にユーザー作成
         ↓
Step 3: DBトリガー発火 → profiles テーブルに自動挿入
         plan = 'trial'
         subscription_status = 'trial'
         plan_expires_at = NOW() + 7日
         ↓
Step 4: ウェルカムメール送信（/api/send-welcome-email）
         ↓
Step 5: プラン選択画面表示
         ↓
Step 6: Stripeチェックアウト（/api/create-checkout-session）
         ↓
Step 7: 決済完了 → Stripe Webhook 発火
         ↓
Step 8: /api/stripe-webhook が profiles を更新
         stripe_customer_id = 'cus_xxxxx'
         stripe_subscription_id = 'sub_xxxxx'
         plan = 選択したプラン
         subscription_status = 'trialing' or 'active'
         ↓
Step 9: カード登録完了メール送信
         ↓
Step 10: ユーザーが検索機能を利用可能に
```

### ログインフロー

```
メール + パスワード入力
  ↓
Supabase Auth 認証
  ↓
onAuthStateChange イベント発火
  ↓
profiles テーブルからプラン情報取得
  ↓
プラン有効性チェック
  - trial: plan_expires_at が未来ならOK
  - active/trialing: StripeステータスがOK
  - canceled/past_due: アップグレード誘導
  ↓
APIキーをlocalStorageから読み込み
  ↓
検索画面表示
```

### クレジットカード未登録の場合

```
ログイン成功
  ↓
stripe_customer_id が null かチェック
  ↓
null かつ オーナーでない かつ 登録直後でない場合:
  ↓
/api/delete-pending-user で未確認アカウント削除
  ↓
自動ログアウト
  ↓
「カード登録が必要です」メッセージ表示
```

### トライアル期限切れ

```
subscription_status = 'trial' かつ plan_expires_at < 現在時刻
  ↓
モーダル表示:「アップグレードして継続してください」
  ↓
選択肢: アップグレード or ログアウト
```

---

## 11. 料金プラン・Stripe連携

### プラン一覧

| プラン | 月額 | CSV上限 | 利益率フィルタ | 結果保存 | Stripe Price ID |
|--------|------|---------|---------------|---------|-----------------|
| **Trial** | 無料 | 300行/検索 | 40%以上 | ❌ | — |
| **Starter** | ¥4,980 | 100行/検索 | カスタム | ❌ | `price_1SNpkQJW7T60nZZ97xEdclN9` |
| **Standard** | ¥9,800 | 300行/検索 | カスタム | ❌ | `price_1SNpmVJW7T60nZZ9FyEC1JoP` |
| **Premium** | ¥19,800 | 無制限 | カスタム | ✅ | `price_1SNpnmJW7T60nZZ9yM6FLuem` |

### Stripe連携の仕組み

```
Stripe Checkout（決済ページ）
  ↓ 決済完了
Stripe → Webhook POST → /api/stripe-webhook
  ↓
Webhook署名検証（STRIPE_WEBHOOK_SECRET）
  ↓
イベント種別ごとに処理分岐
  ↓
Supabase profiles テーブル更新
```

### 重複カード検出

不正利用（同じカードで複数アカウント作成→無限トライアル）を防止：

```
1. checkout.session.completed 時にカードのフィンガープリント取得
2. profiles テーブルの card_fingerprint と照合
3. 同じフィンガープリントが既に存在する場合:
   → サブスクリプション即時キャンセル
   → ユーザーに通知
```

---

## 12. パートナー管理（オーナー機能）

### 概要

オーナー（`komedorobouinuzini` を含むメールアドレス）専用の機能。見つけた利益商品をパートナー（仲間のせどらー）にメールやLINEで共有できる。

### パートナーの種類

| 種類 | 送信手段 | 登録方法 |
|------|---------|---------|
| **メールパートナー** | HTMLメール（Resend） | 手動追加（メールアドレス入力） |
| **LINEパートナー** | Flex Message | LINE公式フォロー → 自動登録 → 承認 |

### パートナー管理フロー

```
┌──────────────────────────────────────────┐
│         パートナー管理モーダル             │
├──────────────────────────────────────────┤
│                                          │
│  [承認済み] タブ    [承認待ち] タブ        │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │ 名前: 田中太郎                    │    │
│  │ メール: tanaka@example.com       │    │
│  │ LINE ID: U1234567890             │    │
│  │ [編集] [削除]                     │    │
│  └──────────────────────────────────┘    │
│                                          │
│  [+ パートナー追加]                       │
│                                          │
└──────────────────────────────────────────┘
```

### 商品送信フロー

```
1. 検索結果からチェックボックスで商品を選択
2. 「パートナーに送信」ボタンをクリック
3. 送信先パートナーを選択
4. 送信方法を選択（メール or LINE）
5. 確認ダイアログ
6. /api/send-email or /api/send-line を呼び出し
7. 送信完了通知
```

### オーナー設定

localStorageに保存される表示設定：

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| パートナーボタン表示 | パートナー管理ボタンの表示/非表示 | ON |
| ユーザーメール表示 | ユーザー一覧でメールを表示/マスク | ON |
| 選択UI表示 | 商品カードのチェックボックス表示/非表示 | ON |

---

## 13. LINE / メール通知

### LINE Messaging API 連携

#### 自動パートナー登録フロー

```
ユーザーがLINE公式アカウントをフォロー
  ↓
LINE Platform → POST /api/line-webhook（followイベント）
  ↓
LINE APIからプロフィール取得（display_name）
  ↓
pending_partners テーブルに保存
  status = 'pending'
  ↓
オーナーがパートナー管理画面で「承認待ち」を確認
  ↓
承認 → status = 'approved' → 通知送信可能に
```

#### Flex Message形式

```json
{
  "type": "flex",
  "altText": "利益商品情報",
  "contents": {
    "type": "carousel",
    "contents": [
      {
        "type": "bubble",
        "body": {
          "商品名",
          "Yahoo価格: ¥5,000",
          "メルカリ平均: ¥2,000",
          "利益: ¥3,000 (60%)"
        },
        "footer": {
          "Yahoo商品ページを見る（ボタン）"
        }
      }
    ]
  }
}
```

- 1メッセージあたり最大10商品（LINEの制限）
- 10商品超は自動的に複数メッセージに分割

### Resend メール連携

#### 商品メールの内容

プロフェッショナルなHTML形式で各商品をカード表示：

```
┌─────────────────────────────────┐
│  🔥 利益商品のお知らせ            │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 商品名: ○○○○○             │  │
│  │ Yahoo価格: ¥5,000         │  │
│  │ メルカリ平均: ¥2,000       │  │
│  │ 利益額: ¥3,000            │  │
│  │ 利益率: 60%               │  │
│  │ [Yahoo商品ページ]          │  │
│  └───────────────────────────┘  │
│                                 │
│  （商品カードが複数並ぶ）         │
└─────────────────────────────────┘
```

---

## 14. フロントエンド詳細

### デザインテーマ：サイバーパンク

近未来的なハッカー風UIで、ユーザーに「プロツール」感を演出。

#### カラースキーム

| 用途 | カラー | コード |
|------|--------|--------|
| プライマリ | ネオングリーン | `#00FFA3` |
| セカンダリ | シアンブルー | `#00B8D9` |
| アクセント | ピンク | `#FF6B9D` |
| 背景 | ピュアブラック | `#000000` |
| テキスト | ホワイト系 | `rgba(255,255,255,0.9)` |

#### エフェクト

| エフェクト | 適用箇所 | 技術 |
|-----------|---------|------|
| **3D回転キューブ** | CSVアップロードエリア | CSS transform + keyframes |
| **ネオングロー** | ボタン、ボーダー | box-shadow + text-shadow |
| **グラデーションテキスト** | タイトル、見出し | background-clip: text |
| **Glass-morphism** | カード、モーダル | backdrop-filter: blur() |
| **スキャンライン** | 検索中アニメーション | linear-gradient animation |
| **パルスエフェクト** | 通知、ステータス表示 | scale + opacity animation |
| **ERASERアニメーション** | ユーザー削除時 | カスタム消去エフェクト |

#### フォント

- **本文**: Inter（ウェイト: 300〜900）
- **見出し**: Space Grotesk（近未来感）
- **letter-spacing**: やや広め（サイバーパンク感）

### app.js の主要関数（3,483行）

#### 認証ハンドラー

| 関数名 | 行数目安 | 処理 |
|--------|---------|------|
| `handleLogin()` | — | Supabase Auth でメール/パスワード認証 |
| `handleSignup()` | — | アカウント作成 → Stripeチェックアウトフロー |
| `handleLogout()` | — | localStorage クリア + Supabase signOut |
| `handlePasswordReset()` | — | リセットメール送信 |
| `handlePasswordUpdate()` | — | 新パスワード確認・更新 |

#### プラン管理

| 関数名 | 処理 |
|--------|------|
| `checkPlanStatus()` | トライアル/サブスクのステータス検証 |
| `selectPlan(plan)` | Stripeチェックアウトを開く |
| `handleCancelSubscription()` | 解約処理の開始 |
| `updatePlanDisplay()` | UIにプラン情報を反映 |
| `showTrialBanner(daysLeft)` | トライアル残日数カウントダウン |

#### 検索・結果処理

| 関数名 | 処理 |
|--------|------|
| `performBatchSearch()` | Yahoo APIへ1秒間隔でバッチ検索実行 |
| `searchProduct(brand, product)` | 単一商品のAPI検索 |
| `displayResults(results)` | 結果をカード形式でレンダリング |
| `sortResults()` | 利益額/利益率/価格でソート |
| `selectProduct(id)` | チェックボックスの選択ロジック |
| `saveSearchResultsToFile()` | JSON形式でエクスポート |
| `restoreFromFile()` | 保存済みJSONを読み込み |

#### CSV処理

| 関数名 | 処理 |
|--------|------|
| `handleCSVUpload(file)` | SheetJSでCSV/XLSXをパース |
| `extractProductData(sheet)` | ブランド/商品名/価格カラムを抽出 |
| `validateCSVFormat()` | 必須カラムの存在チェック |

#### パートナー管理

| 関数名 | 処理 |
|--------|------|
| `openPartnersModal()` | パートナーCRUD画面表示 |
| `savePartner()` | パートナー追加/編集 |
| `loadPartners()` | DBからパートナー一覧取得 |
| `switchPartnerTab(tab)` | 承認済み/承認待ちタブ切替 |
| `confirmSend()` | 選択商品をパートナーに送信 |

---

## 15. セキュリティ・コンプライアンス

### データ保護

| 対策 | 詳細 |
|------|------|
| **RLS** | profiles テーブルに行レベルセキュリティ設定 |
| **APIキー管理** | Yahoo APIキーはlocalStorageに保存（サーバーに送信しない） |
| **CSV処理** | クライアントサイドのみ（サーバーにアップロードしない） |
| **HTTPS** | Vercelによる強制HTTPS |
| **Webhook検証** | Stripe Webhook署名の検証 |
| **オーナー認証** | メールアドレスベースのオーナー判定 |
| **重複カード検出** | card_fingerprint で不正利用を防止 |

### 法的ページ

| ページ | パス | 内容 |
|--------|------|------|
| 利用規約 | `/terms` | サービス利用条件、免責事項 |
| プライバシーポリシー | `/privacy` | データ収集・処理方針 |
| 特定商取引法表記 | `/commerce` | 日本の法律で必須の事業者情報 |

### Yahoo API コンプライアンス

- Yahoo Shopping API V3（公式提供）を使用
- 1日50,000リクエストの無料枠内で運用
- リクエスト間に1秒インターバル（レートリミット遵守）
- APIの利用規約に完全準拠

### メルカリに関する安全性

- メルカリAPIへの直接アクセスは**一切なし**
- ユーザーが自分でダウンロードしたCSVデータのみ使用
- スクレイピング・自動操作なし
- 完全に合法的なアプローチ

---

## 16. CI/CD・デプロイ

### デプロイフロー

```
開発者がコード変更
  ↓
claude/* ブランチにプッシュ
  ↓
GitHub Actions: auto-merge-to-main.yml
  ↓
main ブランチに自動マージ
  ↓
Vercel が main ブランチの変更を検知
  ↓
自動ビルド & デプロイ
  ↓
https://profit-matrix.jp に反映
```

### GitHub Actions ワークフロー

#### `auto-merge-to-main.yml`

- **トリガー**: `claude/*` ブランチへのプッシュ
- **処理**: main ブランチへの自動マージ
- **目的**: Claude Codeで作成したブランチをシームレスにデプロイ

#### `supabase-migrate.yml`

- **トリガー**: `supabase/migrations/` 配下の変更
- **処理**: Supabase CLIでマイグレーション実行
- **シークレット**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`

### Vercel設定

```json
{
  "cleanUrls": true,          // .html拡張子なしでアクセス可能
  "functions": {
    "api/search.js": {
      "memory": 1024,          // 検索API用のメモリ増量
      "maxDuration": 10        // タイムアウト10秒
    }
  }
}
```

---

## 17. 環境変数一覧

### Vercel環境変数

| 変数名 | 用途 | 例 |
|--------|------|-----|
| `SUPABASE_URL` | Supabase APIエンドポイント | `https://czwwlrrgtmiagujdjxdr.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabaseサービスロールキー | `eyJhbG...` |
| `STRIPE_SECRET_KEY` | Stripeシークレットキー | `sk_live_xxxxx` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook署名シークレット | `whsec_xxxxx` |
| `NEXT_PUBLIC_BASE_URL` | サイトのベースURL | `https://profit-matrix.jp` |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging APIトークン | `xxxxx` |
| `RESEND_API_KEY` | Resend APIキー | `re_xxxxx` |

### GitHub Secrets

| 変数名 | 用途 |
|--------|------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI認証 |
| `SUPABASE_DB_PASSWORD` | DB接続パスワード |
| `SUPABASE_PROJECT_REF` | プロジェクトID（`czwwlrrgtmiagujdjxdr`） |

### ローカル（.mcp.json）

- `.gitignore` に含まれているためリポジトリには含まれない
- Supabase MCP、GitHub MCP、Fetch MCPのトークンを格納
- 別PCでのセットアップ時はバックアップからコピーが必要

---

## 18. パフォーマンス・制限事項

### プラン別制限

| プラン | CSV行数上限 | 検索速度（目安） |
|--------|-----------|----------------|
| Trial | 300行 | 約5分（300商品 × 1秒） |
| Starter | 100行 | 約1分40秒 |
| Standard | 300行 | 約5分 |
| Premium | 無制限 | 商品数に比例 |

### パフォーマンス特性

| 処理 | 所要時間 |
|------|---------|
| CSVパース | < 1秒（2,000行以上でも） |
| 結果レンダリング | < 1秒 |
| 1商品の検索 | 約1秒（APIインターバル含む） |
| 100商品の検索 | 約100秒 |
| 300商品の検索 | 約300秒（5分） |

### ブラウザ対応

| ブラウザ | サポート |
|---------|---------|
| Chrome（最新版） | ✅ |
| Edge（最新版） | ✅ |
| Firefox（最新版） | ✅ |
| Safari（最新版） | ✅ |

### Yahoo API制限

- 1日50,000リクエスト（無料枠）
- 1回の検索で最大30件取得
- 検索間隔: 1秒（自主的なレートリミット）

---

## 19. アフィリエイトシステム

### 概要（計画中）

紹介者にコミッションを支払うアフィリエイトプログラム。

### URL構造

```
https://profit-matrix.jp?ref=affiliate123
```

### トラッキングフロー

```
1. アフィリエイトURLでサイトにアクセス
2. ref パラメータを30日間Cookieに保存
3. ユーザーが新規登録
4. Stripeチェックアウト時にmetadataにアフィリエイトIDを付与
5. Webhook処理時にconversionsテーブルに記録
6. 有料プラン契約 → 50%のコミッション発生
```

### コミッション率

| プラン | 月額 | コミッション（50%） |
|--------|------|-------------------|
| Starter | ¥4,980 | ¥2,490 |
| Standard | ¥9,800 | ¥4,900 |
| Premium | ¥19,800 | ¥9,900 |

---

## 20. 別PCでのセットアップ

### 手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/your-username/profit-matrix.git

# 2. .mcp.json をバックアップからコピー
#    （.gitignoreに入っているためリポジトリには含まれない）
cp /path/to/backup/.mcp.json ./profit-matrix/

# 3. 完了！
#    トークン類は全て .mcp.json に含まれている
```

### 必要なもの

- Node.js
- Git
- `.mcp.json` のバックアップ（Supabase/GitHub/Fetch MCPのトークン含む）

### ローカル開発

```bash
# Vercel CLIでローカルサーバー起動
npx vercel dev

# Supabase CLIでローカルDB起動（任意）
npx supabase start
```

---

## まとめ

**PROFIT MATRIX** は以下の特徴を持つ、本格的なプロダクション対応SaaSです：

| 特徴 | 詳細 |
|------|------|
| **完全合法** | 公式API使用、スクレイピングなし |
| **自動化** | CSV → 利益商品抽出を全自動 |
| **サイバーパンクUI** | ネオン×ブラックの近未来デザイン |
| **多層サブスクリプション** | Trial / Starter / Standard / Premium |
| **不正利用防止** | 重複カード検出、RLS |
| **パートナー連携** | Email + LINE での商品共有 |
| **CI/CD完備** | プッシュ → 自動マージ → 自動デプロイ |
| **モダンスタック** | Vercel + Supabase + Stripe + Resend + LINE |

---

*最終更新: 2026-02-27*
