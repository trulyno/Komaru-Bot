# Request Intents

## Application Details

**What does your application do? Please be as detailed as possible, and feel free to include links to image or video examples.**

Komaru the Cat is a multi-purpose community management, moderation, and utility Discord bot tailored for gaming, modding (specifically GregTech and Star Technology), and general Discord communities. It combines essential server administration tools with community utilities and interactive minigames:

1. **Automated Moderation & Server Protection**: Protects servers by detecting and mitigating cross-channel duplicate spam raids in real-time, catching and warning against ghost pings, and tracking native member timeouts to a private moderation audit log channel.
2. **Player Progression & Milestone Verification**: Implements a structured progression verification workflow (e.g., Stargate milestone gate runs like CSG, ASG, DSG) where players submit verification requests via Discord modals and verifiers inspect and award server progression roles.
3. **Private Support Ticket System**: Provides modal-based ticket creation (`/ticket`), automatically organizing ticket channels under dedicated server categories, managing private permissions for ticket openers and support staff, and tracking channel activity for inactivity reminders.
4. **Dynamic User-Scripted Command Engine**: A custom community macro system allowing server members to script custom commands with variable interpolation, math evaluation, conditional branching, pipelines, and rich embeds.
5. **Technical Modding & Developer Utilities**: Provides seamless technical discussions by passively expanding inline GitHub issue/PR references (e.g., `owner/repo#123` or configured aliases like `gt#123`), balancing GregTech chemical equations (`/balance`), and validating thread support templates.
6. **Interactive Minigames & Community Features**: Features chat-based minigames such as "Pass the Tuna" (a state-machine hot-potato minigame), the "Larp Jar" (tracking slang occurrences with escalating dynamic silences), and probabilistic cat-themed chat reactions.

**Do you have a public Privacy Policy telling your users about their data usage?**

Yes

---

## Privileged Gateway Intents

**Which intents are you applying for, if any? (Leave blank if you do not need any of these)**

Server Members Intent - yes

Presence Intent - no

Message Content Intent - yes

---

### Server Members Intent

**Why do you need the Guild Members intent?**
_Please describe the feature you're building using this intent with as much detail as possible._

The Server Members (`GuildMembers`) intent is required for Komaru the Cat to power its moderation audit tracking, player milestone role verification, and server permission synchronization.

1. **Real-Time Moderation Audit Logging (`guildMemberUpdate`)**:
    - The bot monitors `guildMemberUpdate` gateway events in real time to detect when a member is timed out or untimed via Discord's native timeout feature (`communicationDisabledUntilTimestamp`).
    - When a moderator applies or lifts a timeout directly in Discord's native UI, Discord dispatches `guildMemberUpdate`. The bot processes this event and automatically posts a detailed audit record to the designated moderation audit log channel (`#mod-audit-log`), ensuring the server moderation team maintains full visibility of disciplinary actions.
    - _Why slash commands cannot replace this_: Timeouts applied manually by moderators through Discord's context menus or user profile sheets do not trigger slash commands. Without the `GuildMembers` intent, the bot never receives `guildMemberUpdate` events, leaving moderation logs unable to record manual timeouts.

2. **Milestone Progression Role Verification (`/complete_verification`)**:
    - In our community's Stargate progression system, members submit achievement runs via the `/verify` modal. Authorized verifiers then execute `/complete_verification user:@Member role:CSG`.
    - The bot must fetch the member object (`guild.members.fetch(userId)`), verify that the member is in the guild, validate their current roles against role hierarchies, and award the appropriate progression milestone role (`member.roles.add(role)`).

3. **Dynamic Role-Based Permission Validation**:
    - The bot dynamically checks member permissions against configured administrative and moderator roles (`canModerate`, `canAdministrate`, and `isVerifier`) across all moderation commands (`/timeout`, `/untimeout`, `/ban`, `/warn`, `/set_audit_log_channel`).
    - The intent ensures that member role states are accurately resolved and cached so unauthorized users cannot execute privileged moderation actions.

4. **Support Ticket Channel Permission Overwrites**:
    - When private ticket channels are created via the ticket system, the bot dynamically fetches member and role data to apply strict channel permission overwrites, granting view/send permissions exclusively to the ticket creator and designated support roles while keeping the channel hidden from other guild members.

#### Actual Examples of How Guild Members Intent is Used:

- **Example 1: Real-Time Timeout Audit Logging (`guildMemberUpdate`)**
    1. A moderator right-clicks a user in Discord and selects "Timeout" for 60 minutes.
    2. The bot receives the `guildMemberUpdate` event with the updated `communicationDisabledUntilTimestamp`.
    3. The bot extracts the member ID, detects the timeout transition, and immediately posts an embed to `#mod-audit-log`:
        - **Title**: `Timeout updated`
        - **User**: `<@UserId>`
        - **Action**: `A member was timed out.`
        - **Timestamp**: `<Current Timestamp>`
