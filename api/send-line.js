const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: フォロワー一覧取得（一時機能）
  if (req.method === 'GET' && req.query.action === 'followers') {
    try {
      const resp = await fetch('https://api.line.me/v2/bot/followers/ids', {
        headers: { 'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
      });
      const data = await resp.json();
      const profiles = [];
      for (const userId of (data.userIds || [])) {
        try {
          const pResp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
          });
          if (pResp.ok) profiles.push(await pResp.json());
        } catch(e) {}
      }
      return res.status(200).json({ followers: data, profiles });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, partnerName, products } = req.body;

    // バリデーション
    if (!userId || !products || products.length === 0) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, products'
      });
    }

    // 商品が多すぎる場合は分割送信（LINEの制限対策）
    const maxProductsPerMessage = 10;
    const productChunks = [];
    for (let i = 0; i < products.length; i += maxProductsPerMessage) {
      productChunks.push(products.slice(i, i + maxProductsPerMessage));
    }

    // 各チャンクを送信
    for (let chunkIndex = 0; chunkIndex < productChunks.length; chunkIndex++) {
      const chunk = productChunks[chunkIndex];
      const isFirstChunk = chunkIndex === 0;

      // Flex Messageを作成
      const flexMessage = createFlexMessage(chunk, partnerName, isFirstChunk, chunkIndex + 1, productChunks.length);

      // LINE Messaging APIでメッセージ送信
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: userId,
          messages: [flexMessage]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('LINE API Error:', errorData);
        return res.status(response.status).json({
          error: 'LINE message sending failed',
          details: errorData
        });
      }

      // 複数送信の場合は少し待つ（レート制限対策）
      if (chunkIndex < productChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return res.status(200).json({
      success: true,
      message: `${userId} にLINEメッセージを送信しました（${products.length}件）`
    });

  } catch (error) {
    console.error('LINE Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Flex Message作成
function createFlexMessage(products, partnerName, isFirstMessage, chunkNum, totalChunks) {
  const bubbles = products.map(product => ({
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '💰 利益商品情報',
          color: '#ffffff',
          weight: 'bold',
          size: 'sm'
        }
      ],
      backgroundColor: '#00FFA3',
      paddingAll: '12px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        // 商品名
        {
          type: 'text',
          text: product.productName,
          weight: 'bold',
          size: 'md',
          wrap: true,
          margin: 'none'
        },
        // 価格情報
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            // Yahoo価格
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: 'Yahoo価格',
                  color: '#aaaaaa',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `¥${product.price.toLocaleString()}`,
                  wrap: true,
                  color: '#00B8D9',
                  size: 'lg',
                  weight: 'bold',
                  flex: 3,
                  align: 'end'
                }
              ]
            },
            // メルカリ相場
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: 'メルカリ相場',
                  color: '#aaaaaa',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `¥${product.originalPrice.toLocaleString()}`,
                  wrap: true,
                  color: '#666666',
                  size: 'lg',
                  weight: 'bold',
                  flex: 3,
                  align: 'end'
                }
              ]
            },
            // 利益
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '利益',
                  color: '#aaaaaa',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `¥${product.profit.toLocaleString()}`,
                  wrap: true,
                  color: '#00FFA3',
                  size: 'xl',
                  weight: 'bold',
                  flex: 3,
                  align: 'end'
                }
              ]
            }
          ]
        },
        // 利益率バッジ
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          contents: [
            {
              type: 'text',
              text: `利益率 ${product.profitMargin}%`,
              color: '#ffffff',
              size: 'sm',
              weight: 'bold',
              align: 'center'
            }
          ],
          backgroundColor: '#00FFA3',
          cornerRadius: '20px',
          paddingAll: '8px'
        },
        // ストア情報
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: `🏪 ${product.shop}`,
              color: '#666666',
              size: 'xs',
              wrap: true
            },
            {
              type: 'text',
              text: `📦 ${product.stock}`,
              color: '#666666',
              size: 'xs'
            }
          ]
        }
      ],
      paddingAll: '16px'
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          action: {
            type: 'uri',
            label: '商品ページを開く',
            uri: product.url
          },
          color: '#00B8D9'
        }
      ],
      paddingAll: '12px'
    }
  }));

  // ヘッダーメッセージ（最初のチャンクのみ）
  const headerText = isFirstMessage
    ? `${partnerName || 'ご担当者'}様\n利益商品情報をお送りします`
    : '';

  const footerText = totalChunks > 1
    ? `(${chunkNum}/${totalChunks})`
    : '';

  return {
    type: 'flex',
    altText: `【PROFIT MATRIX】利益商品情報（${products.length}件）${footerText}`,
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  };
}
