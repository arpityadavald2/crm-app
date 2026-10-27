import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // One counter row per organization per financial year, e.g. (1, '2026-27').
  await knex.schema.createTable('invoice_counters', (table) => {
    table
      .bigInteger('org_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('RESTRICT');
    table.string('fiscal_year', 7).notNullable();
    table.integer('last_number').unsigned().notNullable().defaultTo(0);
    table.primary(['org_id', 'fiscal_year']);
  });

  await knex.schema.createTable('invoices', (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('org_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('RESTRICT');
    table
      .bigInteger('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customers')
      .onDelete('RESTRICT');
    // NULL while the invoice is a draft; assigned when it is issued.
    table.string('invoice_number', 30).nullable();
    table.string('status', 20).notNullable().defaultTo('draft');
    table.date('issue_date').nullable();
    table.date('due_date').nullable();
    table.string('supply_type', 5).notNullable().comment('intra = CGST+SGST, inter = IGST');
    table.string('seller_state_code', 2).nullable();
    table.string('buyer_state_code', 2).nullable();
    // All money is stored in paise (integer). Never float or decimal.
    table.bigInteger('subtotal_paise').notNullable().defaultTo(0);
    table.bigInteger('cgst_paise').notNullable().defaultTo(0);
    table.bigInteger('sgst_paise').notNullable().defaultTo(0);
    table.bigInteger('igst_paise').notNullable().defaultTo(0);
    table.bigInteger('total_paise').notNullable().defaultTo(0);
    table.bigInteger('amount_paid_paise').notNullable().defaultTo(0);
    table.string('notes', 1000).nullable();
    table.specificType('created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    table.specificType(
      'updated_at',
      'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    );
    // MySQL allows many NULLs in a unique index, so drafts do not clash.
    table.unique(['org_id', 'invoice_number'], { indexName: 'uq_invoices_org_number' });
    table.index(['org_id', 'status', 'created_at'], 'idx_invoices_org_status');
    table.index(['org_id', 'customer_id'], 'idx_invoices_org_customer');
  });

  await knex.schema.createTable('invoice_items', (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('org_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('RESTRICT');
    table
      .bigInteger('invoice_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('invoices')
      .onDelete('CASCADE');
    table.string('description', 255).notNullable();
    table.integer('quantity').unsigned().notNullable();
    table.bigInteger('unit_price_paise').notNullable();
    table.integer('gst_rate_bp').unsigned().notNullable().comment('basis points: 1800 = 18%');
    table.bigInteger('taxable_paise').notNullable();
    table.bigInteger('cgst_paise').notNullable().defaultTo(0);
    table.bigInteger('sgst_paise').notNullable().defaultTo(0);
    table.bigInteger('igst_paise').notNullable().defaultTo(0);
    table.bigInteger('total_paise').notNullable();
    table.index(['org_id', 'invoice_id'], 'idx_items_org_invoice');
  });

  await knex.schema.createTable('payments', (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('org_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('RESTRICT');
    table
      .bigInteger('invoice_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('invoices')
      .onDelete('RESTRICT');
    table.bigInteger('amount_paise').notNullable();
    table.date('paid_on').notNullable();
    table.string('method', 20).notNullable();
    table.string('reference', 100).nullable();
    table.specificType('created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    table.index(['org_id', 'invoice_id'], 'idx_payments_org_invoice');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('invoice_items');
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('invoice_counters');
}
