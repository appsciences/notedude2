"use client";

import App from "@/components/App";
import { VARIANTS } from "@/lib/variant";

/**
 * The `notedude` product. Pinned rather than defaulted to the build-time variant, so the
 * whole app suite keeps testing notedude even in a todude build (#151). See `/test/todude`.
 */
export default function TestPage() {
  return <App variant={VARIANTS.notedude} />;
}
