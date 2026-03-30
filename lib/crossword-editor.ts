import {
  type ClueDefinition,
  type CrosswordPuzzle,
  type Direction,
  getLocalDateKey,
} from "@/lib/crossword-schedule"

export type CrosswordDraftCell = {
  letter: string
  isBlock: boolean
  given: boolean
}

export type CrosswordDraft = {
  id?: string | null
  title: string
  date: string
  rows: number
  cols: number
  cells: CrosswordDraftCell[][]
  clues: Record<string, string>
}

export type DerivedWord = ClueDefinition & {
  length: number
  complete: boolean
}

export type SeedWord = {
  answer: string
  clue?: string
}

export const FIXED_GRID_SIZES = [7, 9, 11] as const
export const MAX_GRID_SIZE = FIXED_GRID_SIZES[FIXED_GRID_SIZES.length - 1]

const MIN_WORD_LENGTH = 3
const MIN_FILL_RATE = 0.7

export type GridRecommendation = {
  rows: number
  cols: number
  label: string
}

export type GeneratedDraftResult = {
  draft: CrosswordDraft
  placedWords: SeedWord[]
  unplacedWords: SeedWord[]
  recommendation: GridRecommendation
}

export type ValidationCheck = {
  label: string
  passed: boolean
  detail: string
  severity: "error" | "warning"
}

export type DraftValidationStats = {
  totalCells: number
  openCells: number
  blockedCells: number
  fillRate: number
  blockRate: number
  wordCount: number
  acrossCount: number
  downCount: number
  maxWordLength: number
  duplicateCount: number
}

export type DraftValidationResult = {
  words: DerivedWord[]
  checks: ValidationCheck[]
  errors: string[]
  warnings: string[]
  stats: DraftValidationStats
}

export function keyFor(row: number, col: number) {
  return `${row}-${col}`
}

export function createEmptyDraft(rows = 9, cols = 9): CrosswordDraft {
  return {
    title: "",
    date: getLocalDateKey(),
    rows,
    cols,
    cells: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        letter: "",
        isBlock: false,
        given: false,
      }))
    ),
    clues: {},
  }
}

export function getSymmetryPartner(
  rows: number,
  cols: number,
  row: number,
  col: number
) {
  return {
    row: rows - row - 1,
    col: cols - col - 1,
  }
}

export function createDraftFromPuzzle(puzzle: CrosswordPuzzle): CrosswordDraft {
  const draft = createEmptyDraft(puzzle.rows, puzzle.cols)
  draft.id = puzzle.id
  draft.title = puzzle.title
  draft.date = puzzle.date

  puzzle.clues.forEach((clue) => {
    clue.answer.split("").forEach((letter, index) => {
      const row = clue.row + (clue.direction === "down" ? index : 0)
      const col = clue.col + (clue.direction === "across" ? index : 0)
      draft.cells[row][col] = {
        letter,
        isBlock: false,
        given: puzzle.givenCells.includes(keyFor(row, col)),
      }
    })
    draft.clues[clue.id] = clue.clue
  })

  return draft
}

export function deriveWordsFromDraft(draft: CrosswordDraft): DerivedWord[] {
  const words: DerivedWord[] = []
  let nextNumber = 1

  for (let row = 0; row < draft.rows; row += 1) {
    for (let col = 0; col < draft.cols; col += 1) {
      if (draft.cells[row][col].isBlock) {
        continue
      }

      const startsAcross =
        (col === 0 || draft.cells[row][col - 1].isBlock) &&
        col + 1 < draft.cols &&
        !draft.cells[row][col + 1].isBlock
      const startsDown =
        (row === 0 || draft.cells[row - 1][col].isBlock) &&
        row + 1 < draft.rows &&
        !draft.cells[row + 1][col].isBlock

      if (!startsAcross && !startsDown) {
        continue
      }

      const number = nextNumber
      nextNumber += 1

      if (startsAcross) {
        words.push(
          buildWordFromDraft(draft, row, col, number, "across", draft.clues)
        )
      }

      if (startsDown) {
        words.push(
          buildWordFromDraft(draft, row, col, number, "down", draft.clues)
        )
      }
    }
  }

  return words
}

