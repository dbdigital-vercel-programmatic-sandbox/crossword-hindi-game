"use client"

import { Inter, Noto_Sans, Roboto } from "next/font/google"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Clock3, Delete, House } from "lucide-react"

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

const homeTitleFont = Inter({ subsets: ["latin"], weight: ["600", "800"] })
const homeBodyFont = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
})
const gameFont = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
})

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
  const puzzleModel = useMemo(
    () => buildPuzzleModel(scheduledPuzzle),
    [scheduledPuzzle]
  )
  const { GRID_COLS, GRID_ROWS, cellData, clueById, clueOrder, clues } =
    puzzleModel

  const [game, setGame] = useState<GameState>(() => puzzleModel.initialGame)
  const [screen, setScreen] = useState<Screen>("home")
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

    const loadPuzzle = async () => {
      try {
        const response = await fetch(`/api/puzzles?date=${dateKey}`, {
          cache: "no-store",
        })
        if (!response.ok) {
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

        setScheduledPuzzle(getScheduledPuzzle(crosswordLevels, dateKey))
        setSchedule(
          crosswordLevels.map((puzzle) => ({
            id: puzzle.id,
            date: puzzle.date,
            title: puzzle.title,
            clueCount: puzzle.clues.length,
          }))
        )
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
          const revealOutcome = revealLetters(
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
    [cellData, clueById, clueOrder, clues]
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
    if (screen !== "game" || isPuzzleComplete) {
      return
    }

    const interval = window.setInterval(() => {
      setGame((current) => ({
        ...current,
        elapsedSeconds: current.elapsedSeconds + 1,
      }))
    }, 1000)

    return () => window.clearInterval(interval)
  }, [isPuzzleComplete, screen])

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
  }, [cycleClue, handleBackspace, handleLetter, screen])

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
                  CrossWord
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
                    "text-[18px] leading-[26px] font-extrabold text-[#2B2B2B]"
                  )}
                >
                  Total Time
                </div>
                <div className="flex items-center justify-start gap-[4px]">
                  <Clock3
                    className="h-[24px] w-[24px] text-[#454A4E]"
                    strokeWidth={2.2}
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

              <div className="flex w-full flex-col items-center justify-start gap-[12px] self-stretch rounded-[12px] bg-white px-[10px] py-[12px]">
                <div className="inline-flex w-full items-center justify-between self-stretch overflow-hidden">
                  <div
                    className={cn(
                      homeBodyFont.className,
                      "text-[18px] leading-[26px] font-extrabold text-[#2B2B2B]"
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
                      <div
                        className={cn(
                          "relative h-[24px] w-[24px] overflow-hidden",
                          day.isToday &&
                            day.state === "complete" &&
                            "before:absolute before:-inset-[12px] before:rounded-full before:bg-[radial-gradient(circle,rgba(62,158,62,0.33)_0%,rgba(62,158,62,0)_100%)] before:content-['']"
                        )}
                      >
                        <div
                          className={cn(
                            "absolute top-[2px] left-[2px] h-[20px] w-[20px] rounded-full",
                            day.state === "complete"
                              ? "bg-[#3E9E3E]"
                              : day.state === "missed"
                                ? "bg-[#F44336]"
                                : "bg-[#BEBEBE]"
                          )}
                        />
                      </div>
                      <div className="inline-flex items-center justify-center gap-[10px] self-stretch p-[4px]">
                        <div
                          className={cn(
                            homeTitleFont.className,
                            "text-center text-[10px] font-bold uppercase",
                            day.isToday
                              ? "text-[#F05C21]"
                              : day.state === "pending"
                                ? "text-[#808080]"
                                : "text-[#2B2B2B]"
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
              <House
                className="h-[24px] w-[24px] text-white"
                strokeWidth={2.4}
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
      </main>
    )
  }

  return (
    <main
      className={cn(
        gameFont.className,
        "inline-flex h-svh w-full items-center justify-start gap-[10px] overflow-hidden bg-[#F6F0D7]"
      )}
    >
      <div className="mx-auto inline-flex h-full w-full max-w-[430px] flex-1 flex-col items-center justify-start gap-[15px] px-[12px] py-[12px]">
        <div className="inline-flex w-full items-center justify-start gap-[8px] self-stretch">
          <button
            type="button"
            onClick={() => setScreen("home")}
            aria-label="Back to home"
            className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] bg-black p-[8px] text-white"
          >
            <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.4} />
          </button>

          <div className="flex flex-1 flex-col justify-center text-center text-[18px] leading-[26px] font-semibold text-black">
            {displayDate}
          </div>

          <div className="flex items-center justify-center gap-[4px] rounded-[32px] bg-black px-[8px] py-[2px]">
            <Clock3
              className="h-[20px] w-[20px] text-white"
              strokeWidth={2.2}
            />
            <div className="text-center text-[16px] leading-[24px] font-semibold text-white">
              {timerLabel.replace(/^0/, "")}
            </div>
          </div>
        </div>

        <section className="flex min-h-0 w-full flex-1 flex-col items-center justify-center self-stretch">
          <div className="grid w-full grid-cols-8 gap-[3.92px]">
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
              "inline-flex w-full items-center justify-between self-stretch overflow-hidden rounded-[3px] bg-[#89986D] px-[5px] py-[8px]"
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
              className="animate-clue-fade flex flex-1 flex-col items-start justify-start gap-[5px] px-[8px]"
            >
              <div className="text-[11px] font-semibold tracking-[2.2px] text-[#C5D89D] uppercase">
                Current Clue
              </div>
              <div className="text-[16px] font-semibold text-[#F6F0D7]">
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

          <section className="flex w-full flex-col items-center justify-center gap-[8.89px] self-stretch rounded-[10px] bg-[rgba(91,76,12,0.10)] p-[10px]">
            <div className="grid w-full grid-cols-10 gap-[4.65px]">
              {keyboardRows[0].map((key) => (
                <KeyButton key={key} value={key} onPress={handleLetter} />
              ))}
            </div>

            <div className="mx-[30px] grid w-[calc(100%-60px)] grid-cols-9 gap-[4.65px] self-stretch">
              {keyboardRows[1].map((key) => (
                <KeyButton key={key} value={key} onPress={handleLetter} />
              ))}
            </div>

            <div className="mx-[43px] grid w-[calc(100%-86px)] grid-cols-[repeat(7,minmax(0,1fr))_1.5fr] gap-[4.65px] self-stretch">
              {keyboardRows[2].map((key) => (
                <KeyButton key={key} value={key} onPress={handleLetter} />
              ))}
              <button
                type="button"
                onClick={handleBackspace}
                className="inline-flex h-[33.96px] w-full items-center justify-center rounded-[4.85px] bg-[#D9E2F8] text-[#1B1B1D]"
                aria-label="Backspace"
              >
                <Delete className="h-[19.4px] w-[19.4px]" />
              </button>
            </div>
          </section>
        </div>
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
      className={cn(
        homeBodyFont.className,
        "inline-flex h-[33.96px] w-full min-w-0 items-center justify-center rounded-[4.85px] bg-white text-[17.79px] font-normal text-[#1B1B1D] lowercase"
      )}
    >
      {value.toLowerCase()}
    </button>
  )
}

