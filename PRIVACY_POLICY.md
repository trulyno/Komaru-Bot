# Privacy Policy for Komaru Bot

**Last Updated:** August 19, 2026

This Privacy Policy explains how **Komaru Bot** ("the Bot") collects, uses, stores, and protects user information when installed in Discord servers or interacted with by users.

By using Komaru Bot, you agree to the collection and use of information in accordance with this policy.

---

## 1. Information We Collect

Komaru Bot collects minimal data necessary to function properly and provide moderation, command automation, and utility features.

### A. Information Automatically Processed
* **Discord User Identifiers**: Discord User IDs, Usernames, and Discriminators/Handles.
* **Discord Guild & Channel Data**: Guild IDs, Channel IDs, Role IDs, and Message IDs required to execute commands, apply roles, and route audit log notifications.
* **Message Content**: Text message content is processed in real-time for specific features including:
  * Admin command execution (`!synccommands`, `!cleancommands`, etc.)
  * Anti-spam and ghost-ping detection
  * Passive trigger detection (GitHub reference expansion, math/chem evaluation, cat keyword reactions)
  * Custom user-defined command triggers

> *Note: Message content is processed transiently in memory for trigger matching and anti-spam detection. It is not permanently stored or sold.*

### B. Information Persisted to Storage
* **User-Created Commands & Media**: Custom user commands created via bot features are saved to disk (`data/user_commands/`). This includes command trigger names, text contents, metadata (author User ID), and user-uploaded media attachments.
* **System & Diagnostic Logs**: Operational logs are stored on disk (`logs/komaru-YYYY-MM-DD.log`) to debug bot errors and monitor performance.

---

## 2. How We Use Your Information

The collected data is used exclusively for the following purposes:
* **Bot Functionality**: Executing slash commands, custom user commands, role verification workflows, and automated responses.
* **Moderation & Security**: Detecting duplicate message spam, tracking ghost pings, logging timeout updates, and recording message deletions in server-configured audit channels.
* **System Diagnostics**: Monitoring bot stability and fixing errors.

We **do not** sell, rent, trade, or share user data with third parties.

---

## 3. Data Retention & Deletion

* **System Logs**: Operational log files are stored securely on the host system and automatically deleted after **14 days**.
* **User Command Data**: User-created commands and associated media files persist until deleted by the user or a server administrator.
* **Data Removal Rights**: 
  * Users can delete their custom commands directly through the bot's command interfaces or request a full data wipe.
  * You may request full removal of your stored data by contacting the bot administrator. Upon request, all associated command files and media will be permanently deleted from the host storage.

---

## 4. Third-Party Services

Komaru Bot connects to:
* **Discord API**: To receive events and send messages in accordance with [Discord's Terms of Service](https://discord.com/terms) and [Developer Policy](https://discord.com/developers/docs/policies-and-agreements/developer-policy).
* **GitHub API**: (Optional) To fetch public repository issue and pull request details when GitHub references are mentioned in chat.

---

## 5. Security

We take reasonable precautions to protect stored data from unauthorized access, modification, or disclosure. Access to local bot files and log directories is restricted to authorized bot maintainers.

---

## 6. Updates to This Policy

We may update this Privacy Policy from time to time. Any changes will be reflected in this file with an updated "Last Updated" date.

---

## 7. Contact Us

If you have any questions or data deletion requests regarding this Privacy Policy, please contact the bot owner via Discord or open an issue on the repository.
