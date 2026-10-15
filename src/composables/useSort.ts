import { ref, computed, type Ref } from 'vue'

type SortValue = string | number | null | undefined

/**
 * Click-to-sort for a table. `accessors` maps a column key to the value to sort that column by.
 * Click a header once for ascending, again for descending, a third time to go back to ascending.
 * Empty values always sort last, whichever direction is chosen.
 */
export function useSort<T>(rows: Ref<T[]>, accessors: Record<string, (row: T) => SortValue>) {
  const sortKey = ref<string | null>(null)
  const sortDir = ref<'asc' | 'desc'>('asc')

  function toggle(key: string) {
    if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    else {
      sortKey.value = key
      sortDir.value = 'asc'
    }
  }

  const sorted = computed(() => {
    const key = sortKey.value
    const get = key ? accessors[key] : null
    if (!get) return rows.value
    const dir = sortDir.value === 'asc' ? 1 : -1
    return [...rows.value].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      const ea = va === null || va === undefined || va === ''
      const eb = vb === null || vb === undefined || vb === ''
      if (ea && eb) return 0
      if (ea) return 1
      if (eb) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir
    })
  })

  function indicator(key: string): string {
    if (sortKey.value !== key) return '↕'
    return sortDir.value === 'asc' ? '▲' : '▼'
  }

  function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    if (sortKey.value !== key) return 'none'
    return sortDir.value === 'asc' ? 'ascending' : 'descending'
  }

  return { sorted, sortKey, sortDir, toggle, indicator, ariaSort }
}
