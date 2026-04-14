"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CircleDot,
  GripVertical,
  LayoutGrid,
  MoreVertical,
  PencilLine,
  Plus,
  Search,
  Shuffle,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react"

import { CrosswordPreview } from "@/components/crossword-preview"
import {
  buildDraftFromManualPlacements,
  deriveWordsFromDraft,
  FIXED_GRID_SIZES,
  generateDraftFromWordList,
  keyFor,
  previewWordPlacement,
  recommendGridSize,
  validateManualWordPlacement,
  type CrosswordDraft,
  type DerivedWord,
  type ManualWordPlacement,
  type SeedWord,
} from "@/lib/crossword-editor"
import {
  getLocalDateKey,
  type CrosswordPuzzle,
  type Direction,
} from "@/lib/crossword-schedule"
import {
  buildSuggestions,
  normalizeAnswer,
  type Difficulty,
  type SuggestionWord,
} from "@/lib/crossword-suggestions"

type CmsScreen = "list" | "details" | "words" | "clues"

type EditorWord = {
  id: string
  answer: string
  clue: string
  meaning: string
  row: number
  col: number
  direction: Direction
  source: "suggested" | "custom"
}

type PuzzleSession = {
  id: string | null
  title: string
  theme: string
  difficulty: Difficulty
  date: string
  gridSize: number
  words: EditorWord[]
  shuffleSeed: number
}

type DerivedLayout = {
  draft: CrosswordDraft
  words: DerivedWord[]
}

type HoverPreview = {
  answer: string
  words: EditorWord[]
  unlockedSuggestionCount: number
  rearrangesExistingWords: boolean
}

type DragState = {
  wordIds: string[]
  startX: number
  startY: number
  positions: Record<string, { row: number; col: number }>
}

