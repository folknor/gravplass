# Plan: Minimal File Sharing with Bun + React

## Overview

Ultra-minimal file sharing:
- **Runtime**: Bun
- **Package manager**: pnpm
- **Backend**: Bun.serve() - ~100 lines
- **Frontend**: React + Mantine dropzone
- **Auth**: Stateless - password sent with each upload
- **Downloads**: Direct file serving, no UI

## What's In

- Upload page with drag & drop (React + Mantine)
- Password check on upload (stateless, no sessions)
- Direct download links (no auth needed)
- Local file storage
- TOML config for passwords

## What's Out

- Everything else (NestJS, Prisma, S3, ClamAV, Docker, i18n, admin, share management, sessions, etc.)

## Directory Structure

```
/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── index.html
├── config.toml
├── data/uploads/
├── src/
│   ├── server/
│   │   ├── index.ts      # Bun.serve() entry (~100 lines)
│   │   └── config.ts     # Load TOML
│   └── client/
│       ├── main.tsx
│       ├── App.tsx       # Upload UI only
│       └── Dropzone.tsx
└── dist/client/
```

## Config

```toml
# config.toml
port = 3000
data_dir = "./data"
passwords = ["password1", "password2", "password3"]
```

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/*` | Serve React SPA |
| POST | `/api/upload` | Upload file (password in header) |
| GET | `/d/:id/:filename` | Direct download |

## Upload Flow

1. User opens page → sees dropzone
2. Drops file → prompted for password
3. File + password sent to `/api/upload`
4. Server checks password, saves file, returns link
5. User copies link `/d/abc123/file.pdf`

## Server (~100 lines)

```ts
Bun.serve({
  port: config.port,
  async fetch(req) {
    const url = new URL(req.url);

    // Download - no auth
    if (url.pathname.startsWith("/d/")) {
      const [, , id, ...rest] = url.pathname.split("/");
      const filename = rest.join("/");
      const file = Bun.file(`${config.data_dir}/uploads/${id}/${filename}`);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Disposition": `attachment; filename="${filename}"` }
        });
      }
      return new Response("Not found", { status: 404 });
    }

    // Upload - check password
    if (url.pathname === "/api/upload" && req.method === "POST") {
      const password = req.headers.get("X-Password");
      if (!config.passwords.includes(password)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const id = nanoid(8);
      await Bun.write(`${config.data_dir}/uploads/${id}/${file.name}`, file);
      return Response.json({ url: `/d/${id}/${file.name}` });
    }

    // Serve frontend
    return serveStatic(url.pathname);
  }
});
```

## Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@mantine/core": "^7.x",
    "@mantine/dropzone": "^7.x",
    "nanoid": "^5.0.0",
    "toml": "^3.0.0"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x",
    "typescript": "^5.x",
    "@types/bun": "latest"
  }
}
```

## Scripts

```json
{
  "dev": "bun --watch src/server/index.ts",
  "build": "vite build",
  "start": "bun src/server/index.ts"
}
```

## Execution Steps

1. Delete `frontend/`, `backend/`, old configs
2. Create package.json, tsconfig.json, vite.config.ts, index.html
3. Create `src/server/index.ts` (~100 lines)
4. Create `src/client/` with minimal React upload UI
5. Create `config.toml` with passwords
6. Test: upload file, get link, download works
