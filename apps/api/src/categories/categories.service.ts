import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryDto,
  CreateCategoryDto,
  DEFAULT_CATEGORY_COLOR,
  ListCategoriesQueryDto,
  PaginatedCategoriesResponseDto,
  UpdateCategoryDto,
} from './category.dto';

interface UserContext {
  id: string;
  role: string;
}

/** Conta apenas tarefas ativas (sem soft delete) vinculadas à categoria. */
const ACTIVE_TASK_COUNT = {
  _count: { select: { tasks: { where: { deletedAt: null } } } },
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateCategoryDto): Promise<CategoryDto> {
    const name = dto.name.trim();
    await this.assertNameAvailable(ownerId, name);

    const created = await this.prisma.category.create({
      data: {
        name,
        color: (dto.color ?? DEFAULT_CATEGORY_COLOR).toUpperCase(),
        ownerId,
      },
      include: ACTIVE_TASK_COUNT,
    });

    return this.serializeCategory(created);
  }

  async findAll(user: UserContext, query: ListCategoriesQueryDto): Promise<PaginatedCategoriesResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { deletedAt: null };

    // Autorização: usuários comuns veem apenas suas categorias; ADMIN pode ver todas
    if (user.role !== 'ADMIN') {
      where.ownerId = user.id;
    }

    if (query.search) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: ACTIVE_TASK_COUNT,
      }),
    ]);

    return {
      data: items.map((item) => this.serializeCategory(item)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async findById(user: UserContext, id: string): Promise<CategoryDto> {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: ACTIVE_TASK_COUNT,
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    this.assertCanAccess(user, category.ownerId, 'acessar');
    return this.serializeCategory(category);
  }

  async update(user: UserContext, id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const existing = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });

    if (!existing) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    this.assertCanAccess(user, existing.ownerId, 'modificar');

    const name = dto.name?.trim();
    if (name !== undefined && name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameAvailable(existing.ownerId, name, id);
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(dto.color !== undefined ? { color: dto.color.toUpperCase() } : {}),
      },
      include: ACTIVE_TASK_COUNT,
    });

    return this.serializeCategory(updated);
  }

  async remove(user: UserContext, id: string): Promise<void> {
    const existing = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });

    if (!existing) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    this.assertCanAccess(user, existing.ownerId, 'excluir');

    // Remoção lógica da categoria + desvínculo das tarefas numa única transação:
    // uma tarefa nunca deve apontar para uma categoria invisível.
    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.category.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  /**
   * Regra usada pelo módulo Tasks: a categoria precisa existir, estar ativa
   * e pertencer ao mesmo dono da tarefa.
   */
  async assertUsableByOwner(categoryId: string, ownerId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true, ownerId: true },
    });

    if (!category || category.ownerId !== ownerId) {
      // Mesma mensagem para "não existe" e "é de outro usuário": não revela categorias alheias.
      throw new NotFoundException('Categoria não encontrada para o proprietário da tarefa.');
    }
  }

  private async assertNameAvailable(ownerId: string, name: string, ignoreId?: string): Promise<void> {
    const duplicate = await this.prisma.category.findFirst({
      where: {
        ownerId,
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(`Já existe uma categoria chamada "${name}".`);
    }
  }

  private assertCanAccess(user: UserContext, ownerId: string, action: string): void {
    if (user.role !== 'ADMIN' && ownerId !== user.id) {
      throw new ForbiddenException(`Você não tem permissão para ${action} esta categoria.`);
    }
  }

  private serializeCategory(category: any): CategoryDto {
    return {
      id: category.id,
      name: category.name,
      color: category.color,
      ownerId: category.ownerId,
      taskCount: category._count?.tasks ?? 0,
      createdAt: new Date(category.createdAt).toISOString(),
      updatedAt: new Date(category.updatedAt).toISOString(),
    };
  }
}