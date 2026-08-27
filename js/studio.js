/* ==========================================================================
   VISUALIZE STUDIO — studio.js
   Frontend-only prototype. No AI, no backend, no database.
   All "generation" and "submission" is simulated using predefined sample data.
   ========================================================================== */

// ============================================================
// FUTURE AI / BACKEND INTEGRATION POINTS
// ============================================================
// This file contains frontend-only simulation code.
// Every section marked with "FRONTEND SAMPLE ONLY" represents
// a place where real AI or backend calls will be needed.
// ============================================================

const STORAGE_KEY = 'visualizeDesignState';

// ---- Garment types & area definitions ----
const GARMENT_TYPES = [
  { id: 'tshirt', label: 'T-Shirt' },
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'longsleeve', label: 'Long Sleeve' },
  { id: 'polo', label: 'Polo' }
];
const FITS = ['Female', 'Male', 'Unisex', 'Kids'];
const COLORS = [
  { name: 'Black', hex: '#0B0B0E' }, { name: 'White', hex: '#F6F4EF' },
  { name: 'Gray', hex: '#8A8A93' }, { name: 'Red', hex: '#E24C4C' },
  { name: 'Blue', hex: '#3B6FE0' }, { name: 'Navy', hex: '#1a2a4a' },
  { name: 'Green', hex: '#3ECF8E' }, { name: 'Purple', hex: '#7A5CFF' },
  { name: 'Orange', hex: '#FF8A3D' }
];

const FRONT_AREAS = [
  { id: 'full-front', label: 'Full Front' },
  { id: 'left-chest', label: 'Left Chest' },
  { id: 'center-chest', label: 'Center Chest' },
  { id: 'right-chest', label: 'Right Chest' },
  { id: 'upper-front', label: 'Upper Front' },
  { id: 'lower-front', label: 'Lower Front' },
  { id: 'left-sleeve', label: 'Left Sleeve' },
  { id: 'right-sleeve', label: 'Right Sleeve' }
];
const BACK_AREAS = [
  { id: 'full-back', label: 'Full Back' },
  { id: 'upper-back', label: 'Upper Back' },
  { id: 'center-back', label: 'Center Back' },
  { id: 'lower-back', label: 'Lower Back' },
  { id: 'left-sleeve', label: 'Left Sleeve' },
  { id: 'right-sleeve', label: 'Right Sleeve' }
];

// ---- Default state ----
function defaultState() {
  return {
    garmentType: '', fit: '', color: '#0B0B0E', colorName: 'Black',
    promptMode: 'overall', // 'overall' | 'individual'
    overall: { front: null, back: null, frontBack: null },
    individual: { front: [], back: [] },
    frontObjects: [], backObjects: [],
    designStatus: 'draft', // 'draft' | 'submitted'
    currentSide: 'front',

    // Chat interface state
    conversationHistory: [],   // [{role: 'user'|'assistant', content, attachedImage?, designs?}]
    selectedDesignId: null,    // id string of the currently selected design ('d1'–'d4')
    selectedDesignObjects: [], // the objects array of the selected design, pixel coords
  };
}
function loadState() {
  try { return Object.assign(defaultState(), JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
  catch { return defaultState(); }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ---- Garment SVG silhouette ----
function garmentSVG(type, hex, w, h) {
  w = w || 200; h = h || 260;
  const stroke = hex === '#F6F4EF' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.16)';
  const longSleeve = ['hoodie', 'longsleeve'].includes(type);
  const sleeveH = longSleeve ? 160 : 70;
  const hood = type === 'hoodie';
  const collar = type === 'polo';
  const sleeves = `
    <rect x="16" y="52" width="28" height="${sleeveH}" rx="11" fill="${hex}" stroke="${stroke}" stroke-width="1.2"/>
    <rect x="156" y="52" width="28" height="${sleeveH}" rx="11" fill="${hex}" stroke="${stroke}" stroke-width="1.2"/>`;
  const hoodSVG = hood ? `<path d="M68,36 Q100,6 132,36 L132,54 Q100,30 68,54 Z" fill="${hex}" stroke="${stroke}" stroke-width="1.2"/>` : '';
  const collarSVG = collar ? `<path d="M80,38 L100,56 L120,38 L120,48 L100,64 L80,48 Z" fill="rgba(0,0,0,0.15)"/>` : '';
  return `<svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
    ${sleeves}
    <path d="M48,54 Q48,38 64,36 L80,36 Q100,50 120,36 L136,36 Q152,38 152,54 L152,238 Q152,248 142,248 L58,248 Q48,248 48,238 Z" fill="${hex}" stroke="${stroke}" stroke-width="1.3"/>
    ${collarSVG}${hoodSVG}
  </svg>`;
}

// ---- Shared escape helper ----
function esc(str) {
  const d = document.createElement('div'); d.textContent = str == null ? '' : String(str); return d.innerHTML;
}

// ---- Shared object markup (reused by prompt page preview, editor, review) ----
function objectInnerHTML(obj) {
  if (obj.type === 'text') {
    const j = obj.text.align === 'left' ? 'flex-start' : obj.text.align === 'right' ? 'flex-end' : 'center';
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:${j};text-align:${obj.text.align};font-family:'${obj.text.font}',sans-serif;font-size:${obj.text.size}px;font-weight:${obj.text.weight};font-style:${obj.text.italic?'italic':'normal'};color:${obj.text.color};letter-spacing:${obj.text.letterSpacing}px;overflow:hidden;">${esc(obj.text.content)}</div>`;
  }
  if (obj.type === 'image') {
    return `<div style="width:100%;height:100%;overflow:hidden;"><img src="${obj.image.src}" style="width:100%;height:100%;object-fit:contain;" alt="${esc(obj.name)}"></div>`;
  }
  const s = obj.shape;
  let svg;
  const sw = s.strokeWidth || 0;
  const sc = sw > 0 ? (s.stroke && s.stroke !== 'transparent' ? s.stroke : 'none') : 'none';
  if (s.shapeType === 'circle')   svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><circle cx="50" cy="50" r="46" fill="${s.fill}" stroke="${sc}" stroke-width="${sw}"/></svg>`;
  else if (s.shapeType === 'triangle') svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,4 96,94 4,94" fill="${s.fill}" stroke="${sc}" stroke-width="${sw}"/></svg>`;
  else if (s.shapeType === 'star') svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="${s.fill}" stroke="${sc}" stroke-width="${sw}"/></svg>`;
  else if (s.shapeType === 'line') svg = `<svg viewBox="0 0 100 10" preserveAspectRatio="none"><line x1="2" y1="5" x2="98" y2="5" stroke="${s.fill}" stroke-width="${Math.max(2, sw)}"/></svg>`;
  else svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="2" y="2" width="96" height="96" rx="6" fill="${s.fill}" stroke="${sc}" stroke-width="${sw}"/></svg>`;
  return `<div style="width:100%;height:100%;">${svg}</div>`;
}
function staticObjDiv(obj) {
  if (!obj.visible) return '';
  return `<div style="position:absolute;left:${obj.x}px;top:${obj.y}px;width:${obj.width}px;height:${obj.height}px;opacity:${obj.opacity};transform:rotate(${obj.rotation}deg);pointer-events:none;">${objectInnerHTML(obj)}</div>`;
}

// ============================================================
// INIT — dispatches to correct page controller on DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initModals();
  renderProgressSteps();
  if (document.getElementById('garmentTypeGrid')) initDesignPage();
  if (document.getElementById('chatThread')) initChatPage();
  if (document.getElementById('canvasStage')) initEditorPage();
  if (document.getElementById('reviewShell')) initReviewPage();
});

// ---- Generic modal wiring ----
function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => o.classList.remove('is-open')));
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('is-open'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.is-open').forEach(o => o.classList.remove('is-open'));
  });
  const hBtn = document.getElementById('helpBtn');
  const hMod = document.getElementById('helpModal');
  if (hBtn && hMod) hBtn.addEventListener('click', () => hMod.classList.add('is-open'));
}

