import { knex } from 'knex';
import { env } from '../src/config/env';

const db = knex({
  client: 'mysql2',
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
    tableName: 'knex_migrations',
  },
});

function out(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'up': {
      const [batch, files] = await db.migrate.latest();
      out(
        files.length === 0
          ? 'Already up to date.'
          : `Batch ${batch} applied:\n  ${files.join('\n  ')}`,
      );
      break;
    }
    case 'down': {
      // Rolls back the whole LAST batch (not just one file).
      const [batch, files] = await db.migrate.rollback();
      out(
        files.length === 0
          ? 'Nothing to roll back.'
          : `Batch ${batch} rolled back:\n  ${files.join('\n  ')}`,
      );
      break;
    }
    case 'status': {
      const hasTable = await db.schema.hasTable('knex_migrations');
      if (!hasTable) {
        out('No migrations applied yet.');
        break;
      }
      const rows = await db('knex_migrations').select('name', 'batch').orderBy('id');
      out(
        rows.length === 0
          ? 'No migrations applied yet.'
          : rows.map((r) => `batch ${r.batch}  ${r.name}`).join('\n'),
      );
      break;
    }
    default:
      out('Usage: migrate.ts <up|down|status>');
      process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
