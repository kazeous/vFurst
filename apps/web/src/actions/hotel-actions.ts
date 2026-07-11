"use server";

import { auth } from "@/lib/auth";
import { markOrderPaid } from "@/lib/fulfillment";
import { prepareOrderCheckout } from "@/lib/payments/checkout";
import { assertPaidCheckoutAvailable, getSePaySettings } from "@/lib/payments/platform";
import { HOTEL_PLATFORM_FEE_CENTS } from "@/lib/payments/stripe";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { getNightCount, parseMoney, parseRoomTypes, roomTypeSchema } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function requireEventAccess(orgId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const member = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId: session.user.id,
        orgId
      }
    }
  });

  if (!member || member.role === "MEMBER") {
    throw new Error("You do not have permission to manage hotel blocks for this event.");
  }
}

async function findOrCreateGuest(email: string, name: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: {
      email: normalizedEmail
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      email: normalizedEmail,
      name
    }
  });
}

function roomTypesFromForm(formData: FormData, currency: "USD" | "VND") {
  const names = formData.getAll("roomName");
  const rates = formData.getAll("roomRate");
  const totals = formData.getAll("roomTotal");

  return names
    .map((name, index) => ({
      name: String(name).trim(),
      rate: rates[index] ?? "0",
      totalRooms: totals[index] ?? ""
    }))
    .filter((roomType) => roomType.name.length > 0)
    .map((roomType) =>
      roomTypeSchema.parse({
        name: roomType.name,
        rate: parseMoney(roomType.rate, currency),
        totalRooms: roomType.totalRooms,
        bookedRooms: 0
      })
    );
}

export async function createHotelBlock(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      hotelName: z.string().trim().min(2),
      cutoffDate: z.coerce.date()
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      hotelName: formData.get("hotelName"),
      cutoffDate: formData.get("cutoffDate")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid hotel block.");
  }

  await requireEventAccess(parsed.data.orgId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: parsed.data.eventId }, select: { currency: true } });
  const roomTypes = roomTypesFromForm(formData, event.currency);

  if (roomTypes.length === 0) {
    throw new Error("Create at least one room type.");
  }

  await prisma.hotelBlock.create({
    data: {
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      hotelName: parsed.data.hotelName,
      cutoffDate: parsed.data.cutoffDate,
      roomTypes
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/hotel`);
}

export async function updateHotelBlock(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      blockId: z.string().uuid(),
      hotelName: z.string().trim().min(2),
      cutoffDate: z.coerce.date()
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      blockId: formData.get("blockId"),
      hotelName: formData.get("hotelName"),
      cutoffDate: formData.get("cutoffDate")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid hotel block.");
  }

  await requireEventAccess(parsed.data.orgId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: parsed.data.eventId }, select: { currency: true } });

  await prisma.hotelBlock.update({
    where: {
      id: parsed.data.blockId
    },
    data: {
      hotelName: parsed.data.hotelName,
      cutoffDate: parsed.data.cutoffDate,
      roomTypes: roomTypesFromForm(formData, event.currency)
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/hotel`);
}

export async function bookRoom(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      blockId: z.string().uuid(),
      roomType: z.string().trim().min(1),
      checkIn: z.coerce.date(),
      checkOut: z.coerce.date(),
      guestName: z.string().trim().min(1),
      guestEmail: z.string().email()
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      blockId: formData.get("blockId"),
      roomType: formData.get("roomType"),
      checkIn: formData.get("checkIn"),
      checkOut: formData.get("checkOut"),
      guestName: formData.get("guestName"),
      guestEmail: formData.get("guestEmail")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid hotel booking.");
  }

  assertActionRateLimit("payment:hotel-booking", `${parsed.data.blockId}:${parsed.data.guestEmail.toLowerCase()}`);

  const block = await prisma.hotelBlock.findFirstOrThrow({
    where: {
      id: parsed.data.blockId,
      eventId: parsed.data.eventId,
      orgId: parsed.data.orgId
    },
    include: {
      bookings: true,
      event: {
        include: {
          org: true
        }
      }
    }
  });

  if (block.cutoffDate < new Date()) {
    throw new Error("This hotel block is past its booking cutoff.");
  }

  const roomTypes = parseRoomTypes(block.roomTypes);
  const roomType = roomTypes.find((room) => room.name === parsed.data.roomType);

  if (!roomType) {
    throw new Error("Room type is not available.");
  }

  const bookedCount = block.bookings.filter((booking) => booking.roomType === roomType.name).length;

  if (bookedCount >= roomType.totalRooms) {
    throw new Error("That room type is sold out.");
  }

  const nights = getNightCount(parsed.data.checkIn, parsed.data.checkOut);
  const total = roomType.rate * nights;
  const platformFee = total > 0 ? (block.event.currency === "VND" ? (await getSePaySettings()).hotelFeeVnd : HOTEL_PLATFORM_FEE_CENTS) : 0;
  if (total > 0) {
    await assertPaidCheckoutAvailable(block.event.orgId, block.event.currency);
  }
  const guest = await findOrCreateGuest(parsed.data.guestEmail, parsed.data.guestName);

  const booking = await prisma.hotelBooking.create({
    data: {
      orgId: parsed.data.orgId,
      userId: guest.id,
      blockId: block.id,
      roomType: roomType.name,
      checkIn: parsed.data.checkIn,
      checkOut: parsed.data.checkOut,
      confirmationCode: "PENDING"
    }
  });

  const order = await prisma.order.create({
    data: {
      orgId: parsed.data.orgId,
      userId: guest.id,
      eventId: parsed.data.eventId,
      total,
      platformFee,
      currency: block.event.currency,
      items: {
        create: {
          orgId: parsed.data.orgId,
          itemType: "HOTEL",
          refId: booking.id,
          unitPrice: roomType.rate,
          quantity: nights
        }
      }
    }
  });

  if (total === 0) {
    await markOrderPaid(order.id);
    redirect(`/${block.event.org.subdomain}/hotel?success=${booking.id}`);
  }

  const checkout = await prepareOrderCheckout(
    order.id,
    `/${block.event.org.subdomain}/hotel?success=${booking.id}`,
    `/${block.event.org.subdomain}/hotel?cancelled=1`
  );
  redirect(checkout.checkoutPath);
}

export async function cancelBooking(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));

  await requireEventAccess(orgId);

  await prisma.hotelBooking.delete({
    where: {
      id: bookingId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/hotel`);
}
