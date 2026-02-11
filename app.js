// === 認証システム ===
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Supabase設定
const SUPABASE_URL = 'https://czwwlrrgtmiagujdjxdr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6d3dscnJndG1pYWd1amRqeGRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMDM4NDgsImV4cCI6MjA3NTU3OTg0OH0.hKmaKImJP4ApCHoL4lHk8VjzShoQowyLx_e81wkKGis';

// Supabaseクライアント初期化
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// グローバル変数
let yahooApiKey = null;
let csvFile = null;
let searchResults = [];
let selectedProducts = []; // 選択された商品を保持
let partners = []; // 外注先リスト
let currentPartnerTab = 'approved'; // 現在表示中のタブ
let currentUser = null
let currentPlan = 'trial'  // trial, starter, standard, premium
let planExpiresAt = null  // トライアル期限
let subscriptionStatus = 'trial'  // trial, active, canceled, past_due
let shouldCheckApiKeyAfterOwnerSettings = false; // オーナー設定後のAPIキーチェックフラグ

// UI更新済みフラグ（2重実行防止）
let uiInitialized = false
let redirectingToStripe = false  // Stripeリダイレクト中フラグ

// 認証状態監視
supabaseAuth.auth.onAuthStateChange(async (event, session) => {
    console.log('🔐 Auth event:', event, 'Session:', session ? 'あり' : 'なし', 'uiInitialized:', uiInitialized)

    // Stripeリダイレクト中は何もしない
    if (redirectingToStripe) {
        console.log('⏸️ Stripeリダイレクト中のため処理をスキップ')
        return
    }

    // SIGNED_INまたはINITIAL_SESSION（初回ロード時）の両方を処理
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        console.log('✅ ログイン成功:', session.user.email)
        currentUser = session.user

        // 🚨 重複実行防止: SIGNED_INとINITIAL_SESSIONが連続発火した場合、2回目をスキップ
        // 同じユーザーで既に処理済みの場合はスキップ（UI更新とSupabaseクエリの重複防止）
        if (uiInitialized && currentUser?.id === session.user.id) {
            console.log('⏭️ 重複イベントをスキップ（既に処理済み）:', event)
            return
        }

        // 🚀 SIGNED_INでもINITIAL_SESSIONでも処理を続行
        // 以前はSIGNED_INでreturnしていたが、INITIAL_SESSIONが来ない場合があるため修正
        if (event === 'SIGNED_IN') {
            console.log('🔑 SIGNED_IN検出 - 処理を続行')
        }

        // 🚨 重要: INITIAL_SESSIONの場合はjustSignedUpフラグをクリア
        // ページリロード時にフラグが残っていると、stripe_customer_idチェックがスキップされる
        if (event === 'INITIAL_SESSION') {
            const hadFlag = localStorage.getItem('justSignedUp') === 'true'
            if (hadFlag) {
                console.log('🧹 INITIAL_SESSION: justSignedUpフラグをクリア（ページリロード検出）')
                localStorage.removeItem('justSignedUp')
                localStorage.removeItem('pendingUserId')
                localStorage.removeItem('pendingUserEmail')
            }
        }

        // ===================================
        // 最優先：UI更新（絶対に失敗させない）
        // ===================================

        // ログインボタンをリセット
        const loginBtn = document.getElementById('loginBtn')
        if (loginBtn) {
            loginBtn.textContent = 'ログイン'
            loginBtn.disabled = false
            console.log('✅ ログインボタンをリセット')
        }

        // 認証モーダルを閉じる
        const authModal = document.getElementById('authModal')
        if (authModal) {
            authModal.style.display = 'none'
            console.log('✅ 認証モーダルを非表示')
        } else {
            console.error('❌ authModal要素が見つかりません')
        }

        // ユーザーメニューを表示
        const userMenu = document.getElementById('userMenu')
        if (userMenu) {
            userMenu.style.display = 'block'
            console.log('✅ ユーザーメニューを表示')
        } else {
            console.error('❌ userMenu要素が見つかりません')
        }

        // メールアドレスを表示
        const userEmail = document.getElementById('userEmail')
        if (userEmail) {
            userEmail.textContent = session.user.email
            console.log('✅ メールアドレスを表示:', session.user.email)
        } else {
            console.error('❌ userEmail要素が見つかりません')
        }

        // ===================================
        // プラン情報取得（エラーがあっても継続）
        // ===================================

        console.log('📊 プロフィール情報を取得中...')
        console.log('🔍 ユーザーID:', session.user.id)
        console.log('🔍 メール:', session.user.email)
        try {
            console.log('🔍 Supabaseクエリ開始...')

            // タイムアウト機能付きクエリ（5秒でタイムアウト）
            const queryPromise = supabaseAuth
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single()

            let timeoutId
            const timeoutPromise = new Promise((resolve) => {
                timeoutId = setTimeout(() => {
                    console.error('⏱️ プロフィールクエリが5秒でタイムアウト - Supabase接続問題またはRLSブロックの可能性')
                    resolve({ data: null, error: { message: 'Query timeout after 5 seconds - possible Supabase connection issue', code: 'TIMEOUT' } })
                }, 5000)
            })

            const result = await Promise.race([queryPromise, timeoutPromise])
            // クエリ成功時はタイムアウトタイマーをキャンセル
            clearTimeout(timeoutId)
            const profile = result.data
            const profileError = result.error

            console.log('🔍 Supabaseクエリ完了')
            console.log('🔍 取得データ:', profile)
            console.log('🔍 エラー:', profileError)

            if (profileError) {
                console.warn('⚠️ プロフィール取得エラー:', profileError.message)
                console.warn('⚠️ エラー詳細:', JSON.stringify(profileError, null, 2))

                // タイムアウトの場合は、UIだけ更新して処理を続行
                if (profileError.code === 'TIMEOUT') {
                    console.warn('⚠️ タイムアウトのため、UI更新のみ実行して処理を続行')
                    currentPlan = 'trial'
                    subscriptionStatus = 'trial'
                    planExpiresAt = null
                    // プラン情報を表示してユーザーメニューは表示
                    updatePlanDisplay()
                    showUserManagementButton()
                    // 重複実行防止フラグをセット（次のINITIAL_SESSIONで正常処理させる）
                    // タイムアウトはスキップせず、次のイベントに期待
                    console.log('⏳ タイムアウト発生 - 次のイベントで再試行を許可')
                    return  // これ以上の処理はスキップ
                }

                // その他のエラー時はトライアルとして扱う（期限はnullのまま）
                currentPlan = 'trial'
                subscriptionStatus = 'trial'
                planExpiresAt = null
            } else if (profile) {
                console.log('✅ プロフィール取得成功:', profile)
                currentPlan = profile.plan || 'trial'
                subscriptionStatus = profile.subscription_status || 'trial'
                planExpiresAt = profile.plan_expires_at ? new Date(profile.plan_expires_at) : null

                // オーナーアカウント以外で stripe_customer_id がない場合は強制ログアウト
                const isOwner = session.user.email && session.user.email.includes('komedorobouinuzini')
                const justSignedUp = localStorage.getItem('justSignedUp') === 'true'

                console.log('🔍 オーナーチェック:', isOwner, '(メール:', session.user.email, ')')
                console.log('🔍 justSignedUpフラグ:', justSignedUp)
                console.log('🔍 stripe_customer_id:', profile.stripe_customer_id || 'なし')

                if (!isOwner && !profile.stripe_customer_id) {
                    // サインアップ直後はスキップ（Stripeに飛ばす）
                    if (justSignedUp) {
                        console.log('📝 サインアップ直後のため、Stripeリダイレクトを優先')
                        // Stripeリダイレクト前にUI更新（キャンセルボタン表示のため）
                        updatePlanDisplay()
                        showUserManagementButton()
                        return
                    }

                    console.log('🚨 クレジットカード未登録ユーザーを検出 - 強制ログアウト')

                    // アカウントを削除
                    try {
                        await fetch('/api/delete-pending-user', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: session.user.id,
                                userEmail: session.user.email
                            })
                        })
                        console.log('✅ クレジットカード未登録アカウント削除完了')
                    } catch (error) {
                        console.error('❌ アカウント削除エラー:', error)
                    }

                    // ログアウト
                    await supabaseAuth.auth.signOut()

                    // ログイン画面を表示
                    alert('⚠️ クレジットカード登録が必要です。\n\nアカウントは削除されました。\n新規登録からやり直してください。')

                    return
                }

                // プランステータスをチェック
                await checkPlanStatus()
            } else {
                console.warn('⚠️ プロフィールが見つかりません - 新規サインアップまたはトリガー未実行')
                console.warn('⚠️ ユーザーをログアウトさせ、プロフィール作成を待機します')

                // プロフィールがない場合はログアウト
                alert('⚠️ アカウント設定中です。\n\n数秒後に再度ログインしてください。')
                await supabaseAuth.auth.signOut()
                return
            }
        } catch (error) {
            console.error('❌ プロフィール取得エラー:', error)
            currentPlan = 'trial'
            subscriptionStatus = 'trial'
        }

        // プラン情報を表示
        updatePlanDisplay()

        // ユーザー管理ボタンの表示（オーナーのみ）
        showUserManagementButton()

        // ===================================
        // オーナー/一般ユーザー判定と追加設定
        // ===================================

        const isOwner = session.user.email && session.user.email.includes('komedorobouinuzini')

        if (isOwner) {
            console.log('✅ オーナーモード: 専用機能を有効化')

            // オーナー設定を読み込んで適用（選択UIなどの表示制御も含む）
            loadOwnerSettings()

            // SIGNED_INイベント（実際のログイン操作）の場合のみオーナー設定モーダルを表示
            // INITIAL_SESSION（ページリロード時）の場合はスキップ
            if (event === 'SIGNED_IN') {
                console.log('⚙️ オーナー設定モーダルを表示（ログイン時）')
                // 500ms遅延させて、authModalが完全に閉じてから表示
                setTimeout(() => {
                    const ownerSettingsModal = document.getElementById('ownerSettingsModal')
                    if (ownerSettingsModal) {
                        ownerSettingsModal.style.display = 'flex'
                        shouldCheckApiKeyAfterOwnerSettings = true
                    }
                }, 500)
            } else {
                console.log('📋 INITIAL_SESSION: オーナー設定モーダルをスキップ')
                // ページリロード時はAPIキー確認のみ
                yahooApiKey = localStorage.getItem('yahooApiKey')
                if (!yahooApiKey) {
                    console.log('⚙️ APIキーモーダルを表示')
                    const apiKeyModal = document.getElementById('apiKeyModal')
                    if (apiKeyModal) {
                        apiKeyModal.style.display = 'flex'
                    }
                }
            }
        } else {
            console.log('🔒 一般ユーザーモード')

            // 外注先管理ボタンを非表示
            const partnersBtn = document.getElementById('partnersBtn')
            if (partnersBtn) {
                partnersBtn.style.display = 'none'
            }

            // 選択UIを非表示
            const selectionUI = document.getElementById('selectionUI')
            if (selectionUI) {
                selectionUI.style.display = 'none'
                console.log('🔒 選択UIを非表示（一般ユーザー）')
            }

            // 一般ユーザーの場合は通常通りAPIキー確認
            yahooApiKey = localStorage.getItem('yahooApiKey')
            if (!yahooApiKey) {
                console.log('⚙️ APIキーモーダルを表示')
                const apiKeyModal = document.getElementById('apiKeyModal')
                if (apiKeyModal) {
                    apiKeyModal.style.display = 'flex'
                }
            }
        }

        // 処理完了フラグをセット（重複実行防止）
        uiInitialized = true
        console.log('✅ ログイン処理完了（uiInitialized = true）')

    } else if (event === 'SIGNED_OUT') {
        console.log('🚪 ログアウト')

        // フラグとグローバル変数をリセット
        uiInitialized = false  // UI初期化フラグをリセット
        shouldCheckApiKeyAfterOwnerSettings = false
        currentUser = null
        currentPlan = 'trial'
        planExpiresAt = null
        subscriptionStatus = 'trial'

        // プラン情報のみクリア（APIキーとオーナー設定は保持）
        localStorage.removeItem('profitMatrixPlan')

        // トライアルバナーを削除
        const trialBanner = document.getElementById('trialBanner')
        if (trialBanner) trialBanner.remove()

        // ログインフォームをリセット
        const loginEmail = document.getElementById('loginEmail')
        const loginPassword = document.getElementById('loginPassword')
        const loginBtn = document.getElementById('loginBtn')

        if (loginEmail) loginEmail.value = ''
        if (loginPassword) loginPassword.value = ''
        if (loginBtn) {
            loginBtn.textContent = 'ログイン'
            loginBtn.disabled = false
        }

        // すべてのモーダルを閉じる
        const authModal = document.getElementById('authModal')
        const userMenu = document.getElementById('userMenu')
        const ownerSettingsModal = document.getElementById('ownerSettingsModal')
        const apiKeyModal = document.getElementById('apiKeyModal')

        if (authModal) authModal.style.display = 'flex'
        if (userMenu) userMenu.style.display = 'none'
        if (ownerSettingsModal) ownerSettingsModal.style.display = 'none'
        if (apiKeyModal) apiKeyModal.style.display = 'none'

        console.log('✅ ログアウト処理完了、フォームリセット完了')

    } else if (event === 'INITIAL_SESSION' && !session) {
        // 初期ロード時にセッションがない場合、authModalを表示
        console.log('❌ 初期セッションなし: authModalを表示')
        const authModal = document.getElementById('authModal')
        if (authModal) {
            authModal.style.display = 'flex'
        }
    }
})

// タブ切り替え
window.switchAuthTab = function(tab) {
    if (tab === 'login') {
        document.getElementById('loginForm').style.display = 'block'
        document.getElementById('signupForm').style.display = 'none'
        document.getElementById('resetForm').style.display = 'none'
        document.getElementById('loginTab').style.background = 'linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%)'
        document.getElementById('loginTab').style.color = '#000'
        document.getElementById('signupTab').style.background = 'rgba(255, 255, 255, 0.1)'
        document.getElementById('signupTab').style.color = 'white'
    } else {
        document.getElementById('loginForm').style.display = 'none'
        document.getElementById('signupForm').style.display = 'block'
        document.getElementById('resetForm').style.display = 'none'
        document.getElementById('signupTab').style.background = 'linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%)'
        document.getElementById('signupTab').style.color = '#000'
        document.getElementById('loginTab').style.background = 'rgba(255, 255, 255, 0.1)'
        document.getElementById('loginTab').style.color = 'white'
    }
}

