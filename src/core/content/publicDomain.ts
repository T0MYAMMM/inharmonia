import type { PublicDomainSource } from './types';

/**
 * When a piece counts as public domain here. The app is public and used from
 * Indonesia, so both rules must hold:
 * - life + 70 (Indonesia, EU): everyone whose work is used died at least 70
 *   full years ago;
 * - US publication: the piece was first published at least 96 years ago.
 */
export const PUBLIC_DOMAIN_RULES = { lifePlusYears: 70, publishedYears: 96 } as const;

/** The composer name used for a genuinely anonymous tune. */
export const TRADITIONAL = 'Traditional';

/** Public domain under life + 70 from this year on: 70 full years after the year of death. */
export const freeFromDeath = (died: number) => died + PUBLIC_DOMAIN_RULES.lifePlusYears + 1;

/** Public domain in the US from this year on. */
export const freeFromPublication = (published: number) =>
  published + PUBLIC_DOMAIN_RULES.publishedYears;

/**
 * Why a piece is not (yet) public domain in `year`, or which proof is missing.
 * Empty when it qualifies. Computed from the year so the rule cannot drift.
 */
export function publicDomainIssues(src: PublicDomainSource, year: number): string[] {
  const out: string[] = [];
  const people = [
    { role: 'composer', name: src.composer, died: src.composerDied },
    ...(src.contributors ?? []).map((c) => ({ role: c.role, name: c.name, died: c.died })),
  ];
  for (const p of people) {
    if (p.died === null) {
      if (p.name !== TRADITIONAL) out.push(`${p.name}: a named ${p.role} needs a year of death`);
      continue;
    }
    if (year < freeFromDeath(p.died))
      out.push(
        `${p.name} (${p.role}) died in ${p.died}: public domain under life + ${PUBLIC_DOMAIN_RULES.lifePlusYears} only from ${freeFromDeath(p.died)}`,
      );
  }
  if (!Number.isInteger(src.firstPublished)) out.push('needs the year it was first published');
  else if (year < freeFromPublication(src.firstPublished))
    out.push(
      `first published in ${src.firstPublished}: public domain in the US only from ${freeFromPublication(src.firstPublished)}`,
    );
  if (!src.edition.trim()) out.push('needs the edition the notes were taken from');
  return out;
}
