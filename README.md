# gravplass

Minimal file sharing. Upload files, get links.

## Setup

1. Install [Bun](https://bun.sh)
2. Copy config: `cp config.example.toml config.toml`
3. Edit `config.toml` and set your passwords
4. Install dependencies: `pnpm install`
5. Build frontend: `pnpm build`
6. Start server: `pnpm start`

Server runs at `http://localhost:3000`

## Development

```bash
# Terminal 1: Run server with hot reload
pnpm dev

# Terminal 2: Run Vite dev server (for frontend HMR)
pnpm exec vite
```

In dev mode, open `http://localhost:5173` for the Vite dev server which proxies API requests to the Bun server.

## Config

```toml
port = 3000
data_dir = "./data"
passwords = ["password1", "password2", "password3"]
```

## Usage

1. Open the site
2. Enter a password from your config
3. Drop files to upload
4. Copy the link - anyone with the link can download
