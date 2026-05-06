import type { RawSection } from "@/lib/chunking/splitter";

export async function parsePdf(buffer: Buffer): Promise<{ sections: RawSection[]; pages: number }> {
  // Import inner module directly — top-level pdf-parse has a debug branch that
  // reads a sample file at import time, which breaks under bundlers.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(buffer);

  // pdf-parse gives one big string; split on form-feed (\f) which it uses between pages.
  const pageTexts = data.text.split("\f");
  const sections: RawSection[] = pageTexts
    .map((t, i) => ({ text: t.trim(), page: i + 1 }))
    .filter((s) => s.text.length > 0);

  return { sections, pages: data.numpages };
}

export function parseTxt(buffer: Buffer): { sections: RawSection[] } {
  const text = buffer.toString("utf-8");
  return { sections: [{ text }] };
}
