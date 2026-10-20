import { CheckInPanel } from "@/app/dashboard/events/[eventId]/check-in/check-in-panel";
import { prisma, type Prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const CHECK_IN_PAGE_SIZE = 25;

function buildRegistrationSearch(eventId: string, query: string): Prisma.RegistrationWhereInput {
  const where: Prisma.RegistrationWhereInput = { eventId };

  if (!query) {
    return where;
  }

  const textMatches: Prisma.RegistrationWhereInput[] = [
    { attendeeProfile: { is: { fullName: { contains: query, mode: "insensitive" } } } },
    { attendeeProfile: { is: { badgeName: { contains: query, mode: "insensitive" } } } },
    {
      badgeNumber: {
        contains: query,
        mode: "insensitive"
      }
    },
    {
      portalAccount: {
        is: {
          email: {
            contains: query,
            mode: "insensitive"
          }
        }
      }
    },
    {
      portalAccount: {
        is: {
          name: {
            contains: query,
            mode: "insensitive"
          }
        }
      }
    }
  ];

  if (/^[0-9a-f-]{36}$/i.test(query)) {
    textMatches.push({ id: query });
  }

  return {
    ...where,
    OR: textMatches
  };
}

const getCheckInData = unstable_cache(
  async (eventId: string, query: string) => {
    const registrationWhere = buildRegistrationSearch(eventId, query);
    const [event, totalRegistrations, matchingRegistrations, registrations] = await Promise.all([
      prisma.event.findUnique({
        where: {
          id: eventId
        },
        select: {
          id: true
        }
      }),
      prisma.registration.count({
        where: {
          eventId
        }
      }),
      prisma.registration.count({
        where: registrationWhere
      }),
      prisma.registration.findMany({
        where: registrationWhere,
        select: {
          id: true,
          orgId: true,
          eventId: true,
          status: true,
          approvalStatus: true,
          badgeNumber: true,
          checkedInAt: true,
          addOns: {
            select: {
              quantity: true,
              addOnDefinition: {
                select: {
                  name: true
                }
              }
            }
          },
          badges: {
            take: 1,
            orderBy: {
              createdAt: "desc"
            },
            select: {
              id: true,
              barcodeData: true,
              pdfUrl: true,
              zplData: true,
              generatedAt: true,
              printedAt: true
            }
          },
          orderItems: {
            select: {
              order: {
                select: {
                  status: true
                }
              }
            }
          },
          type: {
            select: {
              name: true
            }
          },
          attendeeProfile: { select: { id: true, fullName: true, badgeName: true } },
          portalAccount: {
            select: {
              email: true,
              name: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        },
        take: CHECK_IN_PAGE_SIZE
      })
    ]);

    return { event, matchingRegistrations, registrations, totalRegistrations };
  },
  ["check-in-page-data"],
  { revalidate: 2 }
);

export default async function CheckInPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ eventId }, queryParams] = await Promise.all([params, searchParams]);
  const query = queryParams.q?.trim() ?? "";
  const checkInData = await getCheckInData(eventId, query);

  if (!checkInData.event) {
    notFound();
  }

  return (
    <div className="vf-page vf-focus-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Check-in</p>
          <h1>Staff check-in</h1>
          <p className="vf-muted">Search, scan, confirm payment, and check attendees in.</p>
        </div>
        <div className="vf-actions">
          <Button label="Cashier" href={`/dashboard/events/${checkInData.event.id}/check-in/cashier`} />
          <Button label="Express" href={`/dashboard/events/${checkInData.event.id}/check-in/express`} variant="primary" />
        </div>
      </header>

      <CheckInPanel
        initialQuery={query}
        pageSize={CHECK_IN_PAGE_SIZE}
        resultCount={checkInData.matchingRegistrations}
        totalCount={checkInData.totalRegistrations}
        rows={checkInData.registrations.map((registration) => ({
          id: registration.id,
          attendee: registration.attendeeProfile.fullName,
          email: registration.portalAccount.email,
          type: registration.type.name,
          status: registration.status,
          approvalStatus: registration.approvalStatus,
          badgeNumber: registration.badgeNumber,
          paid: registration.orderItems.some((item) => item.order.status === "PAID"),
          checkedInAt: registration.checkedInAt ? new Date(registration.checkedInAt).toISOString() : null,
          badge: registration.badges[0]
            ? {
                id: registration.badges[0].id,
                barcodeData: registration.badges[0].barcodeData,
                pdfUrl: registration.badges[0].pdfUrl,
                zplData: registration.badges[0].zplData,
                generatedAt: registration.badges[0].generatedAt
                  ? new Date(registration.badges[0].generatedAt).toISOString()
                  : null,
                printedAt: registration.badges[0].printedAt ? new Date(registration.badges[0].printedAt).toISOString() : null
              }
            : null,
          addOns: registration.addOns.map((addOn) => `${addOn.addOnDefinition.name} x${addOn.quantity}`)
        }))}
      />
    </div>
  );
}
