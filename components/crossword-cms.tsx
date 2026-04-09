"use client"

import { useEffect, useMemo, useState } from "react"
import { RotateCw, Trash2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  buildDraftFromManualPlacements,
  deriveWordsFromDraft,
  FIXED_GRID_SIZES,
  keyFor,
  validateManualWordPlacement,
  type CrosswordDraft,
  type ManualWordPlacement,
} from "@/lib/crossword-editor"
import {
  getLocalDateKey,
  type CrosswordPuzzle,
  type Direction,
} from "@/lib/crossword-schedule"

type EditorWord = {
  id: string
  answer: string
  clue: string
  meaning: string
  row: number
  col: number
  direction: Direction
}

type GridCell = {
  letter: string
  number: number | null
  filled: boolean
}

type ClueItem = {
  id: string
  sourceWordId: string
  number: number
  clue: string
  meaning: string
  answer: string
  row: number
  col: number
  direction: Direction
}

type LayoutResult = {
  draft: CrosswordDraft | null
  cells: GridCell[][]
  across: ClueItem[]
  down: ClueItem[]
  recommendationLabel: string
}

type CellPoint = { row: number; col: number }

let nextWordId = 1

export function CrosswordCms({
  initialPuzzles,
  databaseConnected,
}: {
  initialPuzzles: CrosswordPuzzle[]
  databaseConnected: boolean
}) {
  const [puzzles, setPuzzles] = useState(initialPuzzles)
  const [title, setTitle] = useState("Untitled Puzzle")
  const [scheduledDate, setScheduledDate] = useState(getLocalDateKey())
  const [gridSize, setGridSize] = useState<(typeof FIXED_GRID_SIZES)[number]>(9)
  const [words, setWords] = useState<EditorWord[]>([])
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([])
  const [error, setError] = useState("")
  const [saveMessage, setSaveMessage] = useState(
    databaseConnected
      ? "Click any grid cell to add words directly on the board."
      : "Database offline. You can still build and preview locally."
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadOpen, setIsLoadOpen] = useState(false)
  const [selectedLoadDate, setSelectedLoadDate] = useState(
    initialPuzzles.at(-1)?.date ?? ""
  )
  const [composer, setComposer] = useState<{
    open: boolean
    row: number
    col: number
    direction: Direction
    answer: string
  }>({
    open: false,
    row: 0,
    col: 0,
    direction: "across",
    answer: "",
  })
  const [lasso, setLasso] = useState<{
    start: CellPoint
    end: CellPoint
  } | null>(null)
  const [dragState, setDragState] = useState<{
    ids: string[]
    start: CellPoint
    current: CellPoint
  } | null>(null)

  const scheduledDates = useMemo(
    () =>
      puzzles
        .map((puzzle) => puzzle.date)
        .sort((left, right) => left.localeCompare(right)),
    [puzzles]
  )

  const layout = useMemo(
    () =>
      buildEditorLayout({
        words,
        rows: gridSize,
        cols: gridSize,
        title,
        date: scheduledDate,
      }),
    [gridSize, scheduledDate, title, words]
  )

  const wordById = useMemo(
    () => new Map(words.map((word) => [word.id, word])),
    [words]
  )

  const occupancy = useMemo(() => {
    const map = new Map<string, string[]>()

    words.forEach((word) => {
      wordCells(word).forEach((cell) => {
        const cellKey = keyFor(cell.row, cell.col)
        const bucket = map.get(cellKey) ?? []
        bucket.push(word.id)
        map.set(cellKey, bucket)
      })
    })

    return map
  }, [words])

  const selectedCellKeys = useMemo(() => {
    const keys = new Set<string>()

    selectedWordIds.forEach((id) => {
      const word = wordById.get(id)
      if (!word) {
        return
      }

      wordCells(word).forEach((cell) => keys.add(keyFor(cell.row, cell.col)))
    })

    return keys
  }, [selectedWordIds, wordById])

  const lassoSelectionPreview = useMemo(() => {
    if (!lasso) {
      return new Set<string>()
    }

    const next = new Set<string>()
    words.forEach((word) => {
      if (
        wordCells(word).some((cell) =>
          pointIsInRect(cell, lasso.start, lasso.end)
        )
      ) {
        next.add(word.id)
      }
    })
    return next
  }, [lasso, words])

  const previewSelection = lasso
    ? lassoSelectionPreview
    : new Set(selectedWordIds)

  const hasScheduledDate = scheduledDates.includes(scheduledDate)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.key !== "Backspace" && event.key !== "Delete") ||
        selectedWordIds.length === 0
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      event.preventDefault()
      setWords((current) =>
        current.filter((word) => !selectedWordIds.includes(word.id))
      )
      setSelectedWordIds([])
      setSaveMessage("Removed selected words from the grid.")
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedWordIds])

  function openComposer(row: number, col: number) {
    setComposer({
      open: true,
      row,
      col,
      direction: "across",
      answer: "",
    })
    setError("")
  }

  function closeComposer() {
    setComposer((current) => ({ ...current, open: false, answer: "" }))
  }

  function handleComposerSave() {
    const answer = normalizeAnswer(composer.answer)

    if (answer.length < 3) {
      setError("Enter a word with at least 3 letters.")
      return
    }

    if (answer.length > gridSize) {
      setError(`Keep answers to ${gridSize} letters or fewer for this grid.`)
      return
    }

    if (words.some((word) => word.answer === answer)) {
      setError("That answer already exists. Use a unique word.")
      return
    }

    const candidate: EditorWord = {
      id: createWordId(),
      answer,
      clue: "",
      meaning: "",
      row: composer.row,
      col: composer.col,
      direction: composer.direction,
    }

    const nextWords = [...words, candidate]
    const validationError = validateWordSet(nextWords, gridSize, gridSize)

    if (validationError) {
      setError(validationError)
      return
    }

    setWords(nextWords)
    setSelectedWordIds([candidate.id])
    setSaveMessage(
      `Added ${candidate.answer} at row ${candidate.row + 1}, col ${candidate.col + 1}.`
    )
    setError("")
    closeComposer()
  }

  function handleCellMouseDown(
    row: number,
    col: number,
    event: React.MouseEvent<HTMLDivElement>
  ) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    closeComposer()

    const idsAtCell = occupancy.get(keyFor(row, col)) ?? []

    if (idsAtCell.length > 0) {
      const primaryId = idsAtCell[0]
      const withModifier = event.shiftKey || event.metaKey || event.ctrlKey

      if (withModifier) {
        setSelectedWordIds((current) =>
          current.includes(primaryId)
            ? current.filter((id) => id !== primaryId)
            : [...current, primaryId]
        )
        return
      }

      const dragIds = selectedWordIds.includes(primaryId)
        ? selectedWordIds
        : [primaryId]
      setSelectedWordIds(dragIds)
      setDragState({
        ids: dragIds,
        start: { row, col },
        current: { row, col },
      })
      return
    }

    setSelectedWordIds([])
    setLasso({ start: { row, col }, end: { row, col } })
  }

  function handleCellMouseEnter(row: number, col: number) {
    if (dragState) {
      setDragState((current) =>
        current ? { ...current, current: { row, col } } : current
      )
      return
    }

    if (lasso) {
      setLasso((current) =>
        current ? { ...current, end: { row, col } } : current
      )
    }
  }

  function finishPointerAction() {
    if (dragState) {
      const deltaRow = dragState.current.row - dragState.start.row
      const deltaCol = dragState.current.col - dragState.start.col

      if (deltaRow !== 0 || deltaCol !== 0) {
        const nextWords = words.map((word) =>
          dragState.ids.includes(word.id)
            ? {
                ...word,
                row: word.row + deltaRow,
                col: word.col + deltaCol,
              }
            : word
        )
        const validationError = validateWordSet(nextWords, gridSize, gridSize)

        if (validationError) {
          setError(validationError)
        } else {
          setWords(nextWords)
          setError("")
          setSaveMessage("Moved selected words.")
        }
      }

      setDragState(null)
      return
    }

    if (lasso) {
      const next = words
        .filter((word) =>
          wordCells(word).some((cell) =>
            pointIsInRect(cell, lasso.start, lasso.end)
          )
        )
        .map((word) => word.id)

      setSelectedWordIds(next)

      if (next.length === 0) {
        openComposer(lasso.end.row, lasso.end.col)
      }

      setLasso(null)
    }
  }

  function handleSelectAll() {
    setSelectedWordIds(words.map((word) => word.id))
  }

  function handleClearSelection() {
    setSelectedWordIds([])
  }

  function handleDeleteSelected() {
    if (selectedWordIds.length === 0) {
      return
    }

    setWords((current) =>
      current.filter((word) => !selectedWordIds.includes(word.id))
    )
    setSelectedWordIds([])
    setSaveMessage("Removed selected words from the grid.")
  }

  function handleFlipSelected() {
    if (selectedWordIds.length !== 1) {
      setError("Select exactly one word to flip direction.")
      return
    }

    const selectedId = selectedWordIds[0]
    const nextWords = words.map((word) => {
      if (word.id !== selectedId) {
        return word
      }

      const nextDirection: Direction =
        word.direction === "across" ? "down" : "across"

      return {
        ...word,
        direction: nextDirection,
      }
    })
    const validationError = validateWordSet(nextWords, gridSize, gridSize)

    if (validationError) {
      setError(validationError)
      return
    }

    setWords(nextWords)
    setError("")
    setSaveMessage("Flipped selected word direction.")
  }

  function handleGridSizeChange(size: (typeof FIXED_GRID_SIZES)[number]) {
    if (size === gridSize) {
      return
    }

    const validationError = validateWordSet(words, size, size)
    if (validationError) {
      setError(validationError)
      return
    }

    setGridSize(size)
    setError("")
    setSaveMessage(`Grid size changed to ${size}x${size}.`)
  }

  function handleUpdateMetadata(
    wordId: string,
    field: "clue" | "meaning",
    value: string
  ) {
    setWords((current) =>
      current.map((word) =>
        word.id === wordId ? { ...word, [field]: value } : word
      )
    )
  }

  function handleOpenLoadDialog() {
    setSelectedLoadDate((current) => current || scheduledDates.at(-1) || "")
    setError("")
    setIsLoadOpen(true)
  }

  function handleLoadPuzzle() {
    const puzzle = puzzles.find((item) => item.date === selectedLoadDate)

    if (!puzzle) {
      setError("Choose a published puzzle date to load.")
      return
    }

    const nextSize = FIXED_GRID_SIZES.includes(puzzle.rows as 7 | 9 | 11)
      ? (puzzle.rows as (typeof FIXED_GRID_SIZES)[number])
      : 9

    setTitle(puzzle.title)
    setScheduledDate(puzzle.date)
    setGridSize(nextSize)
    setWords(createEditorWordsFromPuzzle(puzzle))
    setSelectedWordIds([])
    setError("")
    setSaveMessage(
      `Loaded ${puzzle.title} for ${puzzle.date}. Edit directly on the grid, then publish again.`
    )
    setIsLoadOpen(false)
  }

  async function handleScheduleSave() {
    if (!databaseConnected) {
      setError("Connect the database before scheduling a puzzle.")
      return
    }

    if (!title.trim()) {
      setError("Add a puzzle title before scheduling.")
      return
    }

    if (!scheduledDate) {
      setError("Choose a schedule date.")
      return
    }

    if (!layout.draft || layout.across.length + layout.down.length === 0) {
      setError("Add words directly on the grid before publishing.")
      return
    }

    setIsSaving(true)
    setError("")
    setSaveMessage("Saving scheduled crossword...")

    try {
      const puzzle = buildScheduledPuzzle(layout, title, scheduledDate)
      const response = await fetch("/api/puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(puzzle),
      })

      const data = (await response.json()) as {
        error?: string
        puzzle?: CrosswordPuzzle
      }

      if (!response.ok || !data.puzzle) {
        throw new Error(data.error ?? "Unable to save this schedule.")
      }

      setPuzzles((current) => {
        const next = current.filter((item) => item.date !== data.puzzle!.date)
        return [...next, data.puzzle!].sort((left, right) =>
          left.date.localeCompare(right.date)
        )
      })
      setSaveMessage(`Scheduled for ${data.puzzle.date}.`)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save this schedule."
      )
      setSaveMessage("Schedule save failed.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-6 text-[#1e2b20] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.28em] text-[#7a7468] uppercase">
                Crossword Puzzle Builder
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                Build directly on the crossword grid.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5f675f]">
                Click on the grid to add words, lasso-select one or many
                entries, then drag them together.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm text-[#5f675f]">
              <div className="rounded-full bg-[#eef1e8] px-4 py-2">
                {words.length} words
              </div>
              <div className="rounded-full bg-[#eef1e8] px-4 py-2">
                {gridSize}x{gridSize} grid
              </div>
              <div className="rounded-full bg-[#eef1e8] px-4 py-2">
                {databaseConnected ? "Database connected" : "Database offline"}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <section className="space-y-6">
            <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Publish puzzle</h2>

              <div className="mt-4 space-y-4">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-[#455045]">
                    Puzzle title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Weekend Crossword"
                    className="rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 transition outline-none focus:border-[#8f7f5b]"
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-[#455045]">
                    Publish date
                  </span>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    className="rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 transition outline-none focus:border-[#8f7f5b]"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-[#455045]">
                    Grid size
                  </span>
                  <div className="flex gap-2">
                    {FIXED_GRID_SIZES.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => handleGridSizeChange(size)}
                        className={
                          size === gridSize
                            ? "rounded-full border border-[#8f7f5b] bg-[#8f7f5b] px-3 py-1.5 text-xs font-semibold text-white"
                            : "rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f]"
                        }
                      >
                        {size}x{size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e2ddd2] bg-[#faf8f3] px-4 py-4 text-sm text-[#5f675f]">
                  {hasScheduledDate
                    ? `A puzzle is already scheduled for ${scheduledDate}. Publishing will replace it.`
                    : scheduledDate
                      ? `No puzzle is scheduled for ${scheduledDate} yet.`
                      : "Choose a date to publish this puzzle."}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleOpenLoadDialog}
                    disabled={puzzles.length === 0}
                    className="inline-flex items-center justify-center rounded-full border border-[#d6d0c3] bg-white px-4 py-2.5 text-sm font-semibold text-[#445045] transition hover:border-[#bdb4a6] hover:text-[#1f2a22] disabled:cursor-not-allowed disabled:border-[#e1dbcf] disabled:text-[#a39b8e]"
                  >
                    Load Puzzle
                  </button>

                  <button
                    type="button"
                    onClick={handleScheduleSave}
                    disabled={isSaving || !databaseConnected}
                    className="inline-flex items-center justify-center rounded-full bg-[#8f7f5b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7c6e4f] disabled:cursor-not-allowed disabled:bg-[#b7ae9e]"
                  >
                    {isSaving ? "Publishing..." : "Publish Puzzle"}
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-[#e2c8b7] bg-[#fff5ef] px-4 py-3 text-sm text-[#91563a]">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl bg-[#f6f3ec] px-4 py-3 text-sm text-[#5f675f]">
                {saveMessage}
              </div>
            </section>

            <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Selection controls</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f]"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f]"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleFlipSelected}
                  className="inline-flex items-center gap-1 rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f]"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Flip
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="inline-flex items-center gap-1 rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>

              <div className="mt-3 text-xs text-[#6a7268]">
                {selectedWordIds.length} selected. Drag selected words to move
                them together.
              </div>
            </section>
          </section>

          <section className="space-y-6">
            <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Grid preview</h2>
                <div className="text-sm text-[#5f675f]">
                  {gridSize} rows x {gridSize} cols
                </div>
              </div>

              <div className="mt-2 text-sm text-[#5f675f]">
                {layout.recommendationLabel}
              </div>

              <div className="mt-5 flex justify-center">
                <div
                  className="grid aspect-square w-full max-w-[540px] gap-[3px] rounded-[24px] bg-[#2b362c] p-3"
                  style={{
                    gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                  }}
                  onMouseUp={finishPointerAction}
                  onMouseLeave={finishPointerAction}
                >
                  {layout.cells.flatMap((row, rowIndex) =>
                    row.map((cell, colIndex) => {
                      const cellKey = keyFor(rowIndex, colIndex)
                      const inSelection = selectedCellKeys.has(cellKey)
                      const inLasso = lasso
                        ? pointIsInRect(
                            { row: rowIndex, col: colIndex },
                            lasso.start,
                            lasso.end
                          )
                        : false

                      return (
                        <div
                          key={cellKey}
                          onMouseDown={(event) =>
                            handleCellMouseDown(rowIndex, colIndex, event)
                          }
                          onMouseEnter={() =>
                            handleCellMouseEnter(rowIndex, colIndex)
                          }
                          className={
                            cell.filled
                              ? `relative flex aspect-square items-center justify-center rounded-[8px] text-base font-semibold text-[#1f2a22] ${
                                  inSelection || previewSelection.has(cellKey)
                                    ? "bg-[#fff3cc]"
                                    : inLasso
                                      ? "bg-[#f3ead7]"
                                      : "bg-white"
                                }`
                              : `aspect-square rounded-[8px] ${inLasso ? "bg-[#445045]" : "bg-[#202820]"}`
                          }
                        >
                          {cell.filled ? (
                            <>
                              {cell.number ? (
                                <span className="absolute top-1 left-1 text-[10px] font-bold text-[#78827b]">
                                  {cell.number}
                                </span>
                              ) : null}
                              <span>{cell.letter}</span>
                            </>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {composer.open ? (
                <div className="mt-4 rounded-2xl border border-[#d8d1c4] bg-[#faf8f3] p-4">
                  <div className="text-xs tracking-[0.12em] text-[#6a7268] uppercase">
                    Add word at row {composer.row + 1}, col {composer.col + 1}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={composer.answer}
                      onChange={(event) =>
                        setComposer((current) => ({
                          ...current,
                          answer: event.target.value,
                        }))
                      }
                      placeholder="Type a word"
                      className="rounded-2xl border border-[#d6d0c3] bg-white px-4 py-2.5 text-sm uppercase outline-none focus:border-[#8f7f5b]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setComposer((current) => ({
                          ...current,
                          direction:
                            current.direction === "across" ? "down" : "across",
                        }))
                      }
                      className="rounded-full border border-[#d8d1c4] bg-white px-3 py-2 text-xs font-semibold text-[#5f675f]"
                    >
                      {composer.direction}
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleComposerSave}
                      className="rounded-full bg-[#28352b] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Add to Grid
                    </button>
                    <button
                      type="button"
                      onClick={closeComposer}
                      className="rounded-full border border-[#d8d1c4] bg-white px-4 py-2 text-xs font-semibold text-[#5f675f]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Across / Down</h2>
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <EditableClueColumn
                  title="Across"
                  items={layout.across}
                  onChange={handleUpdateMetadata}
                  onDeleteWord={(wordId) => {
                    setWords((current) =>
                      current.filter((word) => word.id !== wordId)
                    )
                    setSelectedWordIds((current) =>
                      current.filter((id) => id !== wordId)
                    )
                    setSaveMessage("Removed word from the grid.")
                  }}
                />
                <EditableClueColumn
                  title="Down"
                  items={layout.down}
                  onChange={handleUpdateMetadata}
                  onDeleteWord={(wordId) => {
                    setWords((current) =>
                      current.filter((word) => word.id !== wordId)
                    )
                    setSelectedWordIds((current) =>
                      current.filter((id) => id !== wordId)
                    )
                    setSaveMessage("Removed word from the grid.")
                  }}
                />
              </div>
            </section>
          </section>
        </div>
      </div>

      <Dialog open={isLoadOpen} onOpenChange={setIsLoadOpen}>
        <DialogContent
          className="max-w-lg rounded-[28px] border border-[#d8d1c4] bg-[#fffdf8] p-0 text-[#1e2b20] shadow-xl"
          showCloseButton={false}
        >
          <DialogHeader className="border-b border-[#ebe4d8] px-6 pt-6 pb-4">
            <DialogTitle className="text-xl font-semibold tracking-[-0.02em] text-[#1e2b20]">
              Load published puzzle
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#5f675f]">
              Pick a published date, load that puzzle into the builder, then
              edit and publish it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-[0.18em] text-[#5d675c] uppercase">
                  Published dates
                </h3>
                <span className="text-xs text-[#7a7468]">
                  {scheduledDates.length} total
                </span>
              </div>

              {scheduledDates.length === 0 ? (
                <div className="rounded-2xl bg-[#f6f3ec] px-4 py-4 text-sm text-[#6a7268]">
                  No scheduled dates yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {scheduledDates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedLoadDate(date)}
                      className={
                        date === selectedLoadDate
                          ? "rounded-full border border-[#8f7f5b] bg-[#8f7f5b] px-3 py-1.5 text-xs font-semibold text-white"
                          : "rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f]"
                      }
                    >
                      {date}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="rounded-b-[28px] border-t border-[#ebe4d8] bg-[#f7f2e8] px-6 py-4 sm:justify-between">
            <button
              type="button"
              onClick={() => setIsLoadOpen(false)}
              className="inline-flex items-center justify-center rounded-full border border-[#d6d0c3] bg-white px-4 py-2.5 text-sm font-semibold text-[#445045]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleLoadPuzzle}
              disabled={!selectedLoadDate}
              className="inline-flex items-center justify-center rounded-full bg-[#8f7f5b] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#b7ae9e]"
            >
              Load Puzzle
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function EditableClueColumn({
  title,
  items,
  onChange,
  onDeleteWord,
}: {
  title: string
  items: ClueItem[]
  onChange: (wordId: string, field: "clue" | "meaning", value: string) => void
  onDeleteWord: (wordId: string) => void
}) {
  return (
    <div className="rounded-[24px] bg-[#f6f3ec] p-4">
      <h3 className="text-sm font-semibold tracking-[0.22em] text-[#5d675c] uppercase">
        {title}
      </h3>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-[#6a7268]">
            No {title.toLowerCase()} entries yet.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#243026]">
                  {item.number}. {item.answer}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteWord(item.sourceWordId)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ddd7cb] bg-white text-[#6f675c] transition hover:border-[#c4bcaf] hover:text-[#2a332a]"
                  aria-label={`Delete ${item.answer}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                rows={2}
                value={item.clue}
                onChange={(event) =>
                  onChange(item.sourceWordId, "clue", event.target.value)
                }
                placeholder="Clue / hint"
                className="mt-2 w-full resize-none rounded-xl border border-[#d6d0c3] bg-[#faf8f3] px-3 py-2 text-sm outline-none focus:border-[#8f7f5b]"
              />
              <textarea
                rows={2}
                value={item.meaning}
                onChange={(event) =>
                  onChange(item.sourceWordId, "meaning", event.target.value)
                }
                placeholder="Meaning"
                className="mt-2 w-full resize-none rounded-xl border border-[#d6d0c3] bg-[#faf8f3] px-3 py-2 text-sm outline-none focus:border-[#8f7f5b]"
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function buildEditorLayout({
  words,
  rows,
  cols,
  title,
  date,
}: {
  words: EditorWord[]
  rows: number
  cols: number
  title: string
  date: string
}): LayoutResult {
  if (words.length === 0) {
    return {
      draft: null,
      cells: Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({
          letter: "",
          number: null,
          filled: false,
        }))
      ),
      across: [],
      down: [],
      recommendationLabel: "Click any cell to add your first word.",
    }
  }

  const placementResult = buildDraftFromManualPlacements({
    placements: words.map(toManualPlacement),
    rows,
    cols,
    title,
    date,
  })

  if (!placementResult.draft) {
    return {
      draft: null,
      cells: Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({
          letter: "",
          number: null,
          filled: false,
        }))
      ),
      across: [],
      down: [],
      recommendationLabel:
        placementResult.error ?? "Fix invalid placements to continue.",
    }
  }

  const derivedWords = deriveWordsFromDraft(placementResult.draft)
  const sourceByAnswer = new Map(words.map((word) => [word.answer, word]))
  const startNumbers = new Map<string, number>()

  derivedWords.forEach((word) => {
    startNumbers.set(keyFor(word.row, word.col), word.number)
  })

  const cells = placementResult.draft.cells.map((row, rowIndex) =>
    row.map((cell, colIndex) => ({
      letter: cell.letter,
      number: startNumbers.get(keyFor(rowIndex, colIndex)) ?? null,
      filled: !cell.isBlock,
    }))
  )

  const clues: ClueItem[] = derivedWords.map((word) => {
    const source = sourceByAnswer.get(word.answer)
    return {
      id: word.id,
      sourceWordId: source?.id ?? "",
      number: word.number,
      clue: source?.clue ?? "",
      meaning: source?.meaning ?? "",
      answer: word.answer,
      row: word.row,
      col: word.col,
      direction: word.direction,
    }
  })

  return {
    draft: placementResult.draft,
    cells,
    across: clues.filter((clue) => clue.direction === "across"),
    down: clues.filter((clue) => clue.direction === "down"),
    recommendationLabel:
      "Lasso any cells to select words. Drag selected words to move them.",
  }
}

function toManualPlacement(word: EditorWord): ManualWordPlacement {
  return {
    id: word.id,
    answer: word.answer,
    row: word.row,
    col: word.col,
    direction: word.direction,
  }
}

function validateWordSet(
  words: EditorWord[],
  rows: number,
  cols: number
): string | null {
  const answers = new Set<string>()

  for (const word of words) {
    if (answers.has(word.answer)) {
      return "Every answer must be unique."
    }
    answers.add(word.answer)
  }

  const placements = words.map(toManualPlacement)

  for (const word of words) {
    const validation = validateManualWordPlacement({
      rows,
      cols,
      placements,
      candidate: toManualPlacement(word),
    })

    if (!validation.valid) {
      return validation.reason ?? `Invalid placement for ${word.answer}.`
    }
  }

  return null
}

function normalizeAnswer(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, "")
}

function wordCells(word: EditorWord) {
  return word.answer.split("").map((_, index) => ({
    row: word.row + (word.direction === "down" ? index : 0),
    col: word.col + (word.direction === "across" ? index : 0),
  }))
}

function pointIsInRect(point: CellPoint, start: CellPoint, end: CellPoint) {
  const minRow = Math.min(start.row, end.row)
  const maxRow = Math.max(start.row, end.row)
  const minCol = Math.min(start.col, end.col)
  const maxCol = Math.max(start.col, end.col)

  return (
    point.row >= minRow &&
    point.row <= maxRow &&
    point.col >= minCol &&
    point.col <= maxCol
  )
}

function createEditorWordsFromPuzzle(puzzle: CrosswordPuzzle): EditorWord[] {
  return [...puzzle.clues]
    .sort((left, right) => {
      if (left.number !== right.number) {
        return left.number - right.number
      }

      return left.direction.localeCompare(right.direction)
    })
    .map((clue) => ({
      id: createWordId(),
      answer: normalizeAnswer(clue.answer),
      clue: clue.clue,
      meaning: clue.meaning?.trim() || "",
      row: clue.row,
      col: clue.col,
      direction: clue.direction,
    }))
}

function buildScheduledPuzzle(
  layout: LayoutResult,
  title: string,
  date: string
): CrosswordPuzzle {
  const clues = [...layout.across, ...layout.down].sort((left, right) => {
    if (left.number !== right.number) {
      return left.number - right.number
    }

    return left.direction.localeCompare(right.direction)
  })

  return {
    id: createPuzzleId(title, date),
    title: title.trim(),
    date,
    rows: layout.cells.length,
    cols: layout.cells[0]?.length ?? 0,
    clues: clues.map((clue) => ({
      id: clue.id,
      number: clue.number,
      direction: clue.direction,
      clue: clue.clue,
      meaning: clue.meaning,
      answer: clue.answer,
      row: clue.row,
      col: clue.col,
    })),
    givenCells: [],
  }
}

function createPuzzleId(title: string, date: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  return `${slug || "crossword"}-${date}`
}

function createWordId() {
  const id = `word-${nextWordId}`
  nextWordId += 1
  return id
}
