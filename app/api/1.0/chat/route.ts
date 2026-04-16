import { NextResponse } from "next/server"

import {
  getSuggestionResponse,
  type SuggestionRequest,
} from "@/lib/crossword-suggestions"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SuggestionRequest

    return NextResponse.json(await getSuggestionResponse(payload))
  } catch {
    return NextResponse.json(
      { error: "Unable to generate suggestions right now." },
      { status: 500 }
    )
  }
}
