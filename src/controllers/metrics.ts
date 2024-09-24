import { register } from 'prom-client';

import { AppController } from '@/app.ts';
import { githash } from '@/git.ts';
import { dbAvailableConnectionsGauge, dbPoolSizeGauge, deploymentsCounter } from '@/metrics.ts';
import { Storages } from '@/storages.ts';

if (githash) {
  deploymentsCounter.inc({ git_hash: githash });
}

/** Prometheus/OpenMetrics controller. */
export const metricsController: AppController = async (c) => {
  const db = await Storages.database();

  // Update some metrics at request time.
  dbPoolSizeGauge.set(db.poolSize);
  dbAvailableConnectionsGauge.set(db.availableConnections);

  const metrics = await register.metrics();

  const headers: HeadersInit = {
    'Content-Type': register.contentType,
  };

  return c.text(metrics, 200, headers);
};
