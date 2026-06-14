const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing tables
  await prisma.importAnomaly.deleteMany();
  await prisma.expenseSplit.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.groupMembership.deleteMany();
  await prisma.importRun.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = bcrypt.hashSync('password123', 10);

  // 1. Create Users
  const aisha = await prisma.user.create({
    data: { email: 'aisha@example.com', name: 'Aisha', passwordHash }
  });
  const rohan = await prisma.user.create({
    data: { email: 'rohan@example.com', name: 'Rohan', passwordHash }
  });
  const priya = await prisma.user.create({
    data: { email: 'priya@example.com', name: 'Priya', passwordHash }
  });
  const meera = await prisma.user.create({
    data: { email: 'meera@example.com', name: 'Meera', passwordHash }
  });
  const sam = await prisma.user.create({
    data: { email: 'sam@example.com', name: 'Sam', passwordHash }
  });
  const dev = await prisma.user.create({
    data: { email: 'dev@example.com', name: 'Dev', passwordHash }
  });

  // 2. Create Group
  const group = await prisma.group.create({
    data: {
      name: 'Flat 302',
      description: 'Shared expenses for Flat 302 flatmates',
      currency: 'INR'
    }
  });

  // 3. Create Group Memberships with dates
  // Aisha, Rohan, Priya, Dev joined Jan 1, 2026
  const jan1 = new Date('2026-01-01T00:00:00Z');
  // Meera left end of March 2026
  const march31 = new Date('2026-03-31T23:59:59Z');
  // Sam joined mid-April 2026
  const april15 = new Date('2026-04-15T00:00:00Z');

  await prisma.groupMembership.createMany({
    data: [
      { groupId: group.id, userId: aisha.id, joinedAt: jan1 },
      { groupId: group.id, userId: rohan.id, joinedAt: jan1 },
      { groupId: group.id, userId: priya.id, joinedAt: jan1 },
      { groupId: group.id, userId: meera.id, joinedAt: jan1, leftAt: march31 },
      { groupId: group.id, userId: dev.id, joinedAt: jan1 },
      { groupId: group.id, userId: sam.id, joinedAt: april15 }
    ]
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
