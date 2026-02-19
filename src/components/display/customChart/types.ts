/**
 * Custom Chart Component Types
 *
 * @module display/customChart/types
 */

import type { GraphemeComplete } from '../../../db/types';
import type { CustomChartDefinition, BasicChartDefinition, SyllabaryChartDefinition } from '../../../db/api/types';

export interface CustomChartBaseProps {
    phonemeMap: Map<string, GraphemeComplete>;
    onCellClick?: (ipa: string, grapheme: GraphemeComplete | null) => void;
    className?: string;
}

export interface CustomBasicChartProps extends CustomChartBaseProps {
    chart: BasicChartDefinition;
}

export interface CustomSyllabaryChartProps extends CustomChartBaseProps {
    chart: SyllabaryChartDefinition;
}

export interface CustomChartCardProps extends CustomChartBaseProps {
    chart: CustomChartDefinition;
    onEdit: (chart: CustomChartDefinition) => void;
    onDelete: (chart: CustomChartDefinition) => void;
}

export interface CreateChartModalProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    editingChart: CustomChartDefinition | null;
    onSubmit: (chart: CustomChartDefinition) => void;
}
