---
name: browser-verify-loop-ultimate
description: Playwright MCPによるブラウザ検証・監査人レビュー・テスト自動生成・パフォーマンス計測を含む究極の開発ループスキル。
license: MIT
metadata:
  author: OKOME
  version: "6.0.0"
  browser_tool: Playwright MCP (single stack)
---

# Browser Verify Loop — ULTIMATE Edition (Playwright MCP Single Stack)

全部盛り。コスト度外視。品質だけを追求する開発検証ループ。
**ブラウザツールはPlaywright MCPに一本化。** 分岐なし、迷いなし。

---

## Mode: FULL EFFORT

このスキルを実行する時は以下を守れ：

- 推測で「できた」と言うな。確認しろ。
- 「たぶん動く」は禁止。動かして見ろ。
- エラーを1つ見つけたら、他にもないか疑え。
- 楽な方に逃げるな。全ページ、全操作、全パターン。
- 省略していい工程はない。
- 「まぁこれでええやろ」は禁止。お前が甘いと思った瞬間、Phase 2.5の監査人が落とす。

---

## 鉄則

1. コードを変更したら**必ずブラウザで確認**する。コードだけ見て「直った」と言うな。
2. 操作したら**必ずスナップショット**を撮る。撮らずに判断するな。
3. エラーが**ゼロになるまでループを止めるな**。
4. ユーザーに「できました」と報告するのは**監査人が通した後**だけ。
5. **ソースコードを読んでからデバッグしろ**。闇雲にブラウザだけ見るな。
6. **テストコードを残せ**。検証したら自動テストとして保存しろ。
7. **ネットワークとパフォーマンスも見ろ**。画面が正しくても遅ければバグだ。

---

## 全体フロー

```
Phase 1:   PLAN（計画）
Phase 2:   DEVELOP & VERIFY（開発 & 検証ループ）
Phase 2.5: AUDIT（監査人によるレビュー）← NEW
Phase 3:   TEST（テスト自動生成）
Phase 4:   REPORT（最終報告）
```

```
Phase 2 → 「全部OK」 → Phase 2.5 監査人起動
                          ↓ 問題あり → Phase 2 に差し戻し
                          ↓ 問題なし → Phase 3 へ
```

---

## ブラウザツール: Playwright MCP（固定）

全てのブラウザ操作はPlaywright MCPのツールを使う。他のツールは使わない。

### 利用可能なツール一覧

| カテゴリ | ツール | 用途 |
|----------|--------|------|
| 基本操作 | `browser_navigate` | URLへ遷移 |
| 確認 | `browser_snapshot` | ページのスナップショット取得（**最頻出**） |
| 確認 | `browser_screenshot` | スクリーンショット画像取得（レイアウト・色確認時のみ） |
| 操作 | `browser_click` | 要素クリック（ref指定） |
| 操作 | `browser_type` | テキスト入力（ref指定） |
| 操作 | `browser_select_option` | セレクトボックス操作 |
| 操作 | `browser_hover` | ホバー |
| 操作 | `browser_drag` | ドラッグ&ドロップ |
| 操作 | `browser_press_key` | キーボード操作（Enter, Tab等） |
| タブ | `browser_tab_list` | 開いているタブ一覧 |
| タブ | `browser_tab_new` | 新しいタブを開く |
| タブ | `browser_tab_select` | タブ切り替え |
| タブ | `browser_tab_close` | タブを閉じる |
| コンソール | `browser_console_messages` | コンソールログ・エラー取得 |
| JS実行 | `browser_javascript_execute` | 任意のJavaScript実行 |
| ファイル | `browser_file_upload` | ファイルアップロード |
| PDF | `browser_pdf_save` | ページをPDF保存 |
| 待機 | `browser_wait_for` | 要素やテキストの出現を待つ |
| 操作 | `browser_close` | ブラウザを閉じる |

### 操作の基本パターン

```
browser_snapshot          → refを取得
browser_click ref=e5      → ref指定で操作
browser_snapshot          → 操作後に必ず再取得（ref更新）
```

**ref は snapshot 毎に変わる。古い ref を使うな。必ず最新の snapshot から取得しろ。**

---

## Phase 1: PLAN（計画）

新機能開発時、最初にテスト計画を作る。

### いつ実行するか

- 新しい画面/機能を作る時
- 大きなリファクタリングの前
- ユーザーが「ちゃんとテストして」と言った時

### 手順

1. `browser_navigate` + `browser_snapshot` でアプリの現在の状態を観察
2. テスト対象の機能を特定
3. 以下の形式でテスト計画をMarkdownで生成

