export function renderEditingMessageHandlers(enabled: boolean): string {
  return enabled ? `
    document.addEventListener("keydown", (event) => {
      if (handleDetailsFocusTrap(event)) {
        return;
      }
      if (handleDetailTabKeydown(event)) {
        return;
      }
      if (handleRowActionMenuKeydown(event)) {
        return;
      }
      if (handleDependencyPickerKeydown(event)) {
        return;
      }
      if (event.key === "Escape" && previewDragState) {
        event.preventDefault();
        cancelPreviewDrag();
        return;
      }
      if (event.key === "Escape" && previewMiniEditor instanceof HTMLElement && !previewMiniEditor.hidden) {
        event.preventDefault();
        hidePreviewMiniEditor();
        return;
      }
      if (event.key === "Escape" && document.querySelector(".row-action-menu-wrap.open")) {
        event.preventDefault();
        closeRowActionMenus(true);
        return;
      }
      if (event.key === "Escape" && shell?.classList.contains("details-open")) {
        event.preventDefault();
        setDetailsOpen(false, false, true);
        return;
      }
      if (previewKeyboardResize(event)) {
        return;
      }
      if (previewKeyboardNudge(event)) {
        return;
      }
      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;
      if (event.isComposing || event.altKey || !hasModifier || (key !== "z" && key !== "y")) {
        return;
      }
      event.preventDefault();
      vscode.postMessage({
        type: key === "y" || event.shiftKey ? "redo" : "undo"
      });
    });
    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.classList.contains("dependency-search")) {
        return;
      }
      const picker = target.closest(".dependency-picker");
      if (!(picker instanceof HTMLElement)) {
        return;
      }
      const query = target.value.trim().toLowerCase();
      let visibleCount = 0;
      target.removeAttribute("aria-activedescendant");
      picker.querySelectorAll(".dependency-option").forEach((candidate) => {
        if (!(candidate instanceof HTMLElement)) {
          return;
        }
        const matches = query === "" || (candidate.dataset.search ?? "").includes(query);
        candidate.hidden = !matches;
        candidate.tabIndex = -1;
        if (matches) {
          visibleCount += 1;
        }
      });
      const empty = picker.querySelector("[data-dependency-empty]");
      if (empty instanceof HTMLElement) {
        empty.hidden = visibleCount > 0;
      }
    });
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      const resizeHandle = target instanceof Element ? target.closest("[data-preview-resize-handle]") : null;
      const editBar = target instanceof Element ? target.closest("[data-preview-edit-task]") : null;
      if (editBar instanceof HTMLElement) {
        if (!isPreviewEditMode() || editBar.dataset.editable !== "true") {
          return;
        }
        event.preventDefault();
        const nodeId = editBar.dataset.nodeId;
        if (!nodeId) {
          return;
        }
        const resizeEdge = resizeHandle instanceof HTMLElement && resizeHandle.dataset.previewResizeHandle === "left"
          ? "left"
          : resizeHandle instanceof HTMLElement && resizeHandle.dataset.previewResizeHandle === "right"
            ? "right"
            : "";
        previewDragState = {
          element: editBar,
          nodeId,
          mode: resizeEdge ? "resize" : "move",
          edge: resizeEdge,
          pointerId: event.pointerId,
          startX: event.clientX,
          dayDelta: 0,
          originalLeft: editBar.style.getPropertyValue("--preview-edit-left"),
          originalWidth: editBar.style.getPropertyValue("--preview-edit-width")
        };
        editBar.classList.add("dragging");
        try {
          editBar.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic pointer events in the test harness do not always create an active pointer.
        }
        return;
      }
      if (!(target instanceof HTMLInputElement) || !target.classList.contains("native-date-picker")) {
        return;
      }
      const textInput = target.closest(".date-field")?.querySelector("input[data-field]:not(.native-date-picker)");
      if (!(textInput instanceof HTMLInputElement)) {
        return;
      }
      const isoValue = dateLiteralToIsoDate(textInput.value, target.dataset.dateFormat);
      if (isoValue) {
        target.value = isoValue;
      }
    });
    document.addEventListener("pointermove", (event) => {
      if (!previewDragState || previewDragState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      updatePreviewDrag(event);
    });
    document.addEventListener("pointerup", (event) => {
      if (!previewDragState || previewDragState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      updatePreviewDrag(event);
      commitPreviewDrag();
    });
    document.addEventListener("pointercancel", (event) => {
      if (!previewDragState || previewDragState.pointerId !== event.pointerId) {
        return;
      }
      cancelPreviewDrag();
    });
    document.addEventListener("click", (event) => {
      const element = event.target instanceof Element ? event.target : null;
      const actionTarget = element?.closest("[data-action]");
      if (actionTarget instanceof HTMLInputElement || actionTarget instanceof HTMLTextAreaElement || actionTarget instanceof HTMLSelectElement) {
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "request-delete-task") {
        vscode.postMessage({
          type: "request-delete-task",
          nodeId: actionTarget.dataset.nodeId
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "request-delete-section") {
        vscode.postMessage({
          type: "request-delete-section",
          sectionId: actionTarget.dataset.sectionId
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "toggle-row-action-menu") {
        openRowActionMenu(actionTarget);
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "open-date-picker") {
        openNativeDatePicker(actionTarget);
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "apply-input-option") {
        const targetAction = actionTarget.dataset.targetAction;
        const optionValue = actionTarget.dataset.value ?? "";
        const input = actionTarget.closest("label")?.querySelector("input, textarea, select");
        if (!targetAction || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) {
          return;
        }
        const nextValue = actionTarget.dataset.optionMode === "append-unique"
          ? appendUniqueToken(input.value, optionValue)
          : optionValue;
        input.value = nextValue;
        if (targetAction === "update-setting") {
          vscode.postMessage({
            type: targetAction,
            settingKey: actionTarget.dataset.settingKey,
            value: nextValue
          });
          return;
        }
        vscode.postMessage({
          type: targetAction,
          nodeId: actionTarget.dataset.nodeId,
          value: nextValue
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "toggle-task-tag") {
        event.preventDefault();
        event.stopPropagation();
        const tag = actionTarget.dataset.tag;
        const nodeId = actionTarget.dataset.nodeId;
        if (!tag || !nodeId) {
          return;
        }
        const input = actionTarget.closest(".field-block")?.querySelector("input[data-action='update-task-tags']");
        const group = actionTarget.closest(".tag-toggle-group");
        const currentValue = group instanceof HTMLElement
          ? group.dataset.currentTags ?? ""
          : input instanceof HTMLInputElement
          ? input.value
          : "";
        const tags = currentValue.split(/[,\\s]+/).map((value) => value.trim()).filter(Boolean);
        const isPressed = actionTarget.getAttribute("aria-pressed") === "true";
        const nextTags = isPressed
          ? tags.filter((value) => value !== tag)
          : tags.includes(tag)
          ? tags
          : [...tags, tag];
        if (input instanceof HTMLInputElement) {
          input.value = nextTags.join(" ");
        }
        if (group instanceof HTMLElement) {
          group.dataset.currentTags = nextTags.join(" ");
          group.querySelectorAll("[data-action='toggle-task-tag']").forEach((button) => {
            if (!(button instanceof HTMLElement)) {
              return;
            }
            button.setAttribute("aria-pressed", nextTags.includes(button.dataset.tag ?? "") ? "true" : "false");
          });
        }
        vscode.postMessage({
          type: "update-task-tags",
          nodeId,
          value: nextTags.join(" ")
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && (actionTarget.dataset.action === "undo" || actionTarget.dataset.action === "redo")) {
        vscode.postMessage({
          type: actionTarget.dataset.action
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "add-section") {
        vscode.postMessage({
          type: "add-section",
          sectionId: actionTarget.dataset.sectionId
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "add-task") {
        vscode.postMessage({
          type: "add-task",
          sectionId: actionTarget.dataset.sectionId,
          nodeId: actionTarget.dataset.nodeId,
          position: actionTarget.dataset.position
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "duplicate-task") {
        vscode.postMessage({
          type: "duplicate-task",
          nodeId: actionTarget.dataset.nodeId
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "move-task") {
        vscode.postMessage({
          type: "move-task",
          nodeId: actionTarget.dataset.nodeId,
          direction: actionTarget.dataset.direction
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "move-task-to-section") {
        vscode.postMessage({
          type: "move-task-to-section",
          nodeId: actionTarget.dataset.nodeId,
          sectionId: actionTarget.dataset.sectionId
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "move-section") {
        vscode.postMessage({
          type: "move-section",
          sectionId: actionTarget.dataset.sectionId,
          direction: actionTarget.dataset.direction
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "apply-diagnostic-action") {
        vscode.postMessage({
          type: "apply-diagnostic-action",
          code: actionTarget.dataset.diagnosticCode,
          startOffset: Number(actionTarget.dataset.startOffset),
          actionIndex: Number(actionTarget.dataset.actionIndex)
        });
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "preview-edit-viewport") {
        applyPreviewEditViewportAction(actionTarget.dataset.value ?? "");
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "preview-mini-open-date") {
        const field = actionTarget.dataset.previewMiniDateButton;
        if (field && !(actionTarget instanceof HTMLButtonElement && actionTarget.disabled)) {
          togglePreviewMiniCalendar(field);
        }
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "preview-mini-calendar-month") {
        shiftPreviewMiniCalendarMonth(Number(actionTarget.dataset.value ?? "0"));
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "preview-mini-calendar-day") {
        const field = previewMiniCalendarState.field;
        const isoDate = actionTarget.dataset.isoDate;
        if (field && isoDate) {
          const formatted = formatDateForMermaid(isoDate, previewScheduleEditModel.dateFormat);
          if (formatted) {
            setPreviewMiniValue(field, formatted);
          }
          hidePreviewMiniCalendar();
        }
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "preview-mini-duration-step") {
        const value = previewMiniValue("duration");
        const dayDelta = Number(actionTarget.dataset.value ?? "0");
        if (value instanceof HTMLElement && value.dataset.previewMiniDisabled !== "true" && Number.isFinite(dayDelta)) {
          setPreviewMiniValue("duration", stepPreviewMiniDuration(value.dataset.value ?? "", dayDelta));
        }
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "preview-mini-duration-option") {
        const value = previewMiniValue("duration");
        if (value instanceof HTMLElement && value.dataset.previewMiniDisabled !== "true") {
          setPreviewMiniValue("duration", actionTarget.dataset.value ?? "");
        }
        return;
      }
      if (actionTarget instanceof HTMLElement && actionTarget.dataset.action === "preview-mini-apply") {
        applyPreviewMiniEditor();
        return;
      }
      const previewTask = element?.closest("[data-preview-edit-task]");
      if (previewTask instanceof HTMLElement && isPreviewEditMode()) {
        const nodeId = previewTask.dataset.nodeId;
        if (nodeId && previewTask.dataset.editable === "true") {
          selectPreviewMiniTask(nodeId);
        }
        return;
      }
      const diagnostic = element?.closest("[data-diagnostic-code]");
      if (diagnostic instanceof HTMLElement) {
        vscode.postMessage({
          type: "select-diagnostic",
          code: diagnostic.dataset.diagnosticCode,
          startOffset: Number(diagnostic.dataset.startOffset)
        });
        return;
      }
      const sectionRow = element?.closest("tr[data-section-id]");
      if (sectionRow instanceof HTMLElement) {
        vscode.postMessage({
          type: "select-section",
          sectionId: sectionRow.dataset.sectionId
        });
        return;
      }
      const row = element?.closest("tr[data-node-id]");
      if (!row) {
        closeRowActionMenus();
        return;
      }
      closeRowActionMenus();
      vscode.postMessage({
        type: "select-task",
        nodeId: row.dataset.nodeId
      });
    });
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLSelectElement)) {
        return;
      }
      const action = target.dataset.action;
      const nodeId = target.dataset.nodeId;
      if (!action) {
        return;
      }
      if (action === "pick-date") {
        const targetAction = target.dataset.targetAction;
        const formatted = formatDateForMermaid(target.value, target.dataset.dateFormat);
        const textInput = target.closest(".date-field")?.querySelector("input[data-field]:not(.native-date-picker)");
        if (!targetAction || !formatted || !(textInput instanceof HTMLInputElement) || !nodeId) {
          return;
        }
        textInput.value = formatted;
        vscode.postMessage({
          type: targetAction,
          nodeId,
          value: formatted
        });
        return;
      }
      if (action === "replace-source") {
        vscode.postMessage({
          type: action,
          value: target.value
        });
        return;
      }
      if (action === "update-grid-filter-text" || action === "update-grid-filter-severity" || action === "update-grid-sort") {
        vscode.postMessage({
          type: action,
          value: target.value
        });
        return;
      }
      if (action === "update-section-label") {
        vscode.postMessage({
          type: action,
          sectionId: target.dataset.sectionId,
          value: target.value
        });
        return;
      }
      if (action === "update-setting") {
        vscode.postMessage({
          type: action,
          settingKey: target.dataset.settingKey,
          ...(target instanceof HTMLInputElement && target.type === "checkbox"
            ? { checked: target.checked }
            : { value: target.value })
        });
        return;
      }
      if (!nodeId) {
        return;
      }
      vscode.postMessage({
        type: action,
        nodeId,
        value: target.value
      });
    });` : "";
}
