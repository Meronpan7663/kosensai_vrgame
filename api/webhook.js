// api/webhook.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  const body = req.body || {};
  const events = Array.isArray(body.events) ? body.events : [];
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return res.status(500).send('LINE token not set');

  const reply = async (replyToken, messages) => {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + token },
      body: JSON.stringify({ replyToken, messages })
    });
  };
  const push = async (to, messages) => {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + token },
      body: JSON.stringify({ to, messages })
    });
  };

  for (const ev of events) {
    try {
      if (ev.type === 'follow') {
        const uid = ev.source && ev.source.userId;
        if (uid) await push(uid, [{ type:'text', text:'友だち登録ありがとうございます！フルネームを送ってください。' }]);
      } else if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
        const text = ev.message.text;
        if (ev.replyToken) {
          await reply(ev.replyToken, [{ type:'text', text: '受け取りました: ' + text }]);
        } else {
          const uid = ev.source && ev.source.userId;
          if (uid) await push(uid, [{ type:'text', text: '受信しました: ' + text }]);
        }
      }
    } catch (err) {
      console.error('handle event error', err);
    }
  }

  return res.status(200).json({ ok: true });
}
