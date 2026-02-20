import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

async function getDirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirSize(fullPath);
      } else {
        const s = await stat(fullPath);
        total += s.size;
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return total;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

const uploadsDir = join(config.data_dir, "uploads");

let shares = 0;
let buckets = 0;

try {
  const bucketDirs = await readdir(uploadsDir);
  buckets = bucketDirs.length;
  for (const bucket of bucketDirs) {
    const entries = await readdir(join(uploadsDir, bucket));
    shares += entries.length;
  }
} catch {
  // No uploads yet
}

const totalSize = await getDirSize(uploadsDir);

console.log(`shares: ${String(shares)} across ${String(buckets)} bucket${buckets === 1 ? "" : "s"}, ${formatBytes(totalSize)} on disk`);
