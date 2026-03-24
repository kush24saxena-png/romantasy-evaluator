export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API key not configured" });

  const CATALOG_CONTEXT = `You are an evaluation engine for Pocket FM's Romantasy commissioning team. Pocket FM is a pay-per-view (PPV) audio serialization platform. Users pay per episode, so content must have strong episodic pull.

CURRENT CATALOG COVERAGE:
- Werewolf / Shifter Romance: 8 PPV shows (covered)
- Korean Romance Fantasy: 1 PPV show (covered)
- Paranormal Romance: 4 PPV shows (partial)
- All other Romantasy sub-genres: 0 PPV shows

EXTERNAL DEMAND SIGNALS BY SUB-GENRE:
- High Fantasy Court Adventure: 37% BookTok, High BookScan — MAJOR GAP
- Gothic Dark Romantasy: 25% BookTok — SIGNIFICANT GAP
- Dark Academia: 17% BookTok — SIGNIFICANT GAP
- Monster & Shifter: 6.9% BookTok, Steady — covered
- High-Stakes Games & Trials: 6.4% BookTok — GAP
- Why-Choose / Reverse Harem: 4% BookTok, Niche-Hot — GAP
- Mythology / Gods & Legends: 2.4% BookTok, Growing — partial
- War College / Military Academy: 2.1% BookTok, Breakout — GAP
- Vampire Romance: 0% BookTok, Steady BookScan — partial
- Cozy / Cottagecore: 0.5% BookTok, Waning — GAP but weak demand

"Needgap" = sub-genre lane empty in catalog AND external demand confirms appetite.
"Similar" = lane covered, OR lane empty but demand too weak.

Evaluate THREE dimensions (1-10):
NEEDGAP: Empty lane + demand signal strength (9-10 strong gap+demand, 1-2 covered+declining)
ADAPTATION FRIENDLINESS: PPV episodic pull — stakes, cliffhangers, pacing (9-10 high stakes+cliffhangers, 1-2 slice-of-life)
ADAPTATION COMPLEXITY (10=easiest): POVs, cast, world complexity (9-10 simple 2 POV, 1-2 huge cast nonlinear)

RECOMMENDATION: "Strong Buy", "Consider", or "Pass"

Respond ONLY with a raw JSON object. No markdown. No backticks. No preamble. Start with { end with }.
JSON shape:
{"title":"string","author":"string","series":"string","grRatings":number,"grStars":number,"totalHours":number,"subGenre":"string","tropes":["string"],"publisher":"string","tropeClassification":"Needgap or Similar","needgapScore":number,"needgapLabel":"string","needgapNote":"string 2-3 sentences","adaptFriendlyScore":number,"adaptFriendlyLabel":"string","adaptFriendlyNote":"string 2-3 sentences","adaptComplexScore":number,"adaptComplexLabel":"string","adaptComplexNote":"string 2-3 sentences","recommendation":"Strong Buy or Consider or Pass","recommendationNote":"string 2-3 sentences","flags":["string short flags"]}`;

  try {
    // Step 1: Research
    const r1 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        system: "Search the web for this book. Find: Goodreads ratings count, star rating, audiobook length per book and total series hours, number of books, author, publisher, sub-genre, tropes, narrative pacing, stakes, cliffhanger density, cast size, POV count. Return a detailed plain text summary.",
        messages: [{ role: "user", content: `Research: "${title}". Need GR ratings, audiobook hours, author, publisher, sub-genre, tropes, pacing, stakes, cast complexity.` }],
        tools: [{ type: "web_search_20250305", name: "web_search" }]
      })
    });
    const d1 = await r1.json();
    const research = d1.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
    if (!research) return res.status(500).json({ error: "Research returned no data" });

    // Step 2: Evaluate (strict JSON, no tools)
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: CATALOG_CONTEXT,
        messages: [{ role: "user", content: `Research on "${title}":\n\n${research}\n\nReturn the JSON evaluation. ONLY raw JSON.` }]
      })
    });
    const d2 = await r2.json();
    const txt = d2.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ error: "Could not parse evaluation" });

    return res.status(200).json(JSON.parse(m[0]));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
