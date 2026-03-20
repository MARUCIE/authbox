import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const variantStyles: Record<string, { className: string; style?: React.CSSProperties }> = {
  default: {
    className: 'btn-gradient hover:brightness-110',
  },
  outline: {
    className: 'bg-transparent hover:opacity-80 transition-opacity',
    style: { border: '1px solid var(--ghost-border)', color: 'var(--foreground)' },
  },
  ghost: {
    className: 'bg-transparent hover:opacity-80 transition-opacity',
    style: { color: 'var(--muted-foreground)' },
  },
  destructive: {
    className: 'hover:opacity-90 transition-opacity',
    style: { background: 'rgba(255, 180, 171, 0.15)', color: 'var(--destructive)' },
  },
};

const sizeStyles: Record<string, string> = {
  default: 'h-10 px-4 py-2 text-sm',
  sm: 'h-9 px-3 text-xs',
  lg: 'h-11 px-8 text-base',
  icon: 'h-10 w-10',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', style, ...props }, ref) => {
    const v = variantStyles[variant] ?? variantStyles.default;
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium',
          'focus-visible:outline-none focus-visible:ring-2',
          'disabled:pointer-events-none disabled:opacity-50',
          v.className,
          sizeStyles[size],
          className,
        )}
        style={{
          '--tw-ring-color': 'rgba(195, 192, 255, 0.4)',
          ...v.style,
          ...style,
        } as React.CSSProperties}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
export { Button };
