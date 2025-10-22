// api/status.js
import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const range = "Queue!A2:I"; // ID列からLineUserId列まで

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];

    // 整形して返す
    const data = rows.map((r) => ({
      ID: r[0],
      Name: r[1],
      Email: r[2],
      EntryTime: r[3],
      Position: r[4],
      ScheduledStart: r[5],
      Status: r[6],
      Notified: r[7],
      LineUserId: r[8],
    }));

    res.status(200).json({ count: data.length, list: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch queue data" });
  }
}
