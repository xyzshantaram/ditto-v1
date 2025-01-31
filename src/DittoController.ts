import { Context, Handler, MiddlewareHandler } from '@hono/hono';
import { every } from '@hono/hono/combine';
import { cors } from '@hono/hono/cors';
import { HandlerResponse } from '@hono/hono/types';
import { NostrEvent, NostrSigner, NStore, NUploader } from '@nostrify/nostrify';
import { Kysely } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';
import { DittoTranslator } from '@/interfaces/DittoTranslator.ts';
import { auth98Middleware, requireProof, requireRole } from '@/middleware/auth98Middleware.ts';
import { cspMiddleware } from '@/middleware/cspMiddleware.ts';
import { paginationMiddleware } from '@/middleware/paginationMiddleware.ts';
import { requireSigner } from '@/middleware/requireSigner.ts';
import { signerMiddleware } from '@/middleware/signerMiddleware.ts';
import { storeMiddleware } from '@/middleware/storeMiddleware.ts';
import { uploaderMiddleware } from '@/middleware/uploaderMiddleware.ts';

interface DittoEnv {
  /** Signer to get the logged-in user's pubkey, relays, and to sign events, or `undefined` if the user isn't logged in. */
  signer?: NostrSigner;
  /** Uploader for the user to upload files. */
  uploader?: NUploader;
  /** NIP-98 signed event proving the pubkey is owned by the user. */
  proof?: NostrEvent;
  /** Kysely instance for the database. */
  kysely: Kysely<DittoTables>;
  /** Storage for the user, might filter out unwanted content. */
  store: NStore;
  /** Normalized pagination params. */
  pagination: { since?: number; until?: number; limit: number };
  /** Normalized list pagination params. */
  listPagination: { offset: number; limit: number };
  /** Translation service. */
  translator?: DittoTranslator;
  /** Signal to abort the request. */
  signal: AbortSignal;
}

interface DittoControllerOpts {
  path?: string;
  requireSigner?: boolean;
  requireProof?: boolean;
  requireRole?: 'admin';
  timeout?: number;
}

// deno-lint-ignore ban-types
type RequireSigner<O extends DittoControllerOpts> = O['requireSigner'] extends true ? { signer: NostrSigner } : {};
// deno-lint-ignore ban-types
type RequireProof<O extends DittoControllerOpts> = O['requireProof'] extends true ? { proof: NostrEvent } : {};

type DittoContext<O extends DittoControllerOpts, P extends string> =
  & DittoEnv
  & Pick<Context<any, P>, 'json' | 'req'>
  & RequireSigner<O>
  & RequireProof<O>;
type DittoHandler<O extends DittoControllerOpts, P extends string> = (c: DittoContext<O, P>) => HandlerResponse<any>;

export class DittoController<
  O extends DittoControllerOpts,
  P extends string = O['path'] extends string ? O['path'] : any,
> {
  private readonly _handler: DittoHandler<O, P>;
  private readonly opts: O;

  constructor(handler: DittoHandler<O, P>);
  constructor(opts: O, handler: DittoHandler<O, P>);
  constructor(arg1: O | DittoHandler<O, P>, arg2?: DittoHandler<O, P>) {
    if (typeof arg1 === 'function') {
      this._handler = arg1;
      this.opts = {} as O;
    } else {
      this._handler = arg2!;
      this.opts = arg1;
    }
  }

  get handler(): Handler {
    const middleware: MiddlewareHandler[] = [
      cspMiddleware(),
      cors({ origin: '*', exposeHeaders: ['link'] }),
      signerMiddleware,
      uploaderMiddleware,
      auth98Middleware(),
      storeMiddleware,
      paginationMiddleware,
    ];

    if (this.opts.requireSigner) {
      middleware.push(requireSigner);
    }

    if (this.opts.requireProof) {
      middleware.push(requireProof());
    }

    if (typeof this.opts.requireRole === 'string') {
      middleware.push(requireRole(this.opts.requireRole));
    }

    const handler: Handler = (c) => {
      return this._handler({
        signer: c.get('signer'),
        proof: c.get('proof'),
        kysely: c.get('kysely'),
        store: c.get('store'),
        pagination: c.get('pagination'),
        listPagination: c.get('listPagination'),
        translator: c.get('translator'),
        uploader: c.get('uploader'),
        req: c.req,
        signal: this.opts.timeout
          ? AbortSignal.any([AbortSignal.timeout(this.opts.timeout), c.req.raw.signal])
          : c.req.raw.signal,
        json: (data) => c.json(data),
      });
    };

    return every(...middleware, handler);
  }
}
