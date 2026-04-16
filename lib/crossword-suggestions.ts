import { Output, createGateway, generateText } from "ai"

import { MAX_GRID_SIZE } from "@/lib/crossword-editor"

export type Difficulty = "easy" | "medium" | "hard"

export type SuggestionSource =
  | "theme"
  | "title"
  | "difficulty"
  | "dictionary"
  | "ai"
  | "custom"

export type SuggestionWord = {
  answer: string
  source: SuggestionSource
}

export type SuggestionRequest = {
  theme?: string
  title?: string
  difficulty?: Difficulty
  selectedWords?: string[]
}

type SuggestionInput = {
  theme: string
  title: string
  difficulty: Difficulty
  selectedWords?: string[]
  aiSuggestions?: string[]
}

const AI_GATEWAY_MODEL = "openai/gpt-4o-mini"
const AI_SYSTEM_PROMPT =
  "You are a crossword builder who suggests word based on the theme"

const THEME_BANK: Record<string, string[]> = {
  animals: [
    "ALPACA",
    "ANTLER",
    "BADGER",
    "BEAVER",
    "BISON",
    "BUFFALO",
    "COBRA",
    "COYOTE",
    "DOLPHIN",
    "EAGLE",
    "FERRET",
    "FOX",
    "GAZELLE",
    "GECKO",
    "GORILLA",
    "HERON",
    "HYENA",
    "IGUANA",
    "JAGUAR",
    "KOALA",
    "LEMUR",
    "LIZARD",
    "MANATEE",
    "MONKEY",
    "MOOSE",
    "NARWHAL",
    "OCELOT",
    "OTTER",
    "PANDA",
    "PENGUIN",
    "RABBIT",
    "RACCOON",
    "SALMON",
    "SEAL",
    "SHARK",
    "SLOTH",
    "TIGER",
    "TORTOISE",
    "WALRUS",
    "WHALE",
    "WILDCAT",
    "WOLF",
    "ZEBRA",
  ],
  space: [
    "APOLLO",
    "ASTEROID",
    "AURORA",
    "COMET",
    "COSMOS",
    "CRATER",
    "ECLIPSE",
    "GALAXY",
    "GRAVITY",
    "LUNAR",
    "METEOR",
    "MILKYWAY",
    "NEBULA",
    "NOVA",
    "ORBIT",
    "PHOTON",
    "PLANET",
    "PULSAR",
    "QUASAR",
    "ROCKET",
    "SATURN",
    "SOLAR",
    "STAR",
    "STARSHIP",
    "TELESCOPE",
    "VACUUM",
    "VENUS",
  ],
  ocean: [
    "ANCHOR",
    "ATOLL",
    "BRINE",
    "COAST",
    "CORAL",
    "CURRENT",
    "DELTA",
    "ESTUARY",
    "FATHOM",
    "FJORD",
    "HARBOR",
    "ISLAND",
    "KELP",
    "LAGOON",
    "MARINA",
    "MARINE",
    "NAUTILUS",
    "OCEANIC",
    "PEARL",
    "REEF",
    "SALT",
    "SEABED",
    "SEASHELL",
    "SHOAL",
    "TIDAL",
    "TIDEPOOL",
    "WAVE",
    "WHARF",
  ],
  food: [
    "ALMOND",
    "APRICOT",
    "BAGEL",
    "BASIL",
    "BISCUIT",
    "BROTH",
    "CACAO",
    "CARAMEL",
    "CARDAMOM",
    "CHIVE",
    "CINNAMON",
    "CITRUS",
    "CLOVE",
    "COCOA",
    "COOKIE",
    "CROISSANT",
    "CUMIN",
    "GARLIC",
    "GINGER",
    "HONEY",
    "MANGO",
    "MINT",
    "NOODLE",
    "OLIVE",
    "PAPRIKA",
    "PEPPER",
    "PICKLE",
    "PLUM",
    "RADISH",
    "SAFFRON",
    "SESAME",
    "SPICE",
    "SYRUP",
    "TURMERIC",
    "VANILLA",
  ],
  travel: [
    "AIRPORT",
    "ATLAS",
    "BAGGAGE",
    "BOARDING",
    "CABIN",
    "COMPASS",
    "CRUISE",
    "CUSTOMS",
    "DETOUR",
    "HOSTEL",
    "HOTEL",
    "ITINERARY",
    "JOURNEY",
    "LUGGAGE",
    "MILEAGE",
    "PASSPORT",
    "RAIL",
    "RESORT",
    "ROUTE",
    "RUNWAY",
    "SCENIC",
    "SUITCASE",
    "TICKET",
    "TOURISM",
    "TRANSIT",
    "TRIPOD",
    "VOYAGE",
  ],
  sports: [
    "ARENA",
    "BADMINTON",
    "BATON",
    "BOXING",
    "COACH",
    "DERBY",
    "FIELDER",
    "GOAL",
    "GYMNAST",
    "JERSEY",
    "KICKOFF",
    "LAP",
    "MEDAL",
    "PADDLE",
    "RACKET",
    "REFEREE",
    "RELAY",
    "ROWING",
    "SKATER",
    "SPRINTER",
    "STADIUM",
    "SWIMMER",
    "TACKLE",
    "TEAMWORK",
    "TROPHY",
    "UMPIRE",
    "VAULT",
  ],
  festival: [
    "BALLOON",
    "BANNER",
    "BEACON",
    "CARNIVAL",
    "CHEER",
    "CONFETTI",
    "CROWD",
    "DANCER",
    "DRUMMER",
    "FANFARE",
    "FESTIVE",
    "FIREWORK",
    "JUBILEE",
    "LANTERN",
    "MELODY",
    "PARADE",
    "RIBBON",
    "RHYTHM",
    "SHOWTIME",
    "SPARKLER",
    "SPOTLIGHT",
    "STAGE",
    "STREAMER",
  ],
  nature: [
    "BREEZE",
    "BROOK",
    "CANYON",
    "CEDAR",
    "CLOUD",
    "DUNE",
    "FERN",
    "FOREST",
    "GLACIER",
    "GROVE",
    "HARBOR",
    "HORIZON",
    "IVY",
    "LILAC",
    "MEADOW",
    "MOSS",
    "PINE",
    "PRAIRIE",
    "RAVINE",
    "RIVER",
    "SEQUOIA",
    "SHADOW",
    "SUMMIT",
    "SUNSET",
    "THICKET",
    "VALLEY",
    "WILLOW",
  ],
  music: [
    "ALLEGRO",
    "ANTHEM",
    "ARIA",
    "BALLAD",
    "BASSLINE",
    "BEAT",
    "CHORUS",
    "CODA",
    "ENCORE",
    "FUGUE",
    "HARMONY",
    "LYRIC",
    "MELODY",
    "NOTATION",
    "OCTAVE",
    "OPERA",
    "OVERTURE",
    "RHYTHM",
    "SONATA",
    "TEMPO",
    "TREBLE",
    "VERSE",
  ],
  city: [
    "ALLEY",
    "AVENUE",
    "BOROUGH",
    "BRIDGE",
    "CROSSWALK",
    "DOWNTOWN",
    "FOUNTAIN",
    "MARKET",
    "METRO",
    "NEON",
    "PLAZA",
    "SKYLINE",
    "STATION",
    "STREET",
    "SUBWAY",
    "TOWER",
    "TRAFFIC",
    "TRAM",
  ],
}

