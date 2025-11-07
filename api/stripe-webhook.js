// Stripe Webhook処理API
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Stripeクライアント初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Supabaseクライアント初期化（サービスキーで管理者権限）
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Vercel用のbodyParser設定（生のbodyが必要）
export const config = {
    api: {
        bodyParser: false
    }
};

// リクエストボディを読み取るヘルパー関数
async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    // POSTリクエストのみ許可
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let event;

    try {
        // 生のリクエストボディを取得
        const rawBody = await getRawBody(req);
        const signature = req.headers['stripe-signature'];

        // Webhook署名を検証
        event = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        console.log('📨 Webhook受信:', event.type);

    } catch (err) {
        console.error('❌ Webhook署名検証エラー:', err.message);
        return res.status(400).json({
            error: `Webhook Error: ${err.message}`
        });
    }

    // イベントタイプごとに処理を分岐
    try {
        switch (event.type) {
            // チェックアウト完了（初回支払い成功）
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;

            // サブスクリプション作成
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;

            // サブスクリプション更新
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;

            // サブスクリプション削除（キャンセル）
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;

            // 支払い成功
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;

            // 支払い失敗
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;

            default:
                console.log(`⚠️ 未処理のイベントタイプ: ${event.type}`);
        }

        return res.status(200).json({ received: true });

    } catch (error) {
        console.error('❌ Webhook処理エラー:', error);
        return res.status(500).json({
            error: 'Webhook processing failed',
            message: error.message
        });
    }
}

// チェックアウト完了時の処理
async function handleCheckoutCompleted(session) {
    console.log('💳 チェックアウト完了:', session.id);

    const userId = session.metadata.userId;
    const plan = session.metadata.plan;
    const affiliateId = session.metadata.affiliateId;

    if (!userId || !plan) {
        console.error('❌ メタデータにuserIdまたはplanが見つかりません');
        return;
    }

    // ユーザーのプランを更新
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            plan: plan,
            subscription_status: 'active',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription
        })
        .eq('id', userId);

    if (updateError) {
        console.error('❌ プロフィール更新エラー:', updateError);
    } else {
        console.log('✅ プロフィール更新成功:', userId);
    }

    // アフィリエイト報酬処理（将来実装）
    if (affiliateId) {
        console.log('💰 アフィリエイトID検出:', affiliateId);
        // TODO: コンバージョン記録と報酬計算
    }
}

// サブスクリプション作成時の処理
async function handleSubscriptionCreated(subscription) {
    console.log('📅 サブスクリプション作成:', subscription.id);

    const userId = subscription.metadata.userId;
    const plan = subscription.metadata.plan;

    if (!userId) return;

    await supabase
        .from('profiles')
        .update({
            plan: plan,
            subscription_status: 'active',
            stripe_subscription_id: subscription.id
        })
        .eq('id', userId);

    console.log('✅ サブスクリプション有効化:', userId);
}

// サブスクリプション更新時の処理
async function handleSubscriptionUpdated(subscription) {
    console.log('🔄 サブスクリプション更新:', subscription.id);

    const userId = subscription.metadata.userId;

    if (!userId) return;

    // ステータスをマッピング
    let status = subscription.status;
    if (status === 'incomplete' || status === 'incomplete_expired') {
        status = 'past_due';
    } else if (status === 'canceled') {
        status = 'canceled';
    }

    await supabase
        .from('profiles')
        .update({
            subscription_status: status
        })
        .eq('id', userId);

    console.log('✅ サブスクリプションステータス更新:', userId, status);
}

// サブスクリプション削除時の処理
async function handleSubscriptionDeleted(subscription) {
    console.log('🚫 サブスクリプション削除:', subscription.id);

    const userId = subscription.metadata.userId;

    if (!userId) return;

    await supabase
        .from('profiles')
        .update({
            subscription_status: 'canceled',
            plan: 'trial'  // トライアルに戻す
        })
        .eq('id', userId);

    console.log('✅ サブスクリプションキャンセル処理完了:', userId);
}

// 支払い成功時の処理
async function handlePaymentSucceeded(invoice) {
    console.log('💰 支払い成功:', invoice.id);

    const subscriptionId = invoice.subscription;

    if (!subscriptionId) return;

    // サブスクリプション情報を取得
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata.userId;

    if (!userId) return;

    // ステータスを更新
    await supabase
        .from('profiles')
        .update({
            subscription_status: 'active'
        })
        .eq('id', userId);

    console.log('✅ 支払い成功処理完了:', userId);
}

// 支払い失敗時の処理
async function handlePaymentFailed(invoice) {
    console.log('⚠️ 支払い失敗:', invoice.id);

    const subscriptionId = invoice.subscription;

    if (!subscriptionId) return;

    // サブスクリプション情報を取得
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata.userId;

    if (!userId) return;

    // ステータスを更新
    await supabase
        .from('profiles')
        .update({
            subscription_status: 'past_due'
        })
        .eq('id', userId);

    console.log('⚠️ 支払い失敗処理完了:', userId);
}
