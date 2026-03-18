"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Delete, Settings2 } from "lucide-react"

import { cn } from "@/lib/utils"

type Direction = "across" | "down"
type LockSource = "given" | "revealed" | "solved"
type FeedbackType = "wrong" | "correct"

type ClueDefinition = {
  id: string
  number: number
  direction: Direction
  clue: string
  answer: string
  row: number
  col: number
}

type GridCell = {
  row: number
  col: number
  solution: string
  clueIds: string[]
  number?: number
}

type Clue = ClueDefinition & {
  cells: Array<{ row: number; col: number; key: string }>
}

type GameState = {
  entries: Record<string, string>
  lockSources: Partial<Record<string, LockSource>>
  solvedIds: string[]
  completedIds: string[]
  activeClueId: string
  activeIndex: number
  feedback: FeedbackState | null
}

type FeedbackState = {
  clueId: string
  type: FeedbackType
  stamp: number
}

const GRID_ROWS = 9
const GRID_COLS = 8

const clueDefinitions: ClueDefinition[] = [
  {
    id: "1a",
    number: 1,
    direction: "across",
    clue: "Fruit drink",
    answer: "JUICE",
    row: 0,
    col: 2,
  },
  {
    id: "2a",
    number: 2,
    direction: "across",
    clue: "Free-time activity",
    answer: "HOBBY",
    row: 1,
    col: 1,
  },
  {
    id: "3d",
    number: 3,
    direction: "down",
    clue: "Taken temporarily",
    answer: "BORROWED",
    row: 1,
    col: 3,
  },
  {
    id: "4a",
    number: 4,
    direction: "across",
    clue: "Yellow citrus fruits",
    answer: "LEMONS",
    row: 2,
    col: 0,
  },
  {
    id: "5a",
    number: 5,
    direction: "across",
    clue: "Made a loud lion-like sound",
    answer: "ROARED",
    row: 3,
    col: 0,
  },
  {
    id: "6a",
    number: 6,
    direction: "across",
    clue: "Woodland area",
    answer: "FOREST",
    row: 4,
    col: 1,
  },
  {
    id: "7d",
    number: 7,
    direction: "down",
    clue: "Watching closely",
    answer: "EYING",
    row: 4,
    col: 4,
  },
  {
    id: "8a",
    number: 8,
    direction: "across",
    clue: "Long trip",
    answer: "VOYAGE",
    row: 5,
    col: 2,
  },
  {
    id: "9a",
    number: 9,
    direction: "across",
    clue: "Turn smoothly",
    answer: "SWIVEL",
    row: 6,
    col: 2,
  },
  {
    id: "10a",
    number: 10,
    direction: "across",
    clue: "General feeling",
    answer: "SENSE",
    row: 7,
    col: 2,
  },
  {
    id: "11a",
    number: 11,
    direction: "across",
    clue: "Move slightly",
    answer: "BUDGE",
    row: 8,
    col: 1,
  },
]

const clues: Clue[] = clueDefinitions.map((clue) => ({
  ...clue,
  cells: clue.answer.split("").map((_, index) => {
    const row = clue.row + (clue.direction === "down" ? index : 0)
    const col = clue.col + (clue.direction === "across" ? index : 0)

    return { row, col, key: keyFor(row, col) }
  }),
}))

const clueOrder = clues.map((clue) => clue.id)

const clueById = Object.fromEntries(
  clues.map((clue) => [clue.id, clue])
) as Record<string, Clue>

const cellData = buildCellData(clues)

const givenLocks: Partial<Record<string, LockSource>> = {
  [keyFor(0, 2)]: "given",
  [keyFor(0, 3)]: "given",
  [keyFor(0, 4)]: "given",
  [keyFor(0, 5)]: "given",
  [keyFor(0, 6)]: "given",
  [keyFor(1, 1)]: "given",
  [keyFor(3, 0)]: "given",
  [keyFor(4, 2)]: "given",
  [keyFor(6, 2)]: "given",
  [keyFor(8, 4)]: "given",
}

const initialEntries = Object.fromEntries(
  Object.entries(givenLocks).map(([key]) => [key, cellData[key].solution])
)

const keyboardRows = [
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  "ZXCVBNM".split(""),
]

