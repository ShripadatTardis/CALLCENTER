export const agentsKeys = {
  all: ['agents'] as const,
  lists: () => [...agentsKeys.all, 'list'] as const,
};
