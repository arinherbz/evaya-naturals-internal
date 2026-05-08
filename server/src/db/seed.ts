import { seedDatabase } from './init';
import { logServerError } from '../env';

async function seed() {
  await seedDatabase();
}

seed().catch((error) => {
  logServerError('Database seed', error);
  process.exit(1);
});
