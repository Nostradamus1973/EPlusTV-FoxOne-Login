export interface IFoxOneCategoryEvent {
  tags?: unknown;
  genre_metadata?: {display_name?: unknown} | null;
  sport_uri?: unknown;
  stream_types?: unknown;
  is_uhd?: unknown;
}

/**
 * Classify guide entries using explicit metadata only.
 * SDR is a color range, not a resolution, so it must never imply 4K.
 */
export const normalizeFoxOneStoredCategories = (value: unknown): string[] => {
  const categories = Array.isArray(value)
    ? value.filter((category): category is string => typeof category === 'string' && category.trim().length > 0)
    : [];
  const unique = [...new Set(categories)];
  if (!unique.includes('FOX One')) unique.unshift('FOX One');
  if (!unique.includes('FOX')) unique.push('FOX');
  return unique;
};

export const parseFoxOneCategories = (event: IFoxOneCategoryEvent): string[] => {
  const categories = ['FOX One', 'FOX'];
  const tags = Array.isArray(event.tags)
    ? event.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];
  const genreName =
    event.genre_metadata && typeof event.genre_metadata === 'object'
      ? event.genre_metadata.display_name
      : undefined;
  const genre = typeof genreName === 'string' && genreName.trim().length > 0 ? [genreName] : [];

  categories.push(...tags, ...genre);

  if (typeof event.sport_uri === 'string' && event.sport_uri.trim().length > 0) {
    categories.push(event.sport_uri);
  }

  const streamTypes = Array.isArray(event.stream_types)
    ? event.stream_types.filter((type): type is string => typeof type === 'string').map(type => type.toUpperCase())
    : [];

  if (streamTypes.some(type => type === 'HDR' || type.startsWith('HDR'))) {
    categories.push('HDR');
  }

  if (event.is_uhd === true || streamTypes.some(type => type === 'UHD' || type === '4K')) {
    categories.push('4K');
  }

  return normalizeFoxOneStoredCategories(categories);
};