const THEME_ALIASES: Record<string, string[]> = {
  animals: ["animal", "wildlife", "zoo", "creature", "beast", "pet"],
  space: ["planet", "astronomy", "star", "cosmic", "moon", "mars"],
  ocean: ["sea", "marine", "beach", "water", "coast", "nautical"],
  food: ["kitchen", "flavor", "recipe", "cooking", "dessert", "fruit"],
  travel: ["trip", "vacation", "journey", "flight", "tour", "adventure"],
  sports: ["game", "athlete", "stadium", "team", "fitness", "match"],
  festival: ["celebration", "party", "parade", "holiday", "event"],
  nature: ["forest", "garden", "outdoors", "landscape", "earth"],
  music: ["song", "concert", "orchestra", "band", "sound"],
  city: ["urban", "downtown", "street", "metro", "architecture"],
}

const DIFFICULTY_WORDS: Record<Difficulty, string[]> = {
  easy: [
    "BLOOM",
    "CLUE",
    "FLARE",
    "FUN",
    "GLOW",
    "MINT",
    "PLAY",
    "STAR",
    "TRAIL",
    "WAVE",
  ],
  medium: [
    "CANVAS",
    "POCKET",
    "PUZZLE",
    "RIDDLE",
    "ROAMER",
    "SECRET",
    "SPARK",
    "TANGLE",
    "THREAD",
    "VOYAGE",
  ],
  hard: [
    "AFTERMATH",
    "BLUEPRINT",
    "CRESCENDO",
    "JUNCTION",
    "LABYRINTH",
    "MIDNIGHT",
    "QUANTUM",
    "RADIANCE",
    "TWILIGHT",
    "WILDERNESS",
  ],
}

