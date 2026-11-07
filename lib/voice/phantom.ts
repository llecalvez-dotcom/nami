// What a speech model writes when it hears only silence or noise (seen on 2026-11-07: "Thank you." recorded as an answer).
const PHANTOMS = [
  "thank you",
  "thanks for watching",
  "thank you for watching",
  "merci",
  "merci d'avoir regardé",
  "sous-titres réalisés par la communauté d'amara.org",
  "you",
  "bye",
  ".",
];

const normalize = (text: string) => text.toLowerCase().replace(/[.!?…,"“”]/g, "").replace(/\s+/g, " ").trim();

export function isPhantomTranscript(text: string): boolean {
  const said = normalize(text);
  return said === "" || PHANTOMS.some((phantom) => normalize(phantom) === said);
}
