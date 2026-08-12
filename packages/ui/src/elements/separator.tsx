import { Separator } from '../ui/separator';
import { defineWebComponent } from './define';

interface Props extends Record<string, unknown> {
  /** `horizontal` (default, block + full-width) or `vertical` (a rule inside a
   *  flex/grid row, stretching to the row height). */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * `<kai-separator>` — a themed divider between groups of content (toolbar
 * sections, menu groups, header/sidebar splits). Carries `role="separator"`.
 * Restyle via `::part(separator)`.
 *
 * ```html
 * <kai-separator></kai-separator>
 * <div style="display:flex; gap:.5rem">
 *   <span>A</span><kai-separator orientation="vertical"></kai-separator><span>B</span>
 * </div>
 * ```
 */
defineWebComponent<Props>('kai-separator', {
  orientation: 'horizontal',
}, (props) => {
  const vertical = () => props.orientation === 'vertical';
  return (
    <>
      {/* The host owns its layout box: a horizontal rule is block + full-width;
          a vertical rule is an inline-block flex item that stretches to the row. */}
      <style>{vertical()
        ? ':host{display:inline-block;align-self:stretch}'
        : ':host{display:block}'}</style>
      <Separator orientation={vertical() ? 'vertical' : 'horizontal'} part="separator" />
    </>
  );
});
