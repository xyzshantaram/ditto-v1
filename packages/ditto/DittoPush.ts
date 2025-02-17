import { type DittoConf } from '@ditto/conf';
import { ApplicationServer, PushMessageOptions, PushSubscriber, PushSubscription } from '@negrel/webpush';
import { type NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';

import { getInstanceMetadata } from '../utils/instance.ts';

interface DittoPushOpts {
  conf: DittoConf;
  store: NStore;
}

export class DittoPush {
  _server: Promise<ApplicationServer | undefined> | undefined;

  constructor(private opts: DittoPushOpts) {}

  get server(): Promise<ApplicationServer | undefined> {
    if (!this._server) {
      this._server = (async () => {
        const { conf } = this.opts;

        const meta = await getInstanceMetadata(this.opts);
        const keys = await conf.vapidKeys;

        if (keys) {
          return await ApplicationServer.new({
            contactInformation: `mailto:${meta.email}`,
            vapidKeys: keys,
          });
        } else {
          logi({
            level: 'warn',
            ns: 'ditto.push',
            msg: 'VAPID keys are not set. Push notifications will be disabled.',
          });
        }
      })();
    }

    return this._server;
  }

  async push(
    subscription: PushSubscription,
    json: object,
    opts: PushMessageOptions = {},
  ): Promise<void> {
    const server = await this.server;

    if (!server) {
      return;
    }

    const subscriber = new PushSubscriber(server, subscription);
    const text = JSON.stringify(json);
    return subscriber.pushTextMessage(text, opts);
  }
}
