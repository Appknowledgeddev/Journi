"use client";

import { useEffect } from "react";

const APP_VERSION = "0.1.0";
const APP_BUILD_MARKER = "2026-04-16-stripe-debug-1";

export function BuildMarker() {
  useEffect(() => {
    const marker = {
      app: "Journi",
      version: APP_VERSION,
      build: APP_BUILD_MARKER,
    };

    console.log("[Journi Build]", marker);

    const buildWindow = window as typeof window & {
      __JOURNI_BUILD__?: typeof marker;
    };

    buildWindow.__JOURNI_BUILD__ = marker;
  }, []);

  return null;
}
