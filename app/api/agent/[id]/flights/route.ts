import { z } from "zod";
import { sendToolResult } from "@/lib/h-agent";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";
import { FlightChoiceSchema, flightChoiceResult } from "@/lib/flights-agent";
import { readFlightsPageText } from "@/lib/flights/page";
import { enoughFlights, PAGE_UNREADABLE, readFlights, retryMessage } from "@/lib/flights/read";

const ToolReqSchema = z.object({
  tool_name: z.literal("report_flights"),
  args: z.record(z.string(), z.unknown()).default({}),
  id: z.string().min(1).nullable(),
});

// Two steps for one report_flights call. Without a choice: Nami reads the flights in the text of the Google Flights
// tab (the agent usually reports none), falls back on the reported flights that are really there, and returns them
// (H keeps waiting). With a choice: the traveller's flight goes back to H as the tool result.
const BodySchema = z.object({ tool_req: ToolReqSchema, choice: FlightChoiceSchema.optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/agent/[id]/flights">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const input = BodySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail("Invalid flights report.", 400);
  try {
    if (input.data.choice) {
      await sendToolResult(id, input.data.tool_req, flightChoiceResult(input.data.choice.flight));
      return Response.json({ ok: true }, { status: 202 });
    }
    const pageText = await readFlightsPageText();
    if (pageText === null) {
      await sendToolResult(id, input.data.tool_req, PAGE_UNREADABLE);
      return Response.json({ flights: [], unreadable: true }, { status: 200 });
    }
    const result = readFlights(input.data.tool_req.args, pageText);
    if (!enoughFlights(result)) {
      await sendToolResult(id, input.data.tool_req, retryMessage(result));
      return Response.json({ flights: [], retry: true, loading: result.loading ?? false, dropped: result.dropped, invalid: result.invalid }, { status: 200 });
    }
    return Response.json({ flights: result.kept, source: result.source, dropped: result.dropped, invalid: result.invalid }, { status: 200 });
  } catch (error) {
    return hErrorResponse(error);
  }
}
