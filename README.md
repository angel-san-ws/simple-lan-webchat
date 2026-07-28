# LAN WebChat

A local-network chat app: anyone on the same Wi-Fi/LAN can open it in a browser, pick a display
name, see who else is online, and start 1:1 or group chat sessions — no accounts, no internet
required.

- **Frontend:** Angular 21 (standalone, zoneless, signals) + PrimeNG 21
- **Backend:** Node.js + Express + Socket.IO (presence + real-time messaging, in-memory only)

## Project layout

```
lan-webchat/
  client/   Angular + PrimeNG frontend
  server/   Node/Express/Socket.IO backend
```

## Requirements

- Node.js 22.12+ (or 20.19+ / 24+)
- npm

## 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

## 2. Run for real LAN use (recommended)

This builds the Angular app and has the Node server serve it on a single port, so every device
on the LAN just needs one URL.

```bash
# Build the Angular app
cd client
npm run build

# Start the server (serves the API, Socket.IO, and the built app)
cd ../server
npm run build
npm start
```

The server listens on `http://0.0.0.0:3000`. Find the host machine's LAN IP:

- **Windows:** `ipconfig` → look for "IPv4 Address" (e.g. `192.168.1.23`)
- **macOS/Linux:** `ifconfig` or `ip addr`

Then, on any device connected to the same network, open:

```
http://<host-ip>:3000
```

e.g. `http://192.168.1.23:3000`. Everyone enters a display name and can start chatting.

To use a different port: `PORT=4000 npm start`.

## 3. Development mode (live reload)

Run backend and frontend separately. The Angular dev server proxies `/socket.io` and `/api` to
the backend (see `client/proxy.conf.json`), so it all still looks same-origin to the browser.

```bash
# Terminal 1 — backend
cd server
npm run dev

# Terminal 2 — frontend
cd client
npm start
```

Open `http://localhost:4200`. For other devices to reach the Angular dev server itself during
development, you'd need to bind it to `0.0.0.0` and adjust `allowedHosts`; the single-port
production flow above is the simplest way to test from multiple LAN devices.

## How it works

- Each browser tab generates a persistent `clientId` (stored in `localStorage`) so refreshing the
  page keeps your identity and chat history for as long as the server process stays up.
- Presence (who's online) and chat sessions/messages are tracked **in memory only** on the
  server — restarting the server clears all state.
- Any online user can select one or more other online users and start a new chat session
  (1:1 or group). Selecting the same set of people again reuses the existing session instead of
  creating a duplicate.
- Firewalls: make sure the host machine allows inbound connections on the port used (3000 by
  default) for other LAN devices to reach it.
