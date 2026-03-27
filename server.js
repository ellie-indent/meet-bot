const express = require("express");
const crypto = require("crypto");
const { google } = require("googleapis");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Slack signature verification middleware ──────────────────────────────────
function verifySlackSignature(req, res, buf) {
  req.rawBody = buf.toString();
}
app.use(express.urlencoded({ extended: true, verify: verifySlackSignature }));

function isValidSlackRequest(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const timestamp = req.headers["x-slack-request-timestamp"];
  const slackSignature = req.headers["x-slack-signature"];

  // Reject requests older than 5 minutes
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const base = `v0:${timestamp}:${req.rawBody}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(base)
    .digest("hex");
  const computed = `v0=${hmac}`;

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(slackSignature)
  );
}

// ── Google Calendar auth ─────────────────────────────────────────────────────
function getGoogleAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

// ── Create a Google Meet link via Calendar API ───────────────────────────────
async function createMeetLink(topic, durationMinutes = 60) {
  const auth = getGoogleAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const start = new Date();
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: topic || "Quick Meet",
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const meetLink =
    event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video"
    )?.uri || event.data.hangoutLink;

  return { meetLink, eventLink: event.data.htmlLink };
}

// ── /meet slash command handler ──────────────────────────────────────────────
app.post("/meet", async (req, res) => {
  // Verify the request is from Slack
  if (!isValidSlackRequest(req)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { user_name, text, channel_id } = req.body;
  const topic = text?.trim() || "Quick sync";

  // Acknowledge immediately (Slack requires <3s response)
  res.json({
    response_type: "in_channel",
    text: `⏳ Generating your Meet link...`,
  });

  // Generate link asynchronously and post to channel
  try {
    const { meetLink, eventLink } = await createMeetLink(topic);

    await postToSlack(channel_id, {
      response_type: "in_channel",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📹 *${topic}* — started by <@${req.body.user_id}>`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Join the call:*\n<${meetLink}|🟢 Click to join Google Meet>`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "🎥 Join Meet", emoji: true },
              url: meetLink,
              style: "primary",
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "📅 Calendar Event",
                emoji: true,
              },
              url: eventLink,
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Use \`/meet [topic]\` to start a named meeting`,
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("Error creating meet:", err);
    await postToSlack(channel_id, {
      text: `❌ Couldn't create a Meet link. Check server logs.`,
    });
  }
});

// ── Post message to Slack channel ───────────────────────────────────────────
async function postToSlack(channel, payload) {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, ...payload }),
  });
  return response.json();
}

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Meet Bot is running ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meet Bot listening on port ${PORT}`));
