// These are local evidence-projection helpers, not a second pipeline contract.
// A's record has no raw identity metadata. Callers can supply known identity
// values; contextual introductions in the record also seed the redaction list.
const IDENTITY_PATTERNS = [
  /\b(?:my (?:full )?name is|call me|(?:candidate|name)\s*:)\s+([^\n.,!?;]+?)(?=\s+(?:and|from|with|working)\b|[\n.,!?;]|$)/gi,
  /\b(?:I am|I'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(?=\s+(?:and|from|with|working)\b|[,.;!]|$)/g,
  /\b(?:I\s+(?:work(?:ed)?|intern(?:ed)?|was employed|was employed full-time)\s+(?:at|for)|(?:my|our)\s+(?:employer|company|organisation|organization)\s+(?:is|was))\s+([^\n,.;!?]+?)(?=\s+(?:and|where|as|on|for|with|in|since|after|before|using|during|but)\b|[\n,.;!?]|$)/gi,
  /\b(?:I\s+(?:studied|graduated|went to school|earned my degree)\s+(?:at|from)|(?:my|our)\s+(?:school|university|college)\s+(?:is|was))\s+([^\n,.;!?]+?)(?=\s+(?:and|where|as|on|for|with|in|since|after|before|using|during|but)\b|[\n,.;!?]|$)/gi,
];

export function identityValuesFrom(
  texts: readonly string[],
  knownValues: readonly string[] = [],
): string[] {
  const values = new Set(knownValues.map((value) => value.trim()).filter((value) => value.length >= 2));
  for (const text of texts) {
    for (const pattern of IDENTITY_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(text);
      while (match) {
        const value = match[1].trim();
        if (value.length >= 2) {
          values.add(value);
        }
        match = pattern.exec(text);
      }
    }
    for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) {
      values.add(email);
    }
  }
  // Longest values first, so a full name is masked before an overlapping token.
  return Array.from(values).sort((a, b) => b.length - a.length);
}

/** Mask one UTF-16 unit for each original unit, preserving all citation offsets. */
export function redactIdentityText(text: string, identityValues: readonly string[]): string {
  let redacted = text;
  for (const value of identityValues) {
    if (value.length < 2) {
      continue;
    }
    const literal = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${literal})(?=$|[^A-Za-z0-9_])`, "gi");
    redacted = redacted.replace(pattern, (_match, prefix: string, identity: string) => {
      return prefix + "█".repeat(identity.length);
    });
  }
  return redacted;
}
