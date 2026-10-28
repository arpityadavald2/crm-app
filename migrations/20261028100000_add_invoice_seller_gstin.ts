import type { Knex } from 'knex';

// Snapshot of the seller's GSTIN, copied from the organization when the draft is created.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (table) => {
    table.string('seller_gstin', 15).nullable().after('seller_state_code');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (table) => {
    table.dropColumn('seller_gstin');
  });
}
