/**
 * NewGlyphModal
 * -------------
 * "Add new glyph" from inside the grapheme form.
 *
 * The one modal in the Script Maker that is NOT a picker, and it earns the
 * exception (open decision 7): drawing a glyph happens WHILE composing a
 * grapheme, and routing to `/script-maker/glyphs/create` would throw the
 * half-filled grapheme form away to get there.
 *
 * The created glyph is handed to the parent AFTER the modal has closed, via a
 * pending ref flushed by an effect on `isOpen`. The version this replaces did
 * the same thing with `setTimeout(…, 20)` — a guess at how long a close takes,
 * which is either too short (the parent re-render unmounts the modal
 * mid-transition) or dead time, and is untestable without fake timers either
 * way. The effect fires exactly when the state it depends on has landed.
 */

import { useCallback, useEffect, useRef } from "react";

import Modal from "cyber-components/container/modal/modal.tsx";

import { type Glyph } from "../../../../db";
import { GlyphForm } from "../../../form/glyphForm";
import { DialogPanel } from "../../../shared";

export interface NewGlyphModalProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    /** Called with the new glyph once the modal has closed. */
    onGlyphCreated: (glyph: Glyph) => void;
}

export default function NewGlyphModal({ isOpen, setIsOpen, onGlyphCreated }: NewGlyphModalProps) {
    const pendingGlyphRef = useRef<Glyph | null>(null);

    useEffect(() => {
        if (isOpen) return;
        const glyph = pendingGlyphRef.current;
        if (!glyph) return;
        pendingGlyphRef.current = null;
        onGlyphCreated(glyph);
    }, [isOpen, onGlyphCreated]);

    const handleSuccess = useCallback(
        (glyph: Glyph) => {
            pendingGlyphRef.current = glyph;
            setIsOpen(false);
        },
        [setIsOpen],
    );

    const handleCancel = useCallback(() => {
        pendingGlyphRef.current = null;
        setIsOpen(false);
    }, [setIsOpen]);

    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen} allowClose>
            <DialogPanel size="lg" title="Draw a new glyph">
                <GlyphForm mode="create" onSuccess={handleSuccess} onCancel={handleCancel} />
            </DialogPanel>
        </Modal>
    );
}