```markdown
# テスト計画: [機能名]

## 対象画面
- URL: http://localhost:XXXX/path
- 概要: この画面は〇〇する機能

## テストシナリオ

### 1. 正常系: [シナリオ名]
**手順:**
1. [操作1]
2. [操作2]
3. [操作3]

**期待結果:**
- [確認項目1]
- [確認項目2]

### 2. 異常系: [シナリオ名]
**手順:**
1. [操作1（不正データ等）]

**期待結果:**
- [エラーハンドリングの確認]
- [クラッシュしないこと]

### 3. エッジケース
- 空データ
- 大量データ
- 特殊文字（日本語、絵文字）
- 同時操作
```

4. テスト計画を `specs/` に保存

---

## Phase 2: DEVELOP & VERIFY（開発 & 検証ループ）

### Core Loop

```
REPEAT {
  1. READ    → ソースコードを読んで理解
  2. BUILD   → コード修正・構文チェック
  3. LAUNCH  → アプリ起動/リロード
  4. LOOK    → browser_snapshot で画面確認
  5. TOUCH   → browser_click / browser_type で全UIを操作
  6. LISTEN  → browser_console_messages + JS実行でネットワーク・パフォーマンス確認
  7. DECIDE  → 問題あり？
               YES → FIX してGOTO 2
               NO  → 次の画面/機能へ。全て完了なら Phase 2.5 へ
} MAX 20 iterations
```

### 2-1. READ

**ブラウザを触る前に、まず関連コードを読め。**

- 修正対象のファイルを開いてロジックを理解
- エラー箇所の周辺コードを確認
- ルーティング、状態管理、データフローを把握
- テストファイルがあれば読む
- package.json / requirements.txt で依存関係を確認

### 2-2. BUILD

```bash
# Python
python -m py_compile file.py

# JS/TS
npx tsc --noEmit

# 構文エラーはここで潰す。ブラウザまで行くな。
```

### 2-3. LAUNCH

#### devサーバー自動検出

```bash
for port in 3000 3001 5173 5174 8000 8080 8501; do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:$port 2>/dev/null | grep -q "200\|302" && echo "FOUND: localhost:$port"
done
```

- 見つかった → `browser_navigate` でそのURLへ
- 見つからない → アプリ種類を検出して起動

#### ホットリロード判定

- Next.js / Vite / Streamlit → `browser_navigate` で同じURLへ（リロード）
- Flask / FastAPI / 静的 → プロセス再起動 → `browser_navigate`

### 2-4. LOOK

```
browser_snapshot    ← 基本はこれ。トークン効率が良い。
browser_screenshot  ← レイアウト・色・グラフ確認時のみ。
```

#### チェック項目

| チェック | NGの例 |
|----------|--------|
| ページ表示 | 白画面、接続拒否、504 |
| エラー表示 | 赤いエラーボックス、スタックトレース |
| レイアウト | 要素の重なり、はみ出し、崩れ |
| テキスト | 文字化け、undefined、null |
| データ | テーブル空、グラフ未描画 |
| ローディング | スピナーが止まらない |

### 2-5. TOUCH

```
browser_snapshot                      → refを確認
browser_click ref=e5                  → ボタンクリック
browser_snapshot                      → 結果確認
browser_type ref=e8 text="テストデータ" → テキスト入力
browser_press_key key="Enter"         → Enter送信
browser_snapshot                      → 結果確認
browser_select_option ref=e12 value="option1" → セレクト操作
browser_snapshot                      → 結果確認
```

#### 操作原則

- 全ボタン押す
- 全入力欄にデータ入れる
- 全セレクト切り替える
- 正常系 + 異常系の両方
- 全ページを回る
- **操作するたびbrowser_snapshot**（省略禁止）
- **DOM大変更後は必ずbrowser_snapshot**（ref更新のため）

### 2-6. LISTEN

#### A. コンソールエラー

```
browser_console_messages
```

| レベル | 対応 |
|--------|------|
| Error | 必ず修正 |
| Warning（重大） | 動作影響あれば修正 |
| Warning（軽微） | 無視可 |

#### B. ネットワーク監視

```
browser_javascript_execute script="
  const entries = performance.getEntriesByType('resource');
  return entries.slice(-20).map(e => ({
    name: e.name.split('/').pop(),
    status: e.responseStatus || 'N/A',
    duration: Math.round(e.duration),
    size: e.transferSize
  }));
"
```

チェック項目:
- **4xx/5xxレスポンス** → APIエンドポイントを確認・修正
- **タイムアウト** → サーバー側の問題を調査
- **CORSエラー** → ヘッダー設定を修正
- **過剰リクエスト** → 無限ループ/重複fetchがないか
- **ペイロードサイズ** → 巨大なレスポンスがないか

#### C. パフォーマンス監視