- **Example 2: Milestone Verification Role Granting (`/complete_verification`)**
    1. A player submits a gate run proof in the verification channel.
    2. A verifier reviews the evidence and runs `/complete_verification user:@Explorer role:Central Stargate (CSG)`.
    3. The bot fetches the target `GuildMember` via `guild.members.fetch(targetUser.id)`, verifies the verifier's authority, assigns the `CSG` role, and responds with a success embed announcing the milestone.
- **Example 3: Dynamic Permission Resolution (`canModerate`)**
    1. A user attempts to run `/timeout` or `/warn`.
    2. The bot inspects `interaction.member.roles.cache` against the guild's configured moderator role ID/name to confirm authorization before allowing any moderation action to proceed.

**Please provide links to screenshots and/or videos that demonstrate your use case**
_For each selected intent, we require you to provide a link to screenshots or video that demonstrates your desired use case working within a Discord server._

- **Demo 1: Real-Time Timeout Audit Logging via `guildMemberUpdate`**:
  Demonstrates a moderator applying a native timeout to a member, and the bot immediately posting a corresponding log entry in the `#mod-audit-log` channel.
  Link: `[INSERT LINK HERE: e.g. https://youtu.be/... or https://imgur.com/...]`

- **Demo 2: Milestone Verification & Role Assignment (`/complete_verification`)**:
  Demonstrates a verifier running `/complete_verification` to fetch a guild member and grant them their milestone progression role.
  Link: `[INSERT LINK HERE: e.g. https://youtu.be/... or https://imgur.com/...]`

**Are you storing any API Data off-platform (outside of Discord)?**

No. All member data is processed strictly in-memory during gateway event handling and role assignment. No Discord member data is sent to external databases, third-party analytics services, or off-platform servers.

---

### Message Content Intent

**Can users opt-out of having their message content data tracked?**

Yes. Administrators can restrict the bot's channel view and message permissions in channels where bot functionality is not desired. Furthermore, Komaru the Cat does not store message history or log content off-platform; message data is evaluated ephemerally in-memory and discarded immediately after processing.

**Are you storing message content data off-platform (outside of Discord)?**

No. Message content is processed purely in-memory upon receiving gateway events. No message content is written to external databases, remote clouds, or third-party storage. The only persistence occurs locally within the server's private Discord audit log channel when a message deletion or ghost ping is detected for moderation review.

**Will the message content data be used to train machine learning or AI Models?**

No. Message content is exclusively used for pattern matching, spam mitigation, and command trigger routing. It is never used, shared, or retained for machine learning or AI model training.

**Why do you need the Message Content intent?**
_Please describe the feature you're building using this intent with as much detail as possible._

The Message Content (`MessageContent`) intent is vital for Komaru the Cat's automated moderation security, passive technical reference expansion, and dynamic community-defined macro execution. These features cannot be implemented using Discord Slash Commands:

1. **Automated Cross-Channel Duplicate Spam & Raid Mitigation (`auditLog`)**:
    - The bot passively inspects incoming messages across channels within a short sliding window (`DUPLICATE_SPAM_WINDOW_MS = 5000ms`).
    - When malicious accounts or compromised tokens broadcast identical text or attachment fingerprints across multiple channels (a raid or spam attack), the bot detects the duplicate pattern, automatically deletes the spam messages across all affected channels, and sends an alert to the moderation audit channel.
    - _Why slash commands cannot do this_: Spammers and raiders do not trigger slash commands. Automated spam defense requires passively evaluating `message.content` upon `messageCreate` across channels.

2. **Anti-Ghost Ping Detection & Anti-Harassment (`auditLog`)**:
    - When a user sends a message containing user or role mentions and immediately deletes it, the recipient receives a ghost notification with no visible message, which is frequently used for harassment.
    - The bot buffers messages containing mentions in memory (`pendingGhostPings`) for 15 seconds. If a buffered message is deleted (`messageDelete`), the bot detects the ghost ping, warns the channel, and logs the author and deleted message content to the moderation audit channel.
    - _Why slash commands cannot do this_: Requires reading `message.content` and mentions on `messageCreate` and matching against `messageDelete`.

3. **Passive Contextual GitHub Reference Expander (`githubReferences`)**:
    - In modding and developer channels (e.g. GregTech and modpack support), community members discuss issues and pull requests inline using standard notation like `owner/repo#123` or short prefixes like `gt#123`.
    - The bot passively scans message text for these patterns, queries the GitHub REST API, and renders an embed preview containing the issue title, status (open/closed), author, and link.
    - _Why slash commands cannot do this_: Requiring users to stop typing and invoke a slash command for every issue reference would severely disrupt conversational flow in technical channels.

