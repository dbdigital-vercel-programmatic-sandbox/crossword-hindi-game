"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Check,
  CheckCircle2,
  CircleX,
  Pencil,
  Plus,
  TriangleAlert,
  Trash2,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deriveWordsFromDraft,
  FIXED_GRID_SIZES,
  generateCompactDraftFromWordList,
  keyFor,
  previewWordPlacement,
  suggestBonusWord,
  type CrosswordDraft,
} from "@/lib/crossword-editor"
import { getLocalDateKey, type CrosswordPuzzle } from "@/lib/crossword-schedule"

type BuilderWord = {
  id: string
  answer: string
  clue: string
  meaning: string
}

type Direction = "across" | "down"

type GridCell = {
  letter: string
  number: number | null
  filled: boolean
}

type ClueItem = {
  id: string
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
  unplaced: Array<BuilderWord & { bonusWord: string | null }>
  recommendationLabel: string
}

type WordCompatibilityStatus = {
  tone: "neutral" | "green" | "yellow" | "red"
  message: string
  bonusWord: string | null
}

let nextWordId = 1
const MAX_GRID_SIZE = FIXED_GRID_SIZES[FIXED_GRID_SIZES.length - 1]

export function CrosswordCms({
  initialPuzzles,
  databaseConnected,
}: {
  initialPuzzles: CrosswordPuzzle[]
  databaseConnected: boolean
}) {
  const [puzzles, setPuzzles] = useState(initialPuzzles)
  const [form, setForm] = useState({ word: "", clue: "", meaning: "" })
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
  const [wordCompatibility, setWordCompatibility] =
    useState<WordCompatibilityStatus>({
      tone: "neutral",
      message: "",
      bonusWord: null,
    })
  const [editingWordId, setEditingWordId] = useState<string | null>(null)
  const [editingForm, setEditingForm] = useState({
    word: "",
    clue: "",
    meaning: "",
  })

  const layout = useMemo(
    () => buildCrosswordLayout(words, title, scheduledDate),
    [scheduledDate, title, words]
  )
  const scheduledDates = useMemo(
    () =>
      puzzles
        .map((puzzle) => puzzle.date)
        .sort((left, right) => left.localeCompare(right)),
    [puzzles]
  )
  const hasScheduledDate = scheduledDates.includes(scheduledDate)
  const clueIsEnabled = normalizeAnswer(form.word).length >= 3

  useEffect(() => {
    const answer = normalizeAnswer(form.word)

    if (answer.length < 2) {
      setWordCompatibility({ tone: "neutral", message: "", bonusWord: null })
      return
    }

    const timeoutId = window.setTimeout(() => {
      const preview = previewWordPlacement({ words, answer })
      const bonusSuggestion =
        preview.status === "blocked"
          ? suggestBonusWord({ words, answer })
          : null

      setWordCompatibility(
        buildWordCompatibilityStatus(
          preview,
          words.length === 0,
          bonusSuggestion
        )
      )
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [form.word, words])

  function handleAddWord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const answer = normalizeAnswer(form.word)
    const clue = form.clue.trim()
    const meaning = form.meaning.trim()

    if (answer.length < 3) {
      setError("Enter a word with at least 3 letters.")
      return
    }

    if (answer.length > MAX_GRID_SIZE) {
      setError(
        `Keep answers to ${MAX_GRID_SIZE} letters or fewer. The builder expands up to ${MAX_GRID_SIZE}x${MAX_GRID_SIZE}.`
      )
      return
    }

    if (!clue || !meaning) {
      setError("Add a clue/hint and meaning before saving the word.")
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
        meaning,
      },
    ])
    setForm({ word: "", clue: "", meaning: "" })
    setError("")
  }

  function handleDeleteWord(id: string) {
    setWords((current) => current.filter((word) => word.id !== id))

    if (editingWordId === id) {
      setEditingWordId(null)
      setEditingForm({ word: "", clue: "", meaning: "" })
    }
  }

  function handleStartEditingWord(word: BuilderWord) {
    setEditingWordId(word.id)
    setEditingForm({
      word: word.answer,
      clue: word.clue,
      meaning: word.meaning,
    })
    setError("")
  }

  function handleCancelEditingWord() {
    setEditingWordId(null)
    setEditingForm({ word: "", clue: "", meaning: "" })
  }

  function handleSaveWordEdit(id: string) {
    const answer = normalizeAnswer(editingForm.word)
    const clue = editingForm.clue.trim()
    const meaning = editingForm.meaning.trim()

    if (answer.length < 3) {
      setError("Enter a word with at least 3 letters.")
      return
    }

    if (answer.length > MAX_GRID_SIZE) {
      setError(
        `Keep answers to ${MAX_GRID_SIZE} letters or fewer. The builder expands up to ${MAX_GRID_SIZE}x${MAX_GRID_SIZE}.`
      )
      return
    }

    if (!clue || !meaning) {
      setError("Add a clue/hint and meaning before saving the word.")
      return
    }

    if (words.some((word) => word.id !== id && word.answer === answer)) {
      setError("That word is already in the builder.")
      return
    }

    setWords((current) =>
      current.map((word) =>
        word.id === id
          ? {
              ...word,
              answer,
              clue,
              meaning,
            }
          : word
      )
    )
    setEditingWordId(null)
    setEditingForm({ word: "", clue: "", meaning: "" })
    setError("")
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
      setError("Add words before scheduling a crossword.")
      return
    }

    if (layout.unplaced.length > 0) {
      setError(
        `Remove or shorten the words that do not fit within the compact ${MAX_GRID_SIZE}x${MAX_GRID_SIZE} limit before publishing.`
      )
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
                Every time you add or remove a word, the builder recomputes the
                most compact crossword layout it can fit into 7x7, 9x9, or 11x11
                and renumbers the clue list.
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

                      {wordCompatibility.tone !== "neutral" ? (
                        <div className="space-y-2" aria-live="polite">
                          <div
                            className={
                              wordCompatibility.tone === "green"
                                ? "inline-flex items-center gap-2 rounded-full bg-[#e8f3e3] px-3 py-1.5 text-xs font-medium text-[#305235]"
                                : wordCompatibility.tone === "yellow"
                                  ? "inline-flex items-center gap-2 rounded-full bg-[#fff4da] px-3 py-1.5 text-xs font-medium text-[#8a6420]"
                                  : "inline-flex items-center gap-2 rounded-full bg-[#fde8e1] px-3 py-1.5 text-xs font-medium text-[#9b4a34]"
                            }
                          >
                            {wordCompatibility.tone === "green" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : wordCompatibility.tone === "yellow" ? (
                              <TriangleAlert className="h-3.5 w-3.5" />
                            ) : (
                              <CircleX className="h-3.5 w-3.5" />
                            )}
                            <span>{wordCompatibility.message}</span>
                          </div>

                          {wordCompatibility.bonusWord ? (
                            <div className="rounded-2xl border border-[#eedbcc] bg-[#fcf5ee] px-3 py-2 text-xs leading-5 text-[#7d5239]">
                              Bonus word suggestion:{" "}
                              <span className="font-semibold tracking-[0.08em] uppercase">
                                {wordCompatibility.bonusWord}
                              </span>
                              . Add it first to keep the current words and
                              create a new crossing path.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </label>

                    <label className="grid gap-2 text-sm">
                      <span className="font-medium text-[#455045]">
                        Clue / hint
                      </span>
                      <textarea
                        rows={3}
                        value={form.clue}
                        disabled={!clueIsEnabled}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            clue: event.target.value,
                          }))
                        }
                        placeholder={
                          clueIsEnabled
                            ? "Weekend bargain stop"
                            : "Enter at least 3 letters to unlock the clue field"
                        }
                        className="resize-none rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 transition outline-none focus:border-[#8f7f5b] disabled:cursor-not-allowed disabled:border-[#e8e1d4] disabled:bg-[#f3eee5] disabled:text-[#998f7d]"
                      />
                    </label>

                    <label className="grid gap-2 text-sm">
                      <span className="font-medium text-[#455045]">
                        Meaning
                      </span>
                      <textarea
                        rows={3}
                        value={form.meaning}
                        disabled={!clueIsEnabled}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            meaning: event.target.value,
                          }))
                        }
                        placeholder={
                          clueIsEnabled
                            ? "A place where people buy and sell goods"
                            : "Enter at least 3 letters to unlock the meaning field"
                        }
                        className="resize-none rounded-2xl border border-[#d6d0c3] bg-[#faf8f3] px-4 py-3 transition outline-none focus:border-[#8f7f5b] disabled:cursor-not-allowed disabled:border-[#e8e1d4] disabled:bg-[#f3eee5] disabled:text-[#998f7d]"
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
                    Add your first word, clue, and meaning to generate the
                    crossword.
                  </div>
                ) : (
                  words.map((word) => (
                    <div
                      key={word.id}
                      className="rounded-2xl border border-[#e2ddd2] bg-[#faf8f3] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          {editingWordId === word.id ? (
                            <div className="space-y-3">
                              <input
                                value={editingForm.word}
                                onChange={(event) =>
                                  setEditingForm((current) => ({
                                    ...current,
                                    word: event.target.value,
                                  }))
                                }
                                placeholder="MARKET"
                                className="w-full rounded-2xl border border-[#d6d0c3] bg-white px-4 py-2.5 text-sm uppercase transition outline-none focus:border-[#8f7f5b]"
                              />
                              <textarea
                                rows={3}
                                value={editingForm.clue}
                                onChange={(event) =>
                                  setEditingForm((current) => ({
                                    ...current,
                                    clue: event.target.value,
                                  }))
                                }
                                placeholder="Weekend bargain stop"
                                className="w-full resize-none rounded-2xl border border-[#d6d0c3] bg-white px-4 py-2.5 text-sm transition outline-none focus:border-[#8f7f5b]"
                              />
                              <textarea
                                rows={3}
                                value={editingForm.meaning}
                                onChange={(event) =>
                                  setEditingForm((current) => ({
                                    ...current,
                                    meaning: event.target.value,
                                  }))
                                }
                                placeholder="A place where people buy and sell goods"
                                className="w-full resize-none rounded-2xl border border-[#d6d0c3] bg-white px-4 py-2.5 text-sm transition outline-none focus:border-[#8f7f5b]"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="text-sm font-semibold tracking-[0.08em] text-[#243026] uppercase">
                                {word.answer}
                              </div>
                              <div className="mt-2 text-sm leading-6 text-[#5f675f]">
                                {word.clue}
                              </div>
                              <div className="mt-2 text-sm leading-6 text-[#5f675f]">
                                <span className="font-semibold text-[#243026]">
                                  Meaning:
                                </span>{" "}
                                {word.meaning}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          {editingWordId === word.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveWordEdit(word.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#c5d7c1] bg-[#e8f3e3] text-[#305235] transition hover:border-[#a8c29f] hover:bg-[#dcedd6]"
                                aria-label={`Save ${word.answer}`}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditingWord}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e2c8b7] bg-[#fff5ef] text-[#91563a] transition hover:border-[#d9b29a] hover:bg-[#fde9de]"
                                aria-label={`Cancel editing ${word.answer}`}
                              >
                                <CircleX className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEditingWord(word)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd7cb] bg-white text-[#6f675c] transition hover:border-[#c4bcaf] hover:text-[#2a332a]"
                                aria-label={`Edit ${word.answer}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWord(word.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd7cb] bg-white text-[#6f675c] transition hover:border-[#c4bcaf] hover:text-[#2a332a]"
                                aria-label={`Delete ${word.answer}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
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

              <div className="mt-2 text-sm text-[#5f675f]">
                {layout.recommendationLabel}
              </div>

              {layout.unplaced.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-[#e2c8b7] bg-[#fff5ef] px-4 py-3 text-sm text-[#91563a]">
                  Could not place:{" "}
                  {layout.unplaced.map((word) => word.answer).join(", ")}
                  <div className="mt-3 space-y-2 text-xs leading-5 text-[#7d5239]">
                    {layout.unplaced.map((word) =>
                      word.bonusWord ? (
                        <div key={`${word.id}-bonus`}>
                          Add bonus word{" "}
                          <span className="font-semibold tracking-[0.08em] uppercase">
                            {word.bonusWord}
                          </span>{" "}
                          to help fit{" "}
                          <span className="font-semibold tracking-[0.08em] uppercase">
                            {word.answer}
                          </span>{" "}
                          without dropping the current set.
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex justify-center">
                {layout.cells.length === 0 ? (
                  <div className="flex min-h-[280px] items-center justify-center rounded-[24px] bg-[#f6f3ec] text-sm text-[#6a7268]">
                    The crossword grid appears here after you add words.
                  </div>
                ) : (
                  <div
                    className="grid aspect-square w-full max-w-[540px] gap-[3px] rounded-[24px] bg-[#2b362c] p-3"
                    style={{
                      gridTemplateColumns: `repeat(${layout.cells[0].length}, minmax(0, 1fr))`,
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

function buildCrosswordLayout(
  words: BuilderWord[],
  title: string,
  date: string
): LayoutResult {
  if (words.length === 0) {
    return {
      draft: null,
      cells: [],
      across: [],
      down: [],
      unplaced: [],
      recommendationLabel: "Add a few words to generate a compact grid.",
    }
  }

  const result = generateCompactDraftFromWordList({
    words: words.map((word) => ({ answer: word.answer, clue: word.clue })),
    title,
    date,
  })
  const derivedWords = deriveWordsFromDraft(result.draft)
  const startNumbers = new Map<string, number>()

  derivedWords.forEach((word) => {
    startNumbers.set(keyFor(word.row, word.col), word.number)
  })

  const cells = result.draft.cells.map((row, rowIndex) =>
    row.map((cell, colIndex) => ({
      letter: cell.letter,
      number: startNumbers.get(keyFor(rowIndex, colIndex)) ?? null,
      filled: !cell.isBlock,
    }))
  )
  const clues = derivedWords.map((word) => {
    const sourceWord = words.find((item) => item.answer === word.answer)

    return {
      id: word.id,
      number: word.number,
      clue: word.clue,
      meaning: sourceWord?.meaning ?? "",
      answer: word.answer,
      row: word.row,
      col: word.col,
      direction: word.direction,
    }
  })

  return {
    draft: result.draft,
    cells,
    across: clues.filter((clue) => clue.direction === "across"),
    down: clues.filter((clue) => clue.direction === "down"),
    unplaced: result.unplacedWords.map((word, index) => ({
      id: `unplaced-${index}-${word.answer}`,
      answer: word.answer,
      clue: word.clue ?? "",
      meaning: words.find((item) => item.answer === word.answer)?.meaning ?? "",
      bonusWord:
        suggestBonusWord({
          words: words.map((item) => ({
            answer: item.answer,
            clue: item.clue,
          })),
          answer: word.answer,
          targetAlreadyIncluded: true,
        })?.answer ?? null,
    })),
    recommendationLabel: result.recommendation.label,
  }
}

function buildWordCompatibilityStatus(
  preview: ReturnType<typeof previewWordPlacement>,
  isFirstWord: boolean,
  bonusSuggestion: ReturnType<typeof suggestBonusWord>
): WordCompatibilityStatus {
  if (preview.status === "neutral") {
    return { tone: "neutral", message: "", bonusWord: null }
  }

  if (preview.status === "connected") {
    if (isFirstWord) {
      return {
        tone: "green",
        message: "Great! First word always fits",
        bonusWord: null,
      }
    }

    return {
      tone: "green",
      message: `Great! Intersects with ${preview.connectedWordCount} existing word${preview.connectedWordCount === 1 ? "" : "s"}`,
      bonusWord: null,
    }
  }

  if (preview.status === "separate") {
    return {
      tone: "yellow",
      message: "Will be placed separately (no intersections found)",
      bonusWord: null,
    }
  }

  return {
    tone: "red",
    message: bonusSuggestion?.answer
      ? `Doesn't fit yet. Try ${bonusSuggestion.answer} to bridge the gap.`
      : "Doesn't fit yet, but you can still add it.",
    bonusWord: bonusSuggestion?.answer ?? null,
  }
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
      meaning: clue.meaning?.trim() || "",
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
