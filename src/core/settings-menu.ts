/**
 * @file
 * @brief Renders pi-usereq configuration menus with the shared pi.dev settings style.
 * @details Wraps `SettingsList` in one extension-command helper that exposes right-aligned current values, built-in circular scrolling, bottom-line descriptions, and a deterministic bridge for offline test harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.
 */

import { getSettingsListTheme, type ThemeColor, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type Component, type SettingItem, type SettingsListTheme } from "@mariozechner/pi-tui";

/**
 * @brief Describes one selectable pi-usereq settings-menu choice.
 * @details Stores the stable action identifier, left-column label, optional label and value tone overrides, optional disabled state, right-column current value, optional inline-cycle values, and bottom-line description consumed by the shared settings-menu renderer. The interface is compile-time only and introduces no runtime cost.
 */
export interface PiUsereqSettingsMenuChoice {
  id: string;
  label: string;
  labelTone?: "default" | "dim";
  value: string;
  valueTone?: "default" | "dim";
  disabled?: boolean;
  values?: readonly string[];
  description: string;
}

/**
 * @brief Describes the offline bridge exposed by shared settings-menu components.
 * @details Lets deterministic harnesses and unit tests drive the same settings-menu choices by label without simulating raw terminal key streams. The interface is runtime-facing but carries no side effects by itself.
 */
export interface PiUsereqSettingsMenuBridge {
  title: string;
  choices: PiUsereqSettingsMenuChoice[];
  selectedChoiceId?: string;
  selectByLabel: (label: string) => boolean;
  cancel: () => void;
}

/**
 * @brief Describes optional behavior overrides for one settings-menu render.
 * @details Carries the caller-selected initial focus row, the optional dynamic choice supplier used to rebuild dependent rows after inline toggles, and the optional inline-change callback used to persist `SettingsList` value cycles without closing the menu. The interface is compile-time only and introduces no runtime cost.
 */
export interface PiUsereqSettingsMenuOptions {
  initialSelectedId?: string;
  getChoices?: () => PiUsereqSettingsMenuChoice[];
  onChange?: (choiceId: string, newValue: string) => void;
}

/**
 * @brief Represents a custom menu component augmented with the offline bridge.
 * @details Extends the generic TUI `Component` contract with one optional bridge field consumed only by deterministic test and debug harness adapters. The interface is compile-time only and introduces no runtime cost.
 */
export interface PiUsereqSettingsMenuComponent extends Component {
  __piUsereqSettingsMenu?: PiUsereqSettingsMenuBridge;
}

/**
 * @brief Enumerates the CLI-supported theme tokens consumed by settings menus.
 * @details Narrows callback-local theme calls to the documented settings-list
 * semantics used by the pi CLI. Compile-time only and introduces no runtime
 * cost.
 */
type PiUsereqSettingsThemeColor = Extract<ThemeColor, "accent" | "muted" | "dim">;

/**
 * @brief Describes the callback-local theme surface required by settings menus.
 * @details Captures the subset of the custom-UI theme API needed to rebuild
 * title and fallback settings-list styling when the shared global theme is not
 * available in tests or offline replay. Compile-time only and introduces no
 * runtime cost.
 */
interface PiUsereqSettingsTheme {
  fg: (color: PiUsereqSettingsThemeColor, text: string) => string;
  bold: (text: string) => string;
}

/**
 * @brief Builds the fallback settings-list theme matching CLI settings semantics.
 * @details Mirrors the shared CLI settings theme token mapping for labels,
 * values, descriptions, cursor, and hints while avoiding the global theme
 * singleton used by the live pi runtime. Runtime is O(1). No external state is
 * mutated.
 * @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
 * @return {SettingsListTheme} Fallback settings-list theme.
 * @satisfies REQ-151, REQ-156
 */
function buildFallbackPiUsereqSettingsListTheme(
  theme: PiUsereqSettingsTheme,
): SettingsListTheme {
  return {
    label: (text: string, selected: boolean): string =>
      selected ? theme.fg("accent", text) : text,
    value: (text: string, selected: boolean): string =>
      selected ? theme.fg("accent", text) : theme.fg("muted", text),
    description: (text: string): string => theme.fg("dim", text),
    cursor: theme.fg("accent", "→ "),
    hint: (text: string): string => theme.fg("dim", text),
  };
}

