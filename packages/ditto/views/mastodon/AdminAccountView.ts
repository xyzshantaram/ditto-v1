import { DittoConf } from '@ditto/conf';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getTagSet } from '@/utils/tags.ts';
import { AccountView } from '@/views/mastodon/AccountView.ts';

interface AdminAccountViewOpts {
  conf: DittoConf;
}

export class AdminAccountView {
  private accountView: AccountView;

  constructor(opts: AdminAccountViewOpts) {
    this.accountView = new AccountView(opts);
  }

  /** Expects a kind 0 fully hydrated */
  render(event: DittoEvent | undefined, pubkey: string) {
    if (!event) {
      return this.renderAdminAccountFromPubkey(pubkey);
    }

    const account = this.accountView.render(event, pubkey);
    const names = getTagSet(event.user?.tags ?? [], 'n');

    let role = 'user';

    if (names.has('admin')) {
      role = 'admin';
    }
    if (names.has('moderator')) {
      role = 'moderator';
    }

    return {
      id: account.id,
      username: account.username,
      domain: account.acct.split('@')[1] || null,
      created_at: account.created_at,
      email: '',
      ip: null,
      ips: [],
      locale: '',
      invite_request: null,
      role,
      confirmed: true,
      approved: true,
      disabled: names.has('disabled'),
      silenced: names.has('silenced'),
      suspended: names.has('suspended'),
      sensitized: names.has('sensitized'),
      account,
    };
  }

  /** Expects a target pubkey */
  private renderAdminAccountFromPubkey(pubkey: string) {
    const account = this.accountView.render(undefined, pubkey);

    return {
      id: account.id,
      username: account.username,
      domain: account.acct.split('@')[1] || null,
      created_at: account.created_at,
      email: '',
      ip: null,
      ips: [],
      locale: '',
      invite_request: null,
      role: 'user',
      confirmed: true,
      approved: true,
      disabled: false,
      silenced: false,
      suspended: false,
      account,
    };
  }
}