// ログイン処理
window.handleLogin = async function() {
    console.log('🔑 ログイン処理開始')

    // 🚨 重要: ログイン時はサインアップフラグをクリア（ログインとサインアップは別処理）
    console.log('🧹 justSignedUpフラグをクリア（ログイン時）')
    localStorage.removeItem('justSignedUp')
    localStorage.removeItem('pendingUserId')
    localStorage.removeItem('pendingUserEmail')

    const email = document.getElementById('loginEmail').value.trim()
    const password = document.getElementById('loginPassword').value

    if (!email || !password) {
        alert('メールアドレスとパスワードを入力してください')
        return
    }

    const btn = document.getElementById('loginBtn')
    btn.textContent = 'ログイン中...'
    btn.disabled = true

    try {
        console.log('📡 Supabaseに認証リクエスト送信中...')

        const { data, error } = await supabaseAuth.auth.signInWithPassword({
            email,
            password
        })

        if (error) {
            console.error('❌ ログインエラー:', error)
            let errorMessage = error.message

            // エラーメッセージを日本語化
            if (errorMessage.includes('Invalid login credentials')) {
                errorMessage = 'メールアドレスまたはパスワードが正しくありません'
            } else if (errorMessage.includes('Email not confirmed')) {
                errorMessage = 'メールアドレスが確認されていません。確認メールをチェックしてください。'
            }

            alert('ログインエラー: ' + errorMessage)
            btn.textContent = 'ログイン'
            btn.disabled = false
        } else {
            console.log('✅ ログインリクエスト成功。onAuthStateChangeで自動処理されます。')
            // UI更新はonAuthStateChangeで自動的に行われるため、ここでは何もしない
        }
    } catch (error) {
        console.error('❌ ログイン処理で例外発生:', error)
        console.error('エラー詳細:', error.message, error.stack)
        alert('ログインエラー: ' + (error.message || '不明なエラーが発生しました'))
        btn.textContent = 'ログイン'
        btn.disabled = false
    }
}

// 新規登録処理
window.handleSignup = async function() {
    const email = document.getElementById('signupEmail').value.trim()
    const password = document.getElementById('signupPassword').value
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value
    const selectedPlan = document.getElementById('signupPlan').value

    if (!email || !password || !passwordConfirm) {
        alert('全ての項目を入力してください')
        return
    }

    if (password !== passwordConfirm) {
        alert('パスワードが一致しません')
        return
    }

    if (password.length < 8) {
        alert('パスワードは8文字以上で設定してください')
        return
    }

    const btn = document.getElementById('signupBtn')
    btn.disabled = true
    btn.textContent = '登録中...'

    console.log('💳 登録プラン:', selectedPlan, '(7日間無料トライアル付き)')

    try {
        // 🚨 重要: フラグを先に設定（onAuthStateChangeが発火する前に準備）
        console.log('🚀 サインアップフラグを事前設定')
        localStorage.setItem('justSignedUp', 'true')
        redirectingToStripe = true

        // Supabaseで直接サインアップ（トリガーが自動的にprofilesを作成）
        const { data, error } = await supabaseAuth.auth.signUp({
            email: email,
            password: password
        })

        if (error) {
            console.error('サインアップエラー:', error)
            // エラー時はフラグをクリア
            localStorage.removeItem('justSignedUp')
            redirectingToStripe = false
            throw new Error(error.message)
        }

        console.log('✅ サインアップ成功:', data)

        // オーナーアカウントの場合はStripeスキップ
        if (email.includes('komedorobouinuzini')) {
            console.log('👑 オーナーアカウント: Stripe決済をスキップ')
            // オーナーはフラグをクリア（通常フロー）
            localStorage.removeItem('justSignedUp')
            redirectingToStripe = false
            alert('オーナーアカウントとして登録されました。ページをリロードします。')
            window.location.reload()
            return
        }

        // 一般ユーザーはStripe決済画面へリダイレクト
        btn.textContent = '決済画面へ移動中...'

        console.log('💳 Stripe決済パラメータ:', { enableTrial })

        const checkoutResponse = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: selectedPlan,  // 選択されたプラン
                userId: data.user.id,
                customerEmail: email,
                trial: selectedPlan === 'starter'  // スタータープランのみ7日間無料
            })
        })

        const checkoutData = await checkoutResponse.json()

        if (!checkoutResponse.ok) {
            // エラー時はフラグをクリア
            localStorage.removeItem('justSignedUp')
            redirectingToStripe = false
            throw new Error(checkoutData.error || 'Stripe決済画面の作成に失敗しました')
        }

        console.log('✅ Stripe決済画面URL取得:', checkoutData.url)

        // ユーザーIDをlocalStorageに保存（キャンセル時の削除用）
        localStorage.setItem('pendingUserId', data.user.id)
        localStorage.setItem('pendingUserEmail', email)

        // Stripe決済画面へリダイレクト
        console.log('🚀 Stripeへリダイレクト:', checkoutData.url)
        window.location.replace(checkoutData.url)

    } catch (error) {
        console.error('登録エラー:', error)
        alert('登録エラー: ' + error.message)
        btn.textContent = '登録する（7日間無料）'
        btn.disabled = false
    }
}

// ログアウト処理
window.handleLogout = function() {
    console.log('🚪 ログアウト処理開始')

    if (!confirm('ログアウトしますか？')) {
        console.log('❌ ログアウトがキャンセルされました')
        return
    }

    console.log('✅ ログアウト確認OK')

    // 1. ローカルストレージを完全にクリア
    console.log('🧹 ローカルストレージを完全クリア中...')
    const allKeys = []
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
            allKeys.push(key)
        }
    }
    allKeys.forEach(key => {
        console.log('  削除:', key)
        localStorage.removeItem(key)
    })
    console.log('✅ ローカルストレージクリア完了:', allKeys.length, '個のキーを削除')

    // 2. セッションストレージもクリア
    console.log('🧹 セッションストレージをクリア中...')
    const sessionKeys = []
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
            sessionKeys.push(key)
        }
    }
    sessionKeys.forEach(key => {
        console.log('  削除:', key)
        sessionStorage.removeItem(key)
    })
    console.log('✅ セッションストレージクリア完了:', sessionKeys.length, '個のキーを削除')

    // 3. グローバル変数をリセット
    currentUser = null
    currentPlan = 'trial'
    planExpiresAt = null
    subscriptionStatus = 'trial'
    console.log('✅ グローバル変数リセット完了')

    // 4. Supabaseのログアウトは完全にスキップ（ハングするため）
    // ローカルストレージを削除すれば、次回ロード時にセッションは存在しない
    console.log('⚠️ Supabase signOut()はスキップ（ローカルストレージ削除で十分）')

    // 5. 完全に新しいページとして読み込み
    console.log('🔄 ページを完全リセット...')
    window.location.replace(window.location.pathname)
}

// サブスクリプションキャンセル処理
window.handleCancelSubscription = async function() {
    console.log('🚫 キャンセル処理開始')

    // 確認メッセージ
    let confirmMessage = 'サブスクリプションをキャンセルしますか？'

    if (subscriptionStatus === 'trialing') {
        confirmMessage = 'トライアルをキャンセルしますか？\n\n即座にキャンセルされ、課金は発生しません。'
    } else if (subscriptionStatus === 'active') {
        const expiresDate = planExpiresAt ? new Date(planExpiresAt).toLocaleDateString('ja-JP') : '次回更新日'
        confirmMessage = `サブスクリプションをキャンセルしますか？\n\n${expiresDate}まで利用可能です。\nその後、自動的にキャンセルされます。`
    }

    if (!confirm(confirmMessage)) {
        console.log('❌ キャンセルが中止されました')
        return
    }

    const cancelBtn = document.getElementById('cancelSubBtn')
    if (cancelBtn) {
        cancelBtn.textContent = '処理中...'
        cancelBtn.disabled = true
    }

    try {
        const response = await fetch('/api/cancel-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id
            })
        })

        const data = await response.json()

        if (!response.ok) {
            throw new Error(data.error || 'キャンセルに失敗しました')
        }

        console.log('✅ キャンセル成功:', data)
        alert(data.message)

        // ページをリロードして状態を更新
        window.location.reload()

    } catch (error) {
        console.error('❌ キャンセルエラー:', error)
        alert('キャンセルエラー: ' + error.message)

        if (cancelBtn) {
            cancelBtn.textContent = 'キャンセル'
            cancelBtn.disabled = false
        }
    }
}

// パスワードリセット画面表示
window.showPasswordReset = function() {
    document.getElementById('loginForm').style.display = 'none'
    document.getElementById('signupForm').style.display = 'none'
    document.getElementById('resetForm').style.display = 'block'
}

// ログインフォームに戻る
window.showLoginForm = function() {
    switchAuthTab('login')
}

// パスワードリセット処理
window.handlePasswordReset = async function() {
    const email = document.getElementById('resetEmail').value.trim()

    if (!email) {
        alert('メールアドレスを入力してください')
        return
    }

    const btn = document.getElementById('resetBtn')
    btn.textContent = '送信中...'
    btn.disabled = true

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://profit-matrix.jp/'
    })

    if (error) {
        alert('エラー: ' + error.message)
    } else {
        alert('✅ パスワードリセット用のメールを送信しました！')
        showLoginForm()
    }

    btn.textContent = 'リセットリンクを送信'
    btn.disabled = false
}

// パスワード更新処理（リセットメールからのリンク用）
window.handlePasswordUpdate = async function() {
    const newPassword = document.getElementById('newPassword').value
    const newPasswordConfirm = document.getElementById('newPasswordConfirm').value

    if (!newPassword || !newPasswordConfirm) {
        alert('全ての項目を入力してください')
        return
    }

    if (newPassword !== newPasswordConfirm) {
        alert('パスワードが一致しません')
        return
    }

    if (newPassword.length < 8) {
        alert('パスワードは8文字以上で設定してください')
        return
    }

    const btn = document.getElementById('updatePasswordBtn')
    btn.textContent = '更新中...'
    btn.disabled = true

    try {
        const { error } = await supabaseAuth.auth.updateUser({
            password: newPassword
        })

        if (error) {
            alert('エラー: ' + error.message)
            btn.textContent = 'パスワードを更新'
            btn.disabled = false
        } else {
            alert('✅ パスワードを更新しました！\nログインしてください。')
            // パスワードリセットモーダルを閉じる
            document.getElementById('resetPasswordModal').style.display = 'none'
            // 認証モーダルを表示
            document.getElementById('authModal').style.display = 'flex'
            // ログインタブに切り替え
            switchAuthTab('login')
            // URLハッシュをクリア
            window.history.replaceState(null, '', window.location.pathname)
        }
    } catch (error) {
        console.error('❌ パスワード更新エラー:', error)
        alert('パスワード更新エラー: ' + (error.message || '不明なエラーが発生しました'))
        btn.textContent = 'パスワードを更新'
        btn.disabled = false
    }
}

// ========================================
// プラン管理機能
// ========================================

// プランステータスをチェック
async function checkPlanStatus() {
    // 最新のプロフィール情報を取得
    if (currentUser) {
        try {
            const { data: profile, error } = await supabaseAuth
                .from('profiles')
                .select('plan, subscription_status, plan_expires_at')
                .eq('id', currentUser.id)
                .single()

            if (!error && profile) {
                currentPlan = profile.plan || 'trial'
                subscriptionStatus = profile.subscription_status || 'trial'
                planExpiresAt = profile.plan_expires_at ? new Date(profile.plan_expires_at) : null
                console.log('🔄 プロフィール情報を更新しました:', { currentPlan, subscriptionStatus, planExpiresAt })
            }
        } catch (e) {
            console.warn('プロフィール更新エラー:', e)
        }
    }

    console.log('📊 プランステータスチェック:', {
        plan: currentPlan,
        status: subscriptionStatus,
        expiresAt: planExpiresAt
    })

    // オーナーアカウントはチェック不要
    if (currentUser && currentUser.email && currentUser.email.includes('komedorobouinuzini')) {
        console.log('✅ オーナーアカウント: 無制限')
        return
    }

    // トライアル期限切れチェック（Stripeの'trialing'ステータスまたは従来の'trial'）
    if ((subscriptionStatus === 'trial' || subscriptionStatus === 'trialing') && planExpiresAt) {
        const now = new Date()
        if (now > planExpiresAt) {
            console.log('⚠️ トライアル期限切れ')
            showPlanExpiredModal()
            return
        }

        // 残り日数を表示
        const daysLeft = Math.ceil((planExpiresAt - now) / (1000 * 60 * 60 * 24))
        console.log(`🎉 トライアル残り ${daysLeft} 日`)
        showTrialBanner(daysLeft)
    }

    // 支払い期限切れチェック
    if (subscriptionStatus === 'past_due') {
        console.log('⚠️ 支払い期限切れ')
        showPaymentOverdueModal()
    }
}

