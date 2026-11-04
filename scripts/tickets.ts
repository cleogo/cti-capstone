/**
 * Print the open escalation tickets, newest first. P0 has no staff page.
 *
 * Run:
 *   npx tsx scripts/tickets.ts          # the 20 newest
 *   npx tsx scripts/tickets.ts 100      # the 100 newest
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  // Import after dotenv: lib/redis reads the env when it loads.
  const { listTickets } = await import('../lib/tickets');
  const limit = Number(process.argv[2] ?? 20);
  const tickets = await listTickets(limit);
  if (tickets.length === 0) {
    console.log('No tickets.');
    return;
  }
  for (const t of tickets) {
    console.log(`${t.id}  ${t.created_at}  ${t.reason}  [${t.status}]`);
    console.log(`  summary: ${t.summary}`);
    console.log(t.contact ? `  contact: ${t.contact_name} <${t.contact}> (consent ${t.consent_at})` : '  contact: not given yet');
  }
  console.log(`\n${tickets.length} ticket(s).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
