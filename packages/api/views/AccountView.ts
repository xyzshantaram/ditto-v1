import { type NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import type { DittoConf } from '@ditto/conf';
import { MastodonAccount } from '@/entities/MastodonAccount.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { metadataSchema } from '@/schemas/nostr.ts';
import { getLnurl } from '@/utils/lnurl.ts';
import { parseNoteContent } from '@/utils/note.ts';
import { getTagSet } from '@/utils/tags.ts';
import { nostrDate, nostrNow, parseNip05 } from '@/utils.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

type ToAccountOpts = {
  withSource: true;
  settingsStore: Record<string, unknown> | undefined;
} | {
  withSource?: false;
};

interface AccountViewOpts {
  conf: DittoConf;
}

export class AccountView {
  constructor(private opts: AccountViewOpts) {}

  render(event: Omit<DittoEvent, 'id' | 'sig'>, pubkey?: string, opts?: ToAccountOpts): MastodonAccount;
  render(event: Omit<DittoEvent, 'id' | 'sig'> | undefined, pubkey: string, opts?: ToAccountOpts): MastodonAccount;
  render(event: Omit<DittoEvent, 'id' | 'sig'> | undefined, pubkey: string, opts: ToAccountOpts = {}): MastodonAccount {
    const { conf } = this.opts;

    if (!event) {
      return this.accountFromPubkey(pubkey, opts);
    }

    const stats = event.author_stats;
    const names = getTagSet(event.user?.tags ?? [], 'n');

    if (names.has('disabled')) {
      const account = this.accountFromPubkey(pubkey, opts);
      account.pleroma.deactivated = true;
      return account;
    }

    const {
      name,
      nip05,
      picture = conf.local('/images/avi.png'),
      banner = conf.local('/images/banner.png'),
      about,
      lud06,
      lud16,
      website,
      fields: _fields,
    } = n.json().pipe(metadataSchema).catch({}).parse(event.content);

    const npub = nip19.npubEncode(pubkey);
    const nprofile = nip19.nprofileEncode({ pubkey, relays: [conf.relay] });
    const parsed05 = stats?.nip05 ? parseNip05(stats.nip05) : undefined;
    const acct = parsed05?.handle || npub;

    const { html } = parseNoteContent(conf, about || '', []);

    const fields = _fields
      ?.slice(0, conf.profileFields.maxFields)
      .map(([name, value]) => ({
        name: name.slice(0, conf.profileFields.nameLength),
        value: value.slice(0, conf.profileFields.valueLength),
        verified_at: null,
      })) ?? [];

    let streakDays = 0;
    let streakStart = stats?.streak_start ?? null;
    let streakEnd = stats?.streak_end ?? null;
    const { streakWindow } = conf;

    if (streakStart && streakEnd) {
      const broken = nostrNow() - streakEnd > streakWindow;
      if (broken) {
        streakStart = null;
        streakEnd = null;
      } else {
        const delta = streakEnd - streakStart;
        streakDays = Math.max(Math.ceil(delta / 86400), 1);
      }
    }

    return {
      id: pubkey,
      acct,
      avatar: picture,
      avatar_static: picture,
      bot: false,
      created_at: nostrDate(event.user?.created_at ?? event.created_at).toISOString(),
      discoverable: true,
      display_name: name ?? '',
      emojis: renderEmojis(event),
      fields: fields.map((field) => ({ ...field, value: parseNoteContent(conf, field.value, []).html })),
      follow_requests_count: 0,
      followers_count: stats?.followers_count ?? 0,
      following_count: stats?.following_count ?? 0,
      fqn: parsed05?.handle || npub,
      header: banner,
      header_static: banner,
      last_status_at: null,
      locked: false,
      note: html,
      roles: [],
      source: opts.withSource
        ? {
          fields,
          language: '',
          note: about || '',
          privacy: 'public',
          sensitive: false,
          follow_requests_count: 0,
          nostr: {
            nip05,
          },
          ditto: {
            captcha_solved: names.has('captcha_solved'),
          },
        }
        : undefined,
      statuses_count: stats?.notes_count ?? 0,
      uri: conf.local(`/users/${acct}`),
      url: conf.local(`/@${acct}`),
      username: parsed05?.nickname || npub.substring(0, 8),
      ditto: {
        accepts_zaps: Boolean(getLnurl({ lud06, lud16 })),
        external_url: conf.external(nprofile),
        streak: {
          days: streakDays,
          start: streakStart ? nostrDate(streakStart).toISOString() : null,
          end: streakEnd ? nostrDate(streakEnd).toISOString() : null,
          expires: streakEnd ? nostrDate(streakEnd + streakWindow).toISOString() : null,
        },
      },
      domain: parsed05?.domain,
      pleroma: {
        deactivated: names.has('disabled'),
        is_admin: names.has('admin'),
        is_moderator: names.has('admin') || names.has('moderator'),
        is_suggested: names.has('suggested'),
        is_local: parsed05?.domain === conf.url.host,
        settings_store: opts.withSource ? opts.settingsStore : undefined,
        tags: [...getTagSet(event.user?.tags ?? [], 't')],
        favicon: stats?.favicon,
      },
      nostr: {
        pubkey,
        lud16,
      },
      website: website && /^https?:\/\//.test(website) ? website : undefined,
    };
  }

  private accountFromPubkey(pubkey: string, opts: ToAccountOpts = {}): MastodonAccount {
    const event: Omit<NostrEvent, 'id' | 'sig'> = {
      kind: 0,
      pubkey,
      content: '',
      tags: [],
      created_at: nostrNow(),
    };

    return this.render(event, pubkey, opts);
  }
}
