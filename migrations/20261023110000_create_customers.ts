import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('customers', (table) => {
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
    table.string('gstin', 15).nullable();
    table.string('billing_address', 500).nullable();
    table.string('state_code', 2).nullable().comment('GST state code, taken from the GSTIN');
    table.specificType('created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    table.specificType(
      'updated_at',
      'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    );
    table.specificType('deleted_at', 'TIMESTAMP NULL DEFAULT NULL');
    // Every query filters by org_id first, so every index starts with org_id.
    table.index(['org_id', 'deleted_at', 'name'], 'idx_customers_org_name');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customers');
}