/**
 * @brief Resolves the settings-list theme used by pi-usereq configuration menus.
 * @details Prefers the shared CLI `getSettingsListTheme()` API so extension
 * menus inherit active-theme behavior from pi itself, then falls back to an
 * equivalent callback-local mapping when the shared theme singleton is
 * unavailable in deterministic tests or offline replay. Runtime is O(1). No
 * external state is mutated.
 * @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
 * @return {SettingsListTheme} Settings-list theme used by pi-usereq menus.
 * @satisfies REQ-151, REQ-156
 */
function buildPiUsereqSettingsListTheme(
  theme: PiUsereqSettingsTheme,
): SettingsListTheme {
  try {
    const sharedTheme = getSettingsListTheme();
    void sharedTheme.label("", false);
    void sharedTheme.value("", false);
    void sharedTheme.description("");
    void sharedTheme.cursor;
    void sharedTheme.hint("");
    return sharedTheme;
  } catch {
    return buildFallbackPiUsereqSettingsListTheme(theme);
  }
}

/**
 * @brief Formats the settings-menu title with active-theme semantics.
 * @details Applies the callback-local `accent` token and bold styling on every
 * rebuild so custom-menu titles stay synchronized with live theme changes.
 * Runtime is O(n) in title length. No external state is mutated.
 * @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
 * @param[in] title {string} Menu title.
 * @return {string} Styled title text.
 * @satisfies REQ-151, REQ-156
 */
function formatPiUsereqSettingsMenuTitle(
  theme: PiUsereqSettingsTheme,
  title: string,
): string {
  return theme.fg("accent", theme.bold(title));
}

/**
 * @brief Closes a settings menu immediately with one selected action identifier.
 * @details Provides the submenu callback used by `SettingsList` so pressing Enter on any menu row resolves the outer custom UI promise with the row identifier. Runtime is O(1). Side effects are limited to one custom-UI completion callback.
 * @param[in] choiceId {string} Stable choice identifier to emit.
 * @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
 * @return {Component} Immediate-completion submenu component.
 */
function createImmediateSelectionComponent(choiceId: string, done: (value?: string) => void): Component {
  queueMicrotask(() => {
    done(choiceId);
  });
  return {
    render(): string[] {
      return [];
    },
    invalidate(): void {
      return;
    },
  };
}

/**
 * @brief Builds `SettingsList` items from one menu-choice vector.
 * @details Copies labels, current values, label-tone overrides, value-tone overrides, disabled-state semantics, inline-cycle values, and descriptions into `SettingItem` records. Non-disabled rows with `values` cycle inline on `Enter` or `Space`, while other non-disabled rows resolve the outer custom UI through the immediate submenu bridge. Runtime is O(n) in choice count. No external state is mutated.
 * @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
 * @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
 * @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
 * @return {SettingItem[]} `SettingsList` item vector.
 */
function buildSettingItems(
  theme: PiUsereqSettingsTheme,
  choices: PiUsereqSettingsMenuChoice[],
  done: (value?: string) => void,
): SettingItem[] {
  return choices.map((choice) => ({
    id: choice.id,
    label: choice.labelTone === "dim"
      ? theme.fg("dim", choice.label)
      : choice.label,
    description: choice.description,
    currentValue: choice.valueTone === "dim"
      ? theme.fg("dim", choice.value)
      : choice.value,
    values: choice.disabled || choice.values === undefined
      ? undefined
      : [...choice.values],
    submenu: choice.disabled || choice.values !== undefined
      ? undefined
      : () => createImmediateSelectionComponent(choice.id, done),
  }));
}

/**
 * @brief Writes one best-effort selected row index into a `SettingsList` instance.
 * @details Uses reflective access so pi-usereq can preserve focus across menu re-renders without depending on the private field at compile time. Runtime is O(1). Side effect: mutates the underlying `SettingsList` selection state when the field exists.
 * @param[in,out] settingsList {SettingsList} Mutable settings-list instance.
 * @param[in] selectedIndex {number} Zero-based row index to restore.
 * @return {void} No return value.
 */
function setSettingsListSelectedIndex(
  settingsList: SettingsList,
  selectedIndex: number,
): void {
  Reflect.set(settingsList as object, "selectedIndex", selectedIndex);
}

