import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';
import { fieldClass } from './styles';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, 'resize-y leading-relaxed', className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, className)} {...rest} />;
}

// 라벨 + 입력칸 + 도움말 묶음
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-xs font-semibold text-ink-2', className)}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-ink-3 leading-relaxed">{hint}</span>}
    </label>
  );
}
