# アフィリエイトプログラム実装計画

## 概要
- 報酬率: **50%**（業界最高水準）
- 対象: 有料プラン加入時
- 支払い: 月次自動振込

---

## システム構成

### 1. リファラルトラッキング

**URLパラメータ:**
```
https://profit-matrix.jp?ref=affiliate123
```

**実装:**
```javascript
// URLからアフィリエイトIDを取得
const urlParams = new URLSearchParams(window.location.search);
const affiliateId = urlParams.get('ref');

if (affiliateId) {
    // 30日間有効なクッキーに保存
    localStorage.setItem('profit_matrix_ref', affiliateId);
    localStorage.setItem('profit_matrix_ref_expire', Date.now() + 30 * 24 * 60 * 60 * 1000);
}
```

---

### 2. Supabaseテーブル追加

#### affiliatesテーブル
```sql
CREATE TABLE affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    affiliate_code TEXT UNIQUE NOT NULL,  -- 'affiliate123'
    name TEXT,
    email TEXT,
    bank_account TEXT,  -- 振込先
    total_earnings DECIMAL DEFAULT 0,
    pending_earnings DECIMAL DEFAULT 0,
    paid_earnings DECIMAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### profilesテーブルに追加
```sql
ALTER TABLE profiles ADD COLUMN referred_by TEXT;  -- アフィリエイトコード
```

#### conversionsテーブル（報酬記録）
```sql
CREATE TABLE conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID REFERENCES affiliates(id),
    user_id UUID REFERENCES auth.users(id),
    plan TEXT,  -- starter, standard, premium
    amount DECIMAL,  -- 支払額
    commission DECIMAL,  -- 報酬額（50%）
    status TEXT DEFAULT 'pending',  -- pending, approved, paid
    stripe_session_id TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP
);
```

---

### 3. 新規登録時の紐付け

**app.js の handleSignup() を修正:**
```javascript
window.handleSignup = async function() {
    // ... 既存のサインアップ処理 ...

    // アフィリエイトIDを取得
    const affiliateId = localStorage.getItem('profit_matrix_ref');
    const expireTime = localStorage.getItem('profit_matrix_ref_expire');

    let referredBy = null;
    if (affiliateId && expireTime && Date.now() < parseInt(expireTime)) {
        referredBy = affiliateId;
    }

    // プロフィール作成時にアフィリエイトIDを保存
    const { error: profileError } = await supabaseAuth
        .from('profiles')
        .update({ referred_by: referredBy })
        .eq('id', data.user.id);
}
```

---

### 4. Stripe Checkout時にアフィリエイトIDを渡す

**selectPlan()関数を修正:**
```javascript
window.selectPlan = async function(plan) {
    // プロフィールからアフィリエイトIDを取得
    const { data: profile } = await supabaseAuth
        .from('profiles')
        .select('referred_by')
        .eq('id', currentUser.id)
        .single();

    // Stripe Checkoutセッション作成
    const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            plan: plan,
            userId: currentUser.id,
            affiliateId: profile?.referred_by,  // ←ここ重要
            customerEmail: currentUser.email
        })
    });

    const { sessionId } = await response.json();

    // Stripeにリダイレクト
    const stripe = Stripe('pk_live_...');
    await stripe.redirectToCheckout({ sessionId });
}
```

---

### 5. Stripe Webhook処理

**api/stripe-webhook.js を作成:**
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 支払い成功イベント
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const userId = session.metadata.userId;
        const affiliateId = session.metadata.affiliateId;
        const plan = session.metadata.plan;
        const amount = session.amount_total / 100;  // セント→円

        if (affiliateId) {
            // アフィリエイトIDからアフィリエイターを検索
            const { data: affiliate } = await supabase
                .from('affiliates')
                .select('*')
                .eq('affiliate_code', affiliateId)
                .single();

            if (affiliate) {
                const commission = amount * 0.5;  // 50%報酬

                // コンバージョン記録
                await supabase.from('conversions').insert({
                    affiliate_id: affiliate.id,
                    user_id: userId,
                    plan: plan,
                    amount: amount,
                    commission: commission,
                    status: 'pending',
                    stripe_session_id: session.id
                });

                // アフィリエイターの保留報酬を更新
                await supabase
                    .from('affiliates')
                    .update({
                        pending_earnings: affiliate.pending_earnings + commission
                    })
                    .eq('id', affiliate.id);
            }
        }

        // ユーザーのプランを更新
        await supabase
            .from('profiles')
            .update({
                plan: plan,
                subscription_status: 'active',
                stripe_customer_id: session.customer,
                stripe_subscription_id: session.subscription
            })
            .eq('id', userId);
    }

    res.json({ received: true });
}
```

---

### 6. アフィリエイター管理画面

**affiliate-dashboard.html を作成:**
```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <title>アフィリエイトダッシュボード | PROFIT MATRIX</title>
</head>
<body>
    <h1>💰 アフィリエイトダッシュボード</h1>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-value" id="totalEarnings">¥0</div>
            <div class="stat-label">累計報酬</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" id="pendingEarnings">¥0</div>
            <div class="stat-label">保留中</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" id="conversions">0</div>
            <div class="stat-label">成約数</div>
        </div>
    </div>

    <div class="referral-link">
        <h2>あなたの紹介リンク</h2>
        <input type="text" id="affiliateLink" readonly value="https://profit-matrix.jp?ref=affiliate123">
        <button onclick="copyLink()">コピー</button>
    </div>

    <div class="conversions-table">
        <h2>成約履歴</h2>
        <table id="conversionsTable">
            <!-- コンバージョン履歴 -->
        </table>
    </div>
</body>
</html>
```

---

## 報酬支払いフロー

1. **毎月1日**: 前月分のコンバージョンを集計
2. **承認**: オーナーが管理画面で承認（不正防止）
3. **自動振込**: 承認後、Stripe Connect or PayPalで自動振込
4. **ステータス更新**: `pending` → `approved` → `paid`

---

## 不正対策

1. **自己紹介禁止**: 同一IPアドレス/デバイスからの登録を検知
2. **返金対応**: ユーザーが返金した場合、報酬を取り消し
3. **最低支払額**: ¥10,000以上から振込（手数料削減）
4. **本人確認**: 初回振込前に身分証確認

---

## 実装優先度

### フェーズ1（今すぐ）
- [x] プラン選択UI
- [x] 無料トライアル
- [ ] Stripe Checkout連携
- [ ] Webhook処理

### フェーズ2（1-2週間後）
- [ ] リファラルトラッキング
- [ ] アフィリエイトテーブル作成
- [ ] コンバージョン記録

### フェーズ3（1ヶ月後）
- [ ] アフィリエイター管理画面
- [ ] 報酬自動計算
- [ ] 支払い機能

---

## まとめ

**今やること:**
1. Stripe Checkoutの基本実装（アフィリエイトなし）
2. 支払いフローを確立
3. 後からアフィリエイト機能を追加

これで段階的に実装できます！
