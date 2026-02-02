import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { config } from "./config";

const DIST_DIR = "./dist/client";

async function serveStatic(pathname: string): Promise<Response> {
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = join(DIST_DIR, filePath);

  const file = Bun.file(fullPath);
  if (await file.exists()) {
    return new Response(file);
  }

  // SPA fallback
  const indexFile = Bun.file(join(DIST_DIR, "index.html"));
  if (await indexFile.exists()) {
    return new Response(indexFile);
  }

  return new Response("Not Found", { status: 404 });
}

async function handleDownload(pathname: string): Promise<Response> {
  // /d/:id/:filename
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3) {
    return new Response("Invalid path", { status: 400 });
  }

  const id = parts[1];
  const filenameParts = parts.slice(2);
  const filename = filenameParts.join("/");

  if (!(id && filename)) {
    return new Response("Invalid path", { status: 400 });
  }

  const filePath = join(config.data_dir, "uploads", id, filename);

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Type": file.type || "application/octet-stream",
    },
  });
}

async function handleUpload(req: Request): Promise<Response> {
  const password = req.headers.get("X-Password");

  if (!(password && config.passwords.includes(password))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file && file instanceof File)) {
    return new Response("No file provided", { status: 400 });
  }

  const id = nanoid(8);
  const uploadDir = join(config.data_dir, "uploads", id);
  await mkdir(uploadDir, { recursive: true });

  const filePath = join(uploadDir, file.name);
  await Bun.write(filePath, file);

  const url = `/d/${id}/${encodeURIComponent(file.name)}`;
  return Response.json({ url });
}

const server: ReturnType<typeof Bun.serve> = Bun.serve({
  port: config.port,
  fetch(req: Request): Promise<Response> | Response {
    const url = new URL(req.url);

    // CORS for dev
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Password",
        },
      });
    }

    // Download - no auth required
    if (url.pathname.startsWith("/d/")) {
      return handleDownload(url.pathname);
    }

    // Upload - requires password
    if (url.pathname === "/api/upload" && req.method === "POST") {
      return handleUpload(req).then((response) => {
        response.headers.set("Access-Control-Allow-Origin", "*");
        return response;
      });
    }

    // Serve frontend
    return serveStatic(url.pathname);
  },
});

console.log(`Server running at http://localhost:${String(server.port)}`);
