import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

if (!existsSync(envPath)) {
  console.error("缺少 .env：请复制 .env.example 并填写 CloudBase 配置。");
  process.exit(1);
}

const values = {};

for (const line of readFileSync(envPath, "utf8").split(/\r?\n/u)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const separator = trimmed.indexOf("=");
  if (separator < 1) continue;
  const key = trimmed.slice(0, separator).trim();
  const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, "");
  values[key] = value;
}

const requiredKeys = [
  "VITE_CLOUDBASE_ENV_ID",
  "VITE_CLOUDBASE_ACCESS_KEY",
  "ADMIN_UID",
];
const missing = requiredKeys.filter((key) => {
  const value = values[key];
  return !value || value.startsWith("your-");
});

if (missing.length > 0) {
  console.error(`以下 CloudBase 配置尚未填写：${missing.join("、")}`);
  process.exit(1);
}

console.log("CloudBase 环境配置检查通过。");
