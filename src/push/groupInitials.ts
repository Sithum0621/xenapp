/** Derives 1–2 letter initials for group/conversation avatars (e.g. "Grade 10 A" → "G1"). */
export function groupInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'W';

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const word = words[0] ?? '';
    const letters = word.replace(/[^a-zA-Z0-9]/g, '');
    if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
    return word.slice(0, 2).toUpperCase() || 'W';
  }

  const first = words[0]?.replace(/[^a-zA-Z0-9]/g, '').charAt(0) ?? '';
  const second = words[1]?.replace(/[^a-zA-Z0-9]/g, '').charAt(0) ?? '';
  const combined = `${first}${second}`.toUpperCase();
  return combined || 'W';
}
