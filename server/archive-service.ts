// =============================================================
// AuditEQ v17.0.28 — Complete Cryptographic Archive Engine
// =============================================================

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface CompleteArchiveManifest {
  archive_id: string;
  label: string;
  archived_at: string;
  application_version: string;
  rubric_version: string;
  counts: {
    calls: number;
    trades: number;
    matches: number;
    audits: number;
    scorecards: number;
  };
  records: {
    calls: any[];
    trades: any[];
    matches: any[];
    audits: any[];
    scorecards: any[];
  };
  manifest_sha256?: string;
}

export function computeSHA256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Builds a complete canonical archive manifest bundling all underlying records and returns the SHA-256 seal.
 */
export function buildCryptographicArchive(
  sqlite: DatabaseSync,
  label: string,
  version = '17.0.28'
): { manifest: CompleteArchiveManifest; sha256: string; archiveKey: string } {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const calls = sqlite.prepare('SELECT * FROM calls ORDER BY id ASC').all();
  const trades = sqlite.prepare('SELECT * FROM trades ORDER BY id ASC').all();
  const matches = sqlite.prepare('SELECT * FROM matches ORDER BY id ASC').all();
  const audits = sqlite.prepare('SELECT * FROM audits ORDER BY id ASC').all();
  const scorecards = sqlite.prepare('SELECT * FROM scorecards ORDER BY id ASC').all();

  const archiveKey = `ARCHIVE_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const manifest: CompleteArchiveManifest = {
    archive_id: archiveKey,
    label: label || `Period Close ${now.slice(0, 10)}`,
    archived_at: now,
    application_version: version,
    rubric_version: '4.3',
    counts: {
      calls: calls.length,
      trades: trades.length,
      matches: matches.length,
      audits: audits.length,
      scorecards: scorecards.length,
    },
    records: {
      calls,
      trades,
      matches,
      audits,
      scorecards,
    },
  };

  const canonicalJson = JSON.stringify(manifest);
  const sha256 = computeSHA256(canonicalJson);
  manifest.manifest_sha256 = sha256;

  return { manifest, sha256, archiveKey };
}

/**
 * Verifies if an archive manifest's SHA-256 signature matches its contents.
 */
export function verifyArchiveIntegrity(manifest: CompleteArchiveManifest, expectedSha256: string): boolean {
  const copy = { ...manifest };
  delete copy.manifest_sha256;
  const computed = computeSHA256(JSON.stringify(copy));
  return computed === expectedSha256.replace(/^sha256_/, '');
}