const GENERIC_CROSSWORD_WORDS = [
  "ACCENT",
  "AERIAL",
  "AMBER",
  "ARCHER",
  "BADGE",
  "BEACON",
  "BLOSSOM",
  "BREEZE",
  "BRIGHT",
  "CASCADE",
  "CHARM",
  "CINDER",
  "CIRCLE",
  "COMPASS",
  "CRIMSON",
  "CRYSTAL",
  "DAZZLE",
  "EMBER",
  "EPOCH",
  "FABLE",
  "FEATHER",
  "FLARE",
  "FLOURISH",
  "GLIMMER",
  "HARBOR",
  "HAVEN",
  "HUSH",
  "JASMINE",
  "JETTY",
  "JOURNAL",
  "KINDLE",
  "LAGOON",
  "LATTICE",
  "LEGEND",
  "LILAC",
  "LUMEN",
  "MARBLE",
  "MARIGOLD",
  "MINGLE",
  "MIRROR",
  "MOSAIC",
  "MURMUR",
  "NECTAR",
  "NICKEL",
  "NIMBLE",
  "ORCHARD",
  "ORIGIN",
  "PALETTE",
  "PARLOR",
  "PATTERN",
  "PEBBLE",
  "PENDULUM",
  "PETAL",
  "PHOENIX",
  "PILGRIM",
  "PILLOW",
  "PINNACLE",
  "POLARIS",
  "PORTAL",
  "PRISM",
  "QUEST",
  "QUILL",
  "RADIANT",
  "RAVEL",
  "RIBBON",
  "RIPPLE",
  "ROSETTE",
  "SABLE",
  "SAILOR",
  "SCARLET",
  "SERENE",
  "SHIMMER",
  "SIGNAL",
  "SILVER",
  "SOLACE",
  "SPANGLE",
  "SPARROW",
  "SPELL",
  "SPIRE",
  "SPRUCE",
  "STATIC",
  "STENCIL",
  "SUMMIT",
  "SUNLIT",
  "SWIRL",
  "SYMPHONY",
  "THIMBLE",
  "THRIVE",
  "TOPAZ",
  "TRINKET",
  "TUNDRA",
  "VELVET",
  "VERDANT",
  "VIOLET",
  "VISTA",
  "WANDER",
  "WHISPER",
  "WICKER",
  "WILLOW",
  "WINDOW",
  "WONDER",
]

export function buildSuggestions({
  theme,
  title,
  difficulty,
  selectedWords = [],
  aiSuggestions = [],
}: SuggestionInput) {
  const difficultyRange = getDifficultyRange(difficulty)
  const context = `${theme} ${title}`.toLowerCase()
  const selectedSet = new Set(selectedWords.map(normalizeAnswer))
  const selectedLetters = new Set(
    selectedWords.flatMap((word) => normalizeAnswer(word).split(""))
  )
  const scored = new Map<
    string,
    { suggestion: SuggestionWord; score: number }
  >()

  const themeKeys = resolveThemeKeys(context)
  const sources: Array<SuggestionWord & { score: number }> = [
    ...tokenizeToSuggestions(theme, "theme").map((item) => ({
      ...item,
      score: 120,
    })),
    ...tokenizeToSuggestions(title, "title").map((item) => ({
      ...item,
      score: 105,
    })),
    ...themeKeys.flatMap((key) =>
      THEME_BANK[key].map((answer) => ({
        answer,
        source: "theme" as const,
        score: 96,
      }))
    ),
    ...DIFFICULTY_WORDS[difficulty].map((answer) => ({
      answer,
      source: "difficulty" as const,
      score: 60,
    })),
    ...GENERIC_CROSSWORD_WORDS.map((answer) => ({
      answer,
      source: "dictionary" as const,
      score: 38,
    })),
    ...aiSuggestions.map((answer) => ({
      answer,
      source: "ai" as const,
      score: 180,
    })),
  ]

  sources.forEach((entry) => {
    const answer = normalizeAnswer(entry.answer)
    if (
      answer.length < difficultyRange.min ||
      answer.length > difficultyRange.max ||
      answer.length > MAX_GRID_SIZE ||
      selectedSet.has(answer)
    ) {
      return
    }

    const overlapScore = countLetterOverlap(answer, selectedLetters) * 4
    const closenessScore =
      10 - Math.abs(answer.length - getTargetLength(difficulty))
    const titleScore = context.includes(answer.toLowerCase()) ? 18 : 0
    const themeScore = themeKeys.some((key) => THEME_BANK[key].includes(answer))
      ? 20
      : 0
    const total =
      entry.score + overlapScore + closenessScore + titleScore + themeScore
    const existing = scored.get(answer)

    if (!existing || total > existing.score) {
      scored.set(answer, {
        suggestion: {
          answer,
          source: entry.source,
        },
        score: total,
      })
    }
  })

  return [...scored.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.suggestion.answer.localeCompare(right.suggestion.answer)
    )
    .map((entry) => entry.suggestion)
}

