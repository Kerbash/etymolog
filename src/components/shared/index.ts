/**
 * Barrel for the app's shared UI primitives.
 *
 * Everything here is etymolog-local on purpose: the cyber-components
 * equivalents of PageHeader's breadcrumb/back link reach `next/link` and
 * `next/navigation` transitively, and this app has no `next` dependency — those
 * imports fail at RESOLVE time. Anything that CAN come from cyber-components
 * (Modal, ConfirmationOverlay, NotificationBanner, Shimmer, DotLoader,
 * QuickFactsRow, EmptyState, Button/IconButton, HoverToolTip) is composed here
 * rather than reimplemented.
 */

export { default as PageHeader } from './pageHeader';
export type { PageHeaderProps, Crumb } from './pageHeader';

export { default as LoadingState } from './loadingState';
export type { LoadingStateProps, LoadingStateVariant } from './loadingState';

export { default as DialogPanel } from './dialogPanel';
export type { DialogPanelProps, DialogPanelSize } from './dialogPanel';

export { ConfirmDialogProvider, useConfirm } from './confirmDialog';
export type { ConfirmRequest, ConfirmFn } from './confirmDialog';

export { NotificationProvider, useNotify, useApiAction } from './notifications';
export type {
    Notice,
    NotifyApi,
    NotifyOptions,
    ApiActionOptions,
    NotificationProviderProps,
} from './notifications';

export { FormActionBar, FieldHelp } from './forms';
export type { FormActionBarProps, FieldHelpProps } from './forms';

export {
    EntityGallery,
    EntityCard,
    useGalleryState,
    applyGallery,
    hasActiveGalleryFilters,
    normalizeViewMode,
    GALLERY_PAGE_SIZES,
    GALLERY_FILTER_ALL,
} from './gallery';
export type {
    EntityGalleryProps,
    EntityCardProps,
    GalleryFilterOption,
    GalleryEmptyCopy,
    GalleryState,
    GalleryStateOptions,
    GalleryAdapters,
    GalleryQuery,
    GalleryPage,
} from './gallery';
