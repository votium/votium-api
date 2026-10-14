import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { envs } from '../src/config/envs';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: envs.databaseUrl }),
  });

  try {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'e2e-', mode: 'insensitive' } },
      select: { id: true },
    });

    if (users.length === 0) {
      console.log('No e2e test users found');
      return;
    }

    const ids = users.map((user) => user.id);

    const challenges = await prisma.mfaChallenge.deleteMany({
      where: { user_id: { in: ids } },
    });
    const auditLogs = await prisma.auditLog.deleteMany({
      where: { user_id: { in: ids } },
    });
    const notifications = await prisma.notification.deleteMany({
      where: { user_id: { in: ids } },
    });
    const reports = await prisma.report.deleteMany({
      where: { user_id: { in: ids } },
    });
    const statusHistory = await prisma.electionStatusHistory.deleteMany({
      where: { user_id: { in: ids } },
    });
    const deletedUsers = await prisma.user.deleteMany({
      where: { id: { in: ids } },
    });

    console.log(
      `Removed e2e test data: ${deletedUsers.count} users, ${challenges.count} challenges, ` +
        `${auditLogs.count} audit logs, ${notifications.count} notifications, ` +
        `${reports.count} reports, ${statusHistory.count} status history rows`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
