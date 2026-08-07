import type { ToolPart, RawOrigin } from '../components/tool-types';
import type { AttachmentData } from '../components/attachment-types';
import type { CardEnvelope } from '../primitives/card-contract';

/** Re-exported so consumers of chat-types (and MessagePart) can keep using
 *  RawOrigin unqualified. It is defined in components/tool-types.ts, not here,
 *  to keep the components -> elements import direction one-way. */
export type { RawOrigin };

/** The five built-in action buttons (each carries its own curated icon + label). */
export type ChatMessageAction = 'copy' | 'like' | 'dislike' | 'regenerate' | 'edit';

/** A like/dislike feedback vote on an assistant message. */
export type FeedbackVote = 'like' | 'dislike';

/** A host-defined action button. `icon` is a curated registry name (see
 *  `src/ui/action-icons.ts`); unknown/absent icons render label-only. */
export interface CustomAction {
  /** Emitted as the `kai-message-action` detail `action` when clicked. */
  id: string;
  /** Visible/`aria-label` text. */
  label: string;
  /** A curated icon name from the action-icon registry. */
  icon?: string;
  /** Tooltip text shown on hover. Defaults to `label` when omitted. */
  tooltip?: string;
}

/** The speaker avatar for a message row. (Mirrors the `…Data` convention of
 *  `AttachmentData`; named to avoid clashing with the `MessageAvatar` component.) */
export interface AvatarData {
  /** Image URL. When present, renders an `<img>`. */
  src?: string;
  /** Initials/short text shown when there is no `src`. */
  fallback?: string;
  /** Alt text for the image. */
  alt?: string;
}

/** A citation the model produced. */
export interface Source {
  id?: string;
  url?: string;
  title?: string;
  snippet?: string;
  /** Citation marker number, when the model numbers its citations. */
  index?: number;
}

/** The public name for the citation carried by a `source` part, and the argument
 *  type of `AssistantStream.addSource`. The bare `Source` name is already taken
 *  on the public entry by the citation-chip COMPONENT (`./components/source`),
 *  so exporting this interface unaliased would be a duplicate identifier and the
 *  type would be unnameable from `@kitn.ai/ui`. */
export type MessageSource = Source;

/** One ordered piece of message content. Closed union: extension happens at the CARD
 *  layer via the card registry, not by adding variants here. */
export type MessagePart =
  | { type: 'text'; text: string; raw?: RawOrigin }
  | {
      type: 'reasoning';
      text: string;
      label?: string;
      /** Provider block index. Keeps parallel reasoning blocks distinct. */
      index?: number;
      /** Informational only. `raw` is the round-trip channel, not this. */
      signature?: string;
      raw?: RawOrigin;
    }
  | { type: 'tool'; tool: ToolPart; raw?: RawOrigin }
  | { type: 'card'; envelope: CardEnvelope; raw?: RawOrigin }
  | { type: 'source'; source: Source; raw?: RawOrigin }
  | { type: 'file'; attachment: AttachmentData; raw?: RawOrigin };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** The ONLY content channel. Ordered. */
  parts: MessagePart[];
  /** Action buttons under the message. Chrome, not content. */
  actions?: (ChatMessageAction | CustomAction)[];
  /** Optional speaker avatar shown to the left of the message column. */
  avatar?: AvatarData;
  /** Controlled feedback vote. When set, it wins over the facade's internal
   *  optimistic state (`m.feedback ?? feedbackMap[m.id]`), so a host that
   *  persists votes can re-hydrate them. */
  feedback?: FeedbackVote;
}
