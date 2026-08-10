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
  ToastProps, ToastRegionProps, ToastDismissReason, ToastPosition,
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
export type { TooltipProps, TooltipController } from './ui/tooltip';
export { HoverCard, HoverCardRoot, HoverCardTrigger, HoverCardContent } from './ui/hover-card';
export type {
  HoverCardProps, HoverCardRootProps, HoverCardTriggerProps, HoverCardContentProps, HoverCardController,
} from './ui/hover-card';
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
export type {
  CollapsibleProps, CollapsibleTriggerProps, CollapsibleContentProps, CollapsibleController,
} from './ui/collapsible';
export { ScrollArea } from './ui/scroll-area';
export type { ScrollAreaProps, ScrollOrientation } from './ui/scroll-area';
export {
  Dropdown, DropdownTrigger, DropdownContent, DropdownItem,
  DropdownSeparator, DropdownLabel, DropdownCheckboxItem, DropdownRadioItem,
  DropdownSub, DropdownSubTrigger, DropdownSubContent,
} from './ui/dropdown';
export type {
  DropdownProps, DropdownTriggerProps, DropdownContentProps, DropdownItemProps,
  DropdownSeparatorProps, DropdownLabelProps, DropdownCheckboxItemProps, DropdownRadioItemProps,
  DropdownSubProps, DropdownSubTriggerProps, DropdownSubContentProps, DropdownController,
} from './ui/dropdown';
export { Textarea } from './ui/textarea';
export type { TextareaProps } from './ui/textarea';
export { Badge } from './ui/badge';
export type { BadgeProps } from './ui/badge';
export { Separator } from './ui/separator';
export type { SeparatorProps } from './ui/separator';
export { ResizablePanelGroup, ResizablePanel, ResizableHandle, Resizable, normalizeSize, resolveToPx, clampBasis } from './ui/resizable';
export type { ResizablePanelGroupProps, ResizablePanelProps, ResizableHandleProps, ResizableProps, SizeValue } from './ui/resizable';
export { Skeleton } from './ui/skeleton';
export type { SkeletonProps, SkeletonVariant } from './ui/skeleton';
export { Input } from './ui/input';
export type { InputProps } from './ui/input';
export { Kbd } from './ui/kbd';
export type { KbdProps, KbdPlatform } from './ui/kbd';
export { Switch } from './ui/switch';
export type { SwitchProps } from './ui/switch';
export { Tabs } from './ui/tabs';
export type { TabsProps, TabsVariant, KaiTabItem } from './ui/tabs';
export { Segmented } from './ui/segmented';
export type { SegmentedProps, SegmentedOption } from './ui/segmented';
export { Status } from './ui/status';
export type { StatusProps, StatusKind } from './ui/status';
export { ProgressBar } from './ui/progress-bar';
export type { ProgressBarProps, ProgressTone } from './ui/progress-bar';
export { Notice } from './ui/notice';
export type { NoticeProps, NoticeSeverity } from './ui/notice';
export { EditableLabel } from './ui/editable-label';
export type { EditableLabelProps } from './ui/editable-label';
export { Dialog } from './ui/dialog';
export type { DialogProps, DialogController } from './ui/dialog';
export { Popover } from './ui/popover';
export type { PopoverProps, PopoverController } from './ui/popover';
export { Nav } from './ui/nav';
export type { NavProps, KaiNavItem, NavItemStatus, NavStatusTone } from './ui/nav';
export { CommandList } from './ui/command';
export type { CommandListProps, CommandRow, CommandGroup } from './ui/command';
export { AgentCard } from './ui/agent-card';
export type { AgentCardProps, AgentStatus, AgentStatusTone } from './ui/agent-card';
export { Pane } from './ui/pane';
export type { PaneProps, PaneStatus, PaneStatusTone } from './ui/pane';
export { PaneGroup } from './ui/pane-group';
export type { PaneGroupProps, PaneTab, PaneTabStatus } from './ui/pane-group';
export { PromptDock } from './ui/prompt-dock';
export type { PromptDockProps, PromptDockFrame, PromptDockAppearance } from './ui/prompt-dock';
export { SettingsGroup, SettingItem } from './ui/settings-group';
export type { SettingsGroupProps, SettingItemProps } from './ui/settings-group';
// `kai-icon` renders no kit component — it calls this. Solid consumers resolving
// the same `icon` strings (named icon | URL | text fallback) need it too.
export { renderIcon } from './ui/icon';
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
export type {
  ChatContainerProps, ChatContainerRootProps, ChatContainerContentProps, ChatContainerScrollAnchorProps,
} from './components/chat-container';
export { Message, MessageAvatar, MessageContent, MessageActions, MessageAction, MessageCopyButton, MessageBody } from './components/message';
export type {
  MessageProps, MessageAvatarProps, MessageContentProps, MessageActionsProps,
  MessageActionProps, MessageCopyButtonProps, MessageBodyProps,
} from './components/message';
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
export type { MessageSkillsProps, Skill as MessageSkill } from './components/message-skills';
export {
  PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction,
  usePromptInput,
} from './components/prompt-input';
export type {
  PromptInputProps, PromptInputTextareaProps, PromptInputActionsProps, PromptInputActionProps,
} from './components/prompt-input';
export { ResponseStream } from './components/response-stream';
export type { ResponseStreamProps } from './components/response-stream';
export { Markdown } from './components/markdown';
export type { MarkdownProps } from './components/markdown';
export { CodeBlock, CodeBlockCode, CodeBlockGroup } from './components/code-block';
export type { CodeBlockProps, CodeBlockCodeProps, CodeBlockGroupProps } from './components/code-block';
export { Loader } from './components/loader';
export type { LoaderVariant, LoaderSize, LoaderProps } from './components/loader';
export {
  CircularLoader, ClassicLoader, PulseLoader, PulseDotLoader,
  DotsLoader, TypingLoader, WaveLoader, BarsLoader,
  TerminalLoader, TextBlinkLoader, TextShimmerLoader, TextDotsLoader,
} from './components/loader';
export type {
  LoaderShapeProps, LoaderTextProps,
  CircularLoaderProps, ClassicLoaderProps, PulseLoaderProps, PulseDotLoaderProps,
  DotsLoaderProps, TypingLoaderProps, WaveLoaderProps, BarsLoaderProps,
  TerminalLoaderProps, TextBlinkLoaderProps, TextShimmerLoaderProps, TextDotsLoaderProps,
} from './components/loader';
export { FeedbackBar, type FeedbackValue, type FeedbackDetail, type FeedbackBarProps } from './components/feedback-bar';
export {
  ChainOfThought, ChainOfThoughtStep, ChainOfThoughtTrigger,
  ChainOfThoughtContent, ChainOfThoughtItem, ChainOfThoughtAccordion,
} from './components/chain-of-thought';
export type {
  ChainOfThoughtProps, ChainOfThoughtStepProps, ChainOfThoughtTriggerProps,
  ChainOfThoughtContentProps, ChainOfThoughtItemProps, ChainOfThoughtAccordionProps,
  ChainOfThoughtType, ChainOfThoughtStepData, ChainOfThoughtController,
} from './components/chain-of-thought';
export { Source, SourceTrigger, SourceContent, SourceList } from './components/source';
export type { SourceProps, SourceTriggerProps, SourceContentProps, SourceListProps } from './components/source';
export { PromptSuggestion } from './components/prompt-suggestion';
export type { PromptSuggestionProps } from './components/prompt-suggestion';
export {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent, emptyMediaVariants,
} from './components/empty';
export type {
  EmptyProps, EmptyHeaderProps, EmptyMediaProps, EmptyTitleProps, EmptyDescriptionProps, EmptyContentProps,
} from './components/empty';
export { ScrollButton } from './components/scroll-button';
export type { ScrollButtonProps } from './components/scroll-button';
export { TextShimmer } from './components/text-shimmer';
export type { TextShimmerProps } from './components/text-shimmer';
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
  ContextInputUsageProps,
  ContextOutputUsageProps,
  ContextReasoningUsageProps,
  ContextCacheUsageProps,
} from './components/context';
export { VoiceInput } from './components/voice-input';
export type { VoiceInputProps, VoiceInputController } from './components/voice-input';
export { VoiceOutput } from './components/voice-output';
export type { VoiceOutputProps, VoiceOutputController } from './components/voice-output';
export { ConversationList, CollapsedRail } from './components/conversation-list';
export type {
  ConversationListProps, ConversationListController, CollapsedRailProps,
} from './components/conversation-list';
export { ConversationItem } from './components/conversation-item';
export type { ConversationItemProps } from './components/conversation-item';
export { ModelSwitcher } from './components/model-switcher';
export type { ModelSwitcherProps } from './components/model-switcher';
export { ChatScopePicker } from './components/chat-scope-picker';
export type { ChatScopePickerProps } from './components/chat-scope-picker';
export { Tool } from './components/tool';
export type { ToolPart, ToolProps } from './components/tool';
// ToolPart.kind's doc comment says "Derive with `classifyTool(type)`", so the
// function has to be reachable from every entry that surfaces ToolPart. It is
// total, deterministic and terminates in 'generic', so it is safe public API and
// genuinely useful to anyone rendering tool calls themselves.
export { classifyTool } from './components/tool-classify';
export type { ToolKind } from './components/tool-classify';
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

