import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  ChevronRight,
  FolderTree,
  Layers,
  MoreHorizontal,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RoleGate } from '@/features/auth/RoleGate'
import { useAuth } from '@/features/auth/AuthContext'
import {
  categoriesApi,
  type CategoryKind,
  type CategoryNode,
  type CategoryOut,
} from '@/lib/api/categories'
import { cn } from '@/lib/utils'
import { CategoryFormDialog } from './CategoryFormDialog'

type Tab = 'income' | 'expense'

export function CategoriesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('expense')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryOut | null>(null)
  const [parentDefault, setParentDefault] = useState<{
    parent_id: number | null
    kind: CategoryKind
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategoryOut | null>(null)

  const treeQuery = useQuery({
    queryKey: ['categories', 'tree', tab],
    queryFn: () => categoriesApi.tree(tab),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => categoriesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Categoria excluída')
      setDeleteTarget(null)
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao excluir categoria.'))
    },
  })

  function openCreate(forKind: Tab) {
    setEditing(null)
    setParentDefault({ parent_id: null, kind: forKind })
    setFormOpen(true)
  }

  function openCreateChild(parent: CategoryOut) {
    setEditing(null)
    setParentDefault({ parent_id: parent.id, kind: parent.kind as Tab })
    setFormOpen(true)
  }

  function openEdit(cat: CategoryOut) {
    setEditing(cat)
    setParentDefault(null)
    setFormOpen(true)
  }

  return (
    <div className="relative space-y-8 animate-fade-in">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 right-10 h-56 w-56 bg-glow-cyan opacity-20"
      />

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Layers className="h-3 w-3 text-primary" aria-hidden="true" />
            <span>Estrutura</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Categorias
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize receitas e despesas em uma hierarquia clara e reutilizável.
          </p>
        </div>
        <RoleGate roles={['admin']}>
          <Button
            onClick={() => openCreate(tab)}
            className="shadow-[0_0_24px_-8px_var(--color-primary)]"
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={2.25} />
            Nova categoria
          </Button>
        </RoleGate>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="relative">
        <TabsList variant="line" className="border-b border-border/60 pb-px">
          <TabsTrigger value="expense">Despesas</TabsTrigger>
          <TabsTrigger value="income">Receitas</TabsTrigger>
        </TabsList>

        <TabsContent value="expense" className="mt-6">
          <CategoryTreeView
            data={treeQuery.data}
            isLoading={treeQuery.isLoading}
            isError={treeQuery.isError}
            isAdmin={isAdmin}
            onEdit={openEdit}
            onAddChild={openCreateChild}
            onDelete={setDeleteTarget}
          />
        </TabsContent>

        <TabsContent value="income" className="mt-6">
          <CategoryTreeView
            data={treeQuery.data}
            isLoading={treeQuery.isLoading}
            isError={treeQuery.isError}
            isAdmin={isAdmin}
            onEdit={openEdit}
            onAddChild={openCreateChild}
            onDelete={setDeleteTarget}
          />
        </TabsContent>
      </Tabs>

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next)
          if (!next) {
            setEditing(null)
            setParentDefault(null)
          }
        }}
        category={editing}
        defaults={parentDefault}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null)
        }}
      >
        <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Excluir categoria
            </DialogTitle>
            <DialogDescription>
              Esta operação é permanente. Categorias com subcategorias ou em uso
              em transações não podem ser excluídas.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <p className="text-sm text-muted-foreground">
              Confirma excluir <strong className="text-foreground">{deleteTarget.name}</strong>?
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type TreeViewProps = {
  data: CategoryNode[] | undefined
  isLoading: boolean
  isError: boolean
  isAdmin: boolean
  onEdit: (c: CategoryOut) => void
  onAddChild: (c: CategoryOut) => void
  onDelete: (c: CategoryOut) => void
}

function CategoryTreeView({
  data,
  isLoading,
  isError,
  isAdmin,
  onEdit,
  onAddChild,
  onDelete,
}: TreeViewProps) {
  const sorted = useMemo(() => {
    if (!data) return []
    return sortNodes(data)
  }, [data])

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 w-full animate-pulse rounded-md bg-muted/60"
              style={{ marginLeft: i % 2 === 0 ? 0 : 24, width: i % 2 === 0 ? '100%' : '90%' }}
            />
          ))}
        </div>
      </div>
    )
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        Falha ao carregar categorias.
      </div>
    )
  }
  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-16 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
          <FolderTree className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Nenhuma categoria nessa aba</p>
          <p className="text-xs text-muted-foreground">
            Crie uma categoria raiz para começar a organizar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-soft overflow-hidden">
      <ul className="divide-y divide-border/40">
        {sorted.map((node) => (
          <CategoryTreeNode
            key={node.id}
            node={node}
            level={0}
            isAdmin={isAdmin}
            onEdit={onEdit}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  )
}

type NodeProps = {
  node: CategoryNode
  level: number
  isAdmin: boolean
  onEdit: (c: CategoryOut) => void
  onAddChild: (c: CategoryOut) => void
  onDelete: (c: CategoryOut) => void
}

function CategoryTreeNode({ node, level, isAdmin, onEdit, onAddChild, onDelete }: NodeProps) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <li>
      <div
        className="group/row flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30"
        style={{ paddingLeft: 16 + level * 24 }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Recolher' : 'Expandir'}
            >
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-200',
                  open && 'rotate-90'
                )}
                strokeWidth={2.25}
              />
            </button>
          ) : (
            <span className="inline-block h-6 w-6" />
          )}

          {node.color ? (
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: node.color,
                boxShadow: `0 0 10px ${node.color}80`,
              }}
              aria-hidden="true"
            />
          ) : (
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-muted ring-1 ring-border"
              aria-hidden="true"
            />
          )}

          {node.icon ? (
            <span className="text-sm leading-none" aria-hidden="true">
              {node.icon}
            </span>
          ) : null}

          <span className="truncate text-sm font-medium">{node.name}</span>

          {hasChildren ? (
            <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              ({node.children.length})
            </span>
          ) : null}
        </div>

        {isAdmin ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 transition-opacity group-hover/row:opacity-100 data-[state=open]:opacity-100"
                aria-label="Ações da categoria"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border/60">
              <DropdownMenuItem onSelect={() => onEdit(node)}>Editar</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAddChild(node)}>
                Adicionar subcategoria
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onDelete(node)}
                className="text-destructive focus:text-destructive"
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {hasChildren && open ? (
        <ul className="divide-y divide-border/40 border-t border-border/40">
          {sortNodes(node.children).map((child) => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function sortNodes(nodes: CategoryNode[]): CategoryNode[] {
  return [...nodes].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