/**
 * @brief Reads the current selected row index from a `SettingsList` instance.
 * @details Uses reflective access so pi-usereq can report the current focused row through the offline bridge without referencing the private field in the static type system. Runtime is O(1). No external state is mutated.
 * @param[in] settingsList {SettingsList} Settings-list instance.
 * @return {number | undefined} Zero-based selected row index when available.
 */
function getSettingsListSelectedIndex(
  settingsList: SettingsList,
): number | undefined {
  const selectedIndex = Reflect.get(settingsList as object, "selectedIndex");
  return typeof selectedIndex === "number" ? selectedIndex : undefined;
}

/**
 * @brief Renders one shared pi-usereq settings menu and resolves the selected action.
 * @details Uses `ctx.ui.custom(...)` plus `SettingsList` so every configuration menu shares pi.dev styling, right-aligned current values, circular scrolling, bottom-line descriptions, optional disabled rows, and inline toggle cycles that do not close the menu. When callers provide `getChoices(...)`, dependent rows are rebuilt after inline changes while preserving focus on the changed row. The returned custom component also exposes an offline bridge for deterministic tests and debug harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering and caller-owned inline-change callbacks.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] title {string} Menu title displayed in the heading and offline bridge.
 * @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
 * @param[in] options {PiUsereqSettingsMenuOptions | undefined} Optional initial-focus override plus inline-change behavior.
 * @return {Promise<string | undefined>} Selected choice identifier or `undefined` when cancelled.
 * @satisfies REQ-151, REQ-152, REQ-153, REQ-154, REQ-156, REQ-192
 */
export async function showPiUsereqSettingsMenu(
  ctx: ExtensionCommandContext,
  title: string,
  choices: PiUsereqSettingsMenuChoice[],
  options: PiUsereqSettingsMenuOptions = {},
): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const titleText = new Text(
      formatPiUsereqSettingsMenuTitle(theme, title),
      0,
      0,
    );
    const spacer = new Text("", 0, 0);
    let currentChoices = options.getChoices?.() ?? choices;
    let settingsList: SettingsList;

    const buildSettingsList = (
      menuChoices: PiUsereqSettingsMenuChoice[],
      selectedChoiceId?: string,
    ): SettingsList => {
      const nextSettingsList = new SettingsList(
        buildSettingItems(theme, menuChoices, done),
        Math.min(Math.max(menuChoices.length, 1), 12),
        buildPiUsereqSettingsListTheme(theme),
        (choiceId, newValue) => {
          options.onChange?.(choiceId, newValue);
          rebuildMenu(choiceId);
        },
        () => done(undefined),
      );
      const initialSelectedIndex = selectedChoiceId === undefined
        ? 0
        : menuChoices.findIndex((choice) => choice.id === selectedChoiceId);
      if (initialSelectedIndex >= 0) {
        setSettingsListSelectedIndex(nextSettingsList, initialSelectedIndex);
      }
      return nextSettingsList;
    };

    const rebuildMenu = (selectedChoiceId?: string): void => {
      currentChoices = options.getChoices?.() ?? choices;
      settingsList = buildSettingsList(currentChoices, selectedChoiceId);
      container.clear();
      container.addChild(titleText);
      container.addChild(spacer);
      container.addChild(settingsList);
    };

    rebuildMenu(options.initialSelectedId);

    const component: PiUsereqSettingsMenuComponent = {
      render(width: number): string[] {
        return container.render(width);
      },
      invalidate(): void {
        container.invalidate();
        titleText.setText(formatPiUsereqSettingsMenuTitle(theme, title));
      },
      handleInput(data: string): void {
        settingsList.handleInput(data);
        tui.requestRender();
      },
      __piUsereqSettingsMenu: {
        title,
        get choices(): PiUsereqSettingsMenuChoice[] {
          return currentChoices;
        },
        get selectedChoiceId(): string | undefined {
          const selectedIndex = getSettingsListSelectedIndex(settingsList) ?? 0;
          return currentChoices[selectedIndex]?.id;
        },
        selectByLabel(label: string): boolean {
          const choice = currentChoices.find(
            (candidate) => candidate.label === label || candidate.id === label,
          );
          if (!choice) {
            return false;
          }
          done(choice.id);
          return true;
        },
        cancel(): void {
          done(undefined);
        },
      },
    };
    return component;
  });
}
