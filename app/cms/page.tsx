import { CrosswordCms } from "@/components/crossword-cms"
import { isDatabaseEnabled, listAllPuzzles } from "@/lib/crossword-puzzle-store"

export const dynamic = "force-dynamic"

export default async function CmsPage() {
  const puzzles = await listAllPuzzles()

  return (
    <CrosswordCms
      initialPuzzles={puzzles}
      databaseConnected={isDatabaseEnabled()}
    />
  )
}
