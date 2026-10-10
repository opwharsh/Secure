# Language Guard Discord Bot (Railway)

Discord.js bot that heuristically detects Roman Hindi/Hinglish in one configured channel, deletes likely matches, and posts a warning in that same channel pinging the author. It rotates between `Securing server /marvelboost` and `Monitoring 2340 members`.

## Slash commands

- `/languageguard` — show configuration and rotating statuses (Manage Guild).
- `/set-channel channel:<text channel>` — choose which channel to moderate (Manage Server). This selection applies immediately but is runtime-only; after a restart, the bot falls back to `TARGET_CHANNEL_ID` from Railway Variables.
- `/refresh [limit]` — scan up to 1–100 recent messages in the configured channel (default 50); delete and warn for messages detected as Hinglish. Requires Manage Messages.
- `/manual-detection message_link:<Discord message link>` — manually delete the linked message and post a warning pinging its author. Restricted to the configured channel and current server. Requires Manage Messages.

## Railway setup

1. Upload this folder to a GitHub repository.
2. In Railway, create a project from that GitHub repo.
3. Add environment variables from `.env.example` in Railway Variables. `TARGET_CHANNEL_ID` can be omitted if you plan to use `/set-channel` after startup.
4. In Discord Developer Portal, enable **Message Content Intent**.
5. Invite the bot with `View Channels`, `Read Message History`, `Send Messages`, `Embed Links`, and `Manage Messages` in the target channel.
6. Deploy. `npm start` is configured.

Use a numeric `GUILD_ID` to register commands immediately in one server. If omitted, commands register globally and may take time to appear.

## Important notes

- Hinglish detection uses a word-list heuristic, not language AI. It cannot be 100% accurate and may miss some Hinglish or flag ordinary text. Test and tune the word lists before relying on it.
- `/refresh` scans recent messages only, up to the requested limit (maximum 100 per run), to avoid unexpectedly sweeping a large channel.
- `/set-channel` requires Manage Server permission. Set `TARGET_CHANNEL_ID` in Railway Variables to keep a default channel after restarts.
- `/manual-detection` requires a valid message link in the configured target channel. It deletes that message and sends the same public warning ping used by automatic moderation.
- Never share your bot token. Keep it in Railway Variables, not in source code.
