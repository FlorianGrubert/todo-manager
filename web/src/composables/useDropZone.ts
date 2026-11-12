import Sortable from 'sortablejs';
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';

/**
 * Turns a container into a drop zone for To-Do cards (SortableJS, works with
 * mouse and touch). Sortable moves the DOM node; we put it back immediately and
 * let Vue re-render from state, so the virtual DOM stays consistent.
 */
export function useDropZone(
  el: Ref<HTMLElement | null>,
  options: { enabled: () => boolean; onDrop: (todoId: string, fromZone: string, toZone: string) => void },
): void {
  let sortable: Sortable | undefined;

  onMounted(() => {
    if (!el.value) return;
    sortable = Sortable.create(el.value, {
      group: 'todo-board',
      sort: false,
      draggable: '.can-drag',
      filter: 'button, a',
      preventOnFilter: false,
      animation: 150,
      delay: 180,
      delayOnTouchOnly: true,
      ghostClass: 'drag-ghost',
      chosenClass: 'drag-chosen',
      disabled: !options.enabled(),
      onEnd(evt) {
        if (evt.from === evt.to) return;
        const id = evt.item.dataset.id;
        const from = evt.from.dataset.zone ?? '';
        const to = evt.to.dataset.zone ?? '';
        evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex ?? 0] ?? null);
        if (id) options.onDrop(id, from, to);
      },
    });
  });

  watch(options.enabled, (enabled) => sortable?.option('disabled', !enabled));
  onBeforeUnmount(() => sortable?.destroy());
}
