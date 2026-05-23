import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { handleRouteError, HttpError, notFound, parseJsonBody } from "@/server/http";
import { assertProductAgeAllowed, isProductActive } from "@/server/products";
import { assertRateLimit } from "@/server/rate-limit";
import { publicRegistrationInputSchema } from "@/shared/schemas/registration";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    assertRateLimit(`registration:${slug}:${getClientIp(request)}`, 5, 60_000);

    const input = await parseJsonBody(request, publicRegistrationInputSchema);
    const session = await auth();
    const birthDate = input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : undefined;

    const event = await db.event.findUnique({
      where: { slug },
      select: { id: true, status: true }
    });

    if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") {
      notFound("Event not found");
    }

    if (event.status !== "REGISTRATION_OPEN" && event.status !== "LIVE") {
      throw new HttpError(403, "Registration is not open for this event.");
    }

    const registration = await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const product = await tx.product.findFirst({
          where: {
            id: input.productId,
            eventId: event.id,
            category: "REGISTRATION"
          },
          include: {
            _count: {
              select: {
                registrations: {
                  where: { status: "SUBMITTED" }
                }
              }
            }
          }
        });

        if (!product || !isProductActive(product)) {
          throw new HttpError(404, "Registration tier not found");
        }

        assertProductAgeAllowed(product, birthDate);

        if (product.stockLimit != null && product._count.registrations >= product.stockLimit) {
          throw new HttpError(409, "This registration tier is sold out.");
        }

        const questions = await tx.registrationQuestion.findMany({
          where: { eventId: event.id }
        });
        const questionById = new Map(questions.map((question) => [question.id, question]));
        const answersByQuestionId = new Map(input.answers.map((answer) => [answer.questionId, answer.value]));

        for (const question of questions) {
          const answer = answersByQuestionId.get(question.id);
          if (question.required && !answer) {
            throw new HttpError(400, `Missing answer for: ${question.label}`);
          }
        }

        for (const answer of input.answers) {
          if (!questionById.has(answer.questionId)) {
            throw new HttpError(400, "Unknown registration question");
          }
        }

        const attendeeProfile = await tx.attendeeProfile.create({
          data: {
            eventId: event.id,
            userId: session?.user?.id ?? null,
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            birthDate
          }
        });

        return tx.registration.create({
          data: {
            eventId: event.id,
            attendeeProfileId: attendeeProfile.id,
            userId: session?.user?.id ?? null,
            productId: product.id,
            answers: {
              create: input.answers
                .filter((answer) => answer.value.length > 0)
                .map((answer) => ({
                  questionId: answer.questionId,
                  value: answer.value
                }))
            }
          },
          include: {
            attendeeProfile: true,
            product: true
          }
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ registration }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
