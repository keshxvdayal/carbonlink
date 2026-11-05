/**
 * Small reference table of common Indian export products at the
 * internationally harmonised 6-digit HS level. It is an offline
 * fallback and a sanity check only; it is NOT a tariff database and
 * carries no duty rates. Always confirm against the current ITC-HS
 * schedule / customs tariff before filing.
 */
export interface HsEntry {
  code: string; // 6-digit HS
  description: string;
  keywords: string[];
  /** Words that, if present, point away from this heading. */
  exclude?: string[];
}

export const HS_REFERENCE: HsEntry[] = [
  { code: "610910", description: "T-shirts, singlets and other vests, knitted or crocheted, of cotton", keywords: ["t-shirt", "tshirt", "t shirt", "tee", "singlet", "vest"], exclude: ["polyester", "synthetic", "woven"] },
  { code: "610990", description: "T-shirts, singlets and other vests, knitted, of other textile materials", keywords: ["t-shirt", "tshirt", "polyester", "synthetic", "singlet"], exclude: ["cotton"] },
  { code: "610510", description: "Men's or boys' shirts, knitted or crocheted, of cotton", keywords: ["polo", "knitted shirt", "knit shirt"] },
  { code: "620520", description: "Men's or boys' shirts, not knitted (woven), of cotton", keywords: ["woven shirt", "formal shirt", "dress shirt", "casual shirt"], exclude: ["knit", "t-shirt", "tshirt"] },
  { code: "620342", description: "Men's or boys' trousers and shorts, not knitted, of cotton", keywords: ["trouser", "chino", "jeans", "denim", "pants", "shorts"] },
  { code: "611120", description: "Babies' garments and clothing accessories, knitted, of cotton", keywords: ["baby", "babies", "infant", "romper", "onesie"] },
  { code: "630260", description: "Toilet and kitchen linen, of terry towelling, of cotton", keywords: ["towel", "terry", "bath towel"] },
  { code: "630231", description: "Bed linen of cotton, not printed", keywords: ["bed sheet", "bedsheet", "pillow cover", "duvet cover", "bed linen"] },
  { code: "570110", description: "Carpets and other textile floor coverings, knotted, of wool", keywords: ["carpet", "rug", "hand knotted"] },
  { code: "100630", description: "Rice, semi-milled or wholly milled", keywords: ["rice", "basmati", "sona masoori"] },
  { code: "090111", description: "Coffee, not roasted, not decaffeinated", keywords: ["coffee", "green coffee", "arabica", "robusta"], exclude: ["roasted"] },
  { code: "090240", description: "Black tea (fermented), in packings over 3 kg", keywords: ["tea", "black tea", "assam", "darjeeling", "ctc"] },
  { code: "090411", description: "Pepper of the genus Piper, neither crushed nor ground", keywords: ["black pepper", "pepper"] },
  { code: "091030", description: "Turmeric (curcuma)", keywords: ["turmeric", "haldi"] },
  { code: "080132", description: "Cashew nuts, shelled", keywords: ["cashew", "cashew kernel"] },
  { code: "030617", description: "Shrimps and prawns, frozen", keywords: ["shrimp", "prawn", "vannamei"] },
  { code: "170199", description: "Cane or beet sugar, other", keywords: ["sugar", "refined sugar"] },
  { code: "300490", description: "Medicaments, put up in measured doses or for retail sale, other", keywords: ["tablet", "capsule", "medicine", "pharmaceutical", "drug formulation"] },
  { code: "730890", description: "Structures and parts of structures, of iron or steel, other", keywords: ["steel structure", "fabricated structure", "structural"] },
  { code: "731815", description: "Threaded screws and bolts, of iron or steel", keywords: ["bolt", "screw", "fastener"] },
  { code: "732393", description: "Table, kitchen or household articles, of stainless steel", keywords: ["stainless steel utensil", "kitchenware", "cookware", "steel utensil", "tiffin"] },
  { code: "848180", description: "Taps, cocks, valves and similar appliances, other", keywords: ["valve", "tap", "cock", "faucet"] },
  { code: "848210", description: "Ball bearings", keywords: ["ball bearing", "bearing"] },
  { code: "870899", description: "Parts and accessories of motor vehicles, other", keywords: ["auto part", "automotive part", "auto component", "car part"] },
  { code: "840991", description: "Parts for spark-ignition internal combustion piston engines", keywords: ["piston", "engine part", "cylinder head"] },
  { code: "850440", description: "Static converters", keywords: ["inverter", "converter", "rectifier", "power supply"] },
  { code: "940360", description: "Wooden furniture, other", keywords: ["wooden furniture", "furniture", "table", "chair", "cabinet"] },
  { code: "420221", description: "Handbags with outer surface of leather", keywords: ["handbag", "leather bag"] },
  { code: "640399", description: "Footwear with outer soles of rubber/plastics/leather and uppers of leather, other", keywords: ["leather shoe", "footwear", "shoes", "boots"] },
  { code: "711319", description: "Articles of jewellery of precious metal other than silver", keywords: ["gold jewellery", "gold jewelry", "jewellery", "jewelry"] },
  { code: "392690", description: "Other articles of plastics", keywords: ["plastic article", "plastic"] },
  { code: "401110", description: "New pneumatic tyres of rubber, for motor cars", keywords: ["tyre", "tire"] },
  { code: "690721", description: "Ceramic flags and paving, hearth or wall tiles, low water absorption", keywords: ["ceramic tile", "vitrified tile", "tile"] },
  { code: "252329", description: "Portland cement, other than white", keywords: ["cement", "portland"] },
];

export function hs6(code: string | null | undefined): string | null {
  if (!code) return null;
  const digits = code.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(0, 6) : null;
}

export function lookupHs(code: string): HsEntry | undefined {
  const six = hs6(code);
  return six ? HS_REFERENCE.find((e) => e.code === six) : undefined;
}

/** Keyword scorer: returns the best reference heading for a description, or null. */
export function suggestFromReference(description: string): { entry: HsEntry; score: number } | null {
  const text = description.toLowerCase();
  let best: { entry: HsEntry; score: number } | null = null;
  for (const entry of HS_REFERENCE) {
    let score = 0;
    for (const kw of entry.keywords) if (text.includes(kw)) score += kw.length;
    if (score === 0) continue;
    for (const ex of entry.exclude ?? []) if (text.includes(ex)) score -= 20;
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best;
}
