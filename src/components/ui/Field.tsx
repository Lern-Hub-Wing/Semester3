import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface WrapProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  count?: { value: number; max: number };
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

export function FieldWrap({ label, hint, error, count, children, className = '' }: WrapProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
        </label>
        {count && (
          <span className={`num text-[11px] ${count.value > count.max ? 'text-danger' : 'text-faint'}`}>
            {count.value}/{count.max}
          </span>
        )}
      </div>
      {children(id, describedBy)}
      {(error || hint) && (
        <p id={hintId} className={`text-xs ${error ? 'text-danger' : 'text-faint'}`} role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null; showCount?: boolean };

export function TextField({ label, hint, error, showCount, className, maxLength, value, ...rest }: InputProps) {
  return (
    <FieldWrap
      label={label}
      hint={hint}
      error={error}
      className={className}
      count={showCount && maxLength ? { value: String(value ?? '').length, max: maxLength } : undefined}
    >
      {(id, describedBy) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={!!error} className="field" maxLength={maxLength} value={value} {...rest} />
      )}
    </FieldWrap>
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string | null };

export function TextArea({ label, hint, error, className, maxLength, value, ...rest }: AreaProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error} className={className} count={maxLength ? { value: String(value ?? '').length, max: maxLength } : undefined}>
      {(id, describedBy) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className="field min-h-[88px] resize-y"
          maxLength={maxLength}
          value={value}
          {...rest}
        />
      )}
    </FieldWrap>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | null };

export function SelectField({ label, hint, error, className, children, ...rest }: SelectProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={!!error} className="field appearance-none bg-no-repeat pr-10" style={{ backgroundImage: CHEVRON, backgroundPosition: 'right 14px center' }} {...rest}>
          {children}
        </select>
      )}
    </FieldWrap>
  );
}

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238A94A6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;
