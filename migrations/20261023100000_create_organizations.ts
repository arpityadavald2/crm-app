import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('organizations', (table) => {
    table.bigIncrements('id');
    table.string('name', 150).notNullable();
    table.string('gstin', 15).nullable();
    table.string('state_code', 2).nullable().comment('GST state code, e.g. 29 = Karnataka');
    table.specificType('created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    table.specificType(
      'updated_at',
      'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('organizations');
}
