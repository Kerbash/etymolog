/**
 * How a word is NAMED, in one place.
 *
 * The app had two rules running side by side: the view page titled a word
 * `pronunciation ?? lemma` while its own delete dialog asked about `lemma`, and
 * the gallery's dialog used a third spelling of the same idea. On any word whose
 * pronunciation differs from its lemma — which is most of them, since the lemma
 * input was removed from the form and the two only coincide by accident — the
 * confirmation named a DIFFERENT string than the heading the user was reading.
 *
 * One rule, imported by the title, the confirmation, the gallery card label and
 * the breadcrumb: pronunciation if there is one, else the lemma.
 */

/** The minimum shape needed to name a word. */
export interface NameableLexicon {
    lemma: string;
    pronunciation?: string | null;
}

/** The word's display name — pronunciation when present, otherwise the lemma. */
export function lexiconDisplayName(entry: NameableLexicon): string {
    const pronunciation = entry.pronunciation?.trim();
    return pronunciation ? pronunciation : entry.lemma;
}
