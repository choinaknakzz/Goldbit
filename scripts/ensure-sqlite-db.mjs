import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const projectRoot = process.cwd();
const envPath = join(projectRoot, ".env");
const schemaDir = join(projectRoot, "prisma");

const readDatabaseUrl = () => {
  if (!existsSync(envPath)) {
    return "file:./dev.db";
  }

  const env = readFileSync(envPath, "utf8");
  const line = env
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith("DATABASE_URL="));

  if (!line) {
    return "file:./dev.db";
  }

  return line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
};

const resolveSqlitePath = (databaseUrl) => {
  if (!databaseUrl.startsWith("file:")) {
    return undefined;
  }

  const rawPath = databaseUrl.slice("file:".length);
  return isAbsolute(rawPath) ? rawPath : resolve(schemaDir, rawPath);
};

const sqlitePath = resolveSqlitePath(readDatabaseUrl());

if (sqlitePath && !existsSync(sqlitePath)) {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const db = new DatabaseSync(sqlitePath);
  db.close();
  console.info(`Created SQLite database: ${sqlitePath}`);
}
