import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Edit2, Plus, Search, Tags, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { CategoryBadge } from '../components/ui/category-badge';
import { Input } from '../components/ui/input';
import { ActionFeedback, EmptyState, ErrorState, LoadingState } from '../components/ui/state-feedback';
import {
  categoriesControllerCreate,
  categoriesControllerFindAll,
  categoriesControllerRemove,
  categoriesControllerUpdate,
} from '../lib/api-client';
import type { CategoryDto, PaginatedCategoriesResponseDto } from '../lib/api-client/models';
import { CATEGORY_COLOR_PRESETS } from '../lib/use-categories';

const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome deve ter no mínimo 2 caracteres.')
    .max(50, 'O nome deve ter no máximo 50 caracteres.'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use uma cor no formato #RRGGBB.'),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { detail?: string })?.detail ||
    (err as { message?: string })?.message ||
    fallback
  );
}

export function CategoriesPage() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formTarget, setFormTarget] = useState<CategoryDto | 'new' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data: response, isLoading, isError, refetch } = useQuery({
    queryKey: ['categories', { search }],
    queryFn: async () => {
      const res = await categoriesControllerFindAll({
        page: 1,
        pageSize: 100,
        ...(search ? { search } : {}),
      });
      return res.data;
    },
  });

  const payload = response as PaginatedCategoriesResponseDto | undefined;
  const categories: CategoryDto[] = payload && 'data' in payload ? payload.data : [];

  // Categorias e tarefas exibem dados uma da outra (contagem e badge), então
  // qualquer mutação invalida os dois caches.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: CategoryFormValues }) => {
      const res = id
        ? await categoriesControllerUpdate(id, data)
        : await categoriesControllerCreate(data);
      return res.data as CategoryDto;
    },
    onSuccess: (saved, variables) => {
      setFeedback({
        type: 'success',
        message: variables.id
          ? `Categoria "${saved.name}" atualizada.`
          : `Categoria "${saved.name}" criada.`,
      });
      setFormTarget(null);
      invalidateAll();
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: errorMessage(err, 'Não foi possível salvar a categoria.') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await categoriesControllerRemove(id);
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Categoria excluída. As tarefas dela ficaram sem categoria.' });
      invalidateAll();
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: errorMessage(err, 'Não foi possível excluir a categoria.') });
    },
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Tags className="h-6 w-6 text-blue-600" />
            Categorias
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Agrupe suas tarefas por contexto, como faculdade, trabalho ou casa.
          </p>
        </div>

        <Button onClick={() => setFormTarget('new')} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          Nova categoria
        </Button>
      </div>

      {feedback && (
        <ActionFeedback type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          aria-label="Buscar categoria"
          placeholder="Buscar categoria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>

      {isLoading ? (
        <LoadingState message="Carregando categorias..." />
      ) : isError ? (
        <ErrorState
          title="Erro ao buscar categorias"
          message="Não foi possível carregar as categorias agora."
          onRetry={() => refetch()}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title={search ? 'Nenhuma categoria encontrada' : 'Você ainda não tem categorias'}
          description={
            search
              ? 'Nenhuma categoria corresponde à busca.'
              : 'Crie uma categoria e use-a ao cadastrar ou editar tarefas.'
          }
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                Limpar busca
              </Button>
            ) : (
              <Button size="sm" onClick={() => setFormTarget('new')}>
                Criar primeira categoria
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {categories.map((category) => {
                const isForeign = category.ownerId !== user?.id;
                return (
                  <li
                    key={category.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CategoryBadge name={category.name} color={category.color} className="text-sm" />
                      <Link
                        to={`/tasks?categoryId=${category.id}`}
                        className="text-xs text-slate-500 hover:text-blue-600 hover:underline dark:text-slate-400"
                      >
                        {category.taskCount === 1 ? '1 tarefa' : `${category.taskCount} tarefas`}
                      </Link>
                      {isAdmin && isForeign && (
                        <span className="text-[11px] text-slate-400">de outro usuário</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        title={`Editar ${category.name}`}
                        aria-label={`Editar ${category.name}`}
                        onClick={() => setFormTarget(category)}
                      >
                        <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title={`Excluir ${category.name}`}
                        aria-label={`Excluir ${category.name}`}
                        isLoading={deleteMutation.isPending && deleteMutation.variables === category.id}
                        onClick={() => {
                          const detail =
                            category.taskCount > 0
                              ? ` As ${category.taskCount} tarefa(s) dela ficarão sem categoria.`
                              : '';
                          if (confirm(`Excluir a categoria "${category.name}"?${detail}`)) {
                            deleteMutation.mutate(category.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {formTarget && (
        <CategoryFormModal
          category={formTarget === 'new' ? null : formTarget}
          isLoading={saveMutation.isPending}
          onClose={() => setFormTarget(null)}
          onSubmit={(data) => {
            setFeedback(null);
            saveMutation.mutate({ id: formTarget === 'new' ? undefined : formTarget.id, data });
          }}
        />
      )}
    </div>
  );
}
function CategoryFormModal({
  category,
  isLoading,
  onClose,
  onSubmit,
}: {
  category: CategoryDto | null;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: CategoryFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: category?.name ?? '',
      color: category?.color ?? CATEGORY_COLOR_PRESETS[0],
    },
  });

  const color = watch('color');
  const name = watch('name');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-form-title"
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 relative"
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 id="category-form-title" className="text-lg font-bold text-slate-900 dark:text-white mb-4">
          {category ? 'Editar categoria' : 'Nova categoria'}
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nome"
            placeholder="Ex.: Faculdade"
            {...register('name')}
            error={errors.name?.message}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cor</legend>
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORY_COLOR_PRESETS.map((preset) => {
                const selected = color?.toUpperCase() === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Cor ${preset}`}
                    aria-pressed={selected}
                    onClick={() => setValue('color', preset, { shouldValidate: true })}
                    className="h-8 w-8 rounded-full flex items-center justify-center ring-offset-2 ring-offset-white dark:ring-offset-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    style={{
                      backgroundColor: preset,
                      boxShadow: selected ? `0 0 0 2px white, 0 0 0 4px ${preset}` : undefined,
                    }}
                  >
                    {selected && <Check className="h-4 w-4 text-white" />}
                  </button>
                );
              })}
              <label className="ml-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="color"
                  aria-label="Cor personalizada"
                  value={color}
                  onChange={(e) => setValue('color', e.target.value.toUpperCase(), { shouldValidate: true })}
                  className="h-8 w-10 cursor-pointer rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                />
                Outra
              </label>
            </div>
            {errors.color?.message && <span className="text-xs text-red-500">{errors.color.message}</span>}
          </fieldset>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            Prévia:
            <CategoryBadge name={name?.trim() || 'Nome da categoria'} color={color} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" isLoading={isLoading}>
              {category ? 'Salvar alterações' : 'Criar categoria'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}