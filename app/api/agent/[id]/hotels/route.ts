import { z } from "zod";
import { sendToolResult } from "@/lib/h-agent";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";
import { HOTELS_PAGE_SECTION, HOTELS_PAGE_UNREADABLE, HOTELS_RETRY, HotelChoiceSchema, hotelChoiceResult } from "@/lib/hotels-agent";
import { extractHotels } from "@/lib/hotels/extract";
import { readFlightsPageText } from "@/lib/flights/page";
import { showHotel } from "@/lib/flights/show-row";

const ToolReqSchema = z.object({
  tool_name: z.literal("report_hotels"),
  args: z.record(z.string(), z.unknown()).default({}),
  id: z.string().min(1).nullable(),
});
const BodySchema = z.object({ tool_req: ToolReqSchema, choice: HotelChoiceSchema.optional() });
const MIN_HOTELS = 2;

// Two steps for one report_hotels call. Without a choice: Nami reads the hotels in the Google Hotels tab and returns them
// (H keeps waiting). With a choice: the traveller's hotel goes back to H as the tool result.
export async function POST(request: Request, ctx: RouteContext<"/api/agent/[id]/hotels">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const input = BodySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail("Invalid hotels report.", 400);
  try {
    if (input.data.choice) {
      const shown = await showHotel(input.data.choice.hotel.name);
      await sendToolResult(id, input.data.tool_req, hotelChoiceResult(input.data.choice.hotel, shown));
      return Response.json({ ok: true }, { status: 202 });
    }
    const pageText = await readFlightsPageText(undefined, undefined, HOTELS_PAGE_SECTION);
    if (pageText === null) {
      await sendToolResult(id, input.data.tool_req, HOTELS_PAGE_UNREADABLE);
      return Response.json({ hotels: [], unreadable: true }, { status: 200 });
    }
    const hotels = extractHotels(pageText);
    if (hotels.length < MIN_HOTELS) {
      await sendToolResult(id, input.data.tool_req, HOTELS_RETRY);
      return Response.json({ hotels: [], retry: true }, { status: 200 });
    }
    return Response.json({ hotels }, { status: 200 });
  } catch (error) {
    return hErrorResponse(error);
  }
}
