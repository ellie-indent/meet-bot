# Slack /meet Bot

Generates a Google Meet link instantly from Slack with `/meet [optional topic]`.

## What it does

- `/meet` → Creates a Meet with title "Quick sync"
- `/meet weekly standup` → Creates a Meet titled "weekly standup"
- Posts a message to the channel with a one-click join button

## Setup (takes ~15 minutes)

### 1. Create a Slack App

1. Go to https://api.slack.com/apps → **Create New App** → From scratch
2. Name it `Meet Bot`, select your workspace
3. **Slash Commands** → **Create New Command**
   - Command: `/meet`
   - Request URL: `https://YOUR-DEPLOYED-URL.com/meet`
   - Short Description: `Start a Google Meet instantly`
   - Usage Hint: `[optional topic]`
4. **OAuth & Permissions** → Scopes → Add `chat:write`
5. **Install App** to your workspace
6. Copy:
   - **Bot User OAuth Token** (`xoxb-...`) → `SLACK_BOT_TOKEN`
   - **Signing Secret** (Basic Info page) → `SLACK_SIGNING_SECRET`

### 2. Set up Google Service Account

1. Go to https://console.cloud.google.com → Create or select a project
2. **APIs & Services** → **Library** → Enable **Google Calendar API**
3. **APIs & Services** → **Credentials** → **Create Credentials** → **Service Account**
   - Name it `meet-bot`, click through to finish
4. Click the service account → **Keys** tab → **Add Key** → JSON
5. Download the key file
6. Open the JSON file and copy its entire contents (as one line) → `GOOGLE_SERVICE_ACCOUNT_JSON`
7. Note the `client_email` from the JSON (looks like `meet-bot@project.iam.gserviceaccount.com`)

### 3. Share your Calendar with the service account

1. Open Google Calendar → Settings → your calendar → **Share with specific people**
2. Add the service account email, give it **"Make changes to events"** permission
3. Set `GOOGLE_CALENDAR_ID` to `primary` or your specific calendar email

### 4. Deploy to Railway (free, 5 minutes)

1. Push this code to a GitHub repo
2. Go to https://railway.app → **New Project** → **Deploy from GitHub repo**
3. Add environment variables in Railway's dashboard:
   - `SLACK_SIGNING_SECRET`
   - `SLACK_BOT_TOKEN`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (paste the entire JSON as one line)
   - `GOOGLE_CALENDAR_ID` (use `primary` or your calendar email)
4. Railway will give you a URL like `https://meet-bot-production.up.railway.app`
5. Go back to Slack App settings → Slash Commands → update the Request URL to `https://your-railway-url.up.railway.app/meet`

### Alternative: Deploy to Render (also free)

1. Push to GitHub
2. https://render.com → **New Web Service** → connect repo
3. Build: `npm install`, Start: `node server.js`
4. Add the same env vars

## Local development

```bash
npm install
cp .env.example .env
# Fill in your .env values
npm run dev
# Use ngrok to expose locally: npx ngrok http 3000
```

## Usage

```
/meet                    → Quick sync (60 min block)
/meet design review      → Creates "design review" meeting
/meet 1:1 with Sarah     → Creates "1:1 with Sarah" meeting
```
