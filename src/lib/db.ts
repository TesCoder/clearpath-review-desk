import "server-only";
import postgres from "postgres";

// One client per server instance. Every query in this app goes through the
// tagged template below, which sends values as parameters, never as SQL text.
const globalForDb = globalThis as unknown as { __sql?: postgres.Sql };

function connect(): postgres.Sql {
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  const isLocal = /@?(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, {
    ssl: isLocal ? false : "require",
    max: 5,
    idle_timeout: 20,
    // Hosted Postgres is reached through a connection pooler, which does not
    // keep prepared statements between queries.
    prepare: false,
    onnotice: () => {},
  });
}

export function db(): postgres.Sql {
  if (!globalForDb.__sql) {
    globalForDb.__sql = connect();
  }
  return globalForDb.__sql;
}

/** The pool, or a transaction: a read inside a transaction sees what that transaction has locked. */
export type Executor = postgres.Sql | postgres.TransactionSql;
