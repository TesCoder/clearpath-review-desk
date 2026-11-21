// Applies db/schema.sql. Idempotent, so it runs before every build.
// Usage: node --env-file-if-exists=.env.local scripts/migrate.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
if (!url) {
  // On the host a missing database is a broken deploy: fail the build here
  // instead of publishing pages that cannot load. Locally it is only a skip.
  if (process.env.NETLIFY) {
    console.error("migrate: DATABASE_URL is not set. The site cannot run without it.");
    process.exit(1);
  }
  console.warn("migrate: DATABASE_URL is not set, skipping the schema step.");
  process.exit(0);
}

const isLocal = /@?(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, {
  ssl: isLocal ? false : "require",
  max: 1,
  onnotice: () => {},
});

try {
  const schema = readFileSync(
    fileURLToPath(new URL("../db/schema.sql", import.meta.url)),
    "utf8",
  );
  await sql.unsafe(schema);
  console.log("migrate: schema and reference data are up to date.");
} finally {
  await sql.end();
}
