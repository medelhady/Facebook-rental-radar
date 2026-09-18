import { NextResponse } from "next/server";
import { describeSync, pushActiveGroups } from "@/lib/apify-sync";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST() {
  try {
    const results = await pushActiveGroups();
    const failed = results.filter((result) => result.error);

    return NextResponse.json(
      {
        results,
        message: `تمت المزامنة — ${describeSync(results)}.`
      },
      // A partial sync is not a success: some accounts kept their old groups.
      { status: failed.length > 0 && failed.length === results.length ? 502 : 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر إرسال المجموعات إلى Apify." },
      { status: 502 }
    );
  }
}
