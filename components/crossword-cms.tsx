"use client"

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  Gamepad2,
  LayoutGrid,
  Link2,
  ListChecks,
  PenSquare,
  Plus,
  Quote,
  Save,
  Sparkles,
  Square,
  SquareDashed,
} from "lucide-react"

import { CrosswordPreview } from "@/components/crossword-preview"
import {
  createDraftFromPuzzle,
  createEmptyDraft,
  FIXED_GRID_SIZES,
  generateDraftFromWordList,
  getSymmetryPartner,
  keyFor,
  recommendGridSize,
  type CrosswordDraft,
  type SeedWord,
  validateCrosswordDraft,
} from "@/lib/crossword-editor"
import type { CrosswordPuzzle } from "@/lib/crossword-schedule"
import { cn } from "@/lib/utils"

type EditorMode = "letters" | "blocks" | "givens"

type SaveState = {
  tone: "idle" | "success" | "error"
  message: string
}

const GRID_OPTIONS = [
  {
    size: 7,
    label: "Quick hit",
    detail: "Fast warmups with short, high-crossing entries.",
  },
  {
    size: 9,
    label: "Daily driver",
    detail: "Best default for balanced fill, clue variety, and retention.",
  },
  {
    size: 11,
    label: "Stretch",
    detail: "More room for theme words without losing the web.",
  },
] as const

const RULEBOOK = [
  {
    eyebrow: "Foundation",
    title: "Structure first",
    icon: LayoutGrid,
    items: [
      "Use a fixed 7x7, 9x9, or 11x11 square grid.",
      "Keep at least 70% of cells open so the board stays lively.",
      "Treat symmetry as a polish bonus, not the main goal.",
    ],
  },
  {
    eyebrow: "Interlock",
    title: "No island words",
    icon: Link2,
    items: [
      "Every answer must cross at least one other answer.",
      "Mix across and down entries instead of running one-direction streaks.",
      "The whole puzzle should read like one connected web.",
    ],
  },
  {
    eyebrow: "Word quality",
    title: "Keep vocabulary clean",
    icon: BrainCircuit,
    items: [
      "Stay in the 3-8 letter sweet spot unless the larger grid earns 9.",
      "Favor common English words with flexible crossing letters.",
      "Skip obscure abbreviations, junk fill, and random proper nouns.",
    ],
  },
  {
    eyebrow: "Clue voice",
    title: "Write for humans",
    icon: Quote,
    items: [
      "Use direct, riddle, relatable, or playful clue styles.",
      "Do not repeat the answer inside the clue.",
      "Avoid dry dictionary copy and vague multi-answer prompts.",
    ],
  },
  {
    eyebrow: "Validation",
    title: "Check before publish",
    icon: ListChecks,
    items: [
      "No duplicate answers, no disconnected sections, no empty dead zones.",
      "Make sure every clue maps to exactly one answer.",
      "The grid should stay fully solvable without guessy junk.",
    ],
  },
  {
    eyebrow: "Player feel",
    title: "Front-load delight",
    icon: Gamepad2,
    items: [
      "Let the first two or three solves feel easy and rewarding.",
      "Show answer length and support progressive hints.",
      "Balance difficulty so the puzzle ramps instead of spikes.",
    ],
  },
] as const

const DIFFICULTY_MIX = [
  { label: "Easy", detail: "70% easy / 30% medium" },
  { label: "Medium", detail: "40% easy / 40% medium / 20% hard" },
  { label: "Hard", detail: "20% easy / 50% medium / 30% hard" },
] as const

const PROMPT_TEMPLATE = `Generate a crossword puzzle with the following constraints:

Grid size: 9x9
Minimum 70% fill rate
All words must interlock (no isolated words)
Each word must intersect with at least one other word
Use common English words (3-8 letters)
Avoid rare words, abbreviations, and proper nouns
Maintain a single connected grid (no isolated sections)
Use a mix of horizontal and vertical words

Clues must be:

Clear, engaging, and not direct dictionary definitions
A mix of straightforward, riddle-style, and relatable hints

Difficulty:

50% easy, 30% medium, 20% hard

Output format:

Grid (with letters and blanks)
Word list with positions
Clues mapped to each word

Validate the puzzle before output to ensure it is solvable and well-connected.`

