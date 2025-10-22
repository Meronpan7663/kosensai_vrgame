// api/webhook.js
import { google } from 'googleapis';

const LINE_API_REPLY = 'https://api.line.me/v2/bot/message/reply';
const LINE_API_PUSH  = 'https://api.line.me/v2/bot/message/push';

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const FORM_PREFILL_URL = process.env.FORM_PREFILL_URL || '';
const GOOGLE_SA_KEY_B64 = process.env.GOOGLE_SA_KEY_B64 || '';
const GOOGLE_SA_KEY = process.env.GOOGLE_SA_KEY || '';

let sheetsClient = null;

async function initSheetsClientOnce() {
  if (sheetsClient) return sheetsClient;
  try {
    let saKeyObj = null;
    if (GOOGLE_SA_KEY_B64) {
      const jsonStr = Buffer.from(GOOGLE_SA_KEY_B64, 'base64').toString('utf8');
      saKeyObj = JSON.parse(jsonStr);
    } else if (GOOGLE_SA_KEY) {
      saKeyObj = JSON.parse(GOOGLE_SA_KEY);
    } else {
      console.log('No service account key provided; sheetsClient will be unavailable.');
      return null;
    }
    if (!saKeyObj.client_email || !saKeyObj.private_key) {
      console.error('Service account JSON missing client_email or private_key', { client_email: saKeyObj.client_email });
      return null;
    }
    const auth = new google.auth.GoogleAuth({
      credentials: saKeyObj,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('Sheets client initialized for', saKeyObj.client_email);
    return sheetsClient;
  } catch (err) {
    console.error('initSheetsClient error:', String(err));
    return null;
  }
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

function uuid() { return 'id-' + Date.now() + '-' + Math.floor(Math.random()*100000); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');
  const body = req.body || {};
  const events = Array.isArray(body.events) ? body.events : [];
  const sheets = await initSheetsClientOnce();

  for (const ev of events) {
    try {
      if (ev.type === 'follow') {
        const uid = ev.source?.userId;
        if (uid) {
          await pushMessage(uid, [{ type:'text', text:'友だち登録ありがとうございます！フルネーム（例：高専太郎）をこのLINEに送ってください。' }]);
        }
      } else if (ev.type === 'message' && ev.message?.type === 'text') {
        const text = String(ev.message.text || '').trim();
        const uid = ev.source?.userId;
        const replyToken = ev.replyToken;
        if (!text || !uid) continue;

        if (sheets && SPREADSHEET_ID) {
          try {
            const id = uuid();
            const now = (new Date()).toISOString();
            const values = [[id, text, '', now, '', '', 'queued', false, uid]];
            await sheets.spreadsheets.values.append({
              spreadsheetId: SPREADSHEET_ID,
              range: 'Queue!A:I',
              valueInputOption: 'RAW',
              requestBody: { values }
            });
          } catch (err) {
            console.error('Failed to append to sheet:', String(err));
          }
        }

        const formUrl = FORM_PREFILL_URL.replace('{NAME}', encodeURIComponent(text));
        const replyText = '受付ありがとうございます。フォームからメールアドレスを入力して受付を完了してください：\n' + formUrl;
        if (replyToken) {
          await replyMessage(replyToken, [{ type:'text', text: replyText }]);
        } else {
          await pushMessage(uid, [{ type:'text', text: replyText }]);
        }
      }
    } catch (err) {
      console.error('ev error', String(err));
    }
  }

  return res.status(200).json({ ok:true });
}
