import { NextResponse } from "next/server";
import { ASP_SKILL_MARKDOWN } from "@/lib/aspSkillMd";

export const runtime = "nodejs";

/** Serve the ASP skill manifest as Markdown for marketplace / agent callers. */
export async function GET() {
  return new NextResponse(ASP_SKILL_MARKDOWN, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
