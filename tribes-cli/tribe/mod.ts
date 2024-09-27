import { create } from './new.ts';
import { config } from './config.ts';
import { Command } from '../utils/mod.ts';

export const tribe = new Command('tribe', 'Create and manage tribes.')
  .subcommand('create', create)
  .subcommand('config', config);