type LassoState = {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

const DIFFICULTY_OPTIONS: Difficulty[] = ["easy", "medium", "hard"]
const GRID_PADDING = 4
const CANVAS_SIZE =
  FIXED_GRID_SIZES[FIXED_GRID_SIZES.length - 1] + GRID_PADDING * 2

let nextWordId = 1

export function CrosswordCms({
  initialPuzzles,
  databaseConnected,
}: {
  initialPuzzles: CrosswordPuzzle[]
  databaseConnected: boolean
}) {
  const [puzzles, setPuzzles] = useState(sortPuzzles(initialPuzzles))
  const [screen, setScreen] = useState<CmsScreen>("list")
  const [session, setSession] = useState<PuzzleSession>(() =>
    createEmptySession()
  )
  const [error, setError] = useState("")
  const [notice, setNotice] = useState(
    databaseConnected
      ? ""
      : "Database offline. You can still build layouts, but publishing will fail until the database is connected."
  )
  const [isPublishing, setIsPublishing] = useState(false)
  const [customWord, setCustomWord] = useState("")
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([])
  const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(
    null
  )
  const [suggestionPool, setSuggestionPool] = useState<SuggestionWord[]>([])
  const [suggestionPoolKey, setSuggestionPoolKey] = useState("")
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false)
  const [aiAvailable, setAiAvailable] = useState(false)
  const [suggestionEngine, setSuggestionEngine] = useState<"dictionary" | "ai">(
    "dictionary"
  )

  const boardRef = useRef<HTMLDivElement | null>(null)

  const boundaryOffset = useMemo(
    () => getBoundaryOffset(session.gridSize),
    [session.gridSize]
  )

  const selectedAnswers = useMemo(
    () => new Set(session.words.map((word) => word.answer)),
    [session.words]
  )

  const fallbackSuggestions = useMemo(
    () =>
      buildSuggestions({
        theme: session.theme,
        title: session.title,
        difficulty: session.difficulty,
        selectedWords: session.words.map((word) => word.answer),
      }),
    [session.difficulty, session.theme, session.title, session.words]
  )

  const suggestionRequestKey = useMemo(
    () =>
      JSON.stringify({
        theme: session.theme,
        title: session.title,
        difficulty: session.difficulty,
        selectedWords: session.words.map((word) => word.answer),
      }),
    [session.difficulty, session.theme, session.title, session.words]
  )

  const allSuggestions =
    suggestionPool.length > 0 && suggestionPoolKey === suggestionRequestKey
      ? suggestionPool
      : fallbackSuggestions

  const availableSuggestions = useMemo(() => {
    const seedWords = session.words.map((word) => ({ answer: word.answer }))

    return allSuggestions.filter((suggestion) => {
      if (selectedAnswers.has(suggestion.answer)) {
        return false
      }

      if (seedWords.length === 0) {
        return true
      }

      return (
        previewWordPlacement({
          words: seedWords,
          answer: suggestion.answer,
        }).status === "connected"
      )
    })
  }, [allSuggestions, selectedAnswers, session.words])

  const wordIssues = useMemo(
    () => getWordIssues(session.words, session.gridSize, boundaryOffset),
    [boundaryOffset, session.gridSize, session.words]
  )

  const derivedLayout = useMemo(
    () => buildDerivedLayout(session, boundaryOffset),
    [boundaryOffset, session]
  )

  const hoverPreview = useMemo<HoverPreview | null>(() => {
    if (!hoveredSuggestion) {
      return null
    }

    const nextWords = [
      ...session.words,
      {
        id: `hover-${hoveredSuggestion}`,
        answer: hoveredSuggestion,
        clue: "",
        meaning: "",
        row: boundaryOffset,
        col: boundaryOffset,
        direction: "across" as const,
        source: "suggested" as const,
      },
    ]

    const autoplaced = autoPlaceWords({
      words: nextWords,
      gridSize: session.gridSize,
      title: session.title,
      date: session.date,
      shuffleSeed: session.shuffleSeed,
    })

    if (!autoplaced) {
      return null
    }

    const nextSelectedAnswers = new Set(autoplaced.map((word) => word.answer))
    const nextSeedWords = autoplaced.map((word) => ({ answer: word.answer }))
    const nextAvailableSuggestions = allSuggestions.filter((suggestion) => {
      if (nextSelectedAnswers.has(suggestion.answer)) {
        return false
      }

      return (
        previewWordPlacement({
          words: nextSeedWords,
          answer: suggestion.answer,
        }).status === "connected"
      )
    })

    const currentWordMap = new Map(
      session.words.map((word) => [word.answer, word])
    )
    const rearrangesExistingWords = autoplaced.some((word) => {
      const currentWord = currentWordMap.get(word.answer)

      return Boolean(
        currentWord &&
        (currentWord.row !== word.row ||
          currentWord.col !== word.col ||
          currentWord.direction !== word.direction)
      )
    })

    return {
      answer: hoveredSuggestion,
      words: autoplaced,
      unlockedSuggestionCount: nextAvailableSuggestions.length,
      rearrangesExistingWords,
    }
  }, [
    allSuggestions,
    boundaryOffset,
    hoveredSuggestion,
    session.date,
    session.gridSize,
    session.shuffleSeed,
    session.title,
    session.words,
  ])

  const acrossWords = derivedLayout?.words.filter(
    (word) => word.direction === "across"
  )
  const downWords = derivedLayout?.words.filter(
    (word) => word.direction === "down"
  )

  useEffect(() => {
    if (screen !== "words") {
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setIsSuggestionsLoading(true)

      try {
        const response = await fetch("/api/puzzles/suggestions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            theme: session.theme,
            title: session.title,
            difficulty: session.difficulty,
            selectedWords: session.words.map((word) => word.answer),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error("SUGGESTIONS_REQUEST_FAILED")
        }

        const data = (await response.json()) as {
          suggestions?: SuggestionWord[]
          engine?: "dictionary" | "ai"
          aiAvailable?: boolean
        }

        setSuggestionPool(
          Array.isArray(data.suggestions) ? data.suggestions : []
        )
        setSuggestionPoolKey(suggestionRequestKey)
        setAiAvailable(Boolean(data.aiAvailable))
        setSuggestionEngine(data.engine === "ai" ? "ai" : "dictionary")
      } catch (requestError) {
        if (
          requestError instanceof Error &&
          requestError.name === "AbortError"
        ) {
          return
        }

        setSuggestionPool([])
        setSuggestionPoolKey("")
        setAiAvailable(false)
        setSuggestionEngine("dictionary")
      } finally {
        setIsSuggestionsLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [
    screen,
    session.difficulty,
    session.theme,
    session.title,
    session.words,
    suggestionRequestKey,
  ])

  useEffect(() => {
    if (!dragState) {
      return
    }

    const currentDrag = dragState

    function handlePointerMove(event: PointerEvent) {
      const board = boardRef.current
      if (!board) {
        return
      }

      const rect = board.getBoundingClientRect()
      const cellSize = rect.width / CANVAS_SIZE
      const deltaCol = Math.round(
        (event.clientX - currentDrag.startX) / cellSize
      )
      const deltaRow = Math.round(
        (event.clientY - currentDrag.startY) / cellSize
      )

      setSession((current) => {
        const dragWords = current.words.filter((word) =>
          currentDrag.wordIds.includes(word.id)
        )

        if (dragWords.length === 0) {
          return current
        }

        const minRow = Math.min(...dragWords.map((word) => word.row))
        const minCol = Math.min(...dragWords.map((word) => word.col))
        const maxRow = Math.max(
          ...dragWords.map(
            (word) =>
              word.row +
              (word.direction === "down" ? word.answer.length - 1 : 0)
          )
        )
        const maxCol = Math.max(
          ...dragWords.map(
            (word) =>
              word.col +
              (word.direction === "across" ? word.answer.length - 1 : 0)
          )
        )

        const clampedDeltaRow = Math.max(
          -minRow,
          Math.min(CANVAS_SIZE - 1 - maxRow, deltaRow)
        )
        const clampedDeltaCol = Math.max(
          -minCol,
          Math.min(CANVAS_SIZE - 1 - maxCol, deltaCol)
        )

        return {
          ...current,
          words: current.words.map((word) =>
            currentDrag.wordIds.includes(word.id)
              ? {
                  ...word,
                  row: currentDrag.positions[word.id].row + clampedDeltaRow,
                  col: currentDrag.positions[word.id].col + clampedDeltaCol,
                }
              : word
          ),
        }
      })
    }

    function handlePointerUp() {
      setDragState(null)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [dragState])

  function resetMessages() {
    setError("")
    setNotice("")
  }

  function handleCreateNew() {
    setSession(createEmptySession())
    setCustomWord("")
    setSelectedWordIds([])
    resetMessages()
    setScreen("details")
  }

  function handleOpenPuzzle(puzzle: CrosswordPuzzle) {
    setSession(createSessionFromPuzzle(puzzle))
    setCustomWord("")
    setSelectedWordIds([])
    setError("")
    setNotice(`Editing ${puzzle.title}. Use Edit words to reshape the layout.`)
    setScreen("clues")
  }

  function handleDetailsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!session.theme.trim()) {
      setError("Add a theme before continuing.")
      return
    }

    if (!session.title.trim()) {
      setError("Add a puzzle name before continuing.")
      return
    }

    if (!session.date) {
      setError("Choose a publish date.")
      return
    }

    const suggestions = buildSuggestions({
      theme: session.theme,
      title: session.title,
      difficulty: session.difficulty,
    })
    const recommended = recommendGridSize(
      suggestions
        .slice(0, 8)
        .map((suggestion) => ({ answer: suggestion.answer }))
    )
    const nextGridSize = FIXED_GRID_SIZES.includes(
      recommended.rows as 7 | 9 | 11
    )
      ? (recommended.rows as (typeof FIXED_GRID_SIZES)[number])
      : 9

    setSession((current) => ({
      ...current,
      gridSize: nextGridSize,
      words: [],
      shuffleSeed: 0,
    }))
    setCustomWord("")
    setError("")
    setNotice(
      suggestions.length > 0
        ? "Select words that connect. The preview updates as the crossword is rebuilt."
        : "No strong suggestions yet. Add custom words to start building the crossword."
    )
    setScreen("words")
  }

  function handleSuggestionAdd(answer: string, source: "suggested" | "custom") {
    const normalized = normalizeAnswer(answer)

    if (normalized.length < 3) {
      setError("Use words with at least 3 letters.")
      return
    }

    if (selectedAnswers.has(normalized)) {
      setError(`${normalized} is already selected.`)
      return
    }

    if (
      session.words.length > 0 &&
      previewWordPlacement({
        words: session.words.map((word) => ({ answer: word.answer })),
        answer: normalized,
      }).status !== "connected"
    ) {
      setError(`${normalized} does not connect with the current selection yet.`)
      return
    }

    const nextWords = [
      ...session.words,
      {
        id: createWordId(),
        answer: normalized,
        clue: "",
        meaning: "",
        row: boundaryOffset,
        col: boundaryOffset,
        direction: "across" as const,
        source,
      },
    ]

    const autoplaced = autoPlaceWords({
      words: nextWords,
      gridSize: session.gridSize,
      title: session.title,
      date: session.date,
      shuffleSeed: session.shuffleSeed,
    })

    if (!autoplaced) {
      setError(`Unable to place ${normalized} cleanly in the crossword.`)
      return
    }

    setSession((current) => ({ ...current, words: autoplaced }))
    setSelectedWordIds([])
    setError("")
    setNotice(`${normalized} added to the crossword.`)
    setCustomWord("")
  }

  function handleWordRemove(wordId: string) {
    const nextWords = session.words.filter((word) => word.id !== wordId)

    if (nextWords.length === 0) {
      setSession((current) => ({ ...current, words: [] }))
      setSelectedWordIds([])
      setNotice("Selection cleared.")
      setError("")
      return
    }

    const autoplaced = autoPlaceWords({
      words: nextWords,
      gridSize: session.gridSize,
      title: session.title,
      date: session.date,
      shuffleSeed: session.shuffleSeed,
    })

    setSession((current) => ({
      ...current,
      words: autoplaced ?? nextWords,
    }))
    setSelectedWordIds((current) => current.filter((id) => id !== wordId))
    setError("")
    setNotice("Word removed and suggestions recalculated.")
  }

  function handleShuffle() {
    if (session.words.length === 0) {
      setError("Select a few words before shuffling.")
      return
    }

    const nextSeed = session.shuffleSeed + 1
    const autoplaced = autoPlaceWords({
      words: session.words,
      gridSize: session.gridSize,
      title: session.title,
      date: session.date,
      shuffleSeed: nextSeed,
    })

    if (!autoplaced) {
      setError("Unable to generate a new layout for this selection.")
      return
    }

    setSession((current) => ({
      ...current,
      words: autoplaced,
      shuffleSeed: nextSeed,
    }))
    setSelectedWordIds([])
    setError("")
    setNotice(
      "Layout shuffled. Drag any word if you want to refine it manually."
    )
  }

  function handleToggleDirection(wordId: string) {
    setSession((current) => ({
      ...current,
      words: current.words.map((word) =>
        word.id === wordId
          ? {
              ...word,
              direction: word.direction === "across" ? "down" : "across",
            }
          : word
      ),
    }))
    setError("")
    setNotice("Word direction flipped. Save layout to validate the board.")
  }

  function handleSaveWordLayout() {
    const validation = validateEditorWords(
      session.words,
      session.gridSize,
      boundaryOffset
    )

    if (validation) {
      setError(validation)
      return
    }

    if (!derivedLayout) {
      setError(
        "Unable to build the crossword preview from these word positions."
      )
      return
    }

    setError("")
    setNotice("Layout saved. Add meanings and hints before publishing.")
    setScreen("clues")
  }

  function handleClueChange(
    wordId: string,
    field: "clue" | "meaning",
    value: string
  ) {
    setSession((current) => ({
      ...current,
      words: current.words.map((word) =>
        word.id === wordId ? { ...word, [field]: value } : word
      ),
    }))
  }

  async function handlePublish() {
    if (!databaseConnected) {
      setError("Connect the database before publishing.")
      return
    }

    const validation = validateEditorWords(
      session.words,
      session.gridSize,
      boundaryOffset
    )

    if (validation) {
      setError(validation)
      setScreen("words")
      return
    }

    if (!derivedLayout) {
      setError("Unable to build a valid crossword from the current layout.")
      return
    }

    const missingHints = session.words
      .filter((word) => !word.clue.trim())
      .map((word) => word.answer)

    if (missingHints.length > 0) {
      setError(`Add hints for: ${missingHints.join(", ")}.`)
      return
    }

    setIsPublishing(true)
    setError("")

    try {
      const puzzle = buildPuzzlePayload(session, derivedLayout)
      const response = await fetch("/api/puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(puzzle),
      })
      const data = (await response.json()) as {
        puzzle?: CrosswordPuzzle
        error?: string
      }

      if (!response.ok || !data.puzzle) {
        throw new Error(data.error ?? "Unable to publish this puzzle.")
      }

      setPuzzles((current) =>
        sortPuzzles([
          ...current.filter((item) => item.date !== data.puzzle!.date),
          data.puzzle!,
        ])
      )
      setSession(createSessionFromPuzzle(data.puzzle))
      setScreen("list")
      setNotice(`Published ${data.puzzle.title} for ${data.puzzle.date}.`)
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Unable to publish this puzzle."
      )
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-6 text-[#1e2b20] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {error ? (
          <section className="rounded-[24px] border border-[#e2c8b7] bg-[#fff5ef] px-5 py-4 text-sm text-[#91563a]">
            {error}
          </section>
        ) : null}

        {notice ? (
          <section className="rounded-[24px] border border-[#d9ddc8] bg-[#f7faf1] px-5 py-4 text-sm text-[#4f5f42]">
            {notice}
          </section>
        ) : null}

        {screen === "list" ? (
          <ProjectListing
            puzzles={puzzles}
            onCreateNew={handleCreateNew}
            onOpenPuzzle={handleOpenPuzzle}
          />
        ) : null}

        {screen === "details" ? (
          <PuzzleDetailsForm
            session={session}
            onBack={() => setScreen("list")}
            onChange={setSession}
            onSubmit={handleDetailsSubmit}
          />
        ) : null}

        {screen === "words" ? (
          <WordEditorScreen
            session={session}
            boundaryOffset={boundaryOffset}
            availableSuggestions={availableSuggestions}
            isSuggestionsLoading={isSuggestionsLoading}
            aiAvailable={aiAvailable}
            suggestionEngine={suggestionEngine}
            wordIssues={wordIssues}
            customWord={customWord}
            selectedWordIds={selectedWordIds}
            hoverPreview={hoverPreview}
            boardRef={boardRef}
            onBack={() => setScreen("details")}
            onCustomWordChange={setCustomWord}
            onAddSuggestion={handleSuggestionAdd}
            onSuggestionHoverChange={setHoveredSuggestion}
            onRemoveWord={handleWordRemove}
            onShuffle={handleShuffle}
            onToggleDirection={handleToggleDirection}
            onSelectAllWords={() =>
              setSelectedWordIds(session.words.map((word) => word.id))
            }
            onClearWordSelection={() => setSelectedWordIds([])}
            onSelectWords={setSelectedWordIds}
            onPointerDown={setDragState}
            onSaveLayout={handleSaveWordLayout}
            onGridSizeChange={(gridSize) => {
              setSession((current) => ({ ...current, gridSize }))
              setSelectedWordIds([])
              setNotice(`Grid changed to ${gridSize}x${gridSize}.`)
            }}
          />
        ) : null}

        {screen === "clues" ? (
          <ClueEditorScreen
            session={session}
            derivedLayout={derivedLayout}
            acrossWords={acrossWords ?? []}
            downWords={downWords ?? []}
            isPublishing={isPublishing}
            onBack={() => setScreen("list")}
            onEditWords={() => setScreen("words")}
            onChange={handleClueChange}
            onPublish={handlePublish}
          />
        ) : null}
      </div>
    </main>
  )
}

function ProjectListing({
  puzzles,
  onCreateNew,
  onOpenPuzzle,
}: {
  puzzles: CrosswordPuzzle[]
  onCreateNew: () => void
  onOpenPuzzle: (puzzle: CrosswordPuzzle) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [dateFilter, setDateFilter] = useState("")

  const filteredPuzzles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return puzzles.filter((puzzle) => {
      const matchesQuery =
        query.length === 0 ||
        [puzzle.title, puzzle.theme ?? "", puzzle.difficulty ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query)

      const matchesDate = !dateFilter || puzzle.date === dateFilter

      return matchesQuery && matchesDate
    })
  }, [dateFilter, puzzles, searchQuery])

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] border border-[#ddd6ca] bg-white shadow-[0_24px_70px_rgba(63,52,35,0.08)]">
        <div className="flex flex-col gap-5 border-b border-[#efe8dc] px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
              Project listing
            </h2>
            <p className="mt-2 text-sm text-[#6a7268]">
              Search by puzzle name, theme, or difficulty. You can also filter
              by publish date.
            </p>
          </div>

          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 rounded-full bg-[#28352b] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Create new puzzle
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-[#efe8dc] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#8d9386]" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search puzzles"
                className="w-full rounded-2xl border border-[#ddd6ca] bg-[#fbf9f4] py-3 pr-4 pl-11 text-sm outline-none focus:border-[#a99770]"
              />
            </label>

            <label className="relative md:w-[220px]">
              <Calendar className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#8d9386]" />
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                className="w-full rounded-2xl border border-[#ddd6ca] bg-[#fbf9f4] py-3 pr-4 pl-11 text-sm outline-none focus:border-[#a99770]"
              />
            </label>
          </div>

          <div className="text-sm text-[#6a7268]">
            {filteredPuzzles.length} of {puzzles.length} puzzles
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[1100px]">
            <div className="grid grid-cols-[44px_minmax(240px,1.8fr)_140px_120px_120px_140px_120px_56px] gap-4 px-6 py-4 text-[11px] font-semibold tracking-[0.22em] text-[#8a8f84] uppercase">
              <div>Select</div>
              <div>Puzzle</div>
              <div>Publish date</div>
              <div>Grid</div>
              <div>Words</div>
              <div>Status</div>
              <div>Difficulty</div>
              <div></div>
            </div>

            <div className="px-3 pb-3">
              {filteredPuzzles.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#ddd6ca] bg-[#fcfaf6] px-6 py-10 text-center text-sm text-[#71776e]">
                  No puzzles match the current search or date filter.
                </div>
              ) : (
                filteredPuzzles.map((puzzle, index) => {
                  const themeLabel = puzzle.theme?.trim() || "General"
                  const difficulty = normalizeDifficulty(puzzle.difficulty)
                  const statusTone = getStatusTone(puzzle.date)

                  return (
                    <button
                      key={puzzle.id}
                      type="button"
                      onClick={() => onOpenPuzzle(puzzle)}
                      className="grid w-full grid-cols-[44px_minmax(240px,1.8fr)_140px_120px_120px_140px_120px_56px] items-center gap-4 rounded-[24px] border border-transparent px-3 py-3 text-left transition hover:border-[#ddd6ca] hover:bg-[#fcfaf7]"
                    >
                      <div className="flex justify-center">
                        <span className="h-5 w-5 rounded-md border border-[#d3cdc1] bg-white" />
                      </div>

                      <div className="flex min-w-0 items-center gap-4">
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${getPuzzleIconTone(
                            index
                          )}`}
                        >
                          {getPuzzleMonogram(themeLabel, puzzle.title)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-semibold text-[#253126]">
                            {puzzle.title}
                          </div>
                          <div className="mt-1 truncate text-sm text-[#6b7369]">
                            {themeLabel}
                          </div>
                        </div>
                      </div>

                      <div className="text-sm font-medium text-[#4d594d]">
                        {formatDisplayDate(puzzle.date)}
                      </div>

                      <div className="text-sm font-medium text-[#4d594d]">
                        {puzzle.rows}x{puzzle.cols}
                      </div>

                      <div className="text-sm font-medium text-[#4d594d]">
                        {puzzle.clues.length}
                      </div>

                      <div>
                        <span className={getStatusBadgeClass(statusTone)}>
                          {statusTone.label}
                        </span>
                      </div>

                      <div>
                        <span className={getDifficultyBadgeClass(difficulty)}>
                          <CircleDot className="h-3.5 w-3.5 fill-current" />
                          {capitalize(difficulty)}
                        </span>
                      </div>

                      <div className="flex justify-center text-[#8a8f84]">
                        <MoreVertical className="h-4 w-4" />
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PuzzleDetailsForm({
  session,
  onBack,
  onChange,
  onSubmit,
}: {
  session: PuzzleSession
  onBack: () => void
  onChange: React.Dispatch<React.SetStateAction<PuzzleSession>>
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
    >
      <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-[#d8d1c4] bg-white px-4 py-2 text-sm font-semibold text-[#445045]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </button>

        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">
          Create new puzzle
        </h2>
        <p className="mt-2 text-sm text-[#5f675f]">
          Start with theme, puzzle name, difficulty, and publish date. The next
          step suggests connected words from that brief.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-[#455045]">Theme</span>
            <input
              value={session.theme}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  theme: event.target.value,
                }))
              }
              placeholder="Space adventure"
              className="rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 outline-none focus:border-[#8f7f5b]"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-[#455045]">Puzzle name</span>
            <input
              value={session.title}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Orbit Quest"
              className="rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 outline-none focus:border-[#8f7f5b]"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[#455045]">Difficulty</span>
              <select
                value={session.difficulty}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    difficulty: event.target.value as Difficulty,
                  }))
                }
                className="rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 capitalize outline-none focus:border-[#8f7f5b]"
              >
                {DIFFICULTY_OPTIONS.map((difficulty) => (
                  <option
                    key={difficulty}
                    value={difficulty}
                    className="capitalize"
                  >
                    {difficulty}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[#455045]">Publish date</span>
              <input
                type="date"
                value={session.date}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className="rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 outline-none focus:border-[#8f7f5b]"
              />
            </label>
          </div>

          <button
            type="submit"
            className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-[#28352b] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Sparkles className="h-4 w-4" />
            Suggest words
          </button>
        </div>
      </section>

      <aside className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">What happens next</h3>
        <div className="mt-4 space-y-4 text-sm text-[#5f675f]">
          <div className="rounded-2xl bg-[#f6f3ec] p-4">
            1. Suggestions come from a larger crossword dictionary, then AI
            reranks and expands them when available.
          </div>
          <div className="rounded-2xl bg-[#f6f3ec] p-4">
            2. Only words that connect to the current crossword remain visible.
          </div>
          <div className="rounded-2xl bg-[#f6f3ec] p-4">
            3. You can drag words freely, even outside the boundary, then save
            the layout when everything fits.
          </div>
        </div>
      </aside>
    </form>
  )
}

function WordEditorScreen({
  session,
  boundaryOffset,
  availableSuggestions,
  isSuggestionsLoading,
  aiAvailable,
  suggestionEngine,
  wordIssues,
  customWord,
  selectedWordIds,
  hoverPreview,
  boardRef,
  onBack,
  onCustomWordChange,
  onAddSuggestion,
  onSuggestionHoverChange,
  onRemoveWord,
  onShuffle,
  onToggleDirection,
  onSelectAllWords,
  onClearWordSelection,
  onSelectWords,
  onPointerDown,
  onSaveLayout,
  onGridSizeChange,
}: {
  session: PuzzleSession
  boundaryOffset: number
  availableSuggestions: SuggestionWord[]
  isSuggestionsLoading: boolean
  aiAvailable: boolean
  suggestionEngine: "dictionary" | "ai"
  wordIssues: Map<string, string[]>
  customWord: string
  selectedWordIds: string[]
  hoverPreview: HoverPreview | null
  boardRef: React.RefObject<HTMLDivElement | null>
  onBack: () => void
  onCustomWordChange: (value: string) => void
  onAddSuggestion: (answer: string, source: "suggested" | "custom") => void
  onSuggestionHoverChange: (answer: string | null) => void
  onRemoveWord: (wordId: string) => void
  onShuffle: () => void
  onToggleDirection: (wordId: string) => void
  onSelectAllWords: () => void
  onClearWordSelection: () => void
  onSelectWords: (wordIds: string[]) => void
  onPointerDown: React.Dispatch<React.SetStateAction<DragState | null>>
  onSaveLayout: () => void
  onGridSizeChange: (gridSize: number) => void
}) {
  const [lassoState, setLassoState] = useState<LassoState | null>(null)
  const selectedCount = selectedWordIds.length
  const allWordsSelected =
    session.words.length > 0 && selectedWordIds.length === session.words.length

  useEffect(() => {
    if (!lassoState) {
      return
    }

    function handlePointerMove(event: PointerEvent) {
      const board = boardRef.current
      if (!board) {
        return
      }

      const rect = board.getBoundingClientRect()
      setLassoState((current) =>
        current
          ? {
              ...current,
              currentX: clampToRange(event.clientX - rect.left, 0, rect.width),
              currentY: clampToRange(event.clientY - rect.top, 0, rect.height),
            }
          : current
      )
    }

    function handlePointerUp() {
      const currentLasso = lassoState
      if (!currentLasso) {
        return
      }

      const board = boardRef.current
      if (!board) {
        setLassoState(null)
        return
      }

      const rect = board.getBoundingClientRect()
      const wordIds = session.words
        .filter((word) => wordIntersectsLasso(word, currentLasso, rect.width))
        .map((word) => word.id)

      setLassoState(null)

      if (wordIds.length === 0) {
        onClearWordSelection()
        return
      }

      onSelectWords(wordIds)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [boardRef, lassoState, onClearWordSelection, onSelectWords, session.words])

  const lassoBounds = lassoState ? getLassoBounds(lassoState) : null

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="space-y-6">
        <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-[#d8d1c4] bg-white px-4 py-2 text-sm font-semibold text-[#445045]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to puzzle details
          </button>

          <div className="mt-5 space-y-3">
            <h2 className="text-xl font-semibold">Word selection and layout</h2>
            <div className="flex flex-wrap gap-2 text-xs text-[#5f675f]">
              <span className="rounded-full bg-[#f6f3ec] px-3 py-1">
                <Tags className="mr-1 inline h-3.5 w-3.5" />
                {session.theme}
              </span>
              <span className="rounded-full bg-[#f6f3ec] px-3 py-1 capitalize">
                {session.difficulty}
              </span>
              <span className="rounded-full bg-[#f6f3ec] px-3 py-1">
                <Calendar className="mr-1 inline h-3.5 w-3.5" />
                {session.date}
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-[0.18em] text-[#5d675c] uppercase">
                  Selected words
                </h3>
                <span className="text-xs text-[#7a7468]">
                  {selectedCount} selected
                </span>
              </div>
              <div className="space-y-2">
                {session.words.length === 0 ? (
                  <div className="rounded-2xl bg-[#f6f3ec] px-4 py-3 text-sm text-[#6a7268]">
                    Select a word to start the crossword.
                  </div>
                ) : (
                  session.words.map((word) => {
                    const issues = wordIssues.get(word.id) ?? []
                    const isSelected = selectedWordIds.includes(word.id)

                    return (
                      <div
                        key={word.id}
                        className={
                          isSelected
                            ? "rounded-2xl border border-[#8f7f5b] bg-[#fffaf0] px-4 py-3"
                            : "rounded-2xl border border-[#e2ddd2] bg-[#faf8f3] px-4 py-3"
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#243026]">
                              {word.answer}
                            </div>
                            <div className="text-xs text-[#667063]">
                              {word.direction} at{" "}
                              {word.row - boundaryOffset + 1},{" "}
                              {word.col - boundaryOffset + 1}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onToggleDirection(word.id)}
                              className="rounded-full border border-[#d8d1c4] bg-white px-3 py-1 text-xs font-semibold text-[#445045]"
                            >
                              Flip
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveWord(word.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ddd7cb] bg-white text-[#6f675c]"
                              aria-label={`Remove ${word.answer}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {issues.length > 0 ? (
                          <div className="mt-2 text-xs text-[#9a5d45]">
                            {issues.join(" ")}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold tracking-[0.18em] text-[#5d675c] uppercase">
                Add custom word
              </h3>
              <div className="mt-2 flex gap-2">
                <input
                  value={customWord}
                  onChange={(event) => onCustomWordChange(event.target.value)}
                  placeholder="Type a custom word"
                  className="min-w-0 flex-1 rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 uppercase outline-none focus:border-[#8f7f5b]"
                />
                <button
                  type="button"
                  onClick={() => onAddSuggestion(customWord, "custom")}
                  className="rounded-full bg-[#28352b] px-4 py-2 text-sm font-semibold text-white"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-[0.18em] text-[#5d675c] uppercase">
                  Suggested words
                </h3>
                <div className="text-right text-xs text-[#7a7468]">
                  <div>{availableSuggestions.length} connect right now</div>
                  <div>
                    {isSuggestionsLoading
                      ? "Refreshing suggestions..."
                      : suggestionEngine === "ai"
                        ? "AI-ranked crossword builder"
                        : aiAvailable
                          ? "Dictionary fallback"
                          : "AI not configured, using dictionary"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableSuggestions.length === 0 ? (
                  <div className="rounded-2xl bg-[#f6f3ec] px-4 py-3 text-sm text-[#6a7268]">
                    No more connected suggestions for the current selection.
                    Remove a word or add a custom one that crosses the existing
                    board.
                  </div>
                ) : (
                  availableSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.answer}
                      type="button"
                      onMouseEnter={() =>
                        onSuggestionHoverChange(suggestion.answer)
                      }
                      onMouseLeave={() => onSuggestionHoverChange(null)}
                      onFocus={() => onSuggestionHoverChange(suggestion.answer)}
                      onBlur={() => onSuggestionHoverChange(null)}
                      onClick={() =>
                        onAddSuggestion(suggestion.answer, "suggested")
                      }
                      className="rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#445045]"
                    >
                      {suggestion.answer}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onShuffle}
              className="inline-flex items-center gap-2 rounded-full border border-[#d8d1c4] bg-white px-4 py-2 text-sm font-semibold text-[#445045]"
            >
              <Shuffle className="h-4 w-4" />
              Shuffle position
            </button>

            <button
              type="button"
              onClick={onSaveLayout}
              className="inline-flex items-center gap-2 rounded-full bg-[#28352b] px-4 py-2 text-sm font-semibold text-white"
            >
              <LayoutGrid className="h-4 w-4" />
              Save word layout
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-2 text-sm font-medium text-[#455045]">
                Grid size
              </div>
              <div className="flex gap-2">
                {FIXED_GRID_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onGridSizeChange(size)}
                    className={
                      size === session.gridSize
                        ? "rounded-full border border-[#8f7f5b] bg-[#8f7f5b] px-3 py-1.5 text-xs font-semibold text-white"
                        : "rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f]"
                    }
                  >
                    {size}x{size}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSelectAllWords}
                disabled={session.words.length === 0 || allWordsSelected}
                className="rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select all words
              </button>
              <button
                type="button"
                onClick={onClearWordSelection}
                disabled={selectedWordIds.length === 0}
                className="rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear selection
              </button>
            </div>

            <div className="rounded-2xl bg-[#f6f3ec] px-4 py-3 text-sm text-[#5f675f]">
              Drag words anywhere in the preview. You can also drag a lasso over
              empty space to select multiple words, then move that selection as
              a group. Words can sit outside the official boundary while you
              experiment, but saving will fail until every word is back inside
              the highlighted square.
            </div>
          </div>
        </section>
      </section>

      <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm xl:sticky xl:top-6 xl:self-start">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Crossword preview</h2>
            <p className="mt-1 text-sm text-[#5f675f]">
              Drag any word directly inside the preview to reposition it.
            </p>
          </div>
          <div className="rounded-full bg-[#eef1e8] px-3 py-1 text-xs font-semibold text-[#445045]">
            {session.gridSize}x{session.gridSize} boundary
          </div>
        </div>

        <div className="mt-5 flex justify-center">
          <div className="w-full max-w-[760px]">
            <div
              ref={boardRef}
              onPointerDown={(event) => {
                if (!(event.target instanceof Element)) {
                  return
                }

                if (event.target.closest("[data-word-tile='true']")) {
                  return
                }

                const rect = event.currentTarget.getBoundingClientRect()
                setLassoState({
                  startX: clampToRange(
                    event.clientX - rect.left,
                    0,
                    rect.width
                  ),
                  startY: clampToRange(
                    event.clientY - rect.top,
                    0,
                    rect.height
                  ),
                  currentX: clampToRange(
                    event.clientX - rect.left,
                    0,
                    rect.width
                  ),
                  currentY: clampToRange(
                    event.clientY - rect.top,
                    0,
                    rect.height
                  ),
                })
              }}
              className="relative aspect-square w-full overflow-hidden rounded-[28px] border border-[#d8d1c4] bg-[#f6f3ec]"
            >
              <div
                className="grid h-full w-full gap-[2px] bg-[#ddd6c8] p-3"
                style={{
                  gridTemplateColumns: `repeat(${CANVAS_SIZE}, minmax(0, 1fr))`,
                }}
              >
                {Array.from(
                  { length: CANVAS_SIZE * CANVAS_SIZE },
                  (_, index) => {
                    const row = Math.floor(index / CANVAS_SIZE)
                    const col = index % CANVAS_SIZE
                    const insideBoundary =
                      row >= boundaryOffset &&
                      row < boundaryOffset + session.gridSize &&
                      col >= boundaryOffset &&
                      col < boundaryOffset + session.gridSize

                    return (
                      <div
                        key={keyFor(row, col)}
                        className={
                          insideBoundary
                            ? "rounded-[6px] bg-white"
                            : "rounded-[6px] bg-[#efe7d7]"
                        }
                      />
                    )
                  }
                )}
              </div>

              <div
                className="pointer-events-none absolute border-2 border-dashed border-[#8f7f5b]/70"
                style={{
                  left: `${(boundaryOffset / CANVAS_SIZE) * 100}%`,
                  top: `${(boundaryOffset / CANVAS_SIZE) * 100}%`,
                  width: `${(session.gridSize / CANVAS_SIZE) * 100}%`,
                  height: `${(session.gridSize / CANVAS_SIZE) * 100}%`,
                }}
              />

              {lassoBounds ? (
                <div
                  className="pointer-events-none absolute rounded-[12px] border border-[#8f7f5b] bg-[#8f7f5b]/10"
                  style={{
                    left: lassoBounds.left,
                    top: lassoBounds.top,
                    width: lassoBounds.width,
                    height: lassoBounds.height,
                  }}
                />
              ) : null}

              {session.words.map((word) => {
                const issues = wordIssues.get(word.id) ?? []
                const isInvalid = issues.length > 0
                const isSelected = selectedWordIds.includes(word.id)
                const tileLength = word.answer.length
                const width = word.direction === "across" ? tileLength : 1
                const height = word.direction === "down" ? tileLength : 1

                return (
                  <div
                    key={word.id}
                    className="absolute"
                    style={{
                      left: `${(word.col / CANVAS_SIZE) * 100}%`,
                      top: `${(word.row / CANVAS_SIZE) * 100}%`,
                      width: `${(width / CANVAS_SIZE) * 100}%`,
                      height: `${(height / CANVAS_SIZE) * 100}%`,
                    }}
                  >
                    <button
                      data-word-tile="true"
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault()
                        const activeWordIds = isSelected
                          ? selectedWordIds
                          : [word.id]
                        onPointerDown({
                          wordIds: activeWordIds,
                          startX: event.clientX,
                          startY: event.clientY,
                          positions: Object.fromEntries(
                            session.words
                              .filter((item) => activeWordIds.includes(item.id))
                              .map((item) => [
                                item.id,
                                { row: item.row, col: item.col },
                              ])
                          ),
                        })
                      }}
                      className={
                        isInvalid
                          ? "group relative flex h-full w-full cursor-grab rounded-[14px] bg-[#fff0eb] shadow-[0_10px_22px_rgba(70,34,20,0.14)] select-none active:cursor-grabbing"
                          : isSelected
                            ? "group relative flex h-full w-full cursor-grab rounded-[14px] bg-[#fffaf0] shadow-[0_10px_22px_rgba(29,44,35,0.12)] ring-2 ring-[#8f7f5b] select-none active:cursor-grabbing"
                            : "group relative flex h-full w-full cursor-grab rounded-[14px] bg-white shadow-[0_10px_22px_rgba(29,44,35,0.12)] select-none active:cursor-grabbing"
                      }
                    >
                      <div
                        className={
                          word.direction === "across"
                            ? "grid h-full w-full gap-[2px] p-[3px]"
                            : "grid h-full w-full gap-[2px] p-[3px]"
                        }
                        style={{
                          gridTemplateColumns:
                            word.direction === "across"
                              ? `repeat(${tileLength}, minmax(0, 1fr))`
                              : "repeat(1, minmax(0, 1fr))",
                          gridTemplateRows:
                            word.direction === "down"
                              ? `repeat(${tileLength}, minmax(0, 1fr))`
                              : "repeat(1, minmax(0, 1fr))",
                        }}
                      >
                        {word.answer.split("").map((letter, index) => (
                          <span
                            key={`${word.id}-${index}`}
                            className={
                              isInvalid
                                ? "flex items-center justify-center rounded-[10px] border border-[#efcabc] bg-[#fff7f3] text-[clamp(11px,1.1vw,14px)] font-semibold text-[#8c5138]"
                                : "flex items-center justify-center rounded-[10px] border border-[#d8d1c4] bg-[#fffdf8] text-[clamp(11px,1.1vw,14px)] font-semibold text-[#1f2a22]"
                            }
                          >
                            {letter}
                          </span>
                        ))}
                      </div>

                      <span className="pointer-events-none absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-[#28352b] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        <GripVertical className="h-2.5 w-2.5" />
                        {word.direction === "across" ? "A" : "D"}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function ClueEditorScreen({
  session,
  derivedLayout,
  acrossWords,
  downWords,
  isPublishing,
  onBack,
  onEditWords,
  onChange,
  onPublish,
}: {
  session: PuzzleSession
  derivedLayout: DerivedLayout | null
  acrossWords: DerivedWord[]
  downWords: DerivedWord[]
  isPublishing: boolean
  onBack: () => void
  onEditWords: () => void
  onChange: (wordId: string, field: "clue" | "meaning", value: string) => void
  onPublish: () => void
}) {
  const wordByAnswer = useMemo(
    () => new Map(session.words.map((word) => [word.answer, word])),
    [session.words]
  )

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-6">
        <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full border border-[#d8d1c4] bg-white px-4 py-2 text-sm font-semibold text-[#445045]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to projects
            </button>

            <button
              type="button"
              onClick={onEditWords}
              className="inline-flex items-center gap-2 rounded-full border border-[#d8d1c4] bg-white px-4 py-2 text-sm font-semibold text-[#445045]"
            >
              <PencilLine className="h-4 w-4" />
              Edit words
            </button>

            <button
              type="button"
              onClick={onPublish}
              disabled={isPublishing || !derivedLayout}
              className="inline-flex items-center gap-2 rounded-full bg-[#28352b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#8d9687]"
            >
              {isPublishing ? "Publishing..." : "Publish puzzle"}
            </button>
          </div>

          <div className="mt-5 grid gap-3 text-sm text-[#5f675f] md:grid-cols-2">
            <div className="rounded-2xl bg-[#f6f3ec] px-4 py-3">
              <span className="font-semibold text-[#243026]">Theme:</span>{" "}
              {session.theme}
            </div>
            <div className="rounded-2xl bg-[#f6f3ec] px-4 py-3 capitalize">
              <span className="font-semibold text-[#243026]">Difficulty:</span>{" "}
              {session.difficulty}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <ClueColumn
            title="Across"
            items={acrossWords}
            wordByAnswer={wordByAnswer}
            onChange={onChange}
          />
          <ClueColumn
            title="Down"
            items={downWords}
            wordByAnswer={wordByAnswer}
            onChange={onChange}
          />
        </div>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-4 shadow-sm">
          {derivedLayout ? (
            <CrosswordPreview
              draft={derivedLayout.draft}
              words={derivedLayout.words}
            />
          ) : (
            <div className="rounded-[24px] bg-[#f6f3ec] px-4 py-6 text-sm text-[#6a7268]">
              Save a valid word layout first to preview the crossword here.
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={onEditWords}
          className="w-full rounded-full border border-[#d8d1c4] bg-white px-4 py-3 text-sm font-semibold text-[#445045]"
        >
          Edit words
        </button>
      </aside>
    </div>
  )
}

function ClueColumn({
  title,
  items,
  wordByAnswer,
  onChange,
}: {
  title: string
  items: DerivedWord[]
  wordByAnswer: Map<string, EditorWord>
  onChange: (wordId: string, field: "clue" | "meaning", value: string) => void
}) {
  return (
    <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>

      <div className="mt-5 space-y-4">
        {items.length === 0 ? (
          <div className="rounded-2xl bg-[#f6f3ec] px-4 py-4 text-sm text-[#6a7268]">
            No {title.toLowerCase()} words in this layout.
          </div>
        ) : (
          items.map((item) => {
            const source = wordByAnswer.get(item.answer)
            if (!source) {
              return null
            }

            return (
              <div key={item.id} className="rounded-2xl bg-[#f6f3ec] p-4">
                <div className="text-sm font-semibold text-[#243026]">
                  {item.number}. {item.answer}
                </div>
                <div className="mt-1 text-xs text-[#667063]">
                  {item.answer.length} letters
                </div>
                <textarea
                  rows={3}
                  value={source.clue}
                  onChange={(event) =>
                    onChange(source.id, "clue", event.target.value)
                  }
                  placeholder="Hint"
                  className="mt-3 w-full resize-none rounded-xl border border-[#d6d0c3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8f7f5b]"
                />
                <textarea
                  rows={3}
                  value={source.meaning}
                  onChange={(event) =>
                    onChange(source.id, "meaning", event.target.value)
                  }
                  placeholder="Meaning"
                  className="mt-2 w-full resize-none rounded-xl border border-[#d6d0c3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8f7f5b]"
                />
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function createEmptySession(): PuzzleSession {
  return {
    id: null,
    title: "",
    theme: "",
    difficulty: "medium",
    date: getLocalDateKey(),
    gridSize: 9,
    words: [],
    shuffleSeed: 0,
  }
}

function createSessionFromPuzzle(puzzle: CrosswordPuzzle): PuzzleSession {
  const boundaryOffset = getBoundaryOffset(puzzle.rows)

  return {
    id: puzzle.id,
    title: puzzle.title,
    theme: puzzle.theme?.trim() || "",
    difficulty: normalizeDifficulty(puzzle.difficulty),
    date: puzzle.date,
    gridSize: FIXED_GRID_SIZES.includes(
      puzzle.rows as (typeof FIXED_GRID_SIZES)[number]
    )
      ? puzzle.rows
      : 9,
    words: puzzle.clues.map((clue) => ({
      id: createWordId(),
      answer: normalizeAnswer(clue.answer),
      clue: clue.clue,
      meaning: clue.meaning,
      row: clue.row + boundaryOffset,
      col: clue.col + boundaryOffset,
      direction: clue.direction,
      source: "suggested",
    })),
    shuffleSeed: 0,
  }
}

function normalizeDifficulty(value?: string): Difficulty {
  return value === "easy" || value === "hard" ? value : "medium"
}

function getStatusTone(date: string) {
  const today = getLocalDateKey()

  if (date < today) {
    return { label: "Published", tone: "published" as const }
  }

  if (date === today) {
    return { label: "Live", tone: "live" as const }
  }

  return { label: "Scheduled", tone: "scheduled" as const }
}

function getStatusBadgeClass(status: ReturnType<typeof getStatusTone>) {
  if (status.tone === "published") {
    return "inline-flex items-center rounded-full bg-[#f3ecff] px-3 py-1 text-xs font-semibold text-[#8357b8]"
  }

  if (status.tone === "live") {
    return "inline-flex items-center gap-1 rounded-full bg-[#e9fbf2] px-3 py-1 text-xs font-semibold text-[#33a06f]"
  }

  return "inline-flex items-center rounded-full bg-[#eef7ff] px-3 py-1 text-xs font-semibold text-[#4d83b6]"
}

function getDifficultyBadgeClass(difficulty: Difficulty) {
  if (difficulty === "easy") {
    return "inline-flex items-center gap-1 rounded-full bg-[#edf6ff] px-3 py-1 text-xs font-semibold text-[#5485c5]"
  }

  if (difficulty === "hard") {
    return "inline-flex items-center gap-1 rounded-full bg-[#fff1f0] px-3 py-1 text-xs font-semibold text-[#d06666]"
  }

  return "inline-flex items-center gap-1 rounded-full bg-[#fff7eb] px-3 py-1 text-xs font-semibold text-[#cf8b38]"
}

function getPuzzleMonogram(theme: string, title: string) {
  const source = `${theme} ${title}`.trim()
  const tokens = source.split(/\s+/).filter(Boolean)

  if (tokens.length === 0) {
    return "CW"
  }

  return tokens
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("")
}

function getPuzzleIconTone(index: number) {
  const tones = [
    "bg-[#eaf3ff] text-[#4e7cc4]",
    "bg-[#fff1ea] text-[#cb6c43]",
    "bg-[#f2ecff] text-[#8362b6]",
    "bg-[#eefaf1] text-[#4d9e69]",
    "bg-[#fff7de] text-[#c29a2f]",
  ]

  return tones[index % tones.length]
}

function formatDisplayDate(date: string) {
  const [year, month, day] = date.split("-")

  if (!year || !month || !day) {
    return date
  }

  return `${day}/${month}/${year}`
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function autoPlaceWords({
  words,
  gridSize,
  title,
  date,
  shuffleSeed,
}: {
  words: EditorWord[]
  gridSize: number
  title: string
  date: string
  shuffleSeed: number
}) {
  const generated = generateDraftFromWordList({
    words: words.map((word) => ({ answer: word.answer })),
    rows: gridSize,
    cols: gridSize,
    title,
    date,
    shuffleSeed,
  })

  if (
    generated.unplacedWords.length > 0 ||
    generated.placedWords.length !== words.length
  ) {
    return null
  }

  const derivedWords = deriveWordsFromDraft(generated.draft)
  const byAnswer = new Map(words.map((word) => [word.answer, word]))
  const boundaryOffset = getBoundaryOffset(gridSize)

  return derivedWords.map((word) => {
    const existing = byAnswer.get(word.answer)

    return {
      id: existing?.id ?? createWordId(),
      answer: word.answer,
      clue: existing?.clue ?? "",
      meaning: existing?.meaning ?? "",
      row: word.row + boundaryOffset,
      col: word.col + boundaryOffset,
      direction: word.direction,
      source: existing?.source ?? "suggested",
    }
  })
}

function buildDerivedLayout(session: PuzzleSession, boundaryOffset: number) {
  if (session.words.length === 0) {
    return null
  }

  if (
    session.words.some((word) =>
      isOutOfBounds(word, session.gridSize, boundaryOffset)
    )
  ) {
    return null
  }

  const placements = session.words.map((word) =>
    toManualPlacement(word, boundaryOffset)
  )
  const result = buildDraftFromManualPlacements({
    placements,
    rows: session.gridSize,
    cols: session.gridSize,
    title: session.title,
    date: session.date,
  })

  if (!result.draft) {
    return null
  }

  result.draft.id = session.id
  result.draft.clues = {}
  const derivedWords = deriveWordsFromDraft(result.draft).map((word) => {
    const source = session.words.find((item) => item.answer === word.answer)
    return {
      ...word,
      clue: source?.clue ?? "",
      meaning: source?.meaning ?? "",
    }
  })

  result.draft.clues = Object.fromEntries(
    derivedWords.map((word) => [word.id, word.clue])
  )

  return {
    draft: result.draft,
    words: derivedWords,
  }
}

function validateEditorWords(
  words: EditorWord[],
  gridSize: number,
  boundaryOffset: number
) {
  if (words.length === 0) {
    return "Select at least one word before saving the puzzle."
  }

  const duplicates = findDuplicates(words.map((word) => word.answer))
  if (duplicates.length > 0) {
    return `Duplicate answers are not allowed: ${duplicates.join(", ")}.`
  }

  const outOfBounds = words
    .filter((word) => isOutOfBounds(word, gridSize, boundaryOffset))
    .map((word) => word.answer)

  if (outOfBounds.length > 0) {
    return `Move these words back inside the boundary before saving: ${outOfBounds.join(", ")}.`
  }

  const placements = words.map((word) =>
    toManualPlacement(word, boundaryOffset)
  )

  for (const word of words) {
    const validation = validateManualWordPlacement({
      rows: gridSize,
      cols: gridSize,
      placements,
      candidate: toManualPlacement(word, boundaryOffset),
    })

    if (!validation.valid) {
      return validation.reason ?? `Invalid placement for ${word.answer}.`
    }
  }

  const built = buildDraftFromManualPlacements({
    placements,
    rows: gridSize,
    cols: gridSize,
    title: "",
    date: getLocalDateKey(),
  })

  if (!built.draft) {
    return built.error ?? "Unable to build the crossword from these positions."
  }

  return null
}

function getWordIssues(
  words: EditorWord[],
  gridSize: number,
  boundaryOffset: number
) {
  const issues = new Map<string, string[]>()
  const placements = words.map((word) =>
    toManualPlacement(word, boundaryOffset)
  )

  words.forEach((word) => {
    const bucket: string[] = []

    if (isOutOfBounds(word, gridSize, boundaryOffset)) {
      bucket.push("Outside the crossword boundary.")
    } else {
      const validation = validateManualWordPlacement({
        rows: gridSize,
        cols: gridSize,
        placements,
        candidate: toManualPlacement(word, boundaryOffset),
      })

      if (!validation.valid) {
        bucket.push(validation.reason ?? "Placement conflict.")
      }
    }

    if (bucket.length > 0) {
      issues.set(word.id, bucket)
    }
  })

  return issues
}

function buildPuzzlePayload(
  session: PuzzleSession,
  layout: DerivedLayout
): CrosswordPuzzle {
  return {
    id: session.id ?? createPuzzleId(session.title, session.date),
    title: session.title.trim(),
    theme: session.theme.trim(),
    difficulty: session.difficulty,
    date: session.date,
    rows: session.gridSize,
    cols: session.gridSize,
    clues: layout.words.map((word) => {
      const source = session.words.find((item) => item.answer === word.answer)

      return {
        id: word.id,
        number: word.number,
        direction: word.direction,
        clue: source?.clue.trim() ?? "",
        meaning: source?.meaning.trim() ?? "",
        answer: word.answer,
        row: word.row,
        col: word.col,
      }
    }),
    givenCells: [],
  }
}

function toManualPlacement(
  word: EditorWord,
  boundaryOffset: number
): ManualWordPlacement {
  return {
    id: word.id,
    answer: word.answer,
    row: word.row - boundaryOffset,
    col: word.col - boundaryOffset,
    direction: word.direction,
  }
}

function isOutOfBounds(
  word: EditorWord,
  gridSize: number,
  boundaryOffset: number
) {
  const startRow = word.row - boundaryOffset
  const startCol = word.col - boundaryOffset
  const endRow =
    startRow + (word.direction === "down" ? word.answer.length - 1 : 0)
  const endCol =
    startCol + (word.direction === "across" ? word.answer.length - 1 : 0)

  return (
    startRow < 0 || startCol < 0 || endRow >= gridSize || endCol >= gridSize
  )
}

function findDuplicates(values: string[]) {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
}

function createPuzzleId(title: string, date: string) {
  return `${
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "crossword"
  }-${date}`
}

function getBoundaryOffset(gridSize: number) {
  return Math.floor((CANVAS_SIZE - gridSize) / 2)
}

function clampToCanvas(value: number) {
  return Math.max(0, Math.min(CANVAS_SIZE - 1, value))
}

function clampToRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getLassoBounds(lasso: LassoState) {
  const left = Math.min(lasso.startX, lasso.currentX)
  const top = Math.min(lasso.startY, lasso.currentY)
  const width = Math.abs(lasso.currentX - lasso.startX)
  const height = Math.abs(lasso.currentY - lasso.startY)

  return { left, top, width, height }
}

function wordIntersectsLasso(
  word: EditorWord,
  lasso: LassoState,
  boardWidth: number
) {
  const cellSize = boardWidth / CANVAS_SIZE
  const wordLeft = word.col * cellSize
  const wordTop = word.row * cellSize
  const wordWidth =
    (word.direction === "across" ? word.answer.length : 1) * cellSize
  const wordHeight =
    (word.direction === "down" ? word.answer.length : 1) * cellSize
  const bounds = getLassoBounds(lasso)

  return !(
    wordLeft + wordWidth < bounds.left ||
    wordLeft > bounds.left + bounds.width ||
    wordTop + wordHeight < bounds.top ||
    wordTop > bounds.top + bounds.height
  )
}

function sortPuzzles(puzzles: CrosswordPuzzle[]) {
  return [...puzzles].sort((left, right) => left.date.localeCompare(right.date))
}

function createWordId() {
  const id = `word-${nextWordId}`
  nextWordId += 1
  return id
}
