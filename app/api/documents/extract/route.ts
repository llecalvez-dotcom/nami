import { configuredReader, readerName } from "@/lib/passport";
import { extractPassportImage, passportConsentError } from "@/lib/passport-extraction";
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
    const consentError = passportConsentError(reader, form.get("consent_provider"));
    if (consentError) return consentError;
    return await extractPassportImage(form.get("image"), {
      return_date: form.get("return_date") || null,
      arrival_at: form.get("arrival_at") || null,
    }, reader);
  } finally {
    lease.release();
  }
}
