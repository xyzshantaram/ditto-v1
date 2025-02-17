import { DittoConf } from '@ditto/conf';
import { JsonParseStream } from '@std/json/json-parse-stream';
import { TextLineStream } from '@std/streams/text-line-stream';

import { AdminSigner } from '../packages/ditto/signers/AdminSigner.ts';
import { DittoStorages } from '../packages/ditto/DittoStorages.ts';
import { type EventStub } from '../packages/utils/api.ts';
import { nostrNow } from '../packages/ditto/utils.ts';

const conf = new DittoConf(Deno.env);
const signer = new AdminSigner(conf);
const storages = new DittoStorages(conf);
const store = await storages.db();

const readable = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream())
  .pipeThrough(new JsonParseStream());

for await (const t of readable) {
  const event = await signer.signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t as EventStub,
  });

  await store.event(event);
}

Deno.exit(0);
