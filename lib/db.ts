import { neon } from "@neondatabase/serverless"

const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.NEON_DATABASE_URL ??
  ""

export const hasDatabaseConnection = Boolean(connectionString)

export const sql = hasDatabaseConnection ? neon(connectionString) : null
