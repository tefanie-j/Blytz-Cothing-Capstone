/* ==========================================================================
   fabric-editor.js — Fabric.js canvas editor for editor.html.
   Guards itself with #fabricStage so studio.js's old initEditorPage()
   (which looks for #canvasStage) never fires on this page.

   Shared globals from studio.js still in scope:
     loadState, saveState, hasAnyPrompts, seedEditorObjects,
     renderProgressSteps, renderDesignBrief, garmentSVG,
     uid, esc, showToast, CANVAS_W, CANVAS_H, SHIRT_AREA

   OBJECT SCHEMA (localStorage round-trip contract)
   ─────────────────────────────────────────────────
   { id, name, type, x, y, width, height, rotation, opacity, visible }
   type === 'text'    → text:    { content, font, size, weight, italic, color, align, letterSpacing }
   type === 'image'   → image:   { src, clipRect? }
   type === 'shape'   → shape:   { shapeType, fill, stroke, strokeWidth, borderRadius }
   type === 'drawing' → drawing: { pathData, stroke, strokeWidth }

   ROTATION FIX (center origin)
   ─────────────────────────────
   Fabric's default origin is 'left'/'top', meaning fo.left/top are the
   corner's canvas-space position AFTER rotation is applied — that corner
   orbits the center as the object spins. staticObjDiv() on review.html uses
   `left/top + CSS rotate()`, which rotates around the CSS center, so its
   x/y mean "pre-rotation top-left corner". These two conventions only agree
   when angle === 0. Fix: anchor every non-drawing object at originX/Y='center'
   so fo.left/top = center point (angle-invariant). Convert to/from schema
   x/y at the two boundary functions.

   TODO BACKEND INTEGRATION POINTS — search "TODO(FR-" for each stub.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('fabricStage')) initFabricEditorPage();
});

/* ─────────────────────────────────────────────────────────────────────────
   MAIN INIT
   ───────────────────────────────────────────────────────────────────────── */
