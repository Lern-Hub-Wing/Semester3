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
  primary:
    'bg-ink text-canvas hover:opacity-90 active:opacity-80 shadow-[0_8px_20px_-10px_rgba(20,28,45,0.5)] dark:shadow-[0_8px_24px_-12px_rgba(175,197,245,0.45)]',
  secondary: 'bg-surface-2 text-ink hover:bg-[color-mix(in_srgb,var(--ss-card-2)_80%,var(--ss-text)_6%)] border border-line',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-[color-mix(in_srgb,var(--ss-danger)_14%,transparent)] text-danger hover:bg-[color-mix(in_srgb,var(--ss-danger)_22%,transparent)]',
  glass: 'glass text-ink hover:brightness-[1.03]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-sm gap-2 rounded-2xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
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
      className={`inline-flex shrink-0 select-none items-center justify-center font-medium transition-[transform,opacity,background-color,filter] duration-200 ease-[var(--ease-soft)] active:scale-[0.97] disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
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
  const dim = size === 'sm' ? 'size-9 rounded-xl' : size === 'lg' ? 'size-12 rounded-2xl' : 'size-11 rounded-2xl';
  return (
    <Button ref={ref} aria-label={label} title={label} variant={variant} className={`!px-0 ${dim} ${className}`} {...rest}>
      {children}
    </Button>
  );
});
