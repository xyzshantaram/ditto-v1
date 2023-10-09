import { type Event } from '@/deps.ts';

import * as eventsDB from '@/db/events.ts';

import type { DittoFilter, GetFiltersOpts } from '@/filter.ts';

/** Get filters from the database and pool, and mix the best results together. */
function getFilters<K extends number>(
  filters: DittoFilter<K>[],
  opts?: GetFiltersOpts,
): Promise<Event<K>[]> {
  if (!filters.length) return Promise.resolve([]);

  return eventsDB.getFilters(filters, opts);
}

export { getFilters };
