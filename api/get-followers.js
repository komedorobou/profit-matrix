export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  
  try {
    const resp = await fetch('https://api.line.me/v2/bot/followers/ids', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await resp.json();
    
    // Get profiles for each user
    const profiles = [];
    for (const userId of (data.userIds || [])) {
      try {
        const profileResp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (profileResp.ok) {
          profiles.push(await profileResp.json());
        }
      } catch(e) {}
    }
    
    return res.status(200).json({ followers: data, profiles });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