export function validateCrosswordDraft(
  draft: CrosswordDraft
): DraftValidationResult {
  const words = deriveWordsFromDraft(draft)
  const totalCells = draft.rows * draft.cols
  const openCells = countOpenCells(draft)
  const blockedCells = totalCells - openCells
  const fillRate = totalCells === 0 ? 0 : openCells / totalCells
  const blockRate = totalCells === 0 ? 0 : blockedCells / totalCells
  const hasRotationalSymmetry = gridHasRotationalSymmetry(draft)
  const usesFixedGridSize = gridUsesFixedSquareSize(draft)
  const everyOpenCellHasLetter = allOpenCellsHaveLetters(draft)
  const everyOpenCellCrosses = allOpenCellsCross(draft)
  const gridIsConnected = openCellsFormSingleRegion(draft)
  const everyWordHasHint = words.every((word) =>
    Boolean(normalizeClue(word.clue))
  )
  const cluesAvoidAnswer = words.every((word) => clueAvoidsAnswer(word))
  const hasWords = words.length > 0
  const hasTitle = Boolean(draft.title.trim())
  const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.date)
  const maxWordLength = getMaxWordLengthForGrid(
    Math.max(draft.rows, draft.cols)
  )
  const validWordLengths = words.every(
    (word) => word.length >= MIN_WORD_LENGTH && word.length <= maxWordLength
  )
  const acrossCount = words.filter((word) => word.direction === "across").length
  const downCount = words.filter((word) => word.direction === "down").length
  const mixesDirections = acrossCount > 0 && downCount > 0
  const duplicateAnswers = countDuplicateAnswers(words)
  const hasNoDuplicateAnswers = duplicateAnswers === 0

  const stats: DraftValidationStats = {
    totalCells,
    openCells,
    blockedCells,
    fillRate,
    blockRate,
    wordCount: words.length,
    acrossCount,
    downCount,
    maxWordLength,
    duplicateCount: duplicateAnswers,
  }

  const checks: ValidationCheck[] = [
    {
      label: "Fixed grid",
      passed: usesFixedGridSize,
      detail: usesFixedGridSize
        ? `Using the approved ${draft.rows}x${draft.cols} square format.`
        : "Use a fixed square grid: 7x7, 9x9, or 11x11.",
      severity: "error",
    },
    {
      label: "Fill rate",
      passed: fillRate >= MIN_FILL_RATE,
      detail:
        fillRate >= MIN_FILL_RATE
          ? `Open cells fill ${formatPercent(fillRate)} of the board and keep blocks controlled.`
          : `Reach at least 70% fill. The current board is ${formatPercent(fillRate)} open and ${formatPercent(blockRate)} blocked.`,
      severity: "error",
    },
    {
      label: "Connected layout",
      passed: gridIsConnected,
      detail: gridIsConnected
        ? "All open cells belong to one connected crossword web."
        : "Join every section into one connected grid with no isolated clusters.",
      severity: "error",
    },
    {
      label: "Crossed letters",
      passed: everyOpenCellCrosses,
      detail: everyOpenCellCrosses
        ? "Every open square belongs to both an across and down answer."
        : "Every letter square must sit inside both an across and down word.",
      severity: "error",
    },
    {
      label: "Filled answers",
      passed: everyOpenCellHasLetter,
      detail: everyOpenCellHasLetter
        ? "Every open square has a letter."
        : "Add letters to every open square before saving.",
      severity: "error",
    },
    {
      label: "Word lengths",
      passed: validWordLengths,
      detail: validWordLengths
        ? `Each entry stays between ${MIN_WORD_LENGTH} and ${maxWordLength} letters for this grid.`
        : `Keep every answer between ${MIN_WORD_LENGTH} and ${maxWordLength} letters for this grid size.`,
      severity: "error",
    },
    {
      label: "No duplicate answers",
      passed: hasNoDuplicateAnswers,
      detail: hasNoDuplicateAnswers
        ? "Every across and down answer is unique."
        : "Remove duplicate answer words before saving.",
      severity: "error",
    },
    {
      label: "Across + down mix",
      passed: mixesDirections,
      detail: mixesDirections
        ? "The puzzle uses both horizontal and vertical entries."
        : "Add both across and down answers so the puzzle interlocks properly.",
      severity: "error",
    },
    {
      label: "Hints ready",
      passed: everyWordHasHint,
      detail: everyWordHasHint
        ? "Each across and down entry has a clue."
        : "Add a hint for every across and down word.",
      severity: "error",
    },
    {
      label: "Clue giveaways",
      passed: cluesAvoidAnswer,
      detail: cluesAvoidAnswer
        ? "Clues do not directly repeat the answer text."
        : "At least one clue repeats its answer. Rewrite it to feel less obvious.",
      severity: "warning",
    },
    {
      label: "Symmetry bonus",
      passed: hasRotationalSymmetry,
      detail: hasRotationalSymmetry
        ? "Blocks keep 180-degree rotational symmetry."
        : "Symmetry is optional, but mirrored blocks usually make the board feel more polished.",
      severity: "warning",
    },
  ]

  const errors: string[] = []
  const warnings: string[] = []

  if (!hasTitle) {
    errors.push("Add a puzzle title.")
  }

  if (!hasValidDate) {
    errors.push("Set a valid publish date.")
  }

  if (openCells === 0 || !hasWords) {
    errors.push("Create at least one across or down answer.")
  }

  checks
    .filter((check) => !check.passed && check.severity === "error")
    .forEach((check) => {
      errors.push(check.detail)
    })

  checks
    .filter((check) => !check.passed && check.severity === "warning")
    .forEach((check) => {
      warnings.push(check.detail)
    })

  return { words, checks, errors, warnings, stats }
}