function renderProgressSteps(active) {
  const wrap = document.getElementById('progressSteps');
  if (!wrap) return;
  // Auto-detect from page
  if (!active) {
    const path = location.pathname;
    if (path.includes('editor')) active = 2;
    else if (path.includes('review')) active = 3;
    else active = 1;
  }
  const steps = [{ n: 1, label: 'Design Prompt' }, { n: 2, label: 'Manual Edit' }, { n: 3, label: 'Review' }];
  wrap.innerHTML = steps.map((s, i) => `
    <div class="step-item ${s.n === active ? 'active' : s.n < active ? 'completed' : ''}">
      <span class="step-circle">${s.n < active ? '✓' : s.n}</span>
      <span class="step-label">${s.label}</span>
    </div>
    ${i < steps.length - 1 ? '<div class="step-connector"></div>' : ''}
  `).join('');
}

// ---- Design Brief (shown at top of editor — garment info + prompt summary) ----
function renderDesignBrief(state) {
  const brief = document.getElementById('designBrief');
  if (!brief) return;

  // Garment info row — shows what was selected on the Design Prompt page
  const garmentLabel = GARMENT_TYPES.find(t => t.id === state.garmentType)?.label || state.garmentType || '—';
  const colorSwatch  = state.color ? `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${state.color};border:1px solid rgba(255,255,255,0.2);vertical-align:middle;margin-right:6px;"></span>` : '';
  const colorLabel   = state.colorName || state.color || '—';
  const fitLabel     = state.fit || '—';

  let promptHtml = '';
  if (state.promptMode === 'overall') {
    const rows = [];
    if (state.overall.frontBack) rows.push(`<div class="brief-item"><strong>Front &amp; Back</strong>${esc(state.overall.frontBack)}</div>`);
    if (state.overall.front)     rows.push(`<div class="brief-item"><strong>Front</strong>${esc(state.overall.front)}</div>`);
    if (state.overall.back)      rows.push(`<div class="brief-item"><strong>Back</strong>${esc(state.overall.back)}</div>`);
    promptHtml = rows.join('') || '<span class="brief-empty">No prompts.</span>';
  } else {
    const cols = ['front', 'back'].map(side => {
      const arr = state.individual[side];
      if (!arr || !arr.length) return '';
      return `<div><div class="brief-group-label">${side.toUpperCase()}</div>${arr.map(p => `<div class="brief-item"><strong>${esc(p.label)}</strong>${esc(p.prompt)}</div>`).join('')}</div>`;
    }).filter(Boolean);
    promptHtml = cols.length ? `<div class="brief-columns">${cols.join('')}</div>` : '<span class="brief-empty">No prompts.</span>';
  }

  brief.innerHTML = `
    <div class="design-brief-head">
      <h3>Design Brief</h3>
      <a href="design.html" class="link-accent" style="font-size:12px;">← Back to Prompts</a>
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--line);">
      <span style="font-family:var(--font-mono);font-size:12px;color:rgba(246,244,239,0.55);">
        GARMENT: <strong style="color:var(--paper);">${esc(garmentLabel)}</strong>
      </span>
      <span style="font-family:var(--font-mono);font-size:12px;color:rgba(246,244,239,0.55);">
        FIT: <strong style="color:var(--paper);">${esc(fitLabel)}</strong>
      </span>
      <span style="font-family:var(--font-mono);font-size:12px;color:rgba(246,244,239,0.55);">
        COLOR: ${colorSwatch}<strong style="color:var(--paper);">${esc(colorLabel)}</strong>
      </span>
    </div>
    ${promptHtml}`;
}

/* ==========================================================================
   PAGE 1 — DESIGN CREATION / PROMPT BUILDER (REDIRECT TO CHAT)
   ========================================================================== */
function initDesignPage() {
  // Redirect to chat interface
  window.location.href = 'design.html';
}

