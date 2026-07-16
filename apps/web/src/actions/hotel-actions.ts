"use server";

import { requireEventAccess, requireHotelBlockAccess, requireHotelBookingAccess } from "@/lib/dashboard-access";
import { getConventionPortalRootForRequest } from "@/lib/convention";
import { markOrderPaid } from "@/lib/fulfillment";
import { prepareOrderCheckout } from "@/lib/payments/checkout";
import { assertPaidCheckoutAvailable, getSePaySettings } from "@/lib/payments/platform";
import { HOTEL_PLATFORM_FEE_CENTS, getBaseUrl } from "@/lib/payments/stripe";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { getNightCount, parseMoney, parseRoomTypes, roomTypeSchema } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertOrganizationActive } from "@/lib/organization-lifecycle";
import { assertPublicAccountEmail, requirePublicAccount, syncPublicAccountName } from "@/lib/public-account";

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
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const { event } = await requireEventAccess(eventId);
  const parsed = z
    .object({
      hotelName: z.string().trim().min(2),
      cutoffDate: z.coerce.date()
    })
    .safeParse({
      hotelName: formData.get("hotelName"),
      cutoffDate: formData.get("cutoffDate")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid hotel block.");
  }

  const roomTypes = roomTypesFromForm(formData, event.currency);

  if (roomTypes.length === 0) {
    throw new Error("Create at least one room type.");
  }

  await prisma.hotelBlock.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      hotelName: parsed.data.hotelName,
      cutoffDate: parsed.data.cutoffDate,
      roomTypes
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/hotel`);
}

export async function updateHotelBlock(formData: FormData) {
  const blockId = z.string().uuid().parse(formData.get("blockId"));
  const { hotelBlock, event } = await requireHotelBlockAccess(blockId);
  const parsed = z
    .object({
      hotelName: z.string().trim().min(2),
      cutoffDate: z.coerce.date()
    })
    .safeParse({
      hotelName: formData.get("hotelName"),
      cutoffDate: formData.get("cutoffDate")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid hotel block.");
  }

  const roomTypes = roomTypesFromForm(formData, event.currency);

  if (roomTypes.length === 0) {
    throw new Error("Keep at least one room type.");
  }

  await prisma.hotelBlock.update({
    where: {
      id: hotelBlock.id
    },
    data: {
      orgId: event.orgId,
      hotelName: parsed.data.hotelName,
      cutoffDate: parsed.data.cutoffDate,
      roomTypes
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/hotel`);
}

export async function bookRoom(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const parsed = z
    .object({
      blockId: z.string().uuid(),
      roomType: z.string().trim().min(1),
      checkIn: z.coerce.date(),
      checkOut: z.coerce.date(),
      guestName: z.string().trim().min(1),
      guestEmail: z.string().email()
    })
    .safeParse({
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

  const block = await prisma.hotelBlock.findFirst({
    where: {
      id: parsed.data.blockId,
      eventId,
      event: {
        status: "PUBLISHED"
      }
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

  if (!block) {
    throw new Error("Hotel block not found or unavailable.");
  }

  if (block.orgId !== block.event.orgId) {
    throw new Error("Hotel block tenant does not match its event.");
  }

  assertOrganizationActive(block.event.org.status);
  const portalRoot = await getConventionPortalRootForRequest(block.event.org);
  const guest = await requirePublicAccount(`/${block.event.org.subdomain}/hotel`);
  assertPublicAccountEmail(guest, parsed.data.guestEmail);
  const account = await syncPublicAccountName(guest, parsed.data.guestName);
  await assertActionRateLimit("payment:hotel-booking", `${parsed.data.blockId}:${account.id}`);

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
  const booking = await prisma.hotelBooking.create({
    data: {
      orgId: block.event.orgId,
      userId: account.id,
      blockId: block.id,
      roomType: roomType.name,
      checkIn: parsed.data.checkIn,
      checkOut: parsed.data.checkOut,
      confirmationCode: "PENDING"
    }
  });

  const order = await prisma.order.create({
    data: {
      orgId: block.event.orgId,
      userId: account.id,
      eventId: block.event.id,
      total,
      platformFee,
      currency: block.event.currency,
      items: {
        create: {
          orgId: block.event.orgId,
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
    redirect(`${portalRoot}/hotel?success=${booking.id}`);
  }

  const checkout = await prepareOrderCheckout(
    order.id,
    `/${block.event.org.subdomain}/hotel?success=${booking.id}`,
    `/${block.event.org.subdomain}/hotel?cancelled=1`
  );
  redirect(`${getBaseUrl()}${checkout.checkoutPath}`);
}

export async function cancelBooking(formData: FormData) {
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const { hotelBooking, event } = await requireHotelBookingAccess(bookingId);

  await prisma.hotelBooking.delete({
    where: {
      id: hotelBooking.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/hotel`);
}