export function buildPuzzleFromDraft(draft: CrosswordDraft): CrosswordPuzzle {
  const validation = validateCrosswordDraft(draft)

  if (validation.errors.length > 0) {
    throw new Error(validation.errors[0])
  }

  return {
    id: draft.id ?? createPuzzleId(draft.title, draft.date),
    title: draft.title.trim(),
    date: draft.date,
    rows: draft.rows,
    cols: draft.cols,
    clues: validation.words.map((word) => ({
      id: word.id,
      number: word.number,
      direction: word.direction,
      clue: normalizeClue(word.clue),
      answer: word.answer,
      row: word.row,
      col: word.col,
    })),
    givenCells: collectGivenCells(draft),
  }
}

export function createPuzzleId(title: string, date: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  return `${base || "crossword"}-${date}`
}

export function recommendGridSize(words: SeedWord[]): GridRecommendation {
  const normalizedWords = normalizeSeedWords(words)
  const bestFit = pickBestGridFit(normalizedWords)

  return {
    rows: bestFit.size,
    cols: bestFit.size,
    label:
      normalizedWords.length === 0
        ? "Add a few words and I will recommend a grid size."
        : bestFit.unplacedCount === 0
          ? `Try ${bestFit.size}x${bestFit.size}. It is the most compact grid that fits all ${normalizedWords.length} answers.`
          : `Try ${bestFit.size}x${bestFit.size}. It places ${bestFit.placedCount} of ${normalizedWords.length} answers in the most compact grid available.`,
  }
}

export function generateCompactDraftFromWordList({
  words,
  title = "",
  date = getLocalDateKey(),
}: {
  words: SeedWord[]
  title?: string
  date?: string
}): GeneratedDraftResult {
  const recommendation = recommendGridSize(words)

  return generateDraftFromWordList({
    words,
    rows: recommendation.rows,
    cols: recommendation.cols,
    title,
    date,
  })
}

export function generateDraftFromWordList({
  words,
  rows,
  cols,
  title = "",
  date = getLocalDateKey(),
}: {
  words: SeedWord[]
  rows: number
  cols: number
  title?: string
  date?: string
}): GeneratedDraftResult {
  const normalizedWords = normalizeSeedWords(words)
  const recommendation = recommendGridSize(normalizedWords)

  return generateDraftWithPlacement({
    words: normalizedWords,
    rows,
    cols,
    title,
    date,
    recommendation,
  })
}

