# Custom Faan Mahjong — Free Online Multiplayer v2.5

Private 4-player Mahjong rooms for the Android app. Cloudflare Workers + a SQLite-backed Durable Object keep the wall, each player's private hand, claim decisions, and scoring on the server.

## Deploy FREE to Cloudflare

**[Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/drybones757/mahjong-multiplayer-server)**

1. Click the link, sign in to or create a **free Cloudflare account**, and authorize GitHub if prompted.
2. Choose the **Free** Workers plan. The repo has `wrangler.jsonc` at its root; Cloudflare will provision the Durable Object named `ROOMS`.
3. Leave the build command blank (this is plain JavaScript); deploy command: `npx wrangler deploy`. Select Deploy and let the build finish.
4. Open your generated `https://YOUR-NAME.workers.dev/health` URL. It should return `"multiplayer":"ready"`.
5. In Mahjong v2.5's online menu, put the same `https://YOUR-NAME.workers.dev` URL in the server field on every device. A room code then connects players together.

If the one-click link does not work, use **Cloudflare dashboard → Workers & Pages → Create application → Import GitHub repository → `drybones757/mahjong-multiplayer-server`**, then select Save and Deploy.

## Match rules

- Host occupies Player 1; guests choose seats 2–4. Empty seats can be filled with bots, or 4 humans can be required.
- The server owns shuffled wall and hands and privately validates Hu, Chow, Pong, Kong, and credit settlement.
- Custom claim window: 1–60 s in 0.5-second increments, 4 s default.
- Every discard creates a window for all other seats, whether a claim is possible or not. A player can claim or Pass. Claims are **held**, then ranked by normal Mahjong priority, not network response speed. The window ends when all 3 seats respond or the deadline expires.
- Other clients never receive concealed hands, private claim availability, or interim responses.
- Online games disallow Admin Hu, admin overrides, live AI Debug, Live Coach, and AI hints. Bots are allowed to use their own AI. Post-match Game Review is available **after the full match ends**.

## Notes

For family use, the Workers free tier should be a practical starting point, but resource and usage limits apply. No real-money wagering. Room tokens are private; don't publish them. The server has passed local room and full-match tests, but **public deployment and real-device play still need to be verified**. To check whether it is live, load the public `/health` endpoint.
