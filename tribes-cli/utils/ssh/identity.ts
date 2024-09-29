import { join } from '@std/path';
import { expandGlob } from '@std/fs/expand-glob';
import question from 'question-deno';

const resolveIdentityFile = async () => {
  const home = Deno.env.get('HOME');
  if (!home) throw new Error('tribes-cli: unable to find default identity file');
  const path = join(home, '.ssh', '*.pub');
  const found: string[] = [];
  for await (const file of expandGlob(path)) {
    try {
      const pkey = file.path.replace(/.pub$/, '');
      const info = await Deno.stat(pkey);
      if (info.isFile) found.push(pkey);
    } catch {}
  }
  if (found.length) {
    const chosen = await question('list', 'There were multiple ssh keys found. Which do you want to use?', [
      ...found,
      'Something else',
    ]);
    if (chosen?.startsWith('/')) return chosen;
  }

  const input = await question('input', 'Enter the path of the ssh identity file to use.');
  try {
    const stat = await Deno.stat(input || '');
    if (stat.isFile) return input!;
  } catch {
    throw new Error(`tribes-cli: could not stat "${input}"`);
  }

  throw new Error('tribes-cli: unable to find valid identity file, or selected path is a directory');
};

export const defaultIdentityFile = async (supplied?: string) => {
  const cached = localStorage.getItem('identity-file-path');
  if (cached && cached !== supplied && await question('confirm', `Found identity file ${cached}. Use it?`)) {
    return cached;
  }

  let identityFile = '';

  if (supplied) {
    try {
      const stat = await Deno.stat(supplied);
      if (stat.isFile) identityFile = supplied;
    } catch {
      throw new Error(`tribes-cli: supplied identity file ${supplied} does not exist or is not a file.`);
    }
  }

  if (!identityFile) identityFile = await resolveIdentityFile();
  localStorage.setItem('identity-file-path', identityFile);

  return identityFile;
};
