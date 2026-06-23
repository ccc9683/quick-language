# Mobile H5 Testing

Branch: `feature/mobile-h5`

## Local LAN Startup

Start the backend:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start the frontend:

```bash
cd frontend
pnpm run dev -- --host 0.0.0.0 --port 5173
```

The frontend calls relative `/api` paths. In local development, Vite proxies `/api` to
`http://127.0.0.1:8000`, so the phone should open the frontend URL, not call the
backend URL directly.

## Find the Computer LAN IP

Linux or WSL:

```bash
hostname -I | awk '{print $1}'
```

Windows PowerShell:

```powershell
ipconfig
```

Use the IPv4 address on the same Wi-Fi/LAN as the phone.

## Phone URL

Open this URL on the phone:

```text
http://<computer-lan-ip>:5173
```

Example:

```text
http://192.168.1.23:5173
```

## Notes

- The phone and computer must be on the same LAN, and the firewall must allow port `5173`.
- Microphone APIs can require HTTPS for reliable real-phone usage. Browser support differs
  for plain HTTP LAN origins.
- Formal deployment should serve the frontend over HTTPS and reverse proxy `/api` to the
  FastAPI backend over the server-side network.
