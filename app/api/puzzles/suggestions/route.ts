import { NextResponse } from "next/server"

import {
  buildSuggestions,
  suggestWordsWithAi,
  type Difficulty,
} from "@/lib/crossword-suggestions"

export const dynamic = "force-dynamic"

type SuggestionRequest = {
  theme?: string
  title?: string
  difficulty?: Difficulty
  selectedWords?: string[]
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SuggestionRequest
    const theme = payload.theme?.trim() ?? ""
    const title = payload.title?.trim() ?? ""
    const difficulty = normalizeDifficulty(payload.difficulty)
    const selectedWords = Array.isArray(payload.selectedWords)
      ? payload.selectedWords
      : []

    const dictionarySuggestions = buildSuggestions({
      theme,
      title,
      difficulty,
      selectedWords,
    })
    const aiSuggestions = await suggestWordsWithAi({
      theme,
      title,
      difficulty,
      selectedWords,
      candidateWords: dictionarySuggestions.map(
        (suggestion) => suggestion.answer
      ),
    })
    const suggestions = buildSuggestions({
      theme,
      title,
      difficulty,
      selectedWords,
      aiSuggestions,
    })

    return NextResponse.json({
      suggestions,
      engine: aiSuggestions.length > 0 ? "ai" : "dictionary",
      aiAvailable: Boolean(process.env.OPENAI_API_KEY),
    })
  } catch {
    return NextResponse.json(
      { error: "Unable to generate suggestions right now." },
      { status: 500 }
    )
  }
}

function normalizeDifficulty(value?: string): Difficulty {
  return value === "easy" || value === "hard" ? value : "medium"
}
