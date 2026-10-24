/**
 * Dev-only list of demo people to sign in as, read at request time from the gitignored seed files so no login is ever bundled or committed.
 *
 * Inputs:
 * - ../seed/.demo-tokens.json (written by the seed script) and optional ../seed/.demo-observer.json
 *
 * Outputs:
 * - JSON array of { key, name, title, orgId, role, token, observer }; empty in production unless DEMO_PERSONAS=1
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import { connection } from "next/server"

type Entry = { name: string; title: string; orgId?: string; role?: string; token: string }

async function readJson(file: string): Promise<Record<string, Entry> | Entry | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch {
    return null
  }
}

export async function GET() {
  await connection()
  if (process.env.NODE_ENV === "production" && process.env.DEMO_PERSONAS !== "1") return Response.json([])

  const seedDir = path.resolve(process.cwd(), "..", "seed")
  const people = (await readJson(path.join(seedDir, ".demo-tokens.json"))) as Record<string, Entry> | null
  const observer = (await readJson(path.join(seedDir, ".demo-observer.json"))) as Entry | null

  const list = [
    ...(observer?.token
      ? [{ key: "observer", name: observer.name ?? "Flow screen", title: "Read-only observer", orgId: null, role: null, token: observer.token, observer: true }]
      : []),
    ...Object.entries(people ?? {}).map(([key, p]) => ({
      key,
      name: p.name,
      title: p.title,
      orgId: p.orgId ?? null,
      role: p.role ?? null,
      token: p.token,
      observer: false,
    })),
  ]
  return Response.json(list, { headers: { "cache-control": "no-store" } })
}
