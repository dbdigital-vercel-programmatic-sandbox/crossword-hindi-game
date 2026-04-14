import {
  keyFor,
  type CrosswordDraft,
  type DerivedWord,
} from "@/lib/crossword-editor"

export function CrosswordPreview({
  draft,
  words,
  showClueList = true,
}: {
  draft: CrosswordDraft
  words: DerivedWord[]
  showClueList?: boolean
}) {
  const startNumbers = new Map<string, number>()

  words.forEach((word) => {
    startNumbers.set(keyFor(word.row, word.col), word.number)
  })

  const acrossWords = words.filter((word) => word.direction === "across")
  const downWords = words.filter((word) => word.direction === "down")

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#26402E]/10 bg-[#f7f1dc] shadow-[0_24px_80px_rgba(29,44,35,0.12)]">
      <div className="border-b border-[#26402E]/10 bg-[#26402E] px-5 py-4 text-[#f7f1dc]">
        <p className="text-[11px] font-semibold tracking-[0.32em] text-[#d6ddb4] uppercase">
          Live preview
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">
              {draft.title.trim() || "Untitled puzzle"}
            </h3>
            <p className="text-sm text-[#dfe7bf]">
              {draft.date || "No date set"}
            </p>
          </div>
          <div className="rounded-full bg-[#f08a44] px-3 py-1 text-xs font-semibold text-[#2b180b]">
            {words.length} clues
          </div>
        </div>
      </div>

      <div
        className={
          showClueList
            ? "grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_220px]"
            : "p-5"
        }
      >
        <div
          className="grid gap-[3px] rounded-[18px] bg-[#cad39d] p-[10px]"
          style={{
            gridTemplateColumns: `repeat(${draft.cols}, minmax(0, 1fr))`,
          }}
        >
          {draft.cells.flatMap((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const cellKey = keyFor(rowIndex, colIndex)

              if (cell.isBlock) {
                return (
                  <div
                    key={cellKey}
                    className="aspect-square rounded-[8px] bg-[#5f6e44]"
                  />
                )
              }

              return (
                <div
                  key={cellKey}
                  className="relative flex aspect-square items-center justify-center rounded-[8px] bg-white text-[15px] font-semibold text-[#223325]"
                >
                  {startNumbers.has(cellKey) ? (
                    <span className="absolute top-1 left-1 text-[8px] font-bold text-[#3a6e95]">
                      {startNumbers.get(cellKey)}
                    </span>
                  ) : null}
                  <span
                    className={
                      cell.given ? "text-[#0f6aa5]" : "text-transparent"
                    }
                  >
                    {cell.letter || "_"}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {showClueList ? (
          <div className="grid gap-4 text-[#223325]">
            <PreviewWordGroup label="Across" words={acrossWords} />
            <PreviewWordGroup label="Down" words={downWords} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PreviewWordGroup({
  label,
  words,
}: {
  label: string
  words: DerivedWord[]
}) {
  return (
    <section className="rounded-[20px] border border-[#26402E]/10 bg-white/70 p-4">
      <div className="mb-3 text-[11px] font-semibold tracking-[0.28em] text-[#728060] uppercase">
        {label}
      </div>
      <div className="space-y-3">
        {words.length === 0 ? (
          <p className="text-sm text-[#6f7868]">
            No {label.toLowerCase()} clues yet.
          </p>
        ) : (
          words.map((word) => (
            <div key={word.id} className="space-y-1">
              <div className="text-sm font-semibold text-[#223325]">
                {word.number}
                {word.direction === "across" ? "A" : "D"}
              </div>
              <div className="text-sm text-[#566154]">
                {word.clue.trim() || "Add a hint in the clue editor."}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
