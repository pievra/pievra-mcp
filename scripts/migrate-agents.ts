import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import Database from 'better-sqlite3';

// --- Read marketplace.html ---
const htmlPath = '/var/www/pievra/marketplace.html';
const html = readFileSync(htmlPath, 'utf-8');

// --- Extract the AGENTS array text ---
const agentsMatch = html.match(/var AGENTS\s*=\s*(\[[\s\S]*?\]);/);
if (!agentsMatch) {
  throw new Error('Could not find var AGENTS = [...] in marketplace.html');
}
const agentsRaw = agentsMatch[1];

// --- Parse JS object notation into proper objects ---
// Walk character-by-character to extract each top-level {...} block
function extractObjects(src: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(src.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

// Parse a single JS object string like {id:1,name:'Foo',...}
function parseJsObject(obj: string): Record<string, unknown> {
  const inner = obj.slice(1, -1);
  const result: Record<string, unknown> = {};

  const keyRe = /([a-zA-Z_$][a-zA-Z0-9_$]*):/g;
  let m: RegExpExecArray | null;

  while ((m = keyRe.exec(inner)) !== null) {
    const key = m[1];
    const valueStart = keyRe.lastIndex;
    const ch = inner[valueStart];

    let value: unknown;
    let consumed = 0;

    if (ch === '[') {
      // Array: find matching ']'
      let depth = 0;
      let end = valueStart;
      for (let i = valueStart; i < inner.length; i++) {
        if (inner[i] === '[') depth++;
        else if (inner[i] === ']') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      const arrayContent = inner.slice(valueStart + 1, end);
      value = arrayContent
        .split(',')
        .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s: string) => s.length > 0);
      consumed = end + 1 - valueStart;
    } else if (ch === "'" || ch === '"') {
      const quote = ch;
      let end = valueStart + 1;
      while (end < inner.length) {
        if (inner[end] === '\\') { end += 2; continue; }
        if (inner[end] === quote) { end++; break; }
        end++;
      }
      value = inner.slice(valueStart + 1, end - 1).replace(/\\'/g, "'").replace(/\\"/g, '"');
      consumed = end - valueStart;
    } else {
      const rest = inner.slice(valueStart);
      const unquotedMatch = rest.match(/^([^,}\]]+)/);
      const raw = unquotedMatch ? unquotedMatch[1].trim() : '';
      if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (!isNaN(Number(raw))) value = Number(raw);
      else value = raw;
      consumed = raw.length;
    }

    result[key] = value;
    keyRe.lastIndex = valueStart + consumed;
  }

  return result;
}

const rawObjects = extractObjects(agentsRaw);
const agents = rawObjects.map(parseJsObject);

// --- Open database ---
const dbPath = join(homedir(), '.pievra-analytics', 'analytics.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// --- Create table ---
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    category TEXT,
    version TEXT,
    status TEXT,
    featured INTEGER DEFAULT 0,
    protocols TEXT DEFAULT '[]',
    steward TEXT,
    description TEXT,
    tags TEXT DEFAULT '[]',
    link TEXT
  )
`);

// --- Insert agents ---
const insert = db.prepare(`
  INSERT OR REPLACE INTO agents
    (id, name, icon, category, version, status, featured, protocols, steward, description, tags, link)
  VALUES
    (@id, @name, @icon, @category, @version, @status, @featured, @protocols, @steward, @description, @tags, @link)
`);

const insertMany = db.transaction((rows: typeof agents) => {
  let count = 0;
  for (const agent of rows) {
    insert.run({
      id: agent.id as number,
      name: agent.name as string,
      icon: (agent.icon as string) ?? null,
      category: (agent.cat as string) ?? null,
      version: (agent.ver as string) ?? null,
      status: (agent.status as string) ?? null,
      featured: agent.featured ? 1 : 0,
      protocols: JSON.stringify(agent.protocols ?? []),
      steward: (agent.steward as string) ?? null,
      description: (agent.desc as string) ?? null,
      tags: JSON.stringify(agent.tags ?? []),
      link: (agent.link as string) ?? null,
    });
    count++;
  }
  return count;
});

const inserted = insertMany(agents);
db.close();

console.log(`Migrated ${inserted} agents into ${dbPath}`);
