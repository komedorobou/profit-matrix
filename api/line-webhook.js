import crypto from 'crypto';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '7d3200011004dd72028f39e3c2dd3446';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czwwlrrgtmiagujdjxdr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6d3dscnJndG1pYWd1amRqeGRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMDM4NDgsImV4cCI6MjA3NTU3OTg0OH0.hKmaKImJP4ApCHoL4lHk8VjzShoQowyLx_e81wkKGis';
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || 'UtYq17fk+n5urcA1FtL83FmHY2MeTYKhyfUtJQrwdg/8+iGvEp1W31gzpTreTXb7C3TSpehJdBAP3EOyVcTOa/lEf6WgaIffDab3U/HbtKZxSkVLznAP0LlojHDHu5svLr5PWtWdjndBRSghaHiW+QdB04t89/1O/w1cDnyilFU=';

// bodyParserはVercelのデフォルト（有効）のまま使う
// req.bodyをJSON.stringifyしてBuffer化し、署名検証に使う

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
    // Webhookイベント処理
    const events = req.body?.events || [];

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
              'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
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

      // メッセージ受信イベント（User ID取得にも使用）
      if (event.type === 'message') {
        const userId = event.source.userId;
        const text = event.message?.text || '';

        console.log('メッセージ受信:', { userId, text });

        // pending_partnersにまだ登録されていなければ追加
        let displayName = null;
        try {
          const profileResponse = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: {
              'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
            }
          });
          if (profileResponse.ok) {
            const profile = await profileResponse.json();
            displayName = profile.displayName;
          }
        } catch (e) {}

        try {
          await fetch(`${SUPABASE_URL}/rest/v1/pending_partners`, {
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
          console.log('メッセージ経由でpending_partnersに追加:', userId, displayName);
        } catch (e) {
          console.error('pending_partners追加エラー:', e);
        }
      }
    }

    // デバッグ: 処理結果を返す
    return res.status(200).json({ success: true, eventsCount: events.length, supabaseUrl: SUPABASE_URL?.substring(0, 20) });

  } catch (error) {
    console.error('LINE Webhook Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
