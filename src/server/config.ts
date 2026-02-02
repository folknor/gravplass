import { readFileSync, watch } from "node:fs";
import process from "node:process";
import { parse } from "toml";

interface Config {
  port: number;
  data_dir: string;
  passwords: string[];
  max_file_size_mb: number;
  share_ttl_days: number;
  max_bucket_size_mb: number;
}

const configPath: string = process.env["CONFIG_PATH"] ?? "./config.toml";

function loadConfig(): Config {
  const content = readFileSync(configPath, "utf-8");
  return parse(content) as Config;
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
