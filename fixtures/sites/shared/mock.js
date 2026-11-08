// Ticket 0: the recorder of the mock official sites. Every page loads it with data-step on the <script> tag.
// It posts to the mock server (same origin) what the agent does: the step shown, each field filled, each file
// uploaded, each button clicked. Buttons with data-forbidden="true" (Next, Submit, Pay) are recorded as forbidden
// clicks and never leave the page: nothing is ever sent anywhere. No real site is contacted.
(function () {
  var script = document.currentScript;
  var step = (script && script.getAttribute("data-step")) || location.pathname;
  function post(event) {
    try {
      fetch("/__mock/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), keepalive: true }).catch(function () {});
    } catch {}
  }
  function labelOf(el) {
    if (el.labels && el.labels.length) return el.labels[0].textContent.replace(/\*/g, "").trim();
    var group = el.closest(".form-group");
    var label = group && group.querySelector("label");
    return (label ? label.textContent.replace(/\*/g, "").trim() : "") || el.name || el.id || "?";
  }
  function shown(el) {
    if (el.tagName === "SELECT") return el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text.trim() : el.value;
    return el.value;
  }
  window.nami_mock = {
    post: post,
    step: function (name) { step = name; post({ type: "step", step: name }); },
    field: function (el) { post({ type: "field", field: labelOf(el), value: shown(el) }); },
  };
  post({ type: "step", step: step });
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (!el || !el.matches) return;
    if (el.matches('input[type="file"]')) {
      var f = el.files && el.files[0];
      if (f) post({ type: "upload", field: el.id || el.name || labelOf(el), name: f.name, size: f.size, mime: f.type });
      return;
    }
    if (el.matches("input, select, textarea")) window.nami_mock.field(el);
  }, true);
  // fill_field (Nami, by DevTools) fires input and keyup without a change event on some fields: record on blur too.
  document.addEventListener("blur", function (e) {
    var el = e.target;
    if (el && el.matches && el.matches("input:not([type=file]), textarea") && el.value) window.nami_mock.field(el);
  }, true);
  document.addEventListener("click", function (e) {
    var button = e.target && e.target.closest ? e.target.closest("button, a.btn, input[type=submit]") : null;
    if (!button) return;
    var label = (button.textContent || button.value || "").replace(/\s+/g, " ").trim();
    var forbidden = button.getAttribute("data-forbidden") === "true";
    post({ type: "click", label: label, forbidden: forbidden });
    if (forbidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var box = document.getElementById("mock-forbidden");
      if (box) { box.textContent = "Mock: the button \"" + label + "\" was clicked. On the real site this would send the traveller's data. Recorded as a forbidden click."; box.classList.remove("hidden"); }
    }
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); post({ type: "click", label: "form submit", forbidden: true }); }, true);
})();
