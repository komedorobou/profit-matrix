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
    const { to, partnerName, products } = req.body;

    // バリデーション
    if (!to || !products || products.length === 0) {
      return res.status(400).json({
        error: 'Missing required parameters: to, products'
      });
    }

    // 商品リストHTML作成
    const productListHTML = products.map((product, index) => `
      <div style="margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #00FFA3;">
        <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 18px;">
          ${index + 1}. ${product.productName}
        </h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 15px;">
          <div>
            <div style="color: #666; font-size: 12px; margin-bottom: 5px;">Yahoo価格</div>
            <div style="color: #00B8D9; font-size: 20px; font-weight: bold;">¥${product.price.toLocaleString()}</div>
          </div>
          <div>
            <div style="color: #666; font-size: 12px; margin-bottom: 5px;">メルカリ相場</div>
            <div style="color: #666; font-size: 20px; font-weight: bold;">¥${product.originalPrice.toLocaleString()}</div>
          </div>
          <div>
            <div style="color: #666; font-size: 12px; margin-bottom: 5px;">利益</div>
            <div style="color: #00FFA3; font-size: 20px; font-weight: bold;">¥${product.profit.toLocaleString()}</div>
          </div>
        </div>
        <div style="margin-bottom: 10px;">
          <span style="display: inline-block; padding: 4px 12px; background: #00FFA3; color: #000; border-radius: 20px; font-size: 12px; font-weight: bold;">
            利益率 ${product.profitMargin}%
          </span>
        </div>
        <div style="color: #666; font-size: 14px; margin-bottom: 10px;">
          🏪 ${product.shop} | ${product.stock}
        </div>
        <a href="${product.url}"
           style="display: inline-block; padding: 10px 20px; background: #00B8D9; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
          商品ページを開く →
        </a>
      </div>
    `).join('');

    // メールHTML
    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5;">
        <div style="max-width: 800px; margin: 0 auto; background: white;">
          <!-- ヘッダー -->
          <div style="background: linear-gradient(135deg, #00FFA3 0%, #00B8D9 100%); padding: 40px 20px; text-align: center;">
            <h1 style="margin: 0; color: #000; font-size: 32px; font-weight: 900;">PROFIT MATRIX</h1>
            <p style="margin: 10px 0 0 0; color: #000; font-size: 14px;">利益商品情報</p>
          </div>

          <!-- 本文 -->
          <div style="padding: 40px 20px;">
            <p style="font-size: 16px; color: #333; margin: 0 0 30px 0;">
              ${partnerName || 'ご担当者'}様
            </p>
            <p style="font-size: 14px; color: #666; line-height: 1.8; margin: 0 0 30px 0;">
              利益率の高い商品情報をお送りします。<br>
              以下の商品をご確認ください。
            </p>

            <!-- 商品リスト -->
            ${productListHTML}

            <!-- フッター -->
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
              <p>このメールは PROFIT MATRIX から自動送信されています</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

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
        subject: `【PROFIT MATRIX】利益商品情報（${products.length}件）`,
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
