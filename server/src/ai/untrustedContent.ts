/**
 * Neutralises instruction-like text in data that originates outside ChangeLens (commit messages,
 * log lines, metric labels, finding descriptions) before it is placed in a prompt.
 *
 * This REDUCES prompt-injection risk; it cannot remove it -- natural language has no reliable
 * boundary between data and instructions. The defences that actually carry weight are structural:
 * instructions and data in separate messages, schema-constrained output, and the evidence-ID
 * allow-list in responseValidator. A successful injection can at worst produce misleading prose.
 * See docs/LIMITATIONS.md.
 *
 * Only the PROMPT's copy is altered. Evidence stored in the database is never modified.
 */

const NEUTRALISED = '[neutralised: instruction-like text]';

const instructionPatterns: RegExp[] = [
  /\bignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules?|context)\b/gi,
  /\bdisregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|preceding|your)\s+(?:instructions?|prompts?|rules?)\b/gi,
  /\b(?:forget|override)\s+(?:all\s+|your\s+)?(?:previous\s+|prior\s+)?(?:instructions?|rules?)\b/gi,
  /\byou\s+are\s+now\s+(?:a|an|the|in)\b/gi,
  /\b(?:new|updated|revised)\s+instructions?\s*:/gi,
  // Literal headings from our own prompt template -- text that mimics the contract it is read against.
  /\bSTRICT OUTPUT CONTRACT\b/gi,
  /\bJSON SCHEMA\s*:/gi,
  /\bREQUIRED EVIDENCE RULES\b/gi,
  /\bALLOWED VALUES\s*:/gi,
  /\bCHANGELENS_DATA\w*/gi,
  // Chat-template control tokens and role tags.
  /<\/?\s*(?:system|assistant|user|instructions?|untrusted_data)\s*>/gi,
  /\[\/?INST\]|<\|[a-z_]+\|>/gi,
  /^[ \t]*(?:system|assistant)[ \t]*:/gim
];

// Control characters and invisible/bidi formatting characters, which can hide text from a human
// reviewer while the model still reads it. Newline and tab are kept.
// eslint-disable-next-line no-control-regex
const invisible = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

export function neutralizeText(text: string): { text: string; replaced: number } {
  let replaced = 0;
  let out = text.replace(invisible, '');
  for (const pattern of instructionPatterns) {
    out = out.replace(pattern, () => {
      replaced += 1;
      return NEUTRALISED;
    });
  }
  return { text: out, replaced };
}

export function neutralizeContext<T>(value: T): { value: T; replaced: number } {
  let replaced = 0;
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      const result = neutralizeText(node);
      replaced += result.replaced;
      return result.text;
    }
    if (Array.isArray(node)) return (node as unknown[]).map(walk);
    if (typeof node === 'object' && node !== null) {
      // Keys are attacker-controlled too (evidence payloads are arbitrary JSON).
      return Object.fromEntries(Object.entries(node).map(([key, entry]) => [walk(key) as string, walk(entry)]));
    }
    return node;
  };
  return { value: walk(value) as T, replaced };
}
