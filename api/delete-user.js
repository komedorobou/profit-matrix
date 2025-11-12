// ユーザー削除API（オーナー専用）
import { createClient } from '@supabase/supabase-js';

// Supabaseクライアント初期化（サービスキーで管理者権限）
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    // DELETEリクエストのみ許可
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // リクエストボディから情報を取得
        const { requestUserId, requestUserEmail, userId, userEmail } = req.body;

        if (!requestUserId || !requestUserEmail) {
            return res.status(400).json({ error: 'requestUserId and requestUserEmail are required' });
        }

        console.log('📡 削除リクエスト受信:', { requestUserId, requestUserEmail, targetUserId: userId });
        console.log('🔑 SUPABASE_URL:', process.env.SUPABASE_URL ? '設定済み' : '未設定');
        console.log('🔑 SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '設定済み (長さ: ' + process.env.SUPABASE_SERVICE_KEY.length + ')' : '未設定');

        // リクエストしたユーザーがprofilesテーブルに存在するか確認
        const { data: requestUser, error: userError } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', requestUserId)
            .single();

        if (userError || !requestUser) {
            console.error('❌ リクエストユーザー確認エラー:', userError);
            console.error('❌ エラー詳細:', JSON.stringify(userError, null, 2));
            return res.status(401).json({
                error: 'Unauthorized: User not found',
                details: userError?.message || 'Unknown error',
                hint: userError?.hint || 'Check RLS policies and Service Role Key'
            });
        }

        // メールアドレスが一致するか確認
        if (requestUser.email !== requestUserEmail) {
            console.error('❌ メールアドレス不一致');
            return res.status(401).json({ error: 'Unauthorized: Email mismatch' });
        }

        // オーナーアカウントかチェック
        if (!requestUserEmail.includes('komedorobouinuzini')) {
            return res.status(403).json({ error: 'Forbidden: Owner access only' });
        }

        console.log('👑 オーナーアカウントからのリクエスト:', requestUserEmail);

        // 削除対象ユーザーIDのチェック
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
