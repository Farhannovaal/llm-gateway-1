export function splitRecursive(
  text: string,
  opts = {
    chunkSize: Number(process.env.CHUNK_SIZE ?? 1000),
    overlap: Number(process.env.CHUNK_OVERLAP ?? 180),
  },
): string[] {
  let chunkSize = opts.chunkSize ?? 1000;
  let overlap = opts.overlap ?? 180;

  chunkSize = Math.max(1, chunkSize);
  overlap = Math.max(0, overlap);

  if (overlap >= chunkSize) {
    overlap = Math.floor(chunkSize / 3);
  }

  const chunks: string[] = [];
  const len = text.length;

  if (!len) return chunks;

  const step = chunkSize - overlap;

  for (let start = 0; start < len; start += step) {
    const end = Math.min(start + chunkSize, len);
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end === len) break;
  }

  return chunks;
}
