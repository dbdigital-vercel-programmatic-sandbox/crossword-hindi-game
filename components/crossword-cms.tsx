"use client"

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  PenSquare,
  Plus,
  Save,
  Sparkles,
  Square,
  SquareDashed,
} from "lucide-react"

import { CrosswordPreview } from "@/components/crossword-preview"
import {
  createDraftFromPuzzle,
  createEmptyDraft,
  getSymmetryPartner,
  keyFor,
  type CrosswordDraft,
  validateCrosswordDraft,
} from "@/lib/crossword-editor"
import type { CrosswordPuzzle } from "@/lib/crossword-schedule"
import { cn } from "@/lib/utils"

type EditorMode = "letters" | "blocks" | "givens"

type SaveState = {
  tone: "idle" | "success" | "error"
  message: string
}

export function CrosswordCms({
  initialPuzzles,
  databaseConnected,
}: {
  initialPuzzles: CrosswordPuzzle[]
  databaseConnected: boolean
}) {
  const [puzzles, setPuzzles] = useState(initialPuzzles)
  const [draft, setDraft] = useState<CrosswordDraft>(() => createEmptyDraft())
  const [selectedCell, setSelectedCell] = useState({ row: 0, col: 0 })
  const [mode, setMode] = useState<EditorMode>("letters")
  const [isSaving, setIsSaving] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({
    tone: "idle",
    message: databaseConnected
      ? "Draft changes stay live in the preview."
      : "Add DATABASE_URL to enable saving in Neon.",
  })

  const validation = useMemo(() => validateCrosswordDraft(draft), [draft])
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
      setDraft(createDraftFromPuzzle(data.puzzle))
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

  function updateMetadata(field: "title" | "date", value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
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
    setDraft(nextDraft)
    setSelectedCell(findFirstEditableCell(nextDraft))
    setSaveState({ tone: "idle", message: `Loaded ${puzzle.title}.` })
  }

  function resetDraft() {
    const nextDraft = createEmptyDraft(draft.rows, draft.cols)
    setDraft(nextDraft)
    setSelectedCell({ row: 0, col: 0 })
    setSaveState({ tone: "idle", message: "Started a new puzzle draft." })
  }

  return (
    <main className="min-h-svh overflow-y-auto bg-[linear-gradient(180deg,#f8f3e4_0%,#efe6ca_46%,#e7ddbf_100%)] text-[#203124]">
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
                  Schedule daily grids with live checks.
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5d6857] sm:text-base">
                  Build future puzzles, keep the board symmetric, make sure
                  every letter crosses, and preview exactly what players will
                  see.
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

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <section className="space-y-6">
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
                  {validation.checks.map((check) => (
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
                {validation.errors.length > 0 ? (
                  <div className="mt-4 rounded-[22px] border border-[#e0b49b]/40 bg-[#fff1e8] px-4 py-4 text-sm text-[#7d4a29]">
                    {validation.errors[0]}
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
              <textarea
                rows={2}
                value={clues[word.id] ?? ""}
                onChange={(event) => onChange(word.id, event.target.value)}
                placeholder="Write the clue players will read..."
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
