import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass, type ButtonSize, type ButtonVariant } from './styles';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

export function Button({ variant, size, icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

// 아이콘만 있는 버튼. title은 접근성 이름으로도 쓴다.
export function IconButton({ className, title, children, variant = 'ghost', ...rest }: Omit<ButtonProps, 'icon' | 'size'> & { title: string }) {
  return (
    <button type="button" title={title} aria-label={title} className={buttonClass(variant, 'icon', className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant, size, icon, className, children }: { to: string; variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}
