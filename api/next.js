// api/next.js
import { google } from "googleapis";
import axios from "axios";

export default async function handler(req, res) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const range = "Queue!A2:I";

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];
    const waitingIndex = rows.findIndex((r) => r[6] === "waiting"); // Status列が"waiting"
    if (waitingIndex === -1) return res.status(200).json({ message: "No waiting users" });

    const target = rows[waitingIndex];
    const lineUserId = target[8];

    // LINE通知を送る（Webhookと同じ方法）
    await axios.post("https://api.line.me/v2/bot/message/push",
      {
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: `【My Game Event】\n${target[1]} さん\n今があなたの順番です！会場に来てください。`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );

    // ステータス更新
    rows[waitingIndex][6] = "called";
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Queue!A${waitingIndex + 2}:I${waitingIndex + 2}`,
      valueInputOption: "RAW",
      resource: { values: [rows[waitingIndex]] },
    });

    res.status(200).json({ message: `${target[1]} さんを呼び出しました` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to call next user" });
  }
}
