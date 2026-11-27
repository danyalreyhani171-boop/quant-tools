#!/usr/bin/env node
/**
 * Applies db/schema.sql to DATABASE_URL. Idempotent — safe to re-run.
 *
 * Usage: DATABASE_URL=postgres://... npm run db:init
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "db", "schema.sql");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const needsSsl =
  /\bsslmode=require\b/.test(connectionString) || process.env.DATABASE_SSL === "true";

const client = new pg.Client({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

try {
  const schema = await readFile(schemaPath, "utf8");
  await client.connect();
  await client.query(schema);
  console.log("Schema applied.");
} catch (error) {
  console.error("Could not apply the schema:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
