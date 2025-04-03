import {
  AntiDuplicationPolicy,
  AuthorPolicy,
  DomainPolicy,
  FiltersPolicy,
  HashtagPolicy,
  HellthreadPolicy,
  KeywordPolicy,
  OpenAIPolicy,
  PowPolicy,
  PubkeyBanPolicy,
  RegexPolicy,
  ReplyBotPolicy,
  SizePolicy,
  WhitelistPolicy,
  WoTPolicy,
} from '@nostrify/policies';
import { FieldItem, zodSchemaToFields } from './parameters.ts';
import { NPolicy, NStore } from '@nostrify/types';
import {
  AntiDuplicationPolicyOpts,
  AntiDuplicationPolicyOptsSchema,
  DomainPolicyOptsSchema,
  FiltersPolicyOptsSchema,
  HashtagPolicyOptsSchema,
  HellthreadPolicyOptsSchema,
  KeywordPolicyOptsSchema,
  OpenAIPolicyOptsSchema,
  PowPolicyOptsSchema,
  PubkeyBanPolicyOptsSchema,
  RegexPolicyOptsSchema,
  ReplyBotPolicyOptsSchema,
  SizePolicyOptsSchema,
  WhitelistPolicyOptsSchema,
  WoTPolicyOptsSchema,
} from '@/utils/policies/schemas.ts';
import { normalizeNpub, PolicyParams } from '@/utils/policies/mod.ts';

export interface PolicyItem {
  instantiate: (params: PolicyParams) => NPolicy;
  name: string;
  parameters: Record<string, FieldItem>;
  description: string;
}

export interface PolicyRegistryOpts {
  antiDuplicationPolicyStore?: AntiDuplicationPolicyOpts['kv'];
  store: NStore;
}

export class PolicyRegistry {
  constructor(private opts: PolicyRegistryOpts) { }

