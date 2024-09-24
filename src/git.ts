let githash: string | undefined;

try {
  const cmd = new Deno.Command('git', { args: ['rev-parse', 'HEAD'] });
  const out = await cmd.output();
  githash = new TextDecoder().decode(out.stdout).trim();
} catch {
  //
}

export { githash };