function initFabricEditorPage() {
  const state = loadState();
  if (!state.garmentType || !hasAnyPrompts(state)) { window.location.href = 'design.html'; return; }
  if (state.designStatus === 'submitted')           { window.location.href = 'review.html'; return; }

  renderProgressSteps(2);
  renderDesignBrief(state);
  seedEditorObjects(state);
  saveState(state);

  // ── Mutable editor state ──────────────────────────────────────────────
  let side         = state.currentSide === 'back' ? 'back' : 'front';
  let zoom         = 1;
  let activeTool   = 'select';
  let pendingShape = null;      // shape type queued for next canvas click/drag
  let shapePreview = null;      // temp preview rect while dragging a new shape
  let mouseDownPt  = null;
  let undoStack    = [];
  let redoStack    = [];
  let suppressSync = false;

  // Crop state
  let cropMode   = false;
  let cropFrame  = null;
  let cropTarget = null;

  // Erase hover state
  let eraseHovered = null;

  // ── DOM refs ─────────────────────────────────────────────────────────
  const garmentBg  = document.getElementById('canvasGarmentBg');
  const stageEl    = document.getElementById('fabricStage');
  const canvasOuter = document.getElementById('canvasOuter');
  const pfPanel    = document.getElementById('pfPanel');
  const pfBody     = document.getElementById('pfBody');
  const pfTitle    = document.getElementById('pfTitle');
  const layerList  = document.getElementById('layerList');
  const layersEmpty = document.getElementById('layersEmpty');
  const saveText   = document.getElementById('saveIndicatorText');
  const undoBtn    = document.getElementById('undoBtn');
  const redoBtn    = document.getElementById('redoBtn');
  const zoomLabel  = document.getElementById('zoomLabel');
  const drawBar    = document.getElementById('drawBar');
  const cropBar    = document.getElementById('cropBar');
  const brushSize  = document.getElementById('brushSize');
  const brushSizeVal = document.getElementById('brushSizeVal');
  const brushColor = document.getElementById('brushColor');
  const imgInput   = document.getElementById('imageUploadInput');

  garmentBg.innerHTML = garmentSVG(state.garmentType, state.color);

  // ═══════════════════════════════════════════════════════════════════════
  // FABRIC CANVAS
  // ═══════════════════════════════════════════════════════════════════════
  const canvas = new fabric.Canvas('fabricCanvasEl', {
    width: CANVAS_W, height: CANVAS_H,
    backgroundColor: 'transparent',
    preserveObjectStacking: true,
    selection: true,
    stopContextMenu: true,
  });

  // Global handle styling (matches app's violet accent)
  fabric.Object.prototype.set({
    borderColor:        '#7A5CFF',
    cornerColor:        '#7A5CFF',
    cornerStrokeColor:  '#0B0B0E',
    cornerStyle:        'circle',
    cornerSize:         9,
    transparentCorners: false,
    borderDashArray:    [4, 3],
    padding:            4,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SCHEMA ↔ FABRIC CONVERSION
  // ═══════════════════════════════════════════════════════════════════════

  function schemaToFabric(obj, cb) {
    // Non-drawing objects use center origin (see rotation fix note above).
    // schema x/y = pre-rotation top-left → Fabric center = x+w/2, y+h/2
    const cx = obj.x + obj.width  / 2;
    const cy = obj.y + obj.height / 2;
    const common = {
      left: cx, top: cy,
      originX: 'center', originY: 'center',
      angle:   obj.rotation,
      opacity: obj.opacity,
      visible: obj.visible !== false,
      id:      obj.id,
      appName: obj.name,
      appType: obj.type,
    };

    if (obj.type === 'text') {
      const t = obj.text;
      cb(new fabric.Textbox(t.content || 'Text', {
        ...common,
        width:       obj.width,
        fontFamily:  t.font   || 'Inter',
        fontSize:    t.size   || 22,
        fontWeight:  t.weight || '600',
        fontStyle:   t.italic ? 'italic' : 'normal',
        fill:        t.color  || '#F6F4EF',
        textAlign:   t.align  || 'center',
        charSpacing: ((t.letterSpacing || 0) / Math.max(1, t.size || 22)) * 1000,
      }));
      return;
    }

    if (obj.type === 'image') {
      fabric.Image.fromURL(obj.image.src, img => {
        img.set(common);
        img.scaleX = obj.width  / Math.max(1, img.width);
        img.scaleY = obj.height / Math.max(1, img.height);
        if (obj.image.clipRect) {
          const cr = obj.image.clipRect;
          img.clipPath = new fabric.Rect({
            left: cr.left, top: cr.top,
            width: cr.width, height: cr.height,
            originX: 'center', originY: 'center',
            absolutePositioned: true,
          });
        }
        cb(img);
      }, { crossOrigin: 'anonymous' });
      return;
    }

    if (obj.type === 'drawing') {
      // Paths use default left/top origin — center-origin math doesn't
      // apply cleanly to arbitrary path coordinates.
      const p = new fabric.Path(obj.drawing.pathData, {
        left:        obj.x, top: obj.y,
        angle:       obj.rotation,
        opacity:     obj.opacity,
        visible:     obj.visible !== false,
        id:          obj.id, appName: obj.name, appType: 'drawing',
        fill:        null,
        stroke:      obj.drawing.stroke      || '#F6F4EF',
        strokeWidth: obj.drawing.strokeWidth || 4,
        selectable: true, evented: true,
      });
      cb(p);
      return;
    }

    // ── shape ──
    const s = obj.shape;
    const fill        = s.fill        || '#7A5CFF';
    const stroke      = s.strokeWidth > 0 ? (s.stroke || null) : null;
    const strokeWidth = stroke ? (s.strokeWidth || 0) : 0;
    const br          = s.borderRadius || 0;
    let shapeObj;

    switch (s.shapeType) {
      case 'circle':
        shapeObj = new fabric.Ellipse({ ...common, rx: obj.width/2, ry: obj.height/2, fill, stroke, strokeWidth });
        break;
      case 'triangle':
        shapeObj = new fabric.Triangle({ ...common, width: obj.width, height: obj.height, fill, stroke, strokeWidth });
        break;
      case 'star': {
        const pts = [[50,5],[61,35],[95,35],[68,57],[79,91],[50,70],[21,91],[32,57],[5,35],[39,35]]
          .map(([px,py]) => ({ x: (px/100)*obj.width, y: (py/100)*obj.height }));
        shapeObj = new fabric.Polygon(pts, { ...common, fill, stroke, strokeWidth });
        break;
      }
      case 'line':
        shapeObj = new fabric.Rect({ ...common, width: obj.width, height: Math.max(4, obj.height), fill, stroke, strokeWidth });
        break;
      default: // rect
        shapeObj = new fabric.Rect({ ...common, width: obj.width, height: obj.height, rx: br, ry: br, fill, stroke, strokeWidth });
    }
    cb(shapeObj);
  }

  function fabricToSchema(fo) {
    const type = fo.appType;

    let x, y, w, h;
    if (type === 'drawing') {
      // Paths use left/top origin directly
      x = Math.round(fo.left);
      y = Math.round(fo.top);
      w = Math.round(fo.getScaledWidth());
      h = Math.round(fo.getScaledHeight());
    } else {
      // Center origin → pre-rotation top-left
      w = Math.round(fo.getScaledWidth());
      h = Math.round(fo.getScaledHeight());
      x = Math.round(fo.left - w / 2);
      y = Math.round(fo.top  - h / 2);
    }

    const base = {
      id: fo.id, name: fo.appName || type || 'Object', type,
      x, y, width: w, height: h,
      rotation: Math.round(fo.angle),
      opacity:  parseFloat(fo.opacity.toFixed(2)),
      visible:  fo.visible !== false,
    };

    if (type === 'text') {
      base.text = {
        content:       fo.text,
        font:          fo.fontFamily,
        size:          fo.fontSize,
        weight:        String(fo.fontWeight || '400'),
        italic:        fo.fontStyle === 'italic',
        color:         fo.fill || '#F6F4EF',
        align:         fo.textAlign || 'left',
        letterSpacing: Math.round(((fo.charSpacing || 0) / 1000) * fo.fontSize),
      };

    } else if (type === 'image') {
      const src = fo._element ? (fo._element.currentSrc || fo._element.src || '') : '';
      base.image = { src };
      if (fo.clipPath) {
        const cp = fo.clipPath;
        base.image.clipRect = {
          left:   Math.round(cp.left),
          top:    Math.round(cp.top),
          width:  Math.round(cp.width  || cp.getScaledWidth  ? cp.getScaledWidth()  : cp.width),
          height: Math.round(cp.height || cp.getScaledHeight ? cp.getScaledHeight() : cp.height),
        };
      }

    } else if (type === 'drawing') {
      base.drawing = {
        pathData:    fo.path,
        stroke:      fo.stroke      || '#F6F4EF',
        strokeWidth: fo.strokeWidth || 4,
      };

    } else {
      const schema = findSchemaObj(fo.id);
      base.shape = {
        shapeType:    schema?.shape?.shapeType || guessShapeType(fo),
        fill:         fo.fill    || '#7A5CFF',
        stroke:       fo.stroke  || 'transparent',
        strokeWidth:  fo.strokeWidth || 0,
        borderRadius: fo.rx || 0,
      };
    }
    return base;
  }

  function guessShapeType(fo) {
    if (fo instanceof fabric.Ellipse)  return 'circle';
    if (fo instanceof fabric.Triangle) return 'triangle';
    if (fo instanceof fabric.Polygon)  return 'star';
    return 'rect';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════
  const currentObjects    = ()    => side === 'front' ? state.frontObjects : state.backObjects;
  const setCurrentObjects = (arr) => { if (side === 'front') state.frontObjects = arr; else state.backObjects = arr; };
  const findSchemaObj     = (id)  => currentObjects().find(o => o.id === id);

  function loadSideIntoCanvas() {
    suppressSync = true;
    canvas.clear();
    const objs = currentObjects();
    if (!objs.length) { suppressSync = false; renderLayers(); showEmptyProps(); return; }
    let pending = objs.length;
    objs.forEach(obj => schemaToFabric(obj, fo => {
      canvas.add(fo);
      if (--pending === 0) {
        canvas.requestRenderAll();
        suppressSync = false;
        renderLayers();
      }
    }));
  }

  function persist() {
    if (suppressSync) return;
    setCurrentObjects(canvas.getObjects().filter(o => !o.isCropFrame).map(fabricToSchema));
    saveState(state);
    markSaved();
    renderLayers();
  }

  let saveTimer = null;
  function markUnsaved() { saveText.textContent = 'Saving…'; }
  function markSaved()   { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveText.textContent = 'Saved locally'; }, 300); }

  // ═══════════════════════════════════════════════════════════════════════
  // UNDO / REDO
  // ═══════════════════════════════════════════════════════════════════════
  function snapshot() {
    undoStack.push(JSON.stringify({ front: state.frontObjects, back: state.backObjects }));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    syncUrBtns();
  }
  function syncUrBtns() { undoBtn.disabled = !undoStack.length; redoBtn.disabled = !redoStack.length; }

  function applyHistoryState(json) {
    const p = JSON.parse(json);
    state.frontObjects = p.front; state.backObjects = p.back;
    loadSideIntoCanvas(); showEmptyProps(); saveState(state); syncUrBtns();
  }
  undoBtn.addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify({ front: state.frontObjects, back: state.backObjects }));
    applyHistoryState(undoStack.pop());
  });
  redoBtn.addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify({ front: state.frontObjects, back: state.backObjects }));
    applyHistoryState(redoStack.pop());
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CANVAS EVENTS
  // ═══════════════════════════════════════════════════════════════════════
  canvas.on('selection:created', e => { if (!cropMode) onSelect(e.selected[0]); });
  canvas.on('selection:updated', e => { if (!cropMode) onSelect(e.selected[0]); });
  canvas.on('selection:cleared', () => { if (!cropMode) showEmptyProps(); });

  canvas.on('object:moving',   () => { markUnsaved(); refreshXYFields(canvas.getActiveObject()); });
  canvas.on('object:scaling',  () => { markUnsaved(); refreshXYFields(canvas.getActiveObject()); });
  canvas.on('object:rotating', () => { markUnsaved(); refreshXYFields(canvas.getActiveObject()); });
  canvas.on('object:modified', () => { if (!suppressSync) { snapshot(); persist(); } });

  canvas.on('text:changed',        () => markUnsaved());
  canvas.on('text:editing:exited', () => { snapshot(); persist(); });

  canvas.on('path:created', e => {
    const fo = e.path;
    fo.set({ id: uid(), appName: 'Drawing', appType: 'drawing' });
    snapshot(); persist();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TOOL SYSTEM
  // ═══════════════════════════════════════════════════════════════════════
  function activateTool(name) {
    // Clean up previous tool state
    canvas.isDrawingMode = false;
    canvas.selection     = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor   = 'move';
    drawBar.classList.remove('is-visible');
    document.getElementById('shapesFly').classList.remove('is-open');

    // Clean up erase hover
    if (eraseHovered) {
      eraseHovered.set('opacity', eraseHovered._savedOp ?? eraseHovered.opacity);
      eraseHovered = null;
    }

    // Sync tool button active state
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === name)
    );

    activeTool = name;

    switch (name) {
      case 'select':
        canvas.selection   = true;
        canvas.defaultCursor = 'default';
        canvas.getObjects().forEach(o => { if (!o.isCropFrame) { o.selectable = true; o.evented = true; } });
        break;

      case 'draw':
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        syncBrush();
        canvas.defaultCursor = 'crosshair';
        drawBar.classList.add('is-visible');
        document.getElementById('brushColorWrap').style.display = 'flex';
        canvas.discardActiveObject(); canvas.requestRenderAll();
        showEmptyProps();
        break;

      case 'erase':
        canvas.defaultCursor = 'cell';
        canvas.hoverCursor   = 'cell';
        canvas.getObjects().forEach(o => { o.selectable = !o.isCropFrame; o.evented = true; });
        drawBar.classList.add('is-visible');
        document.getElementById('brushColorWrap').style.display = 'none';
        canvas.discardActiveObject(); canvas.requestRenderAll();
        showEmptyProps();
        break;

      case 'text':
        canvas.defaultCursor = 'text';
        canvas.hoverCursor   = 'text';
        canvas.getObjects().forEach(o => { o.selectable = false; o.evented = false; });
        canvas.discardActiveObject(); canvas.requestRenderAll();
        showEmptyProps();
        break;

      case 'image':
        doImageUpload();
        activateTool('select'); // revert after triggering picker
        return;

      case 'shapes':
        document.getElementById('shapesFly').classList.toggle('is-open');
        return; // don't change activeTool — wait for shape selection

      case 'crop': {
        const fo = canvas.getActiveObject();
        if (fo && fo.appType === 'image') {
          enterCropMode(fo);
        } else {
          showToast('Select an image first, then use Crop.', 'error');
          activateTool('select');
        }
        return;
      }
    }
  }

  // Tool sidebar click handler
  document.getElementById('toolSidebar').addEventListener('click', e => {
    const toolBtn = e.target.closest('.tool-btn[data-tool]');
    if (toolBtn) { activateTool(toolBtn.dataset.tool); return; }

    const shapeBtn = e.target.closest('#shapesFly button[data-shape]');
    if (shapeBtn) {
      pendingShape = shapeBtn.dataset.shape;
      document.getElementById('shapesFly').classList.remove('is-open');
      activeTool = 'place-shape';
      canvas.defaultCursor = 'crosshair';
      canvas.hoverCursor   = 'crosshair';
      canvas.getObjects().forEach(o => { o.selectable = false; o.evented = false; });
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === 'shapes')
      );
    }
  });

  // ── Mouse interactions ────────────────────────────────────────────────
  canvas.on('mouse:down', e => {
    const pt = canvas.getPointer(e.e);

    if (activeTool === 'erase') {
      const target = canvas.findTarget(e.e, false);
      if (target && !target.isCropFrame) {
        if (eraseHovered === target) eraseHovered = null;
        canvas.remove(target);
        snapshot(); persist();
        canvas.requestRenderAll();
      }
      return;
    }

    if (activeTool === 'text') {
      doPlaceText(pt.x, pt.y);
      activateTool('select');
      return;
    }

    if (activeTool === 'place-shape') {
      mouseDownPt = pt;
    }
  });

  canvas.on('mouse:move', e => {
    // Shape drag preview
    if (activeTool === 'place-shape' && mouseDownPt && pendingShape) {
      const pt = canvas.getPointer(e.e);
      const dx = pt.x - mouseDownPt.x, dy = pt.y - mouseDownPt.y;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      if (shapePreview) canvas.remove(shapePreview);
      shapePreview = new fabric.Rect({
        left: Math.min(mouseDownPt.x, pt.x), top: Math.min(mouseDownPt.y, pt.y),
        width: Math.abs(dx) || 1, height: Math.abs(dy) || 1,
        fill: 'rgba(122,92,255,.12)', stroke: '#7A5CFF',
        strokeWidth: 1.5, strokeDashArray: [4,3],
        selectable: false, evented: false,
      });
      canvas.add(shapePreview); canvas.requestRenderAll();
    }

    // Erase hover highlight
    if (activeTool === 'erase') {
      const target = canvas.findTarget(e.e, false);
      if (eraseHovered && eraseHovered !== target) {
        eraseHovered.set('opacity', eraseHovered._savedOp ?? 1);
        canvas.requestRenderAll();
        eraseHovered = null;
      }
      if (target && !target.isCropFrame && target !== eraseHovered) {
        target._savedOp = target.opacity;
        target.set('opacity', Math.max(0.2, target.opacity * 0.35));
        eraseHovered = target;
        canvas.requestRenderAll();
      }
    }
  });

  canvas.on('mouse:up', e => {
    if (activeTool === 'place-shape' && pendingShape) {
      const pt = canvas.getPointer(e.e);
      if (shapePreview) { canvas.remove(shapePreview); shapePreview = null; }

      let x, y, w, h;
      if (mouseDownPt) {
        const dx = pt.x - mouseDownPt.x, dy = pt.y - mouseDownPt.y;
        w = Math.max(12, Math.abs(dx)); h = Math.max(12, Math.abs(dy));
        x = Math.min(mouseDownPt.x, pt.x); y = Math.min(mouseDownPt.y, pt.y);
      } else {
        w = 100; h = pendingShape === 'line' ? 6 : 100;
        x = pt.x - w/2; y = pt.y - h/2;
      }
      doPlaceShape(pendingShape, x, y, w, h);
      mouseDownPt = null; pendingShape = null;
      activateTool('select');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PLACEMENT HELPERS
  // ═══════════════════════════════════════════════════════════════════════
  function addSchemaToCanvas(obj) {
    schemaToFabric(obj, fo => {
      canvas.add(fo);
      canvas.setActiveObject(fo);
      canvas.requestRenderAll();
      onSelect(fo);
      snapshot(); persist();
    });
  }

  function doPlaceText(cx, cy) {
    addSchemaToCanvas({
      id: uid(), type: 'text', name: 'Text',
      x: cx - 110, y: cy - 14, width: 220, height: 36,
      rotation: 0, opacity: 1, visible: true,
      text: { content: 'Your Text', font: 'Inter', size: 22, weight: '600', italic: false, color: '#F6F4EF', align: 'center', letterSpacing: 0 },
    });
    // Enter editing mode after a tick so Fabric finishes adding the object
    setTimeout(() => {
      const fo = canvas.getActiveObject();
      if (fo && fo.type === 'textbox') { fo.enterEditing(); fo.selectAll(); canvas.requestRenderAll(); }
    }, 30);
  }

  function doPlaceShape(shapeType, x, y, w, h) {
    addSchemaToCanvas({
      id: uid(), type: 'shape',
      name: shapeType.charAt(0).toUpperCase() + shapeType.slice(1),
      x, y, width: w, height: shapeType === 'line' ? 6 : h,
      rotation: 0, opacity: 1, visible: true,
      shape: { shapeType, fill: '#7A5CFF', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 },
    });
  }

  function doImageUpload(onDone) {
    imgInput.onchange = () => {
      const file = imgInput.files[0]; if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        if (onDone) { onDone(fr.result); imgInput.value = ''; return; }
        addSchemaToCanvas({
          id: uid(), type: 'image', name: 'Image',
          x: SHIRT_AREA.x + 55, y: SHIRT_AREA.y + 80,
          width: 150, height: 150,
          rotation: 0, opacity: 1, visible: true,
          image: { src: fr.result },
        });
        imgInput.value = '';
      };
      fr.readAsDataURL(file);
    };
    imgInput.click();
  }

  // ── Draw brush ────────────────────────────────────────────────────────
  function syncBrush() {
    if (!canvas.freeDrawingBrush) return;
    canvas.freeDrawingBrush.width = parseInt(brushSize.value);
    canvas.freeDrawingBrush.color = brushColor.value;
  }
  brushSize.addEventListener('input', () => { brushSizeVal.textContent = brushSize.value; syncBrush(); });
  brushColor.addEventListener('input', syncBrush);
  document.getElementById('clearDrawBtn').addEventListener('click', () => {
    const drawings = canvas.getObjects().filter(o => o.appType === 'drawing');
    drawings.forEach(o => canvas.remove(o));
    if (drawings.length) { snapshot(); persist(); showToast('Drawings cleared.', 'success'); }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CROP MODE
  // ═══════════════════════════════════════════════════════════════════════
  function enterCropMode(fo) {
    cropMode = true; cropTarget = fo;
    canvas.discardActiveObject();
    canvas.getObjects().forEach(o => { o.selectable = false; o.evented = false; });

    cropFrame = new fabric.Rect({
      left: fo.left, top: fo.top,
      width: fo.getScaledWidth(), height: fo.getScaledHeight(),
      originX: 'center', originY: 'center',
      fill: 'rgba(0,0,0,0)',
      stroke: '#7A5CFF', strokeWidth: 2, strokeDashArray: [6,4],
      hasRotatingPoint: false, lockRotation: true,
      isCropFrame: true, selectable: true, evented: true,
    });
    canvas.add(cropFrame);
    canvas.setActiveObject(cropFrame);
    canvas.requestRenderAll();
    cropBar.classList.add('is-visible');
    showEmptyProps();
    showToast('Drag the handles to set the crop area, then click Apply.', 'success');
  }

  function exitCropMode() {
    if (cropFrame) { canvas.remove(cropFrame); cropFrame = null; }
    cropMode = false; cropTarget = null;
    cropBar.classList.remove('is-visible');
    canvas.getObjects().forEach(o => { if (!o.isCropFrame) { o.selectable = true; o.evented = true; } });
    canvas.requestRenderAll();
  }

  document.getElementById('applyCropBtn').addEventListener('click', () => {
    if (!cropFrame || !cropTarget) return;
    cropTarget.clipPath = new fabric.Rect({
      left: cropFrame.left, top: cropFrame.top,
      width: cropFrame.getScaledWidth(), height: cropFrame.getScaledHeight(),
      originX: 'center', originY: 'center',
      absolutePositioned: true,
    });
    exitCropMode();
    canvas.setActiveObject(cropTarget);
    onSelect(cropTarget);
    snapshot(); persist();
    showToast('Crop applied.', 'success');
  });
  document.getElementById('cancelCropBtn').addEventListener('click', exitCropMode);

  // ═══════════════════════════════════════════════════════════════════════
  // PROPERTIES PANEL
  // ═══════════════════════════════════════════════════════════════════════
  function showEmptyProps() {
    pfPanel.classList.add('hidden');
    const cropBtn = document.getElementById('cropToolBtn');
    if (cropBtn) cropBtn.disabled = true;
  }

  function onSelect(fo) {
    if (!fo || fo.isCropFrame) return;
    pfPanel.classList.remove('hidden');
    pfTitle.textContent = fo.appName || fo.appType || 'Object';
    buildPropertiesPanel(fo);
    const cropBtn = document.getElementById('cropToolBtn');
    if (cropBtn) cropBtn.disabled = fo.appType !== 'image';
  }

  function refreshXYFields(fo) {
    if (!fo) return;
    const $ = id => document.getElementById(id);
    const w = Math.round(fo.getScaledWidth()), h = Math.round(fo.getScaledHeight());
    const isDwg = fo.appType === 'drawing';
    if ($('pfX')) $('pfX').value = isDwg ? Math.round(fo.left) : Math.round(fo.left - w/2);
    if ($('pfY')) $('pfY').value = isDwg ? Math.round(fo.top)  : Math.round(fo.top  - h/2);
    if ($('pfW')) $('pfW').value = w;
    if ($('pfH')) $('pfH').value = h;
    if ($('pfRot'))       $('pfRot').value       = Math.round(fo.angle);
    if ($('pfRotSlider')) $('pfRotSlider').value  = Math.round(fo.angle);
  }

  function buildPropertiesPanel(fo) {
    const type = fo.appType;
    pfBody.innerHTML =
      (type === 'text'    ? htmlText(fo)  : '') +
      (type === 'image'   ? htmlImage(fo) : '') +
      (type === 'shape'   ? htmlShape(fo) : '') +
      (type === 'drawing' ? htmlDraw(fo)  : '') +
      htmlTransform(fo) +
      htmlLayerOrder() +
      htmlActions();
    wirePanel(fo);
  }

  // ── HTML builders ─────────────────────────────────────────────────────

  function htmlText(fo) {
    const fonts = ['Inter','Space Grotesk','JetBrains Mono','Georgia','Arial','Impact','Trebuchet MS'];
    const wts   = [['300','Light'],['400','Regular'],['600','Semibold'],['700','Bold'],['900','Black']];
    return `<div class="pf-group">
      <div class="pf-group-title">Text</div>
      <div class="pf-field"><label>Content</label><textarea id="pfContent" rows="2">${esc(fo.text)}</textarea></div>
      <div class="pf-row">
        <div class="pf-field">
          <label>Font</label>
          <select id="pfFont">${fonts.map(f=>`<option value="${f}"${fo.fontFamily===f?' selected':''}>${f}</option>`).join('')}</select>
        </div>
        <div class="pf-field sm">
          <label>Size</label><input type="number" id="pfSize" value="${fo.fontSize}" min="6" max="140">
        </div>
      </div>
      <div class="pf-row">
        <div class="pf-field">
          <label>Weight</label>
          <select id="pfWeight">${wts.map(([v,l])=>`<option value="${v}"${String(fo.fontWeight)===v?' selected':''}>${l}</option>`).join('')}</select>
        </div>
        <div class="pf-field sm">
          <label>Italic</label>
          <button type="button" id="pfItalic" class="style-toggle-btn${fo.fontStyle==='italic'?' active':''}">I</button>
        </div>
      </div>
      <div class="pf-row">
        <div class="pf-field">
          <label>Color</label>
          <div class="color-row"><input type="color" id="pfTextColor" value="${fo.fill||'#ffffff'}"></div>
        </div>
        <div class="pf-field sm">
          <label>Spacing</label>
          <input type="number" id="pfSpacing" value="${Math.round(((fo.charSpacing||0)/1000)*fo.fontSize)}" min="-5" max="30">
        </div>
      </div>
      <div class="pf-field">
        <label>Align</label>
        <div class="align-row">
          ${['left','center','right'].map(a=>`<button type="button" class="align-btn${fo.textAlign===a?' active':''}" data-align="${a}">${{left:'⇤',center:'⇔',right:'⇥'}[a]}</button>`).join('')}
        </div>
      </div>
    </div>`;
  }

  function htmlImage(fo) {
    const hasCrop = !!fo.clipPath;
    return `<div class="pf-group">
      <div class="pf-group-title">Image</div>
      <div class="pf-field"><button class="btn btn-ghost btn-sm full-w" id="pfReplaceImg">Replace Image</button></div>
      <div class="pf-field"><button class="btn btn-ghost btn-sm full-w stub-btn" id="pfRemoveBg">✦ Remove Background</button></div>
      <div class="pf-field"><button class="btn btn-ghost btn-sm full-w" id="pfCropImg">${hasCrop?'Edit Crop':'Crop Image'}</button></div>
      ${hasCrop?`<div class="pf-field"><button class="btn btn-ghost btn-sm full-w" id="pfClearCrop">Clear Crop</button></div>`:''}
      <p id="removeBgNote" class="stub-note" style="display:none;">
        TODO(FR-03 / UC-04): Wire real background-removal API here.<br>
        Send image src → backend → receive transparent PNG → swap via fabric.Image.fromURL.
      </p>
      <div class="pf-field">
        <label>Opacity</label>
        <div class="range-row">
          <input type="range" id="pfImgOpacity" min="0.05" max="1" step="0.05" value="${fo.opacity}">
          <span id="pfImgOpacityVal">${Math.round(fo.opacity*100)}%</span>
        </div>
      </div>
    </div>`;
  }

  function htmlShape(fo) {
    const schema = findSchemaObj(fo.id);
    const st = schema?.shape?.shapeType || guessShapeType(fo);
    const isRect = st === 'rect';
    return `<div class="pf-group">
      <div class="pf-group-title">Shape · ${st}</div>
      <div class="pf-row">
        <div class="pf-field">
          <label>Fill</label>
          <div class="color-row"><input type="color" id="pfFill" value="${fo.fill||'#7A5CFF'}"></div>
        </div>
        <div class="pf-field">
          <label>Stroke</label>
          <div class="color-row"><input type="color" id="pfStroke" value="${fo.stroke&&fo.stroke!=='null'?fo.stroke:'#ffffff'}"></div>
        </div>
      </div>
      <div class="pf-row">
        <div class="pf-field sm">
          <label>Stroke W</label>
          <input type="number" id="pfStrokeW" value="${fo.strokeWidth||0}" min="0" max="20">
        </div>
        ${isRect?`<div class="pf-field sm"><label>Radius</label><input type="number" id="pfRadius" value="${fo.rx||0}" min="0" max="120"></div>`:''}
      </div>
      <div class="pf-field">
        <label>Opacity</label>
        <div class="range-row">
          <input type="range" id="pfShapeOp" min="0.05" max="1" step="0.05" value="${fo.opacity}">
          <span id="pfShapeOpVal">${Math.round(fo.opacity*100)}%</span>
        </div>
      </div>
    </div>`;
  }

  function htmlDraw(fo) {
    return `<div class="pf-group">
      <div class="pf-group-title">Drawing Path</div>
      <div class="pf-field">
        <label>Stroke Color</label>
        <div class="color-row"><input type="color" id="pfDrawStroke" value="${fo.stroke||'#F6F4EF'}"></div>
      </div>
      <div class="pf-field">
        <label>Opacity</label>
        <div class="range-row">
          <input type="range" id="pfDrawOp" min="0.05" max="1" step="0.05" value="${fo.opacity}">
          <span id="pfDrawOpVal">${Math.round(fo.opacity*100)}%</span>
        </div>
      </div>
    </div>`;
  }

  function htmlTransform(fo) {
    const isDwg = fo.appType === 'drawing';
    const w = Math.round(fo.getScaledWidth()), h = Math.round(fo.getScaledHeight());
    const x = isDwg ? Math.round(fo.left) : Math.round(fo.left - w/2);
    const y = isDwg ? Math.round(fo.top)  : Math.round(fo.top  - h/2);
    return `<div class="pf-group">
      <div class="pf-group-title">Transform</div>
      <div class="pf-row">
        <div class="pf-field sm"><label>X</label><input type="number" id="pfX" value="${x}"></div>
        <div class="pf-field sm"><label>Y</label><input type="number" id="pfY" value="${y}"></div>
        <div class="pf-field sm"><label>W</label><input type="number" id="pfW" value="${w}" min="4"></div>
        <div class="pf-field sm"><label>H</label><input type="number" id="pfH" value="${h}" min="4"></div>
      </div>
      <div class="pf-field">
        <label>Rotation</label>
        <div class="range-row">
          <input type="range" id="pfRotSlider" min="-180" max="180" value="${Math.round(fo.angle)}">
          <input type="number" id="pfRot" value="${Math.round(fo.angle)}" min="-180" max="180">
        </div>
      </div>
      ${fo.appType==='text'||fo.appType==='shape'?`<div class="pf-field">
        <label>Opacity</label>
        <div class="range-row">
          <input type="range" id="pfOpacity" min="0.05" max="1" step="0.05" value="${fo.opacity}">
          <span id="pfOpacityVal">${Math.round(fo.opacity*100)}%</span>
        </div>
      </div>`:''}
    </div>`;
  }

  function htmlLayerOrder() {
    return `<div class="pf-group">
      <div class="pf-group-title">Layer Order</div>
      <div class="pf-btn-row">
        <button class="btn btn-ghost btn-sm" id="pfFront">⤒ Front</button>
        <button class="btn btn-ghost btn-sm" id="pfUp">↑ Up</button>
        <button class="btn btn-ghost btn-sm" id="pfDown">↓ Down</button>
        <button class="btn btn-ghost btn-sm" id="pfBack">⤓ Back</button>
      </div>
    </div>`;
  }

  function htmlActions() {
    return `<div class="pf-group">
      <div class="pf-group-title">Actions</div>
      <div class="pf-field"><button class="btn btn-ghost btn-sm full-w" id="pfAutoLayout">⊹ Auto Layout</button></div>
      <div class="pf-btn-row">
        <button class="btn btn-ghost btn-sm" id="pfDuplicate">Duplicate</button>
        <button class="btn btn-ghost btn-sm danger" id="pfDelete">Delete</button>
      </div>
    </div>`;
  }

  // ── Wire all panel controls to the Fabric object ──────────────────────
  function wirePanel(fo) {
    const commit = () => { snapshot(); persist(); };
    const get    = id => document.getElementById(id);
    const bind   = (id, ev, fn) => { const el = get(id); if (el) el.addEventListener(ev, fn); };

    // Close
    get('pfClose').onclick = () => { showEmptyProps(); canvas.discardActiveObject(); canvas.requestRenderAll(); };

    // ── Text ──
    if (fo.appType === 'text') {
      bind('pfContent', 'input',  e => { fo.set('text', e.target.value); canvas.requestRenderAll(); markUnsaved(); });
      bind('pfContent', 'change', commit);
      bind('pfFont',    'change', e => { fo.set('fontFamily', e.target.value); canvas.requestRenderAll(); commit(); });
      bind('pfSize', 'input',  e => { fo.set('fontSize', Math.max(6, +e.target.value)); canvas.requestRenderAll(); markUnsaved(); });
      bind('pfSize', 'change', commit);
      bind('pfWeight', 'change', e => { fo.set('fontWeight', e.target.value); canvas.requestRenderAll(); commit(); });
      bind('pfItalic', 'click', () => {
        const on = fo.fontStyle !== 'italic';
        fo.set('fontStyle', on ? 'italic' : 'normal');
        get('pfItalic').classList.toggle('active', on);
        canvas.requestRenderAll(); commit();
      });
      bind('pfTextColor', 'input',  e => { fo.set('fill', e.target.value); canvas.requestRenderAll(); markUnsaved(); });
      bind('pfTextColor', 'change', commit);
      bind('pfSpacing', 'input', e => {
        fo.set('charSpacing', (+e.target.value / Math.max(1, fo.fontSize)) * 1000);
        canvas.requestRenderAll(); markUnsaved();
      });
      bind('pfSpacing', 'change', commit);
      pfBody.querySelectorAll('.align-btn').forEach(b => b.addEventListener('click', () => {
        fo.set('textAlign', b.dataset.align);
        pfBody.querySelectorAll('.align-btn').forEach(x => x.classList.toggle('active', x === b));
        canvas.requestRenderAll(); commit();
      }));
    }

    // ── Image ──
    if (fo.appType === 'image') {
      bind('pfReplaceImg', 'click', () => {
        doImageUpload(src => {
          fabric.Image.fromURL(src, img => {
            const w = fo.getScaledWidth(), h = fo.getScaledHeight();
            img.set({ left: fo.left, top: fo.top, angle: fo.angle, opacity: fo.opacity,
              originX: 'center', originY: 'center', id: fo.id, appName: fo.appName, appType: 'image' });
            img.scaleX = w / Math.max(1, img.width);
            img.scaleY = h / Math.max(1, img.height);
            canvas.remove(fo); canvas.add(img); canvas.setActiveObject(img);
            onSelect(img); commit();
          }, { crossOrigin: 'anonymous' });
        });
      });
      // TODO(FR-03 / UC-04): Replace stub below with real background-removal API call.
      bind('pfRemoveBg', 'click', () => {
        get('removeBgNote').style.display = 'block';
        showToast('Background removal: connect remove.bg API here (FR-03).', 'error');
      });
      bind('pfCropImg',   'click', () => enterCropMode(fo));
      bind('pfClearCrop', 'click', () => {
        fo.clipPath = null; canvas.requestRenderAll(); commit();
        buildPropertiesPanel(canvas.getActiveObject()); // re-render to hide 'Edit Crop' toggle
        showToast('Crop cleared.', 'success');
      });
      bind('pfImgOpacity', 'input', e => {
        fo.set('opacity', +e.target.value);
        get('pfImgOpacityVal').textContent = Math.round(+e.target.value*100) + '%';
        canvas.requestRenderAll(); markUnsaved();
      });
      bind('pfImgOpacity', 'change', commit);
    }

    // ── Shape ──
    if (fo.appType === 'shape') {
      bind('pfFill',    'input',  e => { fo.set('fill', e.target.value);        canvas.requestRenderAll(); markUnsaved(); });
      bind('pfFill',    'change', commit);
      bind('pfStroke',  'input',  e => { fo.set('stroke', e.target.value);      canvas.requestRenderAll(); markUnsaved(); });
      bind('pfStroke',  'change', commit);
      bind('pfStrokeW', 'input',  e => { fo.set('strokeWidth', +e.target.value); canvas.requestRenderAll(); markUnsaved(); });
      bind('pfStrokeW', 'change', commit);
      bind('pfRadius',  'input',  e => { const r=+e.target.value; fo.set({rx:r,ry:r}); canvas.requestRenderAll(); markUnsaved(); });
      bind('pfRadius',  'change', commit);
      bind('pfShapeOp', 'input',  e => {
        fo.set('opacity', +e.target.value);
        get('pfShapeOpVal').textContent = Math.round(+e.target.value*100) + '%';
        canvas.requestRenderAll(); markUnsaved();
      });
      bind('pfShapeOp', 'change', commit);
    }

    // ── Drawing ──
    if (fo.appType === 'drawing') {
      bind('pfDrawStroke', 'input',  e => { fo.set('stroke', e.target.value); canvas.requestRenderAll(); markUnsaved(); });
      bind('pfDrawStroke', 'change', commit);
      bind('pfDrawOp', 'input', e => {
        fo.set('opacity', +e.target.value);
        get('pfDrawOpVal').textContent = Math.round(+e.target.value*100) + '%';
        canvas.requestRenderAll(); markUnsaved();
      });
      bind('pfDrawOp', 'change', commit);
    }

    // ── Transform (shared) ──
    const isDwg = fo.appType === 'drawing';
    bind('pfX', 'input',  e => { const w=fo.getScaledWidth();  fo.set('left', isDwg ? +e.target.value : +e.target.value + w/2); fo.setCoords(); canvas.requestRenderAll(); markUnsaved(); });
    bind('pfX', 'change', commit);
    bind('pfY', 'input',  e => { const h=fo.getScaledHeight(); fo.set('top',  isDwg ? +e.target.value : +e.target.value + h/2); fo.setCoords(); canvas.requestRenderAll(); markUnsaved(); });
    bind('pfY', 'change', commit);
    bind('pfW', 'input',  e => { scaleToW(fo, Math.max(4, +e.target.value)); canvas.requestRenderAll(); markUnsaved(); });
    bind('pfW', 'change', commit);
    bind('pfH', 'input',  e => { scaleToH(fo, Math.max(4, +e.target.value)); canvas.requestRenderAll(); markUnsaved(); });
    bind('pfH', 'change', commit);
    bind('pfRotSlider', 'input', e => {
      fo.set('angle', +e.target.value); fo.setCoords(); canvas.requestRenderAll();
      const n = get('pfRot'); if (n) n.value = e.target.value; markUnsaved();
    });
    bind('pfRotSlider', 'change', commit);
    bind('pfRot', 'input', e => {
      fo.set('angle', +e.target.value); fo.setCoords(); canvas.requestRenderAll();
      const s = get('pfRotSlider'); if (s) s.value = e.target.value; markUnsaved();
    });
    bind('pfRot', 'change', commit);
    bind('pfOpacity', 'input', e => {
      fo.set('opacity', +e.target.value);
      get('pfOpacityVal').textContent = Math.round(+e.target.value*100) + '%';
      canvas.requestRenderAll(); markUnsaved();
    });
    bind('pfOpacity', 'change', commit);

    // ── Layer order ──
    bind('pfFront', 'click', () => { canvas.bringToFront(fo);  commit(); });
    bind('pfUp',    'click', () => { canvas.bringForward(fo);  commit(); });
    bind('pfDown',  'click', () => { canvas.sendBackwards(fo); commit(); });
    bind('pfBack',  'click', () => { canvas.sendToBack(fo);    commit(); });

    // ── Actions ──
    bind('pfAutoLayout', 'click', () => {
      const schema = fabricToSchema(fo);
      doAutoLayout(schema);
      fo.set({ left: isDwg ? schema.x : schema.x + schema.width/2,
               top:  isDwg ? schema.y : schema.y + schema.height/2 });
      fo.setCoords(); canvas.requestRenderAll(); refreshXYFields(fo); commit();
      showToast('Auto layout applied.', 'success');
    });
    bind('pfDuplicate', 'click', () => {
      fo.clone(clone => {
        clone.set({ id: uid(), appName: fo.appName + ' Copy', left: fo.left + 20, top: fo.top + 20 });
        canvas.add(clone); canvas.setActiveObject(clone); onSelect(clone); commit();
      });
    });
    bind('pfDelete', 'click', () => {
      canvas.remove(fo); showEmptyProps(); commit(); showToast('Deleted.', 'success');
    });
  }

  function scaleToW(fo, target) { const c = fo.getScaledWidth();  if (c > 0) { fo.scaleX *= target / c; fo.setCoords(); } }
  function scaleToH(fo, target) { const c = fo.getScaledHeight(); if (c > 0) { fo.scaleY *= target / c; fo.setCoords(); } }

  // ═══════════════════════════════════════════════════════════════════════
  // AUTO LAYOUT — rule-based (Ch. III.9 / FR-05)
  // FRONTEND SAMPLE ONLY — fixed heuristics, no ML.
  // ═══════════════════════════════════════════════════════════════════════
  function doAutoLayout(obj) {
    const sa = SHIRT_AREA;
    const jitter = () => (Math.random() - .5) * 20;
    for (let i = 0; i < 8; i++) {
      if (obj.type === 'text') {
        obj.x = sa.x + sa.width/2 - obj.width/2 + jitter();
        obj.y = Math.random() > .5 ? sa.y + sa.height*.72 + jitter() : sa.y + sa.height*.05 + jitter();
      } else if (obj.width < 60 && obj.height < 60) {
        obj.x = sa.x + 8 + Math.random()*50;
        obj.y = sa.y + 8 + jitter();
      } else if (obj.width >= 130) {
        obj.x = sa.x + sa.width/2 - obj.width/2 + jitter();
        obj.y = sa.y + sa.height*.22 + jitter();
      } else {
        obj.x = sa.x + (sa.width  - obj.width)  * Math.random() + jitter();
        obj.y = sa.y + (sa.height - obj.height)  * Math.random() + jitter();
      }
      const overlap = currentObjects().some(o => {
        if (o.id === obj.id || !o.visible) return false;
        const dx = Math.abs((o.x+o.width/2)  - (obj.x+obj.width/2));
        const dy = Math.abs((o.y+o.height/2) - (obj.y+obj.height/2));
        return dx < (o.width+obj.width)*.28 && dy < (o.height+obj.height)*.28;
      });
      if (!overlap) break;
    }
  }

  document.getElementById('autoLayoutAllBtn').addEventListener('click', () => {
    canvas.getObjects().filter(o => !o.isCropFrame).forEach(fo => {
      const schema = fabricToSchema(fo);
      doAutoLayout(schema);
      const isDwg = fo.appType === 'drawing';
      fo.set({ left: isDwg ? schema.x : schema.x + schema.width/2,
               top:  isDwg ? schema.y : schema.y + schema.height/2 });
      fo.setCoords();
    });
    canvas.requestRenderAll(); snapshot(); persist();
    showToast('Auto layout applied to all layers.', 'success');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LAYERS PANEL
  // ═══════════════════════════════════════════════════════════════════════
  const EYE    = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYEOFF = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>`;
  const TYPEICON = t => ({ text:'T', image:'⬜', shape:'◆', drawing:'✏' }[t] || '○');

  function renderLayers() {
    const objs   = canvas.getObjects().filter(o => !o.isCropFrame);
    const active = canvas.getActiveObject();
    layersEmpty.style.display = objs.length ? 'none' : 'block';
    layerList.innerHTML = '';
    [...objs].reverse().forEach(fo => {
      const row = document.createElement('div');
      row.className = 'layer-item' + (active === fo ? ' selected' : '');
      row.innerHTML = `
        <span class="ly-icon">${TYPEICON(fo.appType)}</span>
        <span class="layer-name">${esc(fo.appName || fo.appType)}</span>
        <button class="ly-btn" data-a="vis" title="${fo.visible?'Hide':'Show'}">${fo.visible?EYE():EYEOFF()}</button>
        <button class="ly-btn" data-a="del" title="Delete">✕</button>`;
      row.addEventListener('click', e => {
        if (e.target.closest('[data-a]')) return;
        canvas.setActiveObject(fo); canvas.requestRenderAll(); onSelect(fo); renderLayers();
      });
      row.querySelector('[data-a="vis"]').addEventListener('click', () => {
        fo.set('visible', !fo.visible); canvas.requestRenderAll(); snapshot(); persist();
      });
      row.querySelector('[data-a="del"]').addEventListener('click', () => {
        if (fo === canvas.getActiveObject()) showEmptyProps();
        canvas.remove(fo); snapshot(); persist();
      });
      layerList.appendChild(row);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SIDE TOGGLE
  // ═══════════════════════════════════════════════════════════════════════
  document.getElementById('editorSideToggle').addEventListener('click', e => {
    const b = e.target.closest('button[data-side]');
    if (!b || b.dataset.side === side) return;
    side = b.dataset.side; state.currentSide = side;
    document.querySelectorAll('#editorSideToggle button').forEach(x => x.classList.toggle('active', x === b));
    canvas.discardActiveObject(); showEmptyProps();
    loadSideIntoCanvas(); saveState(state);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ZOOM (CSS scale on canvas-outer, Fabric internal zoom stays 1)
  // ═══════════════════════════════════════════════════════════════════════
  function applyZoom() {
    canvasOuter.style.transform = `scale(${zoom})`;
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }
  document.getElementById('zoomInBtn').addEventListener('click',    () => { zoom = Math.min(2.5, +(zoom+.1).toFixed(1)); applyZoom(); });
  document.getElementById('zoomOutBtn').addEventListener('click',   () => { zoom = Math.max(0.25, +(zoom-.1).toFixed(1)); applyZoom(); });
  document.getElementById('fitScreenBtn').addEventListener('click', () => { zoom = 1; applyZoom(); });

  // ═══════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    const editable = tag === 'input' || tag === 'textarea' || tag === 'select';
    const fo = canvas.getActiveObject();
    const editing = fo && fo.isEditing;

    // Tool shortcuts (only when not typing)
    if (!editable && !editing) {
      const key = e.key.toLowerCase();
      if (key === 'v')                            activateTool('select');
      if (key === 'd' && !e.ctrlKey && !e.metaKey) activateTool('draw');
      if (key === 'e' && !e.ctrlKey)              activateTool('erase');
      if (key === 't' && !e.ctrlKey)              activateTool('text');
      if (key === 'i' && !e.ctrlKey)              activateTool('image');
      if (key === 's' && !e.ctrlKey && !e.metaKey) activateTool('shapes');
      if (key === 'c' && !e.ctrlKey && !e.metaKey) activateTool('crop');
      if ((e.key === 'Delete' || e.key === 'Backspace') && fo) {
        e.preventDefault(); canvas.remove(fo); showEmptyProps(); snapshot(); persist();
      }
      if (e.key === 'Escape') {
        exitCropMode(); canvas.discardActiveObject(); showEmptyProps(); canvas.requestRenderAll();
        activateTool('select');
      }
    }

    // Global shortcuts
    if ((e.ctrlKey||e.metaKey) && e.key === 'z') { e.preventDefault(); undoBtn.click(); }
    if ((e.ctrlKey||e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redoBtn.click(); }
    if ((e.ctrlKey||e.metaKey) && e.key === 'd' && fo) { e.preventDefault(); document.getElementById('pfDuplicate')?.click(); }

    // Security: block common save/print shortcuts (FR-14)
    if ((e.ctrlKey||e.metaKey) && ['s','p'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      showToast('Downloading the draft isn\'t available — submit your design when ready.', 'error');
    }
    if (e.key === 'PrintScreen') e.preventDefault();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CLIENT-SIDE SECURITY — FR-14 / Ch. I.4
  // Deterrent only — does not prevent screen recording or photographing.
  // ═══════════════════════════════════════════════════════════════════════
  document.getElementById('canvasScroll').addEventListener('contextmenu', e => e.preventDefault());

  // ═══════════════════════════════════════════════════════════════════════
  // HELP MODAL
  // ═══════════════════════════════════════════════════════════════════════
  document.getElementById('helpBtn').addEventListener('click', () => {
    document.getElementById('helpModal').classList.add('is-open');
  });
  document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', e => {
    e.target.closest('.modal-overlay')?.classList.remove('is-open');
  }));

  // ═══════════════════════════════════════════════════════════════════════
  // REVIEW
  // ═══════════════════════════════════════════════════════════════════════
  document.getElementById('reviewBtn').addEventListener('click', () => {
    persist();
    window.location.href = 'review.html';
  });

  // ═══════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════
  loadSideIntoCanvas();
  activateTool('select');
  applyZoom();
  syncUrBtns();
}
