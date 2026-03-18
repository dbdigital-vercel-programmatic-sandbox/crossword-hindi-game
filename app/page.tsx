"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Delete, Settings2 } from "lucide-react"

import { crosswordLevels } from "@/data/crossword-levels"
import {
  type ClueDefinition,
  getLocalDateKey,
  getScheduledPuzzle,
  msUntilNextLocalMidnight,
} from "@/lib/crossword-schedule"
import { cn } from "@/lib/utils"

type LockSource = "given" | "revealed" | "solved"
type FeedbackType = "wrong" | "correct"

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

type PuzzleModel = {
  GRID_ROWS: number
  GRID_COLS: number
  clues: Clue[]
  clueOrder: string[]
  clueById: Record<string, Clue>
  cellData: Record<string, GridCell>
  givenLocks: Partial<Record<string, LockSource>>
  initialEntries: Record<string, string>
  initialGame: GameState
}

const keyboardRows = [
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  "ZXCVBNM".split(""),
]

export default function Page() {
  const [dateKey, setDateKey] = useState(() => getLocalDateKey())

  const scheduledPuzzle = useMemo(
    () => getScheduledPuzzle(crosswordLevels, dateKey),
    [dateKey]
  )
  const puzzleModel = useMemo(
    () => buildPuzzleModel(scheduledPuzzle),
    [scheduledPuzzle]
  )
  const { GRID_COLS, GRID_ROWS, cellData, clueById, clueOrder, clues } =
    puzzleModel

  const [game, setGame] = useState<GameState>(() => puzzleModel.initialGame)

  useEffect(() => {
    setGame(puzzleModel.initialGame)
  }, [puzzleModel])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDateKey(getLocalDateKey())
    }, msUntilNextLocalMidnight())

    return () => window.clearTimeout(timeout)
  }, [dateKey])

  const activeClue = clueById[game.activeClueId]
  const solvedSet = useMemo(() => new Set(game.solvedIds), [game.solvedIds])
  const completedSet = useMemo(
    () => new Set(game.completedIds),
    [game.completedIds]
  )
  const displayDate = useMemo(
    () => formatPuzzleDate(scheduledPuzzle.date),
    [scheduledPuzzle.date]
  )

  const selectClue = useCallback((clueId: string, preferredIndex?: number) => {
    setGame((current) => {
      if (current.feedback?.type === "wrong") {
        return current
      }

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
      if (
        current.solvedIds.includes(clue.id) ||
        current.feedback?.type === "wrong"
      ) {
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

      if (isClueSolved(clue, cellData, nextEntries)) {
        const nextSolvedIds = [...current.solvedIds, clue.id]
        const nextCompletedIds = [...current.completedIds, clue.id]
        const frozenLocks = freezeSolvedClue(current.lockSources, clue)
        const revealOutcome = revealLetters(
          clues,
          cellData,
          nextEntries,
          frozenLocks,
          nextSolvedIds
        )
        const nextClueId = findNextUnsolvedClueId(
          clueOrder,
          clue.id,
          nextSolvedIds
        )

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
        cellData,
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
        activeIndex:
          incorrectIndex === -1
            ? firstEmptyIndex(clue, nextEntries, current.lockSources)
            : incorrectIndex,
      }
    })
  }, [])

  const handleBackspace = useCallback(() => {
    setGame((current) => {
      const clue = clueById[current.activeClueId]
      if (
        current.solvedIds.includes(clue.id) ||
        current.feedback?.type === "wrong"
      ) {
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
    if (game.feedback?.type !== "wrong") {
      return
    }

    const timeout = window.setTimeout(() => {
      setGame((current) => {
        if (
          current.feedback?.type !== "wrong" ||
          current.feedback.stamp !== game.feedback?.stamp
        ) {
          return current
        }

        const clue = clueById[current.feedback.clueId]
        const clearedEntries = clearEditableClueEntries(
          current.entries,
          current.lockSources,
          clue
        )

        return {
          ...current,
          entries: clearedEntries,
          activeClueId: clue.id,
          activeIndex: firstEmptyIndex(
            clue,
            clearedEntries,
            current.lockSources
          ),
          feedback: null,
        }
      })
    }, 360)

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
    <main className="flex h-svh w-full flex-col overflow-hidden px-[clamp(12px,3vw,22px)] py-[clamp(10px,2vh,20px)]">
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="pointer-events-none absolute inset-x-4 top-0 h-28 rounded-full bg-[#e8def8]/55 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <button
            type="button"
            aria-label="Open settings"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/80 bg-white/88 text-slate-600 shadow-[0_14px_32px_-24px_rgba(69,53,110,0.8)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Settings2 className="h-5 w-5" />
          </button>

          <div className="text-center">
            <p className="text-[10px] font-semibold tracking-[0.28em] text-slate-400 uppercase sm:text-[11px]">
              Daily crossword
            </p>
            <h1 className="text-[clamp(1.45rem,5vw,2rem)] font-semibold tracking-[0.08em] text-slate-800">
              {displayDate}
            </h1>
          </div>

          <div className="h-10 w-10 rounded-2xl border border-transparent" />
        </div>

        <section className="relative mt-[clamp(10px,1.8vh,18px)] flex min-h-0 flex-1 items-center justify-center">
          <div className="w-full rounded-[28px] border border-white/70 bg-[#f6f1fb]/85 p-[clamp(8px,1.5vw,12px)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
            <div className="grid grid-cols-8 gap-[clamp(4px,1vw,6px)]">
              {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
                const row = Math.floor(index / GRID_COLS)
                const col = index % GRID_COLS
                const key = keyFor(row, col)
                const cell = cellData[key]

                if (!cell) {
                  return (
                    <div
                      key={key}
                      className="aspect-square rounded-[14px] bg-[#d9cdec]/22"
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
                              (clueId) =>
                                clueById[clueId].direction === "across"
                            ) ?? memberships[0])

                      const clue = clueById[nextClueId]
                      const preferredIndex = clue.cells.findIndex(
                        (clueCell) => clueCell.key === key
                      )
                      selectClue(nextClueId, preferredIndex)
                    }}
                    className={cn(
                      "relative aspect-square rounded-[14px] border text-lg font-semibold text-slate-700 shadow-[0_18px_35px_-28px_rgba(61,45,93,0.75)] transition-all duration-200",
                      "flex items-center justify-center",
                      feedbackMatch?.type === "wrong"
                        ? "animate-clue-shake border-[#da9290] bg-[#f7cdcb] shadow-[0_22px_42px_-30px_rgba(208,111,111,0.9)]"
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
                      <span className="absolute top-1 left-1 text-[9px] font-semibold text-slate-400 sm:top-1.5 sm:left-1.5 sm:text-[10px]">
                        {cell.number}
                      </span>
                    ) : null}

                    <span
                      className={cn(
                        "translate-y-[1px] text-[clamp(1rem,4.3vw,1.3rem)] leading-none tracking-[0.06em] transition-colors duration-200",
                        completedCell && "text-emerald-700",
                        lockSource === "revealed" && "text-teal-600",
                        lockSource === "given" && "text-sky-700",
                        lockSource === "solved" && "text-emerald-700",
                        !lockSource && entry && "text-slate-700",
                        feedbackMatch?.type === "wrong" && "text-rose-700",
                        !entry && "text-transparent"
                      )}
                    >
                      {entry ?? "_"}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mt-[clamp(8px,1.5vh,14px)] flex items-center gap-3 rounded-[22px] border border-white/70 bg-white/82 px-3 py-2.5 shadow-[0_24px_55px_-38px_rgba(77,55,118,0.55)]">
          <button
            type="button"
            onClick={() => cycleClue(-1)}
            aria-label="Previous clue"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#e8ddf6] bg-[#f8f4fd] text-slate-500 transition-colors hover:bg-white"
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#e8ddf6] bg-[#f8f4fd] text-slate-500 transition-colors hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </section>

        <section className="mt-[clamp(8px,1.5vh,14px)] space-y-2 rounded-[24px] border border-white/70 bg-[#fbf8ff]/82 p-2.5 shadow-[0_22px_55px_-40px_rgba(77,55,118,0.55)]">
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
              className="flex h-[clamp(2.6rem,5.6vh,3rem)] items-center justify-center rounded-[18px] border border-[#eadff7] bg-white/90 text-slate-500 shadow-[0_18px_34px_-28px_rgba(66,50,104,0.8)] transition-transform duration-150 hover:-translate-y-0.5"
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
      className="flex h-[clamp(2.6rem,5.6vh,3rem)] items-center justify-center rounded-[18px] border border-[#eadff7] bg-white/92 text-[clamp(0.95rem,3.4vw,1rem)] font-semibold tracking-[0.08em] text-slate-700 shadow-[0_18px_34px_-28px_rgba(66,50,104,0.8)] transition-transform duration-150 hover:-translate-y-0.5"
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

function buildPuzzleModel(puzzle: {
  rows: number
  cols: number
  clues: ClueDefinition[]
  givenCells: string[]
}): PuzzleModel {
  const clues: Clue[] = puzzle.clues.map((clue) => ({
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
  const givenLocks = Object.fromEntries(
    puzzle.givenCells.map((key) => [key, "given"])
  ) as Partial<Record<string, LockSource>>
  const initialEntries = Object.fromEntries(
    Object.keys(givenLocks).map((key) => [key, cellData[key].solution])
  )
  const solvedIds = clues
    .filter((clue) => clue.cells.every((cell) => givenLocks[cell.key]))
    .map((clue) => clue.id)
  const firstActiveClueId =
    clueOrder.find((clueId) => !solvedIds.includes(clueId)) ?? clueOrder[0]
  const initialGame: GameState = {
    entries: initialEntries,
    lockSources: givenLocks,
    solvedIds,
    completedIds: [],
    activeClueId: firstActiveClueId,
    activeIndex: firstEmptyIndex(
      clueById[firstActiveClueId],
      initialEntries,
      givenLocks
    ),
    feedback: null,
  }

  return {
    GRID_ROWS: puzzle.rows,
    GRID_COLS: puzzle.cols,
    clues,
    clueOrder,
    clueById,
    cellData,
    givenLocks,
    initialEntries,
    initialGame,
  }
}

function revealLetters(
  clues: Clue[],
  cellData: Record<string, GridCell>,
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

function isClueSolved(
  clue: Clue,
  cellData: Record<string, GridCell>,
  entries: Record<string, string>
) {
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
  cellData: Record<string, GridCell>,
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

function findNextUnsolvedClueId(
  clueOrder: string[],
  currentClueId: string,
  solvedIds: string[]
) {
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

function clearEditableClueEntries(
  entries: Record<string, string>,
  lockSources: Partial<Record<string, LockSource>>,
  clue: Clue
) {
  const nextEntries = { ...entries }

  clue.cells.forEach((cell) => {
    if (!lockSources[cell.key]) {
      delete nextEntries[cell.key]
    }
  })

  return nextEntries
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

function formatPuzzleDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00`))
}
