// Stripe Checkout Session作成API
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Stripeクライアント初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Supabaseクライアント初期化
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// プランIDとPrice IDのマッピング
const PLAN_PRICES = {
    starter: 'price_1SNpkQJW7T60nZZ97xEdclN9',    // ¥4,980
    standard: 'price_1SNpmVJW7T60nZZ9FyEC1JoP',   // ¥9,800
    premium: 'price_1SNpnmJW7T60nZZ9yM6FLuem'     // ¥19,800
};

// プラン名のマッピング（日本語）
const PLAN_NAMES = {
    starter: 'スタータープラン',
    standard: 'スタンダードプラン',
    premium: 'プレミアムプラン'
};

export default async function handler(req, res) {
    // POSTリクエストのみ許可
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { plan, userId, customerEmail, trial } = req.body;

        // バリデーション
        if (!plan || !userId || !customerEmail) {
            return res.status(400).json({
                error: '必須パラメータが不足しています: plan, userId, customerEmail'
            });
        }

        if (!PLAN_PRICES[plan]) {
            return res.status(400).json({
                error: '無効なプランです: ' + plan
            });
        }

        console.log('📊 Checkout Session作成リクエスト:', {
            plan,
            userId,
            customerEmail,
            trial: trial || false
        });

        // ユーザーのプロフィール情報を取得（アフィリエイトID確認用）
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('referred_by')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.warn('⚠️ プロフィール取得エラー:', profileError);
        }

        // Stripe Checkout Sessionを作成
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            customer_email: customerEmail,

            line_items: [
                {
                    price: PLAN_PRICES[plan],
                    quantity: 1
                }
            ],

            // 成功時とキャンセル時のリダイレクトURL
            success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://profit-matrix.jp'}?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://profit-matrix.jp'}?canceled=true`,

            // メタデータ（Webhook処理で使用）
            metadata: {
                userId: userId,
                plan: plan,
                affiliateId: profile?.referred_by || null
            },

            // サブスクリプション設定
            subscription_data: {
                metadata: {
                    userId: userId,
                    plan: plan
                },
                // トライアル期間（新規登録時のみ7日間）
                ...(trial && { trial_period_days: 7 })
            },

            // 請求先情報の収集
            billing_address_collection: 'required',

            // 顧客が複数のサブスクリプションを持てないようにする
            allow_promotion_codes: true,

            // 日本円表示
            locale: 'ja'
        });

        console.log('✅ Checkout Session作成成功:', session.id);

        // セッションIDを返す
        return res.status(200).json({
            sessionId: session.id,
            url: session.url
        });

    } catch (error) {
        console.error('❌ Checkout Session作成エラー:', error);

        return res.status(500).json({
            error: 'Checkout Session作成に失敗しました',
            message: error.message
        });
    }
}