// ==========================================================================
// PAGE 1 — DESIGN PROMPT / CHAT INTERFACE
// ==========================================================================
function initChatPage() {
  const state = loadState();
  const chatThread = document.getElementById('chatThread');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const garmentPickerBtn = document.getElementById('garmentPickerBtn');
  const garmentDropdown = document.getElementById('garmentDropdown');
  const colorPickerBtn = document.getElementById('colorPickerBtn');
  const colorDropdown = document.getElementById('colorDropdown');
  const skipToEditorBtn = document.getElementById('skipToEditorBtn');
  const attachBtn = document.getElementById('attachBtn');
  const garmentPicker = document.getElementById('garmentPicker');
  const colorPicker = document.getElementById('colorPicker');

  // Initialize progress steps
  renderProgressSteps(1);

  // Populate garment dropdown
  function populateGarmentDropdown() {
    garmentDropdown.innerHTML = GARMENT_TYPES.map(g => `
      <button class="dropdown-item" data-id="${g.id}">${g.label}</button>
    `).join('');

    garmentDropdown.querySelectorAll('.dropdown-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const garmentId = btn.dataset.id;
        const garment = GARMENT_TYPES.find(g => g.id === garmentId);
        if (garment) {
          state.garmentType = garmentId;
          garmentPickerBtn.innerHTML = `👕 ${garment.label} ▾`;
          saveState(state);
          // Close dropdown
          garmentDropdown.classList.remove('is-open');
        }
      });
    });
  }

  // Populate color dropdown
  function populateColorDropdown() {
    colorDropdown.innerHTML = COLORS.map(c => `
      <button class="dropdown-item" data-name="${c.name}" data-hex="${c.hex}">
        <span class="color-swatch" style="background:${c.hex};"></span>${c.name}
      </button>
    `).join('');

    colorDropdown.querySelectorAll('.dropdown-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const colorName = btn.dataset.name;
        const colorHex = btn.dataset.hex;
        const color = COLORS.find(c => c.name === colorName);
        if (color) {
          state.color = colorHex;
          state.colorName = colorName;
          colorPickerBtn.innerHTML = `<span class="color-swatch" style="background:${colorHex};"></span>${colorName} ▾`;
          saveState(state);
          // Close dropdown
          colorDropdown.classList.remove('is-open');
        }
      });
    });
  }

  // Toggle dropdowns
  garmentPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    garmentDropdown.classList.toggle('is-open');
    // Close other dropdown
    colorDropdown.classList.remove('is-open');
  });

  colorPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    colorDropdown.classList.toggle('is-open');
    // Close other dropdown
    garmentDropdown.classList.remove('is-open');
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!garmentPicker.contains(e.target) && !colorPicker.contains(e.target)) {
      garmentDropdown.classList.remove('is-open');
      colorDropdown.classList.remove('is-open');
    }
  });

  // Handle chat input
  function updateSendButtonState() {
    sendBtn.disabled = !chatInput.value.trim();
  }

  chatInput.addEventListener('input', () => {
    updateSendButtonState();
    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
  });

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // Handle send button
  sendBtn.addEventListener('click', () => {
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    // Add user message to conversation
    const userMsg = {
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    };
    state.conversationHistory.push(userMsg);

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    updateSendButtonState();

    // Simulate thinking delay
    sendBtn.disabled = true;
    sendBtn.innerHTML = '⏳';

    setTimeout(() => {
      // Generate simulated AI response with sample designs
      const aiResponse = generateAISampleResponse(state);
      state.conversationHistory.push(aiResponse);

      // Re-enable send button
      sendBtn.disabled = false;
      sendBtn.innerHTML = '↑';

      // Save state and re-render chat
      saveState(state);
      renderChatThread();

      // Auto-scroll to bottom
      chatThread.scrollTop = chatThread.scrollHeight;
    }, 1000);
  });

  // Handle attach button (placeholder for future image upload)
  attachBtn.addEventListener('click', () => {
    showToast('Image attachment coming soon!', 'info');
  });

  // Handle skip to editor button
  skipToEditorBtn.addEventListener('click', () => {
    if (canProceedToEditor(state)) {
      // Ensure we have seed objects if needed
      seedEditorObjects(state);
      saveState(state);
      window.location.href = 'editor.html';
    } else {
      showToast('Please select a garment, color, and provide at least one design prompt before proceeding.', 'warning');
    }
  });

  // Initialize UI
  populateGarmentDropdown();
  populateColorDropdown();

  // Set initial button states based on loaded state
  if (state.garmentType) {
    const garment = GARMENT_TYPES.find(g => g.id === state.garmentType);
    if (garment) {
      garmentPickerBtn.innerHTML = `👕 ${garment.label} ▾`;
    }
  }

  if (state.color && state.colorName) {
    colorPickerBtn.innerHTML = `<span class="color-swatch" style="background:${state.color};"></span>${state.colorName} ▾`;
  }

  updateSendButtonState();

  // Render existing conversation
  renderChatThread();

  // Auto-scroll to bottom
  if (state.conversationHistory.length > 0) {
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  // Helper function to check if user can proceed to editor
  function canProceedToEditor(state) {
    if (!state.garmentType || !state.color) return false;
    return hasAnyPrompts(state);
  }

  // Helper function to render chat thread
  function renderChatThread() {
    chatThread.innerHTML = state.conversationHistory.map(msg => {
      const isUser = msg.role === 'user';
      const avatar = isUser ? '👤' : '🤖';
      const bgClass = isUser ? 'user-msg' : 'assistant-msg';

      let content = esc(msg.content);

      // If this is an assistant message with sample designs, render them specially
      if (!isUser && msg.designs && msg.designs.length > 0) {
        content += '<div class="design-samples">';
        msg.designs.forEach(design => {
          content += `
            <div class="design-sample" data-design-id="${design.id}">
              <div class="design-sample-header">
                <strong>${design.label}</strong>
                <button class="select-design-btn">Select this design</button>
              </div>
              <div class="design-sample-preview">
                ${design.preview}
              </div>
            </div>
          `;
        });
        content += '</div>';
      }

      return `
        <div class="chat-message ${bgClass}">
          <div class="message-avatar">${avatar}</div>
          <div class="message-content">
            <div class="message-text">${content}</div>
            <div class="message-time">${formatTime(new Date(msg.timestamp))}</div>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners to design sample buttons
    chatThread.querySelectorAll('.select-design-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const designSample = e.target.closest('.design-sample');
        const designId = designSample.dataset.designId;
        selectDesign(designId);
      });
    });
  }

  // Helper function to select a design
  function selectDesign(designId) {
    state.selectedDesignId = designId;

    // Find the design object from the last assistant message
    const lastAssistantMsg = state.conversationHistory
      .slice()
      .reverse()
      .find(msg => msg.role === 'assistant' && msg.designs);

    if (lastAssistantMsg) {
      const selectedDesign = lastAssistantMsg.designs.find(d => d.id === designId);
      if (selectedDesign) {
        state.selectedDesignObjects = selectedDesign.objects || [];

        // Add the selected design to prompts based on mode
        if (state.promptMode === 'overall') {
          // For simplicity, we'll add as overall front prompt
          // In a real implementation, this would be more sophisticated
          state.overall.front = selectedDesign.prompt || '';
        } else {
          // Add to individual areas - default to front
          state.individual.front.push({
            areaId: 'full-front',
            label: 'Full Front',
            prompt: selectedDesign.prompt || ''
          });
        }

        saveState(state);
        showToast('Design selected! You can now proceed to the editor.', 'success');

        // Re-render chat to show selection
        renderChatThread();
      }
    }
  }

  // Helper function to generate sample AI response
  function generateAISampleResponse(state) {
    // Generate 4 sample designs based on garment type and color
    const designs = [];

    // Base prompt variations
    const basePrompts = [
      'A minimalist geometric logo on the chest',
      'Vintage distressed text with mountain silhouette',
      'Abstract colorful pattern covering front and back',
      'Bold typographic statement with underline accent'
    ];

    basePrompts.forEach((prompt, index) => {
      const designId = `d${index + 1}`;
      designs.push({
        id: designId,
        label: `Design Option ${index + 1}`,
        prompt: prompt,
        // In a real implementation, this would be actual preview images/SVG
        preview: `<div class="design-placeholder">
                  <div class="placeholder-text">Design Preview</div>
                  <div class="placeholder-details">${state.garmentType} • ${state.colorName}</div>
                </div>`,
        // Store the actual objects that would go on canvas
        objects: generateSampleObjects(state, prompt)
      });
    });

    return {
      role: 'assistant',
      content: `Here are 4 design options based on your selection of a ${state.garmentType} in ${state.colorName}. Click on any design to select it for editing:`,
      designs: designs,
      timestamp: Date.now()
    };
  }

  // Helper function to generate sample objects for a design prompt
  function generateSampleObjects(state, prompt) {
    // Return some sample objects that would be placed on canvas
    const objects = [];

    // Add a text object
    objects.push({
      id: uid(),
      type: 'text',
      name: 'Sample Text',
      x: 115,
      y: 200,
      width: 150,
      height: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      text: {
        content: prompt.split(' ').slice(0, 3).join(' '),
        font: 'Space Grotesk',
        size: 24,
        weight: '600',
        italic: false,
        color: state.color === '#F6F4EF' ? '#0B0B0E' : '#F6F4EF',
        align: 'center',
        letterSpacing: 1
      }
    });

    // Add a shape object
    objects.push({
      id: uid(),
      type: 'shape',
      name: 'Sample Shape',
      x: 115,
      y: 100,
      width: 150,
      height: 80,
      rotation: 0,
      opacity: 0.8,
      visible: true,
      shape: {
        shapeType: 'circle',
        fill: state.color === '#F6F4EF' ? '#7A5CFF' : '#F6F4EF',
        stroke: 'transparent',
        strokeWidth: 0
      }
    });

    return objects;
  }

  // Helper function to format time
  function formatTime(date) {
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
}


// ---- Conflict detection for overall prompts ----
function getOverallConflict(state, requestedKey) {
  const hasFront = Boolean(state.overall.front);
  const hasBack = Boolean(state.overall.back);
  const hasFrontBack = Boolean(state.overall.frontBack);

  if (requestedKey === 'frontBack') {
    if (hasFront && hasBack) {
      return { msg: 'Overall Front & Back conflicts with your existing Overall Front and Overall Back prompts. Remove them to continue.', clear: s => { s.overall.front = null; s.overall.back = null; } };
    }
    if (hasFront) {
      return { msg: 'Overall Front & Back includes the front design. Remove the existing Overall Front prompt to continue.', clear: s => { s.overall.front = null; } };
    }
    if (hasBack) {
      return { msg: 'Overall Front & Back includes the back design. Remove the existing Overall Back prompt to continue.', clear: s => { s.overall.back = null; } };
    }
  }
  if (requestedKey === 'front' && hasFrontBack) {
    return { msg: 'You already have an Overall Front & Back prompt that covers the front. Remove it to add an Overall Front prompt separately.', clear: s => { s.overall.frontBack = null; } };
  }
  if (requestedKey === 'back' && hasFrontBack) {
    return { msg: 'You already have an Overall Front & Back prompt that covers the back. Remove it to add an Overall Back prompt separately.', clear: s => { s.overall.frontBack = null; } };
  }
  return null;
}

function hasAnyPrompts(state) {
  if (state.promptMode === 'overall') {
    return Boolean(state.overall.front || state.overall.back || state.overall.frontBack);
  }
  return state.individual.front.length > 0 || state.individual.back.length > 0;
}

// ---- Seed sample editor objects from prompts (FRONTEND SAMPLE ONLY) ----
function seedEditorObjects(state) {
  // ============================================================
  // FRONTEND SAMPLE DATA ONLY
  // ============================================================
  // This is NOT AI generation.
  // The real system would send garment type, fit, color + prompts
  // to the AI service and receive back generated design objects.
  // For this prototype, predefined sample objects are placed
  // inside the shirt silhouette so the editor starts with content.
  // ============================================================

  if (state.frontObjects.length || state.backObjects.length) return; // already seeded — do not overwrite

  // Choose text color that contrasts with the selected garment color
  const lightColors = ['#F6F4EF', '#8A8A93', '#F2C94C', '#3ECF8E'];
  const textColor = lightColors.includes(state.color) ? '#0B0B0E' : '#F6F4EF';

  // Shirt body in the 380×480 canvas roughly occupies x:60–320, y:30–450.
  // Objects are placed well within that area so they appear on the shirt immediately.
  const makeSampleFront = () => [
    {
      id: uid(), type: 'shape', name: 'Main Graphic',
      x: 115, y: 110, width: 150, height: 150,
      rotation: 0, opacity: 1, visible: true,
      shape: { shapeType: 'circle', fill: '#7A5CFF', stroke: 'transparent', strokeWidth: 0 }
    },
    {
      id: uid(), type: 'shape', name: 'Chest Logo',
      x: 80, y: 55, width: 40, height: 40,
      rotation: 0, opacity: 1, visible: true,
      shape: { shapeType: 'star', fill: '#FFB020', stroke: 'transparent', strokeWidth: 0 }
    },
    {
      id: uid(), type: 'text', name: 'Front Typography',
      x: 80, y: 285, width: 220, height: 40,
      rotation: 0, opacity: 1, visible: true,
      text: { content: 'YOUR DESIGN', font: 'Space Grotesk', size: 19, weight: '700', italic: false, color: textColor, align: 'center', letterSpacing: 2 }
    }
  ];

  const makeSampleBack = () => [
    {
      id: uid(), type: 'shape', name: 'Back Graphic',
      x: 100, y: 90, width: 180, height: 160,
      rotation: 0, opacity: 0.9, visible: true,
      shape: { shapeType: 'triangle', fill: '#7A5CFF', stroke: 'transparent', strokeWidth: 0 }
    },
    {
      id: uid(), type: 'text', name: 'Back Typography',
      x: 80, y: 275, width: 220, height: 34,
      rotation: 0, opacity: 1, visible: true,
      text: { content: 'STUDIO EDITION', font: 'Space Grotesk', size: 15, weight: '600', italic: false, color: textColor, align: 'center', letterSpacing: 1 }
    }
  ];

  if (state.promptMode === 'overall') {
    if (state.overall.frontBack) {
      state.frontObjects = makeSampleFront();
      state.backObjects  = makeSampleBack();
    } else {
      if (state.overall.front) state.frontObjects = makeSampleFront();
      if (state.overall.back)  state.backObjects  = makeSampleBack();
      // Always ensure front has sample objects so the editor never starts blank
      if (!state.frontObjects.length) state.frontObjects = makeSampleFront();
    }
  } else {
    // Individual areas
    if (state.individual.front.length) state.frontObjects = makeSampleFront();
    if (state.individual.back.length)  state.backObjects  = makeSampleBack();
    if (!state.frontObjects.length)    state.frontObjects = makeSampleFront();
  }
}

/* ==========================================================================
   PAGE 2 — MANUAL DESIGN EDITOR
   ========================================================================== */

// =====================================================
// FUTURE BACKEND / AI FUNCTIONALITY
// =====================================================
// This editor is FRONTEND ONLY.
// Future development may connect:
// - AI-generated design output / AI prompt processing
// - Background removal API
// - Image storage / CDN
// - User accounts & database
// - Design submission to artist
// These are intentionally NOT implemented here.
// =====================================================

// Canvas coordinate space (no visible boundary shown in editor)
const CANVAS_W = 380, CANVAS_H = 480;
// Shirt silhouette bounding box used only by Auto Layout & Review clipping
const SHIRT_AREA = { x: 60, y: 30, width: 260, height: 420 };

function initEditorPage() {
  const state = loadState();
  if (!state.garmentType || !hasAnyPrompts(state)) { window.location.href = 'design.html'; return; }
  if (state.designStatus === 'submitted') { window.location.href = 'review.html'; return; }
  renderProgressSteps(2);

  seedEditorObjects(state);
  saveState(state);

  let side = state.currentSide === 'back' ? 'back' : 'front';
  let selectedId = null;
  let zoom = 1;
  let undoStack = [];
  let redoStack = [];

  const garmentBg       = document.getElementById('canvasGarmentBg');
  const objectsContainer = document.getElementById('canvasObjects');
  const stage            = document.getElementById('canvasStage');

  // ---- Sticky panel offset: match height of .editor-sticky-top ----
  function applyPanelStickyOffset() {
    const top = document.getElementById('editorStickyTop');
    const h = top ? top.offsetHeight : 0;
    document.querySelectorAll('.editor-panel').forEach(p => p.style.top = h + 'px');
    document.querySelectorAll('.editor-panel').forEach(p => p.style.maxHeight = `calc(100vh - ${h}px)`);
  }
  applyPanelStickyOffset();
  window.addEventListener('resize', applyPanelStickyOffset);

  // ---- Design brief ----
  renderDesignBrief(state);

  // ---- Garment ----
  function renderGarmentBg() {
    garmentBg.innerHTML = garmentSVG(state.garmentType, state.color);
  }
  renderGarmentBg();

  // ---- Side toggle ----
  const editorSideToggle = document.getElementById('editorSideToggle');
  editorSideToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.side === side));
  editorSideToggle.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    side = b.dataset.side; state.currentSide = side;
    editorSideToggle.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    selectedId = null;
    renderCanvas(); renderLayers(); showEmptyProps(); saveState(state);
  });

  // ---- Object helpers ----
  function currentObjects()       { return side === 'front' ? state.frontObjects : state.backObjects; }
  function setCurrentObjects(arr) { if (side === 'front') state.frontObjects = arr; else state.backObjects = arr; }
  function findObj(id)            { return currentObjects().find(o => o.id === id); }

  // ---- Undo / Redo ----
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  function snapshot() {
    undoStack.push(JSON.stringify({ front: state.frontObjects, back: state.backObjects }));
    if (undoStack.length > 40) undoStack.shift();
    redoStack = []; updateUndoRedo(); markUnsaved();
  }
  function updateUndoRedo() { undoBtn.disabled = !undoStack.length; redoBtn.disabled = !redoStack.length; }
  undoBtn.addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify({ front: state.frontObjects, back: state.backObjects }));
    const p = JSON.parse(undoStack.pop());
    state.frontObjects = p.front; state.backObjects = p.back;
    selectedId = null; renderCanvas(); renderLayers(); showEmptyProps(); saveState(state); updateUndoRedo();
  });
  redoBtn.addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify({ front: state.frontObjects, back: state.backObjects }));
    const n = JSON.parse(redoStack.pop());
    state.frontObjects = n.front; state.backObjects = n.back;
    selectedId = null; renderCanvas(); renderLayers(); showEmptyProps(); saveState(state); updateUndoRedo();
  });

  // ---- Save indicator ----
  const saveIndicator = document.getElementById('saveIndicator');
  const saveIndicatorText = document.getElementById('saveIndicatorText');
  function markUnsaved() { saveIndicator.classList.add('unsaved'); saveIndicatorText.textContent = 'Unsaved changes'; }
  function persist()     { saveState(state); saveIndicator.classList.remove('unsaved'); saveIndicatorText.textContent = 'Saved locally'; }

  // ---- Build canvas element for one object ----
  function buildEl(obj) {
    const el = document.createElement('div');
    el.className = 'canvas-object' + (obj.id === selectedId ? ' selected' : '');
    el.dataset.id     = obj.id;
    el.dataset.hidden = String(!obj.visible);
    applyElStyle(el, obj);
    el.innerHTML = objectInnerHTML(obj) + resizeHandlesHTML() + `<div class="rotate-handle"></div>`;

    // Drag to move — FREE movement, no clamping during editing
    el.addEventListener('mousedown', e => {
      if (e.target.classList.contains('rh') || e.target.classList.contains('rotate-handle')) return;
      e.stopPropagation(); selectObject(obj.id);
      const sx = e.clientX, sy = e.clientY, ox = obj.x, oy = obj.y;
      snapshot();
      function onMove(ev) {
        obj.x = ox + (ev.clientX - sx) / zoom;
        obj.y = oy + (ev.clientY - sy) / zoom;
        applyElStyle(el, obj); refreshXY(obj);
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persist();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // 8-handle resize
    el.querySelectorAll('.rh').forEach(rh => {
      rh.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        selectObject(obj.id);
        snapshot();
        const dir   = rh.dataset.dir;
        const sx    = e.clientX, sy = e.clientY;
        const ox = obj.x, oy = obj.y, ow = obj.width, oh = obj.height;
        function onMove(ev) {
          const dx = (ev.clientX - sx) / zoom;
          const dy = (ev.clientY - sy) / zoom;
          if (dir.includes('e'))  obj.width  = Math.max(20, ow + dx);
          if (dir.includes('s'))  obj.height = Math.max(20, oh + dy);
          if (dir.includes('w')) { obj.width  = Math.max(20, ow - dx); obj.x = ox + dx; }
          if (dir.includes('n')) { obj.height = Math.max(20, oh - dy); obj.y = oy + dy; }
          applyElStyle(el, obj); refreshTransformFields(obj);
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          persist();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });

    // Rotate handle
    el.querySelector('.rotate-handle').addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      selectObject(obj.id); snapshot();
      function onMove(ev) {
        const r  = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        obj.rotation = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90);
        applyElStyle(el, obj);
        const rf = document.getElementById('propR'); if (rf) rf.value = obj.rotation;
        const rs = document.getElementById('propRotSlider'); if (rs) rs.value = obj.rotation;
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persist();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    return el;
  }

  function resizeHandlesHTML() {
    return ['nw','n','ne','e','se','s','sw','w'].map(d =>
      `<div class="rh rh-${d}" data-dir="${d}"></div>`).join('');
  }

  function applyElStyle(el, obj) {
    el.style.left      = obj.x + 'px';
    el.style.top       = obj.y + 'px';
    el.style.width     = obj.width + 'px';
    el.style.height    = obj.height + 'px';
    el.style.opacity   = obj.opacity;
    el.style.transform = `rotate(${obj.rotation}deg)`;
  }

  stage.addEventListener('mousedown', e => {
    if (e.target === stage || e.target.id === 'canvasGarmentBg' || garmentBg.contains(e.target) || e.target === objectsContainer) {
      selectObject(null);
    }
  });

  function renderCanvas() {
    objectsContainer.innerHTML = '';
    currentObjects().forEach(obj => objectsContainer.appendChild(buildEl(obj)));
  }

  // ---- Selection ----
  function selectObject(id) {
    selectedId = id;
    objectsContainer.querySelectorAll('.canvas-object').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
    renderLayers();
    if (!id) { showEmptyProps(); return; }
    const obj = findObj(id);
    if (obj) renderProperties(obj);
  }

  // ---- Properties panel ----
  function showEmptyProps() {
    document.getElementById('propertiesEmpty').style.display = 'block';
    document.getElementById('propertiesContent').style.display = 'none';
    document.getElementById('propertiesContent').innerHTML = '';
  }

  function refreshTransformFields(obj) {
    const map = { propX: Math.round(obj.x), propY: Math.round(obj.y), propW: Math.round(obj.width), propH: Math.round(obj.height), propR: Math.round(obj.rotation) };
    Object.entries(map).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
    const rs = document.getElementById('propRotSlider'); if (rs) rs.value = Math.round(obj.rotation);
    const os = document.getElementById('propOpacity'); if (os) { os.value = obj.opacity; const ov = document.getElementById('propOpacityVal'); if (ov) ov.textContent = Math.round(obj.opacity * 100) + '%'; }
  }

  function refreshXY(obj) {
    const xf = document.getElementById('propX'); if (xf) xf.value = Math.round(obj.x);
    const yf = document.getElementById('propY'); if (yf) yf.value = Math.round(obj.y);
  }

  function renderProperties(obj) {
    document.getElementById('propertiesEmpty').style.display = 'none';
    const content = document.getElementById('propertiesContent');
    content.style.display = 'block';

    let specific = '';

    if (obj.type === 'text') {
      specific = `
        <div class="props-group"><h4>Text</h4>
          <div class="field"><label>Content</label><textarea id="propTextContent" rows="2">${esc(obj.text.content)}</textarea></div>
          <div class="props-row">
            <div class="field"><label>Font</label>
              <select id="propFont">${['Inter','Space Grotesk','JetBrains Mono','Georgia','Arial'].map(f=>`<option value="${f}" ${obj.text.font===f?'selected':''}>${f}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Size</label><input type="number" id="propFontSize" value="${obj.text.size}" min="8" max="100"></div>
          </div>
          <div class="props-row">
            <div class="field"><label>Weight</label>
              <select id="propFontWeight">
                <option value="400" ${obj.text.weight==='400'?'selected':''}>Regular</option>
                <option value="600" ${obj.text.weight==='600'?'selected':''}>Semibold</option>
                <option value="700" ${obj.text.weight==='700'?'selected':''}>Bold</option>
              </select>
            </div>
            <div class="field"><label>Italic</label>
              <button type="button" id="propItalic" class="btn btn-ghost btn-sm${obj.text.italic?' active':''}" style="width:100%;margin-top:2px;font-style:italic;">I</button>
            </div>
          </div>
          <div class="props-row">
            <div class="field"><label>Spacing</label><input type="number" id="propLetterSpacing" value="${obj.text.letterSpacing}" min="-4" max="12"></div>
            <div class="field"><label>Color</label><div class="color-input-row"><input type="color" id="propTextColor" value="${obj.text.color}"></div></div>
          </div>
          <div class="field"><label>Alignment</label>
            <div class="align-btn-row">
              <button type="button" data-align="left"   class="${obj.text.align==='left'  ?'active':''}">Left</button>
              <button type="button" data-align="center" class="${obj.text.align==='center'?'active':''}">Center</button>
              <button type="button" data-align="right"  class="${obj.text.align==='right' ?'active':''}">Right</button>
            </div>
          </div>
        </div>`;

    } else if (obj.type === 'image') {
      const src = obj.image && obj.image.src ? obj.image.src : '';
      specific = `
        <div class="props-group"><h4>Image</h4>
          ${src ? `<img src="${src}" style="width:100%;max-height:90px;object-fit:contain;border-radius:var(--radius-sm);margin-bottom:10px;border:1px solid var(--line);" alt="Preview">` : ''}
          <div class="props-actions" style="flex-direction:column;gap:8px;">
            <button class="btn btn-ghost btn-sm" id="propReplaceImage" style="width:100%;">Replace Image</button>
            <button class="btn btn-ghost btn-sm" id="propRemoveBg" style="width:100%;border-color:rgba(122,92,255,0.4);color:var(--violet-glow);">Remove Background</button>
            <p id="removeBgNote" style="display:none;font-family:var(--font-mono);font-size:11px;color:rgba(246,244,239,0.5);padding:8px;border:1px dashed var(--line-strong);border-radius:var(--radius-sm);">
              Background removal — prototype only.<br>This feature will be available in the full version.
            </p>
          </div>
        </div>`;

    } else {
      specific = `
        <div class="props-group"><h4>Shape</h4>
          <div class="field"><label>Type</label>
            <select id="propShapeType">${['rect','circle','triangle','star','line'].map(t=>`<option value="${t}" ${obj.shape.shapeType===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}</select>
          </div>
          <div class="props-row">
            <div class="field"><label>Fill</label><div class="color-input-row"><input type="color" id="propFill" value="${obj.shape.fill}"></div></div>
            <div class="field"><label>Border Color</label><div class="color-input-row"><input type="color" id="propStrokeColor" value="${obj.shape.stroke && obj.shape.stroke !== 'transparent' ? obj.shape.stroke : '#ffffff'}"></div></div>
          </div>
          <div class="field"><label>Border Width</label><input type="number" id="propStrokeWidth" value="${obj.shape.strokeWidth}" min="0" max="14"></div>
        </div>`;
    }

    content.innerHTML = `${specific}
      <div class="props-group"><h4>Transform</h4>
        <div class="props-row">
          <div class="field"><label>X</label><input type="number" id="propX" value="${Math.round(obj.x)}"></div>
          <div class="field"><label>Y</label><input type="number" id="propY" value="${Math.round(obj.y)}"></div>
        </div>
        <div class="props-row">
          <div class="field"><label>W</label><input type="number" id="propW" value="${Math.round(obj.width)}" min="10"></div>
          <div class="field"><label>H</label><input type="number" id="propH" value="${Math.round(obj.height)}" min="10"></div>
        </div>
        <div class="field"><label>Rotation</label>
          <div class="range-row">
            <input type="range" id="propRotSlider" min="-180" max="180" value="${Math.round(obj.rotation)}" style="flex:1;accent-color:var(--violet);">
            <input type="number" id="propR" value="${Math.round(obj.rotation)}" min="-180" max="180" style="width:54px;text-align:center;">
          </div>
        </div>
        <div class="field"><label>Opacity</label>
          <div class="range-row">
            <input type="range" id="propOpacity" min="0.05" max="1" step="0.05" value="${obj.opacity}" style="flex:1;accent-color:var(--violet);">
            <span id="propOpacityVal" style="min-width:38px;text-align:right;font-family:var(--font-mono);font-size:12px;">${Math.round(obj.opacity*100)}%</span>
          </div>
        </div>
      </div>
      <div class="props-group"><h4>Layer Order</h4>
        <div class="props-actions" style="flex-wrap:wrap;gap:6px;">
          <button class="btn btn-ghost btn-sm" id="propBringFront">⤒ To Front</button>
          <button class="btn btn-ghost btn-sm" id="propBringFwd">↑ Forward</button>
          <button class="btn btn-ghost btn-sm" id="propSendBwd">↓ Backward</button>
          <button class="btn btn-ghost btn-sm" id="propSendBack">⤓ To Back</button>
        </div>
      </div>
      <div class="props-group"><h4>Actions</h4>
        <button class="btn btn-ghost btn-sm" id="propAutoLayout" style="width:100%;margin-bottom:8px;">⊹ Auto Layout</button>
        <div class="props-actions" style="gap:6px;">
          <button class="btn btn-ghost btn-sm" id="propDuplicate">Duplicate</button>
          <button class="btn btn-ghost btn-sm" id="propDelete" style="color:var(--danger);">Delete</button>
        </div>
      </div>`;

    wireProps(obj, content);
  }

  function wireProps(obj, content) {
    const commit  = () => { persist(); renderLayers(); };
    const snap    = fn => { snapshot(); fn(); };

    if (obj.type === 'text') {
      const tc = document.getElementById('propTextContent');
      tc.addEventListener('input',  () => { obj.text.content = tc.value; updateEl(obj); markUnsaved(); });
      tc.addEventListener('change', () => snap(commit));

      document.getElementById('propFont').addEventListener('change', e => snap(() => { obj.text.font = e.target.value; updateEl(obj); commit(); }));
      document.getElementById('propFontSize').addEventListener('input',  e => { obj.text.size = Number(e.target.value); updateEl(obj); markUnsaved(); });
      document.getElementById('propFontSize').addEventListener('change', () => snap(commit));
      document.getElementById('propFontWeight').addEventListener('change', e => snap(() => { obj.text.weight = e.target.value; updateEl(obj); commit(); }));
      document.getElementById('propItalic').addEventListener('click', () => snap(() => {
        obj.text.italic = !obj.text.italic;
        document.getElementById('propItalic').classList.toggle('active', obj.text.italic);
        updateEl(obj); commit();
      }));
      document.getElementById('propLetterSpacing').addEventListener('input',  e => { obj.text.letterSpacing = Number(e.target.value); updateEl(obj); markUnsaved(); });
      document.getElementById('propLetterSpacing').addEventListener('change', () => snap(commit));
      document.getElementById('propTextColor').addEventListener('input',  e => { obj.text.color = e.target.value; updateEl(obj); markUnsaved(); });
      document.getElementById('propTextColor').addEventListener('change', () => snap(commit));
      content.querySelectorAll('[data-align]').forEach(b => b.addEventListener('click', () => snap(() => {
        obj.text.align = b.dataset.align;
        content.querySelectorAll('[data-align]').forEach(x => x.classList.toggle('active', x === b));
        updateEl(obj); commit();
      })));

    } else if (obj.type === 'image') {
      document.getElementById('propReplaceImage').addEventListener('click', () => {
        const inp = document.getElementById('imageUploadInput');
        inp.onchange = () => {
          const file = inp.files[0]; if (!file) return;
          const fr = new FileReader();
          fr.onload = () => snap(() => { obj.image.src = fr.result; updateEl(obj); renderProperties(obj); commit(); });
          fr.readAsDataURL(file); inp.value = '';
        };
        inp.click();
      });
      // FRONTEND SAMPLE ONLY
      // TODO: Connect to a future background-removal service.
      document.getElementById('propRemoveBg').addEventListener('click', () => {
        document.getElementById('removeBgNote').style.display = 'block';
      });

    } else {
      document.getElementById('propShapeType').addEventListener('change', e => snap(() => { obj.shape.shapeType = e.target.value; updateEl(obj); commit(); }));
      document.getElementById('propFill').addEventListener('input',  e => { obj.shape.fill = e.target.value; updateEl(obj); markUnsaved(); });
      document.getElementById('propFill').addEventListener('change', () => snap(commit));
      document.getElementById('propStrokeColor').addEventListener('input',  e => { obj.shape.stroke = e.target.value; updateEl(obj); markUnsaved(); });
      document.getElementById('propStrokeColor').addEventListener('change', () => snap(commit));
      document.getElementById('propStrokeWidth').addEventListener('input',  e => { obj.shape.strokeWidth = Number(e.target.value); updateEl(obj); markUnsaved(); });
      document.getElementById('propStrokeWidth').addEventListener('change', () => snap(commit));
    }

    // Transform — X/Y
    document.getElementById('propX').addEventListener('input',  e => { obj.x = Number(e.target.value); updateElPos(obj); markUnsaved(); });
    document.getElementById('propX').addEventListener('change', () => snap(commit));
    document.getElementById('propY').addEventListener('input',  e => { obj.y = Number(e.target.value); updateElPos(obj); markUnsaved(); });
    document.getElementById('propY').addEventListener('change', () => snap(commit));
    document.getElementById('propW').addEventListener('input',  e => { obj.width  = Math.max(10, Number(e.target.value)); updateElPos(obj); markUnsaved(); });
    document.getElementById('propW').addEventListener('change', () => snap(commit));
    document.getElementById('propH').addEventListener('input',  e => { obj.height = Math.max(10, Number(e.target.value)); updateElPos(obj); markUnsaved(); });
    document.getElementById('propH').addEventListener('change', () => snap(commit));

    // Rotation — slider + number input kept in sync
    const rotSlider = document.getElementById('propRotSlider');
    const rotNum    = document.getElementById('propR');
    function applyRot(val) { obj.rotation = Number(val); updateElPos(obj); markUnsaved(); }
    rotSlider.addEventListener('input',  e => { rotNum.value = e.target.value; applyRot(e.target.value); });
    rotSlider.addEventListener('change', () => snap(commit));
    rotNum.addEventListener('input',  e => { rotSlider.value = e.target.value; applyRot(e.target.value); });
    rotNum.addEventListener('change', () => snap(commit));

    // Opacity
    document.getElementById('propOpacity').addEventListener('input', e => {
      obj.opacity = Number(e.target.value);
      document.getElementById('propOpacityVal').textContent = Math.round(obj.opacity * 100) + '%';
      updateElPos(obj); markUnsaved();
    });
    document.getElementById('propOpacity').addEventListener('change', () => snap(commit));

    // Layer order
    document.getElementById('propBringFront').addEventListener('click', () => snap(() => moveToIndex(obj.id, currentObjects().length - 1)));
    document.getElementById('propBringFwd').addEventListener('click',   () => snap(() => reorderObj(obj.id,  1)));
    document.getElementById('propSendBwd').addEventListener('click',    () => snap(() => reorderObj(obj.id, -1)));
    document.getElementById('propSendBack').addEventListener('click',   () => snap(() => moveToIndex(obj.id, 0)));

    // Auto Layout / Duplicate / Delete
    document.getElementById('propAutoLayout').addEventListener('click', () => snap(() => { autoLayout(obj); updateElPos(obj); persist(); renderLayers(); showToast('Auto layout applied.', 'success'); }));
    document.getElementById('propDuplicate').addEventListener('click',  () => snap(() => duplicateObj(obj.id)));
    document.getElementById('propDelete').addEventListener('click',     () => snap(() => deleteObj(obj.id)));
  }

  function updateEl(obj) {
    const el = objectsContainer.querySelector(`[data-id="${obj.id}"]`);
    if (!el) return; el.replaceWith(buildEl(obj));
  }
  function updateElPos(obj) {
    const el = objectsContainer.querySelector(`[data-id="${obj.id}"]`);
    if (!el) return; applyElStyle(el, obj);
  }

  // ---- Auto Layout (JS rules, not AI) ----
  // FRONTEND SAMPLE ONLY — uses simple positioning heuristics
  function autoLayout(obj) {
    const sa = SHIRT_AREA;
    const isText  = obj.type === 'text';
    const isSmall = obj.width < 60 && obj.height < 60;
    const isLarge = obj.width >= 130;
    const jitter  = () => (Math.random() - 0.5) * 22;

    for (let attempt = 0; attempt < 8; attempt++) {
      if (isText) {
        obj.x = sa.x + sa.width / 2 - obj.width / 2 + jitter();
        obj.y = Math.random() > 0.5 ? sa.y + sa.height * 0.74 : sa.y + sa.height * 0.06;
        obj.y += jitter();
      } else if (isSmall) {
        obj.x = sa.x + 10 + Math.random() * 50 + jitter();
        obj.y = sa.y + 10 + jitter();
      } else if (isLarge) {
        obj.x = sa.x + sa.width / 2 - obj.width / 2 + jitter();
        obj.y = sa.y + sa.height * 0.22 + jitter();
      } else {
        obj.x = sa.x + (sa.width  - obj.width)  * Math.random() + jitter();
        obj.y = sa.y + (sa.height - obj.height) * Math.random() + jitter();
      }
      // Check excessive overlap
      const overlap = currentObjects().some(o => {
        if (o.id === obj.id || !o.visible) return false;
        const dx = Math.abs((o.x + o.width/2)  - (obj.x + obj.width/2));
        const dy = Math.abs((o.y + o.height/2) - (obj.y + obj.height/2));
        return dx < (o.width + obj.width) * 0.3 && dy < (o.height + obj.height) * 0.3;
      });
      if (!overlap) break;
    }
  }

  document.getElementById('autoLayoutAllBtn').addEventListener('click', () => {
    snapshot();
    currentObjects().forEach(obj => autoLayout(obj));
    renderCanvas(); persist();
    showToast('Auto layout applied to all objects.', 'success');
  });

  // ---- Reorder / move to index ----
  function reorderObj(id, dir) {
    const arr = currentObjects();
    const i = arr.findIndex(o => o.id === id);
    const ni = i + dir;
    if (ni < 0 || ni >= arr.length) return;
    [arr[i], arr[ni]] = [arr[ni], arr[i]];
    renderCanvas(); renderLayers(); persist();
  }
  function moveToIndex(id, targetIdx) {
    const arr = currentObjects();
    const i = arr.findIndex(o => o.id === id);
    if (i === -1) return;
    const [obj] = arr.splice(i, 1);
    arr.splice(Math.max(0, Math.min(targetIdx, arr.length)), 0, obj);
    renderCanvas(); renderLayers(); persist();
  }

  // ---- Duplicate ----
  function duplicateObj(id) {
    const arr = currentObjects();
    const obj = arr.find(o => o.id === id);
    if (!obj) return;
    const copy = JSON.parse(JSON.stringify(obj));
    copy.id = uid(); copy.name = obj.name + ' Copy'; copy.x += 18; copy.y += 18;
    arr.push(copy);
    selectedId = copy.id;
    renderCanvas(); renderLayers(); renderProperties(copy); persist();
    showToast('Duplicated.', 'success');
  }

  // ---- Delete ----
  function deleteObj(id) {
    setCurrentObjects(currentObjects().filter(o => o.id !== id));
    if (selectedId === id) selectedId = null;
    renderCanvas(); renderLayers(); showEmptyProps(); persist();
    showToast('Deleted.', 'success');
  }

  // ---- Layers panel ----
  function renderLayers() {
    const list  = document.getElementById('layerList');
    const empty = document.getElementById('layersEmpty');
    const objs  = currentObjects();
    empty.style.display = objs.length ? 'none' : 'block';
    list.innerHTML = '';
    // Highest z-index (last in array) shown at top of layers list
    for (let i = objs.length - 1; i >= 0; i--) {
      const obj = objs[i];
      const row = document.createElement('div');
      row.className = 'layer-item' + (obj.id === selectedId ? ' selected' : '');
      row.dataset.id     = obj.id;
      row.dataset.hidden = String(!obj.visible);
      row.draggable = true;
      row.innerHTML = `<span class="drag-handle">☰</span>
        <span class="layer-name">${esc(obj.name)}</span>
        <button type="button" title="${obj.visible ? 'Hide' : 'Show'}">${obj.visible ? eyeOpen() : eyeClosed()}</button>
        <button type="button" title="Duplicate">${dupIcon()}</button>
        <button type="button" title="Delete" style="color:rgba(246,244,239,0.4);">${trashIcon()}</button>`;
      row.addEventListener('click', e => { if (e.target.closest('button')) return; selectObject(obj.id); });
      row.querySelectorAll('button')[0].addEventListener('click', () => { snapshot(); obj.visible = !obj.visible; renderCanvas(); renderLayers(); persist(); });
      row.querySelectorAll('button')[1].addEventListener('click', () => { snapshot(); duplicateObj(obj.id); });
      row.querySelectorAll('button')[2].addEventListener('click', () => { snapshot(); deleteObj(obj.id); });
      row.addEventListener('dragstart', () => row.classList.add('dragging'));
      row.addEventListener('dragend',   () => row.classList.remove('dragging'));
      row.addEventListener('dragover',  e => e.preventDefault());
      row.addEventListener('drop', e => {
        e.preventDefault();
        const drag = list.querySelector('.dragging');
        if (!drag || drag === row) return;
        snapshot();
        const arr  = currentObjects();
        const from = arr.findIndex(o => o.id === drag.dataset.id);
        const to   = arr.findIndex(o => o.id === row.dataset.id);
        const [m]  = arr.splice(from, 1); arr.splice(to, 0, m);
        renderCanvas(); renderLayers(); persist();
      });
      list.appendChild(row);
    }
  }

  const eyeOpen   = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeClosed = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 5.1A11 11 0 0112 5c7 0 11 7 11 7a13.5 13.5 0 01-3.2 3.8M6.5 6.6A13.5 13.5 0 001 12s4 7 11 7a10.4 10.4 0 004.8-1.1"/></svg>`;
  const dupIcon   = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>`;
  const trashIcon = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>`;

  // ---- Add objects ----
  const addBtn      = document.getElementById('addBtn');
  const addDropdown = document.getElementById('addDropdown');
  addBtn.addEventListener('click', e => { e.stopPropagation(); addDropdown.classList.toggle('is-open'); });
  document.addEventListener('click', () => addDropdown.classList.remove('is-open'));
  addDropdown.addEventListener('click', e => {
    const b = e.target.closest('button[data-add]');
    if (!b) return;
    snapshot();
    const k = b.dataset.add;
    if (k === 'text') addText();
    else if (k === 'image') addImage();
    else addShape(k.replace('shape-', ''));
  });

  function addText() {
    const obj = { id: uid(), type: 'text', name: 'Text Layer',
      x: SHIRT_AREA.x + 30, y: SHIRT_AREA.y + 160,
      width: 200, height: 44, rotation: 0, opacity: 1, visible: true,
      text: { content: 'Your Text', font: 'Inter', size: 22, weight: '600', italic: false, color: '#F6F4EF', align: 'center', letterSpacing: 0 } };
    currentObjects().push(obj); selectedId = obj.id;
    renderCanvas(); renderLayers(); renderProperties(obj); persist();
  }
  function addShape(shapeType) {
    const obj = { id: uid(), type: 'shape',
      name: shapeType.charAt(0).toUpperCase() + shapeType.slice(1),
      x: SHIRT_AREA.x + 80, y: SHIRT_AREA.y + 100,
      width: 90, height: shapeType === 'line' ? 12 : 90,
      rotation: 0, opacity: 1, visible: true,
      shape: { shapeType, fill: '#7A5CFF', stroke: 'transparent', strokeWidth: 0 } };
    currentObjects().push(obj); selectedId = obj.id;
    renderCanvas(); renderLayers(); renderProperties(obj); persist();
  }
  function addImage() {
    const inp = document.getElementById('imageUploadInput');
    inp.onchange = () => {
      const file = inp.files[0]; if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        const obj = { id: uid(), type: 'image', name: 'Image',
          x: SHIRT_AREA.x + 60, y: SHIRT_AREA.y + 80,
          width: 140, height: 140, rotation: 0, opacity: 1, visible: true,
          image: { src: fr.result } };
        currentObjects().push(obj); selectedId = obj.id;
        renderCanvas(); renderLayers(); renderProperties(obj); persist();
      };
      fr.readAsDataURL(file); inp.value = '';
    };
    inp.click();
  }

  // ---- Add Random Test Object ----
  // PROTOTYPE TEST FEATURE — remove or replace in production version
  const randomTestBtn = document.getElementById('randomTestBtn');
  if (randomTestBtn) {
    randomTestBtn.addEventListener('click', () => {
      snapshot();
      const picks = ['text','shape-circle','shape-rect','shape-triangle','shape-star'];
      const pick  = picks[Math.floor(Math.random() * picks.length)];
      const randColor = () => '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
      const rx = () => SHIRT_AREA.x + Math.random() * (SHIRT_AREA.width  - 80);
      const ry = () => SHIRT_AREA.y + Math.random() * (SHIRT_AREA.height - 80);
      if (pick === 'text') {
        const samples = ['Sample Text','Test Label','Brand Name','EST. 2024','PROTOTYPE'];
        const obj = { id: uid(), type: 'text', name: 'Random Text',
          x: rx(), y: ry(), width: 160, height: 40,
          rotation: Math.round((Math.random()-0.5)*20), opacity: 1, visible: true,
          text: { content: samples[Math.floor(Math.random()*samples.length)], font: 'Inter', size: 18, weight: '600', italic: false, color: randColor(), align: 'center', letterSpacing: 0 } };
        currentObjects().push(obj); selectedId = obj.id;
        renderCanvas(); renderLayers(); renderProperties(obj); persist();
      } else {
        const shapeType = pick.replace('shape-', '');
        const sz  = 50 + Math.floor(Math.random() * 80);
        const obj = { id: uid(), type: 'shape', name: shapeType + ' (test)',
          x: rx(), y: ry(), width: sz, height: sz,
          rotation: Math.round((Math.random()-0.5)*30), opacity: 1, visible: true,
          shape: { shapeType, fill: randColor(), stroke: 'transparent', strokeWidth: 0 } };
        currentObjects().push(obj); selectedId = obj.id;
        renderCanvas(); renderLayers(); renderProperties(obj); persist();
      }
      showToast('Random test object added.', 'success');
    });
  }

  // ---- Zoom ----
  const zl = document.getElementById('zoomLabel');
  function applyZoom() { stage.style.transform = `scale(${zoom})`; zl.textContent = Math.round(zoom * 100) + '%'; }
  document.getElementById('zoomInBtn').addEventListener('click',    () => { zoom = Math.min(2, zoom + 0.1); applyZoom(); });
  document.getElementById('zoomOutBtn').addEventListener('click',   () => { zoom = Math.max(0.4, zoom - 0.1); applyZoom(); });
  document.getElementById('fitScreenBtn').addEventListener('click', () => { zoom = 1; applyZoom(); });

  // ---- Keyboard delete ----
  document.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault(); snapshot(); deleteObj(selectedId);
    }
  });

  // ---- Review ----
  document.getElementById('reviewBtn').addEventListener('click', () => { persist(); window.location.href = 'review.html'; });

  // ---- Initial render ----
  renderCanvas(); renderLayers(); showEmptyProps(); applyZoom(); updateUndoRedo();
}

/* ==========================================================================
   PAGE 3 — FINAL PREVIEW / REVIEW
   ========================================================================== */
function initReviewPage() {
  const state = loadState();
  if (!state.garmentType || !hasAnyPrompts(state)) { window.location.href = 'design.html'; return; }
  renderProgressSteps(3);

  let side = state.currentSide === 'back' ? 'back' : 'front';

  // ---- Garment detail summary ----
  document.getElementById('detailGarment').textContent = GARMENT_TYPES.find(t => t.id === state.garmentType)?.label || state.garmentType;
  document.getElementById('detailFit').textContent = state.fit || '—';
  document.getElementById('detailColor').innerHTML = `<span class="color-chip-inline" style="background:${state.color};"></span>${state.colorName || state.color}`;

  // ---- Brief summary (right panel) ----
  renderReviewBrief(state);

  // ---- Preview rendering ----
  function renderPreview() {
    const mock = document.getElementById('reviewGarmentMock');
    const objs = side === 'front' ? state.frontObjects : state.backObjects;
    const objectsHtml = objs.map(staticObjDiv).join('');
    // Objects are clipped to the shirt silhouette on the review page.
    // The clip-path polygon approximates the shirt shape within the 380×480 canvas.
    // During editing (editor.html), objects can extend freely — clipping only applies here.
    const shirtClip = 'polygon(15% 12%, 22% 8%, 50% 16%, 78% 8%, 85% 12%, 85% 100%, 15% 100%)';
    mock.innerHTML = `<div style="position:relative;width:380px;height:480px;max-width:100%;">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${garmentSVG(state.garmentType, state.color)}</div>
      <div style="position:absolute;inset:0;clip-path:${shirtClip};overflow:hidden;">${objectsHtml}</div>
    </div>`;
    document.querySelectorAll('.mini-preview').forEach(mp => mp.classList.toggle('active', mp.dataset.side === side));
    document.getElementById('reviewSideToggle').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.side === side));
    renderElementList();
  }

  function renderElementList() {
    const list = document.getElementById('elementList');
    const label = document.getElementById('elementSideLabel');
    if (label) label.textContent = side === 'front' ? 'Front' : 'Back';
    const objs = (side === 'front' ? state.frontObjects : state.backObjects) || [];
    if (!list) return;
    if (!objs.length) {
      list.innerHTML = `<li style="color:rgba(246,244,239,0.45);">No design elements on this side.</li>`;
      return;
    }
    list.innerHTML = objs.map(o => `<li class="${o.visible ? '' : 'is-hidden-item'}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5"/></svg>
      ${esc(o.name)}${o.visible ? '' : ' (hidden)'}
    </li>`).join('');
  }

  document.getElementById('reviewSideToggle').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    side = b.dataset.side; state.currentSide = side; saveState(state);
    renderPreview();
  });

  // ---- Submit ----
  const submitModal = document.getElementById('submitModal');
  const successOverlay = document.getElementById('successOverlay');
  const reviewFooter = document.getElementById('reviewFooter');

  if (state.designStatus === 'submitted') {
    reviewFooter.style.display = 'none';
    successOverlay.classList.add('is-open');
    renderProgressSteps(3);
    renderPreview();
    return;
  }

  document.getElementById('backToEditBtn').addEventListener('click', () => window.location.href = 'editor.html');

  document.getElementById('submitBtn').addEventListener('click', () => {
    document.getElementById('submitThumb').innerHTML = garmentSVG(state.garmentType, state.color);
    submitModal.classList.add('is-open');
  });

  document.getElementById('confirmSubmitBtn').addEventListener('click', () => {
    // FRONTEND SAMPLE ONLY
    // ============================================================
    // TODO: Connect to backend submission system
    // - Send final design state (garment, fit, color, objects)
    //   to the server for handoff to the professional artist.
    // - No actual submission occurs in this prototype.
    // ============================================================
    state.designStatus = 'submitted';
    saveState(state);
    submitModal.classList.remove('is-open');
    reviewFooter.style.display = 'none';
    setTimeout(() => successOverlay.classList.add('is-open'), 200);
  });

  document.getElementById('startNewBtn')?.addEventListener('click', () => {
    Object.assign(state, defaultState());
    saveState(state);
    window.location.href = 'design.html';
  });

  renderPreview();
}

function renderReviewBrief(state) {
  const el = document.getElementById('reviewBriefSummary');
  if (!el) return;
  let html = '';
  if (state.promptMode === 'overall') {
    if (state.overall.frontBack) html += `<div class="brief-item"><strong>Overall Front &amp; Back</strong>${esc(state.overall.frontBack)}</div>`;
    if (state.overall.front) html += `<div class="brief-item"><strong>Overall Front</strong>${esc(state.overall.front)}</div>`;
    if (state.overall.back) html += `<div class="brief-item"><strong>Overall Back</strong>${esc(state.overall.back)}</div>`;
  } else {
    ['front', 'back'].forEach(s => {
      state.individual[s].forEach(p => {
        html += `<div class="brief-item"><strong>${s.toUpperCase()} — ${esc(p.label)}</strong>${esc(p.prompt)}</div>`;
      });
    });
  }
  el.innerHTML = html || '<p class="brief-empty">No prompts recorded.</p>';
}
