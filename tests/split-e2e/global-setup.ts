import { hashPassword } from "@vfurst/auth/core";
import { prisma } from "@vfurst/db";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the split E2E setup.`);
  return value;
}

export default async function globalSetup() {
  const runId = requiredEnvironment("VFURST_SPLIT_E2E_RUN_ID");
  const email = requiredEnvironment("VFURST_SPLIT_E2E_USER_EMAIL").toLowerCase();
  const password = requiredEnvironment("VFURST_SPLIT_E2E_USER_PASSWORD");

  if (!email.startsWith("split-e2e+") || !email.endsWith("@example.test")) {
    throw new Error("Refusing to manage a split E2E user outside the disposable email namespace.");
  }

  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({
    data: {
      email,
      name: `Split E2E ${runId}`,
      passwordHash: await hashPassword(password, 10)
    },
    select: { id: true }
  });
  process.env.VFURST_SPLIT_E2E_USER_ID = user.id;

  return async () => {
    await prisma.user.deleteMany({
      where: {
        id: user.id,
        email,
        name: `Split E2E ${runId}`
      }
    });
    await prisma.$disconnect();
  };
}