// トライアル残日数バナーを表示
function showTrialBanner(daysLeft) {
    const banner = document.createElement('div')
    banner.id = 'trialBanner'
    banner.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, rgba(17, 24, 39, 0.98) 0%, rgba(31, 41, 55, 0.98) 100%);
        border: 2px solid;
        border-image: linear-gradient(135deg, #00FFA3, #00B8D9) 1;
        color: white;
        padding: 16px 60px 16px 24px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 8px 32px rgba(0, 255, 163, 0.3), 0 0 20px rgba(0, 184, 217, 0.2);
        backdrop-filter: blur(10px);
        animation: slideDown 0.5s ease-out;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 90%;
    `

    // アニメーションのキーフレームを追加
    if (!document.getElementById('trialBannerStyle')) {
        const style = document.createElement('style')
        style.id = 'trialBannerStyle'
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            @keyframes pulse {
                0%, 100% {
                    box-shadow: 0 8px 32px rgba(0, 255, 163, 0.3), 0 0 20px rgba(0, 184, 217, 0.2);
                }
                50% {
                    box-shadow: 0 8px 32px rgba(0, 255, 163, 0.5), 0 0 30px rgba(0, 184, 217, 0.4);
                }
            }
        `
        document.head.appendChild(style)
    }

    banner.innerHTML = `
        <span style="font-size: 20px;">⏰</span>
        <span style="flex: 1;">
            <span style="color: #00FFA3; font-weight: 700;">無料トライアル</span>
            <span style="color: #94A3B8; margin: 0 8px;">|</span>
            残り <span style="color: #FFD700; font-weight: 700; font-size: 16px;">${daysLeft}</span> 日
        </span>
        <button onclick="openPlanModal()" style="
            background: linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%);
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            color: #000;
            font-weight: 700;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            white-space: nowrap;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            💎 プランを選択
        </button>
        <button onclick="document.getElementById('trialBanner').remove()" style="
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            color: white;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            padding: 0;
            line-height: 1;
        " onmouseover="this.style.background='rgba(255, 107, 157, 0.3)'; this.style.borderColor='rgba(255, 107, 157, 0.5)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'">
            ×
        </button>
    `

    // 既存のバナーを削除
    const existingBanner = document.getElementById('trialBanner')
    if (existingBanner) existingBanner.remove()

    document.body.appendChild(banner)

    // パルスアニメーションを追加
    banner.style.animation = 'slideDown 0.5s ease-out, pulse 3s ease-in-out infinite'
}

// トライアル期限切れモーダルを表示
function showPlanExpiredModal() {
    alert('⚠️ 無料トライアル期間が終了しました\n\n検索機能を使用するには、有料プランへのアップグレードが必要です。')
    openPlanModal()
}

// 支払い期限切れモーダルを表示
function showPaymentOverdueModal() {
    alert('⚠️ お支払いが確認できていません\n\nサービスの利用を継続するには、お支払い情報を更新してください。')
    openPlanModal()
}

// プラン表示を更新
function updatePlanDisplay() {
    const planDisplayEl = document.getElementById('userPlanDisplay')
    const planExpiresDisplayEl = document.getElementById('planExpiresDisplay')
    const upgradeBtn = document.getElementById('upgradeBtn')
    const cancelSubBtn = document.getElementById('cancelSubBtn')

    if (!planDisplayEl || !upgradeBtn) return

    // デフォルトでキャンセルボタンを非表示
    if (cancelSubBtn) cancelSubBtn.style.display = 'none'
    // デフォルトで次回更新日を非表示
    if (planExpiresDisplayEl) planExpiresDisplayEl.style.display = 'none'

    // オーナーアカウントの場合
    if (currentUser && currentUser.email && currentUser.email.includes('komedorobouinuzini')) {
        planDisplayEl.textContent = '👑 オーナー（無制限）'
        planDisplayEl.style.color = '#FFD700'
        upgradeBtn.style.display = 'none' // オーナーはアップグレード不要
        return
    }

    // プラン名のマッピング
    const planNames = {
        trial: 'トライアル',
        trialing: 'トライアル（Stripe）',
        starter: 'スタータープラン',
        standard: 'スタンダードプラン',
        premium: 'プレミアムプラン'
    }

    const planName = planNames[currentPlan] || 'トライアル'

    // トライアル期限を表示（従来のtrialまたはStripeのtrialing）
    if (subscriptionStatus === 'trial' || subscriptionStatus === 'trialing') {
        if (planExpiresAt) {
            const now = new Date()
            const daysLeft = Math.ceil((planExpiresAt - now) / (1000 * 60 * 60 * 24))

            if (daysLeft > 0) {
                planDisplayEl.textContent = `🎉 ${planName}（残り${daysLeft}日）`
                planDisplayEl.style.color = '#FFD700'

                // 次回課金日を表示
                if (planExpiresDisplayEl) {
                    const expiresDate = new Date(planExpiresAt).toLocaleDateString('ja-JP')
                    planExpiresDisplayEl.textContent = `次回課金: ${expiresDate}`
                    planExpiresDisplayEl.style.display = 'block'
                }
            } else {
                planDisplayEl.textContent = '⚠️ トライアル期限切れ'
                planDisplayEl.style.color = '#FF6B9D'
            }
        } else {
            planDisplayEl.textContent = `🎉 ${planName}`
            planDisplayEl.style.color = '#FFD700'
        }
        // トライアル中はキャンセルボタンを表示
        if (cancelSubBtn) cancelSubBtn.style.display = 'block'
    } else if (subscriptionStatus === 'active') {
        planDisplayEl.textContent = `✅ ${planName}`
        planDisplayEl.style.color = '#00FFA3'

        // 次回更新日を表示
        if (planExpiresDisplayEl && planExpiresAt) {
            const expiresDate = new Date(planExpiresAt).toLocaleDateString('ja-JP')
            planExpiresDisplayEl.textContent = `次回更新: ${expiresDate}`
            planExpiresDisplayEl.style.display = 'block'
        }

        // キャンセルボタンを表示
        if (cancelSubBtn) cancelSubBtn.style.display = 'block'

        // プレミアムプランの場合はアップグレードボタンを非表示
        if (currentPlan === 'premium') {
            upgradeBtn.textContent = '✨ 最高プラン'
            upgradeBtn.style.background = 'rgba(255, 215, 0, 0.2)'
            upgradeBtn.style.color = '#FFD700'
            upgradeBtn.style.cursor = 'default'
            upgradeBtn.onclick = null
        }
    } else if (subscriptionStatus === 'past_due') {
        planDisplayEl.textContent = '⚠️ 支払い期限切れ'
        planDisplayEl.style.color = '#FF6B9D'
    } else if (subscriptionStatus === 'canceled') {
        planDisplayEl.textContent = '❌ キャンセル済み'
        planDisplayEl.style.color = '#94A3B8'
    } else {
        planDisplayEl.textContent = `📦 ${planName}`
        planDisplayEl.style.color = '#00FFA3'
    }
}

// プラン選択モーダルを開く
window.openPlanModal = function() {
    document.getElementById('planModal').style.display = 'flex'
}

// プラン選択モーダルを閉じる
window.closePlanModal = function() {
    document.getElementById('planModal').style.display = 'none'
}

// プランを選択
window.selectPlan = async function(plan) {
    console.log('💳 プラン選択:', plan)

    // ローディング表示
    const btn = event.target
    const originalText = btn.textContent
    btn.textContent = 'Stripeへ移動中...'
    btn.disabled = true

    try {
        // Stripe Checkout Sessionを作成
        const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                plan: plan,
                userId: currentUser.id,
                customerEmail: currentUser.email
            })
        })

        const data = await response.json()

        if (!response.ok) {
            throw new Error(data.error || 'Checkout Session作成に失敗しました')
        }

        console.log('✅ Checkout Session作成成功:', data.sessionId)

        // StripeのCheckoutページにリダイレクト
        window.location.href = data.url

    } catch (error) {
        console.error('❌ プラン選択エラー:', error)
        alert('プラン選択エラー:\n' + error.message)
        btn.textContent = originalText
        btn.disabled = false
    }
}

// 検索前のプランチェック
function canUseSearch(rowCount) {
    // オーナーアカウントは無制限
    if (currentUser && currentUser.email && currentUser.email.includes('komedorobouinuzini')) {
        return { allowed: true }
    }

    // トライアル期限切れチェック（activeステータスの場合はスキップ）
    if ((subscriptionStatus === 'trial' || subscriptionStatus === 'trialing') && planExpiresAt) {
        const now = new Date()
        if (now > planExpiresAt && subscriptionStatus !== 'active') {
            return {
                allowed: false,
                reason: 'トライアル期限切れ',
                message: '無料トライアル期間が終了しました。\n有料プランにアップグレードしてください。'
            }
        }
    }

    // サブスクリプション状態チェック
    // trial: 無料トライアル, trialing: Stripeトライアル期間, active: 有料プラン有効
    if (subscriptionStatus !== 'trial' && subscriptionStatus !== 'trialing' && subscriptionStatus !== 'active') {
        return {
            allowed: false,
            reason: 'サブスクリプション無効',
            message: 'サブスクリプションが有効ではありません。\nお支払い情報を更新してください。'
        }
    }

    // プラン別の行数制限チェック
    const limits = {
        trial: 300,    // トライアル: Standardと同等
        starter: 100,
        standard: 300,
        premium: 999999  // 無制限
    }

    const maxRows = limits[currentPlan] || 100

    if (rowCount > maxRows) {
        return {
            allowed: false,
            reason: 'プラン制限',
            message: `${currentPlan}プランでは最大${maxRows}行まで検索できます。\n\nCSVファイルは${rowCount}行あります。\n上位プランへのアップグレードをご検討ください。`,
            currentLimit: maxRows,
            requestedRows: rowCount
        }
    }

    return { allowed: true, limit: maxRows }
}


// 初期化処理を更新
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 アプリ初期化開始')

    // URLパラメータをチェック
    const urlParams = new URLSearchParams(window.location.search)
    const paymentSuccess = urlParams.get('success')
    const paymentCanceled = urlParams.get('canceled')
    const authMode = urlParams.get('mode') // LPから新規登録に飛ばす用
    const trialParam = urlParams.get('trial') // トライアル有無（デフォルトtrue）
    if (trialParam === 'false') {
        localStorage.setItem('disableTrial', 'true') // トライアル無効をlocalStorageに保存
    }

    if (paymentSuccess === 'true') {
        console.log('✅ Stripe決済成功')
        // URLをクリーンにしてからアラート表示
        window.history.replaceState(null, '', window.location.pathname)

        // サインアップフラグとリダイレクトフラグをクリア
        localStorage.removeItem('justSignedUp')
        localStorage.removeItem('pendingUserId')
        localStorage.removeItem('pendingUserEmail')
        localStorage.removeItem('disableTrial')
        redirectingToStripe = false

        alert('🎉 お支払いが完了しました！\n\nプランが有効化されました。\nご利用ありがとうございます。')
        // onAuthStateChangeでプラン情報が更新される
        return
    }

    if (paymentCanceled === 'true') {
        console.log('⚠️ Stripe決済キャンセル')

        // URLをクリーンに
        window.history.replaceState(null, '', window.location.pathname)

        // サインアップフラグとリダイレクトフラグをクリア
        localStorage.removeItem('justSignedUp')
        redirectingToStripe = false

        // キャンセルしたユーザーのアカウントを削除
        const pendingUserId = localStorage.getItem('pendingUserId')
        const pendingUserEmail = localStorage.getItem('pendingUserEmail')

        if (pendingUserId && pendingUserEmail) {
            console.log('🗑️ クレジットカード未登録ユーザーを削除:', pendingUserEmail)

            try {
                // バックエンドAPIを呼んでユーザーを削除
                const response = await fetch('/api/delete-pending-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: pendingUserId,
                        userEmail: pendingUserEmail
                    })
                })

                const data = await response.json()

                if (!response.ok) {
                    console.error('❌ ユーザー削除エラー:', data)
                } else {
                    console.log('✅ ユーザー削除成功:', data)
                }
            } catch (error) {
                console.error('❌ ユーザー削除処理エラー:', error)
            }

            // localStorageをクリア
            localStorage.removeItem('pendingUserId')
            localStorage.removeItem('pendingUserEmail')
        }

        alert('⚠️ クレジットカード登録がキャンセルされました。\n\nアカウントは削除されました。\n\n再度サインアップが必要です。')

        // ログイン画面を表示
        const authModal = document.getElementById('authModal')
        if (authModal) {
            authModal.style.display = 'flex'
        }

        return
    }

    // LPから新規登録モードで来た場合
    if (authMode === 'signup') {
        console.log('📝 新規登録モードで開始')
        const authModal = document.getElementById('authModal')
        if (authModal) {
            authModal.style.display = 'flex'
            switchAuthTab('signup')
        }
        // URLをクリーンに
        window.history.replaceState(null, '', window.location.pathname)
    }

    // URLハッシュをチェック
    const hash = window.location.hash

    // パスワードリセット処理
    if (hash && hash.includes('type=recovery')) {
        console.log('🔑 パスワードリセットリンクを検出')
        document.getElementById('resetPasswordModal').style.display = 'flex'
        return
    }

    // メール確認後のリダイレクト処理
    if (hash && hash.includes('access_token')) {
        console.log('🔗 メール確認リダイレクトを検出')
        window.history.replaceState(null, '', window.location.pathname)
    }

    // ===================================
    // 重要：authModal/userMenuの制御は一切しない
    // 全てonAuthStateChangeに任せる
    // ===================================
    console.log('✅ DOMContentLoaded完了: UI制御はonAuthStateChangeに完全委譲')

    // 外注先リストを読み込み
    loadPartnersFromStorage();

    // 初期状態は検索モード（緑背景）
    document.body.classList.remove('fusion-mode');
});

// APIキー保存
document.getElementById('saveApiKey').addEventListener('click', () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (key.length < 10) {
        alert('正しいAPIキーを入力してください');
        return;
    }

    yahooApiKey = key;
    localStorage.setItem('yahooApiKey', key);
    document.getElementById('apiKeyModal').style.display = 'none';
});

// 設定ボタン
document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('apiKeyModal').style.display = 'flex';
    document.getElementById('apiKeyInput').value = yahooApiKey || '';
});

// CSVファイル選択
function handleFileSelect(input) {
    csvFile = input.files[0];
    if (csvFile) {
        document.getElementById('fileName').textContent = `✅ ${csvFile.name}`;
        document.getElementById('batchSearchBtn').disabled = false;
    }
}

// CSVファイルインプットにイベントリスナー追加
document.getElementById('csvFile').addEventListener('change', function() {
    handleFileSelect(this);

    // ファイル選択後、結果セクションまでスムーズスクロール
    setTimeout(() => {
        document.getElementById('searchResults').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }, 300);
});

// Yahoo検索モードのドラッグ&ドロップ機能
const yahooUploadArea = document.getElementById('yahooUploadArea');
const csvFileInput = document.getElementById('csvFile');

