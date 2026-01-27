// @ts-nocheck
import { createRef } from 'react';
import { render, act } from '@testing-library/react';
import { vi } from 'vitest';

import GlyphCanvasInput from '../GlyphCanvasInput';

function makeFieldState() {
  const make = (initial = false) => ({ value: initial, setIsEmpty: vi.fn(), setIsTouched: vi.fn(), setIsChanged: vi.fn(), setWarning: vi.fn(), setIsInputValid: vi.fn() });
  return {
    isEmpty: make(true),
    isTouched: make(false),
    warning: { value: null, setWarning: vi.fn() },
    isInputValid: { value: true, setIsInputValid: vi.fn() },
    isChanged: { value: false, setIsChanged: vi.fn() },
  };
}

describe('GlyphCanvasInput', () => {
  it('calls onSelectionChange when setValue is used (happy path)', async () => {
    const registerSmartFieldProps = {
      name: 'glyphs',
      ref: createRef<any>(),
      defaultValue: [] as number[],
    } as any;

    const fieldState = makeFieldState() as any;

    const utils = { validatorFunction: undefined, validationOptions: null, resetField: vi.fn() } as any;

    const onSelectionChange = vi.fn();

    const props: any = {
      registerSmartFieldProps,
      fieldState,
      utils,
      availableGlyphs: [],
      defaultValue: [],
      label: 'Test Glyphs',
    };

    render(<GlyphCanvasInput {...props} onSelectionChange={onSelectionChange} />);

    // After mount, call the smart-field setValue exposed on the ref
    expect(registerSmartFieldProps.ref.current).toBeDefined();

    act(() => {
      registerSmartFieldProps.ref.current?.setValue([1, 2]);
    });

    // onSelectionChange should be called with the new selection
    expect(onSelectionChange).toHaveBeenCalledWith([1, 2]);
  });
});
