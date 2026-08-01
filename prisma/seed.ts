import { PrismaClient, Role } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const family = await prisma.family.create({
    data: { name: "Our Family" }
  });

  const passwordHash = await argon2.hash("ChangeMe123!");

  await prisma.user.createMany({
    data: [
      { familyId: family.id, name: "Parent 1", email: "parent1@example.com", passwordHash, role: Role.PARENT },
      { familyId: family.id, name: "Parent 2", email: "parent2@example.com", passwordHash, role: Role.PARENT },
      { familyId: family.id, name: "Parent 3", email: "parent3@example.com", passwordHash, role: Role.PARENT },
      { familyId: family.id, name: "Kid", email: "kid@example.com", passwordHash, role: Role.KID }
    ]
  });

  console.log("Seeded family. Development password: ChangeMe123!");
}

main().finally(() => prisma.$disconnect());
