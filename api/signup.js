const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password } = req.body

  // バリデーション
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  try {
    // Service Roleキーを使用してSupabaseクライアントを作成（RLSを回避）
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 1. ユーザーを作成
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true  // メール確認を自動承認
    })

    if (authError) {
      console.error('Auth error:', authError)
      return res.status(400).json({ error: authError.message })
    }

    if (!authData.user) {
      return res.status(500).json({ error: 'Failed to create user' })
    }

    // 2. プロフィールを作成（7日間トライアル付き）
    const trialExpiresAt = new Date()
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 7)

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: email,
        plan: 'trial',
        plan_expires_at: trialExpiresAt.toISOString(),
        subscription_status: 'trial'
      })

    if (profileError) {
      console.error('Profile error:', profileError)
      // プロフィール作成失敗時、ユーザーも削除
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return res.status(500).json({ error: 'Failed to create profile: ' + profileError.message })
    }

    // 3. ウェルカムメール送信（非同期で実行、失敗しても登録は成功させる）
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://profit-matrix.jp'}/api/send-welcome-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, type: 'signup' })
      })
      console.log('✅ ウェルカムメール送信:', email)
    } catch (emailError) {
      console.error('⚠️ ウェルカムメール送信失敗:', emailError)
      // メール送信失敗しても登録は成功
    }

    // 4. 成功レスポンス
    return res.status(200).json({
      success: true,
      message: '登録完了！7日間の無料トライアルを開始しました。',
      user: {
        id: authData.user.id,
        email: authData.user.email
      }
    })

  } catch (error) {
    console.error('Signup error:', error)
    return res.status(500).json({ error: 'Internal server error: ' + error.message })
  }
}
