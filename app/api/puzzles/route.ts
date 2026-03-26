import { NextResponse } from "next/server"

import {
  buildPuzzleFromDraft,
  type CrosswordDraft,
  validateCrosswordDraft,
} from "@/lib/crossword-editor"
import {
  getPuzzleForDate,
  isDatabaseEnabled,
  listPuzzleSchedule,
  savePuzzle,
} from "@/lib/crossword-puzzle-store"
import { getLocalDateKey } from "@/lib/crossword-schedule"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") ?? getLocalDateKey()
  const [puzzle, schedule] = await Promise.all([
    getPuzzleForDate(date),
    listPuzzleSchedule(),
  ])

  return NextResponse.json({
    puzzle,
    schedule,
    databaseConnected: isDatabaseEnabled(),
  })
}

export async function POST(request: Request) {
  try {
    const draft = (await request.json()) as CrosswordDraft
    const validation = validateCrosswordDraft(draft)

    if (validation.errors.length > 0) {
      return NextResponse.json(
        { error: validation.errors[0], validation },
        { status: 400 }
      )
    }

    const puzzle = buildPuzzleFromDraft(draft)
    const savedPuzzle = await savePuzzle(puzzle)
    const schedule = await listPuzzleSchedule()

    return NextResponse.json({
      puzzle: savedPuzzle,
      schedule,
      databaseConnected: isDatabaseEnabled(),
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED"
        ? "Set DATABASE_URL to save puzzles from the CMS."
        : error instanceof Error
          ? error.message
          : "Unable to save this puzzle right now."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
