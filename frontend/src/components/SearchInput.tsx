import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { Input } from './ui/input'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  delay?: number
  'aria-label'?: string
}

/** Local state for instant typing; emits debounced value to the parent (which drives the query). */
export function SearchInput({ value, onChange, placeholder = 'Search…', className, delay = 300, ...rest }: SearchInputProps) {
  const [text, setText] = useState(value)
  const debounced = useDebounce(text, delay)

  useEffect(() => {
    if (debounced !== value) onChange(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  useEffect(() => {
    setText(value) // external reset (e.g. "clear filters")
  }, [value])

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={rest['aria-label'] ?? placeholder}
        className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText('')
            onChange('')
          }}
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