if (yahooUploadArea && csvFileInput) {
    // ドラッグオーバー時
    yahooUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        yahooUploadArea.style.borderColor = '#00FFA3';
        yahooUploadArea.style.background = 'rgba(0, 255, 163, 0.1)';
        yahooUploadArea.style.transform = 'scale(1.02)';
    });

    // ドラッグ離脱時
    yahooUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        yahooUploadArea.style.borderColor = 'rgba(0, 255, 163, 0.3)';
        yahooUploadArea.style.background = 'rgba(0, 255, 163, 0.05)';
        yahooUploadArea.style.transform = 'scale(1)';
    });

    // ドロップ時
    yahooUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        yahooUploadArea.style.borderColor = 'rgba(0, 255, 163, 0.3)';
        yahooUploadArea.style.background = 'rgba(0, 255, 163, 0.05)';
        yahooUploadArea.style.transform = 'scale(1)';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // csvFileを直接設定
            csvFile = files[0];
            document.getElementById('fileName').textContent = `✅ ${csvFile.name}`;
            document.getElementById('batchSearchBtn').disabled = false;

            // ファイル選択後、結果セクションまでスムーズスクロール
            setTimeout(() => {
                document.getElementById('searchResults').scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 300);
        }
    });
}

// 検索開始
async function startBatchSearch() {
    if (!yahooApiKey) {
        alert('Yahoo API Keyを設定してください');
        document.getElementById('apiKeyModal').style.display = 'flex';
        return;
    }

    if (!csvFile) {
        alert('CSVファイルを選択してください');
        return;
    }

    // デバッグ: 現在のプラン情報を確認
    console.log(`🎫 検索開始時のプラン情報: currentPlan=${currentPlan}`)
    console.log(`📋 localStorage.profitMatrixPlan=${localStorage.getItem('profitMatrixPlan')}`)

    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <div class="loading-text">ANALYZING...</div>
            <div class="loading-subtext">AIが最適な利益商品を検出中</div>
        </div>
    `;

    // 結果セクションまでスクロール
    setTimeout(() => {
        resultsDiv.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }, 100);

    document.getElementById('stats').style.display = 'grid';
    document.getElementById('currentSearch').style.display = 'none';
    searchResults = [];

    // 統計カードに進行中エフェクトを追加
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        card.classList.remove('completed');
        card.classList.add('searching');
    });

    try {
        // ファイルを読み込み（CSV/Excel対応）
        let csvData;
        const fileName = csvFile.name.toLowerCase();

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            // Excelファイルの場合
            console.log('📊 Excelファイルを読み込み中...');
            const arrayBuffer = await csvFile.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const csvText = XLSX.utils.sheet_to_csv(firstSheet);
            csvData = parseCSV(csvText);
            console.log('✅ Excelファイル読み込み完了');
        } else {
            // CSVファイルの場合
            const text = await csvFile.text();
            csvData = parseCSV(text);
        }

        if (csvData.length === 0) {
            throw new Error('ファイルにデータがありません');
        }

        // プランチェック
        const planCheck = canUseSearch(csvData.length);

        if (!planCheck.allowed) {
            // プラン制限に引っかかった
            console.log('⚠️ プラン制限:', planCheck.reason);
            alert(`⚠️ ${planCheck.reason}\n\n${planCheck.message}`);

            // プラン選択モーダルを表示
            openPlanModal();

            // ローディングを解除
            resultsDiv.innerHTML = '<div class="message">プランのアップグレードが必要です</div>';
            return;
        }

        // 行数制限を適用
        const limitedData = csvData.slice(0, planCheck.limit);

        // 制限がかかっている場合は通知
        if (csvData.length > planCheck.limit) {
            console.log(`⚠️ プラン制限: ${csvData.length}行中、${planCheck.limit}行のみ検索します`);

            // アップグレード提案
            const shouldUpgrade = confirm(
                `📊 プラン制限\n\n` +
                `CSVファイルは${csvData.length}行ありますが、\n` +
                `${currentPlan}プランでは最大${planCheck.limit}行まで検索できます。\n\n` +
                `先頭${planCheck.limit}行のみ検索を実行します。\n\n` +
                `上位プランにアップグレードしますか？`
            );

            if (shouldUpgrade) {
                openPlanModal();
                resultsDiv.innerHTML = '';
                return;
            }
        }

        // 検索実行
        let completed = 0;
        let cardIndex = 0; // カードのインデックス
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'results-container';
        resultsDiv.innerHTML = '';
        resultsDiv.appendChild(resultsContainer);

        for (const item of limitedData) {
            completed++;

            // 検索中の商品を表示
            const currentSearchDiv = document.getElementById('currentSearch');
            const currentSearchText = document.getElementById('currentSearchText');
            const searchProgress = document.getElementById('searchProgress');
            currentSearchDiv.style.display = 'block';
            currentSearchText.textContent = `${item.brand} ${item.item || ''}`;
            searchProgress.textContent = `${completed}/${limitedData.length}`;

            // 検索実行
            const results = await searchYahooShopping(item);

            if (results.length > 0) {
                searchResults.push(...results);
                results.forEach(result => {
                    appendResultCard(resultsContainer, result, cardIndex++);
                });
            }

            // 統計更新
            updateStats(completed, limitedData.length);

            // API制限対策: 2秒待機 (Yahoo API: 30req/min制限)
            await sleep(2000);

            // 29個目で追加5秒待機（次の1分枠に入るため）
            if (completed % 29 === 0) {
                console.log(`29個処理完了。追加5秒待機...`);
                await sleep(5000);
            }
        }

        // 検索完了：表示を非表示
        document.getElementById('currentSearch').style.display = 'none';

        // 統計カードを完了エフェクトに切り替え
        const statCards = document.querySelectorAll('.stat-card');
        statCards.forEach(card => {
            card.classList.remove('searching');
            card.classList.add('completed');
        });

        // 完了メッセージ
        if (searchResults.length === 0) {
            resultsDiv.innerHTML = `
                <div class="message error-message">
                    利益商品が見つかりませんでした
                </div>
            `;
        }

    } catch (error) {
        document.getElementById('currentSearch').style.display = 'none';

        // エラー時も完了エフェクトに切り替え
        const statCards = document.querySelectorAll('.stat-card');
        statCards.forEach(card => {
            card.classList.remove('searching');
            card.classList.add('completed');
        });
        resultsDiv.innerHTML = `
            <div class="message error-message">
                エラー: ${error.message}
            </div>
        `;
    }
}

// CSV パース（列数自動判定対応）
function parseCSV(text) {
    // BOM除去
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.substring(1);
    }

    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const data = [];

    // ヘッダー行から列構造を自動判定
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    console.log('📋 CSVヘッダー:', headers);

    // 列インデックスを自動検出
    let brandCol = -1;
    let itemCol = -1;
    let priceCol = -1;
    let productCodeCol = -1;  // 商品番号列

    headers.forEach((header, index) => {
        // ブランド列を検出
        if (brandCol === -1 && (
            header.includes('ブランド') ||
            header.includes('brand') ||
            header === 'a' ||
            header === 'a列'
        )) {
            brandCol = index;
        }
        // 商品名列を検出
        if (itemCol === -1 && (
            header.includes('商品') ||
            header.includes('グループ') ||
            header.includes('item') ||
            header.includes('name') ||
            header.includes('title') ||
            header === 'b' ||
            header === 'b列'
        )) {
            itemCol = index;
        }
        // 価格列を検出
        if (priceCol === -1 && (
            header.includes('価格') ||
            header.includes('price') ||
            header.includes('金額') ||
            header.includes('最頻値') ||
            header.includes('相場')
        )) {
            priceCol = index;
        }
        // 商品番号列を検出
        if (productCodeCol === -1 && (
            header.includes('番号') ||
            header.includes('code') ||
            header.includes('型番') ||
            header.includes('品番')
        )) {
            productCodeCol = index;
        }
    });

    // 価格列・商品番号列が見つからない場合、データ行から自動検出
    if ((priceCol === -1 || productCodeCol === -1) && lines.length > 1) {
        const firstDataRow = lines[1].split(',');
        for (let i = 0; i < firstDataRow.length; i++) {
            const val = firstDataRow[i]?.trim();
            // ハイフン入りは商品番号の可能性が高い
            if (val && val.includes('-') && productCodeCol === -1) {
                productCodeCol = i;
                console.log('📝 列', i, 'はハイフン入り（商品番号）:', val);
                continue;
            }
            // 数値のみの列を価格列として検出（4桁以上の数字）
            if (priceCol === -1 && val && /^\d{4,}$/.test(val.replace(/[,，]/g, ''))) {
                priceCol = i;
                console.log('⚠️ 価格列が見つからないため、数値列を検出:', priceCol, '(値:', val, ')');
            }
        }
        // それでも見つからない場合は3列目（インデックス2）を試す
        if (priceCol === -1 && firstDataRow.length > 2) {
            priceCol = 2;
            console.log('⚠️ 価格列が見つからないため、3列目を使用:', priceCol);
        }
    }

    // ブランド列が見つからない場合、最初の列をブランドとみなす
    if (brandCol === -1) {
        brandCol = 0;
        console.log('⚠️ ブランド列が見つからないため、最初の列を使用:', brandCol);
    }

    // 商品名列が見つからない場合、ブランドの次の列を使用（あれば）
    if (itemCol === -1 && headers.length > 2) {
        itemCol = brandCol + 1;
        if (itemCol === priceCol) itemCol = -1; // 価格列と被る場合は無効
        console.log('⚠️ 商品名列が見つからないため、推定:', itemCol);
    }

    console.log(`📊 列マッピング: ブランド=${brandCol}, 商品名=${itemCol}, 価格=${priceCol}, 商品番号=${productCodeCol}`);

    // データ行を処理
    for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',');

        // 最低限、ブランド列と価格列が必要
        if (columns.length <= Math.max(brandCol, priceCol)) continue;

        const brand = columns[brandCol]?.trim();
        const item = itemCol >= 0 ? columns[itemCol]?.trim() : '';
        const productCode = productCodeCol >= 0 ? columns[productCodeCol]?.trim() : '';
        const priceStr = columns[priceCol]?.trim();

        if (!brand || !priceStr) continue;

        // 価格から数字のみ抽出
        const price = parseInt(priceStr.replace(/[^0-9]/g, ''));

        if (isNaN(price) || price <= 0) continue;

        data.push({
            brand,
            item: item || brand,
            productCode: productCode || '',
            originalPrice: price
        });
    }

    console.log(`✅ パース完了: ${data.length}件の商品を読み込み`);
    return data;
}

// Yahoo Shopping API検索（商品名 → 結果なければ商品番号で再検索）
async function searchYahooShopping(item) {
    const maxPrice = Math.floor(item.originalPrice * 0.6); // 40%利益 = 60%価格

    // まず商品名で検索
    const query = `${item.brand} ${item.item || ''}`.trim();
    let results = await executeYahooSearch(query, maxPrice, item);

    // 結果がなく、商品番号がある場合は2秒待機してから商品番号（ハイフンなし）で再検索
    if (results.length === 0 && item.productCode) {
        const codeWithoutHyphen = item.productCode.replace(/-/g, '');
        console.log(`🔄 商品名で結果なし → 2秒待機後に商品番号（ハイフンなし）で再検索: ${codeWithoutHyphen}`);
        await sleep(2000);
        const codeQuery = `${item.brand} ${codeWithoutHyphen}`.trim();
        results = await executeYahooSearch(codeQuery, maxPrice, item);
    }

    return results;
}

// Yahoo Shopping API実行
async function executeYahooSearch(query, maxPrice, item) {
    const params = new URLSearchParams({
        appid: yahooApiKey,
        query: query,
        price_to: maxPrice,
        results: 30,
        sort: '+price'
    });

    const url = `/api/search?${params}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`API Error: ${response.status}`);

            // 429エラー（レート制限）の場合は60秒待機してリトライ
            if (response.status === 429) {
                console.warn('Rate limit exceeded. Waiting 60 seconds...');
                await sleep(60000);
                return executeYahooSearch(query, maxPrice, item); // リトライ
            }

            return [];
        }

        const data = await response.json();

        if (!data.hits || data.hits.length === 0) {
            return [];
        }

        const results = [];

        for (const hit of data.hits) {
            // ブランド名チェック
            const itemName = (hit.name || '').toLowerCase();
            const brandName = item.brand.toLowerCase();

            if (!itemName.includes(brandName)) {
                continue;
            }

            // 在庫フィルター
            const includeUnknown = document.getElementById('includeUnknownStock').checked;
            const stockStatus = hit.inStock !== false ? '在庫あり' : '在庫状況不明';

            // トグルOFFで在庫不明を除外
            if (!includeUnknown && stockStatus === '在庫状況不明') {
                continue;
            }

            // 利益計算
            const profitMargin = ((item.originalPrice - hit.price) / item.originalPrice) * 100;
            const profit = item.originalPrice - hit.price;

            if (profitMargin < 40) {
                continue;
            }

            results.push({
                productName: hit.name,
                price: hit.price,
                originalPrice: item.originalPrice,
                profit: profit,
                profitMargin: Math.floor(profitMargin),
                image: hit.image?.medium || hit.image?.small || '',
                url: hit.url,
                shop: hit.seller?.name || 'ストア名不明',
                stock: stockStatus,
                searchQuery: query
            });

            if (results.length >= 5) {
                break;
            }
        }

        return results;

    } catch (error) {
        console.error('Yahoo API Error:', error);
        return [];
    }
}

