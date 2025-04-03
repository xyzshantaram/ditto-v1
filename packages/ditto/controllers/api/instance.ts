import denoJson from 'deno.json' with { type: 'json' };

import { AppController } from '@/app.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { logi } from '@soapbox/logi';

const version = `3.0.0 (compatible; Ditto ${denoJson.version})`;

const features = [
  'exposable_reactions',
  'mastodon_api',
  'mastodon_api_streaming',
  'pleroma_custom_emoji_reactions',
  'pleroma_emoji_reactions',
  'quote_posting',
  'v2_suggestions',
];

const cache = (f: () => Promise<number | undefined>, interval: number) => {
  let lastCheck = 0;
  let value: number | undefined;

  return async () => {
    const now = Date.now();
    if (value === undefined || now - lastCheck > interval) {
      lastCheck = now;
      try {
        value = await f();
      } catch (error) {
        logi({
          level: 'error',
          ns: 'ditto.routes.instanceV1',
          message: `Error fetching cached value: ${error}`,
        });
        value = undefined; // Ensure we retry next time
      }
    }
    return value ?? 0; // Prevent returning undefined
  };
};

const instanceV1Controller: AppController = async (c) => {
  const { conf, db } = c.var;
  const { host, protocol } = conf.url;
  const meta = await getInstanceMetadata(c.var);

  /** Protocol to use for WebSocket URLs, depending on the protocol of the `LOCAL_DOMAIN`. */
  const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';
  const MINS_10 = 10 * 60 * 1000;

  const userCount = cache(async () => {
    return await db.kysely
      .selectFrom('author_stats')
      .where('nip05_domain', '=', host)
      .select(({ fn }) => fn.count<number>('pubkey').distinct().as('users'))
      .executeTakeFirst().then((obj) => obj?.users || 0);
  }, MINS_10);

  const domainCount = cache(async () => {
    return await db.kysely
      .selectFrom('author_stats')
      .select(({ fn }) => fn.count<number>('nip05_domain').distinct().as('domains'))
      .executeTakeFirst().then((obj) => obj?.domains || 0);
  }, MINS_10);

  const statusCount = cache(async () => {
    return await db.kysely
      .selectFrom('nostr_events')
      .where('kind', '=', 1)
      .select(({ fn }) => fn.countAll<number>().as('events'))
      .executeTakeFirst().then((obj) => obj?.events || 0);
  }, MINS_10);

  return c.json({
    uri: host,
    title: meta.name,
    description: meta.about,
    short_description: meta.tagline,
    registrations: true,
    max_toot_chars: conf.postCharLimit,
    configuration: {
      media_attachments: {
        image_size_limit: 100000000,
        video_size_limit: 100000000,
      },
      polls: {
        max_characters_per_option: 0,
        max_expiration: 0,
        max_options: 0,
        min_expiration: 0,
      },
      statuses: {
        max_characters: conf.postCharLimit,
        max_media_attachments: 20,
      },
    },
    pleroma: {
      metadata: {
        features,
        fields_limits: {
          max_fields: conf.profileFields.maxFields,
          name_length: conf.profileFields.nameLength,
          value_length: conf.profileFields.valueLength,
        },
      },
    },
    languages: ['en'],
    stats: {
      domain_count: Number(await domainCount()),
      status_count: Number(await statusCount()),
      user_count: Number(await userCount()),
    },
    urls: {
      streaming_api: `${wsProtocol}//${host}`,
    },
    version,
    email: meta.email,
    nostr: {
      pubkey: await conf.signer.getPublicKey(),
      relay: `${wsProtocol}//${host}/relay`,
    },
    rules: [],
  });
};

const instanceV2Controller: AppController = async (c) => {
  const { conf } = c.var;
  const { host, protocol } = conf.url;
  const meta = await getInstanceMetadata(c.var);

  /** Protocol to use for WebSocket URLs, depending on the protocol of the `LOCAL_DOMAIN`. */
  const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';

  return c.json({
    domain: host,
    title: meta.name,
    version,
    source_url: 'https://gitlab.com/soapbox-pub/ditto',
    description: meta.about,
    usage: {
      users: {
        active_month: 0,
      },
    },
    thumbnail: {
      url: meta.picture,
      blurhash: '',
      versions: {
        '@1x': meta.picture,
        '@2x': meta.picture,
      },
    },
    screenshots: meta.screenshots,
    short_description: meta.tagline,
    languages: [
      'en',
    ],
    configuration: {
      urls: {
        streaming: `${wsProtocol}//${host}`,
      },
      vapid: {
        public_key: await conf.vapidPublicKey,
      },
      accounts: {
        max_featured_tags: 10,
        max_pinned_statuses: 5,
      },
      statuses: {
        max_characters: conf.postCharLimit,
        max_media_attachments: 20,
        characters_reserved_per_url: 23,
      },
      media_attachments: {
        image_size_limit: 16777216,
        image_matrix_limit: 33177600,
        video_size_limit: 103809024,
        video_frame_rate_limit: 120,
        video_matrix_limit: 8294400,
      },
      polls: {
        max_options: 4,
        max_characters_per_option: 50,
        min_expiration: 300,
        max_expiration: 2629746,
      },
      translation: {
        enabled: Boolean(conf.translationProvider),
      },
    },
    nostr: {
      pubkey: await conf.signer.getPublicKey(),
      relay: `${wsProtocol}//${host}/relay`,
    },
    pleroma: {
      metadata: {
        features,
        fields_limits: {
          max_fields: conf.profileFields.maxFields,
          name_length: conf.profileFields.nameLength,
          value_length: conf.profileFields.valueLength,
        },
      },
    },
    registrations: {
      enabled: true,
      approval_required: false,
      message: null,
      url: null,
    },
    rules: [],
  });
};

const instanceDescriptionController: AppController = async (c) => {
  const meta = await getInstanceMetadata(c.var);

  return c.json({
    content: meta.about,
    updated_at: new Date((meta.event?.created_at ?? 0) * 1000).toISOString(),
  });
};

export { instanceDescriptionController, instanceV1Controller, instanceV2Controller };