export function CrosswordCms({
  initialPuzzles,
  databaseConnected,
}: {
  initialPuzzles: CrosswordPuzzle[]
  databaseConnected: boolean
}) {
  const [puzzles, setPuzzles] = useState(initialPuzzles)
  const [draft, setDraft] = useState<CrosswordDraft>(() => createEmptyDraft())
  const [gridSize, setGridSize] = useState(9)
  const [wordSeedInput, setWordSeedInput] = useState("")
  const [selectedCell, setSelectedCell] = useState({ row: 0, col: 0 })
  const [mode, setMode] = useState<EditorMode>("letters")
  const [isSaving, setIsSaving] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({
    tone: "idle",
    message: databaseConnected
      ? "Structure first: keep the board dense, connected, and clue-ready."
      : "Add DATABASE_URL to enable saving in Neon.",
  })
  const [plannerState, setPlannerState] = useState<SaveState>({
    tone: "idle",
    message:
      "Start with strong seed words and let the generator build outward.",
  })

  const validation = useMemo(() => validateCrosswordDraft(draft), [draft])
  const seedWords = useMemo(
    () => parseSeedWords(wordSeedInput),
    [wordSeedInput]
  )
  const recommendedGrid = useMemo(
    () => recommendGridSize(seedWords),
    [seedWords]
  )
  const acrossWords = useMemo(
    () => validation.words.filter((word) => word.direction === "across"),
    [validation.words]
  )
  const downWords = useMemo(
    () => validation.words.filter((word) => word.direction === "down"),
    [validation.words]
  )
  const selected = draft.cells[selectedCell.row]?.[selectedCell.col]
  const selectedPartner = getSymmetryPartner(
    draft.rows,
    draft.cols,
    selectedCell.row,
    selectedCell.col
  )
  const moveSelection = useCallback(
    (rowDelta: number, colDelta: number) => {
      setSelectedCell((current) => ({
        row: clamp(current.row + rowDelta, 0, draft.rows - 1),
        col: clamp(current.col + colDelta, 0, draft.cols - 1),
      }))
    },
    [draft.cols, draft.rows]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        moveSelection(-1, 0)
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        moveSelection(1, 0)
        return
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        moveSelection(0, -1)
        return
      }

      if (event.key === "ArrowRight") {
        event.preventDefault()
        moveSelection(0, 1)
        return
      }

      if (mode !== "letters" || !selected || selected.isBlock) {
        return
      }

      if (/^[a-z]$/i.test(event.key)) {
        event.preventDefault()
        updateLetter(selectedCell.row, selectedCell.col, event.key)
        return
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault()
        updateLetter(selectedCell.row, selectedCell.col, "")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mode, moveSelection, selected, selectedCell.col, selectedCell.row])

  async function handleSave() {
    setIsSaving(true)
    setSaveState({ tone: "idle", message: "Saving puzzle to Neon..." })

    try {
      const response = await fetch("/api/puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
      const data = (await response.json()) as {
        error?: string
        puzzle?: CrosswordPuzzle
      }

      if (!response.ok || !data.puzzle) {
        throw new Error(data.error ?? "Unable to save this puzzle.")
      }

      setPuzzles((current) => {
        const next = current.filter(
          (puzzle) => puzzle.date !== data.puzzle?.date
        )
        return [...next, data.puzzle as CrosswordPuzzle].sort((left, right) =>
          left.date.localeCompare(right.date)
        )
      })
      replaceDraft(createDraftFromPuzzle(data.puzzle))
      setSaveState({
        tone: "success",
        message: `Saved and scheduled for ${data.puzzle.date}.`,
      })
    } catch (error) {
      setSaveState({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save this puzzle.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  function replaceDraft(nextDraft: CrosswordDraft) {
    setDraft(nextDraft)
    setGridSize(nextDraft.rows)
    setSelectedCell(findFirstEditableCell(nextDraft))
  }

  function updateMetadata(field: "title" | "date", value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function applyGridSize(nextSize: number) {
    const size = clampToFixedGridSize(nextSize)
    const nextDraft = createEmptyDraft(size, size)
    nextDraft.title = draft.title
    nextDraft.date = draft.date
    replaceDraft(nextDraft)
    setWordSeedInput("")
    setPlannerState({
      tone: "idle",
      message: `Started a fresh ${size}x${size} grid.`,
    })
  }

  function generateFromWords() {
    if (seedWords.length === 0) {
      setPlannerState({
        tone: "error",
        message: "Add one word per line before generating a layout.",
      })
      return
    }

    const result = generateDraftFromWordList({
      words: seedWords,
      rows: gridSize,
      cols: gridSize,
      title: draft.title,
      date: draft.date,
    })

    replaceDraft(result.draft)
    setPlannerState({
      tone: result.unplacedWords.length > 0 ? "error" : "success",
      message:
        result.unplacedWords.length > 0
          ? `Placed ${result.placedWords.length}/${seedWords.length} words. Review these leftovers: ${result.unplacedWords
              .map((word) => word.answer)
              .join(", ")}.`
          : `Placed all ${result.placedWords.length} words into the ${result.draft.rows}x${result.draft.cols} draft.`,
    })
  }

  function updateLetter(row: number, col: number, value: string) {
    setDraft((current) => {
      const next = cloneDraft(current)
      const cell = next.cells[row][col]
      if (cell.isBlock) {
        return current
      }

      cell.letter = value.trim().slice(0, 1).toUpperCase()
      if (!cell.letter) {
        cell.given = false
      }

      return next
    })
  }

  function toggleBlock(row: number, col: number) {
    setDraft((current) => {
      const next = cloneDraft(current)
      const partner = getSymmetryPartner(current.rows, current.cols, row, col)
      const nextValue = !next.cells[row][col].isBlock

      ;[
        [row, col],
        [partner.row, partner.col],
      ].forEach(([targetRow, targetCol]) => {
        const cell = next.cells[targetRow][targetCol]
        cell.isBlock = nextValue
        if (nextValue) {
          cell.letter = ""
          cell.given = false
        }
      })

      return next
    })
  }

  function toggleGiven(row: number, col: number) {
    setDraft((current) => {
      const next = cloneDraft(current)
      const cell = next.cells[row][col]

      if (cell.isBlock || !cell.letter) {
        return current
      }

      cell.given = !cell.given
      return next
    })
  }

  function updateClue(clueId: string, value: string) {
    setDraft((current) => ({
      ...current,
      clues: {
        ...current.clues,
        [clueId]: value,
      },
    }))
  }

  function handleGridPress(row: number, col: number) {
    setSelectedCell({ row, col })

    if (mode === "blocks") {
      toggleBlock(row, col)
    }

    if (mode === "givens") {
      toggleGiven(row, col)
    }
  }

  function loadPuzzle(puzzle: CrosswordPuzzle) {
    const nextDraft = createDraftFromPuzzle(puzzle)
    replaceDraft(nextDraft)
    setWordSeedInput(
      puzzle.clues.map((clue) => `${clue.answer} | ${clue.clue}`).join("\n")
    )
    setSaveState({ tone: "idle", message: `Loaded ${puzzle.title}.` })
  }

  function resetDraft() {
    const nextDraft = createEmptyDraft(gridSize, gridSize)
    nextDraft.title = draft.title
    nextDraft.date = draft.date
    replaceDraft(nextDraft)
    setWordSeedInput("")
    setSaveState({ tone: "idle", message: "Started a new puzzle draft." })
  }

  const blockingChecks = validation.checks.filter(
    (check) => check.severity === "error"
  )
  const advisoryChecks = validation.checks.filter(
    (check) => check.severity === "warning"
  )
  const validationMetrics = [
    {
      label: "Fill",
      value: formatPercent(validation.stats.fillRate),
      detail: `${validation.stats.openCells}/${validation.stats.totalCells} cells open`,
    },
    {
      label: "Blocks",
      value: formatPercent(validation.stats.blockRate),
      detail: `${validation.stats.blockedCells} blocked cells`,
    },
    {
      label: "Entries",
      value: `${validation.stats.wordCount}`,
      detail: `${validation.stats.acrossCount} across / ${validation.stats.downCount} down`,
    },
    {
      label: "Issues",
      value: `${validation.errors.length}`,
      detail:
        validation.warnings.length > 0
          ? `${validation.warnings.length} advisory notes`
          : "No advisory notes",
    },
  ]

  return (
    <main className="h-svh overflow-y-auto bg-[linear-gradient(180deg,#f8f3e4_0%,#efe6ca_46%,#e7ddbf_100%)] text-[#203124]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-[#284130]/10 bg-[rgba(255,250,240,0.82)] p-5 shadow-[0_36px_120px_rgba(33,49,37,0.12)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#284130]/10 bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-[0.26em] text-[#5b694f] uppercase">
                <Sparkles className="h-3.5 w-3.5" />
                Crossword CMS
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                  Build denser, smarter crossword boards.
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5d6857] sm:text-base">
                  This editor now prioritizes fixed grids, strong interlocks,
                  clean clue writing, and connected boards that feel satisfying
                  from the first few solves.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <StatusBadge connected={databaseConnected} />
              <button
                type="button"
                onClick={resetDraft}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#284130]/12 bg-white px-4 py-2 text-sm font-semibold text-[#243629] transition hover:bg-[#f6f0dd]"
              >
                <Plus className="h-4 w-4" />
                New puzzle
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={
                  isSaving || validation.errors.length > 0 || !databaseConnected
                }
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#26402e] px-5 py-2.5 text-sm font-semibold text-[#f6f1df] transition hover:bg-[#1e3325] disabled:cursor-not-allowed disabled:bg-[#7d8577]"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save schedule"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#284130]/10 bg-white/80 px-4 py-3 text-sm text-[#51604f]">
            {saveState.message}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {validationMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[22px] border border-[#284130]/10 bg-[#f7f1de] px-4 py-4"
              >
                <div className="text-[11px] font-semibold tracking-[0.22em] text-[#738166] uppercase">
                  {metric.label}
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#243629]">
                  {metric.value}
                </div>
                <p className="mt-1 text-sm text-[#5b6858]">{metric.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <section className="space-y-6">
              <Panel title="Word planner" icon={Sparkles}>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                  <div className="space-y-4">
                    <div className="rounded-[28px] border border-[#284130]/10 bg-[linear-gradient(135deg,#fbf5e6_0%,#f4ecd4_100%)] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold tracking-[0.24em] text-[#728060] uppercase">
                            Seed answers
                          </div>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#586554]">
                            Start with common words that cross easily. Use one
                            line per answer and add an optional clue with{" "}
                            <code>ANSWER | clue</code>.
                          </p>
                        </div>
                        <div className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[#4d5c4c]">
                          Longest word anchors first
                        </div>
                      </div>

                      <label className="mt-4 grid gap-2 text-sm text-[#495647]">
                        <textarea
                          rows={11}
                          value={wordSeedInput}
                          onChange={(event) =>
                            setWordSeedInput(event.target.value)
                          }
                          placeholder={
                            "WATER | Flows but never walks\nMARKET | Weekend bargain stop\nLIGHT | Switch it on"
                          }
                          className="resize-none rounded-[24px] border border-[#284130]/12 bg-white/90 px-4 py-4 text-sm text-[#203124] transition outline-none placeholder:text-[#9aa18f] focus:border-[#d47538]"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      {RULEBOOK.slice(0, 3).map((rule) => {
                        const Icon = rule.icon

                        return (
                          <div
                            key={rule.title}
                            className="rounded-[24px] border border-[#284130]/10 bg-white p-4"
                          >
                            <div className="flex items-center gap-3 text-[#26402e]">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef3da]">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold tracking-[0.22em] text-[#7a856e] uppercase">
                                  {rule.eyebrow}
                                </div>
                                <div className="text-sm font-semibold text-[#243629]">
                                  {rule.title}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 space-y-2 text-sm leading-6 text-[#586554]">
                              {rule.items.map((item) => (
                                <p key={item}>{item}</p>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[28px] border border-[#284130]/10 bg-[#f8f4e6] p-5">
                      <div className="text-xs font-semibold tracking-[0.24em] text-[#728060] uppercase">
                        Fixed grid menu
                      </div>
                      <div className="mt-3 grid gap-3">
                        {GRID_OPTIONS.map((option) => (
                          <button
                            key={option.size}
                            type="button"
                            onClick={() => setGridSize(option.size)}
                            className={cn(
                              "rounded-[22px] border px-4 py-4 text-left transition",
                              gridSize === option.size
                                ? "border-[#26402e] bg-[#26402e] text-[#f6f1df]"
                                : "border-[#284130]/12 bg-white text-[#243629] hover:bg-[#f6f0dd]"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-base font-semibold">
                                {option.size} x {option.size}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.2em] uppercase",
                                  gridSize === option.size
                                    ? "bg-white/15 text-[#f8f3e4]"
                                    : "bg-[#eef3da] text-[#43553f]"
                                )}
                              >
                                {option.label}
                              </span>
                            </div>
                            <p
                              className={cn(
                                "mt-2 text-sm leading-6",
                                gridSize === option.size
                                  ? "text-[#e8dfc7]"
                                  : "text-[#5b6858]"
                              )}
                            >
                              {option.detail}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-[#284130]/10 bg-white p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold tracking-[0.24em] text-[#728060] uppercase">
                            Recommended grid
                          </div>
                          <div className="mt-2 text-3xl font-semibold text-[#243629]">
                            {recommendedGrid.rows} x {recommendedGrid.cols}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGridSize(recommendedGrid.rows)}
                          className="rounded-full border border-[#284130]/12 bg-[#f6f0dd] px-4 py-2 text-xs font-semibold text-[#243629] transition hover:bg-[#efe5c8]"
                        >
                          Use recommendation
                        </button>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#5b6858]">
                        {recommendedGrid.label}
                      </p>

                      <div className="mt-4 grid gap-2">
                        <button
                          type="button"
                          onClick={() => applyGridSize(gridSize)}
                          className="rounded-2xl border border-[#284130]/12 bg-white px-4 py-3 text-sm font-semibold text-[#243629] transition hover:bg-[#f6f0dd]"
                        >
                          Apply fresh {gridSize}x{gridSize} grid
                        </button>
                        <button
                          type="button"
                          onClick={generateFromWords}
                          className="rounded-2xl bg-[#d47538] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#bf642a]"
                        >
                          Generate interlocked layout
                        </button>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "rounded-[24px] border px-4 py-4 text-sm leading-6",
                        plannerState.tone === "error"
                          ? "border-[#e0b49b]/40 bg-[#fff1e8] text-[#7d4a29]"
                          : plannerState.tone === "success"
                            ? "border-[#7eb06d]/30 bg-[#eff8e8] text-[#2d5e2e]"
                            : "border-[#284130]/10 bg-white text-[#51604f]"
                      )}
                    >
                      {plannerState.message}
                    </div>
                  </div>
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <Panel title="Puzzle details" icon={CalendarDays}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm text-[#495647] sm:col-span-2">
                      <span className="font-semibold text-[#243629]">
                        Title
                      </span>
                      <input
                        value={draft.title}
                        onChange={(event) =>
                          updateMetadata("title", event.target.value)
                        }
                        placeholder="Weekend Warmup"
                        className="rounded-2xl border border-[#284130]/12 bg-[#f8f4e6] px-4 py-3 text-[#203124] ring-0 transition outline-none placeholder:text-[#9aa18f] focus:border-[#d47538]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm text-[#495647]">
                      <span className="font-semibold text-[#243629]">
                        Publish date
                      </span>
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(event) =>
                          updateMetadata("date", event.target.value)
                        }
                        className="rounded-2xl border border-[#284130]/12 bg-[#f8f4e6] px-4 py-3 text-[#203124] transition outline-none focus:border-[#d47538]"
                      />
                    </label>
                    <div className="rounded-2xl border border-dashed border-[#284130]/14 bg-[#f8f4e6] px-4 py-3 text-sm text-[#5f6c5d]">
                      Grid size:{" "}
                      <span className="font-semibold text-[#243629]">
                        {draft.rows} x {draft.cols}
                      </span>
                    </div>
                  </div>
                </Panel>

                <Panel title="Selected cell" icon={PenSquare}>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between rounded-2xl bg-[#f8f4e6] px-4 py-3 text-sm text-[#4f5e4d]">
                      <span>Position</span>
                      <span className="font-semibold text-[#243629]">
                        {selectedCell.row + 1}, {selectedCell.col + 1}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-[#f8f4e6] px-4 py-3 text-sm text-[#4f5e4d]">
                      <span>Symmetry pair</span>
                      <span className="font-semibold text-[#243629]">
                        {selectedPartner.row + 1}, {selectedPartner.col + 1}
                      </span>
                    </div>
                    <label className="grid gap-2 text-sm text-[#495647]">
                      <span className="font-semibold text-[#243629]">
                        Letter
                      </span>
                      <input
                        maxLength={1}
                        value={selected?.letter ?? ""}
                        onChange={(event) =>
                          updateLetter(
                            selectedCell.row,
                            selectedCell.col,
                            event.target.value
                          )
                        }
                        disabled={!selected || selected.isBlock}
                        className="rounded-2xl border border-[#284130]/12 bg-[#f8f4e6] px-4 py-3 text-[#203124] transition outline-none placeholder:text-[#9aa18f] focus:border-[#d47538] disabled:cursor-not-allowed disabled:bg-[#ece7d7]"
                        placeholder={selected?.isBlock ? "Blocked" : "A"}
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          toggleBlock(selectedCell.row, selectedCell.col)
                        }
                        className="rounded-2xl border border-[#284130]/12 bg-white px-4 py-3 text-sm font-semibold text-[#243629] transition hover:bg-[#f6f0dd]"
                      >
                        Toggle mirrored block
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toggleGiven(selectedCell.row, selectedCell.col)
                        }
                        className="rounded-2xl border border-[#284130]/12 bg-white px-4 py-3 text-sm font-semibold text-[#243629] transition hover:bg-[#f6f0dd]"
                      >
                        Mark as given
                      </button>
                    </div>
                  </div>
                </Panel>
              </div>

              <Panel title="Grid editor" icon={SquareDashed}>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["letters", "Letters", Square],
                      ["blocks", "Blocks", SquareDashed],
                      ["givens", "Given cells", Eye],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
                        mode === value
                          ? "border-[#26402e] bg-[#26402e] text-[#f6f1df]"
                          : "border-[#284130]/12 bg-white text-[#243629] hover:bg-[#f6f0dd]"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-[26px] bg-[#cad39d] p-3 sm:p-4">
                  <div
                    className="grid gap-[4px]"
                    style={{
                      gridTemplateColumns: `repeat(${draft.cols}, minmax(0, 1fr))`,
                    }}
                  >
                    {draft.cells.flatMap((row, rowIndex) =>
                      row.map((cell, colIndex) => {
                        const cellKey = keyFor(rowIndex, colIndex)
                        const isSelected =
                          selectedCell.row === rowIndex &&
                          selectedCell.col === colIndex
                        const wordStart = validation.words.find(
                          (word) =>
                            word.row === rowIndex && word.col === colIndex
                        )

                        return (
                          <button
                            key={cellKey}
                            type="button"
                            onClick={() => handleGridPress(rowIndex, colIndex)}
                            className={cn(
                              "relative flex aspect-square min-h-[40px] items-center justify-center rounded-[10px] border text-sm font-semibold transition sm:min-h-[48px]",
                              cell.isBlock
                                ? "border-[#445335] bg-[#5f6e44] text-transparent"
                                : "border-white/60 bg-white text-[#203124]",
                              isSelected &&
                                "ring-2 ring-[#f08a44] ring-offset-2 ring-offset-[#cad39d]"
                            )}
                          >
                            {wordStart ? (
                              <span className="absolute top-1 left-1 text-[9px] font-bold text-[#3a6e95]">
                                {wordStart.number}
                              </span>
                            ) : null}
                            {!cell.isBlock ? (
                              <>
                                <span>{cell.letter || ""}</span>
                                {cell.given ? (
                                  <span className="absolute right-1 bottom-1 h-2.5 w-2.5 rounded-full bg-[#0f6aa5]" />
                                ) : null}
                              </>
                            ) : null}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              </Panel>

              <Panel title="Validation" icon={CheckCircle2}>
                <div className="grid gap-3 md:grid-cols-2">
                  {blockingChecks.map((check) => (
                    <div
                      key={check.label}
                      className={cn(
                        "rounded-[22px] border px-4 py-4",
                        check.passed
                          ? "border-[#7eb06d]/30 bg-[#eff8e8]"
                          : "border-[#e0b49b]/40 bg-[#fff1e8]"
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#243629]">
                        {check.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-[#4b8d43]" />
                        ) : (
                          <CircleAlert className="h-4 w-4 text-[#d47538]" />
                        )}
                        {check.label}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#566154]">
                        {check.detail}
                      </p>
                    </div>
                  ))}
                </div>

                {advisoryChecks.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {advisoryChecks.map((check) => (
                      <div
                        key={check.label}
                        className={cn(
                          "rounded-[22px] border px-4 py-4",
                          check.passed
                            ? "border-[#b9c7a9]/40 bg-[#f7f4e8]"
                            : "border-[#e0cf9b]/40 bg-[#fff8e4]"
                        )}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#243629]">
                          {check.passed ? (
                            <CheckCircle2 className="h-4 w-4 text-[#738b50]" />
                          ) : (
                            <CircleAlert className="h-4 w-4 text-[#c08b2b]" />
                          )}
                          {check.label}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#5d644e]">
                          {check.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {validation.errors.length > 0 ? (
                  <div className="mt-4 rounded-[22px] border border-[#e0b49b]/40 bg-[#fff1e8] px-4 py-4 text-sm text-[#7d4a29]">
                    {validation.errors[0]}
                  </div>
                ) : validation.warnings.length > 0 ? (
                  <div className="mt-4 rounded-[22px] border border-[#e0cf9b]/40 bg-[#fff8e4] px-4 py-4 text-sm text-[#8b6a26]">
                    {validation.warnings[0]}
                  </div>
                ) : null}
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                <ClueEditor
                  title="Across hints"
                  words={acrossWords}
                  clues={draft.clues}
                  onChange={updateClue}
                />
                <ClueEditor
                  title="Down hints"
                  words={downWords}
                  clues={draft.clues}
                  onChange={updateClue}
                />
              </div>
            </section>

            <aside className="space-y-6">
              <CrosswordPreview draft={draft} words={validation.words} />

              <Panel title="Construction playbook" icon={ListChecks}>
                <div className="space-y-4">
                  {RULEBOOK.slice(3).map((rule) => {
                    const Icon = rule.icon

                    return (
                      <div
                        key={rule.title}
                        className="rounded-[24px] border border-[#284130]/10 bg-[#f8f4e6] p-4"
                      >
                        <div className="flex items-center gap-3 text-[#26402e]">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold tracking-[0.22em] text-[#7a856e] uppercase">
                              {rule.eyebrow}
                            </div>
                            <div className="text-sm font-semibold text-[#243629]">
                              {rule.title}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2 text-sm leading-6 text-[#586554]">
                          {rule.items.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  <div className="rounded-[24px] border border-[#284130]/10 bg-white p-4">
                    <div className="text-[11px] font-semibold tracking-[0.22em] text-[#7a856e] uppercase">
                      Difficulty mix
                    </div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-[#586554]">
                      {DIFFICULTY_MIX.map((item) => (
                        <p key={item.label}>
                          <span className="font-semibold text-[#243629]">
                            {item.label}:
                          </span>{" "}
                          {item.detail}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Prompt kit" icon={BrainCircuit}>
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-[#586554]">
                    Use this whenever you want the generator prompt to stay
                    structure-first instead of word-first.
                  </p>
                  <pre className="overflow-x-auto rounded-[24px] border border-[#284130]/10 bg-[#f8f4e6] p-4 text-xs leading-6 text-[#33422f]">
                    <code>{PROMPT_TEMPLATE}</code>
                  </pre>
                </div>
              </Panel>

              <Panel title="Scheduled puzzles" icon={Database}>
                <div className="space-y-3">
                  {puzzles.length === 0 ? (
                    <p className="text-sm text-[#5e6a5a]">
                      No saved puzzles yet.
                    </p>
                  ) : (
                    puzzles
                      .slice()
                      .sort((left, right) =>
                        right.date.localeCompare(left.date)
                      )
                      .map((puzzle) => (
                        <button
                          key={puzzle.id}
                          type="button"
                          onClick={() => loadPuzzle(puzzle)}
                          className="flex w-full items-start justify-between rounded-[22px] border border-[#284130]/10 bg-white px-4 py-4 text-left transition hover:bg-[#f7f1dc]"
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#243629]">
                              {puzzle.title}
                            </div>
                            <div className="mt-1 text-sm text-[#667262]">
                              {puzzle.date}
                            </div>
                          </div>
                          <div className="rounded-full bg-[#eef3da] px-3 py-1 text-xs font-semibold text-[#43553f]">
                            {puzzle.clues.length} clues
                          </div>
                        </button>
                      ))
                  )}
                </div>
              </Panel>
            </aside>
          </div>
        </div>
      </div>
    </main>
  )
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof CalendarDays
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-[#284130]/10 bg-white/80 p-5 shadow-[0_20px_60px_rgba(33,49,37,0.06)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef3da] text-[#26402e]">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-lg font-semibold text-[#243629]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ClueEditor({
  title,
  words,
  clues,
  onChange,
}: {
  title: string
  words: Array<{
    id: string
    number: number
    answer: string
    complete: boolean
  }>
  clues: Record<string, string>
  onChange: (clueId: string, value: string) => void
}) {
  return (
    <Panel title={title} icon={PenSquare}>
      <div className="space-y-4">
        {words.length === 0 ? (
          <p className="text-sm text-[#5e6a5a]">No words detected yet.</p>
        ) : (
          words.map((word) => (
            <label
              key={word.id}
              className="grid gap-2 rounded-[22px] border border-[#284130]/10 bg-[#f8f4e6] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#243629]">
                  {word.number}
                  {word.id.endsWith("a") ? "A" : "D"}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#536251]">
                  {word.complete
                    ? word.answer
                    : word.answer.padEnd(word.answer.length, "_")}
                </span>
              </div>
              <div className="text-xs text-[#6a7464]">
                {word.answer.length} letters - direct, riddle, relatable, or
                playful.
              </div>
              <textarea
                rows={2}
                value={clues[word.id] ?? ""}
                onChange={(event) => onChange(word.id, event.target.value)}
                placeholder="Write a clue players can solve without it giving the answer away..."
                className="resize-none rounded-2xl border border-[#284130]/12 bg-white px-4 py-3 text-sm text-[#203124] transition outline-none placeholder:text-[#9aa18f] focus:border-[#d47538]"
              />
            </label>
          ))
        )}
      </div>
    </Panel>
  )
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold",
        connected
          ? "bg-[#eaf4df] text-[#2e5a28]"
          : "bg-[#fff1e8] text-[#8a4e2c]"
      )}
    >
      <Database className="h-4 w-4" />
      {connected ? "Neon connected" : "Database env missing"}
    </div>
  )
}

function cloneDraft(draft: CrosswordDraft): CrosswordDraft {
  return {
    ...draft,
    clues: { ...draft.clues },
    cells: draft.cells.map((row) => row.map((cell) => ({ ...cell }))),
  }
}

function findFirstEditableCell(draft: CrosswordDraft) {
  for (let row = 0; row < draft.rows; row += 1) {
    for (let col = 0; col < draft.cols; col += 1) {
      if (!draft.cells[row][col].isBlock) {
        return { row, col }
      }
    }
  }

  return { row: 0, col: 0 }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampToFixedGridSize(value: number) {
  return (
    FIXED_GRID_SIZES.find((size) => size >= value) ??
    FIXED_GRID_SIZES[FIXED_GRID_SIZES.length - 1]
  )
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function parseSeedWords(value: string): SeedWord[] {
  return value
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [answer, ...clueParts] = line.split("|")
      return {
        answer: answer.trim(),
        clue: clueParts.join("|").trim(),
      }
    })
}