function generateDraftWithPlacement({
  words,
  rows,
  cols,
  title = "",
  date = getLocalDateKey(),
  recommendation,
}: {
  words: SeedWord[]
  rows: number
  cols: number
  title?: string
  date?: string
  recommendation: GridRecommendation
}): GeneratedDraftResult {
  const draft = createBlockedDraft(rows, cols, title, date)
  const maxWordLength = getMaxWordLengthForGrid(Math.max(rows, cols))
  const eligibleWords = words.filter(
    (word) => word.answer.length <= maxWordLength
  )
  const oversizedWords = words.filter(
    (word) => word.answer.length > maxWordLength
  )

  if (eligibleWords.length === 0) {
    return {
      draft,
      placedWords: [],
      unplacedWords: oversizedWords,
      recommendation,
    }
  }

  const board = createPlacementBoard(rows, cols)
  const sortedWords = [...eligibleWords].sort(
    (left, right) => right.answer.length - left.answer.length
  )
  const placements: Array<Placement & { word: SeedWord }> = []
  const unplacedWords: SeedWord[] = [...oversizedWords]

  const firstWord = sortedWords[0]
  const firstPlacement = createFirstPlacement(firstWord, rows, cols)

  if (!firstPlacement) {
    return {
      draft,
      placedWords: [],
      unplacedWords: words,
      recommendation,
    }
  }

  applyPlacement(board, firstPlacement, firstWord)
  placements.push({ ...firstPlacement, word: firstWord })

  sortedWords.slice(1).forEach((word) => {
    const candidate = findBestPlacement(board, word, rows, cols)

    if (!candidate) {
      unplacedWords.push(word)
      return
    }

    applyPlacement(board, candidate, word)
    placements.push({ ...candidate, word })
  })

  fillDraftFromBoard(draft, board)

  const clueBuckets = new Map<string, SeedWord[]>()
  placements.forEach(({ word }) => {
    const existing = clueBuckets.get(word.answer) ?? []
    existing.push(word)
    clueBuckets.set(word.answer, existing)
  })

  const derivedWords = deriveWordsFromDraft(draft)
  draft.clues = Object.fromEntries(
    derivedWords.map((word) => {
      const bucket = clueBuckets.get(word.answer) ?? []
      const matchedSeed = bucket.shift()
      return [word.id, matchedSeed?.clue?.trim() ?? ""]
    })
  )

  return {
    draft,
    placedWords: placements.map(({ word }) => word),
    unplacedWords,
    recommendation,
  }
}

function buildWordFromDraft(
  draft: CrosswordDraft,
  row: number,
  col: number,
  number: number,
  direction: Direction,
  clues: Record<string, string>
): DerivedWord {
  const letters: string[] = []
  let currentRow = row
  let currentCol = col

  while (cellIsOpen(draft, currentRow, currentCol)) {
    letters.push(
      draft.cells[currentRow][currentCol].letter.trim().toUpperCase()
    )
    currentRow += direction === "down" ? 1 : 0
    currentCol += direction === "across" ? 1 : 0
  }

  const id = `${number}${direction === "across" ? "a" : "d"}`
  const answer = letters.join("")

  return {
    id,
    number,
    direction,
    clue: clues[id] ?? "",
    answer,
    row,
    col,
    length: letters.length,
    complete: letters.every((letter) => /^[A-Z]$/.test(letter)),
  }
}

function collectGivenCells(draft: CrosswordDraft) {
  const givenCells: string[] = []

  draft.cells.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (!cell.isBlock && cell.given && /^[A-Z]$/.test(cell.letter)) {
        givenCells.push(keyFor(rowIndex, colIndex))
      }
    })
  })

  return givenCells
}

function countOpenCells(draft: CrosswordDraft) {
  return draft.cells.flat().filter((cell) => !cell.isBlock).length
}

function gridHasRotationalSymmetry(draft: CrosswordDraft) {
  for (let row = 0; row < draft.rows; row += 1) {
    for (let col = 0; col < draft.cols; col += 1) {
      const partner = getSymmetryPartner(draft.rows, draft.cols, row, col)
      if (
        draft.cells[row][col].isBlock !==
        draft.cells[partner.row][partner.col].isBlock
      ) {
        return false
      }
    }
  }

  return true
}

function allOpenCellsHaveLetters(draft: CrosswordDraft) {
  return draft.cells.every((row) =>
    row.every((cell) => cell.isBlock || /^[A-Z]$/.test(cell.letter))
  )
}

function allOpenCellsCross(draft: CrosswordDraft) {
  for (let row = 0; row < draft.rows; row += 1) {
    for (let col = 0; col < draft.cols; col += 1) {
      if (draft.cells[row][col].isBlock) {
        continue
      }

      if (countConnectedCells(draft, row, col, "across") < 2) {
        return false
      }

      if (countConnectedCells(draft, row, col, "down") < 2) {
        return false
      }
    }
  }

  return true
}

function countConnectedCells(
  draft: CrosswordDraft,
  row: number,
  col: number,
  direction: Direction
) {
  let total = 1
  const step = direction === "across" ? [0, 1] : [1, 0]

  let currentRow = row - step[0]
  let currentCol = col - step[1]
  while (cellIsOpen(draft, currentRow, currentCol)) {
    total += 1
    currentRow -= step[0]
    currentCol -= step[1]
  }

  currentRow = row + step[0]
  currentCol = col + step[1]
  while (cellIsOpen(draft, currentRow, currentCol)) {
    total += 1
    currentRow += step[0]
    currentCol += step[1]
  }

  return total
}

