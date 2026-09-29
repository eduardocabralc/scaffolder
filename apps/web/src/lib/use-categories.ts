import { useQuery } from '@tanstack/react-query';
import { categoriesControllerFindAll } from './api-client';
import type { CategoryDto, PaginatedCategoriesResponseDto } from './api-client/models';

/** Paleta sugerida no formulário de categorias. */
export const CATEGORY_COLOR_PRESETS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#64748B',
] as const;

/**
 * Carrega todas as categorias visíveis (até 100, limite da API) para
 * selects e filtros. Compartilha a chave ['categories'] com a página de
 * categorias, então qualquer mutação que invalide essa chave atualiza tudo.
 */
export function useAllCategories() {
  const query = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () => {
      const res = await categoriesControllerFindAll({ page: 1, pageSize: 100 });
      return res.data;
    },
    staleTime: 30_000,
  });

  const payload = query.data as PaginatedCategoriesResponseDto | undefined;
  const categories: CategoryDto[] = payload && 'data' in payload ? payload.data : [];

  return { ...query, categories };
}