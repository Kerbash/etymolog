/**
 * CreateLexiconPage — the `/lexicon/create` route.
 *
 * Thin on purpose: create and edit are the SAME form (`LexiconEditor`) in two
 * modes. The two pages that used to exist diverged — one had a Cancel button
 * and the other did not, one reported failures and the other logged them.
 */

import { LexiconEditor } from '../editor';

export default function CreateLexiconPage() {
    return <LexiconEditor mode="create" />;
}
