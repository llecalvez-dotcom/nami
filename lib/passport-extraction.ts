import {
  ACCEPTED_IMAGE_TYPES,
  extractPassport,
  MAX_IMAGE_BYTES,
  PassportReadError,
  providerDidNotAnswer,
  TripDatesSchema,
  type PassportImage,
  type PassportReader,
} from "@/lib/passport";

const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export function passportConsentError(reader: PassportReader, consent: unknown): Response | null {
  if (consent === reader.name) return null;
  const provider = reader.name === "h" ? "H Company" : "Anthropic";
  return fail(`Confirm that the photo may be sent to ${provider} first.`, 403);
}

export function passportImageError(size: number, type: string): Response | null {
  if (size === 0) return fail("No image received.", 400);
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)) return fail("Send a JPEG or PNG photo.", 415);
  if (size > MAX_IMAGE_BYTES) return fail("Photo too large (5 MB max).", 413);
  return null;
}

// The provider was slow or down twice in a row: the document is fine, the traveller just tries again (503, not 502).
export const READER_UNAVAILABLE_STATUS = 503;

export async function extractPassportImage(image: unknown, tripDates: unknown, reader: PassportReader): Promise<Response> {
  if (!(image instanceof Blob)) return fail("No image received.", 400);
  const imageError = passportImageError(image.size, image.type);
  if (imageError) return imageError;
  const trip = TripDatesSchema.safeParse(tripDates);
  if (!trip.success) return fail("Invalid trip dates.", 400);
  const passport: PassportImage = {
    base64: Buffer.from(await image.arrayBuffer()).toString("base64"),
    mimeType: image.type as PassportImage["mimeType"],
  };
  try {
    return Response.json(await extractPassport(passport, trip.data, reader), { headers });
  } catch (error) {
    if (error instanceof PassportReadError && error.transient) {
      return Response.json({ error: providerDidNotAnswer(reader), transient: true }, { status: READER_UNAVAILABLE_STATUS, headers: { ...headers, "Retry-After": "5" } });
    }
    return fail("The passport could not be read. Try a sharper photo, or type the fields.", 502);
  }
}
