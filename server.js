const express = require("express");
const crypto = require("crypto");
const { google } = require("googleapis");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function isValidSlackRequest(req) {
  try {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    const timestamp = req.headers["x-slack-request-timestamp"];
    const slackSignature = req.headers["x-slack-signature"];
    if (!timestamp || !slackSignature || !signingSecret) return false;
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
    const base = `v0:${timestamp}:${req.rawBody || ""}`;
    const hmac = crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
    const computed = `v0=${hmac}`;
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
    clientOptions: {
      subject: process.env.GOOGLE_IMPERSONATE_EMAIL,
    },
  });
}

async function createMeetLink(topic) {
  const auth = getGoogleAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: topic || "Quick Meet",
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  let meetLink =
    event.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ||
    event.data.hangoutLink;

  if (!meetLink) {
    const eventId = event.data.id;
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const updated = await calendar.events.get({
        calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
        eventId,
      });
      meetLink =
        updated.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ||
        updated.data.hangoutLink;
      if (meetLink) break;
    }
  }

  if (!meetLink) {
    throw new Error("Google did not return a Meet link. Make sure Google Meet is enabled for your Workspace.");
  }

  return { meetLink, eventLink: event.data.htmlLink };
}

async function postToSlack(responseUrl, payload) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

app.post("/meet", async (req, res) => {
  const { user_id, text, response_url } = req.body;
  const topic = text?.trim() || "Quick sync";

  // Respond to Slack instantly — no validation, no nothing, just respond
  res.json({ response_type: "in_channel", text: "⏳ Generating your Meet link, one sec..." });

  // Everything else happens after Slack already got its response
  try {
    const { meetLink, eventLink } = await createMeetLink(topic);
    await postToSlack(response_url, {
      response_type: "in_channel",
      replace_original: true,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `📹 *${topic}* — started by <@${user_id}>` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Join the call:*\n<${meetLink}|🟢 Click to join Google Meet>` },
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
              text: { type: "plain_text", text: "📅 Calendar Event", emoji: true },
              url: eventLink,
            },
          ],
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: "Use `/meet [topic]` to start a named meeting  •  e.g. `/meet design review`" },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("Error creating meet:", err);
    await postToSlack(response_url, {
      response_type: "in_channel",
      replace_original: true,
      text: `❌ Something went wrong: ${err.message}`,
    });
  }
});

app.get("/", (req, res) => res.send("Meet Bot is running ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meet Bot listening on port ${PORT}`));
