// Stripe決済キャンセル時のユーザー削除API
import { createClient } from '@supabase/supabase-js';

// Supabaseクライアント初期化（サービスキーで管理者権限）
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
        const { userId, userEmail } = req.body;

        if (!userId || !userEmail) {
            return res.status(400).json({ error: 'userId and userEmail are required' });
        }

        console.log('🗑️ Stripe決済キャンセル - ユーザー削除:', userId, userEmail);

        // profilesテーブルから削除
        const { error: deleteProfileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (deleteProfileError) {
            console.error('❌ プロフィール削除エラー:', deleteProfileError);
            throw deleteProfileError;
        }

        // auth.usersから削除（Admin API）
        const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

        if (deleteAuthError) {
            console.error('⚠️ 認証ユーザー削除エラー:', deleteAuthError);
            // profilesは削除済みなので、エラーでも続行
        }

        console.log('✅ クレジットカード未登録ユーザー削除成功:', userId, userEmail);

        return res.status(200).json({
            success: true,
            message: 'Pending user deleted successfully',
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
}
