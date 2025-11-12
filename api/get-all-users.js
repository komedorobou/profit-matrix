// ユーザー一覧取得API（オーナー専用）
const { createClient } = require('@supabase/supabase-js');

// Supabaseクライアント初期化（サービスキーで管理者権限）
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
    // GETリクエストのみ許可
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // クエリパラメータからユーザー情報を取得
        const { userId, userEmail } = req.query;

        if (!userId || !userEmail) {
            return res.status(400).json({ error: 'userId and userEmail are required' });
        }

        console.log('📡 リクエスト受信:', userId, userEmail);

        // profilesテーブルからユーザー情報を確認
        const { data: requestUser, error: userError } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .single();

        if (userError || !requestUser) {
            console.error('❌ ユーザー確認エラー:', userError);
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }

        // メールアドレスが一致するか確認
        if (requestUser.email !== userEmail) {
            console.error('❌ メールアドレス不一致');
            return res.status(401).json({ error: 'Unauthorized: Email mismatch' });
        }

        // オーナーアカウントかチェック
        if (!userEmail.includes('komedorobouinuzini')) {
            return res.status(403).json({ error: 'Forbidden: Owner access only' });
        }

        console.log('👑 オーナーアカウントからのリクエスト:', userEmail);

        // 全ユーザーを取得
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (profileError) {
            console.error('❌ プロフィール取得エラー:', profileError);
            throw profileError;
        }

        console.log('✅ ユーザー一覧取得成功:', profiles.length, '人');

        return res.status(200).json({
            success: true,
            users: profiles,
            count: profiles.length
        });

    } catch (error) {
        console.error('❌ API エラー:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};