export async function getSuggestionResponse({
  theme,
  title,
  difficulty,
  selectedWords,
}: SuggestionRequest) {
  const normalizedTheme = theme?.trim() ?? ""
  const normalizedTitle = title?.trim() ?? ""
  const normalizedDifficulty = normalizeDifficulty(difficulty)
  const normalizedSelectedWords = Array.isArray(selectedWords)
    ? selectedWords
    : []

  const dictionarySuggestions = buildSuggestions({
    theme: normalizedTheme,
    title: normalizedTitle,
    difficulty: normalizedDifficulty,
    selectedWords: normalizedSelectedWords,
  })
  const aiSuggestions = await suggestWordsWithAi({
    theme: normalizedTheme,
    title: normalizedTitle,
    difficulty: normalizedDifficulty,
    selectedWords: normalizedSelectedWords,
    candidateWords: dictionarySuggestions.map(
      (suggestion) => suggestion.answer
    ),
  })
  const suggestions = buildSuggestions({
    theme: normalizedTheme,
    title: normalizedTitle,
    difficulty: normalizedDifficulty,
    selectedWords: normalizedSelectedWords,
    aiSuggestions,
  })

  return {
    suggestions,
    engine: aiSuggestions.length > 0 ? "ai" : "dictionary",
    aiAvailable: isAiSuggestionAvailable(),
  }
}

export function isAiSuggestionAvailable() {
  return Boolean(process.env.APP_BUILDER_VERCEL_AI_GATEWAY)
}

export async function suggestWordsWithAi({
  theme,
  title,
  difficulty,
  selectedWords = [],
  candidateWords = [],
}: {
  theme: string
  title: string
  difficulty: Difficulty
  selectedWords?: string[]
  candidateWords?: string[]
}) {
  const apiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY

  if (!apiKey) {
    return []
  }

  const controller = new AbortController()

  try {
    const gateway = createGateway({ apiKey })
    const result = await generateText({
      model: gateway(AI_GATEWAY_MODEL),
      system: AI_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        instructions:
          'Return JSON with a top-level "words" array. Suggest single-word uppercase answers that fit the theme, avoid repeats, avoid punctuation, and prefer entries that are likely to cross well with the existing words.',
        theme,
        title,
        difficulty,
        maxLength: MAX_GRID_SIZE,
        minLength: getDifficultyRange(difficulty).min,
        maxSuggestedLength: getDifficultyRange(difficulty).max,
        selectedWords,
        inspirationPool: candidateWords.slice(0, 60),
        desiredCount: 30,
      }),
      output: Output.json({
        name: "crossword_word_suggestions",
        description:
          "A JSON object containing a words array of suggested answers.",
      }),
      temperature: 0.4,
      abortSignal: controller.signal,
      timeout: 10000,
    })

    return extractAiWords(result.output)
  } catch {
    return []
  }
}

function extractAiWords(value: unknown) {
  if (!value || typeof value !== "object") {
    return []
  }

  const words = (value as { words?: unknown }).words

  if (!Array.isArray(words)) {
    return []
  }

  return words
    .filter((entry): entry is string => typeof entry === "string")
    .map(normalizeAnswer)
    .filter((word) => word.length >= 3 && word.length <= MAX_GRID_SIZE)
}

function tokenizeToSuggestions(value: string, source: SuggestionSource) {
  return value
    .split(/[^A-Za-z]+/)
    .map((part) => normalizeAnswer(part))
    .filter((part) => part.length >= 3)
    .map((answer) => ({ answer, source }))
}

function resolveThemeKeys(context: string) {
  return Object.keys(THEME_BANK).filter((key) => {
    if (context.includes(key)) {
      return true
    }

    return (THEME_ALIASES[key] ?? []).some((alias) => context.includes(alias))
  })
}

function getDifficultyRange(difficulty: Difficulty) {
  if (difficulty === "easy") {
    return { min: 3, max: 6 }
  }

  if (difficulty === "hard") {
    return { min: 6, max: 11 }
  }

  return { min: 4, max: 8 }
}

function normalizeDifficulty(value?: string): Difficulty {
  return value === "easy" || value === "hard" ? value : "medium"
}

function getTargetLength(difficulty: Difficulty) {
  if (difficulty === "easy") {
    return 5
  }

  if (difficulty === "hard") {
    return 8
  }

  return 6
}

function countLetterOverlap(answer: string, selectedLetters: Set<string>) {
  return new Set(answer.split("")).size
    ? [...new Set(answer.split(""))].filter((letter) =>
        selectedLetters.has(letter)
      ).length
    : 0
}

export function normalizeAnswer(value: string) {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase()
}
