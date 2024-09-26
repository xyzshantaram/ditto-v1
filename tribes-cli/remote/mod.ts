import { Subcommand } from '../utils.ts';
import { init } from './init.ts';

export const remote: Record<string, Subcommand> = {
  init: {
    action: init,
    description: 'Initialise a brand new Ditto remote.',
  },
};