function HomeMascot() {
  return (
    <div className="h-[100px] w-[100px]">
      <div className="relative h-full w-full rounded-[20px] bg-[#39d66f] shadow-[inset_0_0_0_4px_rgba(255,255,255,0.25)]">
        <div className="absolute top-[10px] left-[10px] h-[16px] w-[16px] rounded-full bg-black" />
        <div className="absolute top-[10px] right-[10px] h-[16px] w-[16px] rounded-full bg-black" />
        <div className="absolute top-[24px] left-[15px] h-[14px] w-[58px] rounded-[4px] bg-[#ffb899]" />
        <div className="absolute top-[36px] left-[19px] h-[12px] w-[50px] rounded-[4px] bg-[#fff4eb]" />
        <div className="absolute top-[49px] left-[37px] h-[18px] w-[18px] rounded-full bg-black" />
        <div className="absolute bottom-[22px] left-[10px] h-[14px] w-[58px] rounded-[4px] bg-[#ffb899]" />
        <div className="absolute bottom-[10px] left-[19px] h-[12px] w-[50px] rounded-[4px] bg-[#fff4eb]" />
      </div>
    </div>
  )
}

function SummaryCelebrationIcon() {
  return (
    <div className="relative h-[72px] w-[72px] overflow-hidden">
      <div className="absolute top-[2px] left-[2px] h-[68px] w-[68px] rounded-full bg-white" />
      <div className="absolute top-[22px] left-[16px] h-[22px] w-[12px] rounded-full bg-[#FFC005]" />
      <div className="absolute top-[22px] right-[16px] h-[22px] w-[12px] rounded-full bg-[#FFC005]" />
      <div className="absolute top-[18px] left-[24px] h-[29px] w-[24px] rounded-[12px] bg-[#FFDF05]" />
      <div className="absolute top-[18px] left-[23px] h-[3px] w-[26px] rounded-full bg-[#FF8805]" />
      <div className="absolute top-[26px] left-[30px] h-[11px] w-[12px] rounded-full bg-[#F44040]" />
      <div className="absolute top-[43px] left-[28px] h-[10px] w-[16px] rounded-full bg-[#FFC005]" />
      <div className="absolute top-[52px] left-[25px] h-[6px] w-[22px] rounded-full bg-[#461B1B]" />
    </div>
  )
}

function FlameBadge() {
  return (
    <div className="relative h-[24px] w-[24px] overflow-hidden">
      <div className="absolute top-[1px] left-[3px] h-[22px] w-[18px] rounded-[50%_50%_60%_60%] bg-[radial-gradient(ellipse_75%_96%_at_48%_100%,#FF9800_31%,#FF6D00_66%,#F44336_97%)]" />
      <div className="absolute top-[9px] left-[8px] h-[14px] w-[9px] rounded-[50%_50%_60%_60%] bg-[radial-gradient(ellipse_94%_116%_at_53%_10%,#FFF176_21%,#FFF7AD_67%,rgba(255,241,118,0)_94%)]" />
    </div>
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
