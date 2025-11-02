export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GETメソッドのみ許可
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { appid, query, price_to, results = 30, sort = '+price' } = req.query;

    // 必須パラメータチェック
    if (!appid || !query) {
      return res.status(400).json({
        error: 'Missing required parameters: appid, query'
      });
    }

    // Yahoo Shopping API V3 リクエスト
    const params = new URLSearchParams({
      appid,
      query,
      results,
      sort
    });

    // price_toがあれば追加
    if (price_to) {
      params.append('price_to', price_to);
    }

    const apiUrl = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yahoo API Error:', response.status, errorText);
      return res.status(response.status).json({
        error: `Yahoo API Error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();

    // 成功レスポンス
    return res.status(200).json(data);

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
