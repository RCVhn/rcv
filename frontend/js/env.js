/* eslint-env browser */
/* global localStorage, window */
"use strict";

(function () {
  const PROD_API = "https://rcv-api-nulp72qabq-uc.a.run.app/api";

  try {
    localStorage.setItem("API_BASE", PROD_API);
  } catch (_) {
    // Ignora si el storage está bloqueado (modo incógnito estricto, etc.)
  }
  window.API_BASE = PROD_API;
  // console.log("[API_BASE]", PROD_API);
})();