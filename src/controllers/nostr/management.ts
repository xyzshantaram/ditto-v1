import { AppController } from '@/app.ts';

export const managementController: AppController = (c) => {
  return c.json({ error: 'Not found' }, 404);
};
