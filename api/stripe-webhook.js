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

    // カードフィンガープリントを取得
    let cardFingerprint = null;
    try {
        // Setup IntentまたはPayment Intentからpayment_methodを取得
        if (session.setup_intent) {
            const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent);
            if (setupIntent.payment_method) {
                const paymentMethod = await stripe.paymentMethods.retrieve(setupIntent.payment_method);
                cardFingerprint = paymentMethod.card?.fingerprint;
            }
        } else if (session.payment_intent) {
            const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
            if (paymentIntent.payment_method) {
                const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
                cardFingerprint = paymentMethod.card?.fingerprint;
            }
        }
        // サブスクリプションから取得（最も確実）
        else if (session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription, {
                expand: ['default_payment_method']
            });
            if (subscription.default_payment_method) {
                cardFingerprint = subscription.default_payment_method.card?.fingerprint;
            }
        }

        console.log('🔍 カードフィンガープリント:', cardFingerprint);
    } catch (error) {
        console.error('⚠️ カードフィンガープリント取得エラー:', error);
    }

    // カード重複チェック
    if (cardFingerprint) {
        const { data: existingProfiles, error: checkError } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('card_fingerprint', cardFingerprint)
            .limit(1);

        if (!checkError && existingProfiles && existingProfiles.length > 0) {
            console.error('🚫 カード重複検出:', cardFingerprint, '既存ユーザー:', existingProfiles[0].email);

            // サブスクリプションを即座にキャンセル
            if (session.subscription) {
                try {
                    await stripe.subscriptions.cancel(session.subscription);
                    console.log('✅ 重複カードのサブスクリプションをキャンセル:', session.subscription);
                } catch (cancelError) {
                    console.error('❌ サブスクリプションキャンセルエラー:', cancelError);
                }
            }

            // ユーザーのステータスを更新（キャンセル済み）
            await supabase
                .from('profiles')
                .update({
                    subscription_status: 'canceled',
                    plan: 'trial'
                })
                .eq('id', userId);

            console.log('❌ 重複カードによる登録拒否完了');
            return; // 処理を終了
        }
    }

    // サブスクリプション情報を取得してトライアル状態を確認
    let subscriptionStatus = 'active';
    let planExpiresAt = null;

    if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);

        // トライアル中の場合
        if (subscription.status === 'trialing' && subscription.trial_end) {
            subscriptionStatus = 'trialing';
            planExpiresAt = new Date(subscription.trial_end * 1000).toISOString();
            console.log('⏰ トライアル期間:', planExpiresAt);
        } else if (subscription.current_period_end) {
            // 有料プランの場合、次回更新日を設定
            planExpiresAt = new Date(subscription.current_period_end * 1000).toISOString();
        }
    }

    // ユーザーのプランを更新（カードフィンガープリントも保存）
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            plan: plan,
            subscription_status: subscriptionStatus,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            plan_expires_at: planExpiresAt,
            card_fingerprint: cardFingerprint  // カードフィンガープリントを保存
        })
        .eq('id', userId);

    if (updateError) {
        console.error('❌ プロフィール更新エラー:', updateError);
    } else {
        console.log('✅ プロフィール更新成功:', userId, subscriptionStatus);
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

    let userId = subscription.metadata?.userId;

    // metadataにuserIdがない場合、stripe_subscription_idから逆引き
    if (!userId) {
        console.log('⚠️ metadataにuserIdがありません。DBから検索します...');
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_subscription_id', subscription.id)
            .single();

        if (error || !profile) {
            console.error('❌ ユーザーが見つかりません:', subscription.id);
            return;
        }
        userId = profile.id;
        console.log('✅ DBからユーザーを特定:', userId);
    }

    // ステータスをマッピング
    let status = subscription.status;
    if (status === 'incomplete' || status === 'incomplete_expired') {
        status = 'past_due';
    } else if (status === 'canceled') {
        status = 'canceled';
    } else if (status === 'trialing') {
        status = 'trialing';
    } else if (status === 'active') {
        status = 'active';
    }

    // 次回更新日を取得
    let planExpiresAt = null;
    if (subscription.status === 'trialing' && subscription.trial_end) {
        planExpiresAt = new Date(subscription.trial_end * 1000).toISOString();
        console.log('⏰ トライアル期間:', planExpiresAt);
    } else if (subscription.current_period_end) {
        planExpiresAt = new Date(subscription.current_period_end * 1000).toISOString();
        console.log('📅 次回更新日:', planExpiresAt);
    }

    // キャンセル予定の場合
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    console.log('🚫 期間終了時にキャンセル:', cancelAtPeriodEnd);

    // 更新データを準備
    const updateData = {
        subscription_status: status,
        plan_expires_at: planExpiresAt
    };

    // トライアル終了→active移行時、metadataからplanを取得して更新
    if (status === 'active' && subscription.metadata.plan) {
        updateData.plan = subscription.metadata.plan;
        console.log('✅ トライアル終了→プラン移行:', subscription.metadata.plan);
    }

    await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

    console.log('✅ サブスクリプションステータス更新:', userId, status, updateData.plan || '(planなし)');
}

// サブスクリプション削除時の処理
async function handleSubscriptionDeleted(subscription) {
    console.log('🚫 サブスクリプション削除:', subscription.id);

    let userId = subscription.metadata?.userId;

    // metadataにuserIdがない場合、stripe_subscription_idから逆引き
    if (!userId) {
        console.log('⚠️ metadataにuserIdがありません。DBから検索します...');
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_subscription_id', subscription.id)
            .single();

        if (error || !profile) {
            console.error('❌ ユーザーが見つかりません:', subscription.id);
            return;
        }
        userId = profile.id;
        console.log('✅ DBからユーザーを特定:', userId);
    }

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
    let userId = subscription.metadata?.userId;

    // metadataにuserIdがない場合、stripe_subscription_idから逆引き
    if (!userId) {
        console.log('⚠️ metadataにuserIdがありません。DBから検索します...');
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .single();

        if (error || !profile) {
            console.error('❌ ユーザーが見つかりません:', subscriptionId);
            return;
        }
        userId = profile.id;
        console.log('✅ DBからユーザーを特定:', userId);
    }

    // 次回更新日を取得
    let planExpiresAt = null;
    if (subscription.current_period_end) {
        planExpiresAt = new Date(subscription.current_period_end * 1000).toISOString();
        console.log('📅 次回更新日:', planExpiresAt);
    }

    // ステータスと次回更新日を更新
    await supabase
        .from('profiles')
        .update({
            subscription_status: 'active',
            plan_expires_at: planExpiresAt
        })
        .eq('id', userId);

    console.log('✅ 支払い成功処理完了:', userId, '次回更新:', planExpiresAt);
}

// 支払い失敗時の処理
async function handlePaymentFailed(invoice) {
    console.log('⚠️ 支払い失敗:', invoice.id);

    const subscriptionId = invoice.subscription;

    if (!subscriptionId) return;

    // サブスクリプション情報を取得
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    let userId = subscription.metadata?.userId;

    // metadataにuserIdがない場合、stripe_subscription_idから逆引き
    if (!userId) {
        console.log('⚠️ metadataにuserIdがありません。DBから検索します...');
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .single();

        if (error || !profile) {
            console.error('❌ ユーザーが見つかりません:', subscriptionId);
            return;
        }
        userId = profile.id;
        console.log('✅ DBからユーザーを特定:', userId);
    }

    // ステータスを更新
    await supabase
        .from('profiles')
        .update({
            subscription_status: 'past_due'
        })
        .eq('id', userId);

    console.log('⚠️ 支払い失敗処理完了:', userId);
}
