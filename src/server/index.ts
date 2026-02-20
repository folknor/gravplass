import { watchFile } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import Archiver from "archiver";
import { nanoid } from "nanoid";
import { config } from "./config";

const DIST_DIR = "./dist/client";
const HOUR_MS: number = 60 * 60 * 1000;
const RATE_LIMIT_WINDOW: number = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX: number = 30; // 30 requests per minute

const rateLimitMap: Map<string, { count: number; resetAt: number }> = new Map();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function hashPassword(password: string): string {
  const hash = Bun.hash(password);
  return hash.toString(16).slice(0, 12);
}

async function getDirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirSize(fullPath);
      } else {
        const fileStat = await stat(fullPath);
        total += fileStat.size;
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return total;
}

async function cleanupExpiredShares(): Promise<void> {
  const ttlMs = config.share_ttl_days * 24 * HOUR_MS;
  const now = Date.now();
  const uploadsDir = join(config.data_dir, "uploads");

  try {
    const buckets = await readdir(uploadsDir);
    for (const bucket of buckets) {
      const bucketPath = join(uploadsDir, bucket);
      const shares = await readdir(bucketPath);

      for (const shareId of shares) {
        const sharePath = join(bucketPath, shareId);
        try {
          const shareStat = await stat(sharePath);
          if (now - shareStat.mtimeMs > ttlMs) {
            await rm(sharePath, { recursive: true });
            console.log(`Deleted expired share: ${bucket}/${shareId}`);
          }
        } catch {
          // Skip if can't stat
        }
      }

      // Remove empty bucket folders
      const remaining = await readdir(bucketPath);
      if (remaining.length === 0) {
        await rm(bucketPath);
      }
    }
  } catch {
    // uploads dir doesn't exist yet
  }
}

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
  // /d/:bucket/:shareId
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3) {
    return new Response("Invalid path", { status: 400 });
  }

  const bucket = parts[1];
  const shareId = parts[2];
  if (!(bucket && shareId)) {
    return new Response("Invalid path", { status: 400 });
  }

  const shareDir = join(config.data_dir, "uploads", bucket, shareId);
  const burnFile = join(shareDir, ".burn");

  try {
    const allFiles = await readdir(shareDir);
    const files = allFiles.filter((f) => f !== ".burn");
    if (files.length === 0) {
      return new Response("Not Found", { status: 404 });
    }

    // Check if burn-after-download is enabled
    const shouldBurn = await Bun.file(burnFile).exists();

    let response: Response;

    // Single file - serve directly
    if (files.length === 1 && files[0]) {
      const filename = files[0];
      const file = Bun.file(join(shareDir, filename));
      response = new Response(file, {
        headers: {
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          "Content-Type": file.type || "application/octet-stream",
        },
      });
    } else {
      // Multiple files - serve as zip
      const archive = Archiver("zip", { zlib: { level: 5 } });
      for (const filename of files) {
        archive.file(join(shareDir, filename), { name: filename });
      }
      archive.finalize();

      response = new Response(archive as unknown as BodyInit, {
        headers: {
          "Content-Disposition": `attachment; filename="${shareId}.zip"`,
          "Content-Type": "application/zip",
        },
      });
    }

    // Delete after serving if burn flag is set
    if (shouldBurn) {
      setTimeout(() => {
        rm(shareDir, { recursive: true }).catch(() => {});
      }, 1000);
    }

    return response;
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

async function handleUpload(req: Request): Promise<Response> {
  const password = req.headers.get("X-Password");

  if (!(password && config.passwords.includes(password))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files");

  if (files.length === 0) {
    return new Response("No files provided", { status: 400 });
  }

  // Calculate upload size
  let uploadSize = 0;
  for (const file of files) {
    if (file instanceof File) {
      uploadSize += file.size;
    }
  }

  // Check bucket quota
  const bucket = hashPassword(password);
  const bucketDir = join(config.data_dir, "uploads", bucket);
  const currentSize = await getDirSize(bucketDir);
  const maxBytes = config.max_bucket_size_mb * 1024 * 1024;

  if (currentSize + uploadSize > maxBytes) {
    const availableMb = Math.floor((maxBytes - currentSize) / 1024 / 1024);
    return new Response(`Quota exceeded. ${availableMb}MB available.`, {
      status: 413,
    });
  }

  // Save files
  const shareId = nanoid(8);
  const shareDir = join(bucketDir, shareId);
  await mkdir(shareDir, { recursive: true });

  for (const file of files) {
    if (file instanceof File) {
      const filePath = join(shareDir, file.name);
      await Bun.write(filePath, file);
    }
  }

  // Create burn marker if requested
  const burn = formData.get("burn");
  if (burn === "true") {
    await Bun.write(join(shareDir, ".burn"), "");
  }

  const url = `/d/${bucket}/${shareId}`;
  return Response.json({ url });
}

async function handleQuota(req: Request): Promise<Response> {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return new Response("Too many requests", { status: 429 });
  }

  const password = req.headers.get("X-Password");
  if (!(password && config.passwords.includes(password))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const bucket = hashPassword(password);
  const bucketDir = join(config.data_dir, "uploads", bucket);
  const used = await getDirSize(bucketDir);
  const max = config.max_bucket_size_mb * 1024 * 1024;
  return Response.json(
    { used, max, available: max - used },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}

// Start cleanup timer (runs every hour)
setInterval(() => {
  cleanupExpiredShares().catch((err: unknown) => {
    console.error("Cleanup error:", err);
  });
}, HOUR_MS);

// Run cleanup on startup
cleanupExpiredShares().catch((err: unknown) => {
  console.error("Initial cleanup error:", err);
});

const server: ReturnType<typeof Bun.serve> = Bun.serve({
  port: config.port,
  maxRequestBodySize: config.max_file_size_mb * 1024 * 1024,
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

    // Quota check - requires password
    if (url.pathname === "/api/quota" && req.method === "GET") {
      return handleQuota(req);
    }

    // Serve frontend
    return serveStatic(url.pathname);
  },
});

console.log(`Server running at http://localhost:${String(server.port)}`);

// Watch for deploy restart signal
const restartFlag = join(homedir(), ".restart-requested");
watchFile(restartFlag, { interval: 5000 }, (curr, prev) => {
  if (curr.ino !== 0 && prev.ino === 0) {
    console.log("Restart requested, shutting down...");
    server.stop();
    process.exit(0);
  }
});