  available: Record<string, PolicyItem> = {
    'AntiDuplicationPolicy': {
      instantiate: (params) => {
        const parsed = AntiDuplicationPolicyOptsSchema.parse(params);
        if (!this.opts.antiDuplicationPolicyStore) {
          throw new Error('AntiDuplicationPolicy: tried to instantiate store but no store supplied!');
        }
        return new AntiDuplicationPolicy({
          kv: this.opts.antiDuplicationPolicyStore,
          ...parsed,
        });
      },
      description: 'Prevent messages with the exact same content from being submitted repeatedly.',
      name: 'Deduplicate messages',
      parameters: zodSchemaToFields(AntiDuplicationPolicyOptsSchema),
    },
    'AuthorPolicy': {
      instantiate: () => {
        return new AuthorPolicy(this.opts.store);
      },
      description: 'Rejects events by authors without a kind 0 event associated with their pubkey.',
      name: 'Block events without associated profiles',
      parameters: {},
    },
    'DomainPolicy': {
      instantiate: (params) => {
        const parsed = DomainPolicyOptsSchema.parse(params);
        return new DomainPolicy(this.opts.store, parsed);
      },
      description: 'Ban events by pubkeys without a valid NIP-05 domain. Domains can also be whitelisted/blacklisted',
      name: 'Filter by NIP-05',
      parameters: zodSchemaToFields(DomainPolicyOptsSchema),
    },
    'FiltersPolicy': {
      instantiate: (params) => {
        if (!params.filters || !Array.isArray(params.filters)) throw new Error('Invalid params to FiltersPolicy');
        const filters = params.filters.map((item) => {
          if (typeof item === 'number') return;
          try {
            return JSON.parse(item);
          } catch {
            return;
          }
        }).filter(Boolean);
        const parsed = FiltersPolicyOptsSchema.parse({ filters });
        return new FiltersPolicy(parsed.filters);
      },
      description: 'Only allow events matching a given Nostr filter',
      name: 'Filter by Nostr filter',
      parameters: zodSchemaToFields(FiltersPolicyOptsSchema),
    },
    'HashtagPolicy': {
      instantiate: (params) => {
        const parsed = HashtagPolicyOptsSchema.parse(params);
        return new HashtagPolicy(parsed.hashtags);
      },
      description: 'Ban events containing the specified hashtags',
      name: 'Ban hashtags',
      parameters: zodSchemaToFields(HashtagPolicyOptsSchema),
    },
    'HellthreadPolicy': {
      instantiate: (params) => {
        const parsed = HellthreadPolicyOptsSchema.parse(params);
        return new HellthreadPolicy({
          ...parsed,
        });
      },
      description: "Prevent 'hellthreads' - notes that tag hundreds of people to cause a nuisance and server load.",
      name: 'Limit events with excessive mentions',
      parameters: zodSchemaToFields(HellthreadPolicyOptsSchema),
    },
    'KeywordPolicy': {
      instantiate: (params) => {
        const parsed = KeywordPolicyOptsSchema.parse(params);
        return new KeywordPolicy(parsed.keywords);
      },
      description: 'Ban events that contain specified keywords.',
      name: 'Block certain words',
      parameters: zodSchemaToFields(KeywordPolicyOptsSchema),
    },
    'OpenAIPolicy': {
      instantiate: (params) => {
        const parsed = OpenAIPolicyOptsSchema.parse(params);
        return new OpenAIPolicy({
          ...parsed,
        });
      },
      description: "Use OpenAI moderation integration to block posts that don't meet your community guidelines.",
      name: 'Use OpenAI moderation',
      parameters: zodSchemaToFields(OpenAIPolicyOptsSchema),
    },
    'PowPolicy': {
      instantiate: (params) => {
        const parsed = PowPolicyOptsSchema.parse(params);
        return new PowPolicy({
          ...parsed,
        });
      },
      description: 'Use proof-of-work to limit events from spammers.',
      name: 'Require proof-of-work for events',
      parameters: zodSchemaToFields(PowPolicyOptsSchema),
    },
    'PubkeyBanPolicy': {
      instantiate: (params) => {
        const parsed = PubkeyBanPolicyOptsSchema.parse(params);
        return new PubkeyBanPolicy(parsed.pubkeys.map(normalizeNpub));
      },
      description: 'Ban events from certain pubkeys',
      name: 'Ban certain pubkeys',
      parameters: zodSchemaToFields(PubkeyBanPolicyOptsSchema),
    },
    'RegexPolicy': {
      instantiate: (params) => {
        const parsed = RegexPolicyOptsSchema.parse(params);
        return new RegexPolicy(new RegExp(parsed.expr, parsed.flags));
      },
      description: 'Ban events that match a certain regular expression.',
      name: 'Filter by regex',
      parameters: zodSchemaToFields(RegexPolicyOptsSchema),
    },
    'ReplyBotPolicy': {
      instantiate: (params) => {
        const parsed = ReplyBotPolicyOptsSchema.parse(params);
        return new ReplyBotPolicy({
          store: this.opts.store,
          ...parsed,
        });
      },
      description: 'Block events that reply too quickly to other events.',
      name: 'Block reply spambots',
      parameters: zodSchemaToFields(ReplyBotPolicyOptsSchema),
    },
    'SizePolicy': {
      instantiate: (params) => {
        const parsed = SizePolicyOptsSchema.parse(params);
        return new SizePolicy({
          ...parsed,
        });
      },
      description: 'Restrict events that are too big in size.',
      name: 'Block events by size',
      parameters: zodSchemaToFields(SizePolicyOptsSchema),
    },
    'WhitelistPolicy': {
      instantiate: (params) => {
        const parsed = WhitelistPolicyOptsSchema.parse(params);
        return new WhitelistPolicy(parsed.pubkeys.map(normalizeNpub));
      },
      description: 'Allow only whitelisted pubkeys to post. All other events are rejected.',
      name: 'Whitelist people',
      parameters: zodSchemaToFields(WhitelistPolicyOptsSchema),
    },
    'WoTPolicy': {
      instantiate: (params) => {
        const parsed = WoTPolicyOptsSchema.parse(params);
        return new WoTPolicy({
          store: this.opts.store,
          ...parsed,
        });
      },
      description: 'Use a web-of-trust to only allow users a certain distance from trusted users to publish posts.',
      name: 'Build a web-of-trust',
      parameters: zodSchemaToFields(WoTPolicyOptsSchema),
    },
  };
}
