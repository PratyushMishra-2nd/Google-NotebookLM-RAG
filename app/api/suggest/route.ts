import { NextResponse } from "next/server";
import { gemini, CHAT_MODEL } from "@/lib/gemini/client";
import { getSession } from "@/lib/store";
import { resolveSessionId } from "@/lib/session-cookie";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { id } = await resolveSessionId();
    const session = getSession(id);
    if (session.store.size() === 0) return NextResponse.json({ questions: [] });

    // Pull a tiny representative sample to keep prompt cheap.
    const sample: string[] = [];
    const seen = new Set<string>();
    // @ts-expect-error — internal access for sampling
    for (const c of session.store["chunks"] as Array<{ docId: string; content: string }>) {
      if (seen.has(c.docId)) continue;
      seen.add(c.docId);
      sample.push(c.content.slice(0, 600));
      if (sample.length >= 3) break;
    }

    const prompt = [
      "Suggest 4 short, specific follow-up questions a curious reader would ask about the excerpts below.",
      "Return ONLY a JSON array of strings. No prose.",
      "",
      sample.map((s, i) => `[${i + 1}] ${s}`).join("\n\n"),
    ].join("\n");

    const model = gemini().getGenerativeModel({
      model: CHAT_MODEL,
      generationConfig: { temperature: 0.5, maxOutputTokens: 256 },
    });
    const res = await model.generateContent(prompt);
    const txt = res.response.text().trim().replace(/^```(?:json)?|```$/g, "").trim();
    let questions: string[] = [];
    try {
      questions = JSON.parse(txt);
    } catch {
      questions = txt
        .split("\n")
        .map((l) => l.replace(/^[-\d.\s)]+/, "").trim())
        .filter(Boolean)
        .slice(0, 4);
    }
    return NextResponse.json({ questions: questions.slice(0, 4) });
  } catch (err) {
    return NextResponse.json({ questions: [], error: (err as Error).message });
  }
}
