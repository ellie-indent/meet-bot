const express = require("express");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => res.send("Meet Bot is running ✅"));

app.post("/meet", async (req, res) => {
  try {
    const { google } = require("googleapis");
    res.json({ response_type: "in_channel", text: "✅ googleapis loaded successfully!" });
  } catch (err) {
    res.json({ response_type: "in_channel", text: `❌ Error: ${err.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meet Bot listening on port ${PORT}`));