```
browser_javascript_execute script="
  const perf = performance.getEntriesByType('navigation')[0];
  return {
    domContentLoaded: Math.round(perf.domContentLoadedEventEnd - perf.startTime),
    fullLoad: Math.round(perf.loadEventEnd - perf.startTime),
    firstPaint: Math.round(performance.getEntriesByName('first-paint')[0]?.startTime || 0)
  };
"
```

パフォーマンス基準:

| 指標 | OK | 要注意 | NG |
|------|-----|--------|-----|
| DOM Content Loaded | < 1s | 1-3s | > 3s |
| Full Load | < 2s | 2-5s | > 5s |
| First Paint | < 0.5s | 0.5-1.5s | > 1.5s |

NGの場合 → パフォーマンス問題として報告（即修正は任意）

### 2-7. DECIDE & FIX

#### 全てOKの条件

- [ ] 全ページが正しく表示される
- [ ] 全操作が正常に動く
- [ ] コンソールにErrorがない
- [ ] ネットワークエラーがない
- [ ] 異常入力でクラッシュしない
- [ ] データの表示が正しい
- [ ] パフォーマンスが基準内

→ **全てOKなら Phase 2.5 へ進む。ユーザーに報告するのはまだ早い。**

#### Root Cause Analysis（5ステップ）

1. **原因特定**: エラー詳細 + `browser_snapshot` + ソースコード
2. **原因分類**: セレクタ / タイミング / データ / API / 環境
3. **修正**: 1つだけ修正（複数同時禁止）
4. **検証**: `browser_snapshot` で確認してから「直った」と言え
5. **反復**: パスするまで繰り返す

#### 同じバグが繰り返す場合

| 回数 | アクション |
|------|-----------|
| 2回目 | アプローチを変えて修正 |
| 3回目 | 根本原因を再分析（設計の問題？） |
| 5回目 | ユーザーに相談 |

---

## Phase 2.5: AUDIT（監査人モード）

### お前は今から監査人だ。

Phase 2の開発者としての判断を全て捨てろ。
お前が「できた」と思ったものを、今から全力で壊しにいく。
開発者の気持ちは捨てろ。バグを見つけることだけが仕事だ。

### 監査人の性格

- 褒めない。
- 「動いてるからOK」を許さない。
- 開発者が「直しました」と言っても信用しない。自分で確認する。
- エッジケースを執拗に試す。
- コードの質にも口を出す。

### 監査は2段階

#### STEP 1: ブラウザ監査（操作で壊す）

開発者が触らなかったパターンを**最低3つ**試す。

```
browser_snapshot → 現状確認

# 以下のパターンから最低3つ実行:
# 1. 空送信（何も入力せずSubmit）
# 2. 超長文入力（1000文字以上）
# 3. 特殊文字（<script>alert('xss')</script>、日本語、絵文字🔥）
# 4. 連打（同じボタンを素早く3回押す）
# 5. 戻るボタン → 再送信
# 6. 別タブで同じページを開いて同時操作
# 7. ネットワーク遅延シミュレーション（該当する場合）

browser_snapshot → 各操作後に必ず確認
browser_console_messages → エラー確認
```

#### STEP 2: コードレビュー（ソースを斬る）

変更されたファイルを全て読み、以下の観点でレビューする。

| 重大度 | 観点 | 例 |
|--------|------|-----|
| **Critical** | セキュリティ | SQLインジェクション、XSS、認証漏れ、秘密鍵ハードコード |
| **Critical** | クラッシュ | 未処理の例外、null参照、ゼロ除算 |
| **High** | エラーハンドリング | try-catchの漏れ、ユーザーに見せるエラーメッセージ |
| **High** | データ整合性 | バリデーション不足、型の不一致 |
| **Medium** | パフォーマンス | N+1クエリ、不要な再レンダリング、メモリリーク |
| **Medium** | 型安全性 | any地獄、型アサーションの乱用 |
| **Low** | 可読性 | 命名、関数の責務、マジックナンバー |
| **Low** | デッドコード | 未使用import、コメントアウトされたコード |

### 監査の判定

#### Critical / High が1つでもある場合

```
🔴 AUDIT FAILED

[Critical] XSS脆弱性: components/Search.tsx L42
  → ユーザー入力をdangerouslySetInnerHTMLで直接描画している

[High] エラーハンドリング: api/fetch.ts L15
  → fetchの失敗時にcatchがない。ネットワークエラーで白画面になる

→ Phase 2 に差し戻し。上記を修正してから再度 Phase 2.5 を実行せよ。
```

**→ Phase 2 に差し戻し。修正後、再度 Phase 2.5 を最初からやり直す。**

#### Medium / Low のみの場合

```
🟡 AUDIT PASSED (with notes)

[Medium] パフォーマンス: components/Table.tsx L88
  → 毎レンダリングでfilter()を実行。useMemoを検討。

[Low] 命名: utils/helpers.ts L12
  → "processData" は曖昧。"formatPriceForDisplay" 等に改善推奨。

→ TODO コメントとして残す。Phase 3 へ進んでよい。
```

