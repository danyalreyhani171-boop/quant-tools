#!/usr/bin/env node
/**
 * Applies the schema to DATABASE_URL. Idempotent — safe to re-run.
 *
 * The app also applies the schema automatically on first use, so this is only
 * needed if you want to set the database up ahead of the first request.
 *
 * Usage: DATABASE_URL=postgres://... npm run db:init
 */
import pg from "pg";
import { SCHEMA_SQL } from "../src/lib/schema.ts";

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
  await client.connect();
  await client.query(SCHEMA_SQL);
  console.log("Schema applied.");
} catch (error) {
  console.error("Could not apply the schema:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
