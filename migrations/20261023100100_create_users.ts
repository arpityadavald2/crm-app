import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('org_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('RESTRICT');
    table.string('email', 255).notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('full_name', 150).notNullable();
    table.enu('role', ['owner', 'accountant', 'sales']).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.specificType('created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    table.specificType(
      'updated_at',
      'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    );
    // Login is by email, so email is unique across the whole system.
    table.unique(['email'], { indexName: 'uq_users_email' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
