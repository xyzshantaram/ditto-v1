import { DittoConf } from '@ditto/conf';
import { NostrEvent, NostrSigner, NStore } from '@nostrify/nostrify';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { nostrDate } from '@/utils.ts';
import { AccountView } from '@/views/mastodon/AccountView.ts';
import { StatusView } from '@/views/mastodon/StatusView.ts';

interface NotificationViewOpts {
  conf: DittoConf;
  store: NStore;
  user?: {
    signer: NostrSigner;
  };
}

export class NotificationView {
  private accountView: AccountView;
  private statusView: StatusView;

  constructor(private opts: NotificationViewOpts) {
    this.accountView = new AccountView(opts);
    this.statusView = new StatusView(opts);
  }

  async render(event: DittoEvent) {
    const { conf, user } = this.opts;

    const viewerPubkey = await user?.signer.getPublicKey();
    const mentioned = !!event.tags.find(([name, value]) => name === 'p' && value === viewerPubkey);

    if (event.kind === 1 && mentioned) {
      return this.renderMention(event);
    }

    if (event.kind === 6) {
      return this.renderReblog(event);
    }

    if (event.kind === 7 && event.content === '+') {
      return this.renderFavourite(event);
    }

    if (event.kind === 7) {
      return this.renderReaction(event);
    }

    if (event.kind === 30360 && event.pubkey === conf.pubkey) {
      return this.renderNameGrant(event);
    }

    if (event.kind === 9735) {
      return this.renderZap(event);
    }
  }

  async renderMention(event: DittoEvent) {
    const status = await this.statusView.render(event);
    if (!status) return;

    return {
      id: this.notificationId(event),
      type: 'mention' as const,
      created_at: nostrDate(event.created_at).toISOString(),
      account: status.account,
      status: status,
    };
  }

  async renderReblog(event: DittoEvent) {
    if (event.repost?.kind !== 1) return;
    const status = await this.statusView.render(event.repost);
    if (!status) return;
    const account = this.accountView.render(event.author, event.pubkey);

    return {
      id: this.notificationId(event),
      type: 'reblog' as const,
      created_at: nostrDate(event.created_at).toISOString(),
      account,
      status,
    };
  }

  async renderFavourite(event: DittoEvent) {
    if (event.reacted?.kind !== 1) return;
    const status = await this.statusView.render(event.reacted);
    if (!status) return;
    const account = this.accountView.render(event.author, event.pubkey);

    return {
      id: this.notificationId(event),
      type: 'favourite' as const,
      created_at: nostrDate(event.created_at).toISOString(),
      account,
      status,
    };
  }

  async renderReaction(event: DittoEvent) {
    if (event.reacted?.kind !== 1) return;
    const status = await this.statusView.render(event.reacted);
    if (!status) return;
    const account = this.accountView.render(event.author, event.pubkey);

    return {
      id: this.notificationId(event),
      type: 'pleroma:emoji_reaction' as const,
      emoji: event.content,
      emoji_url: event.tags.find(([name, value]) => name === 'emoji' && `:${value}:` === event.content)?.[2],
      created_at: nostrDate(event.created_at).toISOString(),
      account,
      status,
    };
  }

  renderNameGrant(event: DittoEvent) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    const account = this.accountView.render(event.author, event.pubkey);

    if (!d) return;

    return {
      id: this.notificationId(event),
      type: 'ditto:name_grant' as const,
      name: d,
      created_at: nostrDate(event.created_at).toISOString(),
      account,
    };
  }

  async renderZap(event: DittoEvent) {
    if (!event.zap_sender) return;

    const { zap_amount = 0, zap_message = '' } = event;
    if (zap_amount < 1) return;

    let zapSender: NostrEvent | undefined;
    let zapSenderPubkey: string;

    if (typeof event.zap_sender === 'string') {
      zapSenderPubkey = event.zap_sender;
    } else {
      zapSender = event.zap_sender;
      zapSenderPubkey = zapSender.pubkey;
    }

    const account = this.accountView.render(zapSender, zapSenderPubkey);

    return {
      id: this.notificationId(event),
      type: 'ditto:zap' as const,
      amount: zap_amount,
      message: zap_message,
      created_at: nostrDate(event.created_at).toISOString(),
      account,
      ...(event.zapped ? { status: await this.statusView.render(event.zapped) } : {}),
    };
  }

  /** This helps notifications be sorted in the correct order. */
  notificationId({ id, created_at }: NostrEvent): string {
    return `${created_at}-${id}`;
  }
}
