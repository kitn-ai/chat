// Shared types (folded in from @tab-zen/shared)
export type { ModelOption, SearchFilters, ConversationScope, ConversationSummary, ConversationGroup } from './types';

// Utilities
export { cn } from './utils/cn';

// Layer 1: Headless Primitives
export { createKaiChat } from './primitives/create-kai-chat';
export type { CreateKaiChatOptions, KaiChatStore } from './primitives/create-kai-chat';
export { useAutoResize } from './primitives/use-auto-resize';
export { useStickToBottom } from './primitives/use-stick-to-bottom';
export { useTextStream } from './primitives/use-text-stream';
export type { UseTextStreamOptions, TextStreamSegment } from './primitives/use-text-stream';
export { useVoiceRecorder } from './primitives/use-voice-recorder';
export type { UseVoiceRecorderOptions } from './primitives/use-voice-recorder';
export { ChatConfig, useChatConfig, proseClass, textClass } from './primitives/chat-config';
export type { ChatConfigValue, ProseSize, ChatConfigProps } from './primitives/chat-config';
export { configureCodeHighlighting, isCodeHighlightingEnabled } from './primitives/highlighter';
export type { CodeHighlightingOptions } from './primitives/highlighter';
export { configurePdfPreview, isPdfPreviewEnabled } from './primitives/pdf-preview';
export type { PdfPreviewOptions } from './primitives/pdf-preview';

// Toasts: imperative `toast()` API + the reactive store behind <kai-toast-region>
export { toast, configureToasts, ensureMounted as ensureToastRegion, getToasts } from './primitives/toast-store';
export type {
  ToastItem, ToastVariant, ToastAction, ToastOptions, ToastHandle, ToastFn, ToastConfig,
} from './primitives/toast-store';
export { Toast, ToastRegion } from './components/toast';
export type {
  ToastRegionProps, ToastDismissReason, ToastPosition,
} from './components/toast';

// Card Contract (generative-UI foundation)
export { CARD_CONTRACT_VERSION } from './primitives/card-contract';
export type {
  CardEnvelope, CardContext, CardEvent, CardEventKind, CardResolution, CardHost, CardPolicy,
} from './primitives/card-contract';
export { applyResolution, resolutionFromEvent } from './primitives/card-resolution';
export { CardProvider, useCardHost } from './primitives/card-host';
export type { CardProviderProps } from './primitives/card-host';
export { CARD_EVENT_NAME, emitCardEvent, routeCardEvent, listenForCardEvents } from './primitives/card-routing';
export { dismissRecovery, defaultIsReopenable } from './primitives/card-recovery';
export type {
  RecoveryToast, ReopenEnv, DismissRecoveryOptions,
} from './primitives/card-recovery';
export { validateAgainstSchema } from './primitives/card-validate';
export type { JsonSchema, ValidationResult } from './primitives/card-validate';

// Remote host SDK (iframe transport — host side only; provider runtime ships via ./provider subpath)
export { mountRemoteCard } from './remote/host-embed';
export type { MountRemoteCardOptions, RemoteCardHandle } from './remote/host-embed';

// Card dispatcher (generative-UI host glue)
export { CardRenderer, renderCard } from './components/card-renderer';
export type { CardRendererProps } from './components/card-renderer';
export { CardFallback } from './components/card-fallback';
export type { CardFallbackProps } from './components/card-fallback';
export {
  BUILTIN_CARD_TAGS, BUILTIN_CARD_COMPONENTS, mergeCardTags, mergeCardComponents,
} from './primitives/card-registry';
export type { CardComponent, CardComponentMap, CardTagMap } from './primitives/card-registry';

// Card: kai-card (base shell) + kai-form (JSON-Schema form renderer)
export { Card } from './components/card';
export type { CardProps } from './components/card';
export { DismissedStub, stubIntent } from './components/dismissed-stub';
export type { DismissedStubProps, DismissedCardType } from './components/dismissed-stub';
export { Form, validateForm, buildResult, widgetFor, orderedKeys, coerceValue } from './components/form';
export type {
  FormProps,
  FormField,
  FormDefinition,
  FormCardEnvelope,
  FormValidation,
  WidgetKind,
} from './components/form';

