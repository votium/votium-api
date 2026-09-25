import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { envs } from '../src/config/envs';
import { RoleName } from '../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../src/modules/iam/domain/value-objects/user-status.vo';
import { NodeCryptoPasswordHasherService } from '../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';

async function main() {
  const firstName = process.env.BOOTSTRAP_FIRST_NAME;
  const lastName = process.env.BOOTSTRAP_LAST_NAME;
  const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_PASSWORD;
  const roleName = process.env.BOOTSTRAP_ROLE ?? RoleName.ADMINISTRATOR.value;

  if (!firstName || !lastName || !email || !password) {
    throw new Error(
      'Missing required env vars: BOOTSTRAP_FIRST_NAME, BOOTSTRAP_LAST_NAME, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: envs.databaseUrl }),
  });

  try {
    const hasher = new NodeCryptoPasswordHasherService();
    const passwordHash = await hasher.hash(password);
    const verified = await hasher.verify(password, passwordHash);
    if (!verified) throw new Error('Password hash self-check failed');

    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new Error(`Role not found: ${roleName}`);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error(`Email already in use: ${email}`);

    const user = await prisma.user.create({
      data: {
        first_name: firstName,
        last_name: lastName,
        email,
        password_hash: passwordHash,
        role_id: role.id,
        status: UserStatus.ACTIVE,
      },
    });

    console.log(`User created: ${user.id} (${user.email}, role ${roleName})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
