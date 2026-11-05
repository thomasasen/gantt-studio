import { mapProjectToFrappeTasks } from './frappe-task-mapper.mjs?v=2.8.0';

// Deliberately conservative: this is NOT a production-capable replacement.
// No project mutation, scheduling callbacks, persistence, or internal DOM access.
const CAPABILITIES = Object.freeze({
  id: 'frappe-spike', zoom: Object.freeze(['day', 'week', 'month']),
  taskMove: false, resizeStart: false, resizeEnd: false, progress: false,
  reorder: false, keyboardReorder: false, phaseRows: false, baseline: false,
  buffer: false, markers: false, holidays: false, dependencies: true,
  themes: 0, print: false, offline: true
});

const VIEW_MODE = Object.freeze({day: 'Day', week: 'Week', month: 'Month'});

/**
 * Experimental read-only Frappe Gantt adapter.
 * Requires the locally packaged Frappe 1.2.2 UMD constructor or a test double.
 * The app is not wired to this factory; it is used only by the isolated spike.
 */
export function createFrappeEngine({Gantt} = {}) {
  let container = null;
  let chart = null;
  let onSelect = () => {};
  let viewport = null;
  return {
    getCapabilities: () => CAPABILITIES,
    mount(options) {
      if (container) throw new Error('Frappe adapter is already mounted.');
      if (!options?.container || typeof options.container.replaceChildren !== 'function')
        throw new TypeError('Frappe mount container is required.');
      container = options.container;
      onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
    },
    render({project, view}) {
      if (!container) throw new Error('Frappe adapter must be mounted first.');
      if (!Object.hasOwn(VIEW_MODE, view?.zoom)) throw new RangeError('Unsupported Frappe zoom.');
      const tasks = mapProjectToFrappeTasks(project);
      container.replaceChildren();
      chart = null;
      if (tasks.length === 0) return {empty: true};
      const Constructor = Gantt || globalThis.Gantt;
      if (typeof Constructor !== 'function') throw new Error('Local Frappe Gantt UMD is not loaded.');
      try {
        chart = new Constructor(container, tasks, {
          view_mode: VIEW_MODE[view.zoom],
          readonly: true,
          readonly_dates: true,
          readonly_progress: true,
          move_dependencies: false,
          infinite_padding: false,
          today_button: false,
          view_mode_select: false,
          scroll_to: 'start',
          language: 'de',
          popup: () => false,
          on_click: task => onSelect({kind: 'task', id: String(task.id)})
        });
      } catch(error) {
        container.replaceChildren();
        chart = null;
        throw error;
      }
      if (viewport) this.setViewport(viewport);
      return {empty: false};
    },
    setViewport(next = {}) {
      viewport = {...viewport, ...next};
      // Frappe's internal scrolling surface is not exposed by the documented
      // public API. Only manipulate an outer scroller we own.
      const scroller = container?.parentElement;
      if (scroller && Number.isFinite(next.scrollLeft)) scroller.scrollLeft = next.scrollLeft;
      if (scroller && Number.isFinite(next.scrollTop)) scroller.scrollTop = next.scrollTop;
    },
    cancelInteraction() {
      // Read-only chart has no Studio edit interaction to cancel.
    },
    locateMarker() { return null; },
    focusTask() { return false; },
    destroy() {
      if (!container) return;
      // Frappe 1.2.2 documents no destroy/dispose method. This only tears
      // down owned DOM; possible third-party global listener leaks are a Gate C risk.
      container.replaceChildren();
      chart = null;
      container = null;
      viewport = null;
      onSelect = () => {};
    }
  };
}