**→ TODO コメントをコードに残して Phase 3 へ進む。**

#### 何も見つからない場合

```
🟢 AUDIT PASSED

ブラウザ監査: エッジケース3パターン実行、問題なし
コードレビュー: Critical/High なし、Medium/Low なし

→ Phase 3 へ進む。
```

### 監査ループ制限

| 条件 | アクション |
|------|-----------|
| 差し戻し1回目 | 通常通り Phase 2 で修正 |
| 差し戻し2回目 | 設計の問題を疑う。根本から見直せ。 |
| 差し戻し3回目 | ユーザーに相談。「監査が通りません」と正直に報告。 |

---

## Phase 3: TEST（テスト自動生成）

検証が完了したら、やったことをテストコードとして残す。

### いつ実行するか

- Phase 2.5の監査が通った後
- ユーザーが「テストも書いて」と言った時
- 重要な機能の開発完了時

### テスト生成の手順

1. Phase 2 + Phase 2.5 で実行した操作を振り返る
2. 操作手順をPlaywrightテストコードに変換
3. **監査で試したエッジケースもテストに含める**
4. テストを実行して通ることを確認
5. 失敗したら原因調査→修正→再実行

```javascript
// tests/[feature-name].spec.ts として保存
import { test, expect } from '@playwright/test';

test.describe('[機能名]', () => {
  test('正常系: [シナリオ名]', async ({ page }) => {
    await page.goto('http://localhost:XXXX/path');
    await page.getByRole('textbox', { name: '検索' }).fill('テスト');
    await page.getByRole('button', { name: '送信' }).click();
    await expect(page.getByText('結果')).toBeVisible();
  });

  test('異常系: 空送信', async ({ page }) => {
    await page.goto('http://localhost:XXXX/path');
    await page.getByRole('button', { name: '送信' }).click();
    // クラッシュしないこと
    await expect(page.locator('body')).toBeVisible();
    // エラーメッセージが表示されること
    await expect(page.getByText(/入力してください|required/i)).toBeVisible();
  });

  test('エッジケース: XSS文字列', async ({ page }) => {
    await page.goto('http://localhost:XXXX/path');
    await page.getByRole('textbox', { name: '検索' }).fill('<script>alert("xss")</script>');
    await page.getByRole('button', { name: '送信' }).click();
    // スクリプトが実行されないこと
    // ページが正常に表示されること
    await expect(page.locator('body')).toBeVisible();
  });
});
```

### テスト実行 & 修復ループ

```
REPEAT {
  1. テスト実行: npx playwright test
  2. 失敗あり？
     YES → エラー調査 → セレクタ/タイミング/データ修正 → GOTO 1
     NO  → 完了
} MAX 10 iterations
```

### Pythonプロジェクトの場合

```python
# tests/test_[feature].py
import subprocess

def test_app_starts():
    """アプリが起動することを確認"""
    result = subprocess.run(
        ['python', '-c', 'import app'],
        capture_output=True, text=True
    )
    assert result.returncode == 0, f"Import failed: {result.stderr}"

def test_data_output():
    """データ出力が正しいことを確認"""
    # ... 具体的なテスト
```

---

## Phase 4: REPORT（最終報告）

### 全Phase完了後の報告フォーマット

```
✅ FULLY VERIFIED, AUDITED & TESTED

📋 Plan
- テスト計画: specs/[name].md
- シナリオ数: N

🔄 Verify Loop
- ループ回数: N
- 確認ページ数: N
- 確認操作数: N

🔧 Fixes
1. [画面X] 原因: ○○ → 修正: △△
2. [操作Y] 原因: □□ → 修正: ◇◇

🔍 Audit
- ブラウザ監査: エッジケースN件実行
- コードレビュー: Critical 0 / High 0 / Medium N / Low N
- 差し戻し回数: N
- 判定: PASSED

🌐 Network
- APIエラー: 0
- 平均レスポンス: Xms

⚡ Performance
- DOM Content Loaded: Xms
- Full Load: Xms

🧪 Tests
- テストファイル: tests/[name].spec.ts
- テスト数: N（正常系 N + 異常系 N + エッジケース N）
- 全パス: ✅

📸 最終スクリーンショット: [添付]
```

---

## Loop制限

| 条件 | アクション |
|------|-----------|
| Phase 2: 20回到達 | ユーザーに状況報告 |
| Phase 2.5: 差し戻し3回 | ユーザーに相談 |
| Phase 3: 10回到達 | テスト修復を断念、ユーザーに報告 |
| 同じバグ5回 | ユーザーに相談 |
| アプリ起動不能 | 環境の問題として報告 |
