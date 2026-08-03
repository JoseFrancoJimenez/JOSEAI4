/** A leaf's checked state, or a group's aggregated state. */
type CheckedState = 'checked' | 'unchecked' | 'mixed';

/**
 * Pure checked-state model for the checkbox tree — **no DOM, no structure**.
 *
 * Holds ids that store their own boolean: checkbox-leaves always, plus checkbox-**groups** too in
 * `'self'` mode. A `'cascade'` group's state is never stored: the widget enumerates its descendant
 * checkbox-leaf ids by walking the DOM and asks {@link aggregate} to derive it on demand, so it can
 * never drift from the leaves that are actually checked. The model itself doesn't know or care
 * which policy is in effect — it just holds whatever ids the widget tells it to.
 */
class CheckboxModel {
  #checked = new Set<string>();

  /** Whether `leafId` is currently checked. */
  isChecked(leafId: string): boolean {
    return this.#checked.has(leafId);
  }

  /** Aggregates a set of leaf ids: all checked → `checked`, none checked → `unchecked`, else `mixed`. Empty → `unchecked`. */
  aggregate(leafIds: Iterable<string>): CheckedState {
    let sawAny = false;
    let sawChecked = false;
    let sawUnchecked = false;
    for (const id of leafIds) {
      sawAny = true;
      if (this.#checked.has(id)) sawChecked = true;
      else sawUnchecked = true;
      if (sawChecked && sawUnchecked) return 'mixed';
    }
    if (!sawAny || !sawChecked) return 'unchecked';
    return 'checked';
  }

  /**
   * Flips `id`'s checked state. Returns the new value. Used for any single stored id — a
   * checkbox-leaf in either policy, or a checkbox-group's own boolean in `'self'` mode.
   */
  toggleOne(id: string): { checked: boolean } {
    const checked = !this.#checked.has(id);
    if (checked) this.#checked.add(id);
    else this.#checked.delete(id);
    return { checked };
  }

  /** Sets every id in `leafIds` to the cascade target: not-fully-checked → all checked; fully checked → all unchecked. */
  toggleGroup(leafIds: string[]): { checked: boolean } {
    const target = this.aggregate(leafIds) !== 'checked';
    for (const id of leafIds) {
      if (target) this.#checked.add(id);
      else this.#checked.delete(id);
    }
    return { checked: target };
  }

  /** Replaces the checked set wholesale. */
  setChecked(ids: Iterable<string>): void {
    this.#checked = new Set(ids);
  }

  /** Snapshot of currently checked leaf ids. */
  getChecked(): string[] {
    return [...this.#checked];
  }

  /** Drops `leafIds` from the checked set (used on node removal / a leaf turning into a branch). */
  forget(leafIds: Iterable<string>): void {
    for (const id of leafIds) this.#checked.delete(id);
  }
}

export { CheckboxModel };
export type { CheckedState };
