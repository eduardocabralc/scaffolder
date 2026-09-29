import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CategoryBadgeProps {
  name: string;
  color: string;
  className?: string;
}

/**
 * Exibe a categoria com a cor escolhida pelo usuário.
 * A cor aparece no ponto e numa borda translúcida; o texto mantém o contraste
 * do tema, pois a cor é livre e poderia ficar ilegível como fundo.
 */
export function CategoryBadge({ name, color, className }: CategoryBadgeProps) {
  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200',
          className,
        ),
      )}
      style={{ borderColor: `${color}66`, backgroundColor: `${color}14` }}
      title={`Categoria: ${name}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}