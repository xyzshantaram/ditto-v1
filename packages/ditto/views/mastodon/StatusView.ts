import { DittoConf } from '@ditto/conf';
import { NostrEvent, NostrSigner, NStore } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { MastodonAttachment } from '@/entities/MastodonAttachment.ts';
import { MastodonMention } from '@/entities/MastodonMention.ts';
import { MastodonStatus } from '@/entities/MastodonStatus.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { nostrDate } from '@/utils.ts';
import { getMediaLinks, parseNoteContent, stripimeta } from '@/utils/note.ts';
import { findReplyTag } from '@/utils/tags.ts';
import { unfurlCardCached } from '@/utils/unfurl.ts';
import { AccountView } from '@/views/mastodon/AccountView.ts';
import { renderAttachment } from '@/views/mastodon/attachments.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

interface RenderStatusOpts {
  depth?: number;
}

interface StatusViewOpts {
  conf: DittoConf;
  store: NStore;
  user?: {
    signer: NostrSigner;
  };
}

export class StatusView {
  private accountView: AccountView;

  constructor(private opts: StatusViewOpts) {
    this.accountView = new AccountView(opts);
  }

  async render(event: DittoEvent, opts?: RenderStatusOpts): Promise<MastodonStatus | undefined> {
    if (event.kind === 6) {
      return await this.renderReblog(event, opts);
    }
    return await this.renderStatus(event, opts);
  }

  async renderStatus(event: DittoEvent, opts?: RenderStatusOpts): Promise<MastodonStatus | undefined> {
    const { conf, store, user } = this.opts;
    const { depth = 1 } = opts ?? {};

    if (depth > 2 || depth < 0) return;

    const nevent = nip19.neventEncode({
      id: event.id,
      author: event.pubkey,
      kind: event.kind,
      relays: [conf.relay],
    });

    const account = this.accountView.render(event.author, event.pubkey);

    const viewerPubkey = await user?.signer.getPublicKey();

    const replyId = findReplyTag(event.tags)?.[1];

    const mentions = event.mentions?.map((event) => this.renderMention(event)) ?? [];

    const { html, links, firstUrl } = parseNoteContent(conf, stripimeta(event.content, event.tags), mentions);

    const [card, relatedEvents] = await Promise
      .all([
        firstUrl ? unfurlCardCached(conf, firstUrl, AbortSignal.timeout(500)) : null,
        viewerPubkey
          ? await store.query([
            { kinds: [6], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
            { kinds: [7], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
            { kinds: [9734], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
            { kinds: [10001], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
            { kinds: [10003], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
          ])
          : [],
      ]);

    const reactionEvent = relatedEvents.find((event) => event.kind === 7);
    const repostEvent = relatedEvents.find((event) => event.kind === 6);
    const pinEvent = relatedEvents.find((event) => event.kind === 10001);
    const bookmarkEvent = relatedEvents.find((event) => event.kind === 10003);
    const zapEvent = relatedEvents.find((event) => event.kind === 9734);

    const compatMentions = this.buildInlineRecipients(mentions.filter((m) => {
      if (m.id === account.id) return false;
      if (html.includes(m.url)) return false;
      return true;
    }));

    const cw = event.tags.find(([name]) => name === 'content-warning');
    const subject = event.tags.find(([name]) => name === 'subject');

    const imeta: string[][][] = event.tags
      .filter(([name]) => name === 'imeta')
      .map(([_, ...entries]) =>
        entries.map((entry) => {
          const split = entry.split(' ');
          return [split[0], split.splice(1).join(' ')];
        })
      );

    const media = imeta.length ? imeta : getMediaLinks(links);

    /** Pleroma emoji reactions object. */
    const reactions = Object.entries(event.event_stats?.reactions ?? {}).reduce((acc, [emoji, count]) => {
      if (['+', '-'].includes(emoji)) return acc;
      acc.push({ name: emoji, count, me: reactionEvent?.content === emoji });
      return acc;
    }, [] as { name: string; count: number; me: boolean }[]);

    const expiresAt = new Date(Number(event.tags.find(([name]) => name === 'expiration')?.[1]) * 1000);

    return {
      id: event.id,
      account,
      card,
      content: compatMentions + html,
      created_at: nostrDate(event.created_at).toISOString(),
      in_reply_to_id: replyId ?? null,
      in_reply_to_account_id: null,
      sensitive: !!cw,
      spoiler_text: (cw ? cw[1] : subject?.[1]) || '',
      visibility: 'public',
      language: event.language ?? null,
      replies_count: event.event_stats?.replies_count ?? 0,
      reblogs_count: event.event_stats?.reposts_count ?? 0,
      favourites_count: event.event_stats?.reactions['+'] ?? 0,
      zaps_amount: event.event_stats?.zaps_amount ?? 0,
      favourited: reactionEvent?.content === '+',
      reblogged: Boolean(repostEvent),
      muted: false,
      bookmarked: Boolean(bookmarkEvent),
      pinned: Boolean(pinEvent),
      reblog: null,
      application: null,
      media_attachments: media
        .map((m) => renderAttachment({ tags: m }))
        .filter((m): m is MastodonAttachment => Boolean(m)),
      mentions,
      tags: [],
      emojis: renderEmojis(event),
      poll: null,
      quote: !event.quote ? null : await this.renderStatus(event.quote, { depth: depth + 1 }),
      quote_id: event.quote?.id ?? null,
      uri: conf.local(`/users/${account.acct}/statuses/${event.id}`),
      url: conf.local(`/@${account.acct}/${event.id}`),
      zapped: Boolean(zapEvent),
      ditto: {
        external_url: conf.external(nevent),
      },
      pleroma: {
        emoji_reactions: reactions,
        expires_at: !isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : undefined,
        quotes_count: event.event_stats?.quotes_count ?? 0,
      },
    };
  }

  async renderReblog(event: DittoEvent, opts?: RenderStatusOpts): Promise<MastodonStatus | undefined> {
    if (!event.repost) return;

    const status = await this.renderStatus(event, opts);
    if (!status) return;

    const reblog = await this.renderStatus(event.repost, opts) ?? null;

    return {
      ...status,
      in_reply_to_id: null,
      in_reply_to_account_id: null,
      reblog,
    };
  }

  renderMention(event: NostrEvent): MastodonMention {
    const account = this.accountView.render(event, event.pubkey);
    return {
      id: account.id,
      acct: account.acct,
      username: account.username,
      url: account.url,
    };
  }

  buildInlineRecipients(mentions: MastodonMention[]): string {
    if (!mentions.length) return '';

    const elements = mentions.reduce<string[]>((acc, { url, username }) => {
      const name = nip19.BECH32_REGEX.test(username) ? username.substring(0, 8) : username;
      acc.push(
        `<span class="h-card"><a class="u-url mention" href="${url}" rel="ugc">@<span>${name}</span></a></span>`,
      );
      return acc;
    }, []);

    return `<span class="recipients-inline">${elements.join(' ')} </span>`;
  }
}
