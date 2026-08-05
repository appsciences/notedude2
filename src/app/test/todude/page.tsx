"use client";

import App from "@/components/App";
import { VARIANTS } from "@/lib/variant";

/**
 * The `todude` product, driven by `e2e/todude-variant.spec.ts` (#151).
 *
 * The variant is pinned rather than taken from the build, so one `next build` covers both
 * products in the suite. Like `/test`, this reaches neither Firestore nor auth — it renders
 * the variant's seed notes.
 */
export default function TodudeTestPage() {
  return <App variant={VARIANTS.todude} />;
}
