// api/webhook.js
import { google } from 'googleapis';

const LINE_API_REPLY = 'https://api.line.me/v2/bot/message/reply';
const LINE_API_PUSH  = 'https://api.line.me/v2/bot/message/push';

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const FORM_PREFILL_URL = process.env.FORM_PREFILL_URL || '';
const GOOGLE_SA_KEY_B64 = process.env.GOOGLE_SA_KEY_B64 || '';

// decode service account
let sheetsClient = null;
if (GOOGLE_SA_KEY_B64) {
  const saKeyJson = JSON.parse(Buffer.from(GOOGLE_SA_KEY_B64, 'base64').toString('utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: saKeyJson,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
}

function uuid() { return 'id-' + Date.now() + '-' + Math.floor(Math.random()*100000); }

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

  try {
    const body = req.body;
    const events = Array.isArray(body.events) ? body.events : [];
    for (const ev of events) {
      if (ev.type === 'follow') {
        const uid = ev.source?.userId;
        if (uid) {
          await pushMessage(uid, [{ type:'text', text:'友だち登録ありがとうございます！フルネーム（例：山田太郎）をこのLINEに送ってください。' }]);
        }
      } else if (ev.type === 'message' && ev.message?.type === 'text') {
        const text = String(ev.message.text || '').trim();
        const uid = ev.source?.userId;
        const replyToken = ev.replyToken;
        if (!text || !uid) continue;

        // append to sheet if sheetsClient exists
        if (sheetsClient && SPREADSHEET_ID) {
          const id = uuid();
          const now = (new Date()).toISOString();
          const values = [[id, text, '', now, '', '', 'queued', false, uid]];
          await sheetsClient.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Queue!A:I',
            valueInputOption: 'RAW',
            requestBody: { values }
          });
        }

        // send form prefill link
        const formUrl = FORM_PREFILL_URL.replace('{NAME}', encodeURIComponent(text));
        const replyText = '受付ありがとうございます。フォームからメールアドレスを入力して受付を完了してください：\n' + formUrl;
        if (replyToken) {
          await replyMessage(replyToken, [{ type:'text', text: replyText }]);
        } else {
          await pushMessage(uid, [{ type:'text', text: replyText }]);
        }
      }
    }

    return res.status(200).json({ ok:true });
  } catch (err) {
    console.error('handler error', err);
    return res.status(500).json({ ok:false, error: String(err) });
  }
}
