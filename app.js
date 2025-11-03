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
let currentPlan = 'starter'
let shouldCheckApiKeyAfterOwnerSettings = false; // オーナー設定後のAPIキーチェックフラグ

// 認証状態監視
supabaseAuth.auth.onAuthStateChange(async (event, session) => {
    console.log('🔐 Auth event:', event)

    try {
        if (event === 'SIGNED_IN' && session) {
            console.log('✅ ログイン成功:', session.user.email)
            currentUser = session.user

            // プラン情報取得（エラーハンドリング付き）
            console.log('📊 プロフィール取得スキップ（暫定対応）')
            console.log('デフォルトプラン(starter)を使用します')
            currentPlan = 'starter'

            // 後でプロフィール取得を試みる（バックグラウンドで）
            setTimeout(async () => {
                try {
                    console.log('🔄 バックグラウンドでプロフィール取得を試行...')
                    const { data: profile, error: profileError } = await supabaseAuth
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .single()

                    if (profileError) {
                        console.warn('⚠️ プロフィール取得エラー:', profileError.message)
                    } else if (profile) {
                        console.log('✅ プロフィール取得成功:', profile)
                        currentPlan = profile.plan || 'starter'
                        localStorage.setItem('profitMatrixPlan', profile.plan)
                    } else {
                        console.warn('⚠️ プロフィールが見つかりません')
                    }
                } catch (error) {
                    console.warn('⚠️ プロフィール取得失敗（継続して使用可能）:', error.message)
                }
            }, 1000)

            // UI更新
            console.log('🎨 UI更新開始...')

            const authModal = document.getElementById('authModal')
            const userMenu = document.getElementById('userMenu')
            const userEmail = document.getElementById('userEmail')

            if (authModal) {
                authModal.style.display = 'none'
                console.log('✅ 認証モーダルを非表示')
            } else {
                console.error('❌ authModal要素が見つかりません')
            }

            if (userMenu) {
                userMenu.style.display = 'block'
                console.log('✅ ユーザーメニューを表示')
            } else {
                console.error('❌ userMenu要素が見つかりません')
            }

            if (userEmail) {
                userEmail.textContent = session.user.email
                console.log('✅ メールアドレスを表示:', session.user.email)
            } else {
                console.error('❌ userEmail要素が見つかりません')
            }

            // オーナー専用機能の制御
            const isOwner = session.user.email && session.user.email.includes('komedorobouinuzini')

            if (isOwner) {
                console.log('✅ オーナーモード: 専用機能を有効化')

                // オーナー設定を読み込んで適用（選択UIなどの表示制御も含む）
                loadOwnerSettings()

                // オーナーの場合、まずオーナー設定モーダルを表示
                console.log('⚙️ オーナー設定モーダルを表示（ログイン時）')
                const ownerSettingsModal = document.getElementById('ownerSettingsModal')
                if (ownerSettingsModal) {
                    ownerSettingsModal.style.display = 'flex'
                    shouldCheckApiKeyAfterOwnerSettings = true // オーナー設定後にAPIキーチェック
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

            console.log('✅ ログイン処理完了')

        } else if (event === 'SIGNED_OUT') {
            console.log('🚪 ログアウト')

            // フラグとグローバル変数をリセット
            shouldCheckApiKeyAfterOwnerSettings = false
            currentUser = null
            currentPlan = 'starter'

            // プラン情報のみクリア（APIキーとオーナー設定は保持）
            localStorage.removeItem('profitMatrixPlan')

            // すべてのモーダルを閉じる
            const authModal = document.getElementById('authModal')
            const userMenu = document.getElementById('userMenu')
            const ownerSettingsModal = document.getElementById('ownerSettingsModal')
            const apiKeyModal = document.getElementById('apiKeyModal')

            if (authModal) authModal.style.display = 'flex'
            if (userMenu) userMenu.style.display = 'none'
            if (ownerSettingsModal) ownerSettingsModal.style.display = 'none'
            if (apiKeyModal) apiKeyModal.style.display = 'none'

            console.log('✅ ログアウト処理完了')
        }
    } catch (error) {
        console.error('❌ 認証処理でエラー発生:', error)
        alert('認証処理中にエラーが発生しました。ページをリロードしてください。')
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
            console.log('✅ ログインリクエスト成功。認証イベント待機中...')
            // 成功時はonAuthStateChangeで自動処理される
            // ボタンはそのまま「ログイン中...」を表示
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
    btn.textContent = '登録中...'
    btn.disabled = true

    const { data, error } = await supabaseAuth.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: 'https://profit-matrix.jp/'
        }
    })

    if (error) {
        alert('登録エラー: ' + error.message)
        btn.textContent = '登録する（7日間無料）'
        btn.disabled = false
    } else {
        alert('✅ 確認メールを送信しました！\nメールのリンクをクリックして登録を完了してください。')
        switchAuthTab('login')
        btn.textContent = '登録する（7日間無料）'
        btn.disabled = false
    }
}

// ログアウト処理
window.handleLogout = async function() {
    if (confirm('ログアウトしますか？')) {
        await supabaseAuth.auth.signOut()
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


// 初期化処理を更新
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 アプリ初期化開始')

    // URLハッシュをチェック
    const hash = window.location.hash

    // パスワードリセット処理
    if (hash && hash.includes('type=recovery')) {
        console.log('🔑 パスワードリセットリンクを検出')
        // 認証モーダルを非表示
        document.getElementById('authModal').style.display = 'none'
        // パスワードリセットモーダルを表示
        document.getElementById('resetPasswordModal').style.display = 'flex'
        return
    }

    // メール確認後のリダイレクト処理
    if (hash && hash.includes('access_token')) {
        console.log('🔗 メール確認リダイレクトを検出')
        // ハッシュをクリア（URLをきれいに）
        window.history.replaceState(null, '', window.location.pathname)
        // Supabaseが自動的に処理してくれるので待機
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // セッションチェック
    const { data: { session } } = await supabaseAuth.auth.getSession()

    if (!session) {
        // 未ログイン → 認証モーダル表示（既にHTMLで表示されている）
        console.log('未ログイン: 認証モーダル表示')
        return
    }

    // ログイン済み → 認証モーダルを非表示
    console.log('ログイン済み: 認証モーダル非表示')
    document.getElementById('authModal').style.display = 'none'

    // 既存の初期化処理
    yahooApiKey = localStorage.getItem('yahooApiKey');

    if (!yahooApiKey) {
        document.getElementById('apiKeyModal').style.display = 'flex';
    }

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
        // CSVを読み込み
        const text = await csvFile.text();
        const csvData = parseCSV(text);

        if (csvData.length === 0) {
            throw new Error('CSVデータが空です');
        }

        // オーナーアカウントは制限なし
        const isOwner = currentUser && currentUser.email && currentUser.email.includes('komedorobouinuzini');

        let limitedData;
        if (isOwner) {
            console.log('✅ オーナーアカウント: 行数制限なし');
            limitedData = csvData;
        } else {
            // プラン別の検索行数制限を適用
            const limits = {
                starter: 100,
                standard: 300,
                premium: 999999
            };
            const maxSearchRows = limits[currentPlan] || 100;
            limitedData = csvData.slice(0, maxSearchRows);

            // 制限がかかっている場合は通知
            if (csvData.length > maxSearchRows) {
                console.log(`⚠️ プラン制限: ${csvData.length}行中、${maxSearchRows}行のみ検索します`);
                alert(`📊 プラン制限\n\nCSVファイルは${csvData.length}行ありますが、\n${currentPlan}プランでは最大${maxSearchRows}行まで検索できます。\n\n先頭${maxSearchRows}行のみ検索を実行します。`);
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

// CSV パース
function parseCSV(text) {
    // BOM除去
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.substring(1);
    }

    const lines = text.split('\n').filter(line => line.trim());
    const data = [];

    // ヘッダー行をスキップ
    for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',');

        if (columns.length < 4) continue;

        const brand = columns[0]?.trim();
        const item = columns[1]?.trim();
        const priceStr = columns[3]?.trim();

        if (!brand || !priceStr) continue;

        // 価格から数字のみ抽出
        const price = parseInt(priceStr.replace(/[^0-9]/g, ''));

        if (isNaN(price) || price <= 0) continue;

        data.push({
            brand,
            item: item || brand,
            originalPrice: price
        });
    }

    return data;
}

// Yahoo Shopping API検索
async function searchYahooShopping(item) {
    const query = `${item.brand} ${item.item || ''}`.trim();
    const maxPrice = Math.floor(item.originalPrice * 0.6); // 40%利益 = 60%価格

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
                return searchYahooShopping(item); // リトライ
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
                stock: stockStatus
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
            <a href="${item.url}" target="_blank" class="buy-link">
                PURCHASE →
            </a>
            <button class="skip-btn" onclick="toggleSkip(this)">見送り</button>
        </div>
    `;
    container.appendChild(card);
}

// 見送りトグル
function toggleSkip(button) {
    const card = button.closest('.result-card');
    const isSkipped = card.classList.toggle('skipped');

    if (isSkipped) {
        button.textContent = '見送り済み';
        button.style.background = 'rgba(148, 163, 184, 0.3)';
    } else {
        button.textContent = '見送り';
        button.style.background = '';
    }

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
function sortResults() {
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
}

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
function toggleProductSelect(checkbox, index) {
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
}

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
function selectPartner(index) {
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
}

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
function copyInviteLink(partnerId) {
    const input = document.getElementById(`inviteLink_${partnerId}`);
    input.select();
    document.execCommand('copy');
    alert('招待リンクをコピーしました！\n外注先に送ってください。');
}

// 送信方法による入力フィールド切り替え
function toggleSendMethodFields() {
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
}

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
function editPartner(index) {
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
}

// 外注先を削除
async function deletePartner(index) {
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
}

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
async function approvePartner(pendingId, lineId, displayName) {
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
}

// パートナーを却下
async function rejectPartner(pendingId) {
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
}

// ユーティリティ
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ボタンのクリックイベント
document.getElementById('batchSearchBtn').addEventListener('click', startBatchSearch);

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
function addFusionItemToStock(index) {
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
}

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
function closeOwnerSettings() {
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
}

// オーナー設定を更新
function updateOwnerSettings() {
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
}

// グローバルに関数を公開
window.openOwnerSettings = openOwnerSettings;
window.closeOwnerSettings = closeOwnerSettings;
window.updateOwnerSettings = updateOwnerSettings;
