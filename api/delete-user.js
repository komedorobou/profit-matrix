// ユーザー削除API（オーナー専用）
const { createClient } = require('@supabase/supabase-js');

// Supabaseクライアント初期化（サービスキーで管理者権限）
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
    // DELETEリクエストのみ許可
    if (req.method !== 'DELETE') {
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

        // リクエストボディから削除対象ユーザーIDを取得
        const { userId, userEmail } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        // 削除対象がオーナーアカウントでないか確認
        const { data: targetUser, error: fetchError } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .single();

        if (fetchError) {
            console.error('❌ ユーザー取得エラー:', fetchError);
            throw fetchError;
        }

        if (targetUser && targetUser.email && targetUser.email.includes('komedorobouinuzini')) {
            return res.status(403).json({ error: 'Cannot delete owner account' });
        }

        console.log('🗑️ ユーザー削除開始:', userId, userEmail);

        // profilesテーブルから削除
        const { error: deleteProfileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (deleteProfileError) {
            console.error('❌ プロフィール削除エラー:', deleteProfileError);
            throw deleteProfileError;
        }

        // auth.usersからも削除（Admin API）
        const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

        if (deleteAuthError) {
            console.error('⚠️ 認証ユーザー削除エラー:', deleteAuthError);
            // profilesは削除済みなので、エラーでも続行
        }

        console.log('✅ ユーザー削除成功:', userId, userEmail);

        return res.status(200).json({
            success: true,
            message: 'User deleted successfully',
            userId: userId,
            userEmail: userEmail
        });

    } catch (error) {
        console.error('❌ API エラー:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};
