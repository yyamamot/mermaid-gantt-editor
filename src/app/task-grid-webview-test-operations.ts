export function renderTestWebviewOperationBlock(enabled: boolean, webviewGeneration = 0): string {
  const generation = Number.isFinite(webviewGeneration) ? Math.max(0, Math.trunc(webviewGeneration)) : 0;
  return enabled ? `
    window.addEventListener("message", async (event) => {
      const message = event.data;
      if (!message || message.type !== "test-webview-operation") {
        return;
      }
      const operationId = typeof message.operationId === "string" ? message.operationId : "";
      try {
        const detail = await runTestWebviewOperation(message.operation);
        vscode.postMessage({
          type: "test-webview-operation-result",
          webviewGeneration: ${generation},
          operationId,
          ok: true,
          detail
        });
      } catch (error) {
        vscode.postMessage({
          type: "test-webview-operation-result",
          webviewGeneration: ${generation},
          operationId,
          ok: false,
          error: String(error instanceof Error ? error.message : error)
        });
      }
    });
    function runTestWebviewOperation(operation) {
      if (!operation) {
        throw new Error("Unsupported Webview test operation.");
      }
      if (operation.type === "preview-resize") {
        return runPreviewResizeTestOperation(operation);
      }
      if (operation.type === "preview-pan") {
        return runPreviewPanTestOperation(operation);
      }
      throw new Error("Unsupported Webview test operation.");
    }
    function runPreviewPanTestOperation(operation) {
      const deltaX = Number.isFinite(operation.deltaX) ? Number(operation.deltaX) : 0;
      const deltaY = Number.isFinite(operation.deltaY) ? Number(operation.deltaY) : 0;
      if (deltaX === 0 && deltaY === 0) {
        throw new Error("preview-pan requires a non-zero deltaX or deltaY.");
      }
      if (!(previewTarget instanceof HTMLElement)) {
        throw new Error("Preview pan target was not found.");
      }
      const timeoutMs = Number.isFinite(operation.timeoutMs) ? Math.max(250, Number(operation.timeoutMs)) : 5000;
      const deadline = Date.now() + timeoutMs;
      return new Promise((resolve, reject) => {
        const attempt = () => {
          if (!(previewTarget instanceof HTMLElement)) {
            reject(new Error("Preview pan target was detached."));
            return;
          }
          const maxLeft = Math.max(0, previewTarget.scrollWidth - previewTarget.clientWidth);
          const maxTop = Math.max(0, previewTarget.scrollHeight - previewTarget.clientHeight);
          if (maxLeft > 0 || maxTop > 0) {
            const startLeft = previewTarget.scrollLeft;
            const startTop = previewTarget.scrollTop;
            const rect = previewTarget.getBoundingClientRect();
            const startX = rect.left + (rect.width / 2);
            const startY = rect.top + (rect.height / 2);
            const pointerId = 9201;
            dispatchPreviewTestPointer(previewTarget, "pointerdown", pointerId, startX, startY, 4, 1);
            dispatchPreviewTestPointer(previewTarget, "pointermove", pointerId, startX - deltaX, startY - deltaY, 4, 1);
            dispatchPreviewTestPointer(previewTarget, "pointerup", pointerId, startX - deltaX, startY - deltaY, 0, 1);
            resolve({
              type: "preview-pan",
              gesture: "middle-button-drag",
              deltaX,
              deltaY,
              startScrollLeft: startLeft,
              startScrollTop: startTop,
              scrollLeft: previewTarget.scrollLeft,
              scrollTop: previewTarget.scrollTop,
              scrollWidth: previewTarget.scrollWidth,
              scrollHeight: previewTarget.scrollHeight,
              clientWidth: previewTarget.clientWidth,
              clientHeight: previewTarget.clientHeight
            });
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error("Preview pan target did not become scrollable before timeout."));
            return;
          }
          window.setTimeout(attempt, 80);
        };
        attempt();
      });
    }
    function runPreviewResizeTestOperation(operation) {
      const edge = operation.edge === "left" ? "left" : operation.edge === "right" ? "right" : "";
      const dayDelta = Number(operation.dayDelta);
      if (!edge || !Number.isInteger(dayDelta) || dayDelta === 0) {
        throw new Error("preview-resize requires edge and non-zero integer dayDelta.");
      }
      setPreviewEditMode(true);
      const bar = findPreviewTestTask(operation.taskSelector);
      if (!(bar instanceof HTMLElement)) {
        throw new Error("Preview resize target task was not found.");
      }
      if (bar.dataset.editable !== "true") {
        throw new Error("Preview resize target task is not editable.");
      }
      const handle = bar.querySelector('[data-preview-resize-handle="' + edge + '"]');
      if (!(handle instanceof HTMLElement)) {
        throw new Error("Preview resize handle was not found.");
      }
      if (!(previewEditTrack instanceof HTMLElement)) {
        throw new Error("Preview edit track was not found.");
      }
      bar.scrollIntoView({ block: "center", inline: "center" });
      const trackRect = previewEditTrack.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      if (!Number.isFinite(trackRect.width) || trackRect.width <= 0) {
        throw new Error("Preview edit track width is not available.");
      }
      const startX = handleRect.left + (handleRect.width / 2);
      const startY = handleRect.top + (handleRect.height / 2);
      const deltaPixels = (dayDelta / Math.max(1, previewScheduleEditModel.totalDays)) * trackRect.width;
      const pointerId = 9101;
      dispatchPreviewTestPointer(handle, "pointerdown", pointerId, startX, startY, 1);
      dispatchPreviewTestPointer(document, "pointermove", pointerId, startX + deltaPixels, startY, 1);
      dispatchPreviewTestPointer(document, "pointerup", pointerId, startX + deltaPixels, startY, 0);
      scheduleUiReviewSnapshot("test-preview-resize");
      return {
        type: "preview-resize",
        nodeId: bar.dataset.nodeId || "",
        label: bar.dataset.label || "",
        sourceOrder: Number(bar.dataset.sourceOrder),
        edge,
        dayDelta,
        deltaPixels
      };
    }
    function findPreviewTestTask(selector) {
      const candidates = Array.from(document.querySelectorAll("[data-preview-edit-task]"));
      const label = selector && typeof selector.label === "string" ? selector.label : "";
      const sourceOrder = selector && Number.isInteger(selector.sourceOrder) ? String(selector.sourceOrder) : "";
      if (label) {
        const match = candidates.find((candidate) => candidate instanceof HTMLElement && candidate.dataset.label === label);
        if (match instanceof HTMLElement) {
          return match;
        }
      }
      if (sourceOrder) {
        const match = candidates.find((candidate) => candidate instanceof HTMLElement && candidate.dataset.sourceOrder === sourceOrder);
        if (match instanceof HTMLElement) {
          return match;
        }
      }
      return null;
    }
    function dispatchPreviewTestPointer(target, type, pointerId, clientX, clientY, buttons, button = 0) {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        clientX,
        clientY,
        buttons,
        button
      }));
    }
    vscode.postMessage({ type: "test-webview-operation-ready", webviewGeneration: ${generation} });` : "";
}
