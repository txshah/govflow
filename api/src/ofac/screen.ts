/**
 * OFAC sanctions screen against the U.S. Treasury SDN list (primary names + a.k.a.s). Not a CRS product.
 *
 * Inputs:
 * - A person's name or a business's legal name
 * - SDN.CSV and ALT.CSV from sanctionslistservice.ofac.treas.gov (cached for a day)
 *
 * Outputs:
 * - Potential matches { entNum, name, program }; a match holds the payee for compliance review
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports';
const CACHE_DIR = join(tmpdir(), 'govflow-ofac');
const DAY = 86_400_000;

type Entry = { entNum: string; name: string; type: string; program: string; tokens: string[] };
export type OfacMatch = { entNum: string; name: string; program: string };

// Corporate suffixes carry no identity, so "ACME LLC" and "ACME, INC." compare equal.
const SUFFIXES = new Set(['LLC', 'INC', 'LTD', 'CO', 'CORP', 'CORPORATION', 'COMPANY', 'SA', 'DE', 'CV', 'LIMITED', 'THE', 'GMBH', 'PLC']);

function tokens(name: string, isBusiness: boolean): string[] {
  const t = name.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  return isBusiness ? t.filter((w) => !SUFFIXES.has(w)) : t;
}

/** Minimal CSV parser for Treasury's files (quoted fields, "-0-" for empty). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field.trim()), (field = '');
    else if (c === '\n') row.push(field.trim()), rows.push(row), (row = []), (field = '');
    else if (c !== '\r') field += c;
  }
  if (field || row.length) row.push(field.trim()), rows.push(row);
  return rows;
}

async function fetchCached(file: string): Promise<string> {
  const path = join(CACHE_DIR, file);
  if (existsSync(path) && Date.now() - statSync(path).mtimeMs < DAY) return readFileSync(path, 'utf8');
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`OFAC ${file} download failed (${res.status})`);
  const text = await res.text();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path, text);
  return text;
}

let list: Promise<Entry[]> | null = null;

function loadList(): Promise<Entry[]> {
  list ??= (async () => {
    const [sdn, alt] = await Promise.all([fetchCached('SDN.CSV'), fetchCached('ALT.CSV')]);
    const byNum = new Map<string, { type: string; program: string }>();
    const entries: Entry[] = [];
    for (const [entNum, name, type, program] of parseCsv(sdn)) {
      if (!entNum || !name) continue;
      const kind = type === '-0-' ? 'entity' : type;
      byNum.set(entNum, { type: kind, program });
      entries.push({ entNum, name, type: kind, program, tokens: tokens(name, kind !== 'individual') });
    }
    for (const [entNum, , , altName] of parseCsv(alt)) {
      const base = byNum.get(entNum);
      if (!base || !altName || altName === '-0-') continue;
      entries.push({ entNum, name: altName, ...base, tokens: tokens(altName, base.type !== 'individual') });
    }
    return entries;
  })();
  return list;
}

/**
 * Exact-token screen, kept strict to avoid false positives on common names:
 * a business matches when its name tokens (minus suffixes) equal a listed entity's;
 * a person matches when all their name tokens appear in a listed individual's name with at most one extra (a middle name).
 */
export async function screenName(name: string, kind: 'person' | 'business'): Promise<OfacMatch[]> {
  const entries = await loadList();
  const q = tokens(name, kind === 'business');
  if (!q.length) return [];
  const key = [...q].sort().join(' ');
  const hits = new Map<string, OfacMatch>();
  for (const e of entries) {
    const isPerson = e.type === 'individual';
    if ((kind === 'person') !== isPerson) continue;
    // Ships and aircraft are listed too; a payee is never one.
    if (e.type === 'vessel' || e.type === 'aircraft') continue;
    const ok =
      kind === 'business'
        ? [...e.tokens].sort().join(' ') === key
        : q.every((t) => e.tokens.includes(t)) && e.tokens.length - q.length <= 1;
    if (ok && !hits.has(e.entNum)) hits.set(e.entNum, { entNum: e.entNum, name: e.name, program: e.program });
  }
  return [...hits.values()];
}
