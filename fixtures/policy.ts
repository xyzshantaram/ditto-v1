import { NostrEvent, NostrRelayInfo, NostrRelayOK, NPolicy } from '@nostrify/types';
import { HashtagPolicy } from '@nostrify/policies';

export default class TestPolicy implements NPolicy {
  call(event: NostrEvent): Promise<NostrRelayOK> {
    return new HashtagPolicy(['porn']).call(event);
  }
  info?: NostrRelayInfo | undefined;
}
