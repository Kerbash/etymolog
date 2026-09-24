/**
 * The `parts` override that turns a `NotificationBanner` (a fixed-position
 * toast by default) into an INLINE warning sitting with the content it is
 * about. Shared by the Direction and Blocks pages so the two cannot drift.
 *
 * An inline style is the only override that reliably beats the component's own
 * stylesheet — a class would depend on bundle order for equal specificity.
 */
export const INLINE_BANNER_PARTS = {
    root: {
        style: {
            position: 'static',
            maxWidth: '100%',
            marginInline: 0,
            width: '100%',
        },
    },
} as const;
