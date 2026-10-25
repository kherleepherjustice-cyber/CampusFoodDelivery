# Campus Food Delivery — Shared Online Database Edition

This edition keeps the FUDMA Campus Food Delivery menu, expandable category layout, cart, student order tracking, staff order workflow, feedback, and adds the PWA files from the existing CampusFoodDelivery project.

## Important: how data is shared

Orders are stored in **Supabase**, not in a local `orders.json` file. Your local computer/server and your Render deployment must both use the **same Supabase project**. Then orders placed from the local network (while it has internet access) and orders placed on the public Render URL appear in the same database.

A local-only `orders.json` file cannot automatically sync with Render. Render's local filesystem should not be treated as permanent shared storage.

## One-time Supabase setup

1. Create/open your Supabase project at https://supabase.com/.
2. In **SQL Editor**, run the full `supabase-schema.sql` file included here.
3. In Supabase project settings, copy the project URL and the **service-role/secret server key**.
4. Copy `.env.example` to `.env` on your own computer. Fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Never put the service-role key in `public/app.js`, `public/index.html`, screenshots, or GitHub. `.env` is excluded by `.gitignore`.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. For another device on the same Wi-Fi/hotspot, open `http://YOUR-COMPUTER-IP:3000`. The local computer needs internet access for orders to save to Supabase.

## Update the existing Render + GitHub deployment

1. Back up your current GitHub repository.
2. Replace the project files with the files in this package (keep the project root containing `package.json` and `server.js`).
3. Commit and push to the same GitHub repository connected to Render.
4. In Render → your existing Web Service → **Environment**, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` with the same values used locally.
5. Keep build command `npm install` and start command `npm start`, then redeploy.
6. Check `https://YOUR-RENDER-SERVICE.onrender.com/api/health`. It should return `{"ok":true,"databaseConfigured":true}`.

## Verify sharing

1. Place a test order using the public Render URL.
2. Open the Staff tab on the local app and sign in with an authorized staff matric number.
3. Confirm the same order appears. Then place an order locally and confirm it appears on Render's staff view.
4. If either app says the online database is not configured, check the environment variables on that specific server.

## Staff demo IDs

- ENG/2024/32910
- ENG/2025/39685
- ENG/2024/32421
- ENG/2024/32113
- ENG/2024/31583
- ENG/2024/31983
- ENG/2024/31925
- ENG/2024/35041
- ENG/2024/32014
- ENG/2024/31750
- ENG/2024/32102

## Limits and safety

- **Offline mode:** the app shell can be cached, but an order cannot reach the shared database without internet. This version does not promise automatic offline order queueing; do not tell customers an offline order was saved online.
- Staff access is a classroom/demo matric-number check, not production-grade authentication. Add passwords and secure sessions before using sensitive or real payment information.
- Online payment is only a payment-type choice in this project; there is no verified live payment gateway integration.
