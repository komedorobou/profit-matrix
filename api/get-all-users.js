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
        // Authorization ヘッダーからトークンを取得
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const token = authHeader.replace('Bearer ', '');

        // トークンを検証してユーザー情報を取得
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        // オーナーアカウントかチェック
        if (!user.email || !user.email.includes('komedorobouinuzini')) {
            return res.status(403).json({ error: 'Forbidden: Owner access only' });
        }

        console.log('👑 オーナーアカウントからのリクエスト:', user.email);

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
