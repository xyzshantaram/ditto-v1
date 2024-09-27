import { Command } from '../utils/mod.ts';
import { init } from './init.ts';

export const remote = new Command('remote', 'Manage a Ditto Tribes server')
  .subcommand(init);
