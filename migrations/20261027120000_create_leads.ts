import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('leads', (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('org_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('RESTRICT');
    table.string('name', 150).notNullable();
    table.string('email', 255).nullable();
    table.string('phone', 20).nullable();
    table.string('source', 100).nullable();
    table.string('status', 20).notNullable().defaultTo('new');
    table.string('notes', 1000).nullable();
    table
      .bigInteger('customer_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('customers')
      .onDelete('SET NULL');
    table.specificType('created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    table.specificType(
      'updated_at',
      'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    );
    table.specificType('deleted_at', 'TIMESTAMP NULL DEFAULT NULL');
    table.index(['org_id', 'deleted_at', 'status'], 'idx_leads_org_status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('leads');
}
