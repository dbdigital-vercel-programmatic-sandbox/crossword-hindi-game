"use client"

import { Noto_Sans } from "next/font/google"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { crosswordLevels } from "@/data/crossword-levels"
import {
  type ClueDefinition,
  type CrosswordPuzzle,
  type CrosswordPuzzleSummary,
  getLocalDateKey,
  getScheduledPuzzle,
  msUntilNextLocalMidnight,
} from "@/lib/crossword-schedule"
import { cn } from "@/lib/utils"

const gameFont = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
})
const homeTitleFont = gameFont
const homeBodyFont = gameFont

type LockSource = "given" | "revealed" | "solved"
type FeedbackType = "wrong" | "correct"
type Screen = "home" | "game" | "summary"

type StreakDay = {
  label: string
  state: "complete" | "missed" | "pending"
  isToday: boolean
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
  elapsedSeconds: number
  activeClueId: string
  activeIndex: number
  feedback: FeedbackState | null
}

type FeedbackState = {
  clueId: string
  type: FeedbackType
  stamp: number
}

type GameSettings = {
  isHintsTurnedOff: boolean
  isWordBlastTurnedOff: boolean
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

const keyboardButtonClassName =
  "inline-flex h-[48px] w-full min-w-0 items-center justify-center rounded-[8px] bg-white text-[18px] leading-[26px] font-semibold text-[#1B1B1D] shadow-[0px_1.7777777910232544px_0px_rgba(0,0,0,0.25)]"

const dlsAssets = {
  home: "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Home_Outline.svg",
  pause:
    "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Pause_Outline.svg",
  hint: "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Hint.svg",
  fire: "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Fire.svg",
  tick: "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/TIck.svg",
  cross:
    "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Cross.svg",
  emptyCell:
    "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Empty%20Cell.svg",
  ray: "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Ray.svg",
  backspace:
    "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Backspace_Outline.svg",
  timer:
    "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Timer_illustration.svg",
  trophy:
    "https://raw.githubusercontent.com/joefrancis-dot/DLS-assets/main/Trophy.svg",
} as const

export default function Page() {
  const [dateKey, setDateKey] = useState(() => getLocalDateKey())
  const [scheduledPuzzle, setScheduledPuzzle] = useState<CrosswordPuzzle>(() =>
    getScheduledPuzzle(crosswordLevels, dateKey)
  )
  const [schedule, setSchedule] = useState<CrosswordPuzzleSummary[]>(() =>
    crosswordLevels.map((puzzle) => ({
      id: puzzle.id,
      date: puzzle.date,
      title: puzzle.title,
      clueCount: puzzle.clues.length,
    }))
  )
  const [isPuzzleLoading, setIsPuzzleLoading] = useState(true)
  const puzzleModel = useMemo(
    () => buildPuzzleModel(scheduledPuzzle),
    [scheduledPuzzle]
  )
  const { GRID_COLS, GRID_ROWS, cellData, clueById, clueOrder, clues } =
    puzzleModel

  const [game, setGame] = useState<GameState>(() => puzzleModel.initialGame)
  const [screen, setScreen] = useState<Screen>("home")
  const [isPauseOpen, setIsPauseOpen] = useState(false)
  const [isMeaningSheetOpen, setIsMeaningSheetOpen] = useState(false)
  const [isHomeSettingsOpen, setIsHomeSettingsOpen] = useState(false)
  const [isHintsTurnedOff, setIsHintsTurnedOff] = useState(false)
  const [isWordBlastTurnedOff, setIsWordBlastTurnedOff] = useState(false)
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null)
  const [completionHistory, setCompletionHistory] = useState<
    Record<string, boolean>
  >({})
  const storageKey = useMemo(
    () => getPuzzleStorageKey(scheduledPuzzle.id),
    [scheduledPuzzle.id]
  )

  useEffect(() => {
    let isCancelled = false
    setIsPuzzleLoading(true)

    const fallbackPuzzle = getScheduledPuzzle(crosswordLevels, dateKey)
    const fallbackSchedule = crosswordLevels.map((puzzle) => ({
      id: puzzle.id,
      date: puzzle.date,
      title: puzzle.title,
      clueCount: puzzle.clues.length,
    }))

    const loadPuzzle = async () => {
      try {
        const response = await fetch(`/api/puzzles?date=${dateKey}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          if (isCancelled) {
            return
          }

          setScheduledPuzzle(fallbackPuzzle)
          setSchedule(fallbackSchedule)
          return
        }

        const data = (await response.json()) as {
          puzzle: CrosswordPuzzle
          schedule: CrosswordPuzzleSummary[]
        }

        if (isCancelled) {
          return
        }

        setScheduledPuzzle(data.puzzle)
        setSchedule(data.schedule)
      } catch {
        if (isCancelled) {
          return
        }

        setScheduledPuzzle(fallbackPuzzle)
        setSchedule(fallbackSchedule)
      } finally {
        if (isCancelled) {
          return
        }

        setIsPuzzleLoading(false)
      }
    }

    void loadPuzzle()

    return () => {
      isCancelled = true
    }
  }, [dateKey])

  useEffect(() => {
    const restoredGame = loadStoredGame(storageKey, puzzleModel)
    setGame(restoredGame ?? puzzleModel.initialGame)
    setLoadedStorageKey(storageKey)
  }, [puzzleModel, storageKey])

  useEffect(() => {
    if (loadedStorageKey !== storageKey) {
      return
    }

    window.localStorage.setItem(storageKey, serializeGame(game))
    setCompletionHistory(readCompletionHistory(schedule))
  }, [game, loadedStorageKey, schedule, storageKey])

  useEffect(() => {
    setCompletionHistory(readCompletionHistory(schedule))
  }, [schedule])

  useEffect(() => {
    const storedSettings = loadStoredSettings()
    setIsHintsTurnedOff(storedSettings.isHintsTurnedOff)
    setIsWordBlastTurnedOff(storedSettings.isWordBlastTurnedOff)
  }, [])

  useEffect(() => {
    storeSettings({
      isHintsTurnedOff,
      isWordBlastTurnedOff,
    })
  }, [isHintsTurnedOff, isWordBlastTurnedOff])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDateKey(getLocalDateKey())
    }, msUntilNextLocalMidnight())

    return () => window.clearTimeout(timeout)
  }, [dateKey])

  const activeClue = clueById[game.activeClueId]
  const solvedSet = useMemo(() => new Set(game.solvedIds), [game.solvedIds])
  const displayDate = useMemo(() => formatPuzzleDate(dateKey), [dateKey])
  const displayLongDate = useMemo(
    () => formatPuzzleDateLong(dateKey),
    [dateKey]
  )
  const hasProgress = useMemo(
    () => hasStartedPuzzle(game, puzzleModel.initialEntries),
    [game, puzzleModel.initialEntries]
  )
  const isPuzzleComplete = game.solvedIds.length === clues.length
  const timerLabel = useMemo(
    () => formatElapsedTime(game.elapsedSeconds),
    [game.elapsedSeconds]
  )
  const weeklyStreakDays = useMemo(
    () => buildWeeklyStreakDays(dateKey, completionHistory, isPuzzleComplete),
    [completionHistory, dateKey, isPuzzleComplete]
  )
  const nextChallengeDate = useMemo(
    () => formatNextChallengeDate(getNextChallengeDateKey(dateKey, schedule)),
    [dateKey, schedule]
  )
  const todaysWords = useMemo(
    () =>
      [...clues]
        .sort((left, right) => {
          if (left.number !== right.number) {
            return left.number - right.number
          }

          return left.direction.localeCompare(right.direction)
        })
        .map((clue) => ({
          id: clue.id,
          label: `${clue.number}${clue.direction === "across" ? "A" : "D"}`,
          answer: clue.answer,
          meaning: normalizeMeaning(clue.meaning, clue.answer),
        })),
    [clues]
  )

  useEffect(() => {
    if (screen !== "summary") {
      setIsMeaningSheetOpen(false)
    }
  }, [screen])

  const resetCurrentPuzzle = useCallback(() => {
    setGame(puzzleModel.initialGame)
    setScreen("game")
  }, [puzzleModel.initialGame])

  const selectClue = useCallback(
    (clueId: string, preferredIndex?: number) => {
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
    },
    [clueById]
  )

  const cycleClue = useCallback(
    (step: 1 | -1) => {
      const currentIndex = clueOrder.indexOf(game.activeClueId)
      const nextIndex =
        (currentIndex + step + clueOrder.length) % clueOrder.length
      selectClue(clueOrder[nextIndex])
    },
    [clueOrder, game.activeClueId, selectClue]
  )

  const handleLetter = useCallback(
    (letter: string) => {
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
          solvedIds: getSolvedClueIds(clues, cellData, nextEntries),
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
          const nextCompletedIds = current.completedIds.includes(clue.id)
            ? current.completedIds
            : [...current.completedIds, clue.id]
          const frozenLocks = freezeSolvedClue(current.lockSources, clue)
          const revealOutcome = isWordBlastTurnedOff
            ? {
                entries: nextEntries,
                lockSources: frozenLocks,
              }
            : revealLetters(
                clues,
                cellData,
                nextEntries,
                frozenLocks,
                nextState.solvedIds
              )
          const nextSolvedIds = getSolvedClueIds(
            clues,
            cellData,
            revealOutcome.entries
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
    },
    [cellData, clueById, clueOrder, clues, isWordBlastTurnedOff]
  )

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
            solvedIds: getSolvedClueIds(clues, cellData, nextEntries),
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
        solvedIds: getSolvedClueIds(clues, cellData, nextEntries),
        activeIndex: previousIndex,
        feedback: null,
      }
    })
  }, [cellData, clueById, clues])

  const handleHintPowerUp = useCallback(() => {
    setGame((current) => {
      const clue = clueById[current.activeClueId]
      if (
        isHintsTurnedOff ||
        current.feedback?.type === "wrong" ||
        current.solvedIds.includes(clue.id)
      ) {
        return current
      }

      const candidateCells = clue.cells.filter(
        (cell) => !current.entries[cell.key] && !current.lockSources[cell.key]
      )
      if (candidateCells.length === 0) {
        return current
      }

      const chosenCell =
        candidateCells[Math.floor(Math.random() * candidateCells.length)]
      const nextEntries = {
        ...current.entries,
        [chosenCell.key]: cellData[chosenCell.key].solution,
      }
      const nextLockSources = {
        ...current.lockSources,
        [chosenCell.key]: "revealed" as const,
      }
      const nextSolvedIds = getSolvedClueIds(clues, cellData, nextEntries)
      let nextState: GameState = {
        ...current,
        entries: nextEntries,
        lockSources: nextLockSources,
        solvedIds: nextSolvedIds,
        activeIndex: firstEmptyIndex(clue, nextEntries, nextLockSources),
        feedback: null,
      }

      if (nextSolvedIds.includes(clue.id)) {
        const nextClueId = findNextUnsolvedClueId(
          clueOrder,
          clue.id,
          nextSolvedIds
        )

        if (nextClueId) {
          nextState = {
            ...nextState,
            activeClueId: nextClueId,
            activeIndex: firstEmptyIndex(
              clueById[nextClueId],
              nextEntries,
              nextLockSources
            ),
          }
        }
      }

      return nextState
    })
  }, [cellData, clueById, clueOrder, clues, isHintsTurnedOff])

  const canUseHint = useMemo(() => {
    const active = clueById[game.activeClueId]
    if (
      isHintsTurnedOff ||
      !active ||
      game.feedback?.type === "wrong" ||
      game.solvedIds.includes(active.id)
    ) {
      return false
    }

    return active.cells.some(
      (cell) => !game.entries[cell.key] && !game.lockSources[cell.key]
    )
  }, [
    clueById,
    game.activeClueId,
    game.entries,
    game.feedback,
    game.lockSources,
    game.solvedIds,
    isHintsTurnedOff,
  ])

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
  }, [clueById, game.feedback])

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
  }, [clueById, game.feedback])

  useEffect(() => {
    if (screen !== "game" || isPuzzleComplete || isPauseOpen) {
      return
    }

    const interval = window.setInterval(() => {
      setGame((current) => ({
        ...current,
        elapsedSeconds: current.elapsedSeconds + 1,
      }))
    }, 1000)

    return () => window.clearInterval(interval)
  }, [isPauseOpen, isPuzzleComplete, screen])

  useEffect(() => {
    if (screen !== "game") {
      setIsPauseOpen(false)
    }
  }, [screen])

  useEffect(() => {
    if (screen === "game" && isPuzzleComplete) {
      setScreen("summary")
    }
  }, [isPuzzleComplete, screen])

  useEffect(() => {
    if (screen === "game") {
      return
    }

    const onResetKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "r") {
        return
      }

      event.preventDefault()
      resetCurrentPuzzle()
    }

    window.addEventListener("keydown", onResetKeyDown)
    return () => window.removeEventListener("keydown", onResetKeyDown)
  }, [resetCurrentPuzzle, screen])

  useEffect(() => {
    if (screen !== "game") {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isPauseOpen) {
        if (event.key === "Escape") {
          event.preventDefault()
          setIsPauseOpen(false)
        }
        return
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault()
        setScreen("summary")
        return
      }

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
  }, [cycleClue, handleBackspace, handleLetter, isPauseOpen, screen])

  if (isPuzzleLoading) {
    return (
      <main className="inline-flex h-svh w-full items-center justify-center bg-[#f6f0d7]">
        <div
          className={cn(
            homeBodyFont.className,
            "text-center text-[16px] leading-[24px] font-medium text-black/70"
          )}
        >
          Loading today&apos;s puzzle...
        </div>
      </main>
    )
  }

  if (screen === "home") {
    return (
      <main className="inline-flex h-svh w-full items-center justify-start gap-[10px] overflow-hidden bg-[#f6f0d7]">
        <div className="flex h-full flex-1 items-center justify-center gap-[10px] overflow-hidden bg-[#f6f0d7] px-[30px] py-[100px]">
          <div className="inline-flex w-full max-w-[340px] flex-1 flex-col items-center justify-start gap-[20px]">
            <div className="flex w-full flex-col items-center justify-start gap-[16px] self-stretch">
              <div className="flex w-full flex-col items-center justify-start gap-[20px] self-stretch">
                <HomeMascot />
                <div
                  className={cn(
                    homeTitleFont.className,
                    "flex w-full flex-col justify-center self-stretch text-center text-[28px] font-extrabold text-black"
                  )}
                >
                  Crossword
                </div>
              </div>

              <div className="flex w-full flex-col items-start justify-start gap-[10px] self-stretch">
                <div
                  className={cn(
                    homeBodyFont.className,
                    "flex w-full flex-col justify-center self-stretch text-center text-[18px] leading-[26px] font-normal text-black"
                  )}
                >
                  Connect the dots, fill the grid
                </div>
                <div
                  className={cn(
                    homeBodyFont.className,
                    "flex w-full flex-col justify-center self-stretch text-center text-[14px] leading-[22px] font-semibold text-black"
                  )}
                >
                  {displayLongDate}
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-[8px]">
              <button
                type="button"
                onClick={() => setScreen(isPuzzleComplete ? "summary" : "game")}
                className="inline-flex h-[56px] w-full items-center justify-center gap-[10px] self-stretch rounded-[12px] bg-black px-[73px] py-[12px]"
              >
                <span
                  className={cn(
                    homeBodyFont.className,
                    "flex flex-col justify-center text-center text-[20px] leading-[30px] font-semibold text-white"
                  )}
                >
                  {isPuzzleComplete
                    ? "View Summary"
                    : hasProgress
                      ? "Continue Game"
                      : "Start Game"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsHomeSettingsOpen(true)}
                className={cn(
                  homeBodyFont.className,
                  "inline-flex h-[44px] w-full items-center justify-center rounded-[12px] border border-black bg-transparent px-[14px] text-[16px] leading-[24px] font-semibold text-black"
                )}
              >
                Settings
              </button>
            </div>

            {(hasProgress || isPuzzleComplete) && (
              <p
                className={cn(
                  homeBodyFont.className,
                  "text-center text-[12px] leading-[18px] font-medium text-black/60"
                )}
              >
                {isPuzzleComplete
                  ? `Finished in ${timerLabel}`
                  : `${game.solvedIds.length}/${clues.length} words solved`}
              </p>
            )}
          </div>
        </div>

        {isHomeSettingsOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
            onClick={() => setIsHomeSettingsOpen(false)}
          >
            <div
              className="flex w-full max-w-[320px] flex-col items-center rounded-[20px] bg-white px-[24px] py-[24px] shadow-[0_20px_60px_0_rgba(0,0,0,0.30)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex w-full items-center justify-between">
                <h2 className="text-[22px] leading-[32px] font-semibold text-black">
                  Settings
                </h2>
                <button
                  type="button"
                  onClick={() => setIsHomeSettingsOpen(false)}
                  className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[8px] border border-black/20"
                  aria-label="Close settings"
                >
                  <X
                    className="h-[18px] w-[18px] text-black"
                    strokeWidth={2.25}
                  />
                </button>
              </div>
              <div className="mt-4 flex w-full flex-col gap-[10px]">
                <PauseToggleRow
                  label="Turn off hints"
                  checked={isHintsTurnedOff}
                  onChange={setIsHintsTurnedOff}
                />
                <PauseToggleRow
                  label="Turn off word blast"
                  checked={isWordBlastTurnedOff}
                  onChange={setIsWordBlastTurnedOff}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    )
  }

  if (screen === "summary") {
    return (
      <main className="inline-flex h-svh w-full items-center justify-start gap-[10px] overflow-hidden bg-[#F6F0D7]">
        <div className="mx-auto flex h-full w-full max-w-[390px] flex-1 items-center justify-center gap-[10px] overflow-hidden bg-[#F6F0D7] px-[16px] py-[100px]">
          <div className="inline-flex w-full flex-1 flex-col items-center justify-start gap-[18px]">
            <div className="flex w-full flex-col items-center justify-start gap-[12px] self-stretch">
              <SummaryCelebrationIcon />
              <div className="flex w-full flex-col items-center justify-start gap-[4px] self-stretch">
                <div
                  className={cn(
                    homeBodyFont.className,
                    "w-full text-center text-[24px] leading-[36px] font-extrabold text-black"
                  )}
                >
                  Congratulations!
                </div>
                <div
                  className={cn(
                    homeBodyFont.className,
                    "w-full text-center text-[16px] leading-[24px] font-normal text-black"
                  )}
                >
                  You have completed the challenge
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col items-start justify-start gap-[14px] self-stretch">
              <div className="inline-flex w-full items-center justify-between self-stretch rounded-[5px] bg-white p-[10px]">
                <div
                  className={cn(
                    homeBodyFont.className,
                    "text-[18px] leading-[26px] font-extrabold text-black"
                  )}
                >
                  Total Time
                </div>
                <div className="flex items-center justify-start gap-[4px]">
                  <img
                    src={dlsAssets.timer}
                    alt="Timer"
                    className="h-[24px] w-[24px]"
                    width={24}
                    height={24}
                    loading="lazy"
                    decoding="async"
                  />
                  <div
                    className={cn(
                      homeBodyFont.className,
                      "text-right text-[20px] leading-[26px] font-extrabold text-[#F05C21]"
                    )}
                  >
                    {timerLabel.replace(/^0/, "")}
                  </div>
                </div>
              </div>

              <div className="inline-flex w-full items-center justify-between self-stretch rounded-[5px] bg-white p-[10px]">
                <div
                  className={cn(
                    homeBodyFont.className,
                    "text-[18px] leading-[26px] font-extrabold text-black"
                  )}
                >
                  View Todays Words
                </div>
                <button
                  type="button"
                  onClick={() => setIsMeaningSheetOpen(true)}
                  className={cn(
                    homeBodyFont.className,
                    "inline-flex h-[36px] items-center justify-center rounded-[8px] border border-black px-[12px] text-[14px] leading-[20px] font-bold text-black"
                  )}
                >
                  View Meaning
                </button>
              </div>

              <div className="flex w-full flex-col items-center justify-start gap-[12px] self-stretch rounded-[12px] bg-white px-[10px] py-[12px]">
                <div className="inline-flex w-full items-center justify-between self-stretch overflow-hidden">
                  <div
                    className={cn(
                      homeBodyFont.className,
                      "text-[18px] leading-[26px] font-extrabold text-black"
                    )}
                  >
                    Weekly Streak
                  </div>
                  <FlameBadge />
                </div>

                <div className="inline-flex w-full items-center justify-between self-stretch">
                  {weeklyStreakDays.map((day: StreakDay) => (
                    <div
                      key={day.label}
                      className="inline-flex w-[32px] flex-col items-center justify-start"
                    >
                      <div className="relative flex h-[24px] w-[24px] items-center justify-center">
                        {day.isToday && day.state === "complete" ? (
                          <>
                            <img
                              src={dlsAssets.ray}
                              alt="Today"
                              className="absolute -inset-[8px] h-[40px] w-[40px]"
                              width={40}
                              height={40}
                              loading="lazy"
                              decoding="async"
                            />
                            <img
                              src={dlsAssets.tick}
                              alt="Completed"
                              className="relative z-10 h-[20px] w-[20px]"
                              width={20}
                              height={20}
                              loading="lazy"
                              decoding="async"
                            />
                          </>
                        ) : (
                          <img
                            src={
                              day.state === "complete"
                                ? dlsAssets.tick
                                : day.state === "missed"
                                  ? dlsAssets.cross
                                  : dlsAssets.emptyCell
                            }
                            alt={day.state}
                            className="h-[20px] w-[20px]"
                            width={20}
                            height={20}
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                      </div>
                      <div className="inline-flex items-center justify-center gap-[10px] self-stretch p-[4px]">
                        <div
                          className={cn(
                            homeTitleFont.className,
                            "text-center text-[10px] font-bold uppercase",
                            day.isToday
                              ? "text-[#F05C21]"
                              : day.state === "pending"
                                ? "text-black/50"
                                : "text-black"
                          )}
                        >
                          {day.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex h-[54px] w-full flex-col items-center justify-start self-stretch">
              <div
                className={cn(
                  homeBodyFont.className,
                  "flex-1 self-stretch text-center text-[16px] leading-[24px] font-normal text-black"
                )}
              >
                Next Challenge
              </div>
              <div
                className={cn(
                  homeBodyFont.className,
                  "flex-1 self-stretch text-center text-[20px] leading-[30px] font-semibold text-black"
                )}
              >
                {nextChallengeDate}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setScreen("home")}
              className="inline-flex h-[44px] w-full items-center justify-center gap-[8px] self-stretch rounded-[12px] border-2 border-black bg-black px-[73px] py-[14px]"
            >
              <img
                src={dlsAssets.home}
                alt="Home"
                className="h-[24px] w-[24px]"
                width={24}
                height={24}
                loading="lazy"
                decoding="async"
              />
              <span
                className={cn(
                  homeBodyFont.className,
                  "text-center text-[16px] leading-[24px] font-bold text-white"
                )}
              >
                Back to Home
              </span>
            </button>
          </div>
        </div>

        {isMeaningSheetOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-[2px]"
            onClick={() => setIsMeaningSheetOpen(false)}
          >
            <div
              className="w-full max-w-[390px] rounded-[16px] bg-white p-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.3)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-[10px]">
                <h2
                  className={cn(
                    homeBodyFont.className,
                    "text-[18px] leading-[26px] font-extrabold text-black"
                  )}
                >
                  Todays Words
                </h2>
                <button
                  type="button"
                  onClick={() => setIsMeaningSheetOpen(false)}
                  className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[8px] border border-black/20"
                  aria-label="Close meanings"
                >
                  <X
                    className="h-[18px] w-[18px] text-black"
                    strokeWidth={2.25}
                  />
                </button>
              </div>

              <div className="mt-[12px] max-h-[55svh] space-y-[8px] overflow-y-auto pr-[2px]">
                {todaysWords.map((word) => (
                  <div
                    key={word.id}
                    className="rounded-[10px] border border-black/10 bg-[#FFF9E8] p-[10px]"
                  >
                    <div
                      className={cn(
                        homeBodyFont.className,
                        "text-[14px] leading-[20px] font-extrabold text-black"
                      )}
                    >
                      {word.label} - {word.answer}
                    </div>
                    <div
                      className={cn(
                        homeBodyFont.className,
                        "mt-[4px] text-[13px] leading-[20px] font-normal text-black/80"
                      )}
                    >
                      {word.meaning}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    )
  }

  return (
    <main
      className={cn(
        gameFont.className,
        "relative inline-flex h-svh w-full items-start justify-start gap-[10px] overflow-hidden bg-[#F6F0D7]"
      )}
    >
      <header className="fixed top-0 right-0 left-0 z-30 w-full bg-transparent">
        <div className="mx-auto w-full max-w-[430px] px-[12px] pt-[12px]">
          <div className="grid w-full grid-cols-[40px_1fr_40px] items-center gap-[8px]">
            <button
              type="button"
              onClick={() => setScreen("home")}
              aria-label="Back to home"
              className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] bg-black p-[8px]"
            >
              <img
                src={dlsAssets.home}
                alt="Home"
                className="h-[24px] w-[24px]"
                width={24}
                height={24}
                loading="lazy"
                decoding="async"
              />
            </button>

            <div className="flex flex-1 flex-col justify-center text-center text-[18px] leading-[26px] font-semibold text-black">
              {displayDate}
            </div>

            {isHintsTurnedOff ? (
              <div className="h-[40px] w-[40px]" aria-hidden="true" />
            ) : (
              <button
                type="button"
                onClick={handleHintPowerUp}
                aria-label="Use hint power-up"
                disabled={!canUseHint}
                className={cn(
                  "inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] bg-black p-[8px] transition-opacity",
                  !canUseHint && "cursor-not-allowed opacity-45"
                )}
              >
                <img
                  src={dlsAssets.hint}
                  alt="Hint"
                  className="h-[24px] w-[24px]"
                  width={24}
                  height={24}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            )}
          </div>

          <div className="mt-[8px] flex w-full justify-center">
            <div className="inline-flex items-center justify-center gap-[6px] rounded-[32px] bg-black px-[8px] py-[2px]">
              <div className="text-center text-[16px] leading-[24px] font-semibold text-white">
                {timerLabel.replace(/^0/, "")}
              </div>
              <button
                type="button"
                onClick={() => setIsPauseOpen(true)}
                aria-label="Pause game"
                className="inline-flex h-[20px] w-[20px] items-center justify-center"
              >
                <img
                  src={dlsAssets.pause}
                  alt="Pause"
                  className="h-[20px] w-[20px]"
                  width={20}
                  height={20}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto inline-flex h-full w-full max-w-[430px] flex-1 flex-col items-center justify-start gap-[15px] px-[12px] pt-[106px] pb-[196px]">
        <section className="flex min-h-0 w-full flex-1 flex-col items-center justify-center self-stretch">
          <div
            className="mx-auto grid w-full max-w-[390px] gap-[3.92px]"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
              const row = Math.floor(index / GRID_COLS)
              const col = index % GRID_COLS
              const key = keyFor(row, col)
              const cell = cellData[key]

              if (!cell) {
                return (
                  <div
                    key={key}
                    className="aspect-square rounded-[3.92px] bg-[#C5D89D]"
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
                solvedSet.has(clueId)
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
                    "relative flex aspect-square items-center justify-center rounded-[3.92px] p-[7.85px] transition-all duration-200",
                    feedbackMatch?.type === "wrong"
                      ? "animate-clue-shake bg-[#f5b5b5]"
                      : completedCell
                        ? "bg-[#D9FFE6]"
                        : isActive
                          ? "bg-[#FFC191]"
                          : "bg-white",
                    isCursor && "ring-[1.57px] ring-[#FF9C55] ring-inset",
                    feedbackMatch?.type === "correct" && "animate-clue-pop"
                  )}
                >
                  {cell.number ? (
                    <span className="absolute top-0 left-[2.14px] text-[6.28px] font-semibold text-[#006BAE]">
                      {cell.number}
                    </span>
                  ) : null}

                  <span
                    className={cn(
                      "text-center text-[12.56px] leading-none font-semibold",
                      lockSource === "given"
                        ? "text-[#006BAE]"
                        : completedCell ||
                            lockSource === "solved" ||
                            lockSource === "revealed"
                          ? "text-[#166631]"
                          : "text-black",
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

        <div className="mt-auto flex w-full flex-col gap-[15px] self-stretch">
          <section
            className={cn(
              homeTitleFont.className,
              "inline-flex min-h-[78px] w-full items-center justify-between self-stretch overflow-hidden rounded-[3px] bg-[#89986D] px-[5px] py-[8px]"
            )}
          >
            <button
              type="button"
              onClick={() => cycleClue(-1)}
              aria-label="Previous clue"
              className="relative h-[24px] w-[24px] overflow-hidden rounded-[20px] bg-[#C5D89D] text-black"
            >
              <ChevronLeft
                className="absolute top-[6px] left-[8px] h-[12px] w-[6.85px]"
                strokeWidth={3}
              />
            </button>

            <div
              key={activeClue.id}
              className="animate-clue-fade flex min-h-full flex-1 flex-col items-start justify-center gap-[5px] self-stretch px-[8px]"
            >
              <div className="text-[11px] font-semibold tracking-[2.2px] text-[#C5D89D] uppercase">
                Current Clue
              </div>
              <div className="text-[16px] leading-[20px] font-semibold text-[#F6F0D7]">
                {activeClue.number}
                {activeClue.direction === "across" ? "a" : "d"}.{" "}
                {activeClue.clue}
              </div>
            </div>

            <button
              type="button"
              onClick={() => cycleClue(1)}
              aria-label="Next clue"
              className="relative h-[24px] w-[24px] overflow-hidden rounded-[20px] bg-[#C5D89D] text-black"
            >
              <ChevronRight
                className="absolute top-[6px] left-[9px] h-[12px] w-[6.85px]"
                strokeWidth={3}
              />
            </button>
          </section>
        </div>
      </div>

      <section className="fixed right-0 bottom-0 left-0 z-20 bg-black/25 px-[12px] pt-[12px] pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="mx-auto flex w-full max-w-[430px] flex-col gap-[8px]">
          <div className="grid w-full grid-cols-10 gap-[6px]">
            {keyboardRows[0].map((key) => (
              <KeyButton key={key} value={key} onPress={handleLetter} />
            ))}
          </div>

          <div className="grid w-full grid-cols-9 gap-[6px] px-[6%]">
            {keyboardRows[1].map((key) => (
              <KeyButton key={key} value={key} onPress={handleLetter} />
            ))}
          </div>

          <div className="grid w-full grid-cols-[repeat(7,minmax(0,1fr))_1.35fr] gap-[6px] px-[8.5%]">
            {keyboardRows[2].map((key) => (
              <KeyButton key={key} value={key} onPress={handleLetter} />
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              className={keyboardButtonClassName}
              aria-label="Backspace"
            >
              <img
                src={dlsAssets.backspace}
                alt="Backspace"
                className="h-[20px] w-[20px]"
                width={20}
                height={20}
                loading="lazy"
                decoding="async"
              />
            </button>
          </div>
        </div>
      </section>

      {isPauseOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]">
          <div className="flex w-full max-w-[320px] flex-col items-center rounded-[20px] bg-white px-[24px] py-[32px] shadow-[0_20px_60px_0_rgba(0,0,0,0.30)]">
            <img
              src={dlsAssets.timer}
              alt="Paused"
              className="h-[48px] w-[48px]"
              width={48}
              height={48}
              loading="lazy"
              decoding="async"
            />
            <h2 className="mt-4 text-center text-[24px] leading-[36px] font-semibold text-black">
              Game Paused
            </h2>
            <p className="mt-2 text-center text-[18px] leading-[28px] font-normal text-black/70">
              Take a break and continue when you are ready.
            </p>
            <div className="mt-6 flex w-full flex-col gap-[10px]">
              <PauseToggleRow
                label="Turn off hints"
                checked={isHintsTurnedOff}
                onChange={setIsHintsTurnedOff}
              />
              <PauseToggleRow
                label="Turn off word blast"
                checked={isWordBlastTurnedOff}
                onChange={setIsWordBlastTurnedOff}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsPauseOpen(false)}
              className="mt-6 inline-flex h-[56px] w-full max-w-[240px] items-center justify-center rounded-[12px] bg-black px-4 py-[14px] text-[20px] leading-[30px] font-semibold text-white"
            >
              Continue
            </button>
          </div>
        </div>
      )}
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
      className={cn(homeBodyFont.className, keyboardButtonClassName)}
    >
      {value}
    </button>
  )
}

function PauseToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-[12px] border border-black/10 bg-[#F8F6EF] px-[12px] py-[10px]">
      <span className="text-[14px] leading-[20px] font-semibold text-black">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-[26px] w-[44px] items-center rounded-full transition-colors",
          checked ? "bg-black" : "bg-black/20"
        )}
      >
        <span
          className={cn(
            "h-[20px] w-[20px] rounded-full bg-white transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          )}
        />
      </button>
    </div>
  )
}

function HomeMascot() {
  return (
    <img
      src="https://images.bhaskarassets.com/web2images/521/2026/03/frame-2_1774850873.png"
      alt="Crossword logo"
      className="h-[100px] w-[100px] shrink-0 object-contain"
      width={100}
      height={100}
      loading="eager"
      decoding="async"
    />
  )
}

function SummaryCelebrationIcon() {
  return (
    <img
      src={dlsAssets.trophy}
      alt="Trophy"
      className="h-[72px] w-[72px] object-contain"
      width={72}
      height={72}
      loading="lazy"
      decoding="async"
    />
  )
}

function FlameBadge() {
  return (
    <img
      src={dlsAssets.fire}
      alt="Streak"
      className="h-[24px] w-[24px] object-contain"
      width={24}
      height={24}
      loading="lazy"
      decoding="async"
    />
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
  const solvedIds = getSolvedClueIds(clues, cellData, initialEntries)
  const firstActiveClueId =
    clueOrder.find((clueId) => !solvedIds.includes(clueId)) ?? clueOrder[0]
  const initialGame: GameState = {
    entries: initialEntries,
    lockSources: givenLocks,
    solvedIds,
    completedIds: [],
    elapsedSeconds: 0,
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

function hasStartedPuzzle(
  game: GameState,
  initialEntries: Record<string, string>
) {
  if (game.completedIds.length > 0 || game.elapsedSeconds > 0) {
    return true
  }

  return Object.keys(game.entries).some((key) => !initialEntries[key])
}

function getPuzzleStorageKey(puzzleId: string) {
  return `daily-crossword-progress:${puzzleId}`
}

const SETTINGS_STORAGE_KEY = "daily-crossword-settings"

function loadStoredSettings(): GameSettings {
  if (typeof window === "undefined") {
    return {
      isHintsTurnedOff: false,
      isWordBlastTurnedOff: false,
    }
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      return {
        isHintsTurnedOff: false,
        isWordBlastTurnedOff: false,
      }
    }

    const parsed = JSON.parse(raw) as Partial<GameSettings>
    return {
      isHintsTurnedOff: Boolean(parsed.isHintsTurnedOff),
      isWordBlastTurnedOff: Boolean(parsed.isWordBlastTurnedOff),
    }
  } catch {
    return {
      isHintsTurnedOff: false,
      isWordBlastTurnedOff: false,
    }
  }
}

function storeSettings(settings: GameSettings) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

function serializeGame(game: GameState) {
  return JSON.stringify({
    ...game,
    feedback: null,
  })
}

function loadStoredGame(storageKey: string, puzzleModel: PuzzleModel) {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<GameState>
    const entries = Object.fromEntries(
      Object.entries(parsed.entries ?? {}).filter(([key, value]) => {
        return typeof value === "string" && Boolean(puzzleModel.cellData[key])
      })
    )
    const lockSources = Object.fromEntries(
      Object.entries(parsed.lockSources ?? {}).filter(([, value]) => {
        return value === "given" || value === "revealed" || value === "solved"
      })
    ) as Partial<Record<string, LockSource>>
    const completedIds = (parsed.completedIds ?? []).filter(
      (clueId): clueId is string => {
        return typeof clueId === "string" && clueId in puzzleModel.clueById
      }
    )
    const activeClueId =
      typeof parsed.activeClueId === "string" &&
      parsed.activeClueId in puzzleModel.clueById
        ? parsed.activeClueId
        : puzzleModel.initialGame.activeClueId
    const activeIndex = clampIndex(
      typeof parsed.activeIndex === "number"
        ? parsed.activeIndex
        : puzzleModel.initialGame.activeIndex,
      puzzleModel.clueById[activeClueId].cells.length
    )
    const elapsedSeconds =
      typeof parsed.elapsedSeconds === "number" && parsed.elapsedSeconds >= 0
        ? Math.floor(parsed.elapsedSeconds)
        : 0
    const mergedEntries = {
      ...puzzleModel.initialGame.entries,
      ...entries,
    }
    const solvedIds = getSolvedClueIds(
      puzzleModel.clues,
      puzzleModel.cellData,
      mergedEntries
    )

    return {
      ...puzzleModel.initialGame,
      entries: mergedEntries,
      lockSources: {
        ...puzzleModel.initialGame.lockSources,
        ...lockSources,
      },
      solvedIds,
      completedIds,
      elapsedSeconds,
      activeClueId,
      activeIndex,
      feedback: null,
    }
  } catch {
    return null
  }
}

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0
  }

  return Math.max(0, Math.min(index, length - 1))
}

function readCompletionHistory(
  puzzles: CrosswordPuzzleSummary[]
): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {}
  }

  return Object.fromEntries(
    puzzles.map((puzzle) => {
      try {
        const raw = window.localStorage.getItem(getPuzzleStorageKey(puzzle.id))
        if (!raw) {
          return [puzzle.date, false]
        }

        const parsed = JSON.parse(raw) as Partial<GameState>
        return [
          puzzle.date,
          (parsed.solvedIds?.length ?? 0) >= puzzle.clueCount,
        ]
      } catch {
        return [puzzle.date, false]
      }
    })
  )
}

function buildWeeklyStreakDays(
  dateKey: string,
  completionHistory: Record<string, boolean>,
  isTodayComplete: boolean
): StreakDay[] {
  const labels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
  const currentDate = new Date(`${dateKey}T00:00:00`)
  const day = currentDate.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(currentDate)
  monday.setDate(currentDate.getDate() + mondayOffset)

  return labels.map((label, index) => {
    const current = new Date(monday)
    current.setDate(monday.getDate() + index)
    const currentKey = getLocalDateKey(current)
    const isToday = currentKey === dateKey

    if (isToday) {
      return {
        label,
        state: isTodayComplete ? "complete" : "pending",
        isToday: true,
      }
    }

    if (currentKey > dateKey) {
      return { label, state: "pending", isToday: false }
    }

    return {
      label,
      state: completionHistory[currentKey] ? "complete" : "missed",
      isToday: false,
    }
  })
}

function getNextChallengeDateKey(
  dateKey: string,
  puzzles: CrosswordPuzzleSummary[]
) {
  const nextScheduled = [...puzzles]
    .sort((left, right) => left.date.localeCompare(right.date))
    .find((puzzle) => puzzle.date > dateKey)

  if (nextScheduled) {
    return nextScheduled.date
  }

  const current = new Date(`${dateKey}T00:00:00`)
  current.setDate(current.getDate() + 1)
  return getLocalDateKey(current)
}

function formatNextChallengeDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)
  const day = String(date.getDate()).padStart(2, "0")
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date)
  const year = date.getFullYear()

  return `${day} ${month} ${year}`
}

function getSolvedClueIds(
  clues: Clue[],
  cellData: Record<string, GridCell>,
  entries: Record<string, string>
) {
  return clues
    .filter((clue) =>
      clue.cells.every(
        (cell) => entries[cell.key] === cellData[cell.key].solution
      )
    )
    .map((clue) => clue.id)
}

function formatElapsedTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function formatPuzzleDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00`))
}

function formatPuzzleDateLong(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)
  const day = String(date.getDate()).padStart(2, "0")
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date)
  const year = date.getFullYear()

  return `${day} ${month}, ${year}`
}

function normalizeMeaning(meaning: string | undefined, answer: string) {
  const normalized = meaning?.trim() ?? ""

  if (normalized) {
    return normalized
  }

  return `Meaning for ${answer} will be added soon.`
}