function cellIsOpen(draft: CrosswordDraft, row: number, col: number) {
  return Boolean(draft.cells[row]?.[col] && !draft.cells[row][col].isBlock)
}

function normalizeClue(clue: string) {
  return clue.trim()
}

type PlacementBoardCell = {
  letter: string
  across: boolean
  down: boolean
}

type Placement = {
  row: number
  col: number
  direction: Direction
  intersections: number
}

function normalizeSeedWords(words: SeedWord[]) {
  return words
    .map((word) => ({
      answer: word.answer
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, ""),
      clue: word.clue?.trim() ?? "",
    }))
    .filter((word) => word.answer.length >= MIN_WORD_LENGTH)
}

type GridFit = {
  size: number
  placedCount: number
  unplacedCount: number
}

function pickBestGridFit(words: SeedWord[]): GridFit {
  const fits = FIXED_GRID_SIZES.map((size) => {
    const result = generateDraftWithPlacement({
      words,
      rows: size,
      cols: size,
      title: "",
      date: getLocalDateKey(),
      recommendation: {
        rows: size,
        cols: size,
        label: "",
      },
    })

    return {
      size,
      placedCount: result.placedWords.length,
      unplacedCount: result.unplacedWords.length,
    }
  })

  return (
    fits.find((fit) => fit.unplacedCount === 0) ??
    [...fits].sort(
      (left, right) =>
        right.placedCount - left.placedCount ||
        left.unplacedCount - right.unplacedCount ||
        left.size - right.size
    )[0]
  )
}

function gridUsesFixedSquareSize(draft: CrosswordDraft) {
  return (
    draft.rows === draft.cols &&
    FIXED_GRID_SIZES.includes(draft.rows as 7 | 9 | 11)
  )
}

function getMaxWordLengthForGrid(size: number) {
  return Math.max(MIN_WORD_LENGTH, Math.min(size, MAX_GRID_SIZE))
}

function countDuplicateAnswers(words: DerivedWord[]) {
  const counts = new Map<string, number>()

  words.forEach((word) => {
    counts.set(word.answer, (counts.get(word.answer) ?? 0) + 1)
  })

  return Array.from(counts.values()).filter((count) => count > 1).length
}

function clueAvoidsAnswer(word: DerivedWord) {
  const normalizedAnswer = word.answer.replace(/[^A-Z]/g, "")
  const normalizedHint = normalizeClue(word.clue)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")

  if (!normalizedAnswer || !normalizedHint) {
    return true
  }

  return !normalizedHint.includes(normalizedAnswer)
}

function openCellsFormSingleRegion(draft: CrosswordDraft) {
  const start = findFirstOpenCell(draft)

  if (!start) {
    return false
  }

  const visited = new Set<string>()
  const queue = [start]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    const key = keyFor(current.row, current.col)
    if (visited.has(key)) {
      continue
    }

    visited.add(key)
    ;[
      [current.row - 1, current.col],
      [current.row + 1, current.col],
      [current.row, current.col - 1],
      [current.row, current.col + 1],
    ].forEach(([row, col]) => {
      if (cellIsOpen(draft, row, col)) {
        queue.push({ row, col })
      }
    })
  }

  return visited.size === countOpenCells(draft)
}

function findFirstOpenCell(draft: CrosswordDraft) {
  for (let row = 0; row < draft.rows; row += 1) {
    for (let col = 0; col < draft.cols; col += 1) {
      if (!draft.cells[row][col].isBlock) {
        return { row, col }
      }
    }
  }

  return null
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function createBlockedDraft(
  rows: number,
  cols: number,
  title: string,
  date: string
) {
  const draft = createEmptyDraft(rows, cols)
  draft.title = title
  draft.date = date
  draft.cells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      letter: "",
      isBlock: true,
      given: false,
    }))
  )
  draft.clues = {}
  return draft
}

function createPlacementBoard(rows: number, cols: number) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      letter: "",
      across: false,
      down: false,
    }))
  )
}

