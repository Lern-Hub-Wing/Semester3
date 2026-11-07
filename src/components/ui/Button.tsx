import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary font-semibold',
  secondary: 'glass mat-interactive text-ink',
  ghost: 'text-ink hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]',
  danger: 'bg-[color-mix(in_srgb,var(--ss-danger)_14%,transparent)] text-danger hover:bg-[color-mix(in_srgb,var(--ss-danger)_22%,transparent)]',
  glass: 'glass mat-interactive text-ink',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-full',
  md: 'h-11 px-4.5 text-sm gap-2 rounded-full',
  lg: 'h-[52px] px-6 text-[15px] gap-2 rounded-full',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, children, className = '', disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 select-none items-center justify-center font-medium transition-[transform,opacity,background-color,filter,box-shadow] duration-[260ms] ease-[var(--ease-spring)] active:scale-[0.95] disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className = '', size = 'md', variant = 'ghost', children, ...rest },
  ref,
) {
  const dim = size === 'sm' ? 'size-9 rounded-full' : size === 'lg' ? 'size-12 rounded-full' : 'size-11 rounded-full';
  return (
    <Button ref={ref} aria-label={label} title={label} variant={variant} className={`!px-0 ${dim} ${className}`} {...rest}>
      {children}
    </Button>
  );
});
