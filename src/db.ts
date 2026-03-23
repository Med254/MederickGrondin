import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";

type Db = Database<sqlite3.Database, sqlite3.Statement>;

let dbPromise: Promise<Db> | null = null;

function projectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..");
}

export async function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const dataDir = path.join(projectRoot(), "data");
      await fs.mkdir(dataDir, { recursive: true });
      const dbPath = path.join(dataDir, "app.db");
      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      await db.exec(`
        CREATE TABLE IF NOT EXISTS people (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          familyName TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );
      `);

      return db;
    })();
  }

  return dbPromise;
}

