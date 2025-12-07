import { Logger } from '@nestjs/common';
import { UpsertInput } from '../interfaces/rag.interfaces';

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/g).length;
  return Math.ceil(words * 1.3);
}

export function tryNormalizePartsCatalogue(
  raw: string,
  logger?: Logger,
): string | null {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) return null;

  const normalized: string[] = [];
  let matchedRows = 0;
  let totalCandidateRows = 0;

  const rowRegex =
    /^(\d+)\s+(\S+)\s+(\S+)\s+(.+?)\s+([\d.]+)\s+Rp\b/i;

  for (const line of lines) {
    if (/^\d+\s+/.test(line) || /\bRp\b/i.test(line)) {
      totalCandidateRows++;
    }

    const m = line.match(rowRegex);
    if (!m) {
      normalized.push(line);
      continue;
    }

    matchedRows++;

    const no = m[1];
    const tipe = m[2];
    const partNo = m[3];
    const name = m[4];
    const price = m[5];

    normalized.push(
      `[${tipe}] ${partNo} - ${name} - Harga: Rp ${price} (No: ${no})`,
    );
  }

  if (matchedRows >= 5 && totalCandidateRows > 0) {
    const ratio = matchedRows / totalCandidateRows;
    if (ratio >= 0.6) {
      logger?.log(
        `Detected parts catalogue pattern: matchedRows=${matchedRows}, ` +
          `totalCandidateRows=${totalCandidateRows}, ratio=${ratio.toFixed(2)}`,
      );
      return normalized.join('\n');
    }
  }

  return null;
}

export function preprocessText(
  input: UpsertInput,
  logger?: Logger,
): string {
  const raw = input.text ?? '';
  if (!raw) return '';

  const normalizedParts = tryNormalizePartsCatalogue(raw, logger);
  if (normalizedParts) return normalizedParts;

  return raw;
}
