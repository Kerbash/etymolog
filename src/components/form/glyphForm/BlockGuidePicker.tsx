/**
 * "Guide: [CV › C box ▾]" above the glyph canvas — picks which template box
 * (`blockGuide.ts`) the canvas outlines. Renders nothing when the script has
 * no templates.
 */

import { useId } from 'react';

import { describeBoxSize, type BlockGuideOption } from './blockGuide';

import styles from './glyphFormFields.module.scss';

export interface BlockGuidePickerProps {
    options: BlockGuideOption[];
    /** The chosen option, or `null` for no guide. */
    chosen: BlockGuideOption | null;
    onChange: (key: string | null) => void;
}

const NONE = '';

export default function BlockGuidePicker({ options, chosen, onChange }: BlockGuidePickerProps) {
    const hintId = useId();
    if (options.length === 0) return null;

    const templates: { id: string; name: string; boxes: BlockGuideOption[] }[] = [];
    for (const option of options) {
        const group = templates.find((t) => t.id === option.template.id);
        if (group) group.boxes.push(option);
        else templates.push({ id: option.template.id, name: option.template.name, boxes: [option] });
    }

    return (
        <div className={styles.guidePicker} data-block-guide-picker="">
            <label>
                Block guide
                <select
                    value={chosen?.key ?? NONE}
                    onChange={(event) => onChange(event.target.value === NONE ? null : event.target.value)}
                    aria-describedby={chosen ? hintId : undefined}
                >
                    <option value={NONE}>None</option>
                    {templates.map((template) => (
                        <optgroup key={template.id} label={template.name}>
                            {template.boxes.map((box) => (
                                <option key={box.key} value={box.key}>
                                    {`${template.name} › ${box.roleLabel} box`}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
            </label>
            {chosen && (
                <p id={hintId} className={styles.guideHint} data-block-guide-hint="">
                    {`Draw the sign to fill the highlighted box — the ${chosen.roleLabel} box of ${chosen.template.name}, ${describeBoxSize(chosen.slot)} of the block. Only the shape counts: the sign is cropped to its ink and fitted into the box.`}
                    {chosen.slot.fill === 'fill' && ' This box is set to Fill, so the sign grows to cover it and spills past its edges.'}
                </p>
            )}
        </div>
    );
}
