const express = require("express");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => res.send("Meet Bot is running ✅"));

app.post("/meet", async (req, res) => {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    res.json({ response_type: "in_channel", text: `✅ JSON parsed! Service account: ${credentials.client_email}` });
  } catch (err) {
    res.json({ response_type: "in_channel", text: `❌ JSON parse failed: ${err.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meet Bot listening on port ${PORT}`));
