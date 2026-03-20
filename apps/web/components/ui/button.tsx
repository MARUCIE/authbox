import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          {
            default:
              'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
            outline:
              'border border-[var(--border)] bg-transparent hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
            ghost:
              'hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
            destructive:
              'bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90',
          }[variant],
          {
            default: 'h-10 px-4 py-2 text-sm',
            sm: 'h-9 px-3 text-xs',
            lg: 'h-11 px-8 text-base',
            icon: 'h-10 w-10',
          }[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
export { Button };