4. **Dynamic User-Scripted Command Engine & Custom Macros (`userCommands`, `legacyTags`)**:
    - Community members create and maintain hundreds of custom macro commands and tags (e.g., `%t <tagname>`) using a domain-specific scripting language that supports variable interpolation, math evaluation, random choice, conditional branching, and embeds.
    - _Why slash commands cannot do this_: Discord limits slash commands to a maximum of 100 commands per guild. Furthermore, slash commands cannot be dynamically created, edited, or deleted on-the-fly by community members at runtime without bot restarts or Discord REST synchronization rate limits.

5. **Real-Time Interactive Text Minigames & Community Persona (`passTheTuna`, `larpJar`, `catReactions`)**:
    - **Pass the Tuna**: A real-time reaction minigame where users pass or take a virtual fish by typing `pass` or `take` during active rounds, calculating tuna freshness, grace periods, and idle timeouts.
    - **Larp Jar**: A community filter that detects occurrences of specific slang variants ("larp"), increments the server fine jar, enforces escalating dynamic silences, and purges messages from silenced users attempting to bypass silences.
    - **Cat Persona Reactions**: Probabilistically detects conversational keywords (`nya`, `meow`, `purr`, bot mentions) to post contextual cat reactions and emojis.

#### Actual Examples of How Message Content Intent is Used:

- **Example 1: Cross-Channel Duplicate Spam Mitigation**
    1. A compromised user pastes `Join for free nitro: https://phishing-site.example` into `#general`, `#trading`, and `#off-topic` within 3 seconds.
    2. The bot compares the message content fingerprint and timestamps across channels.
    3. The bot automatically deletes all 3 spam messages and posts an alert to `#mod-audit-log`:
        - **Title**: `Duplicate message spam detected`
        - **User**: `<@SpammerId>`
        - **Channels**: `#general, #trading, #off-topic`
        - **Content**: `Join for free nitro: https://phishing-site.example`
- **Example 2: Anti-Ghost Ping Protection**
    1. A user posts `Hey @target check this out` in `#general` and deletes it 2 seconds later.
    2. The bot catches the `messageDelete` event, matches the message ID against `pendingGhostPings`, and extracts the original content and mentions.
    3. The bot posts a warning in `#general` (`Ghost pings are not allowed here...`) and logs the author and deleted message content to `#mod-audit-log`.
- **Example 3: Inline GitHub Issue Reference Expansion**
    1. A developer writes: `We solved that recipe bug in gt#489, please update your modpack.`
    2. The bot detects the `gt#489` pattern, matches the configured prefix `gt -> GregTechCEu/GregTech-Modern`, fetches issue 489 from GitHub, and replies with a rich embed displaying the issue title, status, and direct link.
- **Example 4: User-Scripted Macro & Tag Execution**
    1. A user types `%t multiblocks` or `!guide macerator`.
    2. The bot parses the message content prefix and arguments, evaluates the script stored in `data/user_commands/`, and returns the formatted community guide with embedded media attachments.
- **Example 5: "Pass the Tuna" Interactive Minigame**
    1. An active game of Pass the Tuna is running in `#fun-zone`.
    2. A player types `take` to grab the tuna.
    3. The bot parses the message, validates that the player didn't violate the grace period, updates the game state, and announces the current tuna holder and deliciousness rating.

**Please provide links to screenshots and/or videos that demonstrate your use case**
_For each selected intent, we require you to provide a link to screenshots or video that demonstrates your desired use case working within a Discord server._

- **Demo 1: Anti-Spam & Ghost Ping Protection**:
  Demonstrates cross-channel duplicate message spam being automatically deleted and logged, or a ghost ping being caught and recorded in `#mod-audit-log`.
  Link: `[INSERT LINK HERE: e.g. https://youtu.be/... or https://imgur.com/...]`

- **Demo 2: Inline GitHub Reference Expander**:
  Demonstrates a user typing `gt#<issue_number>` in chat and the bot automatically embedding the GitHub issue details inline.
  Link: `[INSERT LINK HERE: e.g. https://youtu.be/... or https://imgur.com/...]`

- **Demo 3: User Command DSL & Custom Macro System**:
  Demonstrates a user executing a custom macro (`!command` or `%t <tagname>`) and the bot evaluating the script and returning the response.
  Link: `[INSERT LINK HERE: e.g. https://youtu.be/... or https://imgur.com/...]`

- **Demo 4: Real-Time Minigames (Pass the Tuna / Larp Jar)**:
  Demonstrates players typing `pass` or `take` during Pass the Tuna, or the Larp Jar tracking slang words and enforcing escalating silences.
  Link: `[INSERT LINK HERE: e.g. https://youtu.be/... or https://imgur.com/...]`
