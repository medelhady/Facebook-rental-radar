import { NextResponse } from "next/server";
import { pushActiveGroups } from "@/lib/apify-sync";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST() {
  try {
    const result = await pushActiveGroups();
    return NextResponse.json({
      ...result,
      message: `تم إرسال ${result.count} مجموعة إلى Apify.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر إرسال المجموعات إلى Apify." },
      { status: 502 }
    );
  }
}