// Card: kai-confirm (approval) + kai-tasks (selectable plan)
export {
  ConfirmCard,
  CONFIRM_CARD_TYPE,
  buttonVariantForStyle,
  normalizeActions,
  defaultActionId,
} from './components/confirm-card';
export type {
  ConfirmCardProps,
  ConfirmAction,
  ConfirmActionStyle,
  ConfirmTone,
  ConfirmCardData,
  ConfirmCardEnvelope,
} from './components/confirm-card';
export {
  TasksCard,
  TASKS_CARD_TYPE,
  normalizeTasks,
  initialSelected,
  selectedInOrder,
  toggleableIds,
  selectAllState,
  showSelectAll,
  canConfirm,
  isMaxReached,
  confirmReason,
} from './components/tasks-card';
export type {
  TasksCardProps,
  TasksTask,
  TasksCardData,
  TasksCardResult,
  TasksCardEnvelope,
  SelectAllState,
} from './components/tasks-card';

// Card: kai-choice (single-select option card)
export {
  ChoiceCard,
  CHOICE_CARD_TYPE,
  OTHER_ACTION,
  normalizeOptions,
  resolveOtherConfig,
  nextEnabledIndex,
  firstEnabledIndex,
} from './components/choice-card';
export type {
  ChoiceCardProps,
  ChoiceOption,
  ChoiceOptionMedia,
  ChoiceAllowOther,
  ChoiceCardData,
  ChoiceCardEnvelope,
} from './components/choice-card';

// Card: kai-link-preview (OG/link preview) + kai-embed (lazy media embed)
export { LinkPreview } from './components/link-preview';
export type { LinkPreviewProps } from './components/link-preview';
export { Embed } from './components/embed';
export type { EmbedProps } from './components/embed';
export {
  configureLinkPreview,
  resolveLinkMetadata,
  hasLinkPreviewFetcher,
  LINK_PREVIEW_TYPE,
} from './primitives/link-preview';
export type { LinkPreviewData, LinkPreviewEnvelope, LinkMetadataFetcher } from './primitives/link-preview';
export {
  resolveEmbed,
  parseYouTubeId,
  parseVimeoId,
  configureEmbedAllowlist,
  isGenericOriginAllowed,
  EMBED_CARD_TYPE,
} from './primitives/embed-providers';
export type { EmbedCardData, EmbedCardEnvelope, EmbedProvider, ResolvedEmbed } from './primitives/embed-providers';