// 結果カード追加
function appendResultCard(container, item, index) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.dataset.index = index; // インデックスを保存

    // 商品データをカードに保存
    card.dataset.productData = JSON.stringify(item);

    // オーナー設定に基づいてチェックボックスを表示
    const isOwner = currentUser && currentUser.email && currentUser.email.includes('komedorobouinuzini');
    const showSelectionUI = localStorage.getItem('ownerSettings_showSelectionUI') !== 'false';
    const checkboxHTML = (isOwner && showSelectionUI) ? `
        <div class="card-checkbox-container">
            <input type="checkbox" class="card-checkbox" id="checkbox-${index}" onchange="toggleProductSelect(this, ${index})">
            <label for="checkbox-${index}" class="checkbox-label"></label>
        </div>
    ` : '';

    card.innerHTML = `
        ${checkboxHTML}
        <img src="${item.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzExMTgyNyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjMDBGRkEzIiBmb250LXNpemU9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'}" alt="${item.productName}" class="result-image">
        <div class="result-content">
            <div class="result-title">${item.productName}</div>
            <div class="profit-badge">利益率 ${item.profitMargin || 0}%</div>
            <div class="price-container">
                <div class="price-box">
                    <div class="price-label">Mercari</div>
                    <div class="price-value mercari-price">¥${(item.originalPrice || 0).toLocaleString()}</div>
                </div>
                <div class="price-box">
                    <div class="price-label">Yahoo</div>
                    <div class="price-value yahoo-price">¥${(item.price || 0).toLocaleString()}</div>
                </div>
                <div class="price-box">
                    <div class="price-label">Profit</div>
                    <div class="price-value profit-price">¥${(item.profit || 0).toLocaleString()}</div>
                </div>
            </div>
            <div class="shop-info">
                📍 ${item.shop} | ${item.stock}
            </div>
            <div class="search-query-info">
                🔍 ${item.searchQuery || ''}
            </div>
            <a href="${item.url}" target="_blank" class="buy-link">
                PURCHASE →
            </a>
            <button class="skip-btn" onclick="toggleSkip(this)">見送り</button>
        </div>
    `;
    container.appendChild(card);

    // オーナーモード: メルカリ価格ダブルクリックで編集可能
    if (isOwner) {
        const mercariPriceEl = card.querySelector('.mercari-price');
        if (mercariPriceEl) {
            mercariPriceEl.addEventListener('dblclick', function() {
                startMercariPriceEdit(card, mercariPriceEl);
            });
        }
    }

    // 見送り済みかチェックして、状態を復元
    if (isProductSkipped(item.url)) {
        card.classList.add('skipped');
        const skipBtn = card.querySelector('.skip-btn');
        if (skipBtn) {
            skipBtn.textContent = '見送り済み';
            skipBtn.style.background = 'rgba(148, 163, 184, 0.3)';
        }
    }
}

// オーナーモード: メルカリ価格インライン編集
function startMercariPriceEdit(card, priceEl) {
    // 既に編集中なら何もしない
    if (priceEl.querySelector('input')) return;

    const productData = JSON.parse(card.dataset.productData);
    const currentPrice = productData.originalPrice || 0;

    const originalHTML = priceEl.innerHTML;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'mercari-price-input';
    input.value = currentPrice;
    input.min = '0';

    priceEl.innerHTML = '';
    priceEl.appendChild(input);
    input.focus();
    input.select();

    function commitEdit() {
        const newPrice = parseInt(input.value) || 0;
        if (newPrice <= 0) {
            priceEl.innerHTML = originalHTML;
            return;
        }

        // 再計算
        const yahooPrice = productData.price || 0;
        const newProfit = newPrice - yahooPrice;
        const newMargin = newPrice > 0 ? Math.floor(((newPrice - yahooPrice) / newPrice) * 100) : 0;

        // productData更新
        productData.originalPrice = newPrice;
        productData.profit = newProfit;
        productData.profitMargin = newMargin;
        card.dataset.productData = JSON.stringify(productData);

        // 表示更新
        priceEl.textContent = `¥${newPrice.toLocaleString()}`;
        card.querySelector('.profit-price').textContent = `¥${newProfit.toLocaleString()}`;
        card.querySelector('.profit-badge').textContent = `利益率 ${newMargin}%`;

        // 統計再計算
        recalculateStats();
    }

    input.addEventListener('blur', commitEdit);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            input.removeEventListener('blur', commitEdit);
            priceEl.innerHTML = originalHTML;
        }
    });
}

// 見送り済み商品を取得
function getSkippedProducts() {
    try {
        const skipped = localStorage.getItem('skippedProducts');
        return skipped ? JSON.parse(skipped) : [];
    } catch (e) {
        console.error('見送りデータの読み込みエラー:', e);
        return [];
    }
}

// 見送り済み商品を保存
function saveSkippedProducts(skippedList) {
    try {
        localStorage.setItem('skippedProducts', JSON.stringify(skippedList));
    } catch (e) {
        console.error('見送りデータの保存エラー:', e);
    }
}

// 見送り済みかチェック
function isProductSkipped(url) {
    const skippedList = getSkippedProducts();
    return skippedList.includes(url);
}

// 見送り済みリストをクリア
window.clearSkippedProducts = function() {
    if (confirm('見送り済みリストを全てクリアしますか？')) {
        localStorage.removeItem('skippedProducts');

        // 現在表示中のカードの見送り状態を解除
        const skippedCards = document.querySelectorAll('.result-card.skipped');
        skippedCards.forEach(card => {
            card.classList.remove('skipped');
            const skipBtn = card.querySelector('.skip-btn');
            if (skipBtn) {
                skipBtn.textContent = '見送り';
                skipBtn.style.background = '';
            }
        });

        // 統計を再計算
        recalculateStats();

        alert('✅ 見送り済みリストをクリアしました');
    }
}

// 見送りトグル
window.toggleSkip = function(button) {
    const card = button.closest('.result-card');
    const productData = JSON.parse(card.dataset.productData);
    const productUrl = productData.url;
    const isSkipped = card.classList.toggle('skipped');

    // localStorageを更新
    let skippedList = getSkippedProducts();

    if (isSkipped) {
        // 見送りに追加
        if (!skippedList.includes(productUrl)) {
            skippedList.push(productUrl);
        }
        button.textContent = '見送り済み';
        button.style.background = 'rgba(148, 163, 184, 0.3)';
    } else {
        // 見送りから削除
        skippedList = skippedList.filter(url => url !== productUrl);
        button.textContent = '見送り';
        button.style.background = '';
    }

    saveSkippedProducts(skippedList);

    // 統計を再計算
    recalculateStats();
}

// 統計再計算
function recalculateStats() {
    const allCards = document.querySelectorAll('.result-card');
    const activeResults = [];

    allCards.forEach(card => {
        if (!card.classList.contains('skipped')) {
            // カードから利益情報を抽出
            const profitText = card.querySelector('.profit-price').textContent;
            const profit = parseInt(profitText.replace(/[^0-9]/g, ''));
            activeResults.push({ profit });
        }
    });

    // 統計更新
    document.getElementById('successfulSearches').textContent = activeResults.length;

    if (activeResults.length > 0) {
        const avgProfit = Math.floor(
            activeResults.reduce((sum, item) => sum + (item.profit || 0), 0) / activeResults.length
        );
        const totalProfit = Math.floor(
            activeResults.reduce((sum, item) => sum + (item.profit || 0), 0)
        );

        document.getElementById('avgProfit').textContent = `¥${avgProfit.toLocaleString()}`;
        document.getElementById('totalProfit').textContent = `¥${totalProfit.toLocaleString()}`;
    } else {
        document.getElementById('avgProfit').textContent = '¥0';
        document.getElementById('totalProfit').textContent = '¥0';
    }
}

// ソート機能
window.sortResults = function() {
    const sortValue = document.getElementById('sortSelect').value;
    const container = document.querySelector('.results-container');
    if (!container) return;

    const cards = Array.from(container.querySelectorAll('.result-card'));

    // 標準順（元の順番）の場合はdata-index属性でソート
    if (sortValue === 'default') {
        cards.sort((a, b) => {
            const indexA = parseInt(a.dataset.index) || 0;
            const indexB = parseInt(b.dataset.index) || 0;
            return indexA - indexB;
        });
    } else {
        cards.sort((a, b) => {
            const getProfit = (card) => parseInt(card.querySelector('.profit-price').textContent.replace(/[^0-9]/g, '')) || 0;
            const getMargin = (card) => parseInt(card.querySelector('.profit-badge').textContent.replace(/[^0-9]/g, '')) || 0;
            const getPrice = (card) => parseInt(card.querySelector('.yahoo-price').textContent.replace(/[^0-9]/g, '')) || 0;

            switch (sortValue) {
                case 'profit-desc':
                    return getProfit(b) - getProfit(a);
                case 'profit-asc':
                    return getProfit(a) - getProfit(b);
                case 'margin-desc':
                    return getMargin(b) - getMargin(a);
                case 'margin-asc':
                    return getMargin(a) - getMargin(b);
                case 'price-asc':
                    return getPrice(a) - getPrice(b);
                case 'price-desc':
                    return getPrice(b) - getPrice(a);
                default:
                    return 0;
            }
        });
    }

    // カードを再配置
    cards.forEach(card => container.appendChild(card));
};

// 統計更新
function updateStats(completed, total) {
    document.getElementById('totalSearches').textContent = total;
    document.getElementById('successfulSearches').textContent = searchResults.length;

    if (searchResults.length > 0) {
        const avgProfit = Math.floor(
            searchResults.reduce((sum, item) => sum + (item.profit || 0), 0) / searchResults.length
        );
        const totalProfit = Math.floor(
            searchResults.reduce((sum, item) => sum + (item.profit || 0), 0)
        );

        document.getElementById('avgProfit').textContent = `¥${avgProfit.toLocaleString()}`;
        document.getElementById('totalProfit').textContent = `¥${totalProfit.toLocaleString()}`;
    }
}

// 商品選択トグル
window.toggleProductSelect = function(checkbox, index) {
    const card = checkbox.closest('.result-card');
    const productData = JSON.parse(card.dataset.productData);

    if (checkbox.checked) {
        // 選択された商品を配列に追加
        selectedProducts.push({
            index: index,
            data: productData
        });
    } else {
        // 選択解除：配列から削除
        selectedProducts = selectedProducts.filter(p => p.index !== index);
    }

    // 選択数カウントを更新
    updateSelectedCount();
};

// 選択数カウント更新
function updateSelectedCount() {
    const countElement = document.getElementById('selectedCount');
    const sendBtn = document.getElementById('sendSelectedBtn');

    if (countElement) {
        countElement.textContent = selectedProducts.length;
    }

    // 送信ボタンの有効/無効を切り替え
    if (sendBtn) {
        if (selectedProducts.length > 0) {
            sendBtn.style.opacity = '1';
            sendBtn.style.pointerEvents = 'auto';
        } else {
            sendBtn.style.opacity = '0.5';
            sendBtn.style.pointerEvents = 'none';
        }
    }
}

// ========================================
// 商品送信機能
// ========================================

let selectedPartnerId = null; // 選択された送信先

// 送信モーダルを開く
window.openSendModal = function() {
    if (selectedProducts.length === 0) {
        alert('商品が選択されていません');
        return;
    }

    // 選択商品数を表示
    document.getElementById('selectedProductCount').textContent = `${selectedProducts.length} 件`;

    // 外注先リストを表示
    displayPartnerSelectList();

    // モーダルを表示
    document.getElementById('sendModal').style.display = 'flex';
}

// 送信モーダルを閉じる
window.closeSendModal = function() {
    document.getElementById('sendModal').style.display = 'none';
    selectedPartnerId = null;
}

