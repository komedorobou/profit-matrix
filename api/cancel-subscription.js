// サブスクリプションキャンセルAPI
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Stripeクライアント初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Supabaseクライアント初期化
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    // POSTリクエストのみ許可
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'userId is required'
            });
        }

        console.log('🚫 キャンセルリクエスト:', userId);

        // ユーザーのサブスクリプション情報を取得
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('stripe_subscription_id, subscription_status')
            .eq('id', userId)
            .single();

        if (profileError || !profile) {
            return res.status(404).json({
                error: 'User profile not found'
            });
        }

        const subscriptionId = profile.stripe_subscription_id;

        if (!subscriptionId) {
            return res.status(400).json({
                error: 'No active subscription found'
            });
        }

        // Stripeサブスクリプションを取得
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // トライアル中の場合: 即座にキャンセル
        if (subscription.status === 'trialing') {
            console.log('⏰ トライアル中: 即座にキャンセル');

            await stripe.subscriptions.cancel(subscriptionId);

            // DBを更新
            await supabase
                .from('profiles')
                .update({
                    subscription_status: 'canceled',
                    plan: 'trial',
                    stripe_subscription_id: null,
                    plan_expires_at: null
                })
                .eq('id', userId);

            return res.status(200).json({
                success: true,
                message: 'トライアルをキャンセルしました。',
                immediate: true
            });
        }

        // 有料プラン中の場合: 期間満了時にキャンセル
        console.log('💰 有料プラン: 期間満了時にキャンセル予約');

        const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true
        });

        // DBを更新（ステータスは維持、キャンセル予定フラグのみ）
        await supabase
            .from('profiles')
            .update({
                subscription_status: 'active'  // 期間満了まではactive
            })
            .eq('id', userId);

        const periodEnd = new Date(updatedSubscription.current_period_end * 1000);

        return res.status(200).json({
            success: true,
            message: `${periodEnd.toLocaleDateString('ja-JP')}まで利用可能です。その後キャンセルされます。`,
            immediate: false,
            cancelAt: periodEnd.toISOString()
        });

    } catch (error) {
        console.error('❌ キャンセル処理エラー:', error);

        return res.status(500).json({
            error: 'Failed to cancel subscription',
            message: error.message
        });
    }
}
