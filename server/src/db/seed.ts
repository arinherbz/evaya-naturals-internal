import { seedDatabase } from './init';

async function seed() {
  await seedDatabase();
}

seed().catch((error) => {
  console.error('Database seed failed');
  console.error(error);
  process.exit(1);
});
