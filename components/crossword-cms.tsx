"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getLocalDateKey, type CrosswordPuzzle } from "@/lib/crossword-schedule"

type BuilderWord = {
  id: string
  answer: string
  clue: string
}

type Direction = "across" | "down"

type Placement = BuilderWord & {
  row: number
  col: number
  direction: Direction
  number: number
}

type BoardCell = {
  letter: string
  across: boolean
  down: boolean
}

type GridCell = {
  letter: string
  number: number | null
  filled: boolean
}

type ClueItem = {
  id: string
  number: number
  clue: string
  answer: string
  row: number
  col: number
  direction: Direction
}

type LayoutResult = {
  cells: GridCell[][]
  across: ClueItem[]
  down: ClueItem[]
  unplaced: BuilderWord[]
  placements: Placement[]
}

type CandidatePlacement = {
  row: number
  col: number
  direction: Direction
  intersections: number
}

let nextWordId = 1

export function CrosswordCms({
  initialPuzzles,
  databaseConnected,
}: {
  initialPuzzles: CrosswordPuzzle[]
  databaseConnected: boolean
}) {
  const [puzzles, setPuzzles] = useState(initialPuzzles)
  const [form, setForm] = useState({ word: "", clue: "" })
  const [title, setTitle] = useState("Untitled Puzzle")
  const [scheduledDate, setScheduledDate] = useState(getLocalDateKey())
  const [words, setWords] = useState<BuilderWord[]>([])
  const [error, setError] = useState("")
  const [saveMessage, setSaveMessage] = useState(
    databaseConnected
      ? "Choose a date to schedule this crossword."
      : "Database offline. You can still build and preview locally."
  )
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("add-word")
  const [isLoadOpen, setIsLoadOpen] = useState(false)
  const [selectedLoadDate, setSelectedLoadDate] = useState(
    initialPuzzles.at(-1)?.date ?? ""
  )

  const layout = useMemo(() => buildCrosswordLayout(words), [words])
  const scheduledDates = useMemo(
    () =>
      puzzles
        .map((puzzle) => puzzle.date)
        .sort((left, right) => left.localeCompare(right)),
    [puzzles]
  )
  const hasScheduledDate = scheduledDates.includes(scheduledDate)

  function handleAddWord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const answer = normalizeAnswer(form.word)
    const clue = form.clue.trim()

    if (answer.length < 2) {
      setError("Enter a word with at least 2 letters.")
      return
    }

    if (!clue) {
      setError("Add a clue or hint before saving the word.")
      return
    }

    if (words.some((word) => word.answer === answer)) {
      setError("That word is already in the builder.")
      return
    }

    setWords((current) => [
      ...current,
      {
        id: createWordId(),
        answer,
        clue,
      },
    ])
    setForm({ word: "", clue: "" })
    setError("")
  }

  function handleDeleteWord(id: string) {
    setWords((current) => current.filter((word) => word.id !== id))
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

    if (layout.placements.length === 0) {
      setError("Add words before scheduling a crossword.")
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

    setTitle(puzzle.title)
    setScheduledDate(puzzle.date)
    setWords(createBuilderWordsFromPuzzle(puzzle))
    setError("")
    setSaveMessage(
      `Loaded ${puzzle.title} for ${puzzle.date}. Edit it, then publish again to save the update.`
    )
    setActiveTab("add-word")
    setIsLoadOpen(false)
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
                Build, load, and update crossword puzzles.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5f675f]">
                Every time you add or remove a word, the builder recomputes a
                crossword-style layout and renumbers the clue list.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#5f675f]">
                Use Add Word to shape the board, then switch to Publish Puzzle
                to schedule a new puzzle or update one that is already live.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm text-[#5f675f]">
              <div className="rounded-full bg-[#eef1e8] px-4 py-2">
                {words.length} word{words.length === 1 ? "" : "s"}
              </div>
              <div className="rounded-full bg-[#eef1e8] px-4 py-2">
                {puzzles.length} saved puzzle
                {puzzles.length === 1 ? "" : "s"}
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
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-auto w-full rounded-2xl bg-[#f3eee5] p-1">
                  <TabsTrigger
                    value="add-word"
                    className="rounded-[18px] px-4 py-2 text-sm data-active:bg-white"
                  >
                    Add Word
                  </TabsTrigger>
                  <TabsTrigger
                    value="publish"
                    className="rounded-[18px] px-4 py-2 text-sm data-active:bg-white"
                  >
                    Publish Puzzle
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="add-word" className="mt-5">
                  <h2 className="text-lg font-semibold">Add word</h2>
                  <form className="mt-4 space-y-4" onSubmit={handleAddWord}>
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
                      <span className="font-medium text-[#455045]">Word</span>
                      <input
                        value={form.word}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            word: event.target.value,
                          }))
                        }
                        placeholder="MARKET"
                        className="rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 uppercase transition outline-none focus:border-[#8f7f5b]"
                      />
                    </label>

                    <label className="grid gap-2 text-sm">
                      <span className="font-medium text-[#455045]">
                        Clue / hint
                      </span>
                      <textarea
                        rows={3}
                        value={form.clue}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            clue: event.target.value,
                          }))
                        }
                        placeholder="Weekend bargain stop"
                        className="resize-none rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 transition outline-none focus:border-[#8f7f5b]"
                      />
                    </label>

                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-full bg-[#28352b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f2a22]"
                    >
                      <Plus className="h-4 w-4" />
                      Add Word
                    </button>
                  </form>
                </TabsContent>

                <TabsContent value="publish" className="mt-5 space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold">Publish puzzle</h2>
                    <p className="mt-2 text-sm leading-6 text-[#5f675f]">
                      Pick a date, then publish the current board. If that date
                      already has a puzzle, publishing will replace it.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#e2ddd2] bg-[#faf8f3] px-4 py-4 text-sm text-[#5f675f]">
                    <div className="font-medium text-[#243026]">
                      {title.trim() || "Untitled Puzzle"}
                    </div>
                    <div className="mt-1">
                      {words.length} word{words.length === 1 ? "" : "s"} in the
                      current builder.
                    </div>
                  </div>

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

                  <div className="rounded-2xl border border-[#e2ddd2] bg-[#faf8f3] px-4 py-4 text-sm text-[#5f675f]">
                    {hasScheduledDate
                      ? `A puzzle is already scheduled for ${scheduledDate}. Publishing will replace it.`
                      : scheduledDate
                        ? `No puzzle is scheduled for ${scheduledDate} yet.`
                        : "Choose a date to publish this puzzle."}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold tracking-[0.18em] text-[#5d675c] uppercase">
                        Scheduled dates
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
                            onClick={() => setScheduledDate(date)}
                            className={
                              date === scheduledDate
                                ? "rounded-full border border-[#8f7f5b] bg-[#8f7f5b] px-3 py-1.5 text-xs font-semibold text-white"
                                : "rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f] transition hover:border-[#b6aa90] hover:text-[#2a332a]"
                            }
                          >
                            {date}
                          </button>
                        ))}
                      </div>
                    )}
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
                </TabsContent>
              </Tabs>

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
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Words</h2>
                <span className="text-sm text-[#5f675f]">
                  {words.length} total
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {words.length === 0 ? (
                  <div className="rounded-2xl bg-[#f6f3ec] px-4 py-5 text-sm text-[#6a7268]">
                    Add your first word and clue to generate the crossword.
                  </div>
                ) : (
                  words.map((word) => (
                    <div
                      key={word.id}
                      className="rounded-2xl border border-[#e2ddd2] bg-[#faf8f3] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold tracking-[0.08em] text-[#243026] uppercase">
                            {word.answer}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-[#5f675f]">
                            {word.clue}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteWord(word.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd7cb] bg-white text-[#6f675c] transition hover:border-[#c4bcaf] hover:text-[#2a332a]"
                          aria-label={`Delete ${word.answer}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </section>

          <section className="space-y-6">
            <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold">Grid preview</h2>
                <div className="text-sm text-[#5f675f]">
                  {layout.cells.length === 0
                    ? "No grid yet"
                    : `${layout.cells.length} rows x ${layout.cells[0].length} cols`}
                </div>
              </div>

              {layout.unplaced.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-[#e2c8b7] bg-[#fff5ef] px-4 py-3 text-sm text-[#91563a]">
                  Could not place:{" "}
                  {layout.unplaced.map((word) => word.answer).join(", ")}
                </div>
              ) : null}

              <div className="mt-5 overflow-x-auto">
                {layout.cells.length === 0 ? (
                  <div className="flex min-h-[280px] items-center justify-center rounded-[24px] bg-[#f6f3ec] text-sm text-[#6a7268]">
                    The crossword grid appears here after you add words.
                  </div>
                ) : (
                  <div
                    className="inline-grid gap-[3px] rounded-[24px] bg-[#2b362c] p-3"
                    style={{
                      gridTemplateColumns: `repeat(${layout.cells[0].length}, minmax(0, 44px))`,
                    }}
                  >
                    {layout.cells.flatMap((row, rowIndex) =>
                      row.map((cell, colIndex) => (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          className={
                            cell.filled
                              ? "relative flex aspect-square items-center justify-center rounded-[8px] bg-white text-base font-semibold text-[#1f2a22]"
                              : "aspect-square rounded-[8px] bg-[#202820]"
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
                      ))
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Clues</h2>
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <ClueColumn title="Across" items={layout.across} />
                <ClueColumn title="Down" items={layout.down} />
              </div>
            </section>

            <section className="rounded-[28px] border border-[#d8d1c4] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Schedule</h2>
                <span className="text-sm text-[#5f675f]">
                  {puzzles.length} saved
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {puzzles.length === 0 ? (
                  <div className="rounded-2xl bg-[#f6f3ec] px-4 py-5 text-sm text-[#6a7268]">
                    No scheduled crosswords yet.
                  </div>
                ) : (
                  puzzles.map((puzzle) => (
                    <div
                      key={puzzle.id}
                      className="rounded-2xl border border-[#e2ddd2] bg-[#faf8f3] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-[#243026]">
                            {puzzle.title}
                          </div>
                          <div className="mt-1 text-sm text-[#5f675f]">
                            {puzzle.date}
                          </div>
                        </div>
                        <div className="text-xs tracking-[0.16em] text-[#81877d] uppercase">
                          {puzzle.clues.length} clues
                        </div>
                      </div>
                    </div>
                  ))
                )}
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
              edit and publish it again to save the fix.
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
                          : "rounded-full border border-[#d8d1c4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f675f] transition hover:border-[#b6aa90] hover:text-[#2a332a]"
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
              className="inline-flex items-center justify-center rounded-full border border-[#d6d0c3] bg-white px-4 py-2.5 text-sm font-semibold text-[#445045] transition hover:border-[#bdb4a6] hover:text-[#1f2a22]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleLoadPuzzle}
              disabled={!selectedLoadDate}
              className="inline-flex items-center justify-center rounded-full bg-[#8f7f5b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7c6e4f] disabled:cursor-not-allowed disabled:bg-[#b7ae9e]"
            >
              Load Puzzle
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function ClueColumn({ title, items }: { title: string; items: ClueItem[] }) {
  return (
    <div className="rounded-[24px] bg-[#f6f3ec] p-4">
      <h3 className="text-sm font-semibold tracking-[0.22em] text-[#5d675c] uppercase">
        {title}
      </h3>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-[#6a7268]">
            No {title.toLowerCase()} clues yet.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white px-4 py-3">
              <div className="text-sm font-semibold text-[#243026]">
                {item.number}. {item.clue}
              </div>
              <div className="mt-1 text-xs tracking-[0.16em] text-[#81877d] uppercase">
                {item.answer.length} letters
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function buildCrosswordLayout(words: BuilderWord[]): LayoutResult {
  if (words.length === 0) {
    return {
      cells: [],
      across: [],
      down: [],
      unplaced: [],
      placements: [],
    }
  }

  const boardSize = getBoardSize(words)
  const board = createBoard(boardSize)
  const sortedWords = [...words].sort(
    (left, right) => right.answer.length - left.answer.length
  )
  const placements: Placement[] = []
  const unplaced: BuilderWord[] = []

  const firstWord = sortedWords[0]
  const centerRow = Math.floor(boardSize / 2)
  const centerCol = Math.floor((boardSize - firstWord.answer.length) / 2)

  applyPlacement(board, {
    ...firstWord,
    row: centerRow,
    col: centerCol,
    direction: "across",
    number: 0,
  })
  placements.push({
    ...firstWord,
    row: centerRow,
    col: centerCol,
    direction: "across",
    number: 0,
  })

  sortedWords.slice(1).forEach((word) => {
    const candidate =
      findIntersectionPlacement(board, word) ?? findOpenPlacement(board, word)

    if (!candidate) {
      unplaced.push(word)
      return
    }

    const placement = {
      ...word,
      row: candidate.row,
      col: candidate.col,
      direction: candidate.direction,
      number: 0,
    } satisfies Placement

    applyPlacement(board, placement)
    placements.push(placement)
  })

  const bounds = getFilledBounds(board)
  if (!bounds) {
    return {
      cells: [],
      across: [],
      down: [],
      unplaced,
      placements,
    }
  }

  const cells: GridCell[][] = []
  for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
    const nextRow: GridCell[] = []
    for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
      const cell = board[row][col]
      nextRow.push({
        letter: cell.letter,
        number: null,
        filled: Boolean(cell.letter),
      })
    }
    cells.push(nextRow)
  }

  let nextNumber = 1
  for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
      const starts = placements.filter(
        (placement) => placement.row === row && placement.col === col
      )

      if (starts.length === 0) {
        continue
      }

      starts.forEach((placement) => {
        placement.number = nextNumber
      })
      cells[row - bounds.minRow][col - bounds.minCol].number = nextNumber
      nextNumber += 1
    }
  }

  return {
    cells,
    across: placements
      .filter((placement) => placement.direction === "across")
      .sort((left, right) => left.number - right.number)
      .map((placement) => ({
        id: placement.id,
        number: placement.number,
        clue: placement.clue,
        answer: placement.answer,
        row: placement.row - bounds.minRow,
        col: placement.col - bounds.minCol,
        direction: placement.direction,
      })),
    down: placements
      .filter((placement) => placement.direction === "down")
      .sort((left, right) => left.number - right.number)
      .map((placement) => ({
        id: placement.id,
        number: placement.number,
        clue: placement.clue,
        answer: placement.answer,
        row: placement.row - bounds.minRow,
        col: placement.col - bounds.minCol,
        direction: placement.direction,
      })),
    unplaced,
    placements,
  }
}

function createBoard(size: number) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      letter: "",
      across: false,
      down: false,
    }))
  )
}

function normalizeAnswer(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, "")
}

function createWordId() {
  const id = `word-${nextWordId}`
  nextWordId += 1
  return id
}

function createBuilderWordsFromPuzzle(puzzle: CrosswordPuzzle) {
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
    }))
}

function getBoardSize(words: BuilderWord[]) {
  const longest = Math.max(...words.map((word) => word.answer.length), 0)
  return Math.max(13, Math.min(31, longest * 2 + words.length * 2 + 3))
}

function findIntersectionPlacement(board: BoardCell[][], word: BuilderWord) {
  const size = board.length
  const candidates: CandidatePlacement[] = []

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const boardLetter = board[row][col].letter
      if (!boardLetter) {
        continue
      }

      for (let index = 0; index < word.answer.length; index += 1) {
        if (word.answer[index] !== boardLetter) {
          continue
        }

        const acrossCandidate = evaluatePlacement(
          board,
          word.answer,
          row,
          col - index,
          "across"
        )
        if (acrossCandidate && acrossCandidate.intersections > 0) {
          candidates.push(acrossCandidate)
        }

        const downCandidate = evaluatePlacement(
          board,
          word.answer,
          row - index,
          col,
          "down"
        )
        if (downCandidate && downCandidate.intersections > 0) {
          candidates.push(downCandidate)
        }
      }
    }
  }

  return pickBestCandidate(candidates, board.length)
}

function findOpenPlacement(board: BoardCell[][], word: BuilderWord) {
  const size = board.length
  const candidates: CandidatePlacement[] = []

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const acrossCandidate = evaluatePlacement(
        board,
        word.answer,
        row,
        col,
        "across"
      )
      if (acrossCandidate) {
        candidates.push(acrossCandidate)
      }

      const downCandidate = evaluatePlacement(
        board,
        word.answer,
        row,
        col,
        "down"
      )
      if (downCandidate) {
        candidates.push(downCandidate)
      }
    }
  }

  return pickBestCandidate(candidates, board.length)
}

function pickBestCandidate(
  candidates: CandidatePlacement[],
  boardSize: number
) {
  const center = Math.floor(boardSize / 2)

  return candidates.sort((left, right) => {
    if (right.intersections !== left.intersections) {
      return right.intersections - left.intersections
    }

    const leftDistance =
      Math.abs(left.row - center) + Math.abs(left.col - center)
    const rightDistance =
      Math.abs(right.row - center) + Math.abs(right.col - center)

    return leftDistance - rightDistance
  })[0]
}

function evaluatePlacement(
  board: BoardCell[][],
  answer: string,
  startRow: number,
  startCol: number,
  direction: Direction
) {
  const size = board.length
  const rowStep = direction === "down" ? 1 : 0
  const colStep = direction === "across" ? 1 : 0
  const endRow = startRow + rowStep * (answer.length - 1)
  const endCol = startCol + colStep * (answer.length - 1)

  if (
    startRow < 0 ||
    startCol < 0 ||
    endRow >= size ||
    endCol >= size ||
    hasLetter(board, startRow - rowStep, startCol - colStep) ||
    hasLetter(board, endRow + rowStep, endCol + colStep)
  ) {
    return null
  }

  let intersections = 0

  for (let index = 0; index < answer.length; index += 1) {
    const row = startRow + rowStep * index
    const col = startCol + colStep * index
    const cell = board[row][col]
    const letter = answer[index]

    if (cell.letter && cell.letter !== letter) {
      return null
    }

    if (
      (direction === "across" && cell.across) ||
      (direction === "down" && cell.down)
    ) {
      return null
    }

    if (cell.letter) {
      intersections += 1
      continue
    }

    if (
      direction === "across" &&
      (hasLetter(board, row - 1, col) || hasLetter(board, row + 1, col))
    ) {
      return null
    }

    if (
      direction === "down" &&
      (hasLetter(board, row, col - 1) || hasLetter(board, row, col + 1))
    ) {
      return null
    }
  }

  return {
    row: startRow,
    col: startCol,
    direction,
    intersections,
  } satisfies CandidatePlacement
}

function applyPlacement(board: BoardCell[][], placement: Placement) {
  placement.answer.split("").forEach((letter, index) => {
    const row = placement.row + (placement.direction === "down" ? index : 0)
    const col = placement.col + (placement.direction === "across" ? index : 0)
    const cell = board[row][col]

    cell.letter = letter
    if (placement.direction === "across") {
      cell.across = true
    } else {
      cell.down = true
    }
  })
}

function hasLetter(board: BoardCell[][], row: number, col: number) {
  return Boolean(board[row]?.[col]?.letter)
}

function getFilledBounds(board: BoardCell[][]) {
  let minRow = Number.POSITIVE_INFINITY
  let maxRow = Number.NEGATIVE_INFINITY
  let minCol = Number.POSITIVE_INFINITY
  let maxCol = Number.NEGATIVE_INFINITY

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (!board[row][col].letter) {
        continue
      }

      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
    }
  }

  if (!Number.isFinite(minRow)) {
    return null
  }

  return { minRow, maxRow, minCol, maxCol }
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
