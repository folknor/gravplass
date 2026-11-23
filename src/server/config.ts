import { readFileSync, watch } from "node:fs";
import process from "node:process";
import { parse } from "toml";
import * as v from "valibot";

interface Config {
  port: number;
  data_dir: string;
  passwords: string[];
  max_file_size_mb: number;
  share_ttl_days: number;
  max_bucket_size_mb: number;
}

const configPath: string = process.env["CONFIG_PATH"] ?? "./config.toml";

const ConfigSchema = v.object({
  port: v.number(),
  data_dir: v.string(),
  passwords: v.array(v.string()),
  max_file_size_mb: v.number(),
  share_ttl_days: v.number(),
  max_bucket_size_mb: v.number(),
});

function loadConfig(): Config {
  return v.parse(ConfigSchema, parse(readFileSync(configPath, "utf-8")));
}

export let config: Config = loadConfig();

// Watch for changes and reload
watch(configPath, (event) => {
  if (event === "change") {
    try {
      const newConfig = loadConfig();
      config = newConfig;
      console.log("Config reloaded");
    } catch (err) {
      console.error("Failed to reload config:", err);
    }
  }
});
