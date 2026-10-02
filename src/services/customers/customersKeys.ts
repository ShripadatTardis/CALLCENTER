export const customersKeys = {
  list: (search: string | undefined, page: number, role: string) =>
    ['customers', 'list', { search, page, role }] as const,
  detail: (id: string, role: string) => ['customers', 'detail', id, role] as const,
  interactions: (id: string, page: number, role: string, pageSize: number) =>
    ['customers', 'interactions', id, page, role, pageSize] as const,
  campaigns: (id: string, role: string) => ['customers', 'campaigns', id, role] as const,
  activities: (id: string, role: string) => ['customers', 'activities', id, role] as const,
};
