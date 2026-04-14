export type Direction = "across" | "down"

export type ClueDefinition = {
  id: string
  number: number
  direction: Direction
  clue: string
  meaning: string
  answer: string
  row: number
  col: number
}

export type CrosswordPuzzle = {
  id: string
  date: string
  title: string
  theme?: string
  difficulty?: string
  rows: number
  cols: number
  clues: ClueDefinition[]
  givenCells: string[]
}

export type CrosswordPuzzleSummary = {
  id: string
  date: string
  title: string
  clueCount: number
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function getScheduledPuzzle(
  puzzles: CrosswordPuzzle[],
  dateKey: string
) {
  const sorted = [...puzzles].sort((left, right) =>
    left.date.localeCompare(right.date)
  )
  const exactMatch = sorted.find((puzzle) => puzzle.date === dateKey)

  if (exactMatch) {
    return exactMatch
  }

  const year = dateKey.slice(0, 4)
  const aprilFirstInSameYear = sorted.find(
    (puzzle) => puzzle.date === `${year}-04-01`
  )

  if (aprilFirstInSameYear) {
    return aprilFirstInSameYear
  }

  const aprilFirstAnyYear = sorted.find((puzzle) =>
    puzzle.date.endsWith("-04-01")
  )

  if (aprilFirstAnyYear) {
    return aprilFirstAnyYear
  }

  const previousPuzzle = [...sorted]
    .reverse()
    .find((puzzle) => puzzle.date <= dateKey)

  return previousPuzzle ?? sorted[0]
}

export function msUntilNextLocalMidnight(date = new Date()) {
  const nextMidnight = new Date(date)
  nextMidnight.setHours(24, 0, 0, 0)

  return Math.max(nextMidnight.getTime() - date.getTime(), 1000)
}
