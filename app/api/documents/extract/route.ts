import {
  ACCEPTED_IMAGE_TYPES,
  configuredReader,
  extractPassport,
  MAX_IMAGE_BYTES,
  type PassportImage,
  readerName,
  TripDatesSchema,
} from "@/lib/passport";
import { guard } from "@/lib/api-guard";

const fail = (error: string, status: number) => Response.json({ error }, { status });

// The image stays in memory: it is never written to disk nor logged.
export async function GET() {
  return Response.json({ reader: readerName() });
}

export async function POST(request: Request) {
  const lease = guard(request, "extract");
  if (lease instanceof Response) return lease;

  try {
    const reader = configuredReader();
    if (!reader) return fail("Automatic reading is off. Type the fields.", 503);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail("Expected a multipart form with an image.", 400);
    }
    if (form.get("consent_provider") !== reader.name) {
      const provider = reader.name === "h" ? "H Company" : "Anthropic";
      return fail(`Confirm that the photo may be sent to ${provider} first.`, 403);
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
      return Response.json(await extractPassport(passport, trip.data, reader));
    } catch {
      return fail("The passport could not be read. Try a sharper photo, or type the fields.", 502);
    }
  } finally {
    lease.release();
  }
}
