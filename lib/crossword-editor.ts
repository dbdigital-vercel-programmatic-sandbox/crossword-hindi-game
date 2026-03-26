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

export type ValidationCheck = {
  label: string
  passed: boolean
  detail: string
}

export type DraftValidationResult = {
  words: DerivedWord[]
  checks: ValidationCheck[]
  errors: string[]
}

export function keyFor(row: number, col: number) {
  return `${row}-${col}`
}

export function createEmptyDraft(rows = 9, cols = 8): CrosswordDraft {
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
  const openCells = countOpenCells(draft)
  const hasRotationalSymmetry = gridHasRotationalSymmetry(draft)
  const everyOpenCellHasLetter = allOpenCellsHaveLetters(draft)
  const everyOpenCellCrosses = allOpenCellsCross(draft)
  const everyWordHasHint = words.every((word) =>
    Boolean(normalizeClue(word.clue))
  )
  const hasWords = words.length > 0
  const hasTitle = Boolean(draft.title.trim())
  const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.date)

  const checks: ValidationCheck[] = [
    {
      label: "Grid symmetry",
      passed: hasRotationalSymmetry,
      detail: hasRotationalSymmetry
        ? "Blocks keep 180-degree rotational symmetry."
        : "Black squares need to mirror across the center of the grid.",
    },
    {
      label: "Crossed letters",
      passed: everyOpenCellCrosses,
      detail: everyOpenCellCrosses
        ? "Every open square belongs to both an across and down answer."
        : "Every letter square must sit inside both an across and down word.",
    },
    {
      label: "Filled answers",
      passed: everyOpenCellHasLetter,
      detail: everyOpenCellHasLetter
        ? "Every open square has a letter."
        : "Add letters to every open square before saving.",
    },
    {
      label: "Hints ready",
      passed: everyWordHasHint,
      detail: everyWordHasHint
        ? "Each across and down entry has a clue."
        : "Add a hint for every across and down word.",
    },
  ]

  const errors: string[] = []

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
    .filter((check) => !check.passed)
    .forEach((check) => {
      errors.push(check.detail)
    })

  return { words, checks, errors }
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