// 送信先選択リストを表示
function displayPartnerSelectList() {
    const listContainer = document.getElementById('partnerSelectList');

    if (partners.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: rgba(148, 163, 184, 0.7);">
                外注先が登録されていません<br>
                <small>「👥 外注先管理」から登録してください</small>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = partners.map((partner, index) => {
        const sendMethodBadge = partner.sendMethod === 'email'
            ? '<span style="display: inline-block; padding: 3px 10px; background: rgba(0, 184, 217, 0.2); border: 1px solid rgba(0, 184, 217, 0.4); border-radius: 12px; font-size: 11px; font-weight: 600; color: #00B8D9;">📧 メール</span>'
            : '<span style="display: inline-block; padding: 3px 10px; background: rgba(0, 255, 163, 0.2); border: 1px solid rgba(0, 255, 163, 0.4); border-radius: 12px; font-size: 11px; font-weight: 600; color: #00FFA3;">💬 LINE</span>';

        // LINE送信だがUser IDが未設定の場合は送信不可
        const isDisabled = partner.sendMethod === 'line' && !partner.lineId;
        const disabledStyle = isDisabled ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;';
        const disabledNote = isDisabled ? '<div style="color: #FF6B9D; font-size: 11px; margin-top: 5px;">※LINE User IDが未設定です</div>' : '';

        return `
            <div onclick="${isDisabled ? '' : `selectPartner(${index})`}"
                 id="partner_select_${index}"
                 style="padding: 15px; margin-bottom: 10px; background: rgba(0, 255, 163, 0.05); border: 2px solid rgba(0, 255, 163, 0.2); border-radius: 8px; transition: all 0.3s; ${disabledStyle}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="margin-bottom: 5px;">${sendMethodBadge}</div>
                        <div style="font-size: 16px; font-weight: 700; color: #00FFA3; margin-bottom: 5px;">
                            ${partner.name}
                        </div>
                        ${partner.email ? `<div style="font-size: 12px; color: rgba(148, 163, 184, 0.9);">📧 ${partner.email}</div>` : ''}
                        ${partner.lineId ? `<div style="font-size: 12px; color: rgba(148, 163, 184, 0.9);">💬 連携済み</div>` : ''}
                        ${disabledNote}
                    </div>
                    <div class="partner-check-icon" style="width: 30px; height: 30px; border: 2px solid rgba(0, 255, 163, 0.5); border-radius: 50%; display: none; align-items: center; justify-content: center;">
                        <span style="color: #00FFA3; font-size: 18px; font-weight: 900;">✓</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 送信先を選択
window.selectPartner = function(index) {
    // 以前の選択を解除
    document.querySelectorAll('#partnerSelectList > div').forEach(div => {
        div.style.borderColor = 'rgba(0, 255, 163, 0.2)';
        div.style.background = 'rgba(0, 255, 163, 0.05)';
        const icon = div.querySelector('.partner-check-icon');
        if (icon) icon.style.display = 'none';
    });

    // 新しい選択を適用
    const selectedDiv = document.getElementById(`partner_select_${index}`);
    selectedDiv.style.borderColor = '#00FFA3';
    selectedDiv.style.background = 'rgba(0, 255, 163, 0.15)';
    selectedDiv.style.boxShadow = '0 0 20px rgba(0, 255, 163, 0.3)';
    const icon = selectedDiv.querySelector('.partner-check-icon');
    if (icon) icon.style.display = 'flex';

    selectedPartnerId = index;
};

// 送信確認
window.confirmSend = async function() {
    if (selectedPartnerId === null) {
        alert('送信先を選択してください');
        return;
    }

    const partner = partners[selectedPartnerId];
    const productCount = selectedProducts.length;

    if (!confirm(`${partner.name} に ${productCount}件の商品を送信しますか？`)) {
        return;
    }

    // 送信ボタンを無効化
    const sendBtn = document.getElementById('confirmSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = '送信中...';
    sendBtn.style.opacity = '0.5';

    try {
        // 送信方法に応じて処理を分岐
        if (partner.sendMethod === 'email') {
            await sendByEmail(partner);
        } else {
            await sendByLine(partner);
        }

        alert(`${partner.name} に送信しました！`);

        // 送信成功後、選択をクリア
        selectedProducts = [];
        updateSelectedCount();

        // チェックボックスを全て外す
        document.querySelectorAll('.card-checkbox').forEach(cb => cb.checked = false);

        // モーダルを閉じる
        closeSendModal();

    } catch (error) {
        alert(`送信エラー: ${error.message}`);
        console.error('送信エラー:', error);
    } finally {
        // ボタンを元に戻す
        sendBtn.disabled = false;
        sendBtn.textContent = '送信する';
        sendBtn.style.opacity = '1';
    }
}

// メール送信
async function sendByEmail(partner) {
    if (!partner.email) {
        throw new Error('メールアドレスが設定されていません');
    }

    const products = selectedProducts.map(p => p.data);

    const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            to: partner.email,
            partnerName: partner.name,
            products: products
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'メール送信に失敗しました');
    }

    return await response.json();
}

// LINE送信
async function sendByLine(partner) {
    if (!partner.lineId) {
        throw new Error('LINE User IDが設定されていません');
    }

    const products = selectedProducts.map(p => p.data);

    const response = await fetch('/api/send-line', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userId: partner.lineId,
            partnerName: partner.name,
            products: products
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'LINE送信に失敗しました');
    }

    return await response.json();
}

// ========================================
// 外注先管理機能
// ========================================

// Supabaseから外注先リストを読み込み
async function loadPartnersFromStorage() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/partners?order=created_at.desc`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('外注先リストの取得に失敗しました');
        }

        const supabasePartners = await response.json();

        // Supabaseのデータ形式をアプリの形式に変換
        partners = supabasePartners.map(p => ({
            id: p.id,
            name: p.name,
            sendMethod: p.send_method,
            email: p.email,
            lineId: p.line_id,
            affiliateId: p.affiliate_id
        }));

        // 互換性のためLocalStorageにも保存
        localStorage.setItem('partners', JSON.stringify(partners));

    } catch (error) {
        console.error('外注先データの読み込みエラー:', error);
        // エラー時はLocalStorageから読み込み（フォールバック）
        const stored = localStorage.getItem('partners');
        if (stored) {
            try {
                partners = JSON.parse(stored);
            } catch (e) {
                partners = [];
            }
        }
    }
}

// LocalStorageに外注先リストを保存
function savePartnersToStorage() {
    localStorage.setItem('partners', JSON.stringify(partners));
}

// 外注先管理モーダルを開く
window.openPartnersModal = async function() {
    document.getElementById('partnersModal').style.display = 'flex';
    await loadPartnersFromStorage(); // Supabaseから外注先リストを読み込み
    displayPartnersList();
    loadPendingPartners(); // 承認待ちリストを読み込み
    switchPartnerTab('approved'); // デフォルトは承認済みタブ
    cancelPartnerForm(); // フォームを初期状態に戻す
}

// 外注先管理モーダルを閉じる
window.closePartnersModal = function() {
    document.getElementById('partnersModal').style.display = 'none';
    cancelPartnerForm(); // フォームを閉じる
}

// 外注先リストを表示
function displayPartnersList() {
    const listContainer = document.getElementById('partnersList');

    if (partners.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: rgba(148, 163, 184, 0.7);">
                まだ外注先が登録されていません
            </div>
        `;
        return;
    }

    listContainer.innerHTML = partners.map((partner, index) => {
        const sendMethodBadge = partner.sendMethod === 'email'
            ? '<span style="display: inline-block; padding: 4px 12px; background: rgba(0, 184, 217, 0.2); border: 1px solid rgba(0, 184, 217, 0.4); border-radius: 15px; font-size: 12px; font-weight: 600; color: #00B8D9; margin-bottom: 8px;">📧 メール送信</span>'
            : '<span style="display: inline-block; padding: 4px 12px; background: rgba(0, 255, 163, 0.2); border: 1px solid rgba(0, 255, 163, 0.4); border-radius: 15px; font-size: 12px; font-weight: 600; color: #00FFA3; margin-bottom: 8px;">💬 LINE送信</span>';

        // LINE招待リンク（LINE User IDが未設定の場合のみ表示）
        const lineInviteSection = partner.sendMethod === 'line' && !partner.lineId ? `
            <div style="margin-top: 10px; padding: 12px; background: rgba(0, 255, 163, 0.1); border: 1px solid rgba(0, 255, 163, 0.3); border-radius: 8px;">
                <div style="font-size: 12px; color: rgba(148, 163, 184, 0.9); margin-bottom: 8px;">
                    👇 この招待リンクを外注先に送ってください
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" readonly value="https://line.me/R/ti/p/@398odcen?liff.state=partner_${partner.id}"
                           id="inviteLink_${partner.id}"
                           style="flex: 1; padding: 8px; background: rgba(17, 24, 39, 0.9); border: 1px solid rgba(0, 255, 163, 0.5); border-radius: 5px; color: #00FFA3; font-size: 12px; font-family: monospace;">
                    <button onclick="copyInviteLink(${partner.id})" style="padding: 8px 15px; background: linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%); border: none; border-radius: 5px; color: #000; font-weight: 700; cursor: pointer; white-space: nowrap;">
                        📋 コピー
                    </button>
                </div>
            </div>
        ` : '';

        return `
            <div style="padding: 20px; background: rgba(0, 255, 163, 0.05); border: 1px solid rgba(0, 255, 163, 0.2); border-radius: 10px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div style="flex: 1;">
                        ${sendMethodBadge}
                        <div style="font-size: 18px; font-weight: 700; color: #00FFA3; margin-bottom: 8px;">
                            ${partner.name}
                        </div>
                        ${partner.email ? `
                            <div style="color: rgba(148, 163, 184, 0.9); font-size: 14px; margin-bottom: 5px;">
                                📧 ${partner.email}
                            </div>
                        ` : ''}
                        ${partner.lineId ? `
                            <div style="color: rgba(148, 163, 184, 0.9); font-size: 14px; margin-bottom: 5px;">
                                💬 ${partner.lineId} <span style="color: #00FFA3;">✓ 連携済み</span>
                            </div>
                        ` : ''}
                        ${partner.affiliateId ? `
                            <div style="color: rgba(148, 163, 184, 0.9); font-size: 14px;">
                                🔗 ${partner.affiliateId}
                            </div>
                        ` : ''}
                        ${lineInviteSection}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="editPartner(${index})" style="padding: 8px 15px; background: rgba(0, 184, 217, 0.2); border: 1px solid rgba(0, 184, 217, 0.4); border-radius: 5px; color: #00B8D9; font-weight: 600; cursor: pointer;">
                            編集
                        </button>
                        <button onclick="deletePartner(${index})" style="padding: 8px 15px; background: rgba(255, 107, 157, 0.2); border: 1px solid rgba(255, 107, 157, 0.4); border-radius: 5px; color: #FF6B9D; font-weight: 600; cursor: pointer;">
                            削除
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 招待リンクをコピー
window.copyInviteLink = function(partnerId) {
    const input = document.getElementById(`inviteLink_${partnerId}`);
    input.select();
    document.execCommand('copy');
    alert('招待リンクをコピーしました！\n外注先に送ってください。');
};

// 送信方法による入力フィールド切り替え
window.toggleSendMethodFields = function() {
    const emailField = document.getElementById('emailField');
    const lineField = document.getElementById('lineField');
    const methodEmail = document.getElementById('methodEmail');

    if (methodEmail.checked) {
        emailField.style.display = 'block';
        lineField.style.display = 'none';
    } else {
        emailField.style.display = 'none';
        lineField.style.display = 'block';
    }
};

// 追加フォームを表示
window.showAddPartnerForm = function() {
    const form = document.getElementById('partnerForm');
    const formTitle = document.getElementById('formTitle');

    formTitle.textContent = '新しい外注先を追加';
    document.getElementById('editPartnerId').value = '';
    document.getElementById('partnerName').value = '';
    document.getElementById('partnerEmail').value = '';
    document.getElementById('partnerLineId').value = '';
    document.getElementById('partnerAffiliateId').value = '';
    document.getElementById('methodEmail').checked = true;
    toggleSendMethodFields();

    form.style.display = 'block';
}

// フォームをキャンセル
window.cancelPartnerForm = function() {
    const form = document.getElementById('partnerForm');
    form.style.display = 'none';

    // フォームをクリア
    document.getElementById('editPartnerId').value = '';
    document.getElementById('partnerName').value = '';
    document.getElementById('partnerEmail').value = '';
    document.getElementById('partnerLineId').value = '';
    document.getElementById('partnerAffiliateId').value = '';
}

// 外注先を保存（新規追加または更新）
window.savePartner = async function() {
    const name = document.getElementById('partnerName').value.trim();
    const email = document.getElementById('partnerEmail').value.trim();
    const lineId = document.getElementById('partnerLineId').value.trim();
    const affiliateId = document.getElementById('partnerAffiliateId').value.trim();
    const editIndex = document.getElementById('editPartnerId').value;
    const sendMethod = document.getElementById('methodEmail').checked ? 'email' : 'line';

    // 送信方法別バリデーション
    if (sendMethod === 'email') {
        if (!email) {
            alert('メールアドレスを入力してください');
            return;
        }
        // メールアドレスの簡易バリデーション
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            alert('正しいメールアドレスを入力してください');
            return;
        }
    }

    const partnerData = {
        name: name || '名前未設定',
        send_method: sendMethod,
        email: email || null,
        line_id: lineId || null,
        affiliate_id: affiliateId || null
    };

    try {
        if (editIndex !== '') {
            // 更新（Supabase）
            const partner = partners[editIndex];
            const response = await fetch(`${SUPABASE_URL}/rest/v1/partners?id=eq.${partner.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(partnerData)
            });

            if (!response.ok) {
                throw new Error('更新に失敗しました');
            }
            alert('✅ 更新しました');
        } else {
            // 新規追加（Supabase）
            const response = await fetch(`${SUPABASE_URL}/rest/v1/partners`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(partnerData)
            });

            if (!response.ok) {
                throw new Error('追加に失敗しました');
            }
            alert('✅ 追加しました');
        }

        // UIを更新
        await loadPartnersFromStorage();
        displayPartnersList();
        cancelPartnerForm();

    } catch (error) {
        console.error('保存エラー:', error);
        alert('❌ 保存に失敗しました: ' + error.message);
    }
}

// 外注先を編集
window.editPartner = function(index) {
    const partner = partners[index];
    const form = document.getElementById('partnerForm');
    const formTitle = document.getElementById('formTitle');

    formTitle.textContent = '外注先を編集';
    document.getElementById('editPartnerId').value = index;
    document.getElementById('partnerName').value = partner.name === '名前未設定' ? '' : partner.name;
    document.getElementById('partnerEmail').value = partner.email || '';
    document.getElementById('partnerLineId').value = partner.lineId || '';
    document.getElementById('partnerAffiliateId').value = partner.affiliateId || '';

    // 送信方法を復元
    if (partner.sendMethod === 'email') {
        document.getElementById('methodEmail').checked = true;
    } else {
        document.getElementById('methodLine').checked = true;
    }
    toggleSendMethodFields();

    form.style.display = 'block';
};

// 外注先を削除
window.deletePartner = async function(index) {
    const partner = partners[index];

    if (!confirm(`${partner.name} を削除してもよろしいですか？`)) {
        return;
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/partners?id=eq.${partner.id}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('削除に失敗しました');
        }

        alert('✅ 削除しました');
        await loadPartnersFromStorage();
        displayPartnersList();

    } catch (error) {
        console.error('削除エラー:', error);
        alert('❌ 削除に失敗しました: ' + error.message);
    }
};

// ========================================
// 承認待ちパートナー管理
// ========================================

// タブ切り替え
window.switchPartnerTab = function(tabName) {
    currentPartnerTab = tabName;

    const approvedTab = document.getElementById('approvedTab');
    const pendingTab = document.getElementById('pendingTab');
    const approvedContent = document.getElementById('approvedTabContent');
    const pendingContent = document.getElementById('pendingTabContent');

    if (tabName === 'approved') {
        // 承認済みタブのスタイル
        approvedTab.style.background = 'linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%)';
        approvedTab.style.border = 'none';
        approvedTab.style.color = '#000';

        // 承認待ちタブのスタイル
        pendingTab.style.background = 'rgba(255, 107, 157, 0.2)';
        pendingTab.style.border = '1px solid rgba(255, 107, 157, 0.4)';
        pendingTab.style.color = 'white';

        // コンテンツ表示切り替え
        approvedContent.style.display = 'block';
        pendingContent.style.display = 'none';
    } else {
        // 承認待ちタブのスタイル
        pendingTab.style.background = 'linear-gradient(135deg, #FF6B9D 0%, #C44569 100%)';
        pendingTab.style.border = 'none';
        pendingTab.style.color = '#fff';

        // 承認済みタブのスタイル
        approvedTab.style.background = 'rgba(0, 255, 163, 0.2)';
        approvedTab.style.border = '1px solid rgba(0, 255, 163, 0.4)';
        approvedTab.style.color = 'white';

        // コンテンツ表示切り替え
        approvedContent.style.display = 'none';
        pendingContent.style.display = 'block';
    }
}

// Supabaseから承認待ちリストを取得
async function loadPendingPartners() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pending_partners?status=eq.pending&order=created_at.desc`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('承認待ちリストの取得に失敗しました');
        }

        const pendingPartners = await response.json();

        // 承認待ち数を更新
        document.getElementById('pendingCount').textContent = pendingPartners.length;

        // リストを表示
        displayPendingPartnersList(pendingPartners);

    } catch (error) {
        console.error('承認待ちリスト取得エラー:', error);
        document.getElementById('pendingPartnersList').innerHTML = `
            <div style="text-align: center; padding: 40px; color: rgba(255, 107, 157, 0.7);">
                ⚠️ データの取得に失敗しました
            </div>
        `;
    }
}

// 承認待ちリストを表示
function displayPendingPartnersList(pendingPartners) {
    const listContainer = document.getElementById('pendingPartnersList');

    if (pendingPartners.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: rgba(148, 163, 184, 0.7);">
                承認待ちの登録はありません
            </div>
        `;
        return;
    }

    listContainer.innerHTML = pendingPartners.map(pending => {
        const createdDate = new Date(pending.created_at).toLocaleString('ja-JP');

        return `
            <div style="padding: 20px; margin-bottom: 15px; background: rgba(30, 41, 59, 0.4); border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.2);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                    <div>
                        <div style="font-weight: 700; font-size: 16px; color: white; margin-bottom: 5px;">
                            ${pending.display_name || 'LINE User'}
                        </div>
                        <div style="color: rgba(148, 163, 184, 0.7); font-size: 12px;">
                            LINE ID: ${pending.line_id}
                        </div>
                        <div style="color: rgba(148, 163, 184, 0.5); font-size: 11px; margin-top: 5px;">
                            登録日時: ${createdDate}
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 10px;">
                    <button onclick="approvePartner(${pending.id}, '${pending.line_id}', '${pending.display_name || 'LINE User'}')"
                            style="flex: 1; padding: 10px; background: linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%); border: none; border-radius: 8px; color: #000; font-weight: 700; cursor: pointer;">
                        ✓ 承認
                    </button>
                    <button onclick="rejectPartner(${pending.id})"
                            style="flex: 1; padding: 10px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; color: #ef4444; font-weight: 600; cursor: pointer;">
                        × 却下
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// パートナーを承認（pending_partners → partners）
window.approvePartner = async function(pendingId, lineId, displayName) {
    if (!confirm(`${displayName} を外注先として承認しますか？`)) {
        return;
    }

    try {
        // 1. partnersテーブルに追加
        const partner = {
            name: displayName,
            send_method: 'line',
            line_id: lineId,
            email: null,
            affiliate_id: null
        };

        const addResponse = await fetch(`${SUPABASE_URL}/rest/v1/partners`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(partner)
        });

        if (!addResponse.ok) {
            throw new Error('外注先の追加に失敗しました');
        }

        // 2. pending_partnersのステータスを更新
        const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/pending_partners?id=eq.${pendingId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ status: 'approved' })
        });

        if (!updateResponse.ok) {
            throw new Error('承認ステータスの更新に失敗しました');
        }

        // 3. UI更新
        alert(`✅ ${displayName} を承認しました`);
        await loadPendingPartners();
        await loadPartnersFromStorage();
        displayPartnersList(); // 承認済みリストを再表示

    } catch (error) {
        console.error('承認エラー:', error);
        alert('❌ 承認に失敗しました: ' + error.message);
    }
};

// パートナーを却下
window.rejectPartner = async function(pendingId) {
    if (!confirm('この登録を却下しますか？')) {
        return;
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pending_partners?id=eq.${pendingId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ status: 'rejected' })
        });

        if (!response.ok) {
            throw new Error('却下処理に失敗しました');
        }

        alert('✅ 却下しました');
        loadPendingPartners();

    } catch (error) {
        console.error('却下エラー:', error);
        alert('❌ 却下に失敗しました: ' + error.message);
    }
};

