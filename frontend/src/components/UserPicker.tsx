import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { api } from '@/lib/api'
import type { Role, UserLite } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Avatar } from './ui/avatar'
import { useFieldWiring } from './ui/form-field'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export type PickedUser = Pick<UserLite, 'id' | 'name'> & Partial<UserLite>

function useUserLookup(search: string, roles?: Role[], enabled = true) {
  return useQuery({
    queryKey: ['user-lookup', search, roles?.join(',') ?? ''],
    queryFn: ({ signal }) =>
      api
        .get<UserLite[]>('/users/lookup/', {
          params: { search: search || undefined, roles: roles?.join(',') || undefined },
          signal,
        })
        .then((r) => r.data),
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

interface BaseProps {
  roles?: Role[]
  /** User ids that can't be picked (e.g. self) */
  excludeIds?: number[]
  placeholder?: string
  disabled?: boolean
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

interface SingleProps extends BaseProps {
  multiple?: false
  value: PickedUser | null
  onChange: (u: PickedUser | null) => void
}

interface MultiProps extends BaseProps {
  multiple: true
  value: PickedUser[]
  onChange: (u: PickedUser[]) => void
}

/** Searchable, keyboard-navigable colleague picker (single or multi). */
export function UserPicker(props: SingleProps | MultiProps) {
  const { roles, excludeIds = [], placeholder = 'Select a person', disabled } = props
  const wiring = useFieldWiring({ id: props.id, 'aria-invalid': props['aria-invalid'], 'aria-describedby': props['aria-describedby'] })
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(0)
  const debounced = useDebounce(search.trim(), 250)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data, isFetching, isPending } = useUserLookup(debounced, roles, open)

  const selectedIds = useMemo(
    () => new Set(props.multiple ? props.value.map((u) => u.id) : props.value ? [props.value.id] : []),
    [props.multiple, props.value],
  )
  const options = (data ?? []).filter((u) => !excludeIds.includes(u.id))

  const toggle = (u: UserLite) => {
    if (props.multiple) {
      props.onChange(selectedIds.has(u.id) ? props.value.filter((v) => v.id !== u.id) : [...props.value, u])
      setSearch('')
      inputRef.current?.focus()
    } else {
      props.onChange(u)
      setOpen(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = options[active]
      if (opt) toggle(opt)
    } else if (e.key === 'Backspace' && !search && props.multiple && props.value.length) {
      props.onChange(props.value.slice(0, -1))
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setSearch('')
          setActive(0)
        }
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          {...wiring}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-left text-sm shadow-xs transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive md:min-h-10',
          )}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {props.multiple ? (
              props.value.length ? (
                props.value.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 rounded-md bg-primary-soft py-0.5 pl-1 pr-1 text-xs font-medium text-primary-soft-foreground">
                    <Avatar name={u.name} seed={u.id} src={u.avatar_url} size="xs" />
                    {u.name}
                    <span
                      title={`Remove ${u.name}`}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        props.onChange(props.value.filter((v) => v.id !== u.id))
                      }}
                      className="ml-0.5 rounded p-0.5 hover:bg-primary/15"
                    >
                      <X className="size-3" />
                    </span>
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )
            ) : props.value ? (
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={props.value.name} seed={props.value.id} src={props.value.avatar_url} size="xs" />
                <span className="truncate">{props.value.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          {!props.multiple && props.value && !disabled ? (
            <span
              title="Clear selection"
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                props.onChange(null)
              }}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </span>
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" onOpenAutoFocus={(e) => {
        e.preventDefault()
        inputRef.current?.focus()
      }}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search by name or email…"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-controls={listId}
            aria-expanded
            aria-autocomplete="list"
            aria-activedescendant={options[active] ? `${listId}-${options[active].id}` : undefined}
          />
          {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        <ul id={listId} role="listbox" aria-multiselectable={props.multiple || undefined} className="max-h-64 overflow-y-auto p-1">
          {isPending ? (
            Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-2.5 px-2.5 py-2" aria-hidden>
                <span className="size-6 animate-shimmer rounded-full bg-muted" />
                <span className="h-3 w-32 animate-shimmer rounded bg-muted" />
              </li>
            ))
          ) : options.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No people found</li>
          ) : (
            options.map((u, i) => {
              const selected = selectedIds.has(u.id)
              return (
                <li
                  key={u.id}
                  id={`${listId}-${u.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(u)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm md:min-h-10',
                    i === active && 'bg-accent',
                  )}
                >
                  <Avatar name={u.name} seed={u.id} src={u.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.designation || u.email}</span>
                  </span>
                  {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                </li>
              )
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
