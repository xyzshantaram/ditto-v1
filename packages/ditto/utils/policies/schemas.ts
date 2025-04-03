import { NostrEvent, NProfilePointer, NStore } from '@nostrify/types';
import { z } from 'zod';
import { NSchema as n } from '@nostrify/nostrify';

/** Options for the `WoTPolicy`. */
export const WoTPolicyOptsSchema = z.object({
  pubkeys: z.array(z.string()),
  depth: z.number().default(2),
});

export interface WoTPolicyOpts extends z.TypeOf<typeof WoTPolicyOptsSchema> {
  store: NStore;
}

/** Options for `FiltersPolicy`. */
export const FiltersPolicyOptsSchema = z.object({
  filters: z.array(n.filter()),
});

interface FiltersPolicyOpts extends z.TypeOf<typeof FiltersPolicyOptsSchema> { }

/** Options for `HashtagPolicy`. */
export const HashtagPolicyOptsSchema = z.object({
  hashtags: z.array(z.string()).describe('Banned hashtags (case-insensitive)'),
});

export interface HashtagPolicyOpts extends z.TypeOf<typeof HashtagPolicyOptsSchema> { }

/** Options for `WhitelistPolicy`. */
export const WhitelistPolicyOptsSchema = z.object({
  pubkeys: z.array(z.string()).describe('Allowed pubkeys'),
});

export interface WhitelistPolicyOpts extends z.TypeOf<typeof WhitelistPolicyOptsSchema> { }

/** Options for `RegexPolicy`. */
export const RegexPolicyOptsSchema = z.object({
  expr: z.string().describe('Expression'),
  flags: z.string().optional().describe('Additional RegExp flags. Leave blank if unsure.'),
});

export interface RegexPolicyOpts extends Partial<z.TypeOf<typeof RegexPolicyOptsSchema>> {
  expr: string;
}

/** Options for `KeywordPolicy`. */
export const KeywordPolicyOptsSchema = z.object({
  keywords: z.array(z.string()).describe('Banned keywords (case-insensitive)'),
});

export interface KeywordPolicyOpts extends z.TypeOf<typeof KeywordPolicyOptsSchema> { }

/** Options for `DomainPolicy`. */
export const DomainPolicyOptsSchema = z.object({
  blacklist: z.array(z.string()).default([]).describe('Domains to blacklist'),
  whitelist: z.array(z.string()).optional().describe('Domains to whitelist'),
});

export interface DomainPolicyOpts extends Partial<z.TypeOf<typeof DomainPolicyOptsSchema>> {
  lookup?(nip05: string, signal?: AbortSignal): Promise<NProfilePointer>;
  store: NStore;
}

/** Options for `PubkeyBanPolicy`. */
export const PubkeyBanPolicyOptsSchema = z.object({
  pubkeys: z.array(z.string()).describe('Banned pubkeys'),
});

export interface PubkeyBanPolicyOpts extends z.TypeOf<typeof PubkeyBanPolicyOptsSchema> { }

/** Options for `OpenAIPolicy`. */
export const OpenAIPolicyOptsSchema = z.object({
  endpoint: z.string().default('https://api.openai.com/v1/moderations').describe('OpenAI API endpoint'),
  kinds: z.array(z.number()).default([1, 30023]).describe('Event kinds to filter through the policy'),
  apiKey: z.string().describe('OpenAI API key'),
});

interface OpenAIModerationResult {
  id: string;
  model: string;
  results: {
    categories: {
      'hate': boolean;
      'hate/threatening': boolean;
      'self-harm': boolean;
      'sexual': boolean;
      'sexual/minors': boolean;
      'violence': boolean;
      'violence/graphic': boolean;
    };
    category_scores: {
      'hate': number;
      'hate/threatening': number;
      'self-harm': number;
      'sexual': number;
      'sexual/minors': number;
      'violence': number;
      'violence/graphic': number;
    };
    flagged: boolean;
  }[];
}

export interface OpenAIPolicyOpts extends Partial<z.TypeOf<typeof OpenAIPolicyOptsSchema>> {
  apiKey: string;
  handler?(event: NostrEvent, result: OpenAIModerationResult): boolean;
  fetch?: typeof fetch;
}

/** Options for `ReplyBotPolicy`. */
export const ReplyBotPolicyOptsSchema = z.object({
  threshold: z.number().default(1).describe('Minimum time in seconds between two posts.'),
  kinds: z.array(z.number()).default([1]).describe('Event kinds to filter'),
});

export interface ReplyBotPolicyOpts extends Partial<z.TypeOf<typeof ReplyBotPolicyOptsSchema>> {
  store: NStore;
}

/** Options for `SizePolicy`. */
export const SizePolicyOptsSchema = z.object({
  maxBytes: z.number().default(8 * 1024).describe('Max allowed message size in bytes'),
});

export interface SizePolicyOpts extends Partial<z.TypeOf<typeof SizePolicyOptsSchema>> { }

/** Options for `AntiDuplicationPolicy`. */
export const AntiDuplicationPolicyOptsSchema = z.object({
  expireIn: z.number().default(60000).describe('How long should we wait before an identical message can be reposted?'),
  minLength: z.number().default(50).describe('Minimum length for filtered messages'),
});

export interface AntiDuplicationPolicyOpts extends Partial<z.TypeOf<typeof AntiDuplicationPolicyOptsSchema>> {
  kv: Pick<Deno.Kv, 'get' | 'set'>;
  deobfuscate?(event: NostrEvent): string;
}

/** Options for `HellthreadPolicy`. */
export const HellthreadPolicyOptsSchema = z.object({
  limit: z.number().default(100).describe('Maximum number of mentions to allow per post'),
});

export interface HellthreadPolicyOpts extends Partial<z.TypeOf<typeof HellthreadPolicyOptsSchema>> { }

/** Options for `PowPolicy`. */
export const PowPolicyOptsSchema = z.object({
  difficulty: z.number().default(1).describe('Number of bits of proof-of-work to require'),
});

export interface PowPolicyOpts extends Partial<z.TypeOf<typeof PowPolicyOptsSchema>> { }