// ユーティリティ
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ボタンのクリックイベント
document.getElementById('batchSearchBtn').addEventListener('click', startBatchSearch);

// ========================================
// 在庫フィルター機能
// ========================================

// 在庫フィルター切替
function filterResultsByStock() {
    const includeUnknown = document.getElementById('includeUnknownStock').checked;
    const allCards = document.querySelectorAll('.result-card');

    allCards.forEach(card => {
        try {
            const productData = JSON.parse(card.dataset.productData);
            const stockStatus = productData.stock;

            // トグルOFFで在庫不明のカードを非表示
            if (!includeUnknown && stockStatus === '在庫状況不明') {
                card.style.display = 'none';
            } else {
                card.style.display = '';
            }
        } catch (e) {
            console.error('カードデータの解析エラー:', e);
        }
    });

    // 統計を再計算
    recalculateStats();
}

// 在庫トグルのイベントリスナー
const stockToggle = document.getElementById('includeUnknownStock');
if (stockToggle) {
    stockToggle.addEventListener('change', filterResultsByStock);
}

// ========================================
// モード切替機能
// ========================================

window.switchMode = function(mode) {
    console.log('switchMode called with:', mode);

    // すべてのタブを非アクティブ化
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // すべてのコンテンツを非表示
    document.querySelectorAll('.mode-content').forEach(content => {
        content.classList.remove('active');
    });

    // 選択されたモードをアクティブ化
    const selectedTab = document.querySelector(`[data-mode="${mode}"]`);
    const selectedContent = document.getElementById(`${mode}Mode`);

    if (selectedTab) selectedTab.classList.add('active');
    if (selectedContent) selectedContent.classList.add('active');

    // 背景色をモードごとに変更（強制的に適用）
    if (mode === 'fusion') {
        document.body.classList.remove('fusion-mode'); // 一度削除
        void document.body.offsetWidth; // リフロー強制
        document.body.classList.add('fusion-mode'); // 再追加
        console.log('fusion-mode class added');
    } else {
        document.body.classList.remove('fusion-mode');
        console.log('fusion-mode class removed');
    }

    // ストックボタンの表示/非表示を切り替え
    const stockToggleBtn = document.getElementById('stockToggleBtn');
    if (stockToggleBtn) {
        if (mode === 'fusion') {
            stockToggleBtn.style.display = 'flex';
        } else {
            stockToggleBtn.style.display = 'none';
        }
    }

    console.log('body classes:', document.body.className);
}

// ========================================
// CSV統合モード機能
// ========================================

let fusionFile = null;
let fusionResults = [];

// ファイル選択イベント - 削除（fusion-studio.jsで処理）
// fileInputはfusion-studio.jsで処理されます

// 処理開始ボタン - 削除（fusion-studio.jsで処理）
// 以下の関数は使用されていないため削除予定

async function processFusionData_OLD() {
    if (!fusionFile) {
        alert('ファイルを選択してください');
        return;
    }

    try {
        // ファイル読み込み
        const fileExtension = fusionFile.name.split('.').pop().toLowerCase();
        let rawData = [];

        if (fileExtension === 'csv') {
            const text = await fusionFile.text();
            rawData = parseCSVData(text);
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            rawData = await parseExcelData(fusionFile);
        }

        if (rawData.length === 0) {
            alert('データが空です');
            return;
        }

        // ブランド正規化とグループ化
        fusionResults = processAndGroupData(rawData);

        // 結果を表示
        displayFusionResults(fusionResults);

        // 統計表示
        document.getElementById('fusionResults').style.display = 'block';

    } catch (error) {
        console.error('処理エラー:', error);
        alert('データの処理に失敗しました: ' + error.message);
    }
}

// CSVパース
function parseCSVData(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const data = [];

    // ヘッダー行をスキップ
    for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',');
        if (columns.length < 3) continue;

        const productName = columns[0]?.trim();
        const priceStr = columns[1]?.trim();

        if (!productName || !priceStr) continue;

        const price = parseInt(priceStr.replace(/[^0-9]/g, ''));
        if (isNaN(price) || price <= 0) continue;

        data.push({
            productName,
            price
        });
    }

    return data;
}

// Excelパース
async function parseExcelData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                const parsedData = [];
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row[0] || !row[1]) continue;

                    const productName = String(row[0]).trim();
                    const price = parseInt(String(row[1]).replace(/[^0-9]/g, ''));

                    if (productName && !isNaN(price) && price > 0) {
                        parsedData.push({ productName, price });
                    }
                }

                resolve(parsedData);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// データ処理とグループ化
function processAndGroupData(rawData) {
    const grouped = {};

    rawData.forEach(item => {
        // ブランド検出（brands.jsのBRAND_DICTIONARYを使用）
        let detectedBrand = 'その他';
        
        if (typeof BRAND_DICTIONARY !== 'undefined') {
            for (const [brand, keywords] of Object.entries(BRAND_DICTIONARY)) {
                if (keywords.some(keyword => item.productName.includes(keyword))) {
                    detectedBrand = brand;
                    break;
                }
            }
        }

        // グループ名を正規化（色・サイズを除去）
        const normalizedName = normalizeProductName(item.productName);

        const key = `${detectedBrand}_${normalizedName}`;

        if (!grouped[key]) {
            grouped[key] = {
                brand: detectedBrand,
                groupName: normalizedName,
                prices: [],
                count: 0
            };
        }

        grouped[key].prices.push(item.price);
        grouped[key].count++;
    });

    // 統計計算
    const results = Object.values(grouped).map(group => {
        const sortedPrices = group.prices.sort((a, b) => a - b);
        const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
        const avg = Math.floor(sortedPrices.reduce((a, b) => a + b, 0) / sortedPrices.length);
        const min = sortedPrices[0];
        const max = sortedPrices[sortedPrices.length - 1];

        return {
            brand: group.brand,
            groupName: group.groupName,
            count: group.count,
            median,
            avg,
            min,
            max,
            priceRange: `¥${min.toLocaleString()}-¥${max.toLocaleString()}`
        };
    });

    // 件数が多い順にソート
    results.sort((a, b) => b.count - a.count);

    return results;
}

