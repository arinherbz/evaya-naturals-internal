import { seedDatabase } from './init.js';
import { logServerError } from '../env.js';

async function seed() {
  await seedDatabase();
}

seed().catch((error) => {
  logServerError('Database seed', error);
  process.exit(1);
});
