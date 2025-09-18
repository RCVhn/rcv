/* eslint-env browser */
/* global localStorage, window */
"use strict";

(function () {
  // Endpoint de producción (Cloud Run, HTTPS)
  var PROD = "https://rcv-api-nulp72qabq-uc.a.run.app/api";

  // Override opcional por querystring: ?api=https://otra/api
  var qs = new URLSearchParams(location.search);
  var override = qs.get("api");
  var finalBase = (override && override.trim()) || PROD;

  // Exponer global y persistir solo si cambió
  window.API_BASE = finalBase;
  try {
    var cur = localStorage.getItem("API_BASE");
    if (cur !== finalBase) localStorage.setItem("API_BASE", finalBase);
  } catch (_) {}
})();
