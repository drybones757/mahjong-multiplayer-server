# Mahjong multiplayer — Cloudflare free deployment

Cloudflare Workers with a SQLite-backed Durable Object. The existing Android v2.2 app can connect to the resulting HTTPS workers.dev URL in its room server field.

## Deploy without a payment card
1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up
2. In Workers & Pages select Create > import from GitHub, choose this repository.
3. Build command: `npm install`, Deploy command: `npx wrangler deploy`, root directory: `.`, output directory: blank.
4. Copy the new `https://...workers.dev` address into the app's server address field on **every** family member's phone.
5. Confirm the `...workers.dev/health` endpoint reports `multiplayer:ready`.

The code maintains the existing JSON WebSocket protocol (`/ws`), room codes, claims, and bots.
The Durable Object is a single tiny shared lobby for a family deployment. Free-plan request and compute limits apply; if exceeded, Cloudflare can reject operations until reset.
The host's room and saved state survive idle hibernation and ordinary worker restarts (state persisted in SQLite-backed Durable Object storage).

Note: Check the deployment URL and actual game behavior with two phones before inviting everyone. Avoid using this for wagers involving real money.

## Fixed claim windows (v2.3)
Each discard and added-Kong robbery opportunity waits the same configured 2.5-, 4-, or 6-second interval, whether any human is eligible to claim or not. Host chooses the timing in the lobby. Only eligible human players see Hu/Pong/Chow/Kong/optional Pass actions; silence auto-passes when the deadline expires. Responses are private and cannot advance the timer. The server never exposes which other seats could claim. Manual Hu remains required.

Online games block live AI hints and Admin Hu; post-match game review remains available.