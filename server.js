const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function getGoogleAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    clientOptions: {
      subject: process.env.GOOGLE_IMPERSONATE_EMAIL,
    },
  });
}

async function createMeetLink(topic) {
  const auth = getGoogleAuth();
  const authClient = await auth.getClient();
  const token = await authClient.getAccessToken();

  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const calendarId = encodeURIComponent(process.env.GOOGLE_IMPERSONATE_EMAIL);

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: topic || "Quick Meet",
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    }
  );

  const data = await response.json();
  console.log("RESPONSE STATUS:", response.status);
  console.log("CONFERENCE DATA:", JSON.stringify(data.conferenceData, null, 2));
  console.log("HANGOUT LINK:", data.hangoutLink);

  if (!response.ok) {
    throw new Error(`Google API error: ${JSON.stringify(data.error)}`);
  }

  const meetLink =
    data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ||
    data.hangoutLink;

  if (!meetLink) {
    throw new Error(`No Meet link returned. Conference data: ${JSON.stringify(data.conferenceData)}`);
  }

  return { meetLink, eventLink: data.htmlLink };
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

  res.json({ response_type: "in_channel", text: "⏳ Generating your Meet link, one sec..." });

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
