// ウェルカムメール送信API
const RESEND_API_KEY = 're_2MwkRd2D_7dLjY6xXj8VkLm3JcUGEaEwB';

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, type } = req.body;

    // バリデーション
    if (!to || !type) {
      return res.status(400).json({
        error: 'Missing required parameters: to, type'
      });
    }

    let subject, emailHTML;

    if (type === 'signup') {
      // メアド登録時のメール
      subject = '【PROFIT MATRIX】ご登録ありがとうございます';
      emailHTML = getSignupEmailHTML();
    } else if (type === 'credit_registered') {
      // クレジット登録後のメール
      subject = '【PROFIT MATRIX】7日間無料トライアル開始！API設定ガイド';
      emailHTML = getCreditRegisteredEmailHTML();
    } else {
      return res.status(400).json({
        error: 'Invalid type. Use "signup" or "credit_registered"'
      });
    }

    // Resend APIでメール送信
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'PROFIT MATRIX <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: emailHTML
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Resend API Error:', errorData);
      return res.status(response.status).json({
        error: 'Email sending failed',
        details: errorData
      });
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      messageId: data.id,
      message: `${to} にメールを送信しました`
    });

  } catch (error) {
    console.error('Email Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// メアド登録時のメールHTML
function getSignupEmailHTML() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white;">
        <!-- ヘッダー -->
        <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); padding: 40px 20px; text-align: center;">
          <h1 style="margin: 0; color: #00FFA3; font-size: 28px; font-weight: 900;">PROFIT MATRIX</h1>
          <p style="margin: 10px 0 0 0; color: #888; font-size: 14px;">次世代AI搭載 自動利益算出システム</p>
        </div>

        <!-- 本文 -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #1a1a1a; font-size: 24px; margin: 0 0 20px 0;">
            ご登録ありがとうございます！
          </h2>

          <p style="font-size: 16px; color: #333; line-height: 1.8; margin: 0 0 30px 0;">
            PROFIT MATRIXへようこそ！<br>
            メールアドレスの登録が完了しました。
          </p>

          <!-- 次のステップ -->
          <div style="background: linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
            <h3 style="color: #000; font-size: 18px; margin: 0 0 15px 0;">🎉 7日間無料トライアル</h3>
            <p style="color: #000; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
              クレジットカードを登録すると、<strong>7日間無料</strong>で全機能をお試しいただけます。<br>
              トライアル期間中はいつでもキャンセル可能です。
            </p>
            <a href="https://profit-matrix.jp"
               style="display: inline-block; padding: 14px 30px; background: #000; color: #00FFA3; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              アプリを開いてトライアルを開始 →
            </a>
          </div>

          <!-- 機能紹介 -->
          <h3 style="color: #1a1a1a; font-size: 18px; margin: 0 0 20px 0;">✨ PROFIT MATRIXでできること</h3>

          <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #00FFA3;">
            <strong style="color: #1a1a1a;">💰 Yahoo検索モード</strong>
            <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">メルカリCSVから利益商品を自動発見</p>
          </div>

          <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #00B8D9;">
            <strong style="color: #1a1a1a;">📊 CSV統合モード</strong>
            <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">複数CSV結合・クリーニング・グループ化</p>
          </div>

          <div style="margin-bottom: 30px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #FFD700;">
            <strong style="color: #1a1a1a;">👥 外注先管理</strong>
            <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">利益商品をメール/LINEで一括送信</p>
          </div>

          <!-- フッター -->
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
            <p>ご不明点がございましたらお気軽にお問い合わせください</p>
            <p>© PROFIT MATRIX</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// クレジット登録後のメールHTML
function getCreditRegisteredEmailHTML() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white;">
        <!-- ヘッダー -->
        <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); padding: 40px 20px; text-align: center;">
          <h1 style="margin: 0; color: #00FFA3; font-size: 28px; font-weight: 900;">PROFIT MATRIX</h1>
          <p style="margin: 10px 0 0 0; color: #888; font-size: 14px;">次世代AI搭載 自動利益算出システム</p>
        </div>

        <!-- 本文 -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #1a1a1a; font-size: 24px; margin: 0 0 20px 0;">
            🎉 7日間無料トライアル開始！
          </h2>

          <p style="font-size: 16px; color: #333; line-height: 1.8; margin: 0 0 30px 0;">
            クレジットカードの登録が完了しました！<br>
            本日より7日間、全機能を無料でご利用いただけます。
          </p>

          <!-- API設定ガイド -->
          <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; margin-bottom: 30px;">
            <h3 style="color: #1a1a1a; font-size: 18px; margin: 0 0 20px 0;">🔧 API設定ガイド</h3>

            <div style="margin-bottom: 20px;">
              <h4 style="color: #00FFA3; font-size: 14px; margin: 0 0 10px 0;">STEP 1: Yahoo APIキーを取得</h4>
              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
                Yahoo!デベロッパーネットワークでアプリケーションIDを取得してください。
              </p>
              <a href="https://e.developer.yahoo.co.jp/register"
                 style="color: #00B8D9; font-size: 14px; text-decoration: none;">
                → Yahoo!デベロッパーネットワーク
              </a>
            </div>

            <div style="margin-bottom: 20px;">
              <h4 style="color: #00FFA3; font-size: 14px; margin: 0 0 10px 0;">STEP 2: アプリにAPIキーを設定</h4>
              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
                PROFIT MATRIXの設定画面で、取得したAPIキーを入力してください。
              </p>
            </div>

            <div>
              <h4 style="color: #00FFA3; font-size: 14px; margin: 0 0 10px 0;">STEP 3: 検索開始！</h4>
              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
                メルカリのCSVをアップロードして、利益商品を自動検索しましょう。
              </p>
            </div>
          </div>

          <!-- サンプルダウンロード -->
          <div style="background: linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
            <h3 style="color: #000; font-size: 18px; margin: 0 0 15px 0;">📥 サンプルCSVダウンロード</h3>
            <p style="color: #000; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
              まずはサンプルCSVで動作をお試しください。<br>
              実際のメルカリ売れ筋商品データです。
            </p>
            <a href="https://profit-matrix.jp/sample.csv"
               style="display: inline-block; padding: 14px 30px; background: #000; color: #00FFA3; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              サンプルCSVをダウンロード →
            </a>
          </div>

          <!-- アプリを開く -->
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="https://profit-matrix.jp"
               style="display: inline-block; padding: 16px 40px; background: #1a1a1a; color: #00FFA3; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">
              PROFIT MATRIXを開く →
            </a>
          </div>

          <!-- ヘルプ -->
          <div style="padding: 20px; background: #fff3cd; border-radius: 8px; margin-bottom: 30px;">
            <p style="color: #856404; font-size: 14px; margin: 0;">
              💡 <strong>ヒント:</strong> 7日間のトライアル期間中はいつでもキャンセル可能です。
              課金が発生するのはトライアル終了後からとなります。
            </p>
          </div>

          <!-- フッター -->
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
            <p>ご不明点がございましたらお気軽にお問い合わせください</p>
            <p>© PROFIT MATRIX</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
