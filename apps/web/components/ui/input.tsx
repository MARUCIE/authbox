import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border px-3 py-2 text-sm',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'focus-visible:outline-none focus-visible:ring-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors',
          className,
        )}
        style={{
          background: 'var(--surface-highest)',
          borderColor: 'var(--ghost-border)',
          color: 'var(--foreground)',
          // @ts-expect-error CSS custom property for focus ring
          '--tw-ring-color': 'rgba(195, 192, 255, 0.4)',
        }}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
export { Input };