function createFirstPlacement(word: SeedWord, rows: number, cols: number) {
  if (word.answer.length <= cols) {
    return {
      row: Math.floor(rows / 2),
      col: Math.floor((cols - word.answer.length) / 2),
      direction: "across" as const,
      intersections: 0,
    }
  }

  if (word.answer.length <= rows) {
    return {
      row: Math.floor((rows - word.answer.length) / 2),
      col: Math.floor(cols / 2),
      direction: "down" as const,
      intersections: 0,
    }
  }

  return null
}

function fillDraftFromBoard(
  draft: CrosswordDraft,
  board: PlacementBoardCell[][]
) {
  draft.cells = board.map((row) =>
    row.map((cell) => ({
      letter: cell.letter,
      isBlock: !cell.letter,
      given: false,
    }))
  )
}

function findBestPlacement(
  board: PlacementBoardCell[][],
  word: SeedWord,
  rows: number,
  cols: number
) {
  const candidates: Placement[] = []
  const seen = new Set<string>()

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = board[row][col]
      if (!cell.letter) {
        continue
      }

      word.answer.split("").forEach((letter, index) => {
        if (letter !== cell.letter) {
          return
        }

        const directions: Direction[] = []
        if (cell.across && !cell.down) {
          directions.push("down")
        }
        if (cell.down && !cell.across) {
          directions.push("across")
        }
        if (cell.across && cell.down) {
          directions.push("across", "down")
        }

        directions.forEach((direction) => {
          const placement = {
            row: direction === "down" ? row - index : row,
            col: direction === "across" ? col - index : col,
            direction,
          }
          const key = `${placement.row}:${placement.col}:${placement.direction}`
          if (seen.has(key)) {
            return
          }

          seen.add(key)
          const intersections = countPlacementIntersections(
            board,
            placement.row,
            placement.col,
            direction,
            word.answer,
            rows,
            cols
          )

          if (intersections === -1) {
            return
          }

          candidates.push({ ...placement, intersections })
        })
      })
    }
  }

  return (
    candidates.sort(
      (left, right) =>
        scorePlacement(right, rows, cols) - scorePlacement(left, rows, cols)
    )[0] ?? null
  )
}

function countPlacementIntersections(
  board: PlacementBoardCell[][],
  startRow: number,
  startCol: number,
  direction: Direction,
  answer: string,
  rows: number,
  cols: number
) {
  const lastRow = startRow + (direction === "down" ? answer.length - 1 : 0)
  const lastCol = startCol + (direction === "across" ? answer.length - 1 : 0)

  if (
    startRow < 0 ||
    startCol < 0 ||
    lastRow >= rows ||
    lastCol >= cols ||
    hasLetter(
      board,
      startRow - (direction === "down" ? 1 : 0),
      startCol - (direction === "across" ? 1 : 0)
    ) ||
    hasLetter(
      board,
      lastRow + (direction === "down" ? 1 : 0),
      lastCol + (direction === "across" ? 1 : 0)
    )
  ) {
    return -1
  }

  let intersections = 0

  for (let index = 0; index < answer.length; index += 1) {
    const row = startRow + (direction === "down" ? index : 0)
    const col = startCol + (direction === "across" ? index : 0)
    const cell = board[row][col]
    const letter = answer[index]

    if (cell.letter && cell.letter !== letter) {
      return -1
    }

    if (
      (direction === "across" && cell.across) ||
      (direction === "down" && cell.down)
    ) {
      return -1
    }

    if (cell.letter) {
      intersections += 1
      continue
    }

    if (
      direction === "across" &&
      (hasLetter(board, row - 1, col) || hasLetter(board, row + 1, col))
    ) {
      return -1
    }

    if (
      direction === "down" &&
      (hasLetter(board, row, col - 1) || hasLetter(board, row, col + 1))
    ) {
      return -1
    }
  }

  return intersections > 0 ? intersections : -1
}

function applyPlacement(
  board: PlacementBoardCell[][],
  placement: Placement,
  word: SeedWord
) {
  word.answer.split("").forEach((letter, index) => {
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

function hasLetter(board: PlacementBoardCell[][], row: number, col: number) {
  return Boolean(board[row]?.[col]?.letter)
}

function scorePlacement(placement: Placement, rows: number, cols: number) {
  const centerRow = Math.floor(rows / 2)
  const centerCol = Math.floor(cols / 2)
  const distance =
    Math.abs(placement.row - centerRow) + Math.abs(placement.col - centerCol)
  return placement.intersections * 100 - distance
}