// 商品名の正規化（色・サイズ除去）
function normalizeProductName(name) {
    // 色を除去
    const colors = ['黒', '白', 'ブラック', 'ホワイト', 'グレー', 'ベージュ', 'ネイビー', 'カーキ', '紺', '茶'];
    let normalized = name;

    colors.forEach(color => {
        normalized = normalized.replace(new RegExp(color, 'g'), '');
    });

    // サイズを除去
    normalized = normalized.replace(/[0-9]{1,2}号/g, '');
    normalized = normalized.replace(/サイズ[SML]/g, '');
    normalized = normalized.replace(/\b(XS|S|M|L|XL|XXL|[0-9]{2,3})\b/g, '');

    // 余分なスペースを削除
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

// 結果表示
function displayFusionResults(results) {
    // 統計更新
    const brandSet = new Set(results.map(r => r.brand));
    const totalItems = results.reduce((sum, r) => sum + r.count, 0);
    const avgPrice = Math.floor(results.reduce((sum, r) => sum + r.avg, 0) / results.length);

    document.getElementById('fusionTotalItems').textContent = totalItems;
    document.getElementById('fusionGroupedItems').textContent = results.length;
    document.getElementById('fusionAvgPrice').textContent = `¥${avgPrice.toLocaleString()}`;
    document.getElementById('fusionBrandCount').textContent = brandSet.size;

    // テーブル作成
    const tableContainer = document.getElementById('fusionTable');
    let html = `
        <table style="width: 100%; border-collapse: collapse; color: white;">
            <thead>
                <tr style="background: rgba(0, 255, 163, 0.1); border-bottom: 2px solid rgba(0, 255, 163, 0.3);">
                    <th style="padding: 15px; text-align: left;">ブランド</th>
                    <th style="padding: 15px; text-align: left;">商品名</th>
                    <th style="padding: 15px; text-align: center;">件数</th>
                    <th style="padding: 15px; text-align: right;">中央値</th>
                    <th style="padding: 15px; text-align: right;">平均価格</th>
                    <th style="padding: 15px; text-align: right;">価格帯</th>
                    <th style="padding: 15px; text-align: center;">アクション</th>
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach((item, index) => {
        html += `
            <tr style="border-bottom: 1px solid rgba(0, 255, 163, 0.1); transition: all 0.3s ease;" 
                onmouseover="this.style.background='rgba(0, 255, 163, 0.05)'" 
                onmouseout="this.style.background='transparent'">
                <td style="padding: 15px;">${item.brand}</td>
                <td style="padding: 15px;">${item.groupName}</td>
                <td style="padding: 15px; text-align: center;">${item.count}</td>
                <td style="padding: 15px; text-align: right; color: #00FFA3; font-weight: 700;">¥${item.median.toLocaleString()}</td>
                <td style="padding: 15px; text-align: right;">¥${item.avg.toLocaleString()}</td>
                <td style="padding: 15px; text-align: right; font-size: 0.9em; color: rgba(148, 163, 184, 0.9);">${item.priceRange}</td>
                <td style="padding: 15px; text-align: center;">
                    <button onclick="addFusionItemToStock(${index})" 
                            style="padding: 8px 16px; background: linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%); border: none; border-radius: 8px; color: #000; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                        📦 ストック追加
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = html;
}

// ストック追加
window.addFusionItemToStock = function(index) {
    const item = fusionResults[index];

    if (typeof addToStock === 'function') {
        addToStock({
            brandName: item.brand,
            groupName: item.groupName,
            count: item.count,
            modePrice: `¥${item.median.toLocaleString()}`,
            productCode: '',
            priceRange: item.priceRange
        });
    } else {
        alert('ストック機能が利用できません');
    }
};

// 全てストック追加
function addAllToStock() {
    if (!fusionResults || fusionResults.length === 0) {
        alert('統合結果がありません');
        return;
    }

    if (!confirm(`${fusionResults.length}件の商品を全てストックに追加しますか？`)) {
        return;
    }

    fusionResults.forEach(item => {
        if (typeof addToStock === 'function') {
            addToStock({
                brandName: item.brand,
                groupName: item.groupName,
                count: item.count,
                modePrice: `¥${item.median.toLocaleString()}`,
                productCode: '',
                priceRange: item.priceRange
            });
        }
    });

    alert(`${fusionResults.length}件をストックに追加しました！`);
}

// CSVエクスポート
function exportFusionResults() {
    if (!fusionResults || fusionResults.length === 0) {
        alert('エクスポートする結果がありません');
        return;
    }

    const headers = ['ブランド', 'グループ名', '件数', '中央値', '平均価格', '価格帯'];
    const rows = fusionResults.map(item => [
        item.brand,
        item.groupName,
        item.count,
        item.median,
        item.avg,
        item.priceRange
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fusion_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    alert('統合結果をエクスポートしました');
}

// === オーナー設定機能 ===

// オーナー設定を読み込んで適用
function loadOwnerSettings() {
    const settings = {
        showPartnersBtn: localStorage.getItem('ownerSettings_showPartnersBtn') !== 'false',
        showUserEmail: localStorage.getItem('ownerSettings_showUserEmail') !== 'false',
        showSelectionUI: localStorage.getItem('ownerSettings_showSelectionUI') !== 'false'
    };

    // 設定を適用
    applyOwnerSettings(settings);

    // トグルの状態を更新
    const togglePartnersBtn = document.getElementById('togglePartnersBtn');
    const toggleUserEmail = document.getElementById('toggleUserEmail');
    const toggleSelectionUI = document.getElementById('toggleSelectionUI');

    if (togglePartnersBtn) {
        togglePartnersBtn.checked = settings.showPartnersBtn;
    }
    if (toggleUserEmail) {
        toggleUserEmail.checked = settings.showUserEmail;
    }
    if (toggleSelectionUI) {
        toggleSelectionUI.checked = settings.showSelectionUI;
    }

    console.log('📋 オーナー設定を読み込みました:', settings);
}

// オーナー設定を適用
function applyOwnerSettings(settings) {
    const isOwner = currentUser && currentUser.email && currentUser.email.includes('komedorobouinuzini');

    if (!isOwner) {
        return; // オーナーでなければ何もしない
    }

    const partnersBtn = document.getElementById('partnersBtn');
    const userEmail = document.getElementById('userEmail');
    const selectionUI = document.getElementById('selectionUI');

    // 外注先管理ボタンの表示制御
    if (partnersBtn) {
        partnersBtn.style.display = settings.showPartnersBtn ? 'inline-block' : 'none';
        console.log(`👥 外注先管理ボタン: ${settings.showPartnersBtn ? '表示' : '非表示'}`);
    }

    // メールアドレスの表示制御
    if (userEmail) {
        userEmail.style.display = settings.showUserEmail ? 'inline' : 'none';
        console.log(`📧 メールアドレス: ${settings.showUserEmail ? '表示' : '非表示'}`);
    }

    // 商品選択UIの表示制御
    if (selectionUI) {
        selectionUI.style.display = settings.showSelectionUI ? 'flex' : 'none';
        console.log(`☑️ 商品選択UI: ${settings.showSelectionUI ? '表示' : '非表示'}`);
    }
}

// オーナー設定モーダルを開く
function openOwnerSettings() {
    const modal = document.getElementById('ownerSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
        loadOwnerSettings(); // 現在の設定を反映
    }
}

// オーナー設定モーダルを閉じる
window.closeOwnerSettings = function() {
    const modal = document.getElementById('ownerSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }

    // ログイン後のフローの場合、APIキーチェックを実行
    if (shouldCheckApiKeyAfterOwnerSettings) {
        shouldCheckApiKeyAfterOwnerSettings = false; // フラグをリセット

        yahooApiKey = localStorage.getItem('yahooApiKey')
        if (!yahooApiKey) {
            console.log('⚙️ APIキーモーダルを表示（オーナー設定後）')
            const apiKeyModal = document.getElementById('apiKeyModal')
            if (apiKeyModal) {
                apiKeyModal.style.display = 'flex'
            }
        } else {
            console.log('✅ APIキーが設定済みのため、モーダルをスキップ')
        }
    }
};

// オーナー設定を更新
window.updateOwnerSettings = function() {
    const showPartnersBtn = document.getElementById('togglePartnersBtn').checked;
    const showUserEmail = document.getElementById('toggleUserEmail').checked;
    const showSelectionUI = document.getElementById('toggleSelectionUI').checked;

    // LocalStorageに保存
    localStorage.setItem('ownerSettings_showPartnersBtn', showPartnersBtn);
    localStorage.setItem('ownerSettings_showUserEmail', showUserEmail);
    localStorage.setItem('ownerSettings_showSelectionUI', showSelectionUI);

    // 設定を即座に適用
    applyOwnerSettings({
        showPartnersBtn,
        showUserEmail,
        showSelectionUI
    });

    console.log('✅ オーナー設定を更新:', { showPartnersBtn, showUserEmail, showSelectionUI });
};

// ============================================================================
// ユーザー管理機能（オーナー専用）
// ============================================================================

// ユーザー管理モーダルを開く
window.openUserManagementModal = async function() {
    console.log('👑 ユーザー管理モーダルを開く')

    const modal = document.getElementById('userManagementModal')
    if (!modal) return

    modal.style.display = 'block'

    // ユーザー一覧を読み込み
    await loadAllUsers()
}

// ユーザー管理モーダルを閉じる
window.closeUserManagementModal = function() {
    const modal = document.getElementById('userManagementModal')
    if (modal) modal.style.display = 'none'
}

// 全ユーザーを取得して表示
async function loadAllUsers() {
    try {
        console.log('🔍 ユーザー一覧取得開始...')

        // セッショントークンを取得
        const { data: { session } } = await supabaseAuth.auth.getSession()
        console.log('📝 セッション取得:', session ? '成功' : '失敗')

        if (!session) {
            throw new Error('セッションが見つかりません')
        }

        // ユーザー情報を取得
        const userId = session.user.id
        const userEmail = session.user.email

        console.log('📡 APIリクエスト送信中: /api/get-all-users')
        console.log('👤 ユーザー情報:', userId, userEmail)

        // バックエンドAPIを呼び出し（クエリパラメータでユーザー情報を送信）
        const response = await fetch(`/api/get-all-users?userId=${encodeURIComponent(userId)}&userEmail=${encodeURIComponent(userEmail)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })

        console.log('📡 APIレスポンス:', response.status, response.statusText)

        const data = await response.json()
        console.log('📦 APIレスポンスデータ:', JSON.stringify(data, null, 2))

        if (!response.ok) {
            console.error('❌ APIエラー:', JSON.stringify(data, null, 2))
            throw new Error(data.error || data.message || 'ユーザー取得に失敗しました')
        }

        console.log('✅ ユーザー一覧取得:', data.count, '人')

        // テーブルに表示
        displayUsers(data.users)

    } catch (error) {
        console.error('❌ ユーザー一覧取得エラー:', error)
        console.error('❌ エラー詳細:', error.message)
        alert('ユーザー一覧の取得に失敗しました:\n\n' + error.message + '\n\n開発者ツール（F12）のConsoleタブで詳細を確認してください。')
    }
}

// ユーザー一覧をテーブルに表示
function displayUsers(users) {
    const tbody = document.getElementById('userManagementTableBody')
    if (!tbody) return

    tbody.innerHTML = ''

    users.forEach(user => {
        const row = document.createElement('tr')
        row.id = `user-row-${user.id}`
        row.style.cssText = 'border-bottom: 1px solid rgba(255, 107, 157, 0.1); transition: all 0.3s ease;'

        // ステータス表示
        let statusDisplay = ''
        let statusColor = '#94A3B8'

        if (user.subscription_status === 'trial' || user.subscription_status === 'trialing') {
            const daysLeft = user.plan_expires_at ? Math.ceil((new Date(user.plan_expires_at) - new Date()) / (1000 * 60 * 60 * 24)) : 0
            if (daysLeft > 0) {
                statusDisplay = `トライアル (残り${daysLeft}日)`
                statusColor = '#00FFA3'
            } else {
                statusDisplay = 'トライアル期限切れ'
                statusColor = '#FF6B9D'
            }
        } else if (user.subscription_status === 'active') {
            statusDisplay = '有料プラン'
            statusColor = '#00B8D9'
        } else if (user.subscription_status === 'canceled') {
            statusDisplay = 'キャンセル済み'
            statusColor = '#94A3B8'
        } else {
            statusDisplay = user.subscription_status
        }

        // オーナーかチェック
        const isOwner = user.email && user.email.includes('komedorobouinuzini')
        const accountType = isOwner ? '<span style="color: #FFD700;">👑 オーナー</span>' : '一般'

        row.innerHTML = `
            <td style="padding: 15px; color: ${isOwner ? '#FFD700' : '#E2E8F0'}; font-weight: ${isOwner ? '700' : '400'};">${user.email || 'N/A'}</td>
            <td style="padding: 15px; text-align: center; color: #94A3B8;">${user.plan || 'trial'}</td>
            <td style="padding: 15px; text-align: center; color: ${statusColor};">${statusDisplay}</td>
            <td style="padding: 15px; text-align: center; color: #94A3B8; font-size: 12px;">${user.plan_expires_at ? new Date(user.plan_expires_at).toLocaleDateString('ja-JP') : '-'}</td>
            <td style="padding: 15px; text-align: center; color: #94A3B8; font-size: 12px;">${new Date(user.created_at).toLocaleDateString('ja-JP')}</td>
            <td style="padding: 15px; text-align: center;">
                ${isOwner ?
                    `<span style="color: #FFD700; font-size: 12px;">保護中</span>` :
                    `<button onclick="eraseUser('${user.id}', '${user.email}')" style="padding: 8px 20px; background: linear-gradient(135deg, #FF0032 0%, #FF6B9D 100%); border: none; border-radius: 8px; color: white; font-weight: 700; cursor: pointer; font-size: 12px; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(255, 0, 50, 0.3);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        🗑️ 追放
                    </button>`
                }
            </td>
        `

        tbody.appendChild(row)
    })
}

// ユーザーを追放（ERASERエフェクト付き）
window.eraseUser = async function(userId, userEmail) {
    console.log('🚨 ユーザー追放開始:', userEmail)

    // 確認ダイアログ
    const confirmed = confirm(`本当に ${userEmail} を追放しますか？\n\nこの操作は取り消せません。`)
    if (!confirmed) return

    try {
        // 行に削除アニメーションを追加
        const row = document.getElementById(`user-row-${userId}`)
        if (row) {
            row.classList.add('user-row-deleting')
        }

        // 少し待ってからERASERエフェクトを再生
        setTimeout(() => {
            playEraserEffect()
        }, 300)

        // セッションからユーザー情報を取得
        const { data: { session } } = await supabaseAuth.auth.getSession()

        if (!session) {
            throw new Error('セッションが見つかりません')
        }

        const requestUserId = session.user.id
        const requestUserEmail = session.user.email

        console.log('🗑️ ユーザー削除開始:', userId, userEmail)
        console.log('👤 リクエストユーザー:', requestUserId, requestUserEmail)

        // バックエンドAPIを呼び出してユーザーを削除
        const response = await fetch('/api/delete-user', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requestUserId: requestUserId,
                requestUserEmail: requestUserEmail,
                userId: userId,
                userEmail: userEmail
            })
        })

        const data = await response.json()

        if (!response.ok) {
            throw new Error(data.error || 'ユーザー削除に失敗しました')
        }

        console.log('✅ ユーザー削除成功:', userEmail)

        // ERASERエフェクト完了後に行を削除
        setTimeout(() => {
            if (row) {
                row.remove()
            }

            // エフェクトを非表示
            hideEraserEffect()

            alert(`✅ ${userEmail} を追放しました`)
        }, 2500)

    } catch (error) {
        console.error('❌ ユーザー削除エラー:', error)
        alert(`エラー: ${error.message}`)

        // エラー時は行のアニメーションを解除
        const row = document.getElementById(`user-row-${userId}`)
        if (row) {
            row.classList.remove('user-row-deleting')
        }
    }
}

// ERASERエフェクトを再生
function playEraserEffect() {
    const effect = document.getElementById('eraserEffect')
    const flash = document.getElementById('eraserFlash')
    const text = document.getElementById('eraserText')
    const particles = document.getElementById('eraserParticles')

    if (!effect || !flash || !text || !particles) return

    // エフェクトを表示
    effect.style.display = 'block'

    // フラッシュ
    flash.style.opacity = '1'
    setTimeout(() => {
        flash.style.opacity = '0'
    }, 200)

    // ERASERテキストを表示
    setTimeout(() => {
        text.style.transform = 'translate(-50%, -50%) scale(1)'
        text.style.animation = 'eraserPulse 0.5s ease-in-out'
    }, 100)

    // グリッチエフェクト
    setTimeout(() => {
        text.style.animation = 'eraserGlitch 0.3s ease-in-out'
    }, 600)

    // パーティクル生成
    setTimeout(() => {
        createParticles(particles)
    }, 400)

    // フェードアウト
    setTimeout(() => {
        text.style.animation = 'eraserFadeOut 0.8s ease-out forwards'
    }, 1500)
}

// ERASERエフェクトを非表示
function hideEraserEffect() {
    const effect = document.getElementById('eraserEffect')
    const text = document.getElementById('eraserText')
    const particles = document.getElementById('eraserParticles')

    if (effect) effect.style.display = 'none'
    if (text) {
        text.style.transform = 'translate(-50%, -50%) scale(0)'
        text.style.animation = 'none'
    }
    if (particles) particles.innerHTML = ''
}

// パーティクルを生成
function createParticles(container) {
    container.innerHTML = ''

    const particleCount = 30

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div')
        particle.className = 'eraser-particle'

        // ランダムな方向と距離
        const angle = (Math.PI * 2 * i) / particleCount
        const distance = 200 + Math.random() * 200
        const tx = Math.cos(angle) * distance
        const ty = Math.sin(angle) * distance

        particle.style.setProperty('--tx', `${tx}px`)
        particle.style.setProperty('--ty', `${ty}px`)
        particle.style.animationDelay = `${Math.random() * 0.2}s`

        container.appendChild(particle)
    }
}

// オーナーアカウント判定時にユーザー管理ボタンを表示
function showUserManagementButton() {
    const btn = document.getElementById('userManagementBtn')
    if (btn && currentUser && currentUser.email && currentUser.email.includes('komedorobouinuzini')) {
        btn.style.display = 'block'
        console.log('✅ ユーザー管理ボタンを表示')
    }
}

// 認証状態変更時にユーザー管理ボタンの表示を更新
// （既存のonAuthStateChangeハンドラーに追加する必要があるが、ここでは呼び出し例を示す）
// showUserManagementButton() を updatePlanDisplay() の後などに呼び出す
