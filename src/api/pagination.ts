export interface PageRequest {
  page?: number
  pageSize?: number
}

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function fetchAllPages<T>(
  fetchPage: (params: Required<PageRequest>) => Promise<PageResponse<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const first = await fetchPage({ page: 1, pageSize })
  const items = [...first.items]
  const totalPages = first.totalPages > 0
    ? first.totalPages
    : first.total > 0
      ? Math.ceil(first.total / pageSize)
      : items.length > 0
        ? 1
        : 0

  for (let page = 2; page <= totalPages; page++) {
    const response = await fetchPage({ page, pageSize })
    if (response.items.length === 0) break
    items.push(...response.items)
  }

  return items
}
