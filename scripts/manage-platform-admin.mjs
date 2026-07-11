import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [command, email] = process.argv.slice(2);

if (!['grant', 'revoke'].includes(command) || !email) {
  console.error("Usage: npm run platform-admin -- <grant|revoke> user@example.com");
  process.exitCode = 1;
} else {
  const user = await prisma.user.update({
    where: {
      email: email.toLowerCase()
    },
    data: {
      platformRole: command === "grant" ? "PLATFORM_ADMIN" : "USER"
    },
    select: {
      email: true,
      platformRole: true
    }
  });

  console.info(`${user.email}: ${user.platformRole}`);
}

await prisma.$disconnect();
