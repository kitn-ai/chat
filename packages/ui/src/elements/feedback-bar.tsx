import { defineWebComponent } from './define';
import { FeedbackBar, type FeedbackValue, type FeedbackDetail } from '../components/feedback-bar';

interface Props extends Record<string, unknown> {
  /** The banner label (e.g. "Was this helpful?"). Attribute: `bar-title`
   *  (`title` is avoided because it is a global HTML attribute). */
  barTitle?: string;
  /** When set, a not-helpful vote opens an optional detail form before the
   *  thank-you confirmation. Attribute: `collect-detail`. */
  collectDetail?: boolean;
  /** Optional category chips for the detail form. Set as a JS property (array). */
  categories?: string[];
  /** Heading for the detail form. Attribute: `detail-title`. */
  detailTitle?: string;
  /** Placeholder for the detail comment box. Attribute: `detail-placeholder`. */
  detailPlaceholder?: string;
  /** Submit button label in the detail form. Attribute: `submit-label`. */
  submitLabel?: string;
  /** Confirmation copy shown after a vote/submit. Attribute: `thanks-message`. */
  thanksMessage?: string;
}

/** Events fired by `<kai-feedback-bar>`. */
interface Events {
  /** The user rated the response. `value` is `'helpful'` or `'not-helpful'`. */
  'kai-feedback': { value: FeedbackValue };
  /** The user submitted the optional detail form (`collect-detail`). */
  'kai-feedback-detail': FeedbackDetail;
  /** The user dismissed the banner. */
  'kai-close': void;
}

/**
 * `<kai-feedback-bar>` — an inline thumbs up/down feedback banner that owns its
 * own flow: it asks, optionally collects a category + comment on a not-helpful
 * vote (`collect-detail`), then confirms with a thank-you — all in place. Emits
 * `kai-feedback` (`{ value }`), `kai-feedback-detail` (`{ value, category?, comment? }`),
 * and `kai-close`.
 *
 * Placement and lifecycle are the app's call: the component is designed as a
 * THREAD-level bar (its events carry no message id), and when to show it —
 * e.g. revealed after a settled turn, hidden again on submit — is product
 * behavior the host decides.
 */
defineWebComponent<Props, Events>('kai-feedback-bar', {
  barTitle: 'Was this helpful?',
  collectDetail: undefined,
  categories: undefined,
  detailTitle: undefined,
  detailPlaceholder: undefined,
  submitLabel: undefined,
  thanksMessage: undefined,
}, (props, { dispatch, flag }) => (
  <FeedbackBar
    title={props.barTitle}
    collectDetail={flag('collectDetail')}
    categories={props.categories}
    detailTitle={props.detailTitle}
    detailPlaceholder={props.detailPlaceholder}
    submitLabel={props.submitLabel}
    thanksMessage={props.thanksMessage}
    onFeedback={(value) => dispatch('kai-feedback', { value })}
    onSubmitDetail={(detail) => dispatch('kai-feedback-detail', detail)}
    onClose={() => dispatch('kai-close')}
  />
));
