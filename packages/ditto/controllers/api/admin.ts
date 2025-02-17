import { NostrFilter } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { booleanParamSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createAdminEvent, paginated, parseBody, updateEventInfo, updateUser } from '../../../utils/api.ts';
import { renderNameRequest } from '@/views/ditto.ts';
import { AdminAccountView } from '@/views/mastodon/AdminAccountView.ts';
import { errorJson } from '../../../utils/log.ts';

const adminAccountQuerySchema = z.object({
  local: booleanParamSchema.optional(),
  remote: booleanParamSchema.optional(),
  active: booleanParamSchema.optional(),
  pending: booleanParamSchema.optional(),
  disabled: booleanParamSchema.optional(),
  silenced: booleanParamSchema.optional(),
  suspended: booleanParamSchema.optional(),
  sensitized: booleanParamSchema.optional(),
  username: z.string().optional(),
  display_name: z.string().optional(),
  by_domain: z.string().optional(),
  email: z.string().optional(),
  ip: z.string().optional(),
  staff: booleanParamSchema.optional(),
});

const adminAccountsController: AppController = async (c) => {
  const { conf, store, pagination, signal } = c.var;

  const {
    local,
    pending,
    disabled,
    silenced,
    suspended,
    sensitized,
    staff,
  } = adminAccountQuerySchema.parse(c.req.query());

  const view = new AdminAccountView(c.var);

  if (pending) {
    if (disabled || silenced || suspended || sensitized) {
      return c.json([]);
    }

    const orig = await store.query(
      [{ kinds: [30383], authors: [conf.pubkey], '#k': ['3036'], '#n': ['pending'], ...pagination }],
      { signal },
    );

    const ids = new Set<string>(
      orig
        .map(({ tags }) => tags.find(([name]) => name === 'd')?.[1])
        .filter((id): id is string => !!id),
    );

    const events = await store
      .query([{ kinds: [3036], ids: [...ids] }])
      .then((events) => hydrateEvents(c.var, events));

    const nameRequests = await Promise.all(events.map(renderNameRequest));
    return paginated(c, orig, nameRequests);
  }

  if (disabled || silenced || suspended || sensitized) {
    const n = [];

    if (disabled) {
      n.push('disabled');
    }
    if (silenced) {
      n.push('silenced');
    }
    if (suspended) {
      n.push('suspended');
    }
    if (sensitized) {
      n.push('sensitized');
    }
    if (staff) {
      n.push('admin');
      n.push('moderator');
    }

    const events = await store.query(
      [{ kinds: [30382], authors: [conf.pubkey], '#n': n, ...pagination }],
      { signal },
    );

    const pubkeys = new Set<string>(
      events
        .map(({ tags }) => tags.find(([name]) => name === 'd')?.[1])
        .filter((pubkey): pubkey is string => !!pubkey),
    );

    const authors = await store
      .query([{ kinds: [0], authors: [...pubkeys] }])
      .then((events) => hydrateEvents(c.var, events));

    const accounts = [...pubkeys].map((pubkey) => {
      const author = authors.find((e) => e.pubkey === pubkey);
      return view.render(author, pubkey);
    });

    return paginated(c, events, accounts);
  }

  const filter: NostrFilter = { kinds: [0], ...pagination };

  if (local) {
    filter.search = `domain:${conf.url.host}`;
  }

  const events = await store
    .query([filter], { signal })
    .then((events) => hydrateEvents(c.var, events));

  const accounts = events.map((event) => view.render(event, event.pubkey));

  return paginated(c, events, accounts);
};

const adminAccountActionSchema = z.object({
  type: z.enum(['none', 'sensitive', 'disable', 'silence', 'suspend', 'revoke_name']),
});

const adminActionController: AppController = async (c) => {
  const authorId = c.req.param('id');

  const { conf, store } = c.var;

  const body = await parseBody(c.req.raw);
  const result = adminAccountActionSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'This action is not allowed' }, 403);
  }

  const { data } = result;

  const n: Record<string, boolean> = {};

  if (data.type === 'sensitive') {
    n.sensitized = true;
  }
  if (data.type === 'disable') {
    n.disabled = true;
  }
  if (data.type === 'silence') {
    n.silenced = true;
  }
  if (data.type === 'suspend') {
    n.disabled = true;
    n.suspended = true;

    store.remove!([{ authors: [authorId] }]).catch((e: unknown) => {
      logi({ level: 'error', ns: 'ditto.api.admin.account.action', type: data.type, error: errorJson(e) });
    });
  }
  if (data.type === 'revoke_name') {
    n.revoke_name = true;

    store.remove!([{ kinds: [30360], authors: [conf.pubkey], '#p': [authorId] }]).catch((e: unknown) => {
      logi({ level: 'error', ns: 'ditto.api.admin.account.action', type: data.type, error: errorJson(e) });
    });
  }

  await updateUser(c.var, authorId, n);

  return c.json({}, 200);
};

const adminApproveController: AppController = async (c) => {
  const eventId = c.req.param('id');

  const { conf, store } = c.var;

  const [event] = await store.query([{ kinds: [3036], ids: [eventId] }]);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const r = event.tags.find(([name]) => name === 'r')?.[1];

  if (!r) {
    return c.json({ error: 'NIP-05 not found' }, 404);
  }

  if (!z.string().email().safeParse(r).success) {
    return c.json({ error: 'Invalid NIP-05' }, 400);
  }

  const [existing] = await store.query([{ kinds: [30360], authors: [conf.pubkey], '#d': [r], limit: 1 }]);

  if (existing) {
    return c.json({ error: 'NIP-05 already granted to another user' }, 400);
  }

  await createAdminEvent(c.var, {
    kind: 30360,
    tags: [
      ['d', r],
      ['L', 'nip05.domain'],
      ['l', r.split('@')[1], 'nip05.domain'],
      ['p', event.pubkey],
      ['e', event.id],
    ],
  });

  await updateEventInfo(c.var, eventId, { pending: false, approved: true, rejected: false });
  await hydrateEvents(c.var, [event]);

  const nameRequest = await renderNameRequest(event);
  return c.json(nameRequest);
};

const adminRejectController: AppController = async (c) => {
  const eventId = c.req.param('id');

  const { store } = c.var;

  const [event] = await store.query([{ kinds: [3036], ids: [eventId] }]);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  await updateEventInfo(c.var, eventId, { pending: false, approved: false, rejected: true });
  await hydrateEvents(c.var, [event]);

  const nameRequest = await renderNameRequest(event);
  return c.json(nameRequest);
};

export { adminAccountsController, adminActionController, adminApproveController, adminRejectController };
