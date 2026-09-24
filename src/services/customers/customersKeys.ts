export const customersKeys = {
  list: (search: string | undefined, page: number, role: string) =>
    ['customers', 'list', { search, page, role }] as const,
  detail: (id: string, role: string) => ['customers', 'detail', id, role] as const,
  interactions: (id: string, page: number, role: string) =>
    ['customers', 'interactions', id, page, role] as const,
};
