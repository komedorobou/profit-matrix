import crypto from 'crypto';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Vercelの自動bodyパーサを無効化（LINE署名検証には生ボディが必要）
export const config = {
  api: {
    bodyParser: false,
  },
};

// 生のリクエストボディをBufferで読み取る
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Line-Signature');

  // OPTIONSリクエスト対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 生ボディ取得（署名検証用）
    const rawBody = await readRawBody(req);

    // LINE署名検証
    const signature = req.headers['x-line-signature'];
    if (!signature) {
      console.error('LINE webhook: x-line-signatureヘッダーがありません');
      return res.status(401).json({ error: 'No signature' });
    }

    if (!CHANNEL_SECRET) {
      console.error('LINE webhook: LINE_CHANNEL_SECRET未設定');
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    const hash = crypto
      .createHmac('SHA256', CHANNEL_SECRET)
      .update(rawBody)
      .digest('base64');

    if (hash !== signature) {
      console.error('LINE webhook: 署名不一致', {
        expected: hash,
        received: signature,
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 署名検証通過後にJSONパース
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
      console.error('LINE webhook: JSONパース失敗', e);
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    // Webhookイベント処理
    const events = payload.events || [];

    for (const event of events) {
      // 友だち追加イベント
      if (event.type === 'follow') {
        const userId = event.source.userId;
        const timestamp = event.timestamp;

        console.log('友だち追加:', {
          userId,
          timestamp,
          event
        });

        // LINEプロフィール情報を取得
        let displayName = null;
        try {
          const profileResponse = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
            }
          });

          if (profileResponse.ok) {
            const profile = await profileResponse.json();
            displayName = profile.displayName;
            console.log('プロフィール取得成功:', profile);
          }
        } catch (error) {
          console.error('プロフィール取得エラー:', error);
        }

        // Supabaseの承認待ちリストに保存
        try {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/pending_partners`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              line_id: userId,
              display_name: displayName,
              status: 'pending'
            })
          });

          if (response.ok) {
            console.log('承認待ちリストに追加成功:', userId, displayName);
          } else {
            const error = await response.text();
            console.error('Supabase保存エラー:', error);
          }
        } catch (error) {
          console.error('Supabase保存エラー:', error);
        }
      }

      // メッセージ受信イベント
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const text = event.message.text;

        console.log('メッセージ受信:', {
          userId,
          text
        });
      }
    }

    // LINE側には200を返す（必須）
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('LINE Webhook Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
