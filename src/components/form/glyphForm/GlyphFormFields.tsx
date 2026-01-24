/**
 * GlyphFormFields
 * ----------------
 * Shared form fields for creating and editing glyphs.
 * Extracted from NewGlyphModal to be reusable across create/edit contexts.
 *
 * This component renders:
 * - SVG Drawing Canvas
 * - Glyph Name Input
 * - Category Input
 * - Notes Input
 *
 * It does NOT render the form wrapper or submit buttons - that's the parent's responsibility.
 *
 * IMPORTANT: This component follows SmartForm's pattern of calling registerField() on every
 * render. SmartForm handles the registration internally - the returned fieldState values
 * must be used fresh each render to receive state updates.
 */

import classNames from "classnames";
import { useEffect, useRef, useMemo } from "react";
import type { Glyph } from "../../../db";
import type { registerFieldReturnType } from "smart-form/types";

import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import SvgDrawerInput from "smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import { flex, sizing } from "utils-styles";

export interface GlyphFormFieldsProps {
    /** SmartForm's registerField function */
    registerField: (name: string, options: any) => registerFieldReturnType;
    /** Mode: 'create' for new glyphs, 'edit' for existing glyphs */
    mode: 'create' | 'edit';
    /** Initial data for edit mode (glyph to edit) */
    initialData?: Glyph | null;
    /** Optional class name for the container */
    className?: string;
}

/**
 * GlyphFormFields - Reusable form fields for glyph creation/editing
 *
 * DESIGN NOTE: registerField() is called on every render. This is intentional and correct!
 * SmartForm's registerField:
 * 1. Handles registration internally (only registers once via pending refs)
 * 2. Returns FRESH fieldState values from React state each render
 * 3. Provides stable handlers via internal caching
 *
 * DO NOT cache registerField results in refs - this causes stale state bugs.
 */
export default function GlyphFormFields({
    registerField,
    mode,
    initialData,
    className,
}: GlyphFormFieldsProps) {
    // Track if we've initialized the form with initial data
    const initializedRef = useRef(false);

    // Memoize validation configs to prevent unnecessary re-registration
    // (SmartForm uses options hash for caching, but stable refs help)
    const glyphNameValidation = useMemo(() => TextInputValidatorFactory({
        required: {
            value: true,
            message: "Glyph name is required"
        },
    }), []);

    // Register fields on every render - SmartForm handles internal state
    // The returned objects contain fresh state values that update with React state
    const glyphSvgField = registerField("glyphSvg", {
        defaultValue: mode === 'edit' && initialData?.svg_data ? initialData.svg_data : undefined,
    });

    const glyphNameField = registerField("glyphName", {
        defaultValue: mode === 'edit' && initialData?.name ? initialData.name : undefined,
        validation: glyphNameValidation,
    });

    const categoryField = registerField("category", {
        defaultValue: mode === 'edit' && initialData?.category ? initialData.category : undefined,
    });

    const notesField = registerField("notes", {
        defaultValue: mode === 'edit' && initialData?.notes ? initialData.notes : undefined,
    });

    // Set initial values for edit mode after fields are registered
    // This handles cases where the DOM needs to be updated with initial values
    useEffect(() => {
        if (mode === 'edit' && initialData && !initializedRef.current) {
            initializedRef.current = true;

            // Use setTimeout to defer state updates out of render phase
            setTimeout(() => {
                const nameInput = glyphNameField.registerSmartFieldProps.ref?.current as HTMLInputElement | null;
                if (nameInput && initialData.name) {
                    nameInput.value = initialData.name;
                    glyphNameField.fieldState.isEmpty.setIsEmpty(false);
                }

                const categoryInput = categoryField.registerSmartFieldProps.ref?.current as HTMLInputElement | null;
                if (categoryInput && initialData.category) {
                    categoryInput.value = initialData.category;
                    categoryField.fieldState.isEmpty.setIsEmpty(false);
                }

                const notesInput = notesField.registerSmartFieldProps.ref?.current as HTMLTextAreaElement | null;
                if (notesInput && initialData.notes) {
                    notesInput.value = initialData.notes;
                    notesField.fieldState.isEmpty.setIsEmpty(false);
                }
            }, 0);
        }
    }, [mode, initialData, glyphNameField, categoryField, notesField]);

    return (
        <div className={classNames(flex.flexCol, flex.flexGapM, className)}>
            <div className={classNames(sizing.parentWidth, flex.flex, flex.justifyContentCenter)}>
                {/* SVG Drawing Canvas */}
                <HoverToolTip
                    className={classNames(sizing.fitContent)}
                    content={mode === 'edit' ? "Edit your glyph drawing" : "Draw your glyph here"}
                >
                    <SvgDrawerInput
                        {...glyphSvgField}
                    />
                </HoverToolTip>
            </div>

            {/* Glyph Name Input */}
            <HoverToolTip content={"The name of this glyph"}>
                <LabelShiftTextInput
                    displayName={"Glyph Name"}
                    asInput={true}
                    {...glyphNameField}
                />
            </HoverToolTip>

            {/* Category Input */}
            <HoverToolTip content={"Category to organize your glyphs (e.g., Vowels, Consonants, Numbers)"}>
                <LabelShiftTextInput
                    displayName={"Category"}
                    asInput={true}
                    {...categoryField}
                />
            </HoverToolTip>

            {/* Notes Input */}
            <HoverToolTip
                className={classNames(sizing.parentWidth)}
                content={"Additional notes about this glyph"}
            >
                <LabelShiftTextInput
                    displayName={"Notes"}
                    asInput={false}
                    {...notesField}
                />
            </HoverToolTip>
        </div>
    );
}

/**
 * Type for the form data produced by GlyphFormFields
 */
export interface GlyphFormData {
    glyphSvg: string;
    glyphName: string;
    category?: string;
    notes?: string;
}
