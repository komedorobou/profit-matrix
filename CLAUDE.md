# PROFIT MATRIX

## プロジェクト概要
Yahoo Shopping APIを使ったせどり利益計算SaaS。メルカリ仕入れ → Yahoo販売の利益率40%以上を自動抽出。

## テックスタック
- フロントエンド: バニラJS + HTML + CSS（サイバーパンク風UI）
- バックエンド: Vercel Serverless Functions (Node.js)
- DB/認証: Supabase (PostgreSQL + Auth)
- 決済: Stripe（¥4,980〜¥19,800/月のサブスク）
- メール: Resend
- 通知: LINE Messaging API
- デプロイ: Vercel（自動デプロイ on mainブランチ）
- ドメイン: https://profit-matrix.jp

## Supabase
- プロジェクトリファレンス: czwwlrrgtmiagujdjxdr
- URL: https://czwwlrrgtmiagujdjxdr.supabase.co
- テーブル: profiles（ユーザー情報、プラン、Stripe ID等）
- RLS有効、auth.usersとprofilesの自動連携トリガーあり

## GitHub Secrets（設定済み）
- SUPABASE_ACCESS_TOKEN
- SUPABASE_DB_PASSWORD
- SUPABASE_PROJECT_REF (czwwlrrgtmiagujdjxdr)

## MCP設定（.mcp.json / .gitignore済み）
- Supabase MCP: 設定済み（トークン入り）
- GitHub MCP: 設定済み（PAT入り）
- Fetch MCP: 設定済み
- Stripe MCP: 未設定（シークレットキー未入力）

## 料金プラン
| プラン | 月額 | CSV上限 |
|--------|------|---------|
| Trial | 無料 | 300行（7日間） |
| Starter | ¥4,980 | 100行/検索 |
| Standard | ¥9,800 | 300行/検索 |
| Premium | ¥19,800 | 無制限 |

## CI/CD
- .github/workflows/auto-merge-to-main.yml: claude/*ブランチをmainに自動マージ
- .github/workflows/supabase-migrate.yml: DBマイグレーション自動実行

## ディレクトリ構成
- index.html / app.js / style.css: メインアプリ
- api/: Vercel Serverless Functions（search, checkout, webhook, email, LINE等）
- supabase/: config.toml + migrations/
- lp/: ランディングページ

## オーナー機能
- メールに `komedorobouinuzini` が含まれるユーザーがオーナー
- パートナー管理、メール/LINE一斉送信、設定モーダル等

## 別PCでの立ち上げ
1. git clone する
2. .mcp.json をバックアップからコピーする（.gitignoreに入ってるため）
3. それだけでOK（トークン類は.mcp.jsonに含まれている）
