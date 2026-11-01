import { createContext, useContext, type AriaAttributes } from 'react';

export interface FieldControl {
  /** The id the Field's label points at. */
  id: string;
  /** ids of the hint and error, when shown. */
  describedBy?: string;
  invalid: boolean;
}

export const FieldContext = createContext<FieldControl | null>(null);

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
}

/**
 * The id, description and invalid state for a control inside a Field. Props
 * the caller sets win, except descriptions, which are joined.
 */
export function useFieldControl(props: ControlProps): ControlProps {
  const field = useContext(FieldContext);
  const describedBy =
    [field?.describedBy, props['aria-describedby']].filter(Boolean).join(' ') || undefined;
  return {
    id: props.id ?? field?.id,
    'aria-describedby': describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid || undefined),
  };
}
