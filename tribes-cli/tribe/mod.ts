import { create } from './new.ts';
import { config } from './config.ts';
import { Subcommand } from '../utils.ts';

export const tribe: Record<string, Subcommand> = {
  create: {
    action: create,
    description: 'Create a new tribe.',
    options: {
      '-c --custom-domain': {
        description: 'Do not use a subdomain of the tribes server; instead, use a custom domain.',
      },
      '-s --subdomain': {
        description: 'Use a subdomain of the tribes server to host the new Ditto instance.',
      },
    },
  },
};
