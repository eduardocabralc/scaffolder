import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;

  const mockUser = { id: 'user-uuid-1', role: 'USER' };
  const mockOtherUser = { id: 'user-uuid-2', role: 'USER' };
  const mockAdmin = { id: 'admin-uuid-1', role: 'ADMIN' };

  const mockCategory = {
    id: 'cat-uuid-1',
    name: 'Faculdade',
    color: '#10B981',
    ownerId: 'user-uuid-1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { tasks: 2 },
  };

  beforeEach(() => {
    prisma = {
      category: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      task: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a category with trimmed name, uppercase color and task count', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(mockCategory);

      const result = await service.create(mockUser.id, { name: '  Faculdade ', color: '#10b981' });

      expect(prisma.category.create.mock.calls[0][0].data).toEqual({
        name: 'Faculdade',
        color: '#10B981',
        ownerId: mockUser.id,
      });
      expect(result.taskCount).toBe(2);
    });

    it('uses the default color when none is informed', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(mockCategory);

      await service.create(mockUser.id, { name: 'Casa' });

      expect(prisma.category.create.mock.calls[0][0].data.color).toBe('#3B82F6');
    });

    it('rejects duplicated names for the same owner (case-insensitive)', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(mockUser.id, { name: 'faculdade' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.category.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('restricts regular users to their own categories', async () => {
      prisma.category.count.mockResolvedValue(1);
      prisma.category.findMany.mockResolvedValue([mockCategory]);

      const result = await service.findAll(mockUser, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(prisma.category.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ deletedAt: null, ownerId: mockUser.id }),
      );
    });

    it('allows admin to list categories from all users', async () => {
      prisma.category.count.mockResolvedValue(1);
      prisma.category.findMany.mockResolvedValue([mockCategory]);

      await service.findAll(mockAdmin, { page: 1, pageSize: 20 });

      expect(prisma.category.findMany.mock.calls[0][0].where.ownerId).toBeUndefined();
    });
  });

  describe('findById and ownership', () => {
    it('throws NotFoundException for missing or deleted category', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.findById(mockUser, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for category of another user', async () => {
      prisma.category.findFirst.mockResolvedValue(mockCategory);

      await expect(service.findById(mockOtherUser, mockCategory.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('rejects renaming to a name already used by another category', async () => {
      prisma.category.findFirst
        .mockResolvedValueOnce(mockCategory)
        .mockResolvedValueOnce({ id: 'other-cat' });

      await expect(
        service.update(mockUser, mockCategory.id, { name: 'Trabalho' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove (soft delete)', () => {
    it('soft deletes the category and detaches its tasks in one transaction', async () => {
      prisma.category.findFirst.mockResolvedValue(mockCategory);

      await service.remove(mockUser, mockCategory.id);

      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { categoryId: mockCategory.id },
        data: { categoryId: null },
      });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('prevents a non-owner regular user from deleting', async () => {
      prisma.category.findFirst.mockResolvedValue(mockCategory);

      await expect(service.remove(mockOtherUser, mockCategory.id)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('assertUsableByOwner', () => {
    it('accepts an active category of the same owner', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: mockCategory.id, ownerId: mockUser.id });

      await expect(
        service.assertUsableByOwner(mockCategory.id, mockUser.id),
      ).resolves.toBeUndefined();
    });

    it('rejects a category from another owner with NotFound', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: mockCategory.id, ownerId: 'someone-else' });

      await expect(
        service.assertUsableByOwner(mockCategory.id, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });
  });
});