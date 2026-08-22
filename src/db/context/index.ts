/**
 * Context Barrel Export
 *
 * `EtymologContext.tsx` holds the provider component only; the context object,
 * its types and the consumer hooks live in `etymologContext.ts` (Fast Refresh
 * requires a component-only module). Importers use this barrel and see one
 * surface either way.
 */
export { EtymologProvider } from './EtymologProvider';
export {
    EtymologContext,
    EMPTY_DATA,
    useEtymolog,
    useEtymologApi,
    useEtymologData,
    useEtymologSettings,
    useEtymologStatus,
    type EtymologContextValue,
    type EtymologData,
    type RefreshError,
} from './etymologContext';