// Layer 3b: the composed thread/shell components the coarse elements wrap.
// These are what `<kai-thread>`, `<kai-chat>`, `<kai-screen>`, `<kai-coachmark>` and
// `<kai-composer>` render, so a Solid consumer writes one component for one element
// instead of re-deriving the scroll/feedback/staging behaviour by hand.
export { Thread } from './components/thread';
export type { ThreadProps, ThreadController } from './components/thread';
export { ChatThread } from './components/chat-thread';
export type { ChatThreadProps, ChatThreadController, ChatThreadContextUsage } from './components/chat-thread';
export { Screen } from './components/screen';
export type { ScreenProps, ScreenController } from './components/screen';
export { Coachmark } from './components/coachmark';
export type { CoachmarkProps, CoachmarkController } from './components/coachmark';
export { Composer } from './components/composer';
export type {
  ComposerProps, ComposerController, ComposerChange, TriggerDef, TriggerItem, HighlightRule,
} from './components/composer';

// Chat message types — public API for consumers who need to type their own message arrays.
// NOTE: chat-types.ts also exports an unrelated `Source` interface (a citation), and
// `Source` is already a public component export (./components/source, a citation
// chip/trigger), so re-exporting both under that name is a duplicate-identifier error.
// The citation type therefore ships under its alias `MessageSource`, which is also the
// argument type of the public `AssistantStream.addSource(source)`.
export type {
  ChatMessage, ChatMessageAction, CustomAction, AvatarData, FeedbackVote, MessagePart,
  MessageSource, RawOrigin,
} from './elements/chat-types';
