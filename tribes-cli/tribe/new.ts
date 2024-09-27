import { Command } from '../utils/mod.ts';

export const create = new Command('create', 'Create a new tribe.')
  .option('-c --custom-domain', {
    description: 'Do not use a subdomain of the tribes server; instead, use a custom domain.',
  })
  .option('-s --subdomain', {
    description: 'Use a subdomain of the tribes server to host the new Ditto instance.',
  });
