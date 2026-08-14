const DEFAULT_PAGE_SIZE = 500

export async function fetchAllPages(createQuery, pageSize = DEFAULT_PAGE_SIZE) {
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await createQuery().range(
      from,
      from + pageSize - 1
    )

    if (error) throw error

    const page = data || []
    rows.push(...page)

    if (page.length < pageSize) break
    from += pageSize
  }

  return rows
}
