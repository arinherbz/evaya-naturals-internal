import { initializeDatabase } from './init';

async function seed() {
  await initializeDatabase();
  console.log('Database seed complete');
}

seed().catch((error) => {
  console.error('Database seed failed');
  console.error(error);
  process.exit(1);
});
