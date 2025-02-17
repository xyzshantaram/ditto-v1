import { NSecSigner } from '@nostrify/nostrify';

import type { DittoConf } from '@ditto/conf';

/** Sign events as the Ditto server. */
export class AdminSigner extends NSecSigner {
  constructor(conf: DittoConf) {
    super(conf.seckey);
  }
}
