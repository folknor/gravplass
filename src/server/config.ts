import { readFileSync } from "node:fs";
import process from "node:process";
import { parse } from "toml";

interface Config {
  port: number;
  data_dir: string;
  passwords: string[];
}

const configPath: string = process.env["CONFIG_PATH"] ?? "./config.toml";
const configContent: string = readFileSync(configPath, "utf-8");

export const config: Config = parse(configContent) as Config;
