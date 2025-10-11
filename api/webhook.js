// api/webhook.js
import fetch from 'node-fetch';
import { google } from 'googleapis';

const LINE_API_REPLY = 'https://api.line.me/v2/bot/message/reply';
const LINE_API_PUSH  = 'https://api.line.me/v2/bot/message/push';

// env variables (set in Vercel)
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN; // LINEチャネルアクセストークン（長期）
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; // your sheet ID
const FORM_PREFILL_URL = process.env.FORM_PREFILL_URL; // e.g. https://docs.google.com/forms/d/e/FORM_ID/viewform?usp=pp_url&entry.123456={NAME}
const GOOGLE_SA_KEY = process.env.GOOGLE_SA_KEY; // JSON string of service account key

// init google sheets client
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SA_KEY || '{}'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

function uuid() {
  return 'id-' + Date.now() + '-' + Math.floor(Math.random()*100000);
}

async function pushMessage(to, messages) {
  return fetch(LINE_API_PUSH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
    body: JSON.stringify({ to, messages })
  });
}

async function replyMessage(replyToken, messages) {
  return fetch(LINE_API_REPLY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
    body: JSON.stringify({ replyToken, messages })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  const body = req.body;
  if (!body || !body.events) return res.status(200).json({ ok:false });

  for (const ev of body.events) {
    try {
      if (ev.type === 'follow') {
        const uid = ev.source?.userId;
        if (uid) {
          // push: welcome -> ask for full name
          await pushMessage(uid, [{ type: 'text', text: '友だち登録ありがとうございます！フルネーム（例：山田太郎）をこのLINEに送ってください。' }]);
        }
      } else if (ev.type === 'message' && ev.message?.type === 'text') {
        const text = String(ev.message.text || '').trim();
        const uid = ev.source?.userId;
        // treat text as full name
        if (uid && text) {
          // append row to Queue
          const now = new Date().toISOString();
          const id = uuid();
          const values = [[id, text, '', now, '', '', 'queued', false, uid]];
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Queue!A:I',
            valueInputOption: 'RAW',
            resource: { values }
          });
          // Send form prefill link
          const formUrl = (FORM_PREFILL_URL || '').replace('{NAME}', encodeURIComponent(text));
          const replyText = '受付ありがとうございます。以下のフォームからメールアドレスを入力して受付を完了してください：\n' + formUrl;
          // Prefer reply if replyToken exists (users sent message)
          if (ev.replyToken) await replyMessage(ev.replyToken, [{ type:'text', text: replyText }]);
          else await pushMessage(uid, [{ type:'text', text: replyText }]);
        }
      }
    } catch (err) {
      console.error('ev error', err);
    }
  }
  // Always return 200
  res.status(200).json({ ok:true });
}