// Layer 2: UI Primitives
export { Button, buttonVariants } from './ui/button';
export type { ButtonProps } from './ui/button';
export { Avatar } from './ui/avatar';
export type { AvatarProps } from './ui/avatar';
export { Tooltip } from './ui/tooltip';
export { HoverCard } from './ui/hover-card';
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
export { ScrollArea } from './ui/scroll-area';
export { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from './ui/dropdown';
export { Textarea } from './ui/textarea';
export type { TextareaProps } from './ui/textarea';
export { Badge } from './ui/badge';
export type { BadgeProps } from './ui/badge';
export { Separator } from './ui/separator';
export { ResizablePanelGroup, ResizablePanel, ResizableHandle, Resizable, normalizeSize, resolveToPx } from './ui/resizable';
export type { ResizablePanelGroupProps, ResizablePanelProps, ResizableHandleProps, ResizableProps, SizeValue } from './ui/resizable';
export { Skeleton } from './ui/skeleton';
export { FileTree, buildFileTree } from './components/file-tree';
export type {
  FileTreeProps, FileTreeFile, FileTreeNode, FileTreeFolderNode, FileTreeFileNode,
} from './components/file-tree';
export { Artifact } from './components/artifact';
export type { ArtifactProps, ArtifactFile, ArtifactTab } from './components/artifact';

// Layer 3: AI/Feature Components
export {
  ChatContainer, ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor,
  useChatContainer,
} from './components/chat-container';
export { Message, MessageAvatar, MessageContent, MessageActions, MessageAction, MessageCopyButton, MessageBody } from './components/message';
export type { MessageCopyButtonProps, MessageBodyProps } from './components/message';
export { ResponseCompare, useResolved } from './components/response-compare';
export type { ResponseCompareProps, CompareLayout, ResolvedController } from './components/response-compare';
export {
  normalizeCandidates,
  buildSelection,
  isAnyStreaming,
} from './components/response-compare';
export type {
  CompareCandidate,
  ComparePair,
  CompareCollapse,
  ResponseCompareData,
  CompareSelection,
} from './components/response-compare';
export { MessageSkills } from './components/message-skills';
export type { Skill as MessageSkill } from './components/message-skills';
export {
  PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction,
  usePromptInput,
} from './components/prompt-input';
export { ResponseStream } from './components/response-stream';
export { Markdown } from './components/markdown';
export { CodeBlock, CodeBlockCode, CodeBlockGroup } from './components/code-block';
export { Loader } from './components/loader';
export type { LoaderVariant, LoaderSize, LoaderProps } from './components/loader';
export {
  CircularLoader, ClassicLoader, PulseLoader, PulseDotLoader,
  DotsLoader, TypingLoader, WaveLoader, BarsLoader,
  TerminalLoader, TextBlinkLoader, TextShimmerLoader, TextDotsLoader,
} from './components/loader';
export { FeedbackBar, type FeedbackValue, type FeedbackDetail } from './components/feedback-bar';
export {
  ChainOfThought, ChainOfThoughtStep, ChainOfThoughtTrigger,
  ChainOfThoughtContent, ChainOfThoughtItem,
} from './components/chain-of-thought';
export { Source, SourceTrigger, SourceContent, SourceList } from './components/source';
export { PromptSuggestion } from './components/prompt-suggestion';
export {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent, emptyMediaVariants,
} from './components/empty';
export type {
  EmptyProps, EmptyHeaderProps, EmptyMediaProps, EmptyTitleProps, EmptyDescriptionProps, EmptyContentProps,
} from './components/empty';
export { ScrollButton } from './components/scroll-button';
export { TextShimmer } from './components/text-shimmer';
export { Checkpoint, CheckpointIcon, CheckpointTrigger } from './components/checkpoint';
export type { CheckpointProps, CheckpointIconProps, CheckpointTriggerProps } from './components/checkpoint';
export {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextCacheUsage,
} from './components/context';
export type {
  ContextProps,
  ContextTriggerProps,
  ContextContentProps,
  ContextContentHeaderProps,
  ContextContentBodyProps,
  ContextContentFooterProps,
  ContextUsageRowProps,
} from './components/context';
export { VoiceInput } from './components/voice-input';
export { ConversationList } from './components/conversation-list';
export { ConversationItem } from './components/conversation-item';
export { ModelSwitcher } from './components/model-switcher';
export { ChatScopePicker } from './components/chat-scope-picker';
export { Tool } from './components/tool';
export type { ToolPart, ToolProps } from './components/tool';
export { ThinkingBar } from './components/thinking-bar';
export type { ThinkingBarProps } from './components/thinking-bar';
export { Reasoning, ReasoningTrigger, ReasoningContent } from './components/reasoning';
export type { ReasoningProps, ReasoningTriggerProps, ReasoningContentProps } from './components/reasoning';
export { Image } from './components/image';
export type { ImageProps, GeneratedImageLike } from './components/image';
export { FileUpload, FileUploadTrigger, FileUploadContent } from './components/file-upload';
export type { FileUploadProps, FileUploadTriggerProps, FileUploadContentProps } from './components/file-upload';
export {
  Attachments, Attachment, AttachmentPreview, AttachmentInfo, AttachmentRemove,
  AttachmentHoverCard, AttachmentHoverCardTrigger, AttachmentHoverCardContent,
  AttachmentEmpty, getMediaCategory, getAttachmentLabel,
  useAttachmentsContext, useAttachmentContext,
} from './components/attachments';
export type {
  AttachmentData, AttachmentMediaCategory, AttachmentVariant,
  AttachmentsProps, AttachmentProps, AttachmentPreviewProps,
  AttachmentInfoProps, AttachmentRemoveProps, AttachmentEmptyProps,
  AttachmentHoverCardProps, AttachmentHoverCardTriggerProps, AttachmentHoverCardContentProps,
} from './components/attachments';

// Chat message types — public API for consumers who need to type their own message arrays.
// NOTE: chat-types.ts also exports an unrelated `Source` interface (a citation), but
// `Source` is already a public component export (./components/source, a citation
// chip/trigger), so re-exporting both under the same name is a duplicate-identifier
// error, so the message-part `Source` interface stays reachable only via
// `Extract<MessagePart, { type: 'source' }>['source']` rather than a direct import.
export type {
  ChatMessage, ChatMessageAction, CustomAction, AvatarData, FeedbackVote, MessagePart, RawOrigin,
} from './elements/chat-types';