export default function Page() {
  const [game, setGame] = useState<GameState>(() => ({
    entries: initialEntries,
    lockSources: givenLocks,
    solvedIds: ["1a"],
    completedIds: [],
    activeClueId: "2a",
    activeIndex: firstEmptyIndex(clueById["2a"], initialEntries, givenLocks),
    feedback: null,
  }))

  const activeClue = clueById[game.activeClueId]
  const solvedSet = useMemo(() => new Set(game.solvedIds), [game.solvedIds])
  const completedSet = useMemo(
    () => new Set(game.completedIds),
    [game.completedIds]
  )

  const selectClue = useCallback((clueId: string, preferredIndex?: number) => {
    setGame((current) => {
      const nextClue = clueById[clueId]
      const nextIndex =
        preferredIndex !== undefined &&
        isEditableCell(nextClue, preferredIndex, current.lockSources)
          ? preferredIndex
          : firstEmptyIndex(nextClue, current.entries, current.lockSources)

      return {
        ...current,
        activeClueId: clueId,
        activeIndex: nextIndex,
        feedback:
          current.feedback?.clueId === current.activeClueId
            ? null
            : current.feedback,
      }
    })
  }, [])

  const cycleClue = useCallback(
    (step: 1 | -1) => {
      const currentIndex = clueOrder.indexOf(game.activeClueId)
      const nextIndex =
        (currentIndex + step + clueOrder.length) % clueOrder.length
      selectClue(clueOrder[nextIndex])
    },
    [game.activeClueId, selectClue]
  )

  const handleLetter = useCallback((letter: string) => {
    setGame((current) => {
      const clue = clueById[current.activeClueId]
      if (current.solvedIds.includes(clue.id)) {
        return current
      }

      const targetIndex = findWritableIndex(
        clue,
        current.activeIndex,
        current.entries,
        current.lockSources
      )
      if (targetIndex === -1) {
        return current
      }

      const targetCell = clue.cells[targetIndex]
      const targetKey = targetCell.key
      const nextEntries = {
        ...current.entries,
        [targetKey]: letter,
      }

      let nextState: GameState = {
        ...current,
        entries: nextEntries,
        feedback: null,
        activeIndex: nextCursorIndex(
          clue,
          targetIndex,
          nextEntries,
          current.lockSources
        ),
      }

      if (!isClueFilled(clue, nextEntries)) {
        return nextState
      }

      if (isClueSolved(clue, nextEntries)) {
        const nextSolvedIds = [...current.solvedIds, clue.id]
        const nextCompletedIds = [...current.completedIds, clue.id]
        const frozenLocks = freezeSolvedClue(current.lockSources, clue)
        const revealOutcome = revealLetters(
          nextEntries,
          frozenLocks,
          nextSolvedIds
        )
        const nextClueId = findNextUnsolvedClueId(clue.id, nextSolvedIds)

        const nextFeedback: FeedbackState = {
          clueId: clue.id,
          type: "correct",
          stamp: Date.now(),
        }

        nextState = {
          ...nextState,
          entries: revealOutcome.entries,
          lockSources: revealOutcome.lockSources,
          solvedIds: nextSolvedIds,
          completedIds: nextCompletedIds,
          feedback: nextFeedback,
        }

        if (nextClueId) {
          nextState = {
            ...nextState,
            activeClueId: nextClueId,
            activeIndex: firstEmptyIndex(
              clueById[nextClueId],
              revealOutcome.entries,
              revealOutcome.lockSources
            ),
          }
        }

        return nextState
      }

      const incorrectIndex = firstIncorrectEditableIndex(
        clue,
        nextEntries,
        current.lockSources
      )

      const nextFeedback: FeedbackState = {
        clueId: clue.id,
        type: "wrong",
        stamp: Date.now(),
      }

      return {
        ...nextState,
        feedback: nextFeedback,
        activeIndex: incorrectIndex === -1 ? targetIndex : incorrectIndex,
      }
    })
  }, [])

  const handleBackspace = useCallback(() => {
    setGame((current) => {
      const clue = clueById[current.activeClueId]
      if (current.solvedIds.includes(clue.id)) {
        return current
      }

      const currentCell = clue.cells[current.activeIndex]
      if (currentCell) {
        const currentValue = current.entries[currentCell.key]
        if (
          currentValue &&
          isEditableCell(clue, current.activeIndex, current.lockSources)
        ) {
          const nextEntries = { ...current.entries }
          delete nextEntries[currentCell.key]

          return {
            ...current,
            entries: nextEntries,
            feedback: null,
          }
        }
      }

      const previousIndex = previousFilledIndex(
        clue,
        current.activeIndex,
        current.entries,
        current.lockSources
      )
      if (previousIndex === -1) {
        return current
      }

      const previousKey = clue.cells[previousIndex].key
      const nextEntries = { ...current.entries }
      delete nextEntries[previousKey]

      return {
        ...current,
        entries: nextEntries,
        activeIndex: previousIndex,
        feedback: null,
      }
    })
  }, [])

  useEffect(() => {
    if (game.feedback?.type !== "correct") {
      return
    }

    const timeout = window.setTimeout(() => {
      setGame((current) =>
        current.feedback?.stamp === game.feedback?.stamp
          ? { ...current, feedback: null }
          : current
      )
    }, 520)

    return () => window.clearTimeout(timeout)
  }, [game.feedback])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        event.preventDefault()
        handleBackspace()
        return
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        cycleClue(-1)
        return
      }

      if (event.key === "ArrowRight") {
        event.preventDefault()
        cycleClue(1)
        return
      }

      if (/^[a-z]$/i.test(event.key)) {
        event.preventDefault()
        handleLetter(event.key.toUpperCase())
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cycleClue, handleBackspace, handleLetter])

  const activeProgress = activeClue.cells.filter(
    (cell) => game.entries[cell.key] === cellData[cell.key].solution
  ).length

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[430px] flex-col px-4 py-5 sm:py-6">
      <div className="relative overflow-hidden rounded-[30px] border border-white/65 bg-white/78 px-4 py-4 shadow-[0_28px_80px_-40px_rgba(77,55,118,0.55)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-32 rounded-full bg-[#e8def8]/60 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <button
            type="button"
            aria-label="Open settings"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/85 text-slate-600 shadow-[0_14px_32px_-24px_rgba(69,53,110,0.8)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Settings2 className="h-5 w-5" />
          </button>

          <div className="text-center">
            <p className="text-[11px] font-semibold tracking-[0.32em] text-slate-400 uppercase">
              Minimal crossword
            </p>
            <h1 className="text-2xl font-semibold tracking-[0.08em] text-slate-800">
              Level 2
            </h1>
          </div>

          <div className="h-11 w-11 rounded-2xl border border-transparent" />
        </div>

        <section className="relative mt-5 rounded-[28px] border border-white/70 bg-[#f6f1fb]/85 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
          <div className="grid grid-cols-8 gap-1.5">
            {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
              const row = Math.floor(index / GRID_COLS)
              const col = index % GRID_COLS
              const key = keyFor(row, col)
              const cell = cellData[key]

              if (!cell) {
                return (
                  <div
                    key={key}
                    className="aspect-square rounded-[16px] bg-[#d9cdec]/22"
                  />
                )
              }

              const entry = game.entries[key]
              const isActive = activeClue.cells.some(
                (clueCell) => clueCell.key === key
              )
              const isCursor = activeClue.cells[game.activeIndex]?.key === key
              const lockSource = game.lockSources[key]
              const completedCell = cell.clueIds.some((clueId) =>
                completedSet.has(clueId)
              )
              const feedbackMatch =
                game.feedback && cell.clueIds.includes(game.feedback.clueId)
                  ? game.feedback
                  : null

              return (
                <button
                  key={`${key}-${feedbackMatch?.stamp ?? 0}`}
                  type="button"
                  onClick={() => {
                    const memberships = cell.clueIds
                    if (memberships.length === 0) {
                      return
                    }

                    const nextClueId =
                      memberships.includes(game.activeClueId) &&
                      memberships.length > 1
                        ? (memberships.find(
                            (clueId) => clueId !== game.activeClueId
                          ) ?? memberships[0])
                        : (memberships.find(
                            (clueId) => clueById[clueId].direction === "across"
                          ) ?? memberships[0])

                    const clue = clueById[nextClueId]
                    const preferredIndex = clue.cells.findIndex(
                      (clueCell) => clueCell.key === key
                    )
                    selectClue(nextClueId, preferredIndex)
                  }}
                  className={cn(
                    "relative aspect-square rounded-[16px] border text-lg font-semibold text-slate-700 shadow-[0_18px_35px_-28px_rgba(61,45,93,0.75)] transition-all duration-200",
                    "flex items-center justify-center",
                    feedbackMatch?.type === "wrong"
                      ? "animate-clue-shake border-[#e8a4a2] bg-[#fff1f0]"
                      : completedCell
                        ? "border-[#b9dcc7] bg-[#ebf8ef] shadow-[0_22px_42px_-30px_rgba(110,183,131,0.75)]"
                        : isActive
                          ? "border-[#f0c29d] bg-[#fde5d2] shadow-[0_22px_42px_-30px_rgba(238,155,108,0.9)]"
                          : "border-white/90 bg-[#fffaf1]",
                    isCursor &&
                      "scale-[1.02] border-[#ebaa73] ring-2 ring-[#f6d5bc]",
                    feedbackMatch?.type === "correct" &&
                      "animate-clue-pop shadow-[0_24px_40px_-28px_rgba(110,183,131,0.9)]"
                  )}
                >
                  {cell.number ? (
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold text-slate-400">
                      {cell.number}
                    </span>
                  ) : null}

                  <span
                    className={cn(
                      "translate-y-[1px] text-[1.3rem] leading-none tracking-[0.06em] transition-colors duration-200",
                      completedCell && "text-emerald-700",
                      lockSource === "revealed" && "text-teal-600",
                      lockSource === "given" && "text-sky-700",
                      lockSource === "solved" && "text-emerald-700",
                      !lockSource && entry && "text-slate-700",
                      !entry && "text-transparent"
                    )}
                  >
                    {entry ?? "_"}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-4 flex items-center gap-3 rounded-[24px] border border-white/70 bg-white/82 p-3 shadow-[0_24px_55px_-38px_rgba(77,55,118,0.55)]">
          <button
            type="button"
            onClick={() => cycleClue(-1)}
            aria-label="Previous clue"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#e8ddf6] bg-[#f8f4fd] text-slate-500 transition-colors hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div key={activeClue.id} className="animate-clue-fade min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.28em] text-slate-400 uppercase">
              Current clue
            </p>
            <p className="mt-1 truncate text-base font-medium text-slate-700">
              {activeClue.number}
              {activeClue.direction === "across" ? "a" : "d"}. {activeClue.clue}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              {activeProgress}/{activeClue.answer.length} correct
            </p>
          </div>

          <button
            type="button"
            onClick={() => cycleClue(1)}
            aria-label="Next clue"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#e8ddf6] bg-[#f8f4fd] text-slate-500 transition-colors hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </section>

        <section className="mt-4 space-y-2.5 rounded-[28px] border border-white/70 bg-[#fbf8ff]/82 p-3 shadow-[0_22px_55px_-40px_rgba(77,55,118,0.55)]">
          <div className="grid grid-cols-10 gap-2">
            {keyboardRows[0].map((key) => (
              <KeyButton key={key} value={key} onPress={handleLetter} />
            ))}
          </div>

          <div className="grid grid-cols-9 gap-2 px-4">
            {keyboardRows[1].map((key) => (
              <KeyButton key={key} value={key} onPress={handleLetter} />
            ))}
          </div>

          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_1.35fr] gap-2">
            {keyboardRows[2].map((key) => (
              <KeyButton key={key} value={key} onPress={handleLetter} />
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              className="flex h-12 items-center justify-center rounded-[18px] border border-[#eadff7] bg-white/90 text-slate-500 shadow-[0_18px_34px_-28px_rgba(66,50,104,0.8)] transition-transform duration-150 hover:-translate-y-0.5"
              aria-label="Backspace"
            >
              <Delete className="h-5 w-5" />
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

function KeyButton({
  value,
  onPress,
}: {
  value: string
  onPress: (value: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPress(value)}
      className="flex h-12 items-center justify-center rounded-[18px] border border-[#eadff7] bg-white/92 text-base font-semibold tracking-[0.08em] text-slate-700 shadow-[0_18px_34px_-28px_rgba(66,50,104,0.8)] transition-transform duration-150 hover:-translate-y-0.5"
    >
      {value}
    </button>
  )
}

function buildCellData(allClues: Clue[]) {
  const cells: Record<string, GridCell> = {}

  allClues.forEach((clue) => {
    clue.cells.forEach((cell, index) => {
      const key = cell.key
      const solution = clue.answer[index]
      const existing = cells[key]

      if (existing && existing.solution !== solution) {
        throw new Error(`Conflicting solution at ${key}`)
      }

      cells[key] = {
        row: cell.row,
        col: cell.col,
        solution,
        clueIds: existing ? [...existing.clueIds, clue.id] : [clue.id],
        number: existing?.number ?? (index === 0 ? clue.number : undefined),
      }
    })
  })

  return cells
}

function revealLetters(
  entries: Record<string, string>,
  lockSources: Partial<Record<string, LockSource>>,
  solvedIds: string[]
) {
  const solvedSet = new Set(solvedIds)
  const eligibleClues = clues
    .filter((clue) => !solvedSet.has(clue.id))
    .map((clue) => {
      const emptyCells = clue.cells.filter(
        (cell) => !entries[cell.key] && !lockSources[cell.key]
      )
      return { clue, emptyCells }
    })
    .filter(({ emptyCells }) => emptyCells.length > 1)

  if (eligibleClues.length === 0) {
    return { entries, lockSources }
  }

  const shuffledClues = shuffle(eligibleClues)
  const revealCount = Math.min(
    Math.floor(Math.random() * 2) + 1,
    shuffledClues.length
  )
  const nextEntries = { ...entries }
  const nextLockSources = { ...lockSources }

  shuffledClues.slice(0, revealCount).forEach(({ emptyCells }) => {
    const chosenCell = emptyCells[Math.floor(Math.random() * emptyCells.length)]
    nextEntries[chosenCell.key] = cellData[chosenCell.key].solution
    nextLockSources[chosenCell.key] = "revealed"
  })

  return {
    entries: nextEntries,
    lockSources: nextLockSources,
  }
}

function isClueSolved(clue: Clue, entries: Record<string, string>) {
  return clue.cells.every(
    (cell) => entries[cell.key] === cellData[cell.key].solution
  )
}

function isClueFilled(clue: Clue, entries: Record<string, string>) {
  return clue.cells.every((cell) => Boolean(entries[cell.key]))
}

function freezeSolvedClue(
  lockSources: Partial<Record<string, LockSource>>,
  clue: Clue
) {
  const nextLockSources = { ...lockSources }

  clue.cells.forEach((cell) => {
    nextLockSources[cell.key] = "solved"
  })

  return nextLockSources
}

function firstEmptyIndex(
  clue: Clue,
  entries: Record<string, string>,
  lockSources: Partial<Record<string, LockSource>>
) {
  const firstEmpty = clue.cells.findIndex(
    (cell) => !entries[cell.key] && !lockSources[cell.key]
  )
  if (firstEmpty !== -1) {
    return firstEmpty
  }

  const firstEditable = clue.cells.findIndex((_, index) =>
    isEditableCell(clue, index, lockSources)
  )
  return firstEditable === -1 ? 0 : firstEditable
}

function findWritableIndex(
  clue: Clue,
  activeIndex: number,
  _entries: Record<string, string>,
  lockSources: Partial<Record<string, LockSource>>
) {
  const preferredCell = clue.cells[activeIndex]
  if (preferredCell && !lockSources[preferredCell.key]) {
    return activeIndex
  }

  return clue.cells.findIndex((cell) => !lockSources[cell.key])
}

function nextCursorIndex(
  clue: Clue,
  currentIndex: number,
  entries: Record<string, string>,
  lockSources: Partial<Record<string, LockSource>>
) {
  for (let index = currentIndex + 1; index < clue.cells.length; index += 1) {
    const key = clue.cells[index].key
    if (!entries[key] && !lockSources[key]) {
      return index
    }
  }

  for (let index = currentIndex + 1; index < clue.cells.length; index += 1) {
    const key = clue.cells[index].key
    if (!lockSources[key]) {
      return index
    }
  }

  return currentIndex
}

function firstIncorrectEditableIndex(
  clue: Clue,
  entries: Record<string, string>,
  lockSources: Partial<Record<string, LockSource>>
) {
  return clue.cells.findIndex((cell) => {
    if (lockSources[cell.key]) {
      return false
    }

    return entries[cell.key] !== cellData[cell.key].solution
  })
}

function findNextUnsolvedClueId(currentClueId: string, solvedIds: string[]) {
  const solvedSet = new Set(solvedIds)
  const currentIndex = clueOrder.indexOf(currentClueId)

  for (let offset = 1; offset < clueOrder.length; offset += 1) {
    const nextId = clueOrder[(currentIndex + offset) % clueOrder.length]
    if (!solvedSet.has(nextId)) {
      return nextId
    }
  }

  return null
}

function previousFilledIndex(
  clue: Clue,
  currentIndex: number,
  entries: Record<string, string>,
  lockSources: Partial<Record<string, LockSource>>
) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const key = clue.cells[index].key
    if (entries[key] && !lockSources[key]) {
      return index
    }
  }

  return -1
}

function isEditableCell(
  clue: Clue,
  index: number,
  lockSources: Partial<Record<string, LockSource>>
) {
  const cell = clue.cells[index]
  return Boolean(cell) && !lockSources[cell.key]
}

function keyFor(row: number, col: number) {
  return `${row}-${col}`
}

function shuffle<T>(items: T[]) {
  const next = [...items]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }

  return next
}
