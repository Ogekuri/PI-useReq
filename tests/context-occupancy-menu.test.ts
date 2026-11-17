import test from "node:test";
import assert from "node:assert/strict";
import { ANSI_INTENSE_RED } from "../src/core/ansi-style.js";
import {
  CONTEXT_OCCUPANCY_MENU_ALERT_THRESHOLD_PERCENT,
  computeContextOccupancyFacts,
  formatConfigMenuContextOccupancySuffix,
} from "../src/core/context-file-size.js";

/**
 * @brief Verifies occupancy facts expose the numeric displayed percentage beside the unchanged known-basis suffix.
 * @details Asserts `percent` equals the numeric form of the rendered one-decimal label while `suffix` keeps the exact plain `[<percent>% context]` shape free of ANSI escape bytes, pinning the known-basis facts contract used by every menu and non-menu consumer. Runtime is O(1). No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the numeric percentage diverges from the displayed label or the suffix gains styling.
 * @satisfies TST-241, REQ-402, REQ-403
 */
test("occupancy facts expose the displayed numeric percentage with an unchanged known-basis suffix", () => {
  const facts = computeContextOccupancyFacts(360_000, 1_000_000);
  assert.equal(facts.percentLabel, "36");
  assert.equal(facts.percent, 36);
  assert.equal(facts.suffix, "[36% context]");
  assert.equal(facts.suffix.includes("\u001b"), false);
});

/**
 * @brief Verifies fallback-basis occupancy facts keep the starred suffix shape with the numeric displayed percentage.
 * @details Asserts the unknown max-input-context basis renders the `[<percent>%/1.0M* context]` suffix unchanged while `percent` still mirrors the displayed one-decimal label, so the documented fallback contract stays byte-stable. Runtime is O(1). No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the fallback suffix shape, label, or numeric percentage diverges.
 * @satisfies TST-241, REQ-403
 */
test("fallback-basis occupancy facts keep the starred suffix with the numeric displayed percentage", () => {
  const facts = computeContextOccupancyFacts(400_000, undefined);
  assert.equal(facts.percentLabel, "40");
  assert.equal(facts.percent, 40);
  assert.equal(facts.suffix, "[40%/1.0M* context]");
  assert.equal(facts.suffix.includes("\u001b"), false);
});

/**
 * @brief Verifies the shared menu suffix helper returns the plain suffix at or below the 80-percent threshold.
 * @details Asserts displayed percentages of 79, exactly 80, and raw 80.04 rendered as the displayed `80` label all return the unchanged suffix without ANSI escapes, pinning the strict displayed-value threshold semantics at and below the boundary. Runtime is O(1). No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when a threshold-at-or-below suffix gains styling or changes text.
 * @satisfies TST-242, REQ-768, REQ-769
 */
test("menu suffix helper returns the plain suffix at or below 80 displayed percent", () => {
  assert.equal(CONTEXT_OCCUPANCY_MENU_ALERT_THRESHOLD_PERCENT, 80);
  const below = formatConfigMenuContextOccupancySuffix(computeContextOccupancyFacts(790_000, 1_000_000));
  assert.equal(below, "[79% context]");
  assert.equal(below.includes("\u001b"), false);
  const exact = formatConfigMenuContextOccupancySuffix(computeContextOccupancyFacts(800_000, 1_000_000));
  assert.equal(exact, "[80% context]");
  assert.equal(exact.includes("\u001b"), false);
  const roundedDown = formatConfigMenuContextOccupancySuffix(computeContextOccupancyFacts(800_400, 1_000_000));
  assert.equal(roundedDown, "[80% context]");
  assert.equal(roundedDown.includes("\u001b"), false);
});

/**
 * @brief Verifies the shared menu suffix helper wraps the unchanged suffix in intense-red above the threshold.
 * @details Asserts displayed percentages above 80 return the exact intense-red-wrapped suffix for the known basis, the fallback starred basis, and a fractional label rounded above the threshold, pinning the byte-level alert styling contract. Runtime is O(1). No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when an above-threshold suffix stays unstyled, changes text, or uses different SGR parameters.
 * @satisfies TST-242, REQ-768, REQ-769
 */
test("menu suffix helper wraps the unchanged suffix in intense-red above 80 displayed percent", () => {
  const known = formatConfigMenuContextOccupancySuffix(computeContextOccupancyFacts(900_000, 1_000_000));
  assert.equal(known, `\u001b[${ANSI_INTENSE_RED}m[90% context]\u001b[0m`);
  const fallback = formatConfigMenuContextOccupancySuffix(computeContextOccupancyFacts(1_100_000, undefined));
  assert.equal(fallback, `\u001b[${ANSI_INTENSE_RED}m[110%/1.0M* context]\u001b[0m`);
  const fractional = formatConfigMenuContextOccupancySuffix(computeContextOccupancyFacts(800_600, 1_000_000));
  assert.equal(fractional, `\u001b[${ANSI_INTENSE_RED}m[80.1% context]\u001b[0m`);
});
