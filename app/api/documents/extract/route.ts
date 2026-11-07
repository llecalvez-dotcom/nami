import {
  ACCEPTED_IMAGE_TYPES,
  configuredReaders,
  extractPassport,
  MAX_IMAGE_BYTES,
  type PassportImage,
  TripDatesSchema,
} from "@/lib/passport";

const fail = (error: string, status: number) => Response.json({ error }, { status });

// The image stays in memory: it is never written to disk nor logged.
export async function POST(request: Request) {
  const readers = configuredReaders();
  if (readers.length === 0) return fail("Passport reading is not configured. Type the fields instead.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart form with an image.", 400);
  }
  const image = form.get("image");
  if (!(image instanceof Blob) || image.size === 0) return fail("No image received.", 400);
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(image.type)) return fail("Send a JPEG or PNG photo.", 415);
  if (image.size > MAX_IMAGE_BYTES) return fail("Photo too large (5 MB max).", 413);

  const trip = TripDatesSchema.safeParse({
    return_date: form.get("return_date") || null,
    arrival_at: form.get("arrival_at") || null,
  });
  if (!trip.success) return fail("Invalid trip dates.", 400);

  const passport: PassportImage = {
    base64: Buffer.from(await image.arrayBuffer()).toString("base64"),
    mimeType: image.type as PassportImage["mimeType"],
  };
  try {
    return Response.json(await extractPassport(passport, trip.data, readers));
  } catch {
    return fail("The passport could not be read. Try a sharper photo, or type the fields.", 502);
  }
}
