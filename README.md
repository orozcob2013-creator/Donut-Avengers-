# Donut Avengers

A starter web app for **virtual Donut SMP-style coins**. It includes server-side account creation/login, a SQLite wallet, a server-side virtual coinflip, and manual deposit/withdrawal request records.

## Run it on your computer

1. Install Node.js 20 or newer.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Set a long random session secret:
   - macOS/Linux: `export SESSION_SECRET="$(openssl rand -hex 32)"`
   - Windows PowerShell: `$env:SESSION_SECRET = "paste-a-long-random-secret-here"`
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Important limitations

- This is a starter/demo, not a production-ready money or gambling platform.
- All coins are virtual. Do not accept real-money deposits or promise cash payouts.
- Deposit requests are only stored as pending requests. The app does **not** verify `/pay` commands, read Minecraft chat, or automatically credit deposits.
- Withdrawal requests reserve the requested virtual coins and require a trusted manual review. No Minecraft transfer is sent.
- There is no admin dashboard yet. Do not deploy this publicly with real users or valuable balances until you add admin review tools, CSRF protection, a persistent production session store, HTTPS, backups, monitoring, and security testing.
- The session secret is required and must remain private.
