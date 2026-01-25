/**
 * EditGlyphModal
 * ---------------
 * Modal component for editing an existing glyph inline.
 * Used when editing glyphs within GraphemeFormFields without navigating away.
 *
 * This is a modal wrapper around GlyphFormFields similar to NewGlyphModal,
 * but for editing rather than creating.
 */

import { useState, useEffect } from "react";
import classNames from "classnames";
import Modal from "cyber-components/container/modal/modal";
import GlyphForm from "./GlyphForm";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button";
import Button from "cyber-components/interactable/buttons/button/button.tsx";
import { flex, graphic } from "utils-styles";
import { useEtymologApi, type Glyph } from "../../../db";
// GlyphFormFields not used directly in this modal anymore
import styles from "./editGlyphModal.module.scss";

interface EditGlyphModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback to set modal open state */
    setIsOpen: (open: boolean) => void;
    /** The glyph to edit */
    glyph: Glyph | null;
    /** Callback when glyph is successfully updated */
    onGlyphUpdated: (glyph: Glyph) => void;
    /** Optional callback when glyph is deleted */
    onGlyphDeleted?: (glyphId: number) => void;
    /** Whether to show delete option (default: true) */
    showDelete?: boolean;
}

export default function EditGlyphModal({
    isOpen,
    setIsOpen,
    glyph,
    onGlyphUpdated,
    onGlyphDeleted,
    showDelete = true,
}: EditGlyphModalProps) {
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const api = useEtymologApi();

     // Reset error state when modal opens/closes or glyph changes
     useEffect(() => {
         if (isOpen) {
             setError(null);
             setShowDeleteConfirm(false);
         }
     }, [isOpen, glyph?.id]);

     const handleClose = () => {
         setError(null);
         setShowDeleteConfirm(false);
         setIsOpen(false);
     };

    // The SmartForm and submit logic have been moved to GlyphForm. We'll wire GlyphForm callbacks below.

     const handleDelete = async () => {
         if (!glyph || isDeleting) return;

         setIsDeleting(true);
         try {
             // Use forceDelete to remove from grapheme_glyphs if needed
             const result = api.glyph.forceDelete(glyph.id);
             if (!result.success) {
                 throw new Error(result.error?.message || 'Failed to delete glyph');
             }

             setShowDeleteConfirm(false);
             setIsOpen(false);

             // Notify parent
             setTimeout(() => onGlyphDeleted?.(glyph.id), 20);
         } catch (err) {
             console.error('[EditGlyphModal] Delete error:', err);
             setError(err instanceof Error ? err.message : 'Failed to delete glyph');
         } finally {
             setIsDeleting(false);
         }
     };

     if (!glyph) return null;

     return (
         <Modal
             isOpen={isOpen}
             setIsOpen={setIsOpen}
             onClose={handleClose}
             allowClose={!isSubmitting && !isDeleting}
         >
             <div className={classNames(styles.modalContent)}>
                 <h2 className={graphic.underlineHighlightColorPrimary}>
                     Edit Glyph: {glyph.name}
                 </h2>

                 {error && (
                     <div className={styles.errorMessage}>
                         {error}
                     </div>
                 )}

                 {showDeleteConfirm ? (
                     <div className={styles.deleteConfirm}>
                         <p>Are you sure you want to delete "{glyph.name}"?</p>
                         <p className={styles.warningText}>
                             ⚠️ This will remove the glyph from this grapheme.
                         </p>
                         <div className={classNames(flex.flex, flex.flexGapM, styles.modalButtons)}>
                             <Button
                                 onClick={() => setShowDeleteConfirm(false)}
                                 disabled={isDeleting}
                             >
                                 Cancel
                             </Button>
                             <Button
                                 onClick={handleDelete}
                                 disabled={isDeleting}
                                 style={{ background: 'var(--danger)', color: 'white' }}
                             >
                                 {isDeleting ? 'Deleting...' : 'Delete Glyph'}
                             </Button>
                         </div>
                     </div>
                 ) : (
                    <GlyphForm
                        mode="edit"
                        initialData={glyph}
                        onSuccess={(updatedGlyph) => {
                            // Close modal and notify parent after short delay
                            setIsOpen(false);
                            setTimeout(() => onGlyphUpdated(updatedGlyph), 20);
                        }}
                        onCancel={handleClose}
                        onError={(msg) => setError(msg)}
                        onSubmittingChange={(s) => setIsSubmitting(s)}
                        extraActions={(isSubmittingLocal) => (
                            showDelete && (
                                <IconButton
                                    className={classNames(buttonStyles.danger)}
                                    type="button"
                                    iconName="trash"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    disabled={isSubmittingLocal}
                                >
                                    Delete
                                </IconButton>
                            )
                        )}
                     />
                 )}
             </div>
         </Modal>
     );
 }
