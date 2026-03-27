const express = require("express");
const crypto = require("crypto");
const { google } = require("googleapis");

const app = express();

function verifySlackSignature(req, res, buf) {
  req.rawBody = buf.toString();
}
app.use(express.urlencoded({ extended: true, verify: verifySlackSignature }));
app.use(express.json());

function isValidSlackRequest(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const timestamp = req.headers["x-slack-request-timestamp"];
  const slackSignature = req.headers["x-slack-signature"];
  if (!timestamp || !slackSignature) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const base = `v0:${timestamp}:${req.rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  const computed = `v0=${hmac}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(slackSignature));
  } catch {
    return false;
  }
}

function getGoogleAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

async function createMeetLink(topic) {
  const auth = getGoogleAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: pro
